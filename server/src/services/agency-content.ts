import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { agencyBrands, agencyClients, agencyContentDecisions, agencyContentItems, agencyContentRevisions, agencyContentTasks, assets, issueAttachments, issues, projects, type Db } from "@paperclipai/db";
import type { AgencyContentAsset, AgencyContentDetail, AgencyContentRevision, AgencyContentSnapshot, AgencyContentStatus, AgencyContentSummary, CreateAgencyContent, DecideAgencyContent, LinkAgencyContentTask, ListAgencyContent, ReviseAgencyContent } from "@paperclipai/shared";
import { conflict, forbidden, HttpError, notFound, unprocessable } from "../errors.js";
import { logActivity, publishActivity, type ActivityPublication, type LogActivityInput } from "./activity-log.js";
import { authorizationService, type AuthorizationActor } from "./authorization.js";
import { canActorReadAssetContent } from "./asset-content-access.js";
import { currentAgencyOwner } from "./agency-access.js";
import { assertActiveAgencyBrand } from "./agency.js";
import { assertContentProducer, assertContentWritable, readContentContext, type AgencyContentContext } from "./agency-content-access.js";
import { openContentCursor, sealContentCursor } from "./agency-content-cursor.js";
import { lockAgencyContentCompany } from "./agency-content-lifecycle.js";

type Audit = Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId">;
export interface ContentPrincipal { actor: AuthorizationActor; audit: Audit }

export function agencyContentService(db: Db) {
  async function transaction<T>(companyId: string, fn: (tx: Db, publications: ActivityPublication[]) => Promise<T>) {
    const publications: ActivityPublication[] = [];
    const result = await db.transaction(async tx => {
      await lockAgencyContentCompany(tx as unknown as Db, companyId);
      return fn(tx as unknown as Db, publications);
    });
    publications.forEach(publishActivity);
    return result;
  }
  async function requireOwner(tx: Db, principal: ContentPrincipal, companyId: string) {
    if (!(await currentAgencyOwner(tx, principal.actor, companyId, true))) throw forbidden("Agency owner access required");
  }
  async function revision(tx: Db, companyId: string, contentId: string, number: number): Promise<AgencyContentRevision> {
    const [row] = await tx.select().from(agencyContentRevisions).where(and(eq(agencyContentRevisions.companyId, companyId), eq(agencyContentRevisions.contentId, contentId), eq(agencyContentRevisions.revisionNumber, number)));
    if (!row) throw notFound("Revision not found");
    const decisions = await tx.select().from(agencyContentDecisions).where(and(eq(agencyContentDecisions.companyId, companyId), eq(agencyContentDecisions.contentId, contentId), eq(agencyContentDecisions.revisionNumber, number))).orderBy(asc(agencyContentDecisions.createdAt));
    return { ...row.snapshot, revisionNumber: number, createdAt: row.createdAt, createdByActorId: row.createdByActorId, createdByActorType: row.createdByActorType, decisions: decisions as AgencyContentRevision["decisions"] };
  }
  function currentContext(context: AgencyContentContext, snapshot: AgencyContentSnapshot) {
    return snapshot.brandUpdatedAt === context.brand.updatedAt.toISOString() && snapshot.clientUpdatedAt === context.client.updatedAt.toISOString()
      && snapshot.projectDescription === context.project.description && !context.brand.archivedAt && !context.client.archivedAt && !context.project.archivedAt && context.project.brandId === context.item.brandId;
  }
  function currentAssets(context: AgencyContentContext, snapshot: AgencyContentSnapshot) {
    return snapshot.assets.every(asset => {
      const current = context.assetMap.get(asset.assetId);
      return current && current.sha256 === asset.sha256 && current.byteSize === asset.byteSize && current.contentType === asset.contentType;
    });
  }
  async function detail(tx: Db, principal: ContentPrincipal, context: AgencyContentContext): Promise<AgencyContentDetail> {
    const currentRevision = await revision(tx, context.item.companyId, context.item.id, context.item.revisionNumber);
    const contextCurrent = currentContext(context, currentRevision);
    const assetsCurrent = currentAssets(context, currentRevision);
    const approvalValid = context.item.status === "approved" && context.item.approvedRevisionNumber === context.item.revisionNumber && contextCurrent && assetsCurrent;
    let canEdit = context.owner;
    if (!canEdit && principal.actor.type === "agent") {
      try { await assertContentProducer(tx, principal.actor, context); canEdit = true; } catch (error) { if (!(error instanceof HttpError) || error.status !== 403) throw error; }
    }
    return {
      id: context.item.id, companyId: context.item.companyId, brandId: context.item.brandId, projectId: context.item.projectId,
      title: context.item.title, revisionNumber: context.item.revisionNumber, approvedRevisionNumber: context.item.approvedRevisionNumber,
      status: ["approved", "awaiting_owner"].includes(context.item.status) && (!contextCurrent || !assetsCurrent) ? "changes_requested" : context.item.status,
      approvalValid, contextCurrent, canManage: context.owner, canEdit, updatedAt: context.item.updatedAt, currentRevision,
      tasks: context.links.map(link => { const task = context.taskMap.get(link.issueId)!; return { issueId: task.id, title: task.title, status: task.status, assigneeAgentId: task.assigneeAgentId, role: link.role }; }),
    };
  }
  async function resolveAssets(tx: Db, principal: ContentPrincipal, context: AgencyContentContext, attachmentIds: string[]): Promise<AgencyContentAsset[]> {
    if (!attachmentIds.length) return [];
    const rows = await tx.select({ attachment: issueAttachments, asset: assets }).from(issueAttachments)
      .innerJoin(assets, and(eq(issueAttachments.assetId, assets.id), eq(issueAttachments.companyId, assets.companyId)))
      .where(and(eq(issueAttachments.companyId, context.item.companyId), inArray(issueAttachments.id, attachmentIds))).for("share");
    if (rows.length !== attachmentIds.length) throw unprocessable("Choose existing attachments from linked production tasks.");
    const mapped = new Map<string, AgencyContentAsset>();
    for (const { attachment, asset } of rows) {
      if (!context.taskMap.has(attachment.issueId) || !(await canActorReadAssetContent(tx, principal.actor, asset))) throw unprocessable("Choose authorized attachments from linked production tasks.");
      context.assetMap.set(asset.id, asset);
      mapped.set(attachment.id, { attachmentId: attachment.id, assetId: asset.id, issueId: attachment.issueId, sha256: asset.sha256, filename: asset.originalFilename ?? "Attachment", contentType: asset.contentType, byteSize: asset.byteSize });
    }
    return attachmentIds.map(id => mapped.get(id)!);
  }
  async function saveItem(tx: Db, context: AgencyContentContext, changes: Partial<typeof agencyContentItems.$inferInsert>) {
    const [updated] = await tx.update(agencyContentItems).set({ ...changes, updatedAt: new Date() }).where(and(eq(agencyContentItems.companyId, context.item.companyId), eq(agencyContentItems.id, context.item.id))).returning();
    context.item = updated;
  }
  async function mutate(companyId: string, id: string, principal: ContentPrincipal, expected: number, action: string, ownerOnly: boolean, fn: (tx: Db, context: AgencyContentContext) => Promise<void>) {
    return transaction(companyId, async (tx, publications) => {
      if (ownerOnly) await requireOwner(tx, principal, companyId);
      const context = await readContentContext(tx, principal.actor, companyId, id, true);
      assertContentWritable(context, expected);
      if (!ownerOnly) await assertContentProducer(tx, principal.actor, context);
      await fn(tx, context);
      await logActivity(tx, { ...principal.audit, companyId, action: `agency.content.${action}`, entityType: "agency_content", entityId: id, details: { revisionNumber: context.item.revisionNumber } }, publications);
      return detail(tx, principal, context);
    });
  }
  return {
    async list(companyId: string, principal: ContentPrincipal, filters: ListAgencyContent) {
      // Bounded pages and explicit cursor; no periodic polling or provider work.
      const scope = JSON.stringify([companyId, principal.actor.type, principal.actor.userId ?? principal.actor.agentId, principal.actor.onBehalfOfUserId, principal.actor.authorizingUserId, filters.brandId, filters.projectId, filters.status]);
      const cursorId = filters.cursor ? openContentCursor(scope, filters.cursor) : undefined;
      const candidates = await db.select({ id: agencyContentItems.id }).from(agencyContentItems).where(and(
        eq(agencyContentItems.companyId, companyId), cursorId ? gt(agencyContentItems.id, cursorId) : undefined,
        filters.brandId ? eq(agencyContentItems.brandId, filters.brandId) : undefined,
        filters.projectId ? eq(agencyContentItems.projectId, filters.projectId) : undefined,
      )).orderBy(asc(agencyContentItems.id)).limit(50);
      const items: AgencyContentSummary[] = [];
      for (const candidate of candidates) {
        try {
          const item = await transaction(companyId, async tx => detail(tx, principal, await readContentContext(tx, principal.actor, companyId, candidate.id)));
          const { currentRevision: _revision, tasks: _tasks, ...summary } = item;
          if (!filters.status || summary.status === filters.status) items.push(summary);
        } catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
      }
      return { items, nextCursor: candidates.length === 50 ? sealContentCursor(scope, candidates.at(-1)!.id) : null };
    },
    get: (companyId: string, id: string, principal: ContentPrincipal) => transaction(companyId, async tx => detail(tx, principal, await readContentContext(tx, principal.actor, companyId, id))),
    async create(companyId: string, principal: ContentPrincipal, input: CreateAgencyContent) {
      return transaction(companyId, async (tx, publications) => {
        await requireOwner(tx, principal, companyId);
        const [project] = await tx.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.id, input.projectId))).for("share");
        if (!project || project.brandId !== input.brandId || project.archivedAt) throw unprocessable("Choose an active campaign belonging to this brand.");
        if (!(await authorizationService(tx).decide({ actor: principal.actor, action: "project:read", resource: { type: "project", companyId, projectId: project.id } })).allowed) throw notFound("Campaign not found");
        await assertActiveAgencyBrand(tx, companyId, input.brandId);
        if (input.attachmentIds.length) throw unprocessable("Link a production task before adding its attachments.");
        const [brand] = await tx.select().from(agencyBrands).where(eq(agencyBrands.id, input.brandId));
        const [client] = await tx.select().from(agencyClients).where(and(eq(agencyClients.companyId, companyId), eq(agencyClients.id, brand.clientId)));
        const { brandId, projectId, attachmentIds: _ids, ...body } = input;
        const [item] = await tx.insert(agencyContentItems).values({ companyId, brandId, projectId, title: body.title }).returning();
        await tx.insert(agencyContentRevisions).values({ companyId, contentId: item.id, revisionNumber: 1, snapshot: { ...body, assets: [], brandUpdatedAt: brand.updatedAt.toISOString(), clientUpdatedAt: client.updatedAt.toISOString(), projectDescription: project.description }, createdByActorType: principal.audit.actorType, createdByActorId: principal.audit.actorId });
        await logActivity(tx, { ...principal.audit, companyId, action: "agency.content.created", entityType: "agency_content", entityId: item.id, details: { brandId, projectId, revisionNumber: 1 } }, publications);
        return detail(tx, principal, await readContentContext(tx, principal.actor, companyId, item.id));
      });
    },
    revise(companyId: string, id: string, principal: ContentPrincipal, input: ReviseAgencyContent) {
      return mutate(companyId, id, principal, input.expectedRevisionNumber, "revised", false, async (tx, context) => {
        if (context.item.status === "rejected" && !context.owner) throw forbidden("Only the owner can reopen rejected content.");
        const { attachmentIds, expectedRevisionNumber: _expected, ...body } = input;
        const snapshotAssets = await resolveAssets(tx, principal, context, attachmentIds);
        const assetSourceIds = [...new Set([...context.item.assetSourceIds, ...snapshotAssets.map(a => a.assetId)])];
        if (assetSourceIds.length > 100) throw unprocessable("This content has reached 100 distinct asset sources. Start a separate content item.");
        const number = context.item.revisionNumber + 1;
        await tx.insert(agencyContentRevisions).values({ companyId, contentId: id, revisionNumber: number, snapshot: { ...body, assets: snapshotAssets, brandUpdatedAt: context.brand.updatedAt.toISOString(), clientUpdatedAt: context.client.updatedAt.toISOString(), projectDescription: context.project.description }, createdByActorType: principal.audit.actorType, createdByActorId: principal.audit.actorId });
        await saveItem(tx, context, { title: body.title, revisionNumber: number, approvedRevisionNumber: null, assetSourceIds, status: context.item.status === "idea" ? "idea" : "in_production" });
      });
    },
    submit(companyId: string, id: string, principal: ContentPrincipal, expected: number) {
      return mutate(companyId, id, principal, expected, "submitted", false, async (tx, context) => {
        if (context.item.status !== "in_production") throw conflict("Select the idea and save a production revision before requesting review.");
        const snapshot = await revision(tx, companyId, id, context.item.revisionNumber);
        if (!snapshot.caption && !snapshot.script && !snapshot.assets.length) throw unprocessable("Add caption, script or an asset before requesting review.");
        if (!currentContext(context, snapshot) || !currentAssets(context, snapshot)) throw conflict("Brand context or assets changed. Save a fresh revision before requesting review.");
        await saveItem(tx, context, { status: "awaiting_owner", approvedRevisionNumber: null });
      });
    },
    decide(companyId: string, id: string, principal: ContentPrincipal, input: DecideAgencyContent) {
      return mutate(companyId, id, principal, input.expectedRevisionNumber, input.decision, true, async (tx, context) => {
        const status = context.item.status;
        let next: AgencyContentStatus;
        if (input.decision === "select_idea" && status === "idea") next = "in_production";
        else if (input.decision === "approve" && status === "awaiting_owner") {
          const snapshot = await revision(tx, companyId, id, context.item.revisionNumber);
          if (!currentContext(context, snapshot) || !currentAssets(context, snapshot)) throw conflict("Brand context or assets changed. Review a fresh revision.");
          next = "approved";
        } else if (input.decision === "request_changes" && ["approved", "awaiting_owner"].includes(status)) next = "changes_requested";
        else if (input.decision === "reject" && ["idea", "awaiting_owner", "in_production", "changes_requested"].includes(status)) next = "rejected";
        else throw conflict("The content state changed. Reload before deciding.");
        await tx.insert(agencyContentDecisions).values({ companyId, contentId: id, revisionNumber: context.item.revisionNumber, decision: input.decision, note: input.note ?? null, decidedByUserId: principal.actor.userId ?? "board" });
        await saveItem(tx, context, { status: next, approvedRevisionNumber: next === "approved" ? context.item.revisionNumber : null });
      });
    },
    linkTask(companyId: string, id: string, principal: ContentPrincipal, input: LinkAgencyContentTask) {
      return mutate(companyId, id, principal, input.expectedRevisionNumber, "task_linked", true, async (tx, context) => {
        const [task] = await tx.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.id, input.issueId))).for("share");
        if (!task || task.projectId !== context.item.projectId) throw unprocessable("Choose a production task from this campaign.");
        if (!(await authorizationService(tx).decide({ actor: principal.actor, action: "issue:read", resource: { type: "issue", companyId, issueId: task.id } })).allowed) throw notFound("Task not found");
        if (context.links.length >= 32 && !context.taskMap.has(task.id)) throw unprocessable("A content item supports up to 32 production tasks.");
        await tx.insert(agencyContentTasks).values({ companyId, contentId: id, issueId: task.id, role: input.role }).onConflictDoNothing();
        if (!context.taskMap.has(task.id)) { context.links.push({ companyId, contentId: id, issueId: task.id, role: input.role, createdAt: new Date() }); context.taskMap.set(task.id, task); }
      });
    },
    async history(companyId: string, id: string, principal: ContentPrincipal, before?: number) {
      return transaction(companyId, async tx => {
        await readContentContext(tx, principal.actor, companyId, id);
        const rows = await tx.select({ revisionNumber: agencyContentRevisions.revisionNumber, title: sql<string>`${agencyContentRevisions.snapshot}->>'title'`, createdAt: agencyContentRevisions.createdAt, createdByActorId: agencyContentRevisions.createdByActorId }).from(agencyContentRevisions)
          .where(and(eq(agencyContentRevisions.companyId, companyId), eq(agencyContentRevisions.contentId, id), before ? lt(agencyContentRevisions.revisionNumber, before) : undefined)).orderBy(desc(agencyContentRevisions.revisionNumber)).limit(20);
        return { revisions: rows, nextBefore: rows.length === 20 ? rows.at(-1)!.revisionNumber : null };
      });
    },
    getRevision: (companyId: string, id: string, number: number, principal: ContentPrincipal) => transaction(companyId, async tx => { await readContentContext(tx, principal.actor, companyId, id); return revision(tx, companyId, id, number); }),
  };
}

import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import {
  agencyBrands,
  agencyClients,
  agencyContentItems,
  agencyContentRevisions,
  agencyPublications,
  agents,
  type Db,
} from "@paperclipai/db";
import {
  createRoutineSchema,
  createRoutineTriggerSchema,
  type AgencyBrandReport,
  type AgencyContentSnapshot,
  type AgencyPublication,
  type CompleteAgencyPublication,
  type CreateAgencyPublication,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { routineService } from "./routines.js";

type PublicationRow = typeof agencyPublications.$inferSelect;

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", youtube: "YouTube", other: "the chosen platform",
};

/** A one-off cron for the scheduled minute in the brand's timezone. */
export function oneOffCron(scheduledAt: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(scheduledAt).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  return `${Number(parts.minute)} ${hour} ${Number(parts.day)} ${Number(parts.month)} *`;
}

function publishInstructions(row: PublicationRow, contentTitle: string, brandName: string) {
  const platform = PLATFORM_NAMES[row.platform] ?? row.platform;
  const base = `/api/companies/${row.companyId}/agency/publications/${row.id}`;
  return [
    `Publish the approved "${contentTitle}" for ${brandName} on ${platform}${row.accountLabel ? ` (${row.accountLabel})` : ""}.`,
    "",
    `1. Read the publication: GET ${base}`,
    "   If `approvalCurrent` is false or `status` is not `scheduled`, do not post. Report it as failed with the reason.",
    `2. Post exactly the approved caption and assets through the company's ${platform} connector. Do not rewrite the caption.`,
    `3. Report the result: POST ${base}/complete`,
    '   with `{ "status": "published", "externalUrl": "<post URL>" }`, or',
    '   `{ "status": "failed", "failureReason": "<why>" }` when no connector is available or the post fails.',
  ].join("\n");
}

function assetsOf(snapshot: AgencyContentSnapshot) {
  return (snapshot.assets ?? []).map((asset) => ({
    assetId: asset.assetId,
    filename: asset.filename ?? null,
    contentType: asset.contentType ?? null,
    contentPath: `/api/assets/${asset.assetId}/content`,
  }));
}

export function agencyPublicationsService(db: Db, deps: Parameters<typeof routineService>[1] = {}) {
  const routines = () => routineService(db, deps);

  async function toView(row: PublicationRow): Promise<AgencyPublication> {
    const [joined] = await db
      .select({ item: agencyContentItems, brand: agencyBrands })
      .from(agencyContentItems)
      .innerJoin(agencyBrands, eq(agencyBrands.id, agencyContentItems.brandId))
      .where(eq(agencyContentItems.id, row.contentId));
    const snapshot = row.snapshot as unknown as AgencyContentSnapshot;
    const item = joined?.item;
    return {
      id: row.id,
      companyId: row.companyId,
      contentId: row.contentId,
      contentTitle: item?.title ?? snapshot.title ?? "Content",
      brandId: joined?.brand.id ?? "",
      brandName: joined?.brand.name ?? "",
      revisionNumber: row.revisionNumber,
      platform: row.platform as AgencyPublication["platform"],
      accountLabel: row.accountLabel,
      scheduledAt: row.scheduledAt.toISOString(),
      timezone: row.timezone,
      dispatch: row.dispatch as AgencyPublication["dispatch"],
      status: row.status as AgencyPublication["status"],
      approvalCurrent: Boolean(item && item.status === "approved" && item.approvedRevisionNumber === row.revisionNumber),
      caption: snapshot.caption ?? null,
      script: snapshot.script ?? null,
      format: snapshot.format ?? null,
      assets: assetsOf(snapshot),
      agentId: row.agentId,
      externalUrl: row.externalUrl,
      failureReason: row.failureReason,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async function getRow(companyId: string, id: string) {
    const [row] = await db.select().from(agencyPublications)
      .where(and(eq(agencyPublications.companyId, companyId), eq(agencyPublications.id, id)));
    if (!row) throw notFound("Publication not found");
    return row;
  }

  /** The agency's Publishing Coordinator, or the Agency Director when there is none. */
  async function publisherAgent(companyId: string) {
    const rows = await db.select({ id: agents.id, name: agents.name, role: agents.role }).from(agents)
      .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));
    return rows.find((agent) => /publishing coordinator/i.test(agent.name)) ?? rows.find((agent) => agent.role === "ceo") ?? null;
  }

  async function archiveRoutine(row: PublicationRow, actorUserId: string | null) {
    if (!row.routineId) return;
    await routines().update(row.routineId, { status: "archived" }, { userId: actorUserId }).catch(() => undefined);
  }

  async function list(companyId: string, range: { from: string; to: string; brandId?: string }) {
    const rows = await db.select({ publication: agencyPublications })
      .from(agencyPublications)
      .innerJoin(agencyContentItems, eq(agencyContentItems.id, agencyPublications.contentId))
      .where(and(
        eq(agencyPublications.companyId, companyId),
        gte(agencyPublications.scheduledAt, new Date(range.from)),
        lt(agencyPublications.scheduledAt, new Date(range.to)),
        ...(range.brandId ? [eq(agencyContentItems.brandId, range.brandId)] : []),
      ))
      .orderBy(asc(agencyPublications.scheduledAt));
    return Promise.all(rows.map(({ publication }) => toView(publication)));
  }

  async function get(companyId: string, id: string) {
    return toView(await getRow(companyId, id));
  }

  /** Owner: put the approved revision of a content item on the calendar. */
  async function create(companyId: string, input: CreateAgencyPublication, actorUserId: string | null) {
    const [joined] = await db.select({ item: agencyContentItems, brand: agencyBrands })
      .from(agencyContentItems)
      .innerJoin(agencyBrands, eq(agencyBrands.id, agencyContentItems.brandId))
      .where(and(eq(agencyContentItems.companyId, companyId), eq(agencyContentItems.id, input.contentId)));
    if (!joined) throw notFound("Content not found");
    const { item, brand } = joined;
    if (item.status !== "approved" || item.approvedRevisionNumber !== item.revisionNumber) {
      throw conflict("Only approved content can be scheduled. Approve the current revision first.");
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 60_000) throw unprocessable("Schedule the post at least a minute from now.");
    const [revision] = await db.select({ snapshot: agencyContentRevisions.snapshot }).from(agencyContentRevisions).where(and(
      eq(agencyContentRevisions.companyId, companyId),
      eq(agencyContentRevisions.contentId, item.id),
      eq(agencyContentRevisions.revisionNumber, item.revisionNumber),
    ));
    if (!revision) throw notFound("Approved revision not found");
    const timezone = brand.timezone || "UTC";
    const publisher = input.dispatch === "agent" ? await publisherAgent(companyId) : null;
    if (input.dispatch === "agent" && !publisher) throw unprocessable("No Publishing Coordinator is available to post this. Schedule it as manual instead.");

    const [row] = await db.insert(agencyPublications).values({
      companyId,
      contentId: item.id,
      revisionNumber: item.revisionNumber,
      snapshot: revision.snapshot as unknown as Record<string, unknown>,
      platform: input.platform,
      accountLabel: input.accountLabel ?? null,
      scheduledAt,
      timezone,
      dispatch: input.dispatch,
      agentId: publisher?.id ?? null,
      createdByUserId: actorUserId,
    }).returning();

    if (publisher) {
      try {
        const routine = await routines().create(companyId, createRoutineSchema.parse({
          projectId: item.projectId,
          title: `Publish "${item.title}" on ${PLATFORM_NAMES[input.platform] ?? input.platform}`.slice(0, 200),
          description: publishInstructions(row!, item.title, brand.name),
          assigneeAgentId: publisher.id,
          priority: "high",
          concurrencyPolicy: "always_enqueue",
          catchUpPolicy: "enqueue_missed_with_cap",
        }), { userId: actorUserId });
        await routines().createTrigger(routine.id, createRoutineTriggerSchema.parse({
          kind: "schedule",
          label: `Publish ${row!.id}`,
          cronExpression: oneOffCron(scheduledAt, timezone),
          timezone,
        }), { userId: actorUserId });
        await db.update(agencyPublications).set({ routineId: routine.id, updatedAt: new Date() }).where(eq(agencyPublications.id, row!.id));
        row!.routineId = routine.id;
      } catch (error) {
        await db.delete(agencyPublications).where(eq(agencyPublications.id, row!.id));
        throw error;
      }
    }
    await logActivity(db, {
      companyId, actorType: "user", actorId: actorUserId ?? "board",
      action: "agency.publication.scheduled", entityType: "agency_content", entityId: item.id,
      details: { publicationId: row!.id, platform: input.platform, scheduledAt: scheduledAt.toISOString(), dispatch: input.dispatch },
    });
    return toView(row!);
  }

  /** Owner: take a scheduled post off the calendar. */
  async function cancel(companyId: string, id: string, actorUserId: string | null) {
    const row = await getRow(companyId, id);
    if (row.status !== "scheduled") throw conflict("Only a scheduled post can be cancelled.");
    await archiveRoutine(row, actorUserId);
    const [updated] = await db.update(agencyPublications).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(agencyPublications.id, row.id)).returning();
    await logActivity(db, {
      companyId, actorType: "user", actorId: actorUserId ?? "board",
      action: "agency.publication.cancelled", entityType: "agency_content", entityId: row.contentId, details: { publicationId: row.id },
    });
    return toView(updated!);
  }

  /** The publishing agent or the owner records what happened. */
  async function complete(companyId: string, id: string, input: CompleteAgencyPublication, actor: { type: "user" | "agent"; id: string }) {
    const row = await getRow(companyId, id);
    if (row.status !== "scheduled") throw conflict(`This post is already ${row.status}.`);
    if (input.status === "published") {
      const [item] = await db.select({ status: agencyContentItems.status, approved: agencyContentItems.approvedRevisionNumber })
        .from(agencyContentItems).where(eq(agencyContentItems.id, row.contentId));
      if (!item || item.status !== "approved" || item.approved !== row.revisionNumber) {
        throw conflict("The content changed after it was scheduled; its approval no longer covers this post.");
      }
    }
    await archiveRoutine(row, actor.type === "user" ? actor.id : null);
    const [updated] = await db.update(agencyPublications).set(input.status === "published"
      ? { status: "published", externalUrl: input.externalUrl ?? null, publishedAt: new Date(), updatedAt: new Date() }
      : { status: "failed", failureReason: input.failureReason, updatedAt: new Date() })
      .where(eq(agencyPublications.id, row.id)).returning();
    await logActivity(db, {
      companyId, actorType: actor.type, actorId: actor.id, ...(actor.type === "agent" ? { agentId: actor.id } : {}),
      action: input.status === "published" ? "agency.publication.published" : "agency.publication.failed",
      entityType: "agency_content", entityId: row.contentId,
      details: { publicationId: row.id, platform: row.platform, ...(input.status === "published" ? { externalUrl: input.externalUrl ?? null } : { failureReason: input.failureReason }) },
    });
    return toView(updated!);
  }

  /** Per-brand results for a period: content, posts and SocialAgent AI cost. */
  async function brandReports(companyId: string, range: { from: string; to: string }): Promise<AgencyBrandReport[]> {
    const from = new Date(range.from);
    const to = new Date(range.to);
    const brands = await db.select({ id: agencyBrands.id, name: agencyBrands.name, clientName: agencyClients.name })
      .from(agencyBrands)
      .innerJoin(agencyClients, eq(agencyClients.id, agencyBrands.clientId))
      .where(and(eq(agencyBrands.companyId, companyId), sql`${agencyBrands.archivedAt} is null`))
      .orderBy(asc(agencyBrands.name));
    const rows = (result: unknown) => result as Array<Record<string, unknown>>;
    const content = rows(await db.execute(sql`
      select brand_id, status, count(*)::int as n from agency_content_items
      where company_id = ${companyId} group by brand_id, status`));
    const approvals = rows(await db.execute(sql`
      select i.brand_id, count(*)::int as n from agency_content_decisions d
      join agency_content_items i on i.id = d.content_id
      where d.company_id = ${companyId} and d.decision = 'approve'
        and d.created_at >= ${from.toISOString()}::timestamptz and d.created_at < ${to.toISOString()}::timestamptz
      group by i.brand_id`));
    const posts = rows(await db.execute(sql`
      select i.brand_id, p.status, p.platform, count(*)::int as n from agency_publications p
      join agency_content_items i on i.id = p.content_id
      where p.company_id = ${companyId}
        and p.scheduled_at >= ${from.toISOString()}::timestamptz and p.scheduled_at < ${to.toISOString()}::timestamptz
      group by i.brand_id, p.status, p.platform`));
    const recent = rows(await db.execute(sql`
      select p.id, i.brand_id, i.title, p.platform, p.external_url, p.published_at from agency_publications p
      join agency_content_items i on i.id = p.content_id
      where p.company_id = ${companyId} and p.status = 'published'
        and p.scheduled_at >= ${from.toISOString()}::timestamptz and p.scheduled_at < ${to.toISOString()}::timestamptz
      order by p.published_at desc nulls last limit 200`));
    const costs = rows(await db.execute(sql`
      select pr.brand_id, coalesce(sum(e.cost_cents), 0)::float as cents from cost_events e
      join projects pr on pr.id = e.project_id
      where e.company_id = ${companyId} and pr.brand_id is not null
        and e.occurred_at >= ${from.toISOString()}::timestamptz and e.occurred_at < ${to.toISOString()}::timestamptz
      group by pr.brand_id`));
    return brands.map((brand) => {
      const mine = (list: Array<Record<string, unknown>>) => list.filter((row) => row.brand_id === brand.id);
      const contentByStatus = Object.fromEntries(mine(content).map((row) => [String(row.status), Number(row.n)]));
      const postCounts = { scheduled: 0, published: 0, failed: 0, cancelled: 0 };
      const publishedByPlatform: Record<string, number> = {};
      for (const row of mine(posts)) {
        const status = String(row.status) as keyof typeof postCounts;
        postCounts[status] = (postCounts[status] ?? 0) + Number(row.n);
        if (status === "published") publishedByPlatform[String(row.platform)] = (publishedByPlatform[String(row.platform)] ?? 0) + Number(row.n);
      }
      return {
        brandId: brand.id,
        brandName: brand.name,
        clientName: brand.clientName,
        contentByStatus,
        approvedInPeriod: Number(mine(approvals)[0]?.n ?? 0),
        posts: postCounts,
        publishedByPlatform,
        recentPosts: mine(recent).slice(0, 20).map((row) => ({
          id: String(row.id),
          contentTitle: String(row.title),
          platform: String(row.platform),
          externalUrl: row.external_url == null ? null : String(row.external_url),
          publishedAt: row.published_at == null ? null : new Date(row.published_at as string).toISOString(),
        })),
        aiCostCents: Math.round(Number(mine(costs)[0]?.cents ?? 0)),
      };
    });
  }

  return { list, get, create, cancel, complete, getRow, brandReports };
}

import { and, eq, inArray } from "drizzle-orm";
import { agencyBrands, agencyClients, agencyContentItems, agencyContentTasks, assets, issues, projects, type Db } from "@paperclipai/db";
import { conflict, forbidden, notFound } from "../errors.js";
import { authorizationService, type AuthorizationActor } from "./authorization.js";
import { canActorReadAssetContent } from "./asset-content-access.js";
import { currentAgencyOwner } from "./agency-access.js";

export async function readContentContext(db: Db, actor: AuthorizationActor, companyId: string, id: string, mutation = false) {
  const [found] = await db.select().from(agencyContentItems).where(and(eq(agencyContentItems.companyId, companyId), eq(agencyContentItems.id, id)));
  if (!found) throw notFound("Content not found");
  const owner = await currentAgencyOwner(db, actor, companyId, mutation);
  const [project] = await db.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.id, found.projectId))).for("share");
  const access = authorizationService(db);
  if (!project || !(await access.decide({ actor, action: "project:read", resource: { type: "project", companyId, projectId: project.id } })).allowed) throw notFound("Content not found");
  const [brandContext] = await db.select({ brand: agencyBrands, client: agencyClients }).from(agencyBrands)
    .innerJoin(agencyClients, and(eq(agencyBrands.clientId, agencyClients.id), eq(agencyBrands.companyId, agencyClients.companyId)))
    .where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.id, found.brandId))).for("share");
  if (!brandContext) throw notFound("Content not found");
  const [item] = await db.select().from(agencyContentItems).where(and(eq(agencyContentItems.companyId, companyId), eq(agencyContentItems.id, id))).for(mutation ? "update" : "share");
  if (!item) throw notFound("Content not found");
  const links = await db.select().from(agencyContentTasks).where(and(eq(agencyContentTasks.companyId, companyId), eq(agencyContentTasks.contentId, id)));
  const taskRows = links.length ? await db.select().from(issues).where(and(eq(issues.companyId, companyId), inArray(issues.id, links.map(l => l.issueId)))).for("share") : [];
  const taskMap = new Map(taskRows.map(task => [task.id, task]));
  for (const link of links) {
    const task = taskMap.get(link.issueId);
    if (!task || !(await access.decide({ actor, action: "issue:read", resource: { type: "issue", companyId, issueId: task.id } })).allowed) throw notFound("Content not found");
  }
  const assetRows = item.assetSourceIds.length ? await db.select().from(assets)
    .where(and(eq(assets.companyId, companyId), inArray(assets.id, item.assetSourceIds))).for("share") : [];
  // Missing asset rows must not erase their historical source/privacy guards.
  if (assetRows.length !== item.assetSourceIds.length) throw notFound("Content source unavailable");
  for (const asset of assetRows) {
    if (!(await canActorReadAssetContent(db, actor, asset))) throw notFound("Content not found");
  }
  return { item, project, ...brandContext, owner, links, taskMap, assetMap: new Map(assetRows.map(asset => [asset.id, asset])) };
}
export type AgencyContentContext = Awaited<ReturnType<typeof readContentContext>>;

export function assertContentWritable(context: AgencyContentContext, expectedRevisionNumber: number) {
  if (context.item.revisionNumber !== expectedRevisionNumber) throw conflict("Content changed. Reload the latest revision before continuing.");
  if (context.brand.archivedAt || context.client.archivedAt || context.project.archivedAt || context.project.brandId !== context.item.brandId) throw conflict("This campaign or brand is no longer active. Restore its context before continuing.");
}

export async function assertContentProducer(db: Db, actor: AuthorizationActor, context: AgencyContentContext) {
  if (context.owner) return;
  if (actor.type === "agent") {
    for (const task of context.taskMap.values()) {
      if (task.assigneeAgentId === actor.agentId && !["done", "cancelled"].includes(task.status)
        && (await authorizationService(db).decide({ actor, action: "issue:mutate", resource: { type: "issue", companyId: context.item.companyId, issueId: task.id } })).allowed) return;
    }
  }
  throw forbidden("An agency owner or an authorized assigned production agent is required.");
}

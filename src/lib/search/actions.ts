"use server";

import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

export type SearchResults = {
  brands: { id: string; name: string; client: string }[];
  campaigns: { id: string; name: string; brand: string }[];
  contents: { id: string; title: string; brand: string }[];
  agents: { id: string; name: string; title: string; paletteId: string }[];
};

/** Tenant-scoped quick search for the ⌘K palette. */
export async function searchAgency(slug: string, query: string): Promise<SearchResults> {
  const { agency } = await requireAgency(slug);
  const q = query.trim().slice(0, 100);
  const where = { organizationId: agency.id };
  const match = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [brands, campaigns, contents, agents] = await Promise.all([
    prisma.brand.findMany({ where: { ...where, archivedAt: null, ...(match ? { name: match } : {}) }, include: { client: { select: { name: true } } }, take: 5, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where: { ...where, ...(match ? { name: match } : {}) }, include: { brand: { select: { name: true } } }, take: 5, orderBy: { updatedAt: "desc" } }),
    prisma.content.findMany({ where: { ...where, ...(match ? { title: match } : {}) }, include: { brand: { select: { name: true } } }, take: 8, orderBy: { updatedAt: "desc" } }),
    prisma.agent.findMany({ where: { ...where, ...(match ? { OR: [{ name: match }, { title: match }] } : {}) }, take: 6, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name, client: b.client.name })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, brand: c.brand.name })),
    contents: contents.map((c) => ({ id: c.id, title: c.title, brand: c.brand.name })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, title: a.title, paletteId: a.paletteId })),
  };
}

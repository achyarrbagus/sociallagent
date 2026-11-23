"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { AGENCY_CORE_TEAM } from "./team";

export type InstallResult = { ok: true; status: "installed" | "already_installed" } | { ok: false; error: string };

/**
 * Installs the Agency Core team with the owner-chosen Director name.
 * All-or-nothing, and a second call is a no-op, like socialagent's ensureAgencyTeam.
 */
export async function installAgencyTeam(slug: string, directorName: string): Promise<InstallResult> {
  const { agency, user, canManage } = await requireAgency(slug);
  if (!canManage) return { ok: false, error: "Hanya owner atau admin yang bisa menyiapkan tim." };
  const name = directorName.trim().slice(0, 80) || "Agency Director";
  try {
    const status = await prisma.$transaction(async (tx) => {
      if (await tx.agent.count({ where: { organizationId: agency.id } })) return "already_installed" as const;
      const ids = new Map<string, string>();
      // Catalog is ordered managers-first, so every reportsTo is already created.
      for (const member of AGENCY_CORE_TEAM) {
        const agent = await tx.agent.create({
          data: {
            organizationId: agency.id,
            slug: member.slug,
            name: member.slug === "agency-director" ? name : member.name,
            title: member.title,
            role: member.role,
            reportsToId: member.reportsTo ? ids.get(member.reportsTo) : null,
            instructions: member.instructions,
            paletteId: member.paletteId,
          },
        });
        ids.set(member.slug, agent.id);
      }
      await tx.activityLog.create({
        data: {
          organizationId: agency.id, actorUserId: user.id, action: "team.installed", entityType: "agent",
          entityId: ids.get("agency-director")!, summary: `Menyiapkan tim AI (${AGENCY_CORE_TEAM.length} agent) dipimpin ${name}`,
        },
      });
      return "installed" as const;
    });
    revalidatePath(`/${slug}`, "layout");
    return { ok: true, status };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Tim belum bisa disiapkan. Coba lagi." };
  }
}

export async function setAgentPaused(slug: string, agentId: string, paused: boolean) {
  const { agency, canManage } = await requireAgency(slug);
  if (!canManage) return;
  await prisma.agent.updateMany({
    where: { id: agentId, organizationId: agency.id, status: paused ? { not: "running" } : "paused" },
    data: { status: paused ? "paused" : "idle" },
  });
  revalidatePath(`/${slug}`, "layout");
}

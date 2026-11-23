import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

const MANAGER_ROLES = new Set(["owner", "admin"]);

/** Resolve an agency by slug for the signed-in user. 404s for non-members so slugs don't leak. */
export const requireAgency = cache(async (slug: string) => {
  const user = await requireUser();
  const member = await prisma.member.findFirst({
    where: { userId: user.id, organization: { slug } },
    include: { organization: true },
  });
  if (!member) notFound();
  return {
    user,
    agency: member.organization,
    role: member.role,
    canManage: member.role.split(",").some((role) => MANAGER_ROLES.has(role.trim())),
  };
});

export async function listAgencies(userId: string) {
  const members = await prisma.member.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => m.organization);
}

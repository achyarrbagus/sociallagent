import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { OnboardingWizard } from "./OnboardingWizard";

/** New agencies start at step 1; an agency without a team resumes at the agent step. */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const { agency: slug } = await searchParams;
  const member = typeof slug === "string"
    ? await prisma.member.findFirst({ where: { userId: user.id, organization: { slug } }, include: { organization: { include: { _count: { select: { agents: true } } } } } })
    : null;
  const resume = member && member.organization._count.agents === 0
    ? { slug: member.organization.slug, name: member.organization.name }
    : null;
  return <OnboardingWizard resume={resume} />;
}

import { redirect } from "next/navigation";

type AgentsRootPageProps = {
  params: Promise<{ companyPrefix: string }>;
};

export default async function AgentsRootPage({ params }: AgentsRootPageProps) {
  const { companyPrefix } = await params;
  redirect(`/${encodeURIComponent(companyPrefix)}/agents/all`);
}

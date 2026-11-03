import { redirect } from "next/navigation";

type ApprovalsRootPageProps = {
  params: Promise<{ companyPrefix: string }>;
};

export default async function ApprovalsRootPage({ params }: ApprovalsRootPageProps) {
  const { companyPrefix } = await params;
  redirect(`/${encodeURIComponent(companyPrefix)}/approvals/pending`);
}

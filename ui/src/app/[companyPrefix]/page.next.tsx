import { redirect } from "next/navigation";

type CompanyRootPageProps = {
  params: Promise<{ companyPrefix: string }>;
};

export default async function CompanyRootPage({ params }: CompanyRootPageProps) {
  const { companyPrefix } = await params;
  redirect(`/${encodeURIComponent(companyPrefix)}/dashboard`);
}

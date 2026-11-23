import { redirect } from "next/navigation";

export default async function AgencyIndex({ params }: PageProps<"/[agency]">) {
  const { agency } = await params;
  redirect(`/${agency}/dashboard`);
}

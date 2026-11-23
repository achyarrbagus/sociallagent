import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

/** Chat opens on the board chat with the Agency Director. */
export default async function ChatIndex({ params }: PageProps<"/[agency]/chat">) {
  const { agency: slug } = await params;
  const { agency } = await requireAgency(slug);
  const director = await prisma.agent.findFirst({ where: { organizationId: agency.id, reportsToId: null }, orderBy: { createdAt: "asc" } });
  if (director) redirect(`/${slug}/chat/${director.id}`);
  return <div className="space-y-3"><h1 className="text-xl font-semibold">Chat</h1>
    <p className="text-sm text-muted-foreground">Belum ada tim AI untuk diajak ngobrol. <Link href={`/onboarding?agency=${slug}`} className="underline">Siapkan tim</Link>.</p></div>;
}

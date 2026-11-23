import { redirect } from "next/navigation";
import { listAgencies, requireUser } from "@/lib/session";

/** Post-login landing: jump into the first agency, or create one. */
export default async function AppEntry() {
  const user = await requireUser();
  const [first] = await listAgencies(user.id);
  redirect(first ? `/${first.slug}/dashboard` : "/onboarding");
}

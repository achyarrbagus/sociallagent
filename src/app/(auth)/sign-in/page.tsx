import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { getSession } from "@/lib/session";

export default async function SignInPage() {
  if (await getSession()) redirect("/app");
  return <AuthScreen mode="sign_in" />;
}

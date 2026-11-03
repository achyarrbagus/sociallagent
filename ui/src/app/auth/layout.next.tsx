import { Suspense, type ReactNode } from "react";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { AuthProviders } from "./AuthProviders";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProviders>
      <Suspense fallback={<PaperclipLoading />}>{children}</Suspense>
    </AuthProviders>
  );
}

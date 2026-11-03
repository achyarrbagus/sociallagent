import { Suspense } from "react";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { CliAuthPage } from "@/pages/CliAuth";
import { AuthProviders } from "../../auth/AuthProviders";

export default function CliAuthRoute() {
  return (
    <AuthProviders>
      <Suspense fallback={<PaperclipLoading />}>
        <CliAuthPage />
      </Suspense>
    </AuthProviders>
  );
}

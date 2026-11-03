import { Suspense } from "react";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { BoardClaimPage } from "@/pages/BoardClaim";
import { AuthProviders } from "../../auth/AuthProviders";

export default function BoardClaimRoute() {
  return (
    <AuthProviders>
      <Suspense fallback={<PaperclipLoading />}>
        <BoardClaimPage />
      </Suspense>
    </AuthProviders>
  );
}

"use client";

import { Suspense } from "react";
import { CompanyProvider } from "@/context/CompanyContext";
import { InviteLandingPage } from "@/pages/InviteLanding";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { AuthProviders } from "../../auth/AuthProviders";

export default function InviteRoute() {
  return (
    <AuthProviders>
      <CompanyProvider>
        <Suspense fallback={<PaperclipLoading />}>
          <InviteLandingPage />
        </Suspense>
      </CompanyProvider>
    </AuthProviders>
  );
}

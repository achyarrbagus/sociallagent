import type { ReactNode } from "react";
import { Loader2, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@paperclipai/shared";
import { Card } from "@/components/ui/card";

type BootstrapPendingPageProps = {
  claimAvailable: boolean;
  hasActiveInvite?: boolean;
  session: AuthSession | null | undefined;
  claimState: "idle" | "claiming" | "success";
  claimError?: { status?: number; message?: string } | null;
  onClaim: () => void;
};

function CliFallback({ hasActiveInvite = false }: { hasActiveInvite?: boolean }) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Terminal className="size-4 text-muted-foreground" aria-hidden />
        <span>Butuh bantuan untuk menyelesaikan pengaturan?</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasActiveInvite
          ? "Tautan undangan administrator sudah tersedia. Mintalah tautan tersebut kepada pengelola server."
          : "Hubungi pengelola server untuk mendapatkan tautan undangan administrator."}
      </p>
    </div>
  );
}

function StateChrome({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">{children}</Card>
    </div>
  );
}

function displayIdentity(session: AuthSession) {
  return session.user.email || session.user.name || session.user.id;
}

function claimErrorCopy(error: BootstrapPendingPageProps["claimError"]) {
  if (error?.status === 409) {
    return {
      title: "SocialAgent ini sudah memiliki administrator.",
      body: "Muat ulang untuk masuk, atau minta undangan kepada administrator melalui Pengaturan → Akses.",
    };
  }
  if (error?.status === 401) {
    return {
      title: "Sesi Anda telah berakhir. Masuk kembali untuk melanjutkan.",
      body: "",
    };
  }
  return {
    title: "Server tidak dapat dihubungi. Coba lagi sebentar lagi.",
    body: "",
  };
}

export function BootstrapPendingPage({
  claimAvailable,
  hasActiveInvite = false,
  session,
  claimState,
  claimError,
  onClaim,
}: BootstrapPendingPageProps) {
  if (!claimAvailable) {
    return (
      <StateChrome>
        <h1 className="text-xl font-semibold">SocialAgent menunggu administrator pertama</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Untuk menyelesaikan pengaturan, buka tautan undangan administrator yang diberikan oleh pengelola server.
          Tautan ini hanya dapat digunakan satu kali.
        </p>
        <CliFallback hasActiveInvite={hasActiveInvite} />
        <p className="mt-4 text-xs text-muted-foreground">
          Undangan diperlukan agar hanya orang yang berwenang dapat menjadi administrator.
        </p>
      </StateChrome>
    );
  }

  if (claimState === "success") {
    return (
      <StateChrome>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Anda adalah administrator SocialAgent</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pengaturan selesai. Anda akan diarahkan untuk membuat organisasi pertama...
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">Mengalihkan...</span>
        </div>
        <div className="mt-5">
          <Button asChild variant="outline">
            <a href="/">Lanjut ke dashboard</a>
          </Button>
        </div>
      </StateChrome>
    );
  }

  if (!session) {
    return (
      <StateChrome>
        <h1 className="text-xl font-semibold">Selesaikan pengaturan SocialAgent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Belum ada administrator. Masuk atau buat akun SocialAgent untuk menjadi administrator pertama.
        </p>
        <div className="mt-5">
          <Button asChild>
            <Link to="/auth?next=/">Masuk / Buat akun</Link>
          </Button>
        </div>
        <CliFallback hasActiveInvite={hasActiveInvite} />
      </StateChrome>
    );
  }

  const errorCopy = claimErrorCopy(claimError);
  const isClaiming = claimState === "claiming";
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">Selesaikan pengaturan SocialAgent</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Belum ada administrator. Jadilah administrator pertama untuk mulai mengatur SocialAgent.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={onClaim} disabled={isClaiming}>
          {isClaiming && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {isClaiming ? "Memproses..." : "Jadi administrator"}
        </Button>
        <span className="text-sm text-muted-foreground">
          Masuk sebagai <span className="font-medium text-foreground">{displayIdentity(session)}</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Akun salah?{" "}
        <Link to="/auth?next=/" className="underline underline-offset-2">
          Ganti akun
        </Link>
        .
      </p>
      {claimError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 flex-shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{errorCopy.title}</p>
            {errorCopy.body && <p className="mt-1 text-destructive/90">{errorCopy.body}</p>}
          </div>
        </div>
      )}
      <CliFallback hasActiveInvite={hasActiveInvite} />
    </StateChrome>
  );
}

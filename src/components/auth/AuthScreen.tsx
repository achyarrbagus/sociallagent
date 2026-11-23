"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SocialAgentLockup } from "@/components/brand/SocialAgentLockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Mode = "sign_in" | "sign_up";

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setPending(true);
    setError(null);
    const result = mode === "sign_up"
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Gagal masuk. Coba lagi.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="socialagent-auth fixed inset-0 flex bg-background">
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="mb-8">
            <Link href="/" aria-label="SocialAgent beranda"><SocialAgentLockup className="h-5 w-auto" /></Link>
          </div>
          <h1 className="text-xl font-semibold">
            {mode === "sign_in" ? "Masuk ke SocialAgent" : "Buat akun SocialAgent"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign_in" ? "Gunakan email dan password kamu." : "Satu akun untuk semua agensi dan brand kamu."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "sign_up" && (
              <div className="space-y-1">
                <Label htmlFor="name">Nama</Label>
                <Input id="name" name="name" autoComplete="name" required />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                required
              />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Memproses…" : mode === "sign_in" ? "Masuk" : "Buat akun"}
            </Button>
          </form>

          <div className="mt-5 text-sm text-muted-foreground">
            {mode === "sign_in" ? "Belum punya akun? " : "Sudah punya akun? "}
            <Link
              href={mode === "sign_in" ? "/sign-up" : "/sign-in"}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {mode === "sign_in" ? "Daftar" : "Masuk"}
            </Link>
          </div>
        </div>
      </div>

      <aside className="socialagent-auth-story hidden md:flex" aria-label="Tentang SocialAgent">
        <span className="socialagent-auth-tag">Ruang untuk ide besar.</span>
        <h2>Dari ide pertama,<br />sampai siap tayang<span>.</span></h2>
        <p>Satu ruang kerja untuk brand, konten, dan tim AI kamu.</p>
        <ol className="socialagent-auth-flow" aria-label="Alur kerja agensi">
          <li><span>01</span><strong>Brief yang jelas</strong><p>Satukan konteks dan arah setiap brand.</p></li>
          <li><span>02</span><strong>Produksi bersama tim AI</strong><p>Ubah ide menjadi konten yang siap ditinjau.</p></li>
          <li><span>03</span><strong>Review, lalu tayang</strong><p>Keputusan akhir tetap di tangan kamu.</p></li>
        </ol>
      </aside>
    </div>
  );
}

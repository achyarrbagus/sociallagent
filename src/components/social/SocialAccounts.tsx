"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectSocialAccount, disconnectSocialAccount, type ConnectState } from "@/lib/social/accounts";
import { CREDENTIAL_FIELDS, PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/social/constants";

export type AccountView = { id: string; platform: Platform; displayName: string; externalAccountId: string; tokenExpiresAt: string | null };

const HELP: Record<Platform, React.ReactNode> = {
  facebook: <>Butuh izin Meta <code>pages_manage_posts</code> dan <code>pages_read_engagement</code>.</>,
  instagram: <>Akun Business/Creator dengan token Instagram Login (<code>instagram_business_basic</code>, <code>instagram_business_content_publish</code>). ID akun terdeteksi dari token. Publikasi otomatis butuh <code>PUBLIC_APP_URL</code> HTTPS untuk media.</>,
  x: <>Token OAuth 2.0 <strong>user-context</strong> dengan <code>users.read</code>, <code>tweet.read</code>, <code>tweet.write</code>, dan <code>media.write</code>. Token app-only tidak bisa memposting.</>,
  linkedin: <>Token member dengan <code>openid</code>, <code>profile</code>, <code>w_member_social</code>. Hanya profil pribadi; posting ke LinkedIn Page belum didukung.</>,
  tiktok: <>App TikTok dengan Content Posting API dan scope <code>video.publish</code>. Satu video per posting, visibilitas <code>SELF_ONLY</code>. Token diperbarui otomatis.</>,
};

export function SocialAccounts({ slug, brandId, canManage, accounts }: { slug: string; brandId: string; canManage: boolean; accounts: AccountView[] }) {
  return <div className="space-y-3 rounded-md border border-border p-3">
    <h4 className="text-sm font-medium">Akun sosial</h4>
    <div className="space-y-3">{PLATFORMS.map((platform) => {
      const account = accounts.find((a) => a.platform === platform);
      return <section key={platform} className="space-y-2 rounded-md border border-border p-3">
        {account ? <Connected slug={slug} account={account} canManage={canManage} />
          : canManage ? <ConnectForm slug={slug} brandId={brandId} platform={platform} />
          : <p className="text-sm text-muted-foreground">{PLATFORM_LABELS[platform]} belum terhubung.</p>}
      </section>;
    })}</div>
  </div>;
}

function Connected({ slug, account, canManage }: { slug: string; account: AccountView; canManage: boolean }) {
  const [pending, start] = useTransition();
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <span><Badge variant="secondary">{PLATFORM_LABELS[account.platform]}</Badge> {account.displayName} <span className="text-muted-foreground">({account.externalAccountId})</span></span>
    {canManage && <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => disconnectSocialAccount(slug, account.id))}>{pending ? "Memutus…" : "Putuskan"}</Button>}
  </div>;
}

function ConnectForm({ slug, brandId, platform }: { slug: string; brandId: string; platform: Platform }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectSocialAccount.bind(null, slug, brandId, platform), { ok: false });
  if (!open) return <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <span>{PLATFORM_LABELS[platform]} <span className="text-muted-foreground">· belum terhubung</span></span>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Hubungkan</Button>
  </div>;
  return <form action={action} className="grid gap-2 sm:grid-cols-2">
    <div className="text-sm font-medium sm:col-span-2">Hubungkan {PLATFORM_LABELS[platform]}</div>
    {state.error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
    {CREDENTIAL_FIELDS[platform].map((field) => <label key={field.key} className="space-y-1 text-sm"><span>{field.label}</span>
      <Input name={field.key} type={field.secret ? "password" : "text"} autoComplete="new-password" required disabled={pending} />
    </label>)}
    <p className="text-xs text-muted-foreground sm:col-span-2">{HELP[platform]} Kredensial diverifikasi, dienkripsi, dan tidak ditampilkan lagi.</p>
    <div className="flex gap-2 sm:col-span-2">
      <Button size="sm" type="submit" disabled={pending}>{pending ? "Memverifikasi…" : "Hubungkan"}</Button>
      <Button size="sm" type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Batal</Button>
    </div>
  </form>;
}

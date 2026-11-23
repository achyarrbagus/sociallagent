# SocialAgent (rewrite)

SaaS untuk digital agency: kelola **Agency → Klien → Brand → Campaign**.
Rewrite ramping dari Paperclip; tampilan diambil dari project `socialagent`.

## Stack

- Next.js 16 (App Router, server actions)
- Prisma 7 + PostgreSQL (`@prisma/adapter-pg`)
- Better Auth (email/password + organization plugin; organization = agency)
- Tailwind v4 + primitives shadcn/radix dari `socialagent/ui`

## Setup

```bash
pnpm install
cp .env.example .env            # isi BETTER_AUTH_SECRET (openssl rand -base64 32), LLM_* atau AI_GATEWAY_API_KEY, CRON_SECRET
docker compose up -d            # Postgres di localhost:5433
pnpm prisma migrate dev
pnpm dev                        # restart dev server setelah migrasi (Prisma client di-cache)
```

Buka http://localhost:3000 → Daftar → onboarding (agensi + tim AI) → klien & brand → konten → jadwal.

### Worker publish

Posting otomatis (akun sosial terhubung) dikirim oleh `GET /api/cron/publish` dengan header
`Authorization: Bearer $CRON_SECRET`, dipanggil tiap menit (Vercel Cron / system cron).
Untuk dev atau self-host, set `PUBLISH_WORKER=interval` agar worker jalan di dalam proses Next (tiap 30 detik).
Instagram butuh `PUBLIC_APP_URL` HTTPS karena media diambil lewat URL bertanda tangan (berlaku 1 jam).

Tidak ada retry otomatis (sama seperti socialagent): gagal → jadwalkan ulang; hasil tidak pasti → owner konfirmasi di Kalender.

## Struktur

```
prisma/schema.prisma            Auth tables + Client, Brand, Campaign, ActivityLog
src/lib/auth.ts                 Better Auth server config
src/lib/session.ts              requireUser / requireAgency (cek membership per request)
src/lib/agency/actions.ts       Server actions, semua query di-scope ke organizationId
src/lib/content/lifecycle.ts    Status konten, revisi, keputusan owner, invalidasi konteks
src/lib/agents/run.ts           Agent AI: konteks brand + revisi → revisi baru (AI SDK)
src/lib/cliplab/                Karakter agent ClipLab (MIT, vendored dari socialagent)
src/lib/social/adapters/        Facebook, Instagram, X, LinkedIn, TikTok (port dari socialagent)
src/lib/publications/           Jadwal, worker publish (klaim + lease), zona waktu brand
src/lib/crypto.ts               AES-256-GCM untuk kredensial akun sosial, HMAC untuk URL media
src/app/[agency]/...            Hari ini, Klien & Brand, Campaign, Konten, Tim AI
src/app/globals.css             Token desain SocialAgent (sa-*, today-*, landing-*)
```

## Roadmap

1. ✅ Auth, agency, CRUD klien/brand/campaign, dashboard
2. ✅ Onboarding wizard, Tim AI (12 agent agency-core + karakter ClipLab), konten + review owner, tugas produksi ke agent
3. ✅ Akun sosial per brand, media konten, jadwal posting, Kalender, publish otomatis
4. Laporan, billing, kuota AI
5. Backlog (dikerjakan terakhir, dari Paperclip/socialagent):
   - Issue tracker umum (tugas di luar konten)
   - Routine (tugas berulang, mis. director-review mingguan)
   - Secrets manager (penyimpanan kredensial terenkripsi per agensi)
   - Decision queue (antrean keputusan owner lintas fitur)
   - Org chart visual tim AI
   - Budget policy lengkap (batas biaya per agent/brand, insiden, auto-pause)

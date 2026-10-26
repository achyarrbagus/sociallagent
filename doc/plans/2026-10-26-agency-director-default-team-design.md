# Design — Agency Director sebagai pimpinan default dan tim agency bawaan

Tanggal: 2026-10-26
Status: Disetujui arahnya oleh owner di chat; dokumen ini menunggu review owner
Branch: `feat/creative-agency-foundation`
Terkait: `doc/plans/2026-10-25-prd-rewrite-creative-agency.md`, `doc/agency-content.md`,
`packages/teams-catalog/catalog/optional/content/agency-studio/`

## 1. Intent

Produk sudah diarahkan menjadi ruang kerja **creative agency** (company = agency,
owner manusia = pengambil keputusan, client/brand di bawah agency). Tetapi titik
awal setiap company baru masih bernuansa software company: agent pertama
"Chief of staff" yang mewawancarai owner dan mengusulkan tim dari nol, dan tim
bawaan katalog adalah `core-exec-team` (CEO, CTO, QA, "First Project" untuk
implementasi).

Owner ingin: alur aplikasi tetap seperti sekarang, tetapi pimpinan company adalah
**Agency Director** (pengganti CEO) yang membawahi tim spesialis agency
(creative, SEO, scriptwriter, dsb.). Company baru langsung "jadi agency".

## 2. Keputusan owner (di chat)

1. Pimpinan default = **Agency Director**.
2. Hierarki 12 agent, tanpa "Strategy Lead" terpisah:

   ```
   Agency Director                (role internal: ceo)
   ├── Account Manager
   │   ├── Publishing Coordinator
   │   └── Performance Analyst
   ├── Creative Strategist        (sekaligus kepala tim strategi)
   │   ├── Content Strategist
   │   ├── SEO Specialist
   │   └── Marketing Strategist
   └── Creative Director
       ├── Copywriter
       ├── Scriptwriter           (peran baru)
       └── Designer
   ```

3. Semua 12 agent dipasang sekaligus untuk company baru. Hanya Director yang punya
   tugas rutin (review prioritas, pengganti "First Heartbeat Review" CEO); agent
   lain hanya bangun karena assignment.
4. Software company **tidak dihapus**: tim agency menjadi default, `core-exec-team`
   turun menjadi tim opsional di katalog. Company lama tidak dimigrasi.
5. Director memakai role `ceo` di balik layar agar hak delegasi/rekrut tetap jalan.
   Owner tidak boleh melihat kata "CEO" di mana pun: nama, title, label role, org
   chart, onboarding, katalog, hire dialog, dan instruksi agent semuanya
   "Agency Director" (owner memilih opsi A, 2026-10-26; role baru di enum ditolak).
6. Hanya owner yang meng-approve konten final (tidak berubah dari `doc/agency-content.md`).

## 3. Goals

- Company baru dari onboarding berakhir dengan Agency Director + 11 spesialis dengan
  `reportsTo` sesuai hierarki di atas.
- Director bisa mendelegasikan, assign task ke agent lain, dan merekrut agent
  tambahan tanpa perubahan aturan akses.
- Copy onboarding (nama default agent, greeting, opening question, brief task
  pertama, persona agent pertama) berbahasa agency: client, brand, campaign, konten.
- Label role `ceo` di UI tampil sebagai "Agency Director".
- Katalog: tim agency bawaan menjadi starter team default; `core-exec-team` tetap
  bisa di-install manual.

## 4. Non-goals

- Tidak mengganti/ganti nama nilai enum role `ceo` di database atau shared constants.
- Tidak mengubah 9 titik otorisasi berbasis `role === "ceo"`
  (`server/src/routes/agents.ts:1262`, `:4935`, `server/src/routes/companies.ts:375`,
  `server/src/routes/access.ts:3019`, `server/src/routes/issues.ts` approval linking,
  `server/src/routes/workspace-runtime-service-authz.ts:194`,
  `server/src/services/authorization.ts:208`, `:2627`, dst.).
- Tidak memigrasi company/agent lama (`amifish`, `possfy`, agent "CEO" lama tetap).
- Tidak menghapus `core-exec-team`, `agency-studio`, atau tim software lain.
- Tidak menambah publishing ke provider sosial media, jadwal otomatis untuk spesialis,
  atau kredensial provider.

## 5. Anti-goals (gagal walau "jalan")

- Director atau lead mana pun bisa meng-approve konten final → pelanggaran
  kontrak owner-only approval.
- Company baru punya dua pimpinan (Chief of staff/Director ganda, atau Director +
  Account Manager sama-sama `reportsTo: null` di root).
- Onboarding gagal total kalau install tim gagal (owner harus tetap punya Director
  yang bisa dipakai).
- 11 spesialis langsung jalan dan membakar budget tanpa ada task.

## 6. Keadaan sekarang (hasil recon)

| Area | Lokasi | Keadaan |
|---|---|---|
| Nama/role agent pertama | `ui/src/lib/onboarding-agent-role.ts:17-19` | `DEFAULT_AGENT_ROLE = "general"`, `DEFAULT_AGENT_NAME = "Chief of staff"` |
| Wizard | `ui/src/components/OnboardingWizard.tsx:598-612`, placeholder `:3002` ("e.g. Chief of staff") | Tidak memasang tim apa pun |
| Persona agent pertama | `server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md` | Persona chief of staff |
| Task pertama | `server/src/onboarding-assets/first-task/{greeting.md,opening-question.json,brief.md,skills/first-task/SKILL.md}` | Opsi "interview me and propose a plan and an agent team" / "I have a task in mind" |
| Persona CEO lama | `server/src/onboarding-assets/ceo/*`, `server/src/services/default-agent-instructions.ts:5,26` | Instruksi khusus untuk role ceo |
| Tim default | `packages/teams-catalog/catalog/bundled/company-defaults/core-exec-team/` | `defaultInstall: true`; hanya menandai tile "starter team" di katalog (`ui/src/pages/TeamCatalog.tsx:2184`) |
| Tim agency | `packages/teams-catalog/catalog/optional/content/agency-studio/` | 9 agent, manager Account Manager (`role: pm`, `reportsTo: null`) |
| Install di bawah manager | `server/src/services/teams-catalog.ts:55,746-768` | `targetManagerAgentId` / `targetManagerSlug` sudah didukung |

## 7. Bentuk solusi (yang sudah diputuskan)

### 7.1 Tim bawaan baru `agency-core`

- Lokasi: `packages/teams-catalog/catalog/bundled/company-defaults/agency-core/`.
- `defaultInstall: true`, `recommendedForCompanyTypes: [agency, marketing, content]`.
- Berisi **12 agent termasuk Agency Director** sebagai `manager:` paket (role `ceo`,
  `reportsTo: null`), dengan tiga sub-kepala (Account Manager, Creative
  Strategist, Creative Director) `reportsTo` Director. Alasan (keputusan builder
  check, *call Claude*): format `agentcompanies/v1` hanya punya satu `manager`,
  `rootAgentSlugs` hanya berisi satu agent (`packages/teams-catalog/src/catalog-builder.ts:488-536`)
  dan hanya root yang di-reparent (`server/src/services/teams-catalog.ts:461-488`).
  Memasukkan Director ke paket menghindari perubahan format multi-root, dan
  membuat tugas rutin Director bisa ikut paket (assignee task harus agent di
  paket yang sama, `catalog-builder.ts:525-529`).
- **Adopsi manager** (*call Claude*): importer katalog mendapat opsi baru, mis.
  `adoptManagerAgentId`. Jika diisi, slot `manager` paket dipetakan ke agent yang
  sudah ada (tidak membuat agent baru; persona/instruksi agent itu tidak ditimpa),
  semua `reportsTo: <manager>` diarahkan ke agent itu, dan task dengan
  `assignee: <manager>` di-assign ke agent itu. Agent yang diadopsi harus satu
  company, aktif, dan role `ceo`; selain itu 422. Install manual dari Team Catalog
  ke company tanpa Director tetap membuat Director dari paket.
- Instruksi agent diambil dari `agency-studio` (operating contract + agency content
  API handoff tetap utuh), diadaptasi untuk struktur baru. Peran baru: Creative
  Director (lead eksekusi kreatif, review kualitas sebelum diserahkan ke owner,
  tidak approve) dan Scriptwriter (naskah video pendek/reels/TikTok).
- `core-exec-team`: `defaultInstall: false`. Tetap di katalog. Bila di-install ke
  company yang sudah punya agent role `ceo` aktif, preview install menampilkan
  peringatan "akan ada dua pimpinan" (*call Claude*); install tidak diblokir.
- `agency-studio` (opsional) tetap ada untuk company lama yang ingin menambah tim
  agency tanpa onboarding ulang.
- Jalankan ulang generator katalog (`packages/teams-catalog/generated/catalog.json`)
  dan perbarui `shipped-catalog.test.ts`.

### 7.2 Onboarding

- Agent pertama: nama default "Agency Director", role `ceo`, title
  "Agency Director". Placeholder wizard diganti contoh agency.
- Persona agent pertama: file baru `server/src/onboarding-assets/first-task/agency-director/AGENTS.md`
  menggantikan `chief-of-staff/AGENTS.md` (jalur pemuatan di
  `onboarding-first-task-assets.ts` diarahkan ke file baru).
- Setelah Director berhasil dibuat **dan aktif** (bila hire butuh approval, setelah
  approval diterima), server memasang `agency-core` dengan `adoptManagerAgentId =
  <Director>`, memakai adapter/runtime yang sama dengan Director.
- Berlaku untuk **kedua jalur** pembuatan agent pertama (*call Claude*): wizard
  (`agentsApi.hire` dengan `onboardingFirstAgent`) dan
  `POST /companies/:id/onboarding-seed` (`server/src/services/onboarding-seed.ts`,
  yang sudah membuat `ceo`; title default menjadi "Agency Director" bila owner tidak
  mengisi). Hook install berada di server, satu fungsi bersama.
- Idempoten (*call Claude*): bila company sudah punya agent yang berasal dari
  `agency-core`, install dilewati. Ini menutup jalur wizard yang memakai ulang agent
  atau memulihkan run tersimpan.
- Nama agent pertama tetap bisa diubah owner (default "Agency Director"); role dikunci
  `ceo` dan pemilih role untuk agent pertama dihapus (*call Claude*). Tim tetap
  terpasang apa pun namanya.
- Install tim gagal → onboarding tetap selesai dengan Director; kegagalan dicatat
  di activity log dan tampil jelas ke owner (sesuai aturan UI "surface failures"),
  dengan jalan untuk mencoba ulang dari Team Catalog.
- Tugas rutin Director: setara `first-heartbeat` di `core-exec-team`, diubah ke
  "review prioritas antar-brand, cek konten menunggu keputusan owner, tentukan
  task berikutnya".

### 7.3 Task pertama (first-task)

Karena tim sudah ada, opsi "propose an agent team" tidak relevan lagi. Opening
question menjadi kira-kira:

- `interview`: "Wawancarai saya tentang agency dan client pertama, lalu susun
  rencana kerja untuk tim." — Director mengumpulkan profil agency + client/brand
  pertama, mendorong owner mengisi `/agency` (Clients & Brands), lalu membuat task
  awal untuk tim.
- `task`: "Saya sudah punya brief" (free text) — Director langsung mendelegasikan.

Id opsi `interview` dan `task` serta `freeText: true` pada `task` **tetap**, karena
divalidasi server dan dirujuk skill `first-task`. `skills/first-task/SKILL.md`
diperbarui: hapus langkah mengusulkan/merekrut tim dari nol; ganti dengan
delegasi ke tim yang sudah terpasang.

### 7.4 Label UI

- `AGENT_ROLE_LABELS.ceo` di `packages/shared` → "Agency Director". Ini juga
  mengubah tampilan agent "CEO" di company lama — diterima (aplikasi sekarang agency).
- Semua teks UI yang menyebut "CEO" secara literal ke owner (org chart, wizard,
  hire dialog, katalog, tooltip, pesan error yang tampil ke owner) diganti
  "Agency Director". Kriteria selesai: `grep -rn "CEO" ui/src` tidak menyisakan
  string yang tampil ke owner (komentar kode, nilai enum `ceo`, dan test fixture
  boleh tersisa). Pesan error server yang sampai ke UI juga diperiksa. Persona/instruksi `server/src/onboarding-assets/ceo/*`
  (dipakai untuk role ceo via `default-agent-instructions.ts`) diubah ke bahasa
  Agency Director.

### 7.5 Dokumen

- Update `doc/PRODUCT.md`, `doc/SPEC-implementation.md` (bagian onboarding/tim
  default), `maps/feature-map/onboarding.md`, `maps/feature-map/agency.md`
  (sub-feature `team`), README `agency-studio` (kaitannya dengan `agency-core`).
- Jalankan `node scripts/check-maps.mjs` setelah edit map.

## 8. Diserahkan ke builder

- Apakah instruksi agent `agency-core` disalin dari `agency-studio` atau dirujuk
  bersama (selama hasil katalog valid dan test lolos).
- Role enum untuk tiga peran baru (pilih dari enum yang ada; jangan `ceo`).
- Teks persis copy onboarding (dalam bahasa yang konsisten dengan copy wizard
  sekarang — Inggris — kecuali owner minta lain).
- Interval/bentuk tugas rutin Director, selama mengikuti mekanisme `recurring`
  yang sudah ada.
- Urutan dan bentuk test; minimal: test katalog (roster + reportsTo), test importer
  `adoptManagerAgentId` (tidak membuat manager baru, reportsTo + task assignee
  diarahkan, tolak agent beda company/bukan ceo), test service onboarding untuk
  kedua jalur (Director role ceo, tim terpasang di bawahnya, idempoten, kegagalan
  install tidak menggagalkan onboarding), test validasi opening-question.
- Nama persis opsi importer dan apakah perlu field shared validator/API.

## 9. Verifikasi

- `pnpm test` targeted untuk teams-catalog, onboarding services, shared labels.
- `pnpm check:token-gates` bila ada perubahan UI.
- Sebelum hand-off: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`.
- Manual: reset data dev terpisah (bukan data owner), jalankan onboarding, cek
  org chart = 12 agent sesuai hierarki, assign task ke Director, pastikan dia bisa
  mendelegasikan ke Creative Strategist.

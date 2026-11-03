# Next.js App Router migration (2026-11-03)

Status: Approved by the user on 2026-11-03. Full migration requested; implementation is in progress.

## Goal

Move the Paperclip board UI from Vite + React Router to Next.js App Router. Next must own the user-visible route tree and route transitions; a static Next shell around the existing React Router application does not satisfy this migration.

Keep the existing Express/Bun server as the owner of API routes, authorization, company boundaries, storage, webhooks, plugins, and activity logging. Preserve a same-origin browser experience so existing cookies, CSRF/origin checks, streaming, uploads, and API clients continue to work.

## Current constraints

- `ui/src/App.tsx` owns a large React Router route table with company-prefixed URLs, unprefixed compatibility routes, redirects, and feature gates.
- `ui/src/lib/router.tsx` wraps React Router to preserve company-prefix navigation. Components across `ui/src` use its hooks and links.
- `ui/src/main.tsx` owns the browser-only provider tree, plugin bridge, service-worker lifecycle, and React root.
- `ui/src/pages/` is an existing source-code directory, so Next treats it as the legacy Pages Router when App Router files are placed under `ui/src/app/`. The initial Next app uses a dedicated `*.next.tsx` page extension to keep the old component directory from becoming a route tree.
- `server/src/app.ts` serves the UI through Vite middleware in development and a static Vite build in production. Express and the UI share one public origin.
- The UI is shipped as static assets through the server package, CLI install/build flows, Docker, and release scripts. `ui/public/sw.js`, runtime HTML branding, static cache rules, Storybook, and Playwright are coupled to this model.
- The server runtime is Bun. Next.js requires a Node-compatible production runtime, so the migration must explicitly manage the Next process without replacing Express API ownership or accidentally exposing a second public origin.

## Architecture direction

- Use Next App Router as the actual route owner. Migrate route definitions to `ui/src/app/`; remove React Router from the production UI after route parity is proven.
- Keep Express as the public listener and API owner. The Next Node runtime is an internal UI renderer behind Express so the browser continues to use one origin. The proxy must preserve request method/body, query, headers needed by auth and origin checks, streaming responses, cancellation, and development websocket upgrades. API and plugin routes must remain ahead of the UI fallback.
- Use client components for existing interactive board surfaces where browser APIs or current provider state require them. Do not introduce server-side data access that bypasses existing API authorization.
- Keep the migration usable at every stage: the current Vite application remains the fallback until Next route coverage and runtime parity pass; the fallback is removed only in the final cutover.
- Do not keep a permanent parallel UI or label a React Router wrapper as a full migration.

## Initial inventory findings

- `App.tsx` contains global/auth routes plus a company-prefixed board tree with nested feature and authorization gates, compatibility redirects, and plugin wildcards.
- The company-aware router wrapper is imported from 265 non-test UI files (276 named import declarations); it owns link prefixing, active-company resolution, issue quicklooks, and navigation semantics. Direct React Router imports also exist outside the wrapper.
- `main.tsx` mixes browser-only initialization with the global provider tree. Next root layouts must not execute the service-worker, plugin bridge, React-root, or browser APIs during server rendering.
- The migration is therefore not a package swap. Route ownership, global providers, browser bootstrap, the Bun/Node process boundary, static packaging, and route-parity tests must move together in validated slices.

## Progress

- **Phase 1 complete:** route and packaging inventory documented above. No runtime cutover has been attempted.
- **Phase 2 in progress:** extracted `AppProviders` from the Vite entry and made its QueryClient instance-scoped. Added the Next App Router root, Tailwind PostCSS pipeline, standalone output configuration, and a separate Next TypeScript config. The existing Vite entry remains the active runtime. A request-scoped server bootstrap now prefetches health, session, board access when authenticated, accessible companies, and experimental shell settings from Express; it forwards the incoming cookie, uses a trusted configured internal API origin, and hydrates the client QueryClient. The bootstrap never reads the database or derives a destination from the request Host header.
- **Phase 3 in progress:** App Router owns `/`, `/auth`, `/auth/forgot-password`, `/auth/reset-password`, dynamic `/board-claim/[token]`, `/cli-auth/[id]`, `/invite/[token]`, `/oauth-handoff`, `/mcp-connect/[id]`, `/dot-connect/[id]`, `/mcp-device`, `/assistant-connections`, `/{companyPrefix}`, and `/{companyPrefix}/dashboard`. The company segment mounts existing `AppProviders` and `Layout`, keeps `CloudAccessGate` and `ShellConfigurationGate` around its children, and disables service-worker updates until cache/runtime rules are migrated. The company shell now renders on the server rather than using `ssr:false`; the existing dashboard feature surface remains a client component and its feature data is not yet server-prefetched. Company root redirects to its dashboard. Device-code query state is passed through Next's server route `searchParams` contract. `CompanyContext` preserves Vite HMR context identity through an explicitly typed optional HMR hook. The staging SHA hook now defers hostname detection until after hydration to avoid accessing `window` during server render.
- The Next build uses webpack with `.js`→`.ts` extension aliasing and maps legacy `react-router-dom` imports to the Next navigation adapter; `build:next` builds `@paperclipai/shared` first. The Vite runtime remains active. Express-to-Next proxy/lifecycle, the production setting for `PAPERCLIP_INTERNAL_API_ORIGIN`, remaining board routes, packaging, and cutover are not done.
- Verified: Next production build passes; Vite UI typecheck passes; the `SidebarAccountMenu` tests pass (36); and a standalone Next server with a controlled mock Express API returns HTTP 200 for `/PAP/dashboard` with the company shell and fixture company rendered in server HTML. This proves the server-rendered company shell and bootstrap against a mock API, not authenticated/production parity through Express. The previous public/auth route smoke checks still pass; authenticated API journeys have not been verified through Express.

## Delivery phases

1. **Route and runtime contract:** inventory all route patterns, prefixes, redirects, global providers, browser-only initialization, plugin routes, and transport endpoints. Prove the internal Next/Express development proxy and lifecycle in an isolated test harness before switching the default server.
2. **Next application foundation:** add the App Router package/config, root layout and error/loading boundaries, extract reusable UI providers from `main.tsx`, and establish Node runtime start/stop, readiness, logs, and shutdown through the existing dev runner. Keep the Vite UI default during this phase.
3. **Route migration:** port public/auth/onboarding routes, then company-scoped control-plane routes, then tools/apps/settings and special callback/plugin routes. Preserve company-prefix rules, old deep links, query filters, access gates, title/branding behavior, and not-found semantics. Migrate shared `Link`, `useNavigate`, `useLocation`, and `useParams` consumers to App Router navigation and route params; do not leave a React Router catch-all in production.
4. **Packaging and production:** produce and package the Next runtime output for local CLI, npm, and Docker installs; update build/release scripts, runtime health and shutdown, deployment docs, cache policy, service-worker asset matching, and worktree runtime behavior. Keep `/api`, webhooks, MCP, websocket/SSE, plugin UI, and static asset paths on the established public origin.
5. **Cutover and removal:** switch local dev and production UI entry points to Next; remove Vite application middleware/config only after all supported workflows pass. Vite may remain only where independently needed for Storybook/tests, with explicit ownership.

## Acceptance criteria

- All current route behavior has equivalent App Router coverage, including company-prefixed and unprefixed routes, legacy redirects, query preservation, auth callbacks, and unknown routes.
- API authentication, cookies, same-origin mutation guards, file uploads, SSE/streaming, websocket consumers, plugin UI routes, public webhooks, and MCP transports continue to work through the same public origin.
- Provider bootstrap order, error boundaries, theme/company state, live updates, plugin bridges, service-worker updates, runtime branding, and deep-link refresh work after a hard reload.
- Local dev and managed worktree services start, report health, stop cleanly, and cannot adopt a sibling Next process. The public API remains owned by Express.
- npm/CLI and Docker artifacts contain everything required to run the Next Node process; fresh package-install smoke tests pass.
- App Router browser E2E covers authentication, company switching, representative control-plane journeys, and hard reloads on nested URLs. Existing useful UI and route tests are migrated rather than discarded.
- `bun run typecheck`, targeted tests, token gates, build, and relevant release/Docker checks pass before removing the Vite fallback.

## Out of scope

- Rewriting backend APIs or bypassing the existing server authorization contract.
- Adding SSR data fetching or SEO behavior to authenticated pages without a separate product need.
- Redesigning the UI, changing route semantics, or changing authentication behavior as part of framework migration.

# No-login implementation report

Date: 2026-09-12. Base commit: 5ea6b2c4440e7351f9e6c55a37d518aca95119fd, branch main.

## Result

KB-outage no longer has a user authentication gate, Auth bypass flag, login/signup form, logout flow, session-cookie API, or application Auth listeners. Supabase remains the database/storage backend. No fake user, session, automatic login, or always-authorized helper replaces the removed system.

The middleware file contained only user-authentication behavior, so it was removed entirely. Both the root page and the legacy login URL send an unconditional HTTP redirect to the dashboard. These redirect pages execute per request: the initial Next.js 14.2.5 production test exposed prerendered 307 pages without a Location header. Making the redirects dynamic resolved that failure.

Direct delivery-management navigation also exposed an existing Leaflet import-time window error on the server. Only the CustomerMapSection import now loads without SSR. No map business logic or final UI was changed.

## Operational APIs

Removed user-session gates from job creation/update, notice scheduling, document receipt/delivery, notice completion, workflow history/rollback, close/delete, delivery batch lookup/creation, target saving, proof upload, and token creation/regeneration. Removed the delivery ensureAuthenticated wrapper while keeping its validation/error helpers.

Request validation, existing UUID checks, workflow rules, database errors, service-role separation, delivery public-token checks, scheduler secrets, Google credentials and storage controls are preserved. API errors remain business/API errors rather than login navigation.

## Supabase and attribution

The shared browser Supabase client remains for database queries and anonymous updates. persistSession, autoRefreshToken and detectSessionInUrl are disabled, so stale local storage and URL tokens cannot change its identity. Server database/storage clients and their privileged credentials remain server-side.

Closing a job no longer writes closed_by. New jobs retain the existing null default, and historical identity values remain untouched even when the operation is repeated. GIS actor/reporter fallback is explicitly unnamed (ผู้ใช้งานไม่ระบุชื่อ), independent of Auth configuration. Existing reporter fields, document receiver/deliverer names, notice operator names and nullable delivery created_by are preserved.

No new database migration was needed or created. No historical SQL, RLS policy, foreign key, or production record was changed. Actual deployed database policies were not verified by these tests; the implementation preserves the previously intended anonymous/service-role access paths.

## Verification

- All 128 existing TypeScript tests passed across all 20 test files, using Node's test runner and experimental type stripping.
- All 15 new tests in scripts/no-login.test.cjs passed. The actual route handlers execute with external database/storage/LINE I/O substituted. They cover successful CRUD/workflow/delivery operations for a 3 x 3 matrix of absent/true/false legacy flags and missing/stale/malformed cookies, validation failures, workflow conflicts, database permission errors, historical attribution, invalid public delivery tokens, scheduler-secret rejection, and the real Supabase SDK's anonymous request headers/storage independence.
- Existing DOCX/QR integration script passed in the temporary verification copy; the tracked output document was not overwritten.
- npm run build passed with compilation, lint and TypeScript checks, and all 29 static pages generated. The build ran from a fresh temporary copy with no local environment files (only the unused example file), no legacy Auth flag, dummy credentials, and an isolated local Supabase HTTP fixture. Existing React hook/image lint warnings and caught dynamic-route prerender diagnostics remain; no Auth-removal build errors remain.
- npm run test:no-login:routing -- --base-url=http://127.0.0.1:3107 passed 72 navigation/reload checks against that production build. Runtime additionally supplied a false legacy flag, which had no effect.
- Routes checked: root, dashboard, jobs, new job, job detail, calendar, GIS list/create, patients, watchlist, major-customer delivery management, and the legacy login URL. Missing, stale and malformed cookies all worked. The legacy login URL ends at the dashboard without a form.
- /reports remains 404: no reports page exists in this repository. No unrelated reports feature was created.
- A fresh browser session rendered fixture data on dashboard/jobs/job detail, survived job-detail refresh, and opened delivery management, calendar, GIS and new-job UI. The legacy login URL opened the dashboard. No credentials were entered.
- git diff --check passed. SQL files have no diff.

The initial redirect-header and Leaflet routing checks failed, were traced and minimally fixed, and the complete 72-check routing matrix then passed. Production CRUD, storage writes, SQL RPC execution and RLS behavior were not exercised against a real database. No deployment, push, commit or database mutation was performed.

## Remaining Auth-term inventory

Repository source was scanned for /login, signIn, signOut, getSession, getUser, supabase.auth, AUTH_DISABLED, NEXT_PUBLIC_AUTH_DISABLED, authorizeServerRequest, ensureAuthenticated, sb-access-token and sb-refresh-token.

- Runtime application source: no user-login dependency remains. The login pathname exists solely as the unconditional compatibility redirect route.
- scripts/no-login.test.cjs: old flag/cookie names are negative-test fixtures; old Auth symbols are forbidden-source assertions; the login pathname is checked for compatibility behavior.
- scripts/check-no-login-routing.cjs: the login pathname is an entry URL and forbidden redirect destination assertion; cookie names provide stale/malformed test inputs.
- src/lib/gisIssues.test.ts: authorizeServerRequest appears in an existing assertion that it must be absent.
- src/components/deliveryTracking/LargeCustomerDeliveryList.tsx: getUserMedia is camera capture, not getUser authentication.
- The existing ignored local .env.local still contains the obsolete flag. It was left untouched and is inert; there is no runtime reader, and it was absent from the clean build copy.
- SQL history intentionally retains auth.users, authenticated roles and auth.uid references. Historical migrations were not rewritten. Google login-page detection, service-account credentials, Supabase service-role credentials, delivery link tokens, proof URL redirects and scheduler-secret checks remain unrelated to application login.
- This report and README discuss the change. Dependency code, Git history and ignored generated caches are not application source and were not deleted.

## Remaining risks and release boundary

Production is unchanged until a separately authorized deployment. Deploy the reviewed source and perform a production smoke test. The real database must still have the existing documented schema, anonymous policies and server credentials; mocked I/O tests cannot certify its live state. User identity is no longer verified by design, so operator names are operational attribution rather than authenticated audit identity. Existing unrelated build warnings were left unchanged.

## File manifest

### Removed

- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/auth/session/route.ts`
- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/components/layout/UserMenu.tsx`
- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/lib/authConfig.ts`
- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/lib/serverAuth.ts`
- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/lib/supabase/server.ts`
- `C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/middleware.ts`

### Modified

- [.env.example](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/.env.example>)
- [README.md](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/README.md>)
- [package.json](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/package.json>)
- [src/app/(app)/jobs/page.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/(app)/jobs/page.tsx>)
- [src/app/api/jobs/[id]/close/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/close/route.ts>)
- [src/app/api/jobs/[id]/delete/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delete/route.ts>)
- [src/app/api/jobs/[id]/delivery-batch/_shared.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/_shared.ts>)
- [src/app/api/jobs/[id]/delivery-batch/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/route.ts>)
- [src/app/api/jobs/[id]/delivery-batch/targets/[targetId]/proof/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/targets/[targetId]/proof/route.ts>)
- [src/app/api/jobs/[id]/delivery-batch/targets/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/targets/route.ts>)
- [src/app/api/jobs/[id]/delivery-batch/token/regenerate/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/token/regenerate/route.ts>)
- [src/app/api/jobs/[id]/delivery-batch/token/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/delivery-batch/token/route.ts>)
- [src/app/api/jobs/[id]/document-workflow/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/document-workflow/route.ts>)
- [src/app/api/jobs/[id]/notice-completion/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/notice-completion/route.ts>)
- [src/app/api/jobs/[id]/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/route.ts>)
- [src/app/api/jobs/[id]/workflow-rollback/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/[id]/workflow-rollback/route.ts>)
- [src/app/api/jobs/notice-schedule/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/notice-schedule/route.ts>)
- [src/app/api/jobs/route.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/api/jobs/route.ts>)
- [src/app/job/[id]/page.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/job/[id]/page.tsx>)
- [src/app/login/page.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/login/page.tsx>)
- [src/app/page.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/app/page.tsx>)
- [src/components/deliveryTracking/LargeCustomerDeliveryTrackingPage.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/components/deliveryTracking/LargeCustomerDeliveryTrackingPage.tsx>)
- [src/components/layout/AppNavbar.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/components/layout/AppNavbar.tsx>)
- [src/components/layout/MobileNav.tsx](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/components/layout/MobileNav.tsx>)
- [src/lib/gisIssuesServer.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/lib/gisIssuesServer.ts>)
- [src/lib/supabase/client.ts](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/src/lib/supabase/client.ts>)

### Added

- [docs/no-login-implementation.md](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/docs/no-login-implementation.md>)
- [scripts/check-no-login-routing.cjs](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/scripts/check-no-login-routing.cjs>)
- [scripts/no-login.test.cjs](<C:/Users/506870/Desktop/WebApp/Outage/KB-outage/scripts/no-login.test.cjs>)


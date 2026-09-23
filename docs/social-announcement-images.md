# Social announcement images

The existing Social modal now uploads an area/map image and produces an announcement from the current outage job. Copy-text and map links remain available. The final action records that staff have posted the announcement; it does not publish to Facebook or LINE automatically.

## Deployment

1. Apply `sql/029_social_announcement_images.sql` to the intended Supabase project after the existing migrations (through 028). This creates an image-history table, a private storage bucket, and the service-only atomic completion function. The migration has not been applied by this implementation.
2. Deploy with the updated lockfile (`npm ci`, `npm run build`). Keep `assets/fonts/NotoSansThai.ttf` and its OFL license in the deployment. Next's output tracing includes them in the image endpoint's server bundle.
3. Retain the existing server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`). No additional environment variables or login are needed.
4. In a test job, upload a map, generate, download, and confirm the announcement. Change the date, reopen Social, verify the stale warning and disabled completion/download, then regenerate. Repeat for time and area before enabling staff use.

Existing jobs without an image must generate and confirm one before completing Social through this modal. Existing posted history is not migrated or deleted.

## Rendering and storage

Sharp decodes PNG/JPEG/WEBP, validates the detected format against MIME, rejects malformed and animated files, and bounds uploads to 3 MiB and 24 million pixels. Multipart request bodies are bounded even without a Content-Length header. The 3 MiB limit leaves room under Vercel's request-size limit. EXIF orientation is applied and metadata removed when normalizing the source map to PNG. Filenames are generated UUIDs, never supplied names.

The renderer uses an SVG background and Sharp's Pango text renderer with a bundled Noto Sans Thai font. Thai shaping and word/character wrapping do not depend on Vercel OS fonts. The output is a fixed 1200 × 1200 PNG. The uploaded map is fully contained without distortion; a blurred copy of that same map fills side bands for unusual aspect ratios. The map occupies about 62% of the canvas for ordinary area names. The integrated header and information band use navy (`#123A63`, `#0B2F52`), orange (`#F57C18`), white, and a light `#F7F9FC` background. A thin orange line separates the map from the information band, which extends cleanly to the bottom edge. No logo is drawn because there is no approved logo asset in the repository.

The information row uses 48% of its width for area and 26% each for date and time. Area text starts at 49px for short names, 43px for medium names, and 38px for long names, then reduces only as needed to a 30px minimum. Pango wraps Thai text at available breaks, while invisible word joiners keep English hyphenated tokens together when possible. Exceptionally long names use a full-width area row above date/time; the map bounds stay fixed. Unrepresentable names are rejected with an explanatory message rather than clipped or truncated. The three-column content is vertically centered within the fixed canvas and uses subtle separators. Date/time retain prominent type and use the existing `formatThaiFullDate` implementation.

The private `social-announcements` bucket stores:

- `{job_id}/source/{uuid}.png`: normalized source map; never overwritten.
- `{job_id}/generated/{uuid}.png`: final announcement; never overwrites a source or earlier generation.

`social_announcement_images` stores paths, generation timestamp and the source-data snapshot for each generation. Regeneration reuses the previous source unless a new map was selected. Failed metadata writes clean up only the newly uploaded objects. Previews use one-hour signed URLs, refreshed while the modal is open; downloads pass through a server endpoint that checks freshness again.

## Freshness and completion

Both text and image use `outage_date`, `doc_time_start`, `doc_time_end`, and `doc_area_title`. The snapshot also includes `doc_area_detail`, `doc_purpose`, `map_link`, and `equipment_code` so changes to the other announcement information invalidate the review too. No additional editable date/time fields or stored stale flags exist. Saved Social text is retained as a record, but previews are generated from the current job.

The modal fetches current job and image data when opened, on focus and every five seconds. Parent job changes also invalidate the review. A changed snapshot, changed image, or newly selected source clears confirmation. Failed refreshes disable completion. Stale images remain visible with a red warning; download and completion are disabled until regenerated.

The Social POST endpoint independently checks the selected image and confirmation. `complete_social_announcement` locks the job row and rechecks the latest image snapshot and existing document/distribution prerequisites before updating Social status. This prevents edits between the initial API read and the completion write from accepting an outdated image. Already downloaded or externally posted images cannot be recalled by the application.

## Verification

- `npm run test:social-image`: real Sharp rendering, deterministic output, Thai dates, wrapping, invalid input and snapshot changes. Produces visual fixtures under `.tmp/social-image/`.
- `npm run test:social-image:api`: real route handlers with mocked Supabase/storage I/O, missing/invalid uploads, source/history separation, stale downloads/completion, confirmation and failed-write cleanup.
- `npm run build`, then `npm run start -- --port 3100` in another terminal, then `npm run test:social-image:ui`: desktop/mobile browser flows using fixtures for all backend calls. Run the rendering test first to create the PNG fixture. Uses installed Edge on Windows, or Playwright Chromium elsewhere (`npx playwright install chromium`); `PLAYWRIGHT_CHANNEL` can override the browser.
- `npx tsc --noEmit`, `npm run lint`.

The browser tests and route tests do not contact production services. The migration and live Supabase storage/RPC integration still require deployment verification.

## Files changed

- `src/components/SocialPostPreviewModal.tsx`
- `src/app/api/jobs/social-post/route.ts`
- `src/app/api/jobs/[id]/social-image/route.ts`
- `src/lib/socialPost.ts`
- `src/lib/socialImage.ts`, `socialImageRenderer.ts`, `socialImageServer.ts`, `socialImage.test.ts`
- `sql/029_social_announcement_images.sql`
- `assets/fonts/NotoSansThai.ttf`, `assets/fonts/OFL.txt` (Google Fonts Noto Sans Thai, SIL Open Font License)
- `scripts/social-image-api.test.cjs`
- `tests/social/announcement.spec.ts`, `playwright.social.config.ts`
- `next.config.mjs`, `package.json`, `package-lock.json`, `.gitignore`
- This deployment guide.

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

The preview and export both call `renderSocialImage`: the same SVG background, Sharp/Pango text layers, bundled Noto Sans Thai font, text fitting, and map normalization/cropping. The canvas is 1080 × 1350 (4:5), with area on the first information row and date/time below. Fit keeps the entire map against a navy background; fill supports pan/zoom.

All announcement text uses the project's Noto Sans Thai variable font. `assets/fonts/SocialNotoSansThai.ttf` is generated from the existing `assets/fonts/NotoSansThai.ttf` with `python scripts/build-social-font.py`. Only the family name changes to the private `KB Outage Thai`; the glyphs and 100–900 weight axis remain identical. Sharp registers this bundled file through `text.fontfile`, and every Pango text span explicitly requests the private family. The renderer checks the file's SHA-256 before drawing so a missing or altered asset produces a clear error rather than an OS font fallback. Next output tracing includes `assets/fonts/*` for the image route. The app's `next/font` CSS and the unused `SocialNotoThai` browser declaration do not draw announcement text; the browser preview displays the server PNG itself.

`POST /api/jobs/{id}/social-image?preview=1` accepts the same multipart map and map_view as generation (or reuses the saved source), returns the actual PNG with no-store caching, and never uploads images or inserts metadata. The browser displays this PNG directly; it has no separate text layout or font sizing. Preview requests are debounced and aborted on changes/unmount. Pending or failed requests show an explicit status instead of presenting an older image as the current preview. This requires a server round trip when framing changes.

`socialImageLayout.ts` holds canvas/section bounds, colors, and text positions, widths, fit sizes and height budgets. Decorative geometry and text shaping exist only in `socialImageRenderer.ts`. Pango uses word/character wrapping and preserves English hyphenated tokens when possible. Names that cannot fit are rejected instead of clipped. Browser font loading cannot alter announcement pixels.

The private `social-announcements` bucket stores:

- `{job_id}/source/{uuid}.png`: normalized source map; never overwritten.
- `{job_id}/generated/{uuid}.png`: final announcement; never overwrites a source or earlier generation.

`social_announcement_images` stores paths, generation timestamp and the source-data snapshot for each generation. Regeneration reuses the previous source unless a new map was selected. Failed metadata writes clean up only the newly uploaded objects. Saved source/generated images use one-hour signed URLs, refreshed while the modal is open; downloads pass through a server endpoint that checks freshness again.

## Freshness and completion

Both text and image use `outage_date`, `doc_time_start`, `doc_time_end`, and `doc_area_title`. The snapshot also includes `doc_area_detail`, `doc_purpose`, `map_link`, and `equipment_code` so changes to the other announcement information invalidate the review too. No additional editable date/time fields or stored stale flags exist. Saved Social text is retained as a record, but previews are generated from the current job.

The modal fetches current job and image data when opened, on focus and every five seconds. Parent job changes also invalidate the review. A changed snapshot, changed image, or newly selected source clears confirmation. Failed refreshes disable completion. Stale images remain visible with a red warning; download and completion are disabled until regenerated.

The Social POST endpoint independently checks the selected image and confirmation. `complete_social_announcement` locks the job row and rechecks the latest image snapshot and existing document/distribution prerequisites before updating Social status. This prevents edits between the initial API read and the completion write from accepting an outdated image. Already downloaded or externally posted images cannot be recalled by the application.

## Verification

- `npm run test:social-image`: real Sharp rendering, deterministic output, Thai dates, wrapping, invalid input and snapshot changes. Produces visual fixtures under `.tmp/social-image/`.
- The font sample at `.tmp/social-image/font-consistency-25-sep.png` includes the approved headline, supporting text, labels, `ซอยนครธรรม`, and 25 September 09:00–11:00. The font check rejects a missing or altered bundled file.
- `npm run test:social-image:api`: real route handlers with mocked Supabase/storage I/O, missing/invalid uploads, source/history separation, stale downloads/completion, confirmation and failed-write cleanup. Also compares preview and download bytes for short, medium, long, mixed Thai/English and explicit three-line names in fit and panned/zoomed fill modes, including saved-source previews with no persistence. Side-by-side PNGs are written to `.tmp/social-parity/` (preview left, download right).
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

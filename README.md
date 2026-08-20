# Krabi Outage Tracker

Next.js (App Router) + Tailwind + TypeScript dashboard for tracking planned outage jobs backed by Supabase Postgres.

## File tree

```
.
├── .env.example
├── README.md
├── next-env.d.ts
├── next.config.mjs
├── package.json
├── postcss.config.js
├── sql
│   └── 001_init.sql
├── src
│   ├── app
│   │   ├── globals.css
│   │   ├── job
│   │   │   └── [id]
│   │   │       └── page.tsx
│   │   ├── layout.tsx
│   │   ├── new
│   │   │   └── page.tsx
│   │   └── page.tsx
│   └── lib
│       ├── dateUtils.ts
│       ├── jobsRepo.ts
│       └── supabaseClient.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Setup

1. Create a Supabase project.
2. Run the SQL in `sql/001_init.sql` using the Supabase SQL editor.
3. Run the SQL in `sql/002_nakhon_and_doc.sql` to add the นคร + เอกสาร workflow fields.
4. Run the SQL in `sql/003_doc_fields.sql` to add Google Doc generation fields.
5. Run the SQL in `sql/004_social_post.sql` to add the social post workflow fields.
6. Run the remaining numbered migrations in `sql/` in order, including `sql/018_document_workflow.sql` for physical document receipt/delivery tracking and `sql/019_gis_issues_noauth_rls.sql` for GIS Issues access in the no-login application. The migrations are idempotent and preserve existing records.
7. Copy `.env.example` to `.env.local` and set the Supabase URL + anon key.
8. Configure Google Docs integration:
   - Create a Google Cloud project and enable the Google Drive API + Google Docs API.
   - Create a Service Account and download its JSON key.
   - Share the Google Doc template with the Service Account email.
   - Add the Google env vars from `.env.example` (service account email, private key, template ID, and optional folder ID).
9. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

## DOCX Template Setup

1. Create the file locally at `templates/outage_template.docx` (this file is **not** committed to the repo).
2. Open Microsoft Word (or LibreOffice) and design the layout:
   - Use A4 page size.
   - Set margins as needed for your organization.
   - Insert logos/headers/footers as required.
3. Put the placeholders exactly as shown below (copy/paste them into the template).
4. Place a placeholder image named `qr_placeholder.png` at the QR position (ensure it lands in `word/media/qr_placeholder.png` inside the DOCX zip).
5. Test locally:
   - `npm run dev`
   - Call `POST /api/docs/create` with JSON like:
     ```json
     {
       "jobId": "JOB_ID",
       "payload": {
         "doc_issue_date": "2024-08-01",
         "doc_purpose": "แจ้งดับไฟเพื่อปรับปรุงระบบ",
         "doc_area_title": "เขตเมืองกระบี่",
         "doc_time_start": "09:00",
         "doc_time_end": "12:00",
         "doc_area_detail": "รายละเอียดพื้นที่ดับไฟ",
         "map_link": "https://maps.example.com"
       }
     }
     ```
6. Notes:
   - If QR insertion fails, the system falls back to inserting the map link text.
   - Do not rename placeholders (they must match exactly).

### DOCX Template Inspector

When docxtemplater throws a `multi_error`, run the inspector to locate broken tags:

```bash
npm run inspect:docx
```

To inspect a different template path:

```bash
npm run inspect:docx -- path/to/template.docx
```

Common fixes:

- **Split runs**: retype the placeholder in one go so `{{DOC_ISSUE_DATE}}` is not split across multiple `<w:t>` nodes or formatting runs.
- **Textboxes/shapes**: move placeholders out of textboxes/WordArt into the main document body, header, or footer.
- **Headers/footers**: check `word/header*.xml` and `word/footer*.xml` if the placeholder lives outside the main body.

Placeholders list:

- `{{DOC_ISSUE_DATE}}`
- `{{DOC_PURPOSE}}`
- `{{DOC_AREA_TITLE}}`
- `{{DOC_TIME_START}}`
- `{{DOC_TIME_END}}`
- `{{DOC_AREA_DETAIL}}`
- `{{MAP_LINK}}`
- `{{OUTAGE_DATE}}`
- `{{EQUIPMENT_CODE}}`

## Social Post Flow

The default flow is `Draft → Document ready → Received document → Document delivered → Social posted → Notice scheduled`. Receipt and delivery timestamps/operator names are stored in `outage_jobs`, so they survive refreshes and server restarts. If Social must be posted before physical delivery for a business exception, the preview modal shows a warning and requires explicit confirmation. Existing jobs already at Social/Notice remain at their completed stage even when the new nullable document fields are empty.

## Reminder Configuration

- ระบบ reminder ใช้ค่าคงที่จาก code (`src/lib/reminderConfig.ts`) โดยตรง
- ไม่มีหน้า Reminder Settings และไม่มี endpoint สำหรับ save/preview/debug settings
- ค่ามาตรฐาน:
  - timezone = `Asia/Bangkok`
  - allowSameDayReminder = `true`
  - sameDayRunDisplayTime = `09:30`
- ระบบ planned outage reminder ปัจจุบันเหลือเฉพาะ same-day reminder (`/api/jobs/reminder/same-day/run`)
- production trigger strategy ของ same-day reminder เป็น **external scheduler first**
- same-day reminder ไม่ใช้ Vercel Cron เป็น production path อีกต่อไป
- endpoint ต้องส่ง header `x-reminder-secret` ให้ตรงกับ `REMINDER_JOB_SECRET`

รายละเอียด runbook ดูที่ `docs/external-scheduler-same-day-reminder.md` และสถานะ Vercel Cron ดูที่ `docs/vercel-cron-reminder.md`

## Notes

- No authentication or login UI is included yet (open access).
- Data is stored in the `outage_jobs` table and is shared across devices in the same Supabase project.
- Dashboard cards now include an in-card workflow to record นคร notifications and request document creation.

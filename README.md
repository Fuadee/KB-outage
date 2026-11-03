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
6. Run the remaining numbered migrations in `sql/` in order, including `sql/018_document_workflow.sql` for physical document receipt/delivery tracking, `sql/019_gis_issues_noauth_rls.sql` for GIS Issues access in the no-login application, `sql/020_gis_issue_delete.sql` for parent deletion with activity cascade, `sql/021_outage_job_responsible_unit.sql` for responsible-unit metadata, `sql/022_outage_job_customer_count.sql` for nullable affected-customer counts, `sql/026_notice_completion_provenance.sql` for explicit notice-completion provenance, `sql/027_outage_job_work_supervisor_name.sql` for the legacy supervisor-name fallback, and `sql/028_people_master.sql` for the personnel master and nullable job references. The migrations are idempotent and preserve existing records except when a user explicitly deletes a GIS Issue.
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

Multi-period outages use migration `sql/033_multi_period_outage.sql`. Apply it before deploying this version. See [data compatibility, rollout, changed files, and test results](docs/multi-period-outage.md). The existing Word template is retained; `{{DOC_TIME_RANGES}}` is supported and the original start/end placeholder pair is adapted automatically.

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

## Document Receipt Confirmation

ขั้นตอนรับเอกสารใช้ Popup “ยืนยันการรับเอกสาร” เพื่อยืนยันว่า “ได้รับเอกสารและจัดเข้าแฟ้มงานเรียบร้อยแล้ว” ไม่ต้องกรอกชื่อหรือวันเวลา ส่งคำขอเพียง `{ action: "receive" }` ไปยัง API เดิม

- API บันทึกเวลาปัจจุบันจาก Server ใน `document_received_at` และใช้ `document_received_by=NULL` สำหรับรายการใหม่ โดยไม่ใช้ชื่อหรือเวลาจาก Client
- รายการที่รับแล้วจะคืนข้อมูลเดิมโดยไม่เขียนทับเวลา/ชื่อ รวมถึงคำขอที่เข้าพร้อมกัน ใช้เงื่อนไข Update เฉพาะงานที่ยังไม่รับเอกสาร เอกสารพร้อม และยังไม่ปิดงาน หน้าเว็บปิดปุ่มระหว่างบันทึกและเปลี่ยนสถานะเมื่อ Server ตอบสำเร็จเท่านั้น
- แสดง “รับเอกสารและจัดเข้าแฟ้มแล้ว” พร้อมเวลา ไม่มีช่องชื่อว่าง ข้อมูลเก่ายังแสดงชื่อผู้รับและเวลาเดิมแบบอ่านอย่างเดียว
- หากยืนยันผิด ใช้ระบบย้อน Workflow เดิม ประวัติเดิมเก็บเวลาและชื่อก่อนย้อนใน `before_state` และเปิดอ่านได้จาก “ข้อมูลรับเอกสารก่อนย้อน” ในรายละเอียดงาน ไม่มีการแก้ข้อมูลย้อนหลังอัตโนมัติ
- **ไม่มี SQL Migration ใหม่สำหรับการเปลี่ยนขั้นตอนรับเอกสารนี้** ใช้ Column และระบบ Audit เดิม ส่วน Migration 031/032 เป็นของการปรับผู้ส่งเอกสารก่อนหน้า
- ทดสอบด้วย `npm run test:document-receipt` และ `npm run test:document-receipt:ui` (แอปต้องรัน Port 3100) ชุด SQL เดิม `npm run test:document-delivery:sql` เพิ่มการตรวจย้อนรับเอกสารและรักษา Audit แล้ว

## Actual Notice Distributor

ช่อง “ผู้แจกจริง” ใช้ PersonSelect กับ `/api/people?active=true` จากทุกสังกัดเหมือนกันทุกประเภทงาน แสดงชื่อและสังกัด ไม่เลือกบุคลากรให้อัตโนมัติ และไม่รับชื่อที่พิมพ์โดยไม่ได้เลือกรายการ

- API บันทึก `notice_by_person_id` และ `notice_by` ตามโครงสร้างเดิม ผู้แจกที่เลือกใหม่ต้อง Active แต่ไม่ต้องอยู่สังกัดเดียวกับงาน ไม่แก้ `responsible_unit` ตามผู้แจก
- รายการเดิมที่มีชื่อข้อความยังคงไว้ได้ และบุคลากรเดิมที่ปิดใช้งานหรือย้ายสังกัดยังบันทึกซ้ำได้ โดยไม่เขียนทับชื่อที่บันทึกไว้เพียงเพราะแก้ข้อมูลบุคลากร
- ทุกหน้าบันทึกผลการแจกแสดงเฉพาะข้อมูลแจกจริงและสังกัดผู้แจก ไม่มี LINE Preview หน้ากำหนดการของแผนกปฏิบัติการยังบันทึกและคัดลอก LINE ได้ และระบบแจ้งเตือนใช้ Generator เดิม
- เงื่อนไข Workflow และหน้าที่ผู้รับมอบหมายเดิมคงไว้ รวมถึงงานปฏิบัติการที่ต้องมีกำหนดการก่อนยืนยันผล และผู้รับมอบหมาย กะ 1 ช่องเลือกบุคลากรอื่นไม่เปลี่ยนเงื่อนไข
- **ไม่มี SQL Migration ใหม่** ใช้ Schema บุคลากรและการแจกหนังสือเดิม

## Document Delivery Sender

ก่อน Deploy ให้ Run `sql/032_document_delivery_unknown_audit.sql` ใน Supabase SQL Editor ด้วยตนเอง โดยฐานข้อมูลต้องผ่าน Migration เดิมถึง `030` แล้ว Migration 032 รองรับทั้งกรณีที่รัน `031_document_delivery_person.sql` แล้วและยังไม่ได้รัน เพราะเพิ่ม Column/FK/Index ที่จำเป็นจาก 031 แบบตรวจสอบก่อนสร้าง จึงไม่ต้องรัน 031 ซ้ำ

- ช่องผู้ส่งเลือกได้ระหว่างบุคลากร Active ทุกสังกัดจาก `/people` กับ “ไม่ทราบชื่อผู้ส่งเอกสาร”
- UNKNOWN ต้องมีเหตุผล (ไม่เกิน 1,000 ตัวอักษร) และติ๊กยืนยันว่าเอกสารถูกส่งจริงทุกครั้ง API ตรวจสอบเงื่อนไขด้วย รวมถึงห้ามเวลาส่งในอนาคต ห้ามข้ามการรับเอกสาร และห้ามแก้งานที่ปิดแล้ว
- UNKNOWN เก็บสถานะแยกใน `document_delivery_sender_status` เหตุผลใน `document_delivery_unknown_reason` และเวลายืนยันการส่งจริงใน `document_delivery_confirmed_at` โดยชื่อ สังกัด และ person_id เป็น NULL ไม่มีการสร้างบุคลากรปลอมหรือใช้ข้อความ UNKNOWN เป็นชื่อบุคลากร
- การเปลี่ยน UNKNOWN เป็นบุคลากรจริง หรือแก้บุคลากรที่เลือกผิดเป็น UNKNOWN ทำได้ผ่าน Popup เดิม ประวัติก่อน–หลังและเวลาแก้ไขเก็บใน `outage_job_document_delivery_audit` ด้วย Database Trigger ใน Transaction เดียวกับการแก้ไข หากเขียนประวัติไม่ได้ การแก้ไขจะไม่สำเร็จด้วย
- ประวัติไม่มีตัวตนผู้แก้ไขที่ยืนยันแล้ว (`actor_authenticated=false`) การยืนยันว่าส่งจริงไม่ใช่การยืนยันตัวตน เปิดดู 50 รายการล่าสุดได้ใน Popup แก้ไขการส่งเอกสาร ประวัติเริ่มตั้งแต่ติดตั้ง Migration ไม่มีการสร้างประวัติย้อนหลัง
- Migration ไม่แก้ข้อมูลเดิมหรือจับคู่ชื่ออัตโนมัติ สถานะ NULL ของข้อมูลเก่าคงเดิม ชื่อ/สังกัดที่บันทึกไว้ไม่เปลี่ยนตามข้อมูลบุคลากร การย้อน Workflow เดิมจะล้างข้อมูลผู้ส่งรวมถึง UNKNOWN และมีประวัติการเปลี่ยนแปลง
- ทดสอบ Logic/API แบบแยกจากฐานข้อมูลจริงด้วย `npm run test:document-delivery`
- หลัง Build ให้เปิดแอปที่ Port 3100 แล้ว Run `npm run test:document-delivery:ui` เพื่อทดสอบ Desktop/Mobile โดยจำลอง API และไม่เขียนฐานข้อมูลจริง
- ทดสอบ SQL/Trigger/Constraint ใน PostgreSQL ที่แยกจากฐานข้อมูลจริง: ติดตั้ง Runtime ชั่วคราวด้วย `npm install --prefix .tmp/delivery-sql-tests --no-save --no-package-lock @electric-sql/pglite` แล้ว Run `npm run test:document-delivery:sql` ครอบคลุมมี/ไม่มี 031, Run ซ้ำ, รักษาข้อมูลเก่า, Audit ก่อน–หลัง, ย้อน Workflow และยกเลิกการแก้ไขเมื่อ Audit ล้มเหลว

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

- KB-outage intentionally has no user login requirement. Operational pages and APIs work without a user account, session, or authentication feature flag. Old login bookmarks redirect to the dashboard.
- Supabase database/storage credentials remain required. The browser uses anonymous access without loading or refreshing saved sessions; privileged credentials stay on the server. Delivery-link tokens and the scheduler secret remain required for their respective external flows.
- Operator names for document receipt/delivery and notice completion remain operational data. New jobs keep nullable user attribution; closing a job does not overwrite historical identity values. GIS uses an unnamed-operator label when no identity is available.
- Auth removal does not change SQL policies or historical data. Existing numbered migrations must already be applied; do not disable RLS to troubleshoot a database configuration error.
- Run `npm run test:no-login` for isolated route-handler regression tests (no real database/storage writes), and `npm run test:no-login:routing -- --base-url=http://localhost:3000` against a running production build for anonymous navigation and cookie-independence checks.
- Data is stored in the `outage_jobs` table and is shared across devices in the same Supabase project.
- Dashboard cards now include an in-card workflow to record นคร notifications and request document creation.

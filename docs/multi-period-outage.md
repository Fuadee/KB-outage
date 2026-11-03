# รองรับการดับไฟหลายช่วงเวลาในงานเดียว

หนึ่งงานยังมีหนังสือแจ้งดับไฟหนึ่งฉบับ โดยบันทึกและแสดงทุกช่วงเวลาที่ดับไฟแยกจากกัน เช่น 09.00–10.00 น. และ 16.00–17.00 น. ไม่มีการแสดงรวมเป็น 09.00–17.00 น.

## สาเหตุและความสัมพันธ์ของระบบเดิม

Popup สร้างเอกสารอยู่ใน `src/app/(app)/jobs/page.tsx` เดิมรับเวลาเพียงคู่เดียวและส่งไป `POST /api/docs/create` เพื่อบันทึก `public.outage_jobs.doc_time_start` และ `doc_time_end` ซึ่งเป็นคอลัมน์ text จาก migration 003

Word สร้างด้วย Docxtemplater และ PizZip จาก `templates/outage_template.docx` โดยใช้ placeholder `doc_outage_date_full_th`, `DOC_TIME_START` และ `DOC_TIME_END` มี generator สองชุดคือ TypeScript ที่แอปใช้และ JavaScript ที่สคริปต์ทดสอบใช้ ซึ่งเคยมีพฤติกรรมต่างกัน

Social อ่านเวลาจากงานผ่าน `socialPost.ts`, `socialImageRenderer.ts` และ modal ตัวอย่างภาพ ส่วน LINE อ่านผ่าน webhook สรุปงานวันนี้, ข้อความแจ้งแจกหนังสือ และบริการ Same Day Reminder ทั้ง Jobs และ Calendar แสดงเวลาคู่นี้เช่นกัน

Calendar สรุปจำนวนตามแถวงานและวันดับไฟ ส่วน Reminder เลือกวันจาก `outage_date` และวันแจกหนังสือ ไม่ได้กำหนดการส่งจากชั่วโมงเริ่มดับไฟ จึงไม่ต้องเพิ่มกิจกรรมหรือส่งเตือนซ้ำตามจำนวนช่วง

## Architecture และ Data Model

เพิ่ม `outage_jobs.outage_periods` ชนิด nullable JSONB ในแถวงานเดิม:

```json
[
  { "start_time": "09:00", "end_time": "10:00" },
  { "start_time": "16:00", "end_time": "17:00" }
]
```

รายการนี้เป็น Source of Truth เมื่อไม่เป็น NULL ตำแหน่งใน array เป็นลำดับช่วงเวลา โดยเรียงเวลาเริ่มจากน้อยไปมาก ไม่มีการเพิ่มงานหรือหนังสือแยกตามช่วง

เลือก JSONB เพื่อให้บันทึกทุกช่วงพร้อมข้อมูลเอกสารใน UPDATE เดียว ภายใต้ transaction ของ PostgreSQL ลดการเปลี่ยนโครงสร้าง API และการอ่านข้อมูลเดิม

- ถ้าเป็น NULL ให้อ่านเวลาคู่เดิมเป็นหนึ่งช่วง ไม่มีการ backfill หรือเขียนทับแถวเก่าอัตโนมัติ
- Database trigger ตรวจรูปแบบ HH:mm, เวลาเริ่มน้อยกว่าสิ้นสุด, อย่างน้อยหนึ่งช่วง และช่วงซ้อนกัน ทั้ง UI และ API ตรวจด้วย utility กลางด้วย
- เวลา 10:00 ที่ต่อจากช่วงสิ้นสุด 10:00 อนุญาตได้ แต่ช่วงซ้อนกันไม่อนุญาต ไม่มีการรวมช่วงอัตโนมัติ
- ไม่รองรับข้ามเที่ยงคืน: 23:00–01:00 และเวลา 24:00 ถูกปฏิเสธพร้อมข้อความชัดเจน
- `doc_time_start/doc_time_end` คงอยู่และสะท้อน **ช่วงแรกทั้งคู่** ไม่ใช่เริ่มช่วงแรกถึงสิ้นสุดช่วงสุดท้าย
- Client รุ่นเก่ายังแก้งานหนึ่งช่วงได้ โดย trigger ปรับ array ให้ตรงกัน ส่วนการแก้เวลาคู่เดิมในงานหลายช่วงจะถูกปฏิเสธ เพื่อป้องกันการลบช่วงหลังโดยไม่ตั้งใจ
- API ป้องกันการเขียนทับข้อมูลที่เปลี่ยนระหว่างอ่านกับบันทึกด้วย `updated_at` และตรวจวันกับช่วงเวลาก่อนยืนยันผลสร้าง Word
- Snapshot ภาพ Social รวมทุกช่วงและตรวจซ้ำใน RPC ที่ล็อกแถวงาน การแก้ช่วงหลังทำให้ภาพเก่าใช้ยืนยันโพสต์ไม่ได้
- Snapshot ของงานหนึ่งช่วงคงรูปแบบเดิม เพื่อให้ภาพเก่าของงานหนึ่งช่วงยังใช้งานได้

## UI และ Word

Popup เดิมเพิ่มและลบช่วงได้ โดยเริ่มต้นหนึ่งช่วงและลบจนเหลือศูนย์ไม่ได้ ระหว่างพิมพ์ไม่ย้ายแถวที่กำลังกรอก เมื่อออกจากกลุ่มเวลาที่กรอกครบหรือบันทึกจะเรียงให้อัตโนมัติ เปิดงานเดิมแล้วเห็นช่วงที่เคยบันทึกทั้งหมด งานเก่าที่มี URL เอกสารมีปุ่มแก้ไขข้อมูลเอกสารแยกจากปุ่มเปิดเอกสารเดิม

Template binary ไม่ถูกแก้ ตัว adapter เปลี่ยนเฉพาะ placeholder เวลาภายในหน่วยความจำเป็น `DOC_TIME_RANGES` รองรับ placeholder ที่ Word แบ่งเป็นหลาย run และคงรูปแบบตัวอักษรเดิม หาก template อื่นไม่มีช่องที่รองรับหลายช่วง จะหยุดพร้อมแจ้งข้อผิดพลาดแทนการสร้างเอกสารที่แสดงไม่ครบ

กรณีตั้งแต่สามช่วงขึ้นไป ยุบเฉพาะย่อหน้าว่างที่ติดกับเวลาและเว้นระยะหลังเวลาเล็กน้อย เพื่อรองรับข้อความหลายบรรทัด ไม่มีการเปลี่ยนฟอนต์ ระยะขอบ หัวกระดาษ โลโก้ ลายเซ็น หรือ footer

การเปิดด้วย Microsoft Word พบปัญหาเดิมใน generator TypeScript: เพิ่มชนิดไฟล์ `png` ซ้ำกับ `PNG` ใน template ทำให้ Word ปฏิเสธไฟล์ แก้การตรวจแบบไม่แยกตัวพิมพ์ใหญ่เล็ก และเปลี่ยน JavaScript entry point ให้ใช้ generator เดียวกับแอป จึงตรวจไฟล์จริงจากโค้ดชุดเดียวกัน

## ไฟล์ที่เปลี่ยน

| ส่วน | ไฟล์ |
| --- | --- |
| Migration | `sql/033_multi_period_outage.sql` |
| Shared utility และการทดสอบ | `src/lib/outagePeriods.ts`, `src/lib/outagePeriods.test.ts` |
| Popup และช่องกรอก | `src/app/(app)/jobs/page.tsx`, `src/components/OutagePeriodsInput.tsx` |
| โหลดข้อมูลงาน | `src/lib/jobsRepo.ts` |
| API เอกสาร | `src/app/api/docs/create/route.ts` |
| Word generator และ adapter | `src/lib/docs/outage-docx-template.ts`, `src/lib/docs/outage-docx-template.js`, `src/lib/docs/outage-template-periods.ts` |
| Jobs และรายละเอียดงาน | `src/components/job/JobCard.tsx`, `src/app/job/[id]/page.tsx` |
| Calendar และ API รายวัน | `src/app/(app)/calendar/page.tsx`, `src/app/api/jobs/route.ts` |
| LINE และ Reminder | `src/app/api/line/webhook/route.ts`, `src/lib/outageNoticeMessage.ts`, `src/lib/outageNoticeMessage.test.ts`, `src/lib/reminder.ts`, `src/lib/sameDayReminderService.ts` |
| Social | `src/lib/socialPost.ts`, `src/lib/socialImage.ts`, `src/lib/socialImageLayout.ts`, `src/lib/socialImageRenderer.ts`, `src/components/SocialImageLivePreview.tsx`, `src/components/SocialPostPreviewModal.tsx` |
| API และ SQL tests | `scripts/multi-period-api.test.cjs`, `scripts/multi-period-migration.test.cjs` |
| Browser tests | `tests/social/multi-period.spec.ts`, `tests/social/announcement.spec.ts` |
| คำสั่งและเอกสาร | `package.json`, `README.md`, `docs/multi-period-outage.md` |

การแก้ assertion ใน Social browser test ให้ไปดูงานหลังโพสต์ใน `/jobs/ready` เป็นการให้ทดสอบตรงกับ workflow ที่ระบบมีอยู่แล้ว ไม่ได้เปลี่ยนกฎการย้ายคิวของแอป

## Migration และวิธี Run

ยังไม่ได้รัน migration กับฐานข้อมูล Production

1. สำรองฐานข้อมูลตามกระบวนการเดิม และตรวจว่า migrations 001–032 ถูกติดตั้งครบ โดยเฉพาะตาราง Social และ RPC จาก 029–030
2. ทดสอบ `sql/033_multi_period_outage.sql` ในฐานข้อมูล Staging ก่อน ผ่าน Supabase SQL Editor หรือ `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/033_multi_period_outage.sql`
3. ตรวจว่ามีคอลัมน์ `outage_periods` และ trigger `outage_jobs_sync_periods` และ PostgREST เห็น schema ใหม่ ไฟล์ migration ส่งคำสั่ง reload schema ให้แล้ว
4. Deploy แอปหลัง migration สำเร็จ แล้วให้ผู้ใช้งานเปิดหน้าล่าสุดก่อนแก้งานหลายช่วง
5. ทดสอบสร้าง แก้ไข เปิดซ้ำ และ Export Word จาก Staging รวมถึง Social และ Calendar ก่อนเปิดใช้งานจริง

Migration มี BEGIN/COMMIT และรันซ้ำได้ ไม่มี DELETE ไม่มีการแก้เวลาของแถวประวัติ และไม่สร้างงานเพิ่ม ไม่ต้องมีขั้นตอนย้ายข้อมูลเดิม

หาก rollback แอป ให้คงคอลัมน์ JSONB และ trigger ไว้เพื่อรักษาข้อมูลหลายช่วง Client เก่าจะถูกปฏิเสธเมื่อพยายามแก้เวลางานหลายช่วง ห้ามลบ array หรือแปลงเป็นเวลาครอบคลุมช่วงแรกถึงช่วงสุดท้าย

## ผลการทดสอบ

- Unit และ regression ใน `src/lib/*.test.ts`: 201 tests ผ่าน ครอบคลุมวันที่, workflow, reminder, การแจกหนังสือ, Calendar, switching integration, legacy และ Social
- API/SQL regression: 37 tests ผ่าน รวม document API จริง, migration 033 บน PostgreSQL แยกด้วย PGlite, Social API, delivery API และ no-login
- Browser: 14 tests ผ่านบน production build ทั้งเดสก์ท็อปและมือถือ ครอบคลุมเพิ่มช่วง เรียงเวลา ป้องกันซ้อนกันและข้ามคืน บันทึก ดาวน์โหลด เปิดซ้ำ ลบช่วง คงเหลือหนึ่งช่วง งานเอกสาร URL เดิม Jobs, Calendar และ Social เดิม
- Word: สร้างไฟล์ .docx จริงสำหรับหนึ่ง สอง และสามช่วง ตรวจทุกช่วงใน package พร้อม geometry, styles, footer และรูปเดิม จากนั้นเปิดใน Microsoft Word แบบ read-only ส่งออก PDF และตรวจภาพทุกหน้า ตัวอย่างทั้งสามเป็นเอกสารหนึ่งหน้า ไม่มีหน้าว่างหรือข้อความถูกตัด
- Social: สร้าง PNG จริงสำหรับหนึ่ง สอง และสามช่วง ตรวจภาพแล้วแสดงเวลาครบ คงขนาด 1080×1350 สำหรับตัวอย่างเหล่านี้ และใช้ geometry เดียวกันระหว่าง preview กับไฟล์ส่งออก
- ตรวจ TypeScript และ production build ด้วย `npx tsc --noEmit` และ `npm run build`

คำสั่งทดสอบเฉพาะฟีเจอร์:

```powershell
npm run test:outage-periods
# ติดตั้ง PostgreSQL test runtime เฉพาะในโฟลเดอร์ชั่วคราว ไม่เปลี่ยน dependencies แอป
npm install --prefix .tmp/pg --no-save --no-package-lock @electric-sql/pglite
npm run test:outage-periods:sql
# เปิดแอปทดสอบที่ localhost:3100 ก่อน คำขอ backend ใน browser suite ถูก mock ทั้งหมด
npm run test:outage-periods:ui -- --workers=1
```

สคริปต์ทดสอบที่โหลด TypeScript โดยตรงต้องใช้ Node 22.18+ หรือ Node 24 ไฟล์ Word และภาพที่ใช้ตรวจอยู่ใน `.tmp/multi-period/` ซึ่งไม่รวมในการ Deploy และไม่ได้เขียนข้อมูลจริงระหว่างทดสอบ

## ตัวอย่างข้อความ Word

1. วันพฤหัสบดีที่ 12 พฤศจิกายน 2569 ตั้งแต่เวลา 09.00–16.00 น.
2. วันพฤหัสบดีที่ 12 พฤศจิกายน 2569 ตั้งแต่เวลา 09.00–10.00 น. และ 16.00–17.00 น.
3. วันพฤหัสบดีที่ 12 พฤศจิกายน 2569 ตั้งแต่เวลา 09.00–10.00 น., 12.00–13.00 น. และ 16.00–17.00 น.

## ผลกระทบและขั้นตอนก่อน Deploy

Login, authentication, switching, สถานะงาน, เงื่อนไขปิดงาน, กำหนดวันแจ้งเตือน และ workflow แจกหนังสือคงเดิม Calendar ยังคงนับหนึ่งงานหนึ่งรายการ ข้อความ LINE มีรายละเอียดเวลาดับไฟเพิ่มขึ้น โดยไม่เพิ่มจำนวนครั้งส่งหรือเปลี่ยนเวลาส่ง

ภาพ Social ของหลายช่วงขยายพื้นที่เวลาโดยลดส่วนแผนที่เท่าที่จำเป็น ไม่ลดขนาดตัวอักษรจนอ่านยาก สำหรับจำนวนช่วงมากกว่า 9 ช่วง ภาพเพิ่มความสูงเพื่อเก็บข้อมูลให้ครบ อัตราส่วนจึงอาจต่างจาก 4:5 ต้องตรวจข้อกำหนดแพลตฟอร์มที่นำไปโพสต์ ตัวอย่างหนึ่งถึงสามช่วงคง 4:5

เอกสารที่มีรายละเอียดพื้นที่หรือจำนวนช่วงยาวมากอาจเพิ่มจำนวนหน้าตามเนื้อหา ควรตรวจตัวอย่างจริงของหน่วยงานใน Staging และตรวจอีกครั้งหากเปลี่ยน template หรือชุดฟอนต์บนเครื่องเปิด Word

ต้องติดตั้ง migration ก่อนใช้แอปรุ่นนี้ โค้ดที่อ่าน `outage_periods` ต้องอาศัย schema ใหม่ และ client เก่าที่อ่านเฉพาะเวลาคู่เดิมจะเห็นช่วงแรกเท่านั้น จึงต้องใช้แอปรุ่นใหม่และโหลดหน้าใหม่ในการทำงานหลายช่วง ไม่มีการ Deploy หรือแก้ข้อมูล Production อัตโนมัติในงานนี้

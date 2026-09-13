import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeGoogleMapsUrl,
  normalizeGoogleMyMapsViewerUrl
} from "./mapUrl.ts";
import {
  buildOutageNoticeLineMessage,
  NOTICE_ASSIGNMENT_RESPONSIBLE,
  NOTICE_BOOK_PICKUP_LOCATION,
  OUTAGE_CALENDAR_URL
} from "./outageNoticeMessage.ts";

const completeJob = {
  outage_date: "2026-09-15",
  responsible_unit: "แผนกปฏิบัติการ",
  customer_count: 300,
  doc_purpose: "ข้อความสำรอง",
  doc_area_title: "อ่าวนางซอย 1, หน้าโรงเรียนอ่าวนาง, ซอยนาไทย",
  doc_area_detail: "ข้อความประกาศเต็มที่ห้ามนำมาต่อ",
  doc_time_start: "09:00",
  doc_time_end: "15:30",
  map_link:
    "https://www.google.com/maps/d/u/0/edit?mid=1yeB2eLe4K8-eXBMKpFu8Cm72WXxO9ic&usp=sharing"
};

const expectedMessage = [
  "📢 แจ้งงานแจกหนังสือดับไฟวันนี้",
  "",
  "📍 พื้นที่: อ่าวนางซอย 1, หน้าโรงเรียนอ่าวนาง, ซอยนาไทย และพื้นที่ใกล้เคียง",
  "📄 จำนวนหนังสือ: 300 ราย",
  "👷 ผู้ดำเนินการ: กะ 1",
  `📌 รับหนังสือ: ${NOTICE_BOOK_PICKUP_LOCATION}`,
  "🗺️ แผนที่: https://www.google.com/maps/d/u/0/viewer?mid=1yeB2eLe4K8-eXBMKpFu8Cm72WXxO9ic",
  "⚠️ หากข้อมูลพื้นที่ไม่ตรง กรุณาแจ้งกลับเพื่อแก้ไข",
  "",
  "🔎 ติดตามข้อมูลการดับไฟ",
  `📅 แผนดับไฟ: ${OUTAGE_CALENDAR_URL}`,
  "",
  "ขอบคุณครับ 🙏"
].join("\n");

test("builds the exact compact LINE message", () => {
  const message = buildOutageNoticeLineMessage(completeJob);

  assert.equal(message, expectedMessage);
  assert.doesNotMatch(message, /ข้อความประกาศเต็ม/);
  assert.doesNotMatch(message, /วันที่ไปแจก|วันและเวลาไฟดับ|ยังไม่ระบุ/);
  assert.doesNotMatch(message, /\[[^\]]+\]\(https?:\/\//);
});

test("does not duplicate the nearby-area suffix", () => {
  const message = buildOutageNoticeLineMessage({
    ...completeJob,
    doc_area_title: "บ้านคลองม่วง และพื้นที่ใกล้เคียง"
  });

  assert.equal(message.match(/และพื้นที่ใกล้เคียง/g)?.length, 1);

  const legacyWording = buildOutageNoticeLineMessage({
    ...completeJob,
    doc_area_title: "บ้านคลองม่วง และบริเวณพื้นที่ใกล้เคียง"
  });
  assert.doesNotMatch(
    legacyWording,
    /และบริเวณพื้นที่ใกล้เคียง และพื้นที่ใกล้เคียง/
  );
});

test("keeps the LINE assignment on shift 1 regardless of the actual distributor", () => {
  const jobWithActualDistributor = {
    ...completeJob,
    notice_by: "พี่บ่าว"
  };
  const message = buildOutageNoticeLineMessage(jobWithActualDistributor);

  assert.match(
    message,
    new RegExp(`ผู้ดำเนินการ: ${NOTICE_ASSIGNMENT_RESPONSIBLE}`)
  );
  assert.doesNotMatch(message, /พี่บ่าว/);
});

test("builds direct messages for construction and Ao Nang without shift 1 rules", () => {
  const construction = buildOutageNoticeLineMessage({
    ...completeJob,
    responsible_unit: "แผนกก่อสร้าง"
  });
  const aoNang = buildOutageNoticeLineMessage({
    ...completeJob,
    responsible_unit: "กฟส.อ่าวนาง"
  });

  assert.match(construction, /^📢 แจ้งดำเนินการแจกหนังสือดับไฟ/);
  assert.match(construction, /ผู้ดำเนินการ: แผนกก่อสร้าง/);
  assert.match(construction, /วันดับไฟ: 15 ก\.ย\. 2569/);
  assert.doesNotMatch(construction, /กะ 1|รับหนังสือ:/);
  assert.match(aoNang, /ผู้ดำเนินการ: อ่าวนาง/);
  assert.match(aoNang, /วันดับไฟ: 15 ก\.ย\. 2569/);
  assert.doesNotMatch(aoNang, /กะ 1|รับหนังสือ:/);
});

test("handles missing optional Job sources without forbidden wording", () => {
  const message = buildOutageNoticeLineMessage({
    ...completeJob,
    customer_count: null,
    map_link: null
  });

  assert.match(message, /ผู้ดำเนินการ: กะ 1/);
  assert.match(message, /จำนวนหนังสือ: ไม่ระบุ ราย/);
  assert.match(message, /แผนที่: ไม่มีข้อมูลแผนที่/);
  assert.doesNotMatch(message, /ยังไม่ระบุ/);
});

test("normalizes only Google My Maps links to a public viewer URL", () => {
  assert.equal(
    normalizeGoogleMyMapsViewerUrl(completeJob.map_link),
    "https://www.google.com/maps/d/u/0/viewer?mid=1yeB2eLe4K8-eXBMKpFu8Cm72WXxO9ic"
  );
  assert.equal(
    normalizeGoogleMyMapsViewerUrl("https://example.com/public-map?id=1"),
    "https://example.com/public-map?id=1"
  );
  assert.equal(
    normalizeGoogleMapsUrl("maps.app.goo.gl/example"),
    "https://maps.app.goo.gl/example"
  );
});

test("preview and both copy actions share the same builder output", () => {
  const modal = readFileSync(
    new URL("../components/NoticeScheduleModal.tsx", import.meta.url),
    "utf8"
  );
  const scheduleRoute = readFileSync(
    new URL("../app/api/jobs/notice-schedule/route.ts", import.meta.url),
    "utf8"
  );
  const completionRoute = readFileSync(
    new URL("../app/api/jobs/[id]/notice-completion/route.ts", import.meta.url),
    "utf8"
  );

  assert.equal(modal.match(/buildOutageNoticeLineMessage\(/g)?.length, 1);
  assert.match(modal, /navigator\.clipboard\.writeText\(previewText\)/);
  assert.match(modal, /ผลการแจกหนังสือจริง/);
  assert.match(modal, /completed_by_person_id: completedByPerson\?\.id \?\? null/);
  assert.doesNotMatch(modal, /responsibleMissing/);
  assert.equal(modal.match(/if \(!validateSchedule\(\)\) return;/g)?.length, 1);
  assert.match(scheduleRoute, /distributionWorkflow\.route !== "OPERATIONS"/);
  assert.match(scheduleRoute, /notice_status: "SCHEDULED"/);
  assert.doesNotMatch(scheduleRoute, /notice_by:/);
  assert.match(completionRoute, /notice_status: "COMPLETED"/);
  assert.match(completionRoute, /notice_by: distributorName/);
  assert.match(completionRoute, /notice_by_person_id: distributorPersonId/);
  assert.match(completionRoute, /findActivePersonForDepartment/);
  assert.match(completionRoute, /isDirectDistributionRoute/);
  assert.match(modal, /isOperationsFlow && !isCompleted/);
  assert.match(modal, /isDirectFlow/);
});

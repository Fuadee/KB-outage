import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import PizZip from "pizzip";
import sharp from "sharp";
import { formatOutagePeriods, formatThaiOutageDate, getOutagePeriods, normalizeOutagePeriods } from "./outagePeriods.ts";
import { generateOutageDocxBuffer } from "./docs/outage-docx-template.ts";
import { getSocialPostPreview } from "./socialPost.ts";
import { buildOutageNoticeLineMessage } from "./outageNoticeMessage.ts";
import { isSocialImageStale, socialImageSnapshot } from "./socialImage.ts";
import { renderSocialImage } from "./socialImageRenderer.ts";
import { formatSameDayReminderMessage } from "./reminder.ts";
import { prepareOutageTimePlaceholder } from "./docs/outage-template-periods.ts";

const periods = [
  { start_time: "09:00", end_time: "10:00" },
  { start_time: "12:00", end_time: "13:00" },
  { start_time: "16:00", end_time: "17:00" }
];
const job = { outage_date: "2026-11-12", equipment_code: "KBA01", doc_time_start: "09:00", doc_time_end: "10:00",
  doc_area_title: "พื้นที่กระบี่", doc_area_detail: "ชุมชนและพื้นที่ใกล้เคียง", doc_purpose: "ปรับปรุงระบบจำหน่ายแรงสูง", map_link: "https://maps.google.com/?q=8.0,98.9" };
const expected = ["09.00–10.00 น.", "09.00–10.00 น. และ 16.00–17.00 น.", "09.00–10.00 น., 12.00–13.00 น. และ 16.00–17.00 น."];

test("legacy fallback, authoritative arrays, sort and Thai date across timezones", () => {
  assert.deepEqual(getOutagePeriods(job), [periods[0]]);
  assert.deepEqual(getOutagePeriods({}), []);
  assert.deepEqual(getOutagePeriods({ ...job, outage_periods: [] }), []);
  assert.deepEqual(normalizeOutagePeriods([...periods].reverse()), periods);
  assert.equal(formatThaiOutageDate(job.outage_date, true), "วันพฤหัสบดีที่ 12 พฤศจิกายน 2569");
  assert.equal(formatThaiOutageDate("2026-02-30", true), "");
});

test("reject empty, incomplete, malformed, overlapping, equal, reversed and overnight periods", () => {
  for (const invalid of [null, {}, [], [{}], [null], [{ start_time: "24:00", end_time: "25:00" }],
    [{ start_time: "9:00", end_time: "10:00" }], [{ start_time: "09:00", end_time: "09:00" }],
    [{ start_time: "23:00", end_time: "01:00" }], [...periods, { start_time: "09:30", end_time: "10:30" }]]) {
    assert.throws(() => normalizeOutagePeriods(invalid));
  }
  assert.doesNotThrow(() => normalizeOutagePeriods([periods[0], { start_time: "10:00", end_time: "11:00" }]));
});

test("template adapter handles split Word runs, preserves styling and reports unsupported templates", () => {
  const zip = new PizZip();
  zip.file("word/document.xml", '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{{DOC_TIME_</w:t></w:r><w:r><w:t>START}} – </w:t></w:r><w:r><w:t/><w:t>{{DOC_TIME_END}} น.</w:t></w:r></w:p>');
  assert.equal(prepareOutageTimePlaceholder(zip), true);
  assert.equal(zip.file("word/document.xml")!.asText().replace(/<[^>]+>/g, ""), "{{DOC_TIME_RANGES}}");
  assert.ok(zip.file("word/document.xml")!.asText().includes("<w:b/>"));
  const unsupported = new PizZip();
  unsupported.file("word/document.xml", "<w:p><w:r><w:t>no time fields</w:t></w:r></w:p>");
  assert.equal(prepareOutageTimePlaceholder(unsupported), false);
});

test("one, two, three periods agree in Word files, LINE, Social and reminder", async () => {
  await mkdir(".tmp/multi-period", { recursive: true });
  const template = new PizZip(await readFile("templates/outage_template.docx"));
  for (const [index, list] of [[periods[0]], [periods[0], periods[2]], periods].entries()) {
    const current = { ...job, outage_periods: list };
    assert.equal(formatOutagePeriods(current), expected[index]);
    assert.ok(getSocialPostPreview(current).includes(expected[index]));
    assert.ok(buildOutageNoticeLineMessage(current).includes(expected[index]));
    assert.ok(formatSameDayReminderMessage({ outageDate: job.outage_date, outageTimeText: formatOutagePeriods(current) }).includes(expected[index]));
    const buffer = await generateOutageDocxBuffer({ payload: { ...current, doc_issue_date: "2026-11-03" }, job: current });
    await writeFile(`.tmp/multi-period/outage-${index + 1}.docx`, buffer);
    const zip = new PizZip(buffer);
    const extensions = [...zip.file("[Content_Types].xml")!.asText().matchAll(/<Default\b[^>]*Extension="([^"]+)"/g)].map(match => match[1].toLowerCase());
    assert.equal(new Set(extensions).size, extensions.length, "Word rejects duplicate case-insensitive content types");
    const xml = zip.file("word/document.xml")!.asText();
    const text = xml.replace(/<[^>]+>/g, "");
    assert.ok(text.includes(`วันพฤหัสบดีที่ 12 พฤศจิกายน 2569 ตั้งแต่เวลา ${expected[index]}`), text);
    assert.ok(!text.includes("09.00–17.00"));
    assert.ok(!text.includes("{{"));
    // Page geometry, type styles, headers, footers, logos/signatures remain byte-identical.
    assert.equal(xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0], template.file("word/document.xml")!.asText().match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0]);
    for (const part of template.file(/^word\/(?:styles\.xml|header.*|footer.*|media\/(?!image2\.PNG).*)$/)) {
      assert.deepEqual(zip.file(part.name)!.asUint8Array(), part.asUint8Array(), part.name);
    }
  }
  // Re-export after removing a period uses current data, without resurrecting the removed range.
  const edited = await generateOutageDocxBuffer({ payload: { ...job, doc_issue_date: "2026-11-03", outage_periods: [periods[2]] }, job });
  const editedText = new PizZip(edited).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
  assert.ok(editedText.includes("16.00–17.00 น.")); assert.ok(!editedText.includes("09.00–10.00"));
});

test("later period edits, removals and additions invalidate Social assets; equal arrays remain current", () => {
  const current = { ...job, outage_periods: periods };
  const asset = { id: "1", source_path: "source", generated_path: "out", generated_at: "now", snapshot: socialImageSnapshot(current) };
  assert.equal(isSocialImageStale({ ...current, outage_periods: [...periods] }, asset), false);
  assert.equal(isSocialImageStale(current, { ...asset, snapshot: { ...asset.snapshot,
    outage_periods: periods.map(period => ({ end_time: period.end_time, start_time: period.start_time })) } }), false, "JSONB object-key ordering must not mark current images stale");
  assert.equal(isSocialImageStale({ ...current, outage_periods: [periods[0], periods[2]] }, asset), true);
  assert.equal(isSocialImageStale({ ...current, outage_periods: [periods[0]] }, asset), true);
  assert.equal(isSocialImageStale({ ...current, outage_periods: [periods[0], periods[1], { start_time: "16:30", end_time: "17:00" }] }, asset), true);
});

test("Social images render complete multiline time rows for one, two, three periods", async () => {
  const map = await sharp({ create: { width: 1080, height: 800, channels: 3, background: "#dce6cf" } }).png().toBuffer();
  await mkdir(".tmp/multi-period", { recursive: true });
  for (let count = 1; count <= 3; count++) {
    const image = await renderSocialImage(map, { ...job, outage_periods: periods.slice(0, count) });
    await writeFile(`.tmp/multi-period/social-${count}.png`, image);
    assert.equal((await sharp(image).metadata()).height, 1350);
  }
});

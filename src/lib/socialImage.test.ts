import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { formatThaiFullDate, getSocialPostPreview } from "./socialPost.ts";
import { isSocialImageStale, socialImageSnapshot, validateSocialImageJob, type SocialImageAsset } from "./socialImage.ts";
import { normalizeSocialMap, renderSocialImage } from "./socialImageRenderer.ts";

const job = { outage_date: "2026-09-20", doc_time_start: "09:00", doc_time_end: "15:00", doc_area_title: "หาดอ่าวนาง", doc_area_detail: "หาดอ่าวนาง", equipment_code: "KBA01", doc_purpose: "ปรับปรุงระบบจำหน่ายแรงสูง", map_link: "https://maps.google.com/" };
test("snapshot rejects changes to either time, date, area, and other post data; regeneration is current", () => {
  const asset: SocialImageAsset = { id: "1", source_path: "source", generated_path: "generated", generated_at: "now", snapshot: socialImageSnapshot(job) };
  assert.equal(isSocialImageStale(job, asset), false);
  for (const patch of [{ outage_date: "2026-09-21" }, { doc_time_start: "10:00" }, { doc_time_end: "16:00" }, { doc_area_title: "พื้นที่ใหม่" }, { doc_area_detail: "รายละเอียดใหม่" }, { equipment_code: "KBA02" }]) {
    const updated = { ...job, ...patch };
    assert.equal(isSocialImageStale(updated, asset), true);
    assert.equal(isSocialImageStale(updated, { ...asset, snapshot: socialImageSnapshot(updated) }), false);
  }
  assert.equal(formatThaiFullDate(job.outage_date), "20 กันยายน 2569");
  assert.match(getSocialPostPreview({ ...job, outage_date: "2026-09-21", social_post_text: "old date" }), /21 กันยายน 2569/);
});
test("missing job information cannot generate an announcement", () => {
  assert.throws(() => validateSocialImageJob({ ...job, doc_time_start: null }));
  assert.throws(() => validateSocialImageJob({ ...job, doc_area_title: " " }));
  assert.throws(() => validateSocialImageJob({ ...job, doc_time_end: "25:99" }));
});
test("upload validation decodes raster content, rejects spoofing, corrupt, oversize and unsupported images", async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ddd" } }).png().toBuffer();
  assert.ok((await normalizeSocialMap(png, "image/png")).length);
  for (const [data, mime] of [[png, "image/jpeg"], [Buffer.from("not an image"), "image/png"], [png, "image/svg+xml"], [Buffer.alloc(4*1024*1024), "image/png"]] as const) await assert.rejects(normalizeSocialMap(data, mime));
});
test("renders Thai date/time/area deterministically and wraps long Thai text without clipping", async () => {
  const map = await sharp(Buffer.from('<svg width="1100" height="760"><rect width="1100" height="760" fill="#edf2e7"/><path d="M0 400 Q500 100 1100 500" stroke="#fff" stroke-width="60" fill="none"/><path d="M150 150 L850 180 L950 600 L240 620Z" fill="#f8de44" fill-opacity="0.6" stroke="#e4ad26" stroke-width="6"/></svg>')).png().toBuffer();
  const first = await renderSocialImage(map, job);
  assert.deepEqual(await renderSocialImage(map, job), first);
  const next = await renderSocialImage(map, { ...job, outage_date: "2026-09-21" });
  assert.notDeepEqual(first, next);
  const medium = await renderSocialImage(map, { ...job, doc_area_title: "อ่าวนางซอย 1 และพื้นที่ใกล้เคียง" });
  const long = await renderSocialImage(map, { ...job, doc_area_title: "ตั้งแต่บริษัทเมืองคอนสตรัคชั่น จำกัด ถึงโรงเรียน A-Chuan" });
  const veryLong = await renderSocialImage(map, { ...job, doc_area_title: "หาดอ่าวนางและพื้นที่ใกล้เคียง ตั้งแต่สามแยกโรงเรียนบ้านอ่าวนางถึงบริเวณชุมชนมัสยิดและถนนเลียบชายหาด" });
  const longDate = await renderSocialImage(map, { ...job, outage_date: "2026-02-28", doc_time_start: "23:00", doc_time_end: "23:59" });
  assert.equal((await sharp(long).metadata()).width, 1200);
  assert.equal((await sharp(long).metadata()).height, 1200);
  assert.equal((await sharp(first).metadata()).height, 1200);
  assert.equal((await sharp(longDate).metadata()).height, 1200);
  const mapStrip = await sharp(first).extract({ left: 0, top: 184, width: 1200, height: 746 }).raw().toBuffer();
  assert.deepEqual(await sharp(veryLong).extract({ left: 0, top: 184, width: 1200, height: 746 }).raw().toBuffer(), mapStrip);
  for (const image of [first, medium, long, veryLong]) {
    for (const left of [0, 600, 1199]) {
      const bottomPixel = await sharp(image).extract({ left, top: 1199, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      assert.deepEqual([...bottomPixel], [247, 249, 252], "the information panel should end cleanly across the full bottom edge");
    }
  }
  await assert.rejects(renderSocialImage(map, { ...job, doc_area_title: "พื้นที่ดับไฟ".repeat(200) }), /ยาวเกิน/);
  await mkdir(".tmp/social-image", { recursive: true });
  await writeFile(".tmp/social-image/20-sep.png", first);
  await writeFile(".tmp/social-image/21-sep.png", next);
  await writeFile(".tmp/social-image/medium-area.png", medium);
  await writeFile(".tmp/social-image/long-area.png", long);
  await writeFile(".tmp/social-image/very-long-area.png", veryLong);
  await writeFile(".tmp/social-image/long-date.png", longDate);
});
test("portrait, landscape, and square maps keep their full aspect and render at the fixed canvas size", async () => {
  await mkdir(".tmp/social-image", { recursive: true });
  for (const [label, width, height] of [["portrait", 500, 900], ["landscape", 1400, 600], ["square", 800, 800]] as const) {
    const map = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cedde8"/><circle cx="45" cy="45" r="25" fill="#e31b23"/><circle cx="${width-45}" cy="${height-45}" r="25" fill="#098752"/></svg>`)).png().toBuffer();
    const output = await renderSocialImage(map, job);
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 1200);
    const scale = Math.min(1200 / width, 746 / height);
    const left = (1200 - width * scale) / 2;
    const top = 184 + (746 - height * scale) / 2;
    const red = await sharp(output).extract({ left: Math.round(left + 45 * scale), top: Math.round(top + 45 * scale), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const green = await sharp(output).extract({ left: Math.round(left + (width - 45) * scale), top: Math.round(top + (height - 45) * scale), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.ok(red[0] > 180 && red[1] < 80, `${label}: top-left map content was cropped`);
    assert.ok(green[1] > 90 && green[0] < 80, `${label}: bottom-right map content was cropped`);
    await writeFile(`.tmp/social-image/${label}.png`, output);
  }
});

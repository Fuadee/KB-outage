import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { formatThaiFullDate, getSocialPostPreview } from "./socialPost.ts";
import { isSocialImageStale, parseSocialMapView, socialImageSnapshot, socialMapPlacement, validateSocialImageJob, type SocialImageAsset } from "./socialImage.ts";
import { assertSocialImageFont, normalizeSocialMap, renderSocialImage } from "./socialImageRenderer.ts";
import { SOCIAL_LAYOUT as L } from "./socialImageLayout.ts";
const T = L.text;

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

test("image generation requires the exact bundled Thai font", () => {
  assert.doesNotThrow(() => assertSocialImageFont());
  assert.throws(() => assertSocialImageFont("missing-social-font.ttf"), /ฟอนต์/);
  assert.throws(() => assertSocialImageFont("assets/fonts/OFL.txt"), /ฟอนต์/);
});

test("font sample keeps all announcement text in the bundled family", async () => {
  const map = await sharp({ create: { width: 1080, height: 700, channels: 3, background: "#dce6cf" } }).png().toBuffer();
  const sample = await renderSocialImage(map, {
    ...job, outage_date: "2026-09-25", doc_time_start: "09:00", doc_time_end: "11:00", doc_area_title: "ซอยนครธรรม"
  });
  await mkdir(".tmp/social-image", { recursive: true });
  await writeFile(".tmp/social-image/font-consistency-25-sep.png", sample);
  assert.equal((await sharp(sample).metadata()).width, L.width);
});

test("information-row icons stay inside label rows with visible gaps before values", async () => {
  const { area, dateTime } = L.infoRows;
  assert.equal(T.area.top, area.top + area.height + area.gap);
  assert.equal(T.date.top, dateTime.top + dateTime.height + dateTime.gap);
  assert.equal(T.time.top, dateTime.valueTop);
  assert.ok(area.icon.bottom <= area.top + area.height);
  assert.ok(dateTime.dateIcon.bottom <= dateTime.top + dateTime.height);
  assert.ok(dateTime.timeIcon.bottom <= dateTime.top + dateTime.height);
  assert.ok(area.icon.bottom + 12 <= T.area.top);
  assert.ok(dateTime.dateIcon.bottom + 12 <= T.date.top);
  assert.ok(dateTime.timeIcon.bottom + 12 <= T.time.top);
  assert.ok(area.icon.right + 12 <= T.areaLabel.left);
  assert.ok(dateTime.dateIcon.right + 12 <= T.dateLabel.left);
  assert.ok(dateTime.timeIcon.right + 12 <= T.timeLabel.left);
  assert.ok(T.area.top + T.area.maxHeight < L.areaRowBottom);

  const map = await sharp({ create: { width: 1080, height: 700, channels: 3, background: "#dce6cf" } }).png().toBuffer();
  const cases = [
    ["soi-nakhon-tham", "ซอยนครธรรม"],
    ["ao-nang", "หาดอ่าวนาง"],
    ["wat-khok", "หน้าวัดโคก ถึง เอคอมพิวเตอร์"],
    ["long-mixed", "ตั้งแต่บริษัทเมืองคอนสตรัคชั่น จำกัด ถึงโรงเรียน A-Chuan"]
  ] as const;
  await mkdir(".tmp/social-geometry", { recursive: true });
  const orange = [245, 124, 24], dark = [23, 50, 77];
  for (const [name, doc_area_title] of cases) {
    const output = await renderSocialImage(map, { ...job, doc_area_title });
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    function extreme(box: { left: number; top: number; right: number; bottom: number }, color: number[], which: "min" | "max") {
      let found = which === "min" ? Infinity : -Infinity;
      for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) {
        const i = (y * info.width + x) * info.channels;
        if (color.every((channel, index) => Math.abs(data[i + index] - channel) <= 8)) found = which === "min" ? Math.min(found, y) : Math.max(found, y);
      }
      assert.ok(Number.isFinite(found), `${name}: expected colored pixels in ${JSON.stringify(box)}`);
      return found;
    }
    for (const [label, icon, value] of [
      ["area", area.icon, { left: T.area.left, top: T.area.top, right: T.area.left + T.area.width, bottom: L.areaRowBottom }],
      ["date", dateTime.dateIcon, { left: T.date.left, top: T.date.top, right: T.date.left + T.date.width, bottom: L.height }],
      ["time", dateTime.timeIcon, { left: T.time.left, top: T.time.top, right: T.time.left + T.time.width, bottom: L.height }]
    ] as const) {
      const iconBottom = extreme(icon, orange, "max");
      const valueTop = extreme(value, dark, "min");
      assert.ok(valueTop - iconBottom >= 12, `${name} ${label}: ${valueTop - iconBottom}px visible gap`);
    }
    await writeFile(`.tmp/social-geometry/${name}.png`, output);
  }
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
  assert.equal((await sharp(long).metadata()).width, 1080);
  assert.equal((await sharp(long).metadata()).height, 1350);
  assert.equal((await sharp(first).metadata()).height, 1350);
  assert.equal((await sharp(longDate).metadata()).height, 1350);
  const mapStrip = await sharp(first).extract({ left: 0, top: L.mapTop, width: L.width, height: L.infoTop-L.mapTop }).raw().toBuffer();
  assert.deepEqual(await sharp(veryLong).extract({ left: 0, top: L.mapTop, width: L.width, height: L.infoTop-L.mapTop }).raw().toBuffer(), mapStrip);
  for (const image of [first, medium, long, veryLong]) {
    for (const left of [0, 540, 1079]) {
      const bottomPixel = await sharp(image).extract({ left, top: 1349, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
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
  for (const [label, width, height] of [["portrait", 500, 900], ["landscape", 1400, 600], ["square", 800, 800], ["very-wide", 1800, 400]] as const) {
    const map = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cedde8"/><circle cx="45" cy="45" r="25" fill="#e31b23"/><circle cx="${width-45}" cy="${height-45}" r="25" fill="#098752"/></svg>`)).png().toBuffer();
    const output = await renderSocialImage(map, job);
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    const scale = Math.min(L.width / width, (L.infoTop-L.mapTop) / height);
    const left = (L.width - width * scale) / 2;
    const top = L.mapTop + ((L.infoTop-L.mapTop) - height * scale) / 2;
    const red = await sharp(output).extract({ left: Math.round(left + 45 * scale), top: Math.round(top + 45 * scale), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const green = await sharp(output).extract({ left: Math.round(left + (width - 45) * scale), top: Math.round(top + (height - 45) * scale), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.ok(red[0] > 180 && red[1] < 80, `${label}: top-left map content was cropped`);
    assert.ok(green[1] > 90 && green[0] < 80, `${label}: bottom-right map content was cropped`);
    await writeFile(`.tmp/social-image/${label}.png`, output);
  }
});
test("fill mode pans and zooms without distortion, while fit preserves near-edge content", async () => {
  const width = 1500, height = 500;
  const map = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ccddee"/><rect x="0" y="0" width="80" height="500" fill="red"/><rect x="1420" y="0" width="80" height="500" fill="green"/></svg>`)).png().toBuffer();
  const fit = await renderSocialImage(map, job);
  const left = await renderSocialImage(map, job, { mode: "fill", zoom: 1, x: 0, y: 0.5 });
  const right = await renderSocialImage(map, job, { mode: "fill", zoom: 1, x: 1, y: 0.5 });
  const zoomed = await renderSocialImage(map, job, { mode: "fill", zoom: 2, x: 0, y: 0.5 });
  const mapRegion = (image: Buffer) => sharp(image).extract({ left: 0, top: L.mapTop, width: L.width, height: L.infoTop-L.mapTop }).raw().toBuffer();
  assert.notDeepEqual(await mapRegion(left), await mapRegion(right));
  assert.notDeepEqual(await mapRegion(left), await mapRegion(zoomed));
  const fitRed = await sharp(fit).extract({ left: 10, top: 550, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const fitGreen = await sharp(fit).extract({ left: 1070, top: 550, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.ok(fitRed[0] > 150 && fitRed[1] < 100);
  assert.ok(fitGreen[1] > 80 && fitGreen[0] < 100);
  const placement = socialMapPlacement(1500, 500, L.width, L.infoTop-L.mapTop, { mode: "fill", zoom: 2, x: 0.25, y: 0.75 });
  assert.equal(placement.width / placement.height, 3);
  assert.throws(() => parseSocialMapView({ mode: "fill", zoom: 4, x: 0.5, y: 0.5 }));
  await writeFile(".tmp/social-image/wide-fill-left.png", left);
  await writeFile(".tmp/social-image/wide-fill-right.png", right);
  await writeFile(".tmp/social-image/wide-fill-zoom.png", zoomed);
  await sharp(fit).resize({ width: 360 }).toFile(".tmp/social-image/facebook-feed-360.png");
});

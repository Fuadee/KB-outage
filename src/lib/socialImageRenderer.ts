import sharp from "sharp";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { formatThaiFullDate, type SocialPostJob } from "./socialPost.ts";
import { DEFAULT_SOCIAL_MAP_VIEW, MAX_SOCIAL_IMAGE_BYTES, SOCIAL_IMAGE_MIMES, socialMapPlacement, validateSocialImageJob, type SocialMapView } from "./socialImage.ts";
import { SOCIAL_LAYOUT as L } from "./socialImageLayout.ts";

const T = L.text;
// This is the bundled Noto Sans Thai variable font with a private family name.
// The private name prevents Pango from picking an OS-installed Noto face instead.
const fontFamily = "KB Outage Thai";
const fontfile = path.join(process.cwd(), "assets/fonts/SocialNotoSansThai.ttf");
const fontHash = "3b50fd1867983213f26c2e525ef9e98f4a4b800bc2b09053801b47588b54ce1c";
export function assertSocialImageFont(file: string = fontfile) {
  let data: Buffer;
  try { data = readFileSync(file); }
  catch { throw new Error("ไฟล์ฟอนต์ภาพประชาสัมพันธ์ไม่พร้อมใช้งาน (SocialNotoSansThai.ttf)"); }
  if (createHash("sha256").update(data).digest("hex") !== fontHash) {
    throw new Error("ไฟล์ฟอนต์ภาพประชาสัมพันธ์ไม่ตรงกับ Noto Sans Thai ที่กำหนด");
  }
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export async function normalizeSocialMap(buffer: Buffer, mime: string) {
  if (!SOCIAL_IMAGE_MIMES.includes(mime) || !buffer.length || buffer.length > MAX_SOCIAL_IMAGE_BYTES) throw new Error("ใช้ไฟล์ PNG, JPG หรือ WEBP ขนาดไม่เกิน 3 MB");
  try {
    const decoder = sharp(buffer, { limitInputPixels: 24_000_000, failOn: "warning" });
    const meta = await decoder.metadata();
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
    if (formats[meta.format ?? ""] !== mime || (meta.pages ?? 1) !== 1) throw new Error("format");
    return await decoder.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch { throw new Error("ไฟล์ภาพไม่ถูกต้อง เสียหาย หรือมีขนาดพิกเซลเกินกำหนด"); }
}
async function textImage(value: string, size: number, width: number, color: string, weight: "normal" | "bold" = "normal") {
  return sharp({ text: { text: `<span font_family="${fontFamily}" foreground="${color}" weight="${weight}">${escape(value)}</span>`, font: `${fontFamily} ${size}`, fontfile, width, wrap: "word-char", align: "left", rgba: true, dpi: 72 } }).png().toBuffer({ resolveWithObject: true });
}
type TextImage = Awaited<ReturnType<typeof textImage>>;
async function fitText(value: string, sizes: readonly number[], width: number, maxHeight: number, color: string = L.colors.text) {
  for (const size of sizes) {
    const image = await textImage(value, size, width, color, "bold");
    if (image.info.height <= maxHeight) return image;
  }
  throw new Error("ชื่อพื้นที่หรือข้อมูลประกาศยาวเกินพื้นที่ภาพ กรุณาปรับข้อความในข้อมูลงานให้กระชับ");
}
function preserveEnglishCompoundWords(value: string) {
  return value.replace(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g, token => token.replace(/-/g, "\u2060-\u2060"));
}
function place(image: TextImage, left: number, top: number) { return { input: image.data, left, top }; }

export async function renderSocialImage(map: Buffer, job: SocialPostJob, view: SocialMapView = DEFAULT_SOCIAL_MAP_VIEW) {
  assertSocialImageFont();
  validateSocialImageJob(job);
  const { width, height, headerBottom, mapTop, infoTop, colors } = L;
  const mapHeight = infoTop - mapTop;
  const meta = await sharp(map).metadata();
  if (!meta.width || !meta.height) throw new Error("ไฟล์ภาพแผนที่ไม่ถูกต้อง");
  let mapLayer: Buffer;
  if (view.mode === "fit") {
    const foreground = await sharp(map).resize(width, mapHeight, { fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    mapLayer = await sharp({ create: { width, height: mapHeight, channels: 4, background: colors.mapBackground } })
      .composite([{ input: foreground.data, left: Math.floor((width - foreground.info.width) / 2), top: Math.floor((mapHeight - foreground.info.height) / 2) }]).png().toBuffer();
  } else {
    const geometry = socialMapPlacement(meta.width, meta.height, width, mapHeight, view);
    const enlarged = await sharp(map).resize({ width: Math.max(width, Math.ceil(geometry.width) + 1) }).png().toBuffer({ resolveWithObject: true });
    const left = Math.max(0, Math.min(enlarged.info.width - width, Math.round((enlarged.info.width - width) * view.x)));
    const top = Math.max(0, Math.min(enlarged.info.height - mapHeight, Math.round((enlarged.info.height - mapHeight) * view.y)));
    mapLayer = await sharp(enlarged.data).extract({ left, top, width, height: mapHeight }).png().toBuffer();
  }
  const areaValue = preserveEnglishCompoundWords(job.doc_area_title!.trim());
  const area = await fitText(areaValue, T.area.sizes, T.area.width, T.area.maxHeight);
  const [headline, explanation, areaLabel, dateLabel, timeLabel, date, time] = await Promise.all([
    fitText("แจ้งประกาศดับไฟ", T.headline.sizes, T.headline.width, T.headline.maxHeight, colors.white),
    textImage("ปรับปรุงระบบจำหน่ายแรงสูง\nเพื่อแก้ปัญหาไฟฟ้าขัดข้อง", T.explanation.size, T.explanation.width, colors.white, "bold"),
    textImage("บริเวณ", T.areaLabel.size, T.areaLabel.width, colors.muted), textImage("วันที่", T.dateLabel.size, T.dateLabel.width, colors.muted), textImage("เวลา", T.timeLabel.size, T.timeLabel.width, colors.muted),
    fitText(formatThaiFullDate(job.outage_date), T.date.sizes, T.date.width, T.date.maxHeight),
    fitText(`${job.doc_time_start} - ${job.doc_time_end} น.`, T.time.sizes, T.time.width, T.time.maxHeight)
  ]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="navy"><stop stop-color="${colors.darkNavy}"/><stop offset="1" stop-color="${colors.navy}"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="${colors.background}"/>
    <rect width="${width}" height="${headerBottom}" fill="url(#navy)"/>
    <path d="M0 0 H720 Q735 0 729 17 L685 ${headerBottom} H0 Z" fill="${colors.orange}"/>
    <path d="M36 72 L55 72 L80 54 L80 107 L55 92 L36 92 Z M49 92 L57 117 L70 117 L63 93" fill="${colors.white}"/>
    <path d="M88 68 L101 61 M89 84 H108 M88 100 L101 107" stroke="${colors.white}" stroke-width="4" stroke-linecap="round"/>
    <rect y="${headerBottom}" width="${width}" height="4" fill="${colors.white}"/>
    <rect y="${infoTop}" width="${width}" height="${height-infoTop}" fill="${colors.background}"/>
    <rect y="${infoTop}" width="${width}" height="4" fill="${colors.orange}"/>
    <path d="M34 1190 H1046 M540 1207 V1326" stroke="#D7E2EC" stroke-width="2"/>
    <path d="M52 1027 C46 1027 42 1031 42 1037 C42 1044 52 1052 52 1052 C52 1052 62 1044 62 1037 C62 1031 58 1027 52 1027 Z" fill="none" stroke="${colors.orange}" stroke-width="4"/><circle cx="52" cy="1037" r="3" fill="${colors.orange}"/>
    <rect x="43" y="1221" width="26" height="25" rx="3" fill="none" stroke="${colors.orange}" stroke-width="4"/><path d="M43 1229 H69 M50 1217 V1225 M62 1217 V1225" stroke="${colors.orange}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="578" cy="1234" r="15" fill="none" stroke="${colors.orange}" stroke-width="4"/><path d="M578 1223 V1234 L587 1240" fill="none" stroke="${colors.orange}" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([
    { input: mapLayer, left: 0, top: mapTop },
    place(headline, T.headline.left, Math.floor((headerBottom-headline.info.height)/2)),
    place(explanation, T.explanation.left, Math.floor((headerBottom-explanation.info.height)/2)),
    place(areaLabel, T.areaLabel.left, T.areaLabel.top), place(area, T.area.left, T.area.top),
    place(dateLabel, T.dateLabel.left, T.dateLabel.top), place(date, T.date.left, T.date.top),
    place(timeLabel, T.timeLabel.left, T.timeLabel.top), place(time, T.time.left, T.time.top)
  ]).png().toBuffer();
}

import sharp from "sharp";
import path from "node:path";
import { formatThaiFullDate, type SocialPostJob } from "./socialPost.ts";
import { MAX_SOCIAL_IMAGE_BYTES, SOCIAL_IMAGE_MIMES, validateSocialImageJob } from "./socialImage.ts";

const fontfile = path.join(process.cwd(), "assets/fonts/NotoSansThai.ttf");
const DESIGN = {
  width: 1200, height: 1200, headerBottom: 180, mapTop: 184,
  infoTop: 930,
  columns: { areaEnd: 576, dateEnd: 888, areaLeft: 43, areaWidth: 510,
    dateLeft: 595, dateWidth: 280, timeLeft: 905, timeWidth: 280 },
  colors: {
    navy: "#123A63", darkNavy: "#0B2F52", orange: "#F57C18",
    background: "#F7F9FC", white: "#FFFFFF", text: "#17324D",
    muted: "#5F6B7A", lightBlue: "#EAF3FB"
  }
} as const;
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
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

async function textImage(text: string, size: number, width: number, color: string, weight: "normal" | "bold" = "normal") {
  return sharp({ text: {
    text: `<span foreground="${color}" weight="${weight}">${escape(text)}</span>`,
    font: `Noto Sans Thai ${size}`, fontfile, width, wrap: "word-char",
    align: "left", rgba: true, dpi: 72
  } }).png().toBuffer({ resolveWithObject: true });
}
type TextImage = Awaited<ReturnType<typeof textImage>>;
async function fitText(text: string, sizes: readonly number[], width: number, maxHeight: number, color: string = DESIGN.colors.text) {
  for (const size of sizes) {
    const image = await textImage(text, size, width, color, "bold");
    if (image.info.height <= maxHeight) return image;
  }
  // Safety-critical details must remain complete and readable.
  throw new Error("ชื่อพื้นที่หรือข้อมูลประกาศยาวเกินพื้นที่ภาพ กรุณาปรับข้อความในข้อมูลงานให้กระชับ");
}
function preserveEnglishCompoundWords(text: string) {
  // Word joiners are invisible in the rendered raster. They discourage Pango
  // from splitting an English token at its hyphen without changing job data.
  return text.replace(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g, token => token.replace(/-/g, "\u2060-\u2060"));
}
function place(image: TextImage, left: number, top: number) {
  return { input: image.data, left, top };
}
export async function renderSocialImage(map: Buffer, job: SocialPostJob) {
  validateSocialImageJob(job);
  const { width, height, headerBottom, mapTop, colors } = DESIGN;
  const columns = DESIGN.columns;
  const areaText = preserveEnglishCompoundWords(job.doc_area_title!.trim());
  const areaLength = Array.from(job.doc_area_title!.trim()).length;
  const areaSizes = areaLength <= 18 ? [49, 46, 43, 40, 37, 34, 31, 30]
    : areaLength <= 45 ? [43, 40, 37, 34, 31, 30]
      : [38, 36, 34, 32, 30];
  let area: TextImage;
  let wideArea = false;
  try {
    area = await fitText(areaText, areaSizes, columns.areaWidth, 118);
  } catch {
    wideArea = true;
    area = await fitText(areaText, [40, 36, 33, 30], 1100, 98);
  }
  const infoTop = DESIGN.infoTop;
  const areaLabelTop = wideArea ? 945 : Math.round(infoTop + (height - infoTop - (53 + area.info.height)) / 2);
  const areaValueTop = wideArea ? 980 : areaLabelTop + 53;
  const dateLabelTop = wideArea ? 1085 : areaLabelTop;
  const dateValueTop = wideArea ? 1120 : areaValueTop;
  const mapHeight = infoTop - mapTop;
  // The blurred backdrop fills any side bands; the sharp foreground keeps every map detail visible.
  const [backdrop, foreground] = await Promise.all([
    sharp(map).resize(width, mapHeight, { fit: "cover" }).blur(18).png().toBuffer(),
    sharp(map).resize(width, mapHeight, { fit: "inside" }).png().toBuffer({ resolveWithObject: true })
  ]);
  const shade = Buffer.from(`<svg width="${width}" height="${mapHeight}"><rect width="${width}" height="${mapHeight}" fill="${colors.darkNavy}" opacity="0.20"/></svg>`);
  const mapLayer = await sharp(backdrop).composite([
    { input: shade, left: 0, top: 0 },
    { input: foreground.data, left: Math.floor((width - foreground.info.width) / 2), top: Math.floor((mapHeight - foreground.info.height) / 2) }
  ]).png().toBuffer();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="navy"><stop stop-color="${colors.darkNavy}"/><stop offset="1" stop-color="${colors.navy}"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="${colors.background}"/>
    <rect width="${width}" height="${headerBottom}" fill="url(#navy)"/>
    <path d="M0 0 H794 Q807 0 801 17 L752 180 H0 Z" fill="${colors.orange}"/>
    <path d="M45 82 L66 82 L95 62 L95 119 L66 103 L45 103 Z M59 103 L66 132 L82 132 L73 104" fill="${colors.white}"/>
    <path d="M104 75 L118 67 M105 93 H124 M103 111 L117 119" stroke="${colors.white}" stroke-width="5" stroke-linecap="round"/>
    <rect y="${headerBottom}" width="${width}" height="4" fill="${colors.white}"/>
    <rect y="${infoTop}" width="${width}" height="${height - infoTop}" fill="${colors.background}"/>
    <rect y="${infoTop}" width="${width}" height="5" fill="${colors.orange}"/>
    <path d="${wideArea ? "M600 1080 V1170" : `M${columns.areaEnd} ${areaLabelTop-3} V1165 M${columns.dateEnd} ${areaLabelTop-3} V1165`}" stroke="#D6E2EF" stroke-width="2" opacity="0.65"/>
    <g transform="translate(0,${areaLabelTop - 948})">
      <path d="M49 966 C49 949 72 949 72 966 C72 979 60 988 60 988 C60 988 49 979 49 966 Z" fill="none" stroke="${colors.orange}" stroke-width="5"/>
      <circle cx="60" cy="965" r="5" fill="${colors.orange}"/>
    </g>
    <g transform="translate(${wideArea ? -405 : 141},${dateLabelTop - 948})">
      <rect x="459" y="955" width="31" height="29" rx="3" fill="none" stroke="${colors.orange}" stroke-width="4"/>
      <path d="M459 965 H490 M468 949 V959 M481 949 V959 M467 973 H474 M479 973 H485" fill="none" stroke="${colors.orange}" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g transform="translate(${wideArea ? -205 : 58},${dateLabelTop - 948})">
      <circle cx="856" cy="969" r="17" fill="none" stroke="${colors.orange}" stroke-width="4"/>
      <path d="M856 957 V969 L866 976" fill="none" stroke="${colors.orange}" stroke-width="4" stroke-linecap="round"/>
    </g>
  </svg>`;

  const [headline, explanation, areaLabel, dateLabel, timeLabel, date, time] = await Promise.all([
    fitText("แจ้งประกาศดับไฟ", [52, 49, 46], 600, 82, colors.white),
    textImage("ปรับปรุงระบบจำหน่ายแรงสูง\nเพื่อแก้ปัญหาไฟฟ้าขัดข้อง", 27, 375, colors.white, "bold"),
    textImage("บริเวณ", 25, 290, colors.muted),
    textImage("วันที่", 25, 275, colors.muted),
    textImage("เวลา", 25, 270, colors.muted),
    fitText(formatThaiFullDate(job.outage_date), [36, 34, 32, 30, 28], columns.dateWidth, 70),
    fitText(`${job.doc_time_start} - ${job.doc_time_end} น.`, [36, 34, 32, 30, 28], columns.timeWidth, 70)
  ]);
  const layers = [
    { input: mapLayer, left: 0, top: mapTop },
    place(headline, 136, Math.floor((headerBottom - headline.info.height) / 2)),
    place(explanation, 800, Math.floor((headerBottom - explanation.info.height) / 2)),
    place(areaLabel, 91, areaLabelTop),
    place(dateLabel, wideArea ? 101 : 644, dateLabelTop),
    place(timeLabel, wideArea ? 692 : 961, dateLabelTop),
    place(area, columns.areaLeft, areaValueTop),
    place(date, wideArea ? 55 : columns.dateLeft, dateValueTop),
    place(time, wideArea ? 650 : columns.timeLeft, dateValueTop)
  ];
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}

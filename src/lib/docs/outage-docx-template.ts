import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import QRCode from "qrcode";

const PLACEHOLDER_QR_IMAGE = "word/media/image2.png";
const CONTENT_TYPES_PATH = "[Content_Types].xml";

type DocPayload = {
  doc_issue_date: string;
  doc_purpose: string;
  doc_area_title: string;
  doc_time_start: string;
  doc_time_end: string;
  doc_area_detail: string;
  map_link: string;
};

export const OUTAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "outage_template.docx"
);

type GenerateArgs = {
  payload: DocPayload;
  job: Record<string, unknown>;
};

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม"
];
const THAI_WEEKDAYS = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์"
];

export const formatThaiDateBE = (isoDate: string): string => {
  if (!isoDate?.trim()) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return "";
  }

  const thaiMonth = THAI_MONTHS[month - 1];
  if (!thaiMonth) {
    return "";
  }

  const beYear = year + 543;
  return `${day} ${thaiMonth} ${beYear}`;
};

export const formatThaiDateWithWeekdayBE = (isoDate: unknown): string => {
  if (typeof isoDate !== "string" || !isoDate.trim()) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return "";
  }

  const thaiMonth = THAI_MONTHS[month - 1];
  if (!thaiMonth) {
    return "";
  }

  const weekday = THAI_WEEKDAYS[utcDate.getUTCDay()];
  if (!weekday) {
    return "";
  }

  const beYear = year + 543;
  return `${weekday}ที่ ${day} ${thaiMonth} ${beYear}`;
};

const containsInvalidXmlChars = (xml: string) =>
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml) || xml.includes("\uFFFD");

const isDocumentXmlSane = (docBuffer: Buffer) => {
  try {
    const zip = new PizZip(docBuffer);
    const documentXml = zip.file("word/document.xml")?.asText();
    if (!documentXml) {
      console.warn("Sanity check failed: word/document.xml missing.");
      return false;
    }
    if (containsInvalidXmlChars(documentXml)) {
      console.warn(
        "Sanity check failed: document.xml contains invalid XML characters."
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Sanity check failed while reading document.xml.", error);
    return false;
  }
};

const listMediaEntries = (docBuffer: Buffer) => {
  try {
    const zip = new PizZip(docBuffer);
    return zip
      .file(/^word\/media\//i)
      .map((entry) => entry.name)
      .filter(Boolean);
  } catch (error) {
    console.warn("Unable to read media entries from DOCX buffer.", error);
    return [];
  }
};

const findPlaceholderEntryName = (zip: PizZip) => {
  const matches = zip.file(/^word\/media\/image2\.png$/i);
  if (!matches || matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    console.warn(
      `Multiple placeholder matches found for ${PLACEHOLDER_QR_IMAGE}, using first.`
    );
  }
  return matches[0]?.name ?? null;
};

const logDocxRenderError = (error: unknown) => {
  console.error("Docxtemplater render failed.");

  if (error instanceof Error) {
    console.error("Docxtemplater error message:", error.message);
  } else {
    console.error("Docxtemplater error (non-Error):", error);
  }

  const errorWithProps = error as {
    properties?: {
      errors?: Array<{
        message?: string;
        name?: string;
        properties?: Record<string, unknown>;
      }>;
    };
  };

  const subErrors = errorWithProps?.properties?.errors;
  if (subErrors && subErrors.length > 0) {
    console.error(`Docxtemplater sub-errors (${subErrors.length}):`);
    subErrors.forEach((subError, index) => {
      console.error(`  [${index + 1}] name:`, subError.name);
      console.error(`  [${index + 1}] message:`, subError.message);
      console.error(
        `  [${index + 1}] properties:`,
        subError.properties ?? {}
      );
    });
  } else if (errorWithProps?.properties) {
    console.error("Docxtemplater error properties:", errorWithProps.properties);
  }
};

const renderTextPass = (templateBuffer: Buffer, data: Record<string, string>) => {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });
  try {
    doc.render(data);
  } catch (error) {
    logDocxRenderError(error);
    throw error;
  }
  return doc.getZip().generate({ type: "nodebuffer" });
};

const ensurePngContentType = (zip: PizZip) => {
  const contentTypesFile = zip.file(CONTENT_TYPES_PATH);
  if (!contentTypesFile) {
    console.warn("Missing [Content_Types].xml, unable to ensure image/png.");
    return;
  }
  const xml = contentTypesFile.asText();
  if (xml.includes('Extension="png"')) {
    return;
  }
  const insertTag =
    '<Default Extension="png" ContentType="image/png"/>';
  if (!xml.includes("</Types>")) {
    console.warn("Malformed [Content_Types].xml, unable to append image/png.");
    return;
  }
  const updated = xml.replace("</Types>", `  ${insertTag}\n</Types>`);
  zip.file(CONTENT_TYPES_PATH, updated);
};

export async function generateOutageDocxBuffer({
  payload,
  job
}: GenerateArgs): Promise<Buffer> {
  let templateBuffer: Buffer;
  try {
    templateBuffer = await fs.readFile(OUTAGE_TEMPLATE_PATH);
  } catch (error) {
    console.error("DOCX template missing at:", OUTAGE_TEMPLATE_PATH);
    throw new Error(
      "Missing DOCX template at templates/outage_template.docx. See README: DOCX Template Setup."
    );
  }

  let imageBuffer: Buffer | null = null;
  try {
    imageBuffer = await QRCode.toBuffer(payload.map_link, {
      type: "png",
      width: 120,
      margin: 1
    });
    console.info(`QR bytes: ${imageBuffer.length}`);
  } catch (error) {
    console.warn("Failed to generate QR code, falling back to text.", error);
  }

  const doc_issue_date_th = formatThaiDateBE(payload.doc_issue_date);
  const doc_outage_date_full_th = formatThaiDateWithWeekdayBE(
    job?.outage_date ?? ""
  );
  const baseData = {
    doc_issue_date: payload.doc_issue_date,
    doc_issue_date_th,
    doc_outage_date_full_th,
    DOC_ISSUE_DATE: payload.doc_issue_date,
    DOC_PURPOSE: payload.doc_purpose,
    DOC_AREA_TITLE: payload.doc_area_title,
    DOC_TIME_START: payload.doc_time_start,
    DOC_TIME_END: payload.doc_time_end,
    DOC_AREA_DETAIL: payload.doc_area_detail,
    MAP_LINK: payload.map_link,
    OUTAGE_DATE: String(job.outage_date ?? "-"),
    EQUIPMENT_CODE: String(job.equipment_code ?? "-")
  };

  const pass1Buffer = renderTextPass(templateBuffer, baseData);
  console.info("PASS1 OK");

  if (!imageBuffer) {
    throw new Error(
      "QR image generation failed; cannot replace placeholder image2.png."
    );
  }

  const zip = new PizZip(pass1Buffer);
  const placeholderEntryName = findPlaceholderEntryName(zip);
  if (!placeholderEntryName) {
    const mediaEntries = zip
      .file(/^word\/media\//i)
      .map((entry) => entry.name)
      .filter(Boolean);
    throw new Error(
      `Missing ${PLACEHOLDER_QR_IMAGE} in DOCX. Found media: ${mediaEntries.join(", ")}`
    );
  }
  const bytesBefore =
    zip.file(placeholderEntryName)?.asUint8Array().length ?? 0;
  console.info(
    `Placeholder bytes for ${placeholderEntryName} before replace: ${bytesBefore}`
  );
  zip.remove(placeholderEntryName);
  zip.file(placeholderEntryName, imageBuffer, { binary: true });
  const bytesAfter =
    zip.file(placeholderEntryName)?.asUint8Array().length ?? 0;
  console.info(
    `Placeholder bytes for ${placeholderEntryName} after replace: ${bytesAfter}`
  );
  ensurePngContentType(zip);
  const rendered = zip.generate({ type: "nodebuffer" });
  console.info("MEDIA AFTER:", listMediaEntries(rendered));
  if (!isDocumentXmlSane(rendered)) {
    console.warn("Generated DOCX failed sanity check after image replacement.");
  }
  return rendered;
}

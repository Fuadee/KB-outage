import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import QRCode from "qrcode";

const PLACEHOLDER_QR_IMAGE = "word/media/qr_placeholder.png";

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

const resolvePlaceholderImage = (zip: PizZip) => {
  if (zip.file(PLACEHOLDER_QR_IMAGE)) {
    return PLACEHOLDER_QR_IMAGE;
  }

  const envName = process.env.OUTAGE_QR_PLACEHOLDER_FILENAME;
  if (envName) {
    const normalized = envName.includes("/")
      ? envName
      : `word/media/${envName}`;
    if (zip.file(normalized)) {
      return normalized;
    }
  }

  const pngEntries = zip.file(/^word\/media\/.+\.png$/i);
  if (pngEntries.length === 0) {
    return null;
  }

  const largest = pngEntries.reduce<{
    name: string;
    size: number;
  } | null>((current, entry) => {
    const buffer = entry.asNodeBuffer();
    const size = buffer.length;
    if (!current || size > current.size) {
      return { name: entry.name, size };
    }
    return current;
  }, null);

  return largest?.name ?? null;
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

  const baseData = {
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
    console.warn("PASS2 FAILED, fallback to text");
    return pass1Buffer;
  }

  try {
    const zip = new PizZip(pass1Buffer);
    const placeholder = resolvePlaceholderImage(zip);
    if (!placeholder) {
      console.warn(
        "PASS2 FAILED, no placeholder image found under word/media/."
      );
      return pass1Buffer;
    }
    console.info(`Replacing placeholder image: ${placeholder}`);
    zip.file(placeholder, imageBuffer);
    const rendered = zip.generate({ type: "nodebuffer" });
    console.info("MEDIA AFTER:", listMediaEntries(rendered));
    if (!isDocumentXmlSane(rendered)) {
      console.warn("Generated DOCX failed sanity check after image replacement.");
      return pass1Buffer;
    }
    console.info("PASS2 OK (image replaced)");
    return rendered;
  } catch (error) {
    console.warn("Failed to replace QR image, falling back to text.", error);
    return pass1Buffer;
  }
}

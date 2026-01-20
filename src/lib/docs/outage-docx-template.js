const fs = require("fs/promises");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const QRCode = require("qrcode");

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

const formatThaiDateBE = (isoDate) => {
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

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
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

const OUTAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "outage_template.docx"
);

const logDocxRenderError = (error) => {
  console.error("Docxtemplater render failed.");

  if (error instanceof Error) {
    console.error("Docxtemplater error message:", error.message);
  } else {
    console.error("Docxtemplater error (non-Error):", error);
  }

  const errorWithProps = error;

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

const renderTextPass = (templateBuffer, data) => {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });
  try {
    doc.render({
      ...data,
      MAP_QR: ""
    });
  } catch (error) {
    logDocxRenderError(error);
    throw error;
  }
  return doc.getZip().generate({ type: "nodebuffer" });
};

async function generateOutageDocxBuffer({ payload, job }) {
  let templateBuffer;
  try {
    templateBuffer = await fs.readFile(OUTAGE_TEMPLATE_PATH);
  } catch (error) {
    console.error("DOCX template missing at:", OUTAGE_TEMPLATE_PATH);
    throw new Error(
      "Missing DOCX template at templates/outage_template.docx. See README: DOCX Template Setup."
    );
  }

  const doc_issue_date_th = formatThaiDateBE(payload.doc_issue_date);
  const baseData = {
    doc_issue_date: payload.doc_issue_date,
    doc_issue_date_th,
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

  const renderedBuffer = renderTextPass(templateBuffer, baseData);
  console.info("PASS1 OK");

  const imageBuffer = await QRCode.toBuffer(payload.map_link, {
    type: "png",
    width: 120,
    margin: 1
  });
  console.info(`QR bytes: ${imageBuffer.length}`);

  const zip = new PizZip(renderedBuffer);
  const media = zip.file(/^word\/media\//).map((file) => file.name);
  const target = media.find(
    (name) => name.toLowerCase() === "word/media/image2.png"
  );
  if (!target) {
    throw new Error(
      `Template missing QR placeholder image2.(png) - media=${JSON.stringify(
        media
      )}`
    );
  }
  zip.remove(target);
  zip.file(target, imageBuffer, { binary: true });
  return zip.generate({ type: "nodebuffer" });
}

module.exports = {
  generateOutageDocxBuffer,
  formatThaiDateBE,
  OUTAGE_TEMPLATE_PATH
};

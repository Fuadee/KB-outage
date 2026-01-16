import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import QRCode from "qrcode";

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
  } catch (error) {
    console.warn("Failed to generate QR code, falling back to text.", error);
  }

  const imageModule = imageBuffer
    ? new ImageModule({
        getImage: (tagValue: Buffer) => tagValue,
        getSize: () => [120, 120]
      })
    : null;

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

  const renderWithOptions = (useImage: boolean, mapQrValue: Buffer | string) => {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: useImage && imageModule ? [imageModule] : []
    });
    doc.render({
      ...baseData,
      MAP_QR: mapQrValue
    });
    return doc.getZip().generate({ type: "nodebuffer" });
  };

  if (imageBuffer) {
    try {
      return renderWithOptions(true, imageBuffer);
    } catch (error) {
      console.warn("Failed to insert QR image, falling back to text.", error);
    }
  }

  return renderWithOptions(false, payload.map_link);
}

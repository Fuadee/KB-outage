import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import QRCode from "qrcode";

const MAP_QR_TAG = "MAP_QR";
const MAP_QR_EXACT = "{{MAP_QR}}";
const MAP_QR_REGEX = /\{\{\s*MAP_QR\s*\}\}/g;
const TEXTBOX_MARKERS = ["w:txbxContent", "v:textbox", "wps:"];

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

const getTextNodes = (xml: string) => {
  const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const nodes: Array<{ text: string; index: number }> = [];
  let match = regex.exec(xml);
  while (match) {
    nodes.push({ text: match[1], index: match.index });
    match = regex.exec(xml);
  }
  return nodes;
};

const analyzeTagSplit = (xml: string, tag: string) => {
  const nodes = getTextNodes(xml);
  const nodeContainsTag = nodes.some((node) => node.text.includes(tag));
  const concatenated = nodes.map((node) => node.text).join("");
  const concatenatedContainsTag = concatenated.includes(tag);
  const xmlContainsTag = xml.includes(tag);
  const isSplitAcrossNodes =
    concatenatedContainsTag && !nodeContainsTag && !xmlContainsTag;

  return {
    nodeContainsTag,
    concatenatedContainsTag,
    xmlContainsTag,
    isSplitAcrossNodes
  };
};

const extractSnippets = (xml: string, search: string, windowSize = 120) => {
  const snippets: string[] = [];
  let index = xml.indexOf(search);
  while (index !== -1) {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(xml.length, index + search.length + windowSize);
    const rawSnippet = xml.slice(start, end);
    const cleanedSnippet = rawSnippet.replace(/\s+/g, " ").trim();
    snippets.push(cleanedSnippet);
    index = xml.indexOf(search, index + search.length);
  }
  return snippets;
};

type MapQrTemplateScan = {
  canInsertImage: boolean;
  issues: string[];
  foundInDocument: boolean;
};

const scanTemplateForMapQr = (templateBuffer: Buffer): MapQrTemplateScan => {
  const zip = new PizZip(templateBuffer);
  const entries = zip.file(/word\/.+\.xml$/i);
  const issues: string[] = [];
  let foundInDocument = false;
  let foundAnyTag = false;
  let foundInHeaderFooter = false;
  let foundInTextbox = false;
  let foundSplitRuns = false;
  let foundSpacedTag = false;
  let foundWrongDelimiter = false;

  entries.forEach((entry) => {
    const xml = entry.asText();
    if (!xml.includes(MAP_QR_TAG)) {
      return;
    }

    foundAnyTag = true;
    const isHeaderFooter = /word\/(header|footer)\d*\.xml$/i.test(entry.name);
    const isDocument = entry.name === "word/document.xml";
    const hasTextboxMarkers = TEXTBOX_MARKERS.some((marker) =>
      xml.includes(marker)
    );
    const hasTagMatch = MAP_QR_REGEX.test(xml);
    MAP_QR_REGEX.lastIndex = 0;
    const exactTagPresent = xml.includes(MAP_QR_EXACT);
    const tagSplit = analyzeTagSplit(xml, MAP_QR_EXACT);
    const snippets = extractSnippets(xml, MAP_QR_TAG);

    if (isDocument && hasTagMatch) {
      foundInDocument = true;
    }
    if (isHeaderFooter && hasTagMatch) {
      foundInHeaderFooter = true;
    }
    if (hasTextboxMarkers && hasTagMatch) {
      foundInTextbox = true;
    }
    if (tagSplit.isSplitAcrossNodes) {
      foundSplitRuns = true;
    }
    if (hasTagMatch && !exactTagPresent) {
      foundSpacedTag = true;
    }
    if (!hasTagMatch && xml.includes(MAP_QR_TAG)) {
      foundWrongDelimiter = true;
    }

    if (snippets.length > 0) {
      snippets.forEach((snippet) => {
        issues.push(`Snippet in ${entry.name}: ${snippet}`);
      });
    }
  });

  if (!foundAnyTag) {
    issues.push(
      "MAP_QR placeholder was not found in any XML part. Ensure {{MAP_QR}} exists in the template."
    );
  }
  if (foundSplitRuns) {
    issues.push(
      "MAP_QR appears split across multiple <w:t> runs. Re-type the placeholder in a single run with no formatting changes."
    );
  }
  if (foundInTextbox) {
    issues.push(
      "MAP_QR appears inside a textbox/shape. Move the placeholder to the main document body."
    );
  }
  if (foundInHeaderFooter) {
    issues.push(
      "MAP_QR appears in a header/footer. Move it into word/document.xml (main body)."
    );
  }
  if (foundSpacedTag) {
    issues.push("MAP_QR tag has spaces. Use the exact {{MAP_QR}} tag.");
  }
  if (foundWrongDelimiter) {
    issues.push(
      "MAP_QR appears without {{ }} delimiters. Ensure the placeholder uses {{MAP_QR}}."
    );
  }

  const canInsertImage =
    foundInDocument &&
    !foundSplitRuns &&
    !foundInTextbox &&
    !foundInHeaderFooter &&
    !foundSpacedTag &&
    !foundWrongDelimiter;

  return { canInsertImage, issues, foundInDocument };
};

const logTemplateScan = (scan: MapQrTemplateScan) => {
  console.warn("DOCX MAP_QR template inspection:");
  if (!scan.foundInDocument) {
    console.warn("- MAP_QR tag not found in word/document.xml.");
  }
  if (scan.canInsertImage) {
    console.warn("- Template structure looks compatible with image insertion.");
  } else {
    console.warn(
      "- Template structure is NOT compatible with image insertion. Falling back to text."
    );
  }
  scan.issues.forEach((issue) => console.warn(`- ${issue}`));
};

const isLikelyBase64 = (value: string) =>
  /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0;

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
  let imageBase64: string | null = null;
  try {
    imageBuffer = await QRCode.toBuffer(payload.map_link, {
      type: "png",
      width: 120,
      margin: 1
    });
    imageBase64 = imageBuffer.toString("base64");
  } catch (error) {
    console.warn("Failed to generate QR code, falling back to text.", error);
  }

  const imageModule = imageBase64
    ? new ImageModule({
        getImage: (tagValue: string) => {
          if (typeof tagValue !== "string") {
            throw new Error("MAP_QR tag value must be a base64 string.");
          }
          if (!isLikelyBase64(tagValue)) {
            throw new Error("MAP_QR tag value is not valid base64.");
          }
          return Buffer.from(tagValue, "base64");
        },
        getSize: () => [120, 120]
      })
    : null;

  const templateScan = scanTemplateForMapQr(templateBuffer);
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
      delimiters: { start: "{{", end: "}}" },
      modules: useImage && imageModule ? [imageModule] : []
    });
    try {
      doc.render({
        ...baseData,
        MAP_QR: mapQrValue
      });
    } catch (error) {
      logDocxRenderError(error);
      throw error;
    }
    return doc.getZip().generate({ type: "nodebuffer" });
  };

  if (imageBase64) {
    try {
      if (!templateScan.canInsertImage) {
        logTemplateScan(templateScan);
      } else {
        const rendered = renderWithOptions(true, imageBase64);
        if (!isDocumentXmlSane(rendered)) {
          console.warn(
            "Generated DOCX failed sanity check after image insertion."
          );
          logTemplateScan(templateScan);
        } else {
          return rendered;
        }
      }
    } catch (error) {
      console.warn("Failed to insert QR image, falling back to text.", error);
      logTemplateScan(templateScan);
    }
  }

  return renderWithOptions(false, payload.map_link);
}

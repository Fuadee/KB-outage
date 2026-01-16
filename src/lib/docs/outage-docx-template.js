const fs = require("fs/promises");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const ImageModule = require("docxtemplater-image-module-free");
const QRCode = require("qrcode");

const MAP_QR_TAG = "MAP_QR";
const MAP_QR_IMAGE_EXACT = "{%MAP_QR}";
const MAP_QR_IMAGE_REGEX = /\{\%\s*MAP_QR\s*\}/g;
const MAP_QR_WRONG_IMAGE_EXACT = "{%MAP_QR%}";
const MAP_QR_TEXT_EXACT = "{{MAP_QR}}";
const TEXTBOX_MARKERS = ["w:txbxContent", "v:textbox", "wps:"];

const OUTAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "outage_template.docx"
);

const getTextNodes = (xml) => {
  const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const nodes = [];
  let match = regex.exec(xml);
  while (match) {
    nodes.push({ text: match[1], index: match.index });
    match = regex.exec(xml);
  }
  return nodes;
};

const analyzeTagSplit = (xml, tag) => {
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

const extractSnippets = (xml, search, windowSize = 120) => {
  const snippets = [];
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

const scanTemplateForMapQr = (templateBuffer) => {
  const zip = new PizZip(templateBuffer);
  const entries = zip.file(/word\/.+\.xml$/i);
  const issues = [];
  let foundInDocument = false;
  let foundAnyTag = false;
  let foundInHeaderFooter = false;
  let foundInTextbox = false;
  let foundSplitRuns = false;
  let foundSpacedTag = false;
  let foundWrongDelimiter = false;
  let foundWrongImageDelimiter = false;
  let foundTextDelimiter = false;

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
    const hasTagMatch = MAP_QR_IMAGE_REGEX.test(xml);
    MAP_QR_IMAGE_REGEX.lastIndex = 0;
    const exactTagPresent = xml.includes(MAP_QR_IMAGE_EXACT);
    const tagSplit = analyzeTagSplit(xml, MAP_QR_IMAGE_EXACT);
    const snippets = extractSnippets(xml, MAP_QR_TAG);

    if (isDocument && exactTagPresent) {
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
    if (xml.includes(MAP_QR_WRONG_IMAGE_EXACT)) {
      foundWrongImageDelimiter = true;
    }
    if (xml.includes(MAP_QR_TEXT_EXACT)) {
      foundTextDelimiter = true;
    }

    if (snippets.length > 0) {
      snippets.forEach((snippet) => {
        issues.push(`Snippet in ${entry.name}: ${snippet}`);
      });
    }
  });

  if (!foundAnyTag) {
    issues.push(
      "MAP_QR placeholder was not found in any XML part. Ensure {%MAP_QR} exists in the template."
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
    issues.push("MAP_QR tag has spaces. Use the exact {%MAP_QR} tag.");
  }
  if (foundWrongDelimiter) {
    issues.push(
      "MAP_QR appears without {% } delimiters. Ensure the placeholder uses {%MAP_QR}."
    );
  }
  if (foundWrongImageDelimiter) {
    issues.push(
      "MAP_QR uses the wrong image tag syntax ({%MAP_QR%}). Use {%MAP_QR} (no trailing %})."
    );
  }
  if (foundTextDelimiter) {
    issues.push("MAP_QR uses text delimiters. Use {%MAP_QR} for images.");
  }

  const canInsertImage =
    foundInDocument &&
    !foundSplitRuns &&
    !foundInTextbox &&
    !foundInHeaderFooter &&
    !foundSpacedTag &&
    !foundWrongDelimiter &&
    !foundWrongImageDelimiter &&
    !foundTextDelimiter;

  return { canInsertImage, issues, foundInDocument };
};

const logTemplateScan = (scan) => {
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

const containsInvalidXmlChars = (xml) =>
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml) || xml.includes("\uFFFD");

const isDocumentXmlSane = (docBuffer) => {
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

const containsRawPngInDocumentXml = (docBuffer) => {
  try {
    const zip = new PizZip(docBuffer);
    const documentXml = zip.file("word/document.xml")?.asText();
    if (!documentXml) {
      return false;
    }
    return documentXml.includes("�PNG");
  } catch (error) {
    console.warn("Unable to scan document.xml for raw PNG bytes.", error);
    return false;
  }
};

const listMediaEntries = (docBuffer) => {
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

const renderImagePass = (templateBuffer, imageBuffer, imageModule) => {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{%", end: "}" },
    modules: [imageModule]
  });
  try {
    doc.render({ MAP_QR: imageBuffer });
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

  const templateMediaEntries = listMediaEntries(templateBuffer);
  let imageBuffer = null;
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

  const imageModule = imageBuffer
    ? new ImageModule({
        getImage: (tagValue) => tagValue,
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

  const pass1Buffer = renderTextPass(templateBuffer, baseData);
  console.info("PASS1 OK");

  if (imageBuffer && imageModule && templateScan.foundInDocument) {
    try {
      if (!templateScan.canInsertImage) {
        logTemplateScan(templateScan);
      } else {
        const rendered = renderImagePass(pass1Buffer, imageBuffer, imageModule);
        console.info("MEDIA AFTER:", listMediaEntries(rendered));
        if (!isDocumentXmlSane(rendered)) {
          console.warn(
            "Generated DOCX failed sanity check after image insertion."
          );
          logTemplateScan(templateScan);
        } else if (containsRawPngInDocumentXml(rendered)) {
          console.warn(
            "Detected raw PNG bytes in document.xml after image insertion. Falling back to text-only output."
          );
          return pass1Buffer;
        } else {
          const renderedMediaEntries = listMediaEntries(rendered);
          const newMediaEntries = renderedMediaEntries.filter(
            (entry) => !templateMediaEntries.includes(entry)
          );
          if (newMediaEntries.length > 0) {
            console.info(
              "QR image inserted; new media files detected under word/media/:",
              newMediaEntries
            );
          } else {
            console.warn("NO NEW MEDIA");
            return pass1Buffer;
          }
          console.info("PASS2 OK (image inserted)");
          return rendered;
        }
      }
    } catch (error) {
      console.warn("Failed to insert QR image, falling back to text.", error);
      logTemplateScan(templateScan);
    }
  }

  console.warn("PASS2 FAILED, fallback to text");
  return pass1Buffer;
}

module.exports = {
  generateOutageDocxBuffer,
  OUTAGE_TEMPLATE_PATH
};

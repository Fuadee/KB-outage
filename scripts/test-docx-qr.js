#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const PizZip = require("pizzip");
const {
  generateOutageDocxBuffer,
  OUTAGE_TEMPLATE_PATH
} = require("../src/lib/docs/outage-docx-template.js");

const OUTPUT_DIR = path.join(process.cwd(), "test-output");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "outage-test.docx");

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

const readDocumentXml = (docBuffer, label) => {
  try {
    const zip = new PizZip(docBuffer);
    const documentXml = zip.file("word/document.xml")?.asText();
    if (!documentXml) {
      console.warn(`${label}: word/document.xml missing.`);
    }
    return documentXml ?? "";
  } catch (error) {
    console.warn(`${label}: unable to read word/document.xml.`, error);
    return "";
  }
};

const diffMedia = (templateMedia, outputMedia) => {
  const templateSet = new Set(templateMedia);
  return outputMedia.filter((entry) => !templateSet.has(entry));
};

const run = async () => {
  let templateBuffer;
  try {
    templateBuffer = await fs.readFile(OUTAGE_TEMPLATE_PATH);
  } catch (error) {
    console.error("Template not found:", OUTAGE_TEMPLATE_PATH);
    process.exit(1);
    return;
  }

  const templateXml = readDocumentXml(templateBuffer, "TEMPLATE");
  const templateHasImageTag = templateXml.includes("{%MAP_QR}");
  const templateHasWrongImageTag = templateXml.includes("{%MAP_QR%}");
  if (templateHasWrongImageTag) {
    console.warn(
      "WARNING: Template contains {%MAP_QR%}. Use {%MAP_QR} (no trailing %})."
    );
  }

  const payload = {
    doc_issue_date: "2026-02-28",
    doc_purpose: "Test DOCX QR rendering",
    doc_area_title: "Test Area",
    doc_time_start: "08:00",
    doc_time_end: "12:00",
    doc_area_detail: "Automated QR embedding test.",
    map_link: "https://maps.google.com/?q=8.0,98.9"
  };
  const job = {
    outage_date: "2026-02-28",
    equipment_code: "115KV"
  };

  let outputBuffer;
  try {
    outputBuffer = await generateOutageDocxBuffer({ payload, job });
  } catch (error) {
    console.error("Failed to generate DOCX buffer.", error);
    process.exit(1);
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, outputBuffer);

  const templateMedia = listMediaEntries(templateBuffer);
  const outputMedia = listMediaEntries(outputBuffer);
  const newMedia = diffMedia(templateMedia, outputMedia);
  const outputXml = readDocumentXml(outputBuffer, "OUTPUT");
  const hasRawPngInXml = outputXml.includes("�PNG");

  console.log(`TEMPLATE MEDIA: ${JSON.stringify(templateMedia)}`);
  console.log(`OUTPUT MEDIA: ${JSON.stringify(outputMedia)}`);
  console.log(`NEW MEDIA: ${JSON.stringify(newMedia)}`);
  console.log(`HAS_RAW_PNG_IN_XML: ${hasRawPngInXml}`);
  console.log(`TEMPLATE_HAS_IMAGE_TAG: ${templateHasImageTag}`);

  const pass = newMedia.length >= 1 && !hasRawPngInXml;
  if (pass) {
    console.log(`RESULT: PASS (saved to ${OUTPUT_PATH})`);
    process.exit(0);
  } else {
    console.error("RESULT: FAIL");
    if (newMedia.length === 0) {
      console.error(
        "Diagnostic: No new media entries under word/media/ in output."
      );
    }
    if (hasRawPngInXml) {
      console.error(
        "Diagnostic: document.xml contains raw PNG bytes; image may be inline."
      );
    }
    process.exit(1);
  }
};

run();

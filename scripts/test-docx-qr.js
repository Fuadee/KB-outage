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
const PLACEHOLDER_QR_IMAGE = "word/media/image2.png";

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

const getFileHash = (buffer) => {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const readMediaFile = (docBuffer, filename) => {
  const zip = new PizZip(docBuffer);
  const entry = zip.file(filename);
  return entry?.asNodeBuffer() ?? null;
};

const findPlaceholderEntryName = (zip) => {
  const media = zip.file(/^word\/media\//i).map((entry) => entry.name);
  return (
    media.find(
      (name) => name.toLowerCase() === PLACEHOLDER_QR_IMAGE.toLowerCase()
    ) ?? null
  );
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

  const templateZip = new PizZip(templateBuffer);
  const templatePlaceholderEntryName = findPlaceholderEntryName(templateZip);
  if (!templatePlaceholderEntryName) {
    console.error("Template missing word/media/image2.png placeholder.");
    process.exit(1);
    return;
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
  const outputXml = readDocumentXml(outputBuffer, "OUTPUT");
  const outputZip = new PizZip(outputBuffer);
  const outputPlaceholderEntryName = findPlaceholderEntryName(outputZip);
  const outputHasPlaceholder = outputMedia.includes(
    outputPlaceholderEntryName ?? ""
  );
  const templateHasPlaceholder = templateMedia.includes(
    templatePlaceholderEntryName
  );
  const templatePlaceholderBuffer = readMediaFile(
    templateBuffer,
    templatePlaceholderEntryName
  );
  const outputPlaceholderBuffer = outputPlaceholderEntryName
    ? readMediaFile(outputBuffer, outputPlaceholderEntryName)
    : null;
  const templateHash = templatePlaceholderBuffer
    ? getFileHash(templatePlaceholderBuffer)
    : null;
  const outputHash = outputPlaceholderBuffer
    ? getFileHash(outputPlaceholderBuffer)
    : null;
  const image2Changed = Boolean(
    templateHash && outputHash && templateHash !== outputHash
  );
  const hasRawPngInXml = /data:image\/png;base64/i.test(outputXml);

  console.log(`TEMPLATE MEDIA: ${JSON.stringify(templateMedia)}`);
  console.log(`OUTPUT MEDIA: ${JSON.stringify(outputMedia)}`);
  console.log(`TEMPLATE_IMAGE2_SHA256: ${templateHash ?? "missing"}`);
  console.log(`OUTPUT_IMAGE2_SHA256: ${outputHash ?? "missing"}`);
  console.log(`IMAGE2_CHANGED: ${image2Changed}`);
  console.log(`HAS_RAW_PNG_IN_XML: ${hasRawPngInXml}`);

  const pass =
    templateHasPlaceholder &&
    outputHasPlaceholder &&
    image2Changed &&
    !hasRawPngInXml;
  if (pass) {
    console.log(`RESULT: PASS (saved to ${OUTPUT_PATH})`);
    process.exit(0);
  } else {
    console.error("RESULT: FAIL");
    if (!templateHasPlaceholder) {
      console.error(
        "Diagnostic: Placeholder image missing from template media entries."
      );
    }
    if (!outputHasPlaceholder) {
      console.error(
        "Diagnostic: Placeholder image missing from output media entries."
      );
    }
    if (!image2Changed) {
      console.error(
        "Diagnostic: Placeholder image content did not change in output."
      );
    }
    process.exit(1);
  }
};

run();

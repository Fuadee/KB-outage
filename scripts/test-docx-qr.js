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
const PLACEHOLDER_QR_IMAGE = "word/media/qr_placeholder.png";

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

const containsInvalidXmlChars = (xml) =>
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml) || xml.includes("\uFFFD");

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

const resolvePlaceholderImage = (zip) => {
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

  const largest = pngEntries.reduce((current, entry) => {
    const buffer = entry.asNodeBuffer();
    const size = buffer.length;
    if (!current || size > current.size) {
      return { name: entry.name, size };
    }
    return current;
  }, null);

  return largest?.name ?? null;
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
  const placeholderName = resolvePlaceholderImage(templateZip);
  if (!placeholderName) {
    console.error("Template has no PNG placeholder under word/media/.");
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
  const hasInvalidXmlChars = containsInvalidXmlChars(outputXml);
  const outputHasPlaceholder = outputMedia.includes(placeholderName);
  const templateHasPlaceholder = templateMedia.includes(placeholderName);
  const templatePlaceholderBuffer = readMediaFile(
    templateBuffer,
    placeholderName
  );
  const outputPlaceholderBuffer = readMediaFile(outputBuffer, placeholderName);
  const templateHash = templatePlaceholderBuffer
    ? getFileHash(templatePlaceholderBuffer)
    : null;
  const outputHash = outputPlaceholderBuffer
    ? getFileHash(outputPlaceholderBuffer)
    : null;
  const placeholderReplaced =
    templateHash && outputHash && templateHash !== outputHash;

  console.log(`TEMPLATE MEDIA: ${JSON.stringify(templateMedia)}`);
  console.log(`OUTPUT MEDIA: ${JSON.stringify(outputMedia)}`);
  console.log(`PLACEHOLDER_FILE: ${placeholderName}`);
  console.log(`TEMPLATE_HAS_PLACEHOLDER: ${templateHasPlaceholder}`);
  console.log(`OUTPUT_HAS_PLACEHOLDER: ${outputHasPlaceholder}`);
  console.log(`PLACEHOLDER_REPLACED: ${Boolean(placeholderReplaced)}`);
  console.log(`HAS_INVALID_XML_CHARS: ${hasInvalidXmlChars}`);

  const pass =
    templateHasPlaceholder &&
    outputHasPlaceholder &&
    placeholderReplaced &&
    !hasInvalidXmlChars;
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
    if (!placeholderReplaced) {
      console.error(
        "Diagnostic: Placeholder image content did not change in output."
      );
    }
    if (hasInvalidXmlChars) {
      console.error(
        "Diagnostic: document.xml contains invalid XML characters."
      );
    }
    process.exit(1);
  }
};

run();

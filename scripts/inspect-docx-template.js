#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "outage_template.docx"
);
const TAG_TO_CHECK = "MAP_QR";
const EXACT_TAG = "{{MAP_QR}}";
const TAG_REGEX = /\{\{\s*MAP_QR\s*\}\}/g;
const TEXTBOX_MARKERS = ["w:txbxContent", "v:textbox", "wps:"];

const args = process.argv.slice(2);
const inputPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : DEFAULT_TEMPLATE_PATH;

const readDocx = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return new PizZip(buffer);
};

const getZipEntries = (zip) => {
  const entries = zip.file(/./);
  return entries.map((entry) => ({
    name: entry.name,
    text: entry.asText()
  }));
};

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

const getSnippets = (xml, windowSize = 120) => {
  const regex = /MAP_QR|\{\{|\}\}/g;
  const snippets = [];
  let match = regex.exec(xml);
  while (match) {
    const start = Math.max(0, match.index - windowSize);
    const end = Math.min(xml.length, match.index + windowSize);
    const rawSnippet = xml.slice(start, end);
    const cleanedSnippet = rawSnippet.replace(/\s+/g, " ").trim();
    snippets.push({
      index: match.index,
      marker: match[0],
      snippet: cleanedSnippet
    });
    match = regex.exec(xml);
  }
  return snippets;
};

const hasTextboxMarkers = (xml) =>
  TEXTBOX_MARKERS.some((marker) => xml.includes(marker));

const run = () => {
  if (!fs.existsSync(inputPath)) {
    console.error(`DOCX file not found: ${inputPath}`);
    process.exit(1);
  }

  const zip = readDocx(inputPath);
  const entries = getZipEntries(zip);
  const xmlEntries = entries.filter((entry) =>
    /\.xml$|\.rels$/i.test(entry.name)
  );
  const issueSet = new Set();
  let foundInDocument = false;

  const matches = xmlEntries.filter((entry) => entry.text.includes("MAP_QR"));

  console.log("DOCX Template Inspector");
  console.log(`Template: ${inputPath}`);
  console.log(`XML parts scanned: ${xmlEntries.length}`);
  console.log(`Parts containing MAP_QR: ${matches.length}`);
  if (matches.length === 0) {
    console.log("No MAP_QR markers found.");
    return;
  }

  console.log("");
  console.log("Parts with template markers:");
  matches.forEach((entry) => {
    console.log(`- ${entry.name}`);
  });

  console.log("");
  console.log("Detailed report:");
  matches.forEach((entry) => {
    const tagAnalysis = analyzeTagSplit(entry.text, EXACT_TAG);
    const hasTagMatch = TAG_REGEX.test(entry.text);
    TAG_REGEX.lastIndex = 0;
    const exactTagPresent = entry.text.includes(EXACT_TAG);
    const snippets = getSnippets(entry.text);
    const textboxDetected = hasTextboxMarkers(entry.text);
    const isHeaderFooter = /word\/(header|footer)\d*\.xml$/i.test(entry.name);
    const isDocument = entry.name === "word/document.xml";

    if (isDocument && hasTagMatch) {
      foundInDocument = true;
    }

    console.log("");
    console.log(`Part: ${entry.name}`);
    console.log(`Document body: ${isDocument ? "yes" : "no"}`);
    console.log(`Header/footer: ${isHeaderFooter ? "yes" : "no"}`);
    console.log(`Textbox/shape markers: ${textboxDetected ? "yes" : "no"}`);

    if (tagAnalysis.xmlContainsTag) {
      console.log(`MAP_QR tag: contiguous in XML`);
    } else if (tagAnalysis.isSplitAcrossNodes) {
      console.log(`MAP_QR tag: split across <w:t> nodes`);
      issueSet.add(
        "MAP_QR is split across multiple runs. Re-type {{MAP_QR}} in a single run."
      );
    } else if (tagAnalysis.concatenatedContainsTag) {
      console.log(
        `MAP_QR tag: present across text nodes (check formatting runs)`
      );
      issueSet.add(
        "MAP_QR is broken by formatting runs. Remove styling inside the tag."
      );
    } else {
      console.log("MAP_QR tag: not found in this part");
    }

    if (hasTagMatch && !exactTagPresent) {
      console.log("MAP_QR tag formatting: found with spaces ({{ MAP_QR }})");
      issueSet.add("Use the exact {{MAP_QR}} tag without spaces.");
    } else if (!hasTagMatch && entry.text.includes(TAG_TO_CHECK)) {
      console.log("MAP_QR tag formatting: missing {{ }} delimiters");
      issueSet.add("Ensure MAP_QR is wrapped with {{ }} delimiters.");
    } else if (exactTagPresent) {
      console.log("MAP_QR tag formatting: exact {{MAP_QR}}");
    }

    if (snippets.length === 0) {
      console.log("No MAP_QR-related markers found in this part.");
      return;
    }

    console.log("Matches:");
    snippets.forEach((snippet, index) => {
      console.log(
        `  ${index + 1}. marker=${snippet.marker} index=${snippet.index}`
      );
      console.log(`     snippet: ${snippet.snippet}`);
    });

    if (textboxDetected && hasTagMatch) {
      issueSet.add(
        "MAP_QR appears inside a textbox/shape. Move it to the main document body."
      );
    }
    if (isHeaderFooter && hasTagMatch) {
      issueSet.add(
        "MAP_QR appears in a header/footer. Move it to word/document.xml."
      );
    }
  });

  if (!foundInDocument) {
    issueSet.add(
      "MAP_QR is not in word/document.xml. Place it in the main document body."
    );
  }

  if (issueSet.size > 0) {
    console.log("");
    console.log("Actionable fixes:");
    issueSet.forEach((issue) => console.log(`- ${issue}`));
  } else {
    console.log("");
    console.log("No common MAP_QR issues detected.");
  }
};

try {
  run();
} catch (error) {
  console.error("Inspector failed:", error);
  process.exit(1);
}

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "outage_template.docx"
);
const TAG_TO_CHECK = "{{DOC_ISSUE_DATE}}";
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
  const regex = /\{\{|\}\}/g;
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

  const matches = xmlEntries.filter((entry) =>
    entry.text.includes("{{") || entry.text.includes("}}")
  );

  console.log("DOCX Template Inspector");
  console.log(`Template: ${inputPath}`);
  console.log(`XML parts scanned: ${xmlEntries.length}`);
  console.log(`Parts containing {{ or }}: ${matches.length}`);
  if (matches.length === 0) {
    console.log("No template markers found.");
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
    const tagAnalysis = analyzeTagSplit(entry.text, TAG_TO_CHECK);
    const snippets = getSnippets(entry.text);
    const textboxDetected = hasTextboxMarkers(entry.text);

    console.log("");
    console.log(`Part: ${entry.name}`);
    console.log(`Textbox/shape markers: ${textboxDetected ? "yes" : "no"}`);

    if (tagAnalysis.xmlContainsTag) {
      console.log(`DOC_ISSUE_DATE tag: contiguous in XML`);
    } else if (tagAnalysis.isSplitAcrossNodes) {
      console.log(`DOC_ISSUE_DATE tag: split across <w:t> nodes`);
    } else if (tagAnalysis.concatenatedContainsTag) {
      console.log(
        `DOC_ISSUE_DATE tag: present across text nodes (check formatting runs)`
      );
    } else {
      console.log("DOC_ISSUE_DATE tag: not found in this part");
    }

    if (snippets.length === 0) {
      console.log("No {{ or }} markers found in this part.");
      return;
    }

    console.log("Matches:");
    snippets.forEach((snippet, index) => {
      console.log(
        `  ${index + 1}. marker=${snippet.marker} index=${snippet.index}`
      );
      console.log(`     snippet: ${snippet.snippet}`);
    });
  });
};

try {
  run();
} catch (error) {
  console.error("Inspector failed:", error);
  process.exit(1);
}

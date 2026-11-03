import type PizZip from "pizzip";

/** Upgrade only the old time placeholders, retaining run formatting and all other template parts. */
export function prepareOutageTimePlaceholder(zip: PizZip, compact = false) {
  let supportsPeriods = false;
  for (const part of zip.file(/^word\/(?:document|header\d+|footer\d+)\.xml$/)) {
    let xml = part.asText().replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
      // Read only non-self-closing text nodes; keep exact offsets into the XML.
      const textNodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*?[^/])?>([\s\S]*?)<\/w:t>/g)];
      const text = textNodes.map(node => node[1]).join("");
      const match = /\{\{DOC_TIME_START\}\}\s*[–—-]\s*\{\{DOC_TIME_END\}\}\s*น\./.exec(text);
      if (!match) return paragraph;
      const start = match.index, end = start + match[0].length;
      let offset = 0;
      const edits = textNodes.map(node => {
        const from = offset, to = from + node[1].length;
        offset = to;
        if (to <= start || from >= end) return null;
        const a = Math.max(0, start - from), b = Math.min(node[1].length, end - from);
        const contentStart = node.index! + node[0].indexOf(">") + 1;
        return { start: contentStart + a, end: contentStart + b,
          value: from <= start ? "{{DOC_TIME_RANGES}}" : "" };
      }).filter(edit => edit !== null);
      for (const edit of edits.reverse()) paragraph = paragraph.slice(0, edit.start) + edit.value + paragraph.slice(edit.end);
      return paragraph;
    });
    if (compact) {
      // Three ranges wrap in the existing template. Reclaim just the adjacent empty
      // spacer so its QR contact captions do not spill onto an otherwise blank page.
      const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
      const timeIndex = paragraphs.findIndex(paragraph => paragraph[0].includes("{{DOC_TIME_RANGES}}"));
      const before = paragraphs[timeIndex - 1];
      if (before && !before[0].replace(/<[^>]+>/g, "").trim() &&
          !/<w:(?:drawing|pict|object|br|sectPr)\b/.test(before[0])) {
        xml = xml.slice(0, before.index) + xml.slice(before.index! + before[0].length);
      }
      let afterTime = false;
      xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
        const remove = afterTime && !paragraph.replace(/<[^>]+>/g, "").trim() &&
          !/<w:(?:drawing|pict|object|br|sectPr)\b/.test(paragraph);
        afterTime = paragraph.includes("{{DOC_TIME_RANGES}}");
        if (remove) return "";
        return afterTime && !/<w:spacing\b/.test(paragraph)
          ? paragraph.replace("<w:pPr>", '<w:pPr><w:spacing w:after="80"/>') : paragraph;
      });
    }
    if (xml.replace(/<[^>]+>/g, "").includes("{{DOC_TIME_RANGES}}")) supportsPeriods = true;
    zip.file(part.name, xml);
  }
  return supportsPeriods;
}

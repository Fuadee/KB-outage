const fs = require("fs");
const PizZip = require("pizzip");

const buf = fs.readFileSync("templates/outage_template.docx");
const zip = new PizZip(buf);

const media = zip
  .file(/word\/media\//)
  .map((f) => f.name);

console.log("TEMPLATE MEDIA FILES:");
console.log(media);

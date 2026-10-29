import fs from "node:fs";
import path from "node:path";
import { documentToStructure } from "../server/lib/syllabus/parse";

const KIT = "/Users/manojgeraicloud.com/Downloads/SpecForge_Kit/samples";

async function asFile(name: string) {
  return new File([fs.readFileSync(path.join(KIT, name))], name);
}

async function main() {
  const s = await documentToStructure(await asFile("sample_course_spec.docx"));
  const b = await documentToStructure(await asFile("sample_blueprint.doc"));
  fs.writeFileSync("/tmp/spec-text.txt", s.text);
  fs.writeFileSync("/tmp/bp-text.txt", b.text);
  fs.writeFileSync("/tmp/spec-tables.json", JSON.stringify(s.tables, null, 1));
  console.log("spec chars", s.text.length, "tables", s.tables.length, "bp chars", b.text.length);
}

void main();

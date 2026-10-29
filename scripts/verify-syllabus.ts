import { mapWarnings, runChecks } from "../server/lib/syllabus/engine";
import { buildSpecforgeOutput } from "../server/lib/syllabus/specforge";
import { loadDoc } from "../server/lib/syllabus/store";

const doc = loadDoc();
if (!doc.spec) {
  console.log("No output yet. Upload a spec in the app first.");
  process.exit(1);
}

const checks = runChecks(doc);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.label}: ${check.message}`);
}
for (const warning of mapWarnings(doc)) console.log(`WARN  ${warning}`);

let outputOk = true;
try {
  const output = buildSpecforgeOutput(doc);
  console.log(
    `PASS  specforge_output.v1: ${output.course_outcomes.length} CO(s), ${output.units.length} unit(s), ${output.defects.length} defect(s)`,
  );
} catch (err) {
  outputOk = false;
  console.log(`FAIL  specforge_output.v1: ${err instanceof Error ? err.message : err}`);
}

process.exit(checks.every((c) => c.pass) && outputOk ? 0 : 1);

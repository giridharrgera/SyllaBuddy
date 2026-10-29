import { mapWarnings, runChecks } from "../server/lib/syllabus/engine";
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
process.exit(checks.every((c) => c.pass) ? 0 : 1);

import { MAP_COLUMNS, type MapColumn, type SyllabusDoc } from "../../../app/lib/syllabuddy-types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHADES = ["", "#e0e7ff", "#a5b4fc", "#6366f1"];

function table(head: string[], rows: string[], className = ""): string {
  return `<table class="${className}"><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr>${rows.join("")}</table>`;
}

function coverageOf(doc: SyllabusDoc): Record<string, string[]> {
  const spec = doc.spec!;
  const supplied = spec.coCoverage ?? {};
  const components = spec.assessment.map((item) => item.component);
  const coverage: Record<string, string[]> = {};
  for (const co of spec.cos) {
    const names = supplied[co.id] ?? supplied[co.id.replace("CO-", "CO")];
    coverage[co.id] = names ? names.filter((name) => components.includes(name)) : components;
  }
  return coverage;
}

export function renderHtml(doc: SyllabusDoc): string {
  const spec = doc.spec;
  if (!spec) throw new Error("Nothing to export yet.");
  const templateLabel = spec.template === "integrated" ? "Integrated template (Theory + Lab)" : "Non-lab template";
  const { L, T, P, C } = spec.credits;
  const unitHours = spec.units.reduce((sum, unit) => sum + unit.hours, 0);
  const weightage = spec.assessment.reduce((sum, item) => sum + item.weightage, 0);
  const teachingTotal = spec.hours.lectures + spec.hours.lab + spec.hours.testsExams;
  const coverage = coverageOf(doc);

  const header = `<table>
<tr><th>Course Title</th><td>${esc(spec.title)}</td><th>Course Code</th><td>${esc(spec.code)}</td></tr>
<tr><th>Course Type</th><td>${esc(spec.courseType)}</td><th>Department</th><td>${esc(spec.department)}</td></tr>
</table>`;

  const creditsRows = [
    ["Number of Credits", String(C)],
    ["Credit Structure (Lecture: Tutorial: Practical)", `${L}:${T}:${P}`],
    ["Total Hours of Interaction", String(teachingTotal)],
    ["Department Responsible", spec.department],
    ["Total Course Marks", "100"],
    ["Pass Criterion", "As per the Academic Regulations"],
    ["Attendance Requirement", "As per the Academic Regulations"],
  ].map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`);

  const coRows = spec.cos.map(
    (co) => `<tr><td>${esc(co.id)}</td><td>${esc(co.text)}</td><td>${co.bloom} ${esc(co.bloomName)}</td></tr>`,
  );
  const unitRows = spec.units.map(
    (unit) =>
      `<tr><td>${esc(unit.no)}</td><td>${esc(unit.title)}</td><td>${esc(unit.content)}</td><td>${esc(unit.lab ?? "")}</td><td>${unit.hours}</td></tr>`,
  );

  const matrixHead = MAP_COLUMNS.map((col) => `<th>${col}</th>`).join("");
  const matrixRows = spec.cos
    .map((co) => {
      const cells = MAP_COLUMNS.map((col) => {
        const cell = doc.map[co.id]?.[col];
        const value = cell?.value ?? 0;
        return `<td style="background:${SHADES[value]}" title="${esc(cell?.reason ?? "")}">${value || ""}</td>`;
      }).join("");
      return `<tr><th>${esc(co.id)}</th>${cells}</tr>`;
    })
    .join("");
  const justifications = spec.cos.flatMap((co) =>
    (Object.entries(doc.map[co.id] ?? {}) as [MapColumn, { value: number; reason: string }][])
      .filter(([, cell]) => cell.value > 0)
      .map(([col, cell]) => `<li><b>${esc(co.id)} → ${esc(col)} (${cell.value})</b>: ${esc(cell.reason)}</li>`),
  );

  const teachingRows = [
    ["Face to Face Lectures", spec.hours.lectures],
    ["Practical Work / Laboratory", spec.hours.lab],
    ["Mid Terms, Laboratory Examination / Written Examination, Presentations", spec.hours.testsExams],
    ["Total Duration in Hours", teachingTotal],
  ].map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`);

  const assessmentRows = spec.assessment.map(
    (item) => `<tr><td>${esc(item.component)}</td><td>${item.weightage}%</td></tr>`,
  );

  const components = spec.assessment.map((item) => item.component);
  const coverageRows = spec.cos.map((co) => {
    const covered = coverage[co.id] ?? [];
    const cells = components.map((name) => `<td>${covered.includes(name) ? "X" : ""}</td>`).join("");
    return `<tr><th>${esc(co.id)}</th>${cells}</tr>`;
  });

  const skillRows = (spec.skills ?? []).map(
    (row, index) => `<tr><td>${index + 1}.</td><td>${esc(row.skill)}</td><td>${esc(row.method)}</td></tr>`,
  );

  const annexure = MAP_COLUMNS.map((col) => `<li><b>${col}</b>: ${esc(doc.annexure[col])}</li>`).join("");
  const changes = doc.changes.map((change) => `<li>${esc(change)}</li>`).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(spec.code)} ${esc(spec.title)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#1f2937;margin:32px;font-size:13px;line-height:1.5}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 8px;color:#4338ca}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th,td{border:1px solid #d1d5db;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f5f5f4}.matrix td,.matrix th{text-align:center;width:6%}
.muted{color:#6b7280}
</style></head>
<body>
<h1>Course Specifications: ${esc(spec.title)}</h1>
<p class="muted">${esc(templateLabel)} · Status: ${esc(doc.status)}</p>
${header}
<h2>1. Course Summary</h2><p>${esc(spec.summary)}</p>
<h2>2. Course Size and Credits</h2>
${table(["Item", "Value"], creditsRows)}
<h2>3. Course Outcomes (COs)</h2>
<p>After the successful completion of this course, the student will be able to:</p>
${table(["CO", "Outcome", "Bloom level"], coRows)}
<h2>4. Course Contents</h2>
${table(["Unit", "Title", "Content", "Lab Exercises", "Hours"], [...unitRows, `<tr><td colspan="4"><b>Total</b></td><td><b>${unitHours}</b></td></tr>`])}
<h2>5. Course Map (CO-PO-PSO Map)</h2>
<table class="matrix"><tr><th>CO</th>${matrixHead}</tr>${matrixRows}</table>
<p class="muted">3: Very Strong Contribution, 2: Strong Contribution, 1: Moderate Contribution, blank: no contribution.</p>
<h2>6. Course Teaching and Learning Methods</h2>
${table(["Teaching and Learning Methods", "Total Duration in Hours"], teachingRows)}
<h2>7. Course Assessment and Reassessment</h2>
<p>The evaluation questions are set to measure the attainment of the COs. The components and their weightages are listed below, followed by the focus of each CO on each component.</p>
${table(["Component", "Weightage"], [...assessmentRows, `<tr><td><b>Total</b></td><td><b>${weightage}%</b></td></tr>`])}
${table(["Course Outcome", ...components], coverageRows, "matrix")}
<h2>8. Achieving COs</h2>
${
  skillRows.length
    ? table(["S. No", "Curriculum and Capabilities Skills", "How imparted during the course"], skillRows)
    : `<p>The capabilities below are imparted through the teaching and assessment methods listed above.</p>`
}
<h2>9. Course Resources</h2>
<p style="white-space:pre-line">${esc(spec.resources)}</p>
<h2>Annexure A</h2><ul>${annexure}</ul>
<h2>Mapping justifications</h2><ul>${justifications.join("")}</ul>
<h2>Changes made</h2><ul>${changes || "<li>None</li>"}</ul>
</body></html>`;
}

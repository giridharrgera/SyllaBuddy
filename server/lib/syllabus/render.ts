import { MAP_COLUMNS, type SyllabusDoc } from "../../../app/lib/syllabuddy-types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHADES = ["", "#e0e7ff", "#a5b4fc", "#6366f1"];

export function renderHtml(doc: SyllabusDoc): string {
  const spec = doc.spec;
  if (!spec) throw new Error("Nothing to export yet.");
  const templateLabel = spec.template === "integrated" ? "Integrated template (Theory + Lab)" : "Non-lab template";
  const { L, T, P, C } = spec.credits;
  const unitHours = spec.units.reduce((sum, u) => sum + u.hours, 0);
  const weightage = spec.assessment.reduce((sum, a) => sum + a.weightage, 0);

  const coRows = spec.cos
    .map((co) => `<tr><td>${esc(co.id)}</td><td>${esc(co.text)}</td><td>${co.bloom} ${esc(co.bloomName)}</td></tr>`)
    .join("");
  const unitRows = spec.units
    .map((u) => `<tr><td>${esc(u.no)}</td><td>${esc(u.title)}</td><td>${esc(u.content)}</td><td>${u.hours}</td></tr>`)
    .join("");
  const assessmentRows = spec.assessment
    .map((a) => `<tr><td>${esc(a.component)}</td><td>${a.weightage}%</td></tr>`)
    .join("");
  const matrixHead = MAP_COLUMNS.map((c) => `<th>${c}</th>`).join("");
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
  const annexure = MAP_COLUMNS.map((col) => `<li><b>${col}</b>: ${esc(doc.annexure[col])}</li>`).join("");
  const changes = doc.changes.map((c) => `<li>${esc(c)}</li>`).join("");

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
<h1>Course Specification</h1>
<p class="muted">${esc(templateLabel)} · Status: ${esc(doc.status)}</p>
<table>
<tr><th>Course code</th><td>${esc(spec.code)}</td><th>Course title</th><td>${esc(spec.title)}</td></tr>
<tr><th>L : T : P</th><td>${L} : ${T} : ${P}</td><th>Credits</th><td>${C}</td></tr>
</table>
<h2>1. Course Summary</h2><p>${esc(spec.summary)}</p>
<h2>3. Course Outcomes (COs)</h2>
<table><tr><th>CO</th><th>Outcome</th><th>Bloom level</th></tr>${coRows}</table>
<h2>4. Course Contents</h2>
<table><tr><th>Unit</th><th>Title</th><th>Content</th><th>Hours</th></tr>${unitRows}
<tr><td colspan="3"><b>Total</b></td><td><b>${unitHours}</b></td></tr></table>
<h2>5. Course Map (CO-PO-PSO Map)</h2>
<table class="matrix"><tr><th>CO</th>${matrixHead}</tr>${matrixRows}</table>
<h2>7. Course Assessment and Reassessment</h2>
<table><tr><th>Component</th><th>Weightage</th></tr>${assessmentRows}
<tr><td><b>Total</b></td><td><b>${weightage}%</b></td></tr></table>
<h2>9. Course Resources</h2><p style="white-space:pre-line">${esc(spec.resources)}</p>
<h2>Annexure A</h2><ul>${annexure}</ul>
<h2>Changes made</h2><ul>${changes || "<li>None</li>"}</ul>
</body></html>`;
}


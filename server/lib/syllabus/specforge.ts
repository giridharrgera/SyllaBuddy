import {
  MAP_COLUMNS,
  type Check,
  type MapColumn,
  type SyllabusDoc,
} from "../../../app/lib/syllabuddy-types";

type Source = "spec" | "blueprint" | "template";

interface Defect {
  code: string;
  location: { source: Source; section: number | null; refs: string[] };
  description: string;
  fix: string;
}

export interface SpecForgeOutput {
  schema_version: "1.0";
  input_id: string;
  template: "integrated" | "non_lab";
  course: {
    title: string;
    code: string;
    department: string;
    credits_ltp: string;
    course_type: string;
    summary: string;
  };
  course_outcomes: { id: string; statement: string; bloom_level: number }[];
  units: { number: number; title: string; lab: string | null }[];
  co_po_pso_map: Record<string, Record<string, { level: 1 | 2 | 3; justification?: string } | null>>;
  teaching_hours: Record<string, number>;
  assessment: {
    components: { name: string; weight_percent: number }[];
    co_coverage: Record<string, string[]>;
  };
  defects: Defect[];
}

const ROMAN: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

const CHECK_DEFECTS: Record<string, { code: string; section: number }> = {
  "CO counts agree": { code: "CO_MISSING_IN_TABLE", section: 5 },
  "Hours add up": { code: "HOURS_INCONSISTENT", section: 4 },
  "Weightages total 100%": { code: "WEIGHTAGE_INCONSISTENT", section: 7 },
  "No leftover sample text": { code: "PLACEHOLDER_TEXT", section: 1 },
  "Summary matches syllabus": { code: "SUMMARY_SYLLABUS_MISMATCH", section: 1 },
};

function unitNumber(no: string, index: number): number {
  const parsed = Number.parseInt(no, 10);
  if (!Number.isNaN(parsed)) return parsed;
  return ROMAN[no.toUpperCase()] ?? index + 1;
}

function changeDefect(text: string): Defect {
  const base = { source: "spec" as Source, section: null as number | null, refs: [] as string[] };
  if (/typo/i.test(text)) return { code: "TYPO_OR_FORMAT", location: base, description: text, fix: "Corrected spelling." };
  if (/blueprint/i.test(text)) {
    return { code: "OTHER", location: { ...base, source: "blueprint", section: 4 }, description: text, fix: "Unit content taken from the blueprint." };
  }
  if (/hours/i.test(text)) return { code: "HOURS_INCONSISTENT", location: { ...base, section: 4 }, description: text, fix: "Hours were redistributed across units." };
  if (/summary/i.test(text)) return { code: "SUMMARY_SYLLABUS_MISMATCH", location: { ...base, section: 1 }, description: text, fix: "Summary aligned with the syllabus." };
  if (/removed|sample|leftover/i.test(text)) return { code: "PLACEHOLDER_TEXT", location: { ...base, section: 1 }, description: text, fix: "Removed leftover text." };
  return { code: "OTHER", location: base, description: text, fix: "Applied during spec generation." };
}

export function buildSpecForge(doc: SyllabusDoc, checks: Check[]): SpecForgeOutput {
  const spec = doc.spec;
  if (!spec) throw new Error("Nothing to export yet.");

  const coIds = new Map(spec.cos.map((co, index) => [co.id, `CO-${index + 1}`]));
  const unitHours = spec.units.reduce((sum, u) => sum + u.hours, 0);
  const { L, T, P } = spec.credits;

  const coMap: SpecForgeOutput["co_po_pso_map"] = {};
  for (const co of spec.cos) {
    const row: SpecForgeOutput["co_po_pso_map"][string] = {};
    for (const col of MAP_COLUMNS as readonly MapColumn[]) {
      const cell = doc.map[co.id]?.[col];
      if (!cell || cell.value === 0) continue;
      row[col] = cell.reason ? { level: cell.value, justification: cell.reason } : { level: cell.value };
    }
    coMap[coIds.get(co.id) ?? co.id] = row;
  }

  const failing = checks.flatMap((check): Defect[] => {
    const mapped = CHECK_DEFECTS[check.label];
    if (check.pass || !mapped) return [];
    return [
      {
        code: mapped.code,
        location: { source: "spec", section: mapped.section, refs: [] },
        description: check.message,
        fix: `Resolve: ${check.label.toLowerCase()}.`,
      },
    ];
  });

  return {
    schema_version: "1.0",
    input_id: spec.code || "UNKNOWN",
    template: spec.template === "non-lab" ? "non_lab" : "integrated",
    course: {
      title: spec.title,
      code: spec.code,
      department: "",
      credits_ltp: `${L}:${T}:${P}`,
      course_type: spec.template === "integrated" ? "Integrated (Theory + Lab)" : "Non-lab",
      summary: spec.summary,
    },
    course_outcomes: spec.cos.map((co) => ({
      id: coIds.get(co.id) ?? co.id,
      statement: co.text,
      bloom_level: co.bloom,
    })),
    units: spec.units.map((u, index) => ({
      number: unitNumber(u.no, index),
      title: u.title,
      lab: null,
    })),
    co_po_pso_map: coMap,
    teaching_hours: { lectures: unitHours, total: unitHours },
    assessment: {
      components: spec.assessment.map((a) => ({ name: a.component, weight_percent: a.weightage })),
      co_coverage: Object.fromEntries(spec.cos.map((co) => [coIds.get(co.id) ?? co.id, []])),
    },
    defects: [...failing, ...doc.changes.map(changeDefect)],
  };
}

import Ajv2020 from "ajv/dist/2020.js";
import {
  MAP_COLUMNS,
  type CourseOutcome,
  type MapCell,
  type MapColumn,
  type Spec,
  type SyllabusDoc,
} from "../../../app/lib/syllabuddy-types";
import { DEFAULT_INPUT_ID, IMPLEMENTATION_VERB, SAMPLE_TEXT, detectTemplate } from "./engine";
import { SPECFORGE_OUTPUT_SCHEMA } from "./specforge-schema";

export type SpecforgeTemplate = "integrated" | "non_lab";

export type DefectCode =
  | "CO_MISSING_IN_TABLE"
  | "CO_EXTRA_IN_TABLE"
  | "CO_ASSESSMENT_MISMATCH"
  | "PSO_COLUMN_MISMATCH"
  | "MAPPING_BLOOM_MISMATCH"
  | "MAPPING_UNSUPPORTED"
  | "WRONG_TEMPLATE"
  | "PLACEHOLDER_TEXT"
  | "SUMMARY_SYLLABUS_MISMATCH"
  | "LABEL_OR_TITLE_MISMATCH"
  | "HOURS_INCONSISTENT"
  | "WEIGHTAGE_INCONSISTENT"
  | "TYPO_OR_FORMAT"
  | "SECTION_NOT_IN_TEMPLATE"
  | "MARKS_INCONSISTENT"
  | "OTHER";

export interface SpecforgeDefect {
  code: DefectCode;
  location: {
    source: "spec" | "blueprint" | "template";
    section?: number | null;
    refs?: string[];
  };
  description: string;
  fix: string;
}

export interface SpecforgeMapCell {
  level: 1 | 2 | 3;
  justification: string;
}

export interface SpecforgeOutput {
  schema_version: "1.0";
  input_id: string;
  template: SpecforgeTemplate;
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
  co_po_pso_map: Record<string, Record<string, SpecforgeMapCell | null>>;
  teaching_hours: Record<string, number>;
  assessment: {
    components: { name: string; weight_percent: number }[];
    co_coverage: Record<string, string[]>;
  };
  defects: SpecforgeDefect[];
}

const SECTION = {
  summary: 1,
  cos: 3,
  units: 4,
  map: 5,
  assessment: 7,
  resources: 9,
} as const;

const PRACTICAL_COMPONENT = /lab|practical|project|assignment|seminar|presentation|viva|studio|workshop/i;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(SPECFORGE_OUTPUT_SCHEMA);

export function coId(id: string): string {
  const digits = id.match(/\d+/)?.[0] ?? "0";
  return `CO-${Number(digits)}`;
}

export function toSpecforgeTemplate(template: Spec["template"]): SpecforgeTemplate {
  return template === "non-lab" ? "non_lab" : "integrated";
}

function buildTeachingHours(spec: Spec): Record<string, number> {
  const unitHours = spec.units.reduce((sum, unit) => sum + (Number(unit.hours) || 0), 0);
  const lectures = spec.hours?.lectures ?? (unitHours || spec.credits.L + spec.credits.T);
  const lab = spec.hours?.lab ?? spec.credits.P;
  const testsExams = spec.hours?.testsExams ?? 0;
  return {
    lectures,
    lab,
    tests_exams: testsExams,
    total: lectures + lab + testsExams,
  };
}

function componentAssesses(name: string, co: CourseOutcome): boolean {
  if (!PRACTICAL_COMPONENT.test(name)) return true;
  return co.bloom >= 3 || IMPLEMENTATION_VERB.test(co.text);
}

const ASSESSED_PRACTICALLY = /lab|practical|project|assignment|seminar|presentation|viva|studio|workshop/i;
const STRONG_PO = new Set(["PO-3", "PO-5"]);

export function buildCoCoverage(cos: CourseOutcome[], spec: Spec): Record<string, string[]> {
  const supplied = spec.coCoverage ?? {};
  const coverage: Record<string, string[]> = {};
  for (const co of cos) {
    const id = coId(co.id);
    const names =
      supplied[id] ??
      supplied[co.id] ??
      spec.assessment
        .filter((item) => item.component && componentAssesses(item.component, co))
        .map((item) => item.component);
    coverage[id] = names.filter((name) => spec.assessment.some((item) => item.component === name));
  }
  return coverage;
}

export function uniqueCos(spec: Spec): CourseOutcome[] {
  const seen = new Set<string>();
  return spec.cos.filter((co) => {
    const id = coId(co.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildMap(doc: SyllabusDoc, cos: CourseOutcome[]): SpecforgeOutput["co_po_pso_map"] {
  const map: SpecforgeOutput["co_po_pso_map"] = {};
  for (const co of cos) {
    const cells = doc.map[co.id] ?? {};
    const row: Record<string, SpecforgeMapCell> = {};
    for (const col of MAP_COLUMNS) {
      const cell: MapCell | undefined = cells[col];
      if (!cell || cell.value <= 0) continue;
      row[col] = { level: cell.value as 1 | 2 | 3, justification: cell.reason ?? "" };
    }
    map[coId(co.id)] = row;
  }
  return map;
}

function unitNumber(no: string, index: number): number {
  const parsed = Number.parseInt(no, 10);
  return Number.isFinite(parsed) ? parsed : index + 1;
}

function sectionTitleKeywords(text: string): string[] {
  return text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
}

function buildDefects(doc: SyllabusDoc, spec: Spec, cos: CourseOutcome[], coverage: Record<string, string[]>): SpecforgeDefect[] {
  const defects: SpecforgeDefect[] = [];
  const add = (
    code: DefectCode,
    source: "spec" | "blueprint" | "template",
    description: string,
    fix: string,
    section?: number,
    refs?: string[],
  ) => {
    const location: SpecforgeDefect["location"] = { source, section: section ?? null, refs: refs ?? [] };
    defects.push({ code, location, description, fix });
  };
  const at = (code: DefectCode, description: string, fix: string, section?: number, refs?: string[]) =>
    add(code, "spec", description, fix, section, refs);

  const detected = detectTemplate(spec.credits, spec.courseType, spec.units);
  if (detected !== spec.template) {
    add(
      "WRONG_TEMPLATE",
      "template",
      `The ${spec.template} template was used, but credits ${spec.credits.L}:${spec.credits.T}:${spec.credits.P} and course type "${spec.courseType}" call for ${detected}.`,
      `Use the ${detected} template.`,
    );
  }

  if (SAMPLE_TEXT.test(spec.summary ?? "")) {
    add("PLACEHOLDER_TEXT", "template", "The course summary still contains sample or placeholder text.", "Replace it with a summary of this course.", SECTION.summary);
  }
  if (SAMPLE_TEXT.test(spec.resources ?? "")) {
    add("PLACEHOLDER_TEXT", "template", "The resources section still contains sample or placeholder text.", "List the actual textbooks and references.", SECTION.resources);
  }
  for (const co of cos) {
    if (SAMPLE_TEXT.test(co.text)) {
      add("PLACEHOLDER_TEXT", "template", `${coId(co.id)} still contains placeholder text.`, "Write it as one measurable outcome.", SECTION.cos, [coId(co.id)]);
    }
    if (/^CO\s*-?\s*\d+\s*[:\-–]/i.test(co.text)) {
      at("LABEL_OR_TITLE_MISMATCH", `${coId(co.id)} repeats its label inside the statement.`, "Remove the CO id from the statement text.", SECTION.cos, [coId(co.id)]);
    }
  }
  for (const unit of spec.units) {
    if (SAMPLE_TEXT.test(unit.content)) {
      at("PLACEHOLDER_TEXT", `Unit ${unit.no} still contains placeholder text.`, "Write the real unit content.", SECTION.units, [`Unit-${unit.no}`]);
    }
    if (/^unit\s*\d+/i.test(unit.title)) {
      at("LABEL_OR_TITLE_MISMATCH", `Unit ${unit.no} repeats the unit label in its title.`, "Remove the unit number from the title.", SECTION.units, [`Unit-${unit.no}`]);
    }
  }

  if (!spec.assessment.length) {
    at("CO_ASSESSMENT_MISMATCH", "No assessment components were found, so no CO is assessed.", "Add the assessment scheme with its component weights.", SECTION.assessment);
  }

  const meta = doc.parseMeta;
  const defined = new Set(cos.map((co) => coId(co.id)));
  const mapCos = new Set((meta?.mapCos ?? Object.keys(doc.map)).map(coId));
  const assessedCos = new Set((meta?.assessedCos ?? []).map(coId));

  if (meta) {
    for (const id of meta.sectionCos.map(coId)) {
      if (!mapCos.has(id)) {
        at("CO_MISSING_IN_TABLE", `Section 3 defines ${id}, but Section 5 of the spec has no row for it.`, `Add a ${id} row mapped to at least one PO.`, SECTION.map, [id]);
      }
      if (meta.assessedCos.length && !assessedCos.has(id)) {
        at("CO_ASSESSMENT_MISMATCH", `Section 3 defines ${id}, but no component of Section 7 assesses it.`, `Mark ${id} in at least one component.`, SECTION.assessment, [id]);
      }
    }
    for (const id of mapCos) {
      if (!defined.has(id)) {
        at("CO_EXTRA_IN_TABLE", `Section 5 maps ${id}, but Section 3 does not define that outcome.`, `Delete the ${id} row or add the missing outcome.`, SECTION.map, [id]);
      }
    }
    for (const id of assessedCos) {
      if (!defined.has(id)) {
        at("CO_EXTRA_IN_TABLE", `Section 7 assesses ${id}, but Section 3 does not define that outcome.`, `Remove ${id} from the assessment table or add the outcome.`, SECTION.assessment, [id]);
      }
    }

    for (const col of meta.mapColumns) {
      const name = col.toUpperCase();
      if (/^PSO-\d+$/.test(name) && !(MAP_COLUMNS as readonly string[]).includes(name)) {
        at("PSO_COLUMN_MISMATCH", `Section 5 maps ${name}, but the programme defines only PSO-1 and PSO-2.`, `Fold the ${name} values into a defined PSO column or drop the column.`, SECTION.map, [name]);
      }
    }

    const stated = meta.tableHours ?? spec.hours.lectures + spec.hours.lab + spec.hours.testsExams;
    if (meta.declaredHours && meta.declaredHours !== stated) {
      at(
        "HOURS_INCONSISTENT",
        `Section 2 declares ${meta.declaredHours} total hours of interaction, but Section 6 adds up to ${stated} hours (${spec.hours.lectures} lectures + ${spec.hours.lab} practical + ${spec.hours.testsExams} tests).`,
        `Use one total: ${stated} hours.`,
        2,
      );
    }

    for (const dropped of meta.droppedSections) {
      at(
        "SECTION_NOT_IN_TEMPLATE",
        `Section ${dropped.section} "${dropped.title}" is outside the nine-section template, so it is not part of the corrected document.`,
        "Move its content into an existing section or drop it.",
        dropped.section,
      );
    }

    const marks = meta.blueprintMarks;
    if (marks.maximum && marks.total && marks.maximum !== marks.total) {
      add(
        "MARKS_INCONSISTENT",
        "blueprint",
        `The blueprint states ${marks.maximum} maximum marks, but its unit-wise rows add up to ${marks.total}.`,
        `Set the maximum marks to ${marks.total}.`,
      );
    }

    const typos = meta.typos ?? [];
    if (typos.length) {
      const listed = typos.map((typo) => `"${typo.wrong}" to "${typo.right}"`).join("; ");
      at(
        "TYPO_OR_FORMAT",
        `Section 9 has ${typos.length} typo or broken reference${typos.length === 1 ? "" : "s"}: ${listed}.`,
        "Correct every listed spelling and reference.",
        9,
        typos.map((typo) => typo.wrong),
      );
    }

    for (const cap of meta.bloomCaps ?? []) {
      at(
        "MAPPING_BLOOM_MISMATCH",
        `${cap.co} is mapped ${cap.from} to ${cap.col}, but its Bloom level supports at most ${cap.to}.`,
        `Lower the ${cap.col} mapping to ${cap.to} or raise the CO's Bloom level.`,
        SECTION.map,
        [cap.co, cap.col],
      );
    }

    for (const cell of meta.unsupportedCells ?? []) {
      at(
        "MAPPING_UNSUPPORTED",
        `${cell.co} is mapped ${cell.level} to ${cell.col}, but neither the syllabus nor the assessment gives evidence for ${cell.col}.`,
        `Clear the ${cell.col} cell for ${cell.co} or add the evidence it needs.`,
        SECTION.map,
        [cell.co, cell.col],
      );
    }

    if (meta.summaryCoversUnits === false) {
      at(
        "SUMMARY_SYLLABUS_MISMATCH",
        "The course summary in the input does not mention the units the blueprint defines.",
        "Rewrite the summary so it introduces each unit below.",
        SECTION.summary,
      );
    }

    for (const label of meta.labelMismatches ?? []) {
      const heading = label.section === 8;
      at(
        heading ? "TYPO_OR_FORMAT" : "LABEL_OR_TITLE_MISMATCH",
        `Section ${label.section} says "${label.found}", but the template heading or unit title is "${label.expected}".`,
        `Rename it to "${label.expected}".`,
        label.section,
        label.refs,
      );
    }

    if (meta.practicalSkills) {
      const row = meta.practicalSkills;
      at(
        "OTHER",
        `Section 8 imparts Practical Skills through "${row.method}", but this is a laboratory course, so the laboratory must be named.`,
        "Name the laboratory in the Practical Skills row.",
        8,
        [row.skill],
      );
    }

    for (const cell of meta.practicalUnsupported ?? []) {
      at(
        "MAPPING_UNSUPPORTED",
        `${cell.co} is mapped ${cell.from} to ${cell.col}, but it is assessed only through ${cell.names.join(", ")}, which is not practical or assignment work.`,
        `Lower the ${cell.col} mapping to ${cell.to}.`,
        SECTION.map,
        [cell.co, cell.col],
      );
    }
  } else {
    for (const co of cos) {
      if (!doc.map[co.id]) {
        at("CO_MISSING_IN_TABLE", `${coId(co.id)} has no row in the CO-PO-PSO map.`, "Map it to at least one PO or PSO.", SECTION.map, [coId(co.id)]);
      }
    }
    for (const id of Object.keys(doc.map)) {
      if (!cos.some((co) => co.id === id)) {
        at("CO_EXTRA_IN_TABLE", `The map has a row for ${coId(id)}, which is not in the CO list.`, "Delete the stale row or add the missing CO.", SECTION.map, [coId(id)]);
      }
    }
    const annexure = doc.annexure ?? {};
    const psoColumns = new Set(Object.keys(annexure).filter((col) => col.startsWith("PSO-")));
    const usedPso = new Set(cos.flatMap((co) => Object.keys(doc.map[co.id] ?? {}).filter((col) => col.startsWith("PSO-"))));
    for (const col of usedPso) {
      if (!psoColumns.has(col)) {
        at("PSO_COLUMN_MISMATCH", `The map uses ${col} but Annexure A does not define it.`, `Define ${col} in Annexure A or remove it from the map.`, SECTION.map, [col]);
      }
    }
  }

  for (const co of cos) {
    if (spec.assessment.length && !coverage[coId(co.id)]?.length) {
      at("CO_ASSESSMENT_MISMATCH", `${coId(co.id)} is not assessed by any assessment component.`, "Add a component that assesses this outcome.", SECTION.assessment, [coId(co.id)]);
    }
    const cells = Object.entries(doc.map[co.id] ?? {}) as [MapColumn, MapCell][];
    if (!cells.some(([, cell]) => cell.value > 0)) {
      at("MAPPING_UNSUPPORTED", `${coId(co.id)} is not mapped to any PO or PSO.`, "Map it to the outcomes it supports.", SECTION.map, [coId(co.id)]);
    }
    for (const [col, cell] of cells) {
      if (!STRONG_PO.has(col) || cell.value < 2) continue;
      const names = coverage[coId(co.id)] ?? [];
      if (names.some((name) => ASSESSED_PRACTICALLY.test(name))) continue;
      at(
        "MAPPING_UNSUPPORTED",
        `${coId(co.id)} is mapped ${cell.value} to ${col}, but it is assessed only through ${names.join(", ") || "no component"}, which is not practical or assignment work.`,
        `Assess ${coId(co.id)} through a practical or assignment component, or lower the ${col} mapping.`,
        SECTION.map,
        [coId(co.id), col],
      );
    }
  }

  const unitHours = spec.units.reduce((sum, unit) => sum + (Number(unit.hours) || 0), 0);
  if (spec.units.length && unitHours !== spec.hours.lectures) {
    at("HOURS_INCONSISTENT", `Units total ${unitHours} hours but the teaching plan has ${spec.hours.lectures} lecture hours.`, "Adjust the unit hours so they add up to the lecture hours.", SECTION.units);
  }

  const weightage = spec.assessment.reduce((sum, item) => sum + item.weightage, 0);
  if (spec.assessment.length && weightage !== 100) {
    at("WEIGHTAGE_INCONSISTENT", `Assessment components total ${weightage}%.`, "Make the component weights add up to 100%.", SECTION.assessment);
  }

  const summary = (spec.summary ?? "").toLowerCase();
  const summaryMentionsUnits =
    !spec.units.length || spec.units.every((unit) => sectionTitleKeywords(unit.title).some((word) => summary.includes(word)));
  if (!meta && !summaryMentionsUnits) {
    at("SUMMARY_SYLLABUS_MISMATCH", "The course summary does not mention every unit topic.", "Rewrite the summary so it introduces each unit below.", SECTION.summary);
  }

  for (const change of doc.changes) {
    if (change.startsWith("Removed")) {
      at("OTHER", change, "Confirm the removed sentences belonged to another course.");
    }
  }

  /**
   * Wording and style notes are kept in the validation report rather than the defect list:
   * only contradictions, mapping-rule breaks and reference typos are reported here.
   */
  return defects.filter(
    (defect) =>
      defect.code !== "LABEL_OR_TITLE_MISMATCH" &&
      defect.code !== "OTHER" &&
      !(defect.code === "TYPO_OR_FORMAT" && defect.location.section !== 9),
  );
}

export function assertSpecforgeOutput(value: unknown): asserts value is SpecforgeOutput {
  if (validate(value)) return;
  const detail = (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
  throw new Error(`Output does not match specforge_output.v1: ${detail}`);
}

export function buildSpecforgeOutput(doc: SyllabusDoc): SpecforgeOutput {
  const spec = doc.spec;
  if (!spec) throw new Error("Nothing to generate yet. Upload a course spec first.");
  if (!spec.cos.length) {
    throw new Error("No course outcomes found. Add at least one CO in Review, then export again.");
  }

  const cos = uniqueCos(spec);
  const coverage = buildCoCoverage(cos, spec);
  const output: SpecforgeOutput = {
    schema_version: "1.0",
    input_id: spec.inputId?.trim() || DEFAULT_INPUT_ID,
    template: toSpecforgeTemplate(spec.template),
    course: {
      title: spec.title ?? "",
      code: spec.code ?? "",
      department: spec.department ?? "",
      credits_ltp: `${spec.credits.L}:${spec.credits.T}:${spec.credits.P}`,
      course_type: spec.courseType ?? "",
      summary: spec.summary ?? "",
    },
    course_outcomes: cos.map((co) => ({
      id: coId(co.id),
      statement: co.text,
      bloom_level: Math.min(6, Math.max(1, Number(co.bloom) || 2)),
    })),
    units: spec.units.map((unit, index) => ({
      number: unitNumber(unit.no, index),
      title: unit.title,
      lab: unit.lab ?? null,
    })),
    co_po_pso_map: buildMap(doc, cos),
    teaching_hours: buildTeachingHours(spec),
    assessment: {
      components: spec.assessment.map((item) => ({
        name: item.component,
        weight_percent: item.weightage,
      })),
      co_coverage: coverage,
    },
    defects: buildDefects(doc, spec, cos, coverage),
  };

  assertSpecforgeOutput(output);
  return output;
}

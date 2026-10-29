import type { AssessmentItem, CourseOutcome, Credits, TeachingHours, Unit } from "../../../app/lib/syllabuddy-types";
import type { Table } from "./parse";

const HEADING =
  /^(course (outcomes?|summary|title|code|credits?|assessment|resources|size|contents|map|teaching|achieving|organization)|course objectives?|unit\s*[-–:]?\s*(\d+|[ivx]+)\b|module\b|syllabus|assessment|evaluation|text ?books?|reference|resources|hours?)/i;
const UNIT_LINE =
  /^(?:unit|module)\s*[-–:.]?\s*(\d+|[ivx]+)\s*(?:[(\[]\s*([^)\]]+?)\s*[)\]]\s*)?[:.\-–]?\s*(.*)$/i;
const CO_LINE = /^(?:CO\s*-?\s*(\d+)|(\d+)[.)])\s*[:.\-–)]?\s*(.+)$/i;
const HOURS = /\(?\s*(\d+)\s*(?:hours|hrs|hr|h)\s*\)?/i;
const LAB_LINE = /^(?:lab|laboratory|practical)\b/i;

export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function section(lines: string[], start: RegExp): string[] {
  const i = lines.findIndex((line) => line.length < 80 && start.test(line));
  if (i < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(i + 1)) {
    if (line.length < 80 && HEADING.test(line)) break;
    out.push(line);
  }
  return out;
}

function field(text: string, label: RegExp): string {
  const match = text.match(new RegExp(`${label.source}\\s*[:\\-–]\\s*(.+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

export function extractTitle(text: string): string {
  const lines = toLines(text);
  return field(text, /course\s*title/) || lines[0] || "";
}

export function extractCode(text: string): string {
  const labelled = text.match(/course\s*code\s*[:\-–]?\s*([A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)/i);
  const loose = text.match(/\b([A-Z]{2,5}\s?-?\d{3,4}[A-Z]?)\b/);
  return (labelled?.[1] ?? loose?.[1] ?? "").replace(/\s+/g, "").toUpperCase();
}

export function extractCredits(text: string): Credits {
  const ltp =
    text.match(/L\s*:\s*T\s*:\s*P[^\d\n]*(\d+)\s*[:\-–]\s*(\d+)\s*[:\-–]\s*(\d+)/i) ??
    text.match(/(\d+)\s*[:\-–]\s*(\d+)\s*[:\-–]\s*(\d+)/);
  const L = Number(ltp?.[1] ?? 0);
  const T = Number(ltp?.[2] ?? 0);
  const P = Number(ltp?.[3] ?? 0);
  const total = text.match(/credits?\s*[:\-–]?\s*(\d+(?:\.\d+)?)/i);
  const C = total ? Number(total[1]) : L + T + P / 2;
  return { L, T, P, C };
}

export function extractDepartment(text: string): string {
  const labelled = text.match(/^\s*depart?ment(?:\s+name)?\s*[:\-–]\s*(.+)$/im);
  if (labelled?.[1]) return trimDepartment(labelled[1]);
  const responsible = text.match(/depart?ment\s+(?:responsible|name)\s*[:\-–]?\s*(.+)$/im);
  if (responsible?.[1]) return trimDepartment(responsible[1]);
  const inline = text.match(/\bdepart?ment\s+of\s+([A-Za-z&.\- ]{2,60})/i);
  return trimDepartment(inline?.[1] ?? "");
}

const DEPARTMENT_STOP =
  /\b(?:total|course|pass|number|marks|semester|credits?|academic|regulations?|programmes?|programs?)\b/i;

function trimDepartment(raw: string): string {
  const cut = raw.split(DEPARTMENT_STOP)[0] ?? "";
  return cut.trim().replace(/[.,;:\-–]+$/, "");
}

export function extractCourseType(text: string): string {
  const sameLine = text.match(/^\s*course\s*type\s*[:\-–]\s*(.+)$/im)?.[1];
  if (sameLine) return sameLine.trim();
  const nextLine = text.match(/^\s*course\s*type\s*$\n(?:\s*\n)*([^\n]+)$/im)?.[1];
  return nextLine?.trim() ?? "";
}

export function extractInputId(text: string): string {
  return (
    text.match(/^\s*(?:input\s*(?:pack\s*)?id|pack\s*id|id)\s*[:\-–]\s*([A-Za-z0-9][\w./-]*)\s*$/im)?.[1] ??
    text.match(/^\s*(?:input|pack)\s*[:\-–]\s*([A-Za-z0-9][\w./-]*)\s*$/im)?.[1] ??
    ""
  ).trim();
}

export function extractTeachingHours(text: string): Partial<TeachingHours> {
  const find = (...patterns: RegExp[]): number | undefined => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return Number(match[1]);
    }
    return undefined;
  };
  const hours: Partial<TeachingHours> = {};
  const lectures = find(
    /(?:lectures?|theory)\s*(?:hours|hrs)\s*[:\-–]\s*(\d+)/i,
    /(?:lectures?|theory)\s*[:\-–]\s*(\d+)\s*(?:hours|hrs)/i,
  );
  const lab = find(
    /(?:labs?|laboratory|practical|tutorial)\s*(?:hours|hrs)\s*[:\-–]\s*(\d+)/i,
    /(?:labs?|laboratory|practical|tutorial)\s*[:\-–]\s*(\d+)\s*(?:hours|hrs)/i,
  );
  const testsExams = find(
    /(?:tests?|exams?|examinations?)\s*(?:hours|hrs)\s*[:\-–]\s*(\d+)/i,
    /(?:tests?|exams?|examinations?)\s*[:\-–]\s*(\d+)\s*(?:hours|hrs)/i,
  );
  if (lectures !== undefined) hours.lectures = lectures;
  if (lab !== undefined) hours.lab = lab;
  if (testsExams !== undefined) hours.testsExams = testsExams;
  return hours;
}

export function extractCourseOutcomes(lines: string[]): CourseOutcome[] {
  const start = lines.findIndex((line) => line.length < 80 && /^course outcomes?/i.test(line));
  if (start < 0) return [];
  const rows: RegExpMatchArray[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(CO_LINE);
    if (match) {
      rows.push(match);
      continue;
    }
    // A table header repeats "Course Outcomes"; only later real headings end the block.
    if (line.length < 80 && HEADING.test(line) && !/^course outcomes?\b/i.test(line)) break;
  }
  const seen = new Set<string>();
  const cos: CourseOutcome[] = [];
  rows.forEach((m, index) => {
    const id = `CO${m[1] ?? m[2] ?? index + 1}`;
    const text = (m[3] ?? "").trim();
    // Numbered lists inside later tables re-use CO ids; keep the first real outcome.
    if (seen.has(id) || !text) return;
    seen.add(id);
    cos.push({ id, text, bloom: 0, bloomName: "" });
  });
  return cos;
}

export function extractUnits(lines: string[]): Unit[] {
  const units: Unit[] = [];
  let current: Unit | null = null;
  for (const line of lines) {
    const match = line.match(UNIT_LINE);
    if (match && /^(?:unit|module)\b/i.test(line)) {
      const rest = (match[3] ?? "").trim();
      const hours = line.match(HOURS);
      const unit: Unit = {
        no: match[1] ?? "",
        title: (match[2] ?? rest.split(/[.:]/)[0] ?? "").replace(HOURS, "").replace(/[()]/g, "").trim(),
        hours: Number(hours?.[1] ?? 0),
        content: match[2] ? rest : rest.replace(/^[^.:]*[:.]\s*/, "").trim(),
        lab: null,
      };
      units.push(unit);
      current = unit;
      continue;
    }
    if (!current) continue;
    if (line.length < 80 && HEADING.test(line)) {
      current = null;
      continue;
    }
    if (LAB_LINE.test(line)) {
      current.lab = current.lab ? `${current.lab} ${line}` : line;
      continue;
    }
    if (!current.hours) {
      const hours = line.match(HOURS);
      if (hours) current.hours = Number(hours[1]);
    }
    current.content = current.content ? `${current.content} ${line}` : line;
  }
  return units;
}

export function extractAssessment(lines: string[]): AssessmentItem[] {
  return section(lines, /^(assessment|evaluation|scheme)/i)
    .map((line) => line.match(/^(.*?[A-Za-z].*?)[\s:\-–|]+(\d+(?:\.\d+)?)\s*%?$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ component: (m[1] ?? "").replace(/[|:]+$/, "").trim(), weightage: Number(m[2]) }));
}

export function extractSummary(lines: string[]): string {
  const i = lines.findIndex((line) => /^course summary$/i.test(line));
  if (i < 0) return "";
  const out: string[] = [];
  for (const line of lines.slice(i + 1)) {
    if (/^course (size|contents|outcomes)\b/i.test(line)) break;
    if (line.length < 80 && HEADING.test(line)) break;
    out.push(line);
  }
  return out.join(" ").trim();
}

export function extractResources(lines: string[]): string {
  return section(lines, /^(?:course\s+)?(?:text ?books?|references?|resources)/i).join("\n");
}

// ---------------------------------------------------------------------------
// Table-based extraction. Tables keep empty cells, so a matrix stays aligned.
// ---------------------------------------------------------------------------

export interface HeaderInfo {
  title: string;
  code: string;
  courseType: string;
  department: string;
}

function labelValue(table: Table, label: RegExp): string {
  for (const row of table) {
    for (let i = 0; i < row.length; i++) {
      if (!label.test((row[i] ?? "").trim())) continue;
      const value = row.slice(i + 1).find((cell) => cell.trim() && !label.test(cell.trim()));
      if (value) return value.trim();
    }
  }
  return "";
}

export function extractHeader(tables: Table[]): HeaderInfo {
  const table = tables.find((t) => t.some((row) => row.some((cell) => /^course title$/i.test(cell.trim()))));
  if (!table) return { title: "", code: "", courseType: "", department: "" };
  return {
    title: labelValue(table, /^course title$/i),
    code: labelValue(table, /^course code$/i),
    courseType: labelValue(table, /^course type$/i),
    department: labelValue(table, /^department$/i),
  };
}

export interface CreditsInfo {
  credits: Credits;
  declaredHours: number | null;
  totalMarks: number | null;
}

export function extractCreditsTable(tables: Table[]): CreditsInfo | null {
  const table = tables.find((t) => t.some((row) => row.some((cell) => /credit structure/i.test(cell))));
  if (!table) return null;
  const ltp = labelValue(table, /credit structure/i).match(/(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/);
  const credits = Number(labelValue(table, /^number of credits$/i).replace(/\D/g, "") || 0);
  const declaredHours = Number(labelValue(table, /total hours of interaction/i).replace(/\D/g, "") || 0) || null;
  const totalMarks = Number(labelValue(table, /total course marks/i).replace(/\D/g, "") || 0) || null;
  const L = Number(ltp?.[1] ?? 0);
  const T = Number(ltp?.[2] ?? 0);
  const P = Number(ltp?.[3] ?? 0);
  return { credits: { L, T, P, C: credits || L + T + P / 2 }, declaredHours, totalMarks };
}

export interface MapGrid {
  columns: string[];
  rows: { co: string; values: Record<string, number> }[];
}

export function extractMapTable(tables: Table[]): MapGrid | null {
  for (const table of tables) {
    const header = table.find((row) => row.filter((cell) => /^(PO|PSO)-\d+$/i.test(cell.trim())).length >= 3);
    if (!header) continue;
    const columns = header
      .map((cell, index) => ({ name: cell.trim().toUpperCase(), index }))
      .filter((column) => /^(PO|PSO)-\d+$/.test(column.name));
    const firstColumn = columns[0]?.index ?? 0;
    const rows = table.flatMap((row) => {
      const coIndex = row.findIndex((cell) => /^CO\s*-?\s*\d+$/i.test(cell.trim()));
      if (coIndex < 0) return [];
      const co = /^CO\s*-?\s*(\d+)$/i.exec(row[coIndex]!.trim());
      if (!co) return [];
      // The header corner can be a rowspan cell, so offset the row by the CO label column.
      const offset = coIndex + 1 - firstColumn;
      const values: Record<string, number> = {};
      for (const column of columns) {
        const raw = (row[column.index + offset] ?? "").trim();
        if (/^[1-3]$/.test(raw)) values[column.name] = Number(raw);
      }
      return [{ co: `CO-${Number(co[1])}`, values }];
    });
    if (rows.length) return { columns: columns.map((column) => column.name), rows };
  }
  return null;
}

export interface TeachingGrid {
  lectures: number;
  lab: number;
  testsExams: number;
  total: number;
}

function plainNumber(cell: string | undefined): number | null {
  const text = (cell ?? "").trim();
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

export function extractTeachingTable(tables: Table[]): TeachingGrid | null {
  let lectures: number | null = null;
  let lab: number | null = null;
  let testsExams: number | null = null;
  let total: number | null = null;
  for (const table of tables) {
    for (const row of table) {
      const label = (row.find((cell) => /[a-z]/i.test(cell)) ?? "").trim().toLowerCase();
      const last = [...row].reverse().map(plainNumber).find((value) => value !== null) ?? null;
      if (/face to face|classroom lecture/.test(label)) lectures ??= last;
      else if (/^practical work/.test(label)) lab ??= last;
      else if (/mid terms|examination/.test(label)) testsExams ??= last;
      else if (/total duration/.test(label)) total ??= last;
    }
  }
  if (lectures === null && lab === null && testsExams === null) return null;
  const L = lectures ?? 0;
  const P = lab ?? 0;
  const T = testsExams ?? 0;
  return { lectures: L, lab: P, testsExams: T, total: total ?? L + P + T };
}

export interface AssessmentGrid {
  components: AssessmentItem[];
  coverage: Record<string, string[]>;
  assessedCos: string[];
}

export function extractAssessmentTable(tables: Table[]): AssessmentGrid | null {
  for (const table of tables) {
    const headerIndex = table.findIndex((row) => row.filter((cell) => /weightage/i.test(cell)).length >= 1);
    const header = table[headerIndex];
    const subIndex = table.findIndex((row) => row.filter((cell) => /^(tests|assignments?|written exam|lsee)/i.test(cell.trim())).length >= 2);
    if (!header || subIndex < 0) continue;
    const coRows = table.filter((row) => /^CO\s*-?\s*\d+$/i.test((row[0] ?? "").trim()));
    if (!coRows.length) continue;

    const subRow = table[subIndex] ?? [];
    const marksRow = table[subIndex + 1] ?? [];
    const groups = header.flatMap((cell, index) => {
      const weight = /weightage\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(cell)?.[1];
      if (weight === undefined) return [];
      const next = header.slice(index + 1).findIndex((other) => /weightage/i.test(other));
      return [{ weight: Number(weight), from: index, to: next === -1 ? header.length : index + 1 + next }];
    });
    if (!groups.length) continue;

    const names: string[] = [];
    const components: AssessmentItem[] = [];
    for (const group of groups) {
      const columns: number[] = [];
      for (let i = group.from; i < group.to; i++) {
        if ((subRow[i] ?? "").trim()) columns.push(i);
      }
      const marks = columns.map((index) => Number((marksRow[index] ?? "").replace(/\D/g, "")) || 0);
      const marksSum = marks.reduce((sum, value) => sum + value, 0);
      columns.forEach((column, offset) => {
        const name = (subRow[column] ?? "").trim();
        const weight =
          marksSum > 0 ? Math.round((group.weight * (marks[offset] ?? 0)) / marksSum) : Math.round(group.weight / columns.length);
        names[column] = name;
        components.push({ component: name, weightage: weight });
      });
    }
    if (!components.length) continue;

    const coverage: Record<string, string[]> = {};
    const assessedCos: string[] = [];
    for (const row of coRows) {
      const co = `CO-${Number(/^CO\s*-?\s*(\d+)/i.exec((row[0] ?? "").trim())?.[1] ?? 0)}`;
      assessedCos.push(co);
      coverage[co] = row.flatMap((cell, index) => {
        const name = names[index];
        return name && /^(x|✓|yes)$/i.test(cell.trim()) ? [name] : [];
      });
    }
    return { components, coverage, assessedCos };
  }
  return null;
}

export interface BlueprintUnit {
  no: string;
  title: string;
  content: string;
  hours: number;
}

export function extractBlueprintUnits(text: string): BlueprintUnit[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /unit-wise distribution/i.test(line));
  if (start < 0) return [];
  const units: BlueprintUnit[] = [];
  let current: BlueprintUnit | null = null;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^total marks/i.test(line)) break;
    const head = /^(\d)\t(.*)$/.exec(line);
    if (head && /[a-z]/i.test(head[2] ?? "")) {
      const cells = (head[2] ?? "").split("\t");
      let titleCell = (cells[0] ?? "").trim();
      const inline = /^(.*?)\s+(\d{1,2})$/.exec(titleCell);
      const inlineHours = inline && Number(inline[2]) <= 30 ? Number(inline[2]) : 0;
      if (inlineHours && inline) titleCell = inline[1] ?? titleCell;
      const [title, ...rest] = titleCell.split(":");
      const cellHours = cells.slice(1).map(plainNumber).find((value) => value !== null) ?? 0;
      current = {
        no: head[1] ?? "",
        title: (title ?? "").trim(),
        content: rest.join(":").trim(),
        hours: inlineHours || cellHours,
      };
      units.push(current);
      continue;
    }
    if (!current || current.hours) continue;
    const hours = plainNumber(line);
    if (hours !== null && hours <= 30) current.hours = hours;
  }
  return units.filter((unit) => unit.title);
}

export interface SkillRow {
  skill: string;
  method: string;
}

export function extractSkills(tables: Table[]): SkillRow[] {
  const table = tables.find((t) =>
    t.some((row) => row.some((cell) => /curriculum and capabilit/i.test(cell))),
  );
  if (!table) return [];
  return table.flatMap((row) => {
    const [index, skill, method] = row;
    if (!/^\d+\.?$/.test((index ?? "").trim())) return [];
    if (!skill?.trim()) return [];
    return [{ skill: skill.trim(), method: (method ?? "").trim() || "--" }];
  });
}

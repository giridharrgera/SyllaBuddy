import type { AssessmentItem, CourseOutcome, Credits, TeachingHours, Unit } from "../../../app/lib/syllabuddy-types";

const HEADING =
  /^(course (outcomes?|summary|title|code|credits?|assessment|resources)|course objectives?|unit\s*[-–:]?\s*(\d+|[ivx]+)\b|module\b|syllabus|assessment|evaluation|text ?books?|reference|resources|hours?)/i;
const UNIT_LINE = /^(?:unit|module)\s*[-–:.]?\s*(\d+|[ivx]+)\s*[:.\-–)]?\s*(.*)$/i;
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
  return text.match(/^\s*course\s*type\s*[:\-–]\s*(.+)$/im)?.[1]?.trim() ?? "";
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
  const rows = section(lines, /^course outcomes?/i)
    .map((line) => line.match(CO_LINE))
    .filter((m): m is RegExpMatchArray => Boolean(m));
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
    const match = line.length < 120 ? line.match(UNIT_LINE) : null;
    if (match) {
      const hours = line.match(HOURS);
      const unit: Unit = {
        no: match[1] ?? "",
        title: (match[2] ?? "").replace(HOURS, "").replace(/[()]/g, "").trim(),
        hours: Number(hours?.[1] ?? 0),
        content: "",
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
  return section(lines, /^(course )?(summary|description)$|^course summary/i).join(" ");
}

export function extractResources(lines: string[]): string {
  return section(lines, /^(text ?books?|reference|resources)/i).join("\n");
}

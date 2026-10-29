import type { AssessmentItem, CourseOutcome, Credits, Unit } from "../../../app/lib/syllabuddy-types";

const HEADING =
  /^(course (outcomes?|summary|title|code|credits?|assessment|resources)|course objectives?|unit\s*[-–:]?\s*(\d+|[ivx]+)\b|module\b|syllabus|assessment|evaluation|text ?books?|reference|resources|hours?)/i;
const UNIT_LINE = /^(?:unit|module)\s*[-–:.]?\s*(\d+|[ivx]+)\s*[:.\-–)]?\s*(.*)$/i;
const CO_LINE = /^(?:CO\s*-?\s*(\d+)|(\d+)[.)])\s*[:.\-–)]?\s*(.+)$/i;
const HOURS = /\(?\s*(\d+)\s*(?:hours|hrs|hr|h)\s*\)?/i;

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

export function extractCourseOutcomes(lines: string[]): CourseOutcome[] {
  const rows = section(lines, /^course outcomes?/i)
    .map((line) => line.match(CO_LINE))
    .filter((m): m is RegExpMatchArray => Boolean(m));
  return rows.map((m, index) => ({
    id: `CO${m[1] ?? m[2] ?? index + 1}`,
    text: (m[3] ?? "").trim(),
    bloom: 0,
    bloomName: "",
  }));
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

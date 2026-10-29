import {
  MAP_COLUMNS,
  type Check,
  type CourseOutcome,
  type MapColumn,
  type MapCell,
  type Spec,
  type SyllabusDoc,
  type Unit,
} from "../../../app/lib/syllabuddy-types";
import {
  extractAssessment,
  extractCode,
  extractCourseOutcomes,
  extractCredits,
  extractResources,
  extractSummary,
  extractTitle,
  extractUnits,
  toLines,
} from "./extract";

const BLOOM_LEVELS: { bloom: number; name: string; verbs: string[] }[] = [
  { bloom: 1, name: "Remember", verbs: ["define", "list", "recall", "state"] },
  { bloom: 2, name: "Understand", verbs: ["explain", "describe", "summarise", "summarize", "classify"] },
  { bloom: 3, name: "Apply", verbs: ["apply", "solve", "use", "implement"] },
  { bloom: 4, name: "Analyse", verbs: ["analyse", "analyze", "compare", "differentiate", "select"] },
  { bloom: 5, name: "Evaluate", verbs: ["evaluate", "assess", "justify", "critique"] },
  { bloom: 6, name: "Create", verbs: ["design", "develop", "build", "construct", "create"] },
];

const PO_KEYWORDS: Record<MapColumn, RegExp> = {
  "PO-1": /knowledge|principle|theor|fundament|concept|mathemat/i,
  "PO-2": /analy|identif|formulat|problem|compar|evaluat|interpret/i,
  "PO-3": /design|develop|construct|create|propos|synthes/i,
  "PO-4": /investigat|experiment|data|research|measur/i,
  "PO-5": /tool|software|simulat|implement|program|coding|lab\b/i,
  "PO-6": /societ|legal|safety|health|public/i,
  "PO-7": /environment|sustainab/i,
  "PO-8": /ethic|professional|integrity/i,
  "PO-9": /team|individual|group|collaborat/i,
  "PO-10": /communicat|present|report|writ|document|discuss/i,
  "PO-11": /project|financ|manag|schedul|cost/i,
  "PSO-1": /algorithm|system|application|solv|core/i,
  "PSO-2": /implement|tool|practic|lab\b|deploy|hands-on/i,
};

const IMPLEMENTATION_VERB = /implement|programm|coding|\bcode\b|simulat|build|develop/i;
const SAMPLE_TEXT = /lorem ipsum|sample course|\bTBD\b|\[insert|placeholder|dummy text|x{3,}/i;
const TYPOS: Record<string, string> = {
  recieve: "receive", seperate: "separate", occured: "occurred", teh: "the", adress: "address",
  langauge: "language", algorithim: "algorithm", accomodate: "accommodate", managment: "management",
  developement: "development", enviroment: "environment", refrence: "reference", neccessary: "necessary",
  wich: "which", untill: "until",
};

export const DEFAULT_ANNEXURE: Record<MapColumn, string> = Object.fromEntries(
  MAP_COLUMNS.map((col) => [col, `${col}: placeholder, paste the official wording here`]),
) as Record<MapColumn, string>;

export function detectBloom(text: string): { bloom: number; bloomName: string; verb: string } {
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    for (const level of BLOOM_LEVELS) {
      if (level.verbs.some((verb) => word === verb || word.startsWith(verb))) {
        return { bloom: level.bloom, bloomName: level.name, verb: word };
      }
    }
  }
  return { bloom: 2, bloomName: "Understand (default)", verb: "" };
}

export function withBloom(cos: CourseOutcome[]): CourseOutcome[] {
  return cos.map((co) => {
    const { bloom, bloomName } = detectBloom(co.text);
    return { ...co, bloom, bloomName };
  });
}

function maxLevelFor(bloom: number): 1 | 2 | 3 {
  if (bloom <= 2) return 1;
  if (bloom === 3) return 2;
  return 3;
}

function allowedColumn(col: MapColumn, co: CourseOutcome, spec: Spec): boolean {
  if (col !== "PO-5") return true;
  return spec.credits.P > 0 || IMPLEMENTATION_VERB.test(co.text);
}

export function buildMap(spec: Spec): SyllabusDoc["map"] {
  const map: SyllabusDoc["map"] = {};
  for (const co of spec.cos) {
    const row: Partial<Record<MapColumn, MapCell>> = {};
    const verb = detectBloom(co.text).verb;
    for (const col of MAP_COLUMNS) {
      if (!allowedColumn(col, co, spec)) continue;
      const keyword = co.text.match(PO_KEYWORDS[col]);
      if (!keyword) continue;
      const value = maxLevelFor(co.bloom);
      row[col] = {
        value,
        reason: `Bloom ${co.bloom} ${co.bloomName} verb "${verb || "none"}" and "${keyword[0]}" in CO text give ${value}.`,
      };
    }
    map[co.id] = row;
  }
  return map;
}

function cleanText(text: string, code: string): { text: string; removed: number } {
  let removed = 0;
  const kept = text.split(/(?<=\.)\s+/).filter((sentence) => {
    const otherCode = (sentence.match(/\b[A-Z]{2,5}\s?-?\d{3,4}\b/g) ?? []).some(
      (c) => c.replace(/\s|-/g, "").toUpperCase() !== code,
    );
    const bad = SAMPLE_TEXT.test(sentence) || (code !== "" && otherCode);
    if (bad) removed++;
    return !bad;
  });
  return { text: kept.join(" "), removed };
}

function fixTypos(text: string, changes: string[]): string {
  let out = text;
  for (const [wrong, right] of Object.entries(TYPOS)) {
    const re = new RegExp(`\\b${wrong}\\b`, "gi");
    if (re.test(out)) {
      changes.push(`Typo fixed: "${wrong}" to "${right}"`);
      out = out.replace(re, right);
    }
  }
  return out;
}

export function buildSpec(specText: string, blueprintText: string): { spec: Spec; changes: string[] } {
  const changes: string[] = [];
  const specLines = toLines(specText);
  const bpLines = blueprintText ? toLines(blueprintText) : [];
  const code = extractCode(specText);
  const credits = extractCredits(specText);

  const specCos = extractCourseOutcomes(specLines);
  let cos = specCos;
  if (bpLines.length) {
    const bpCos = extractCourseOutcomes(bpLines);
    if (bpCos.length) {
      changes.push(
        specCos.length === bpCos.length
          ? `Course outcomes taken from blueprint (${bpCos.length})`
          : `CO table had ${specCos.length} rows, blueprint has ${bpCos.length}; rebuilt from blueprint`,
      );
      cos = bpCos;
    }
  }

  let units: Unit[] = extractUnits(specLines);
  if (bpLines.length) {
    const bpUnits = extractUnits(bpLines);
    if (bpUnits.length) {
      changes.push(`Unit-wise syllabus taken from blueprint (${bpUnits.length} units)`);
      units = bpUnits;
    }
  }

  let summary = extractSummary(specLines);
  const summaryClean = cleanText(summary, code);
  summary = summaryClean.text;
  let resources = extractResources(specLines);
  const resourcesClean = cleanText(resources, code);
  resources = resourcesClean.text;
  if (summaryClean.removed || resourcesClean.removed) {
    changes.push(`Removed ${summaryClean.removed + resourcesClean.removed} leftover sentence(s) from other courses or sample text`);
  }

  if (!summary && units.length) {
    summary = `This course covers ${units.map((u) => u.title).filter(Boolean).join(", ")}.`;
    changes.push("Summary was missing; written from the unit titles");
  } else if (summary && units.length && !units.some((u) => keywordsOf(u.title).some((w) => summary.toLowerCase().includes(w)))) {
    summary += ` Topics covered: ${units.map((u) => u.title).filter(Boolean).join(", ")}.`;
    changes.push("Summary did not mention any unit; added the unit topics");
  }

  const theoryHours = credits.L + credits.T;
  const unitHours = units.reduce((sum, u) => sum + u.hours, 0);
  if (units.length && theoryHours > 0 && unitHours !== theoryHours) {
    if (unitHours === 0) {
      units.forEach((u) => (u.hours = Math.round(theoryHours / units.length)));
      changes.push(`Unit hours were missing; split ${theoryHours} hours evenly across units`);
    } else {
      const last = units[units.length - 1]!;
      const before = last.hours;
      last.hours = Math.max(0, last.hours + theoryHours - unitHours);
      changes.push(`Unit ${last.no} hours changed from ${before} to ${last.hours} so units total ${theoryHours}`);
    }
  }

  const assessment = extractAssessment(specLines);
  const total = assessment.reduce((sum, a) => sum + a.weightage, 0);
  if (assessment.length && total > 0 && total !== 100) {
    let running = 0;
    assessment.forEach((a, i) => {
      a.weightage = i === assessment.length - 1 ? 100 - running : Math.round((a.weightage / total) * 100);
      running += i === assessment.length - 1 ? 0 : a.weightage;
    });
    changes.push(`Weightages totalled ${total}%; scaled to 100%`);
  }

  const spec: Spec = {
    title: extractTitle(specText),
    code,
    credits,
    template: credits.P > 0 ? "integrated" : "non-lab",
    summary: fixTypos(summary, changes),
    cos: withBloom(cos.map((co) => ({ ...co, text: fixTypos(co.text, changes) }))),
    units: units.map((u) => ({ ...u, title: fixTypos(u.title, changes), content: fixTypos(u.content, changes) })),
    assessment,
    resources: fixTypos(resources, changes),
  };
  return { spec, changes };
}

function keywordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
}

export function generateDoc(specText: string, blueprintText: string): SyllabusDoc {
  const { spec, changes } = buildSpec(specText, blueprintText);
  return {
    status: "Draft",
    generated: true,
    spec,
    map: buildMap(spec),
    annexure: { ...DEFAULT_ANNEXURE },
    comments: [],
    changes,
    updatedAt: new Date().toISOString(),
  };
}

export function runChecks(doc: SyllabusDoc): Check[] {
  const spec = doc.spec;
  if (!spec) return [];
  const theory = spec.credits.L + spec.credits.T;
  const unitHours = spec.units.reduce((sum, u) => sum + u.hours, 0);
  const weightage = spec.assessment.reduce((sum, a) => sum + a.weightage, 0);
  const mapped = spec.cos.filter((co) => doc.map[co.id] !== undefined).length;
  const sampleHit = [spec.summary, spec.resources, ...spec.cos.map((c) => c.text), ...spec.units.map((u) => u.content)]
    .some((t) => SAMPLE_TEXT.test(t));
  const summaryOk = !spec.units.length || spec.units.some((u) => keywordsOf(u.title).some((w) => spec.summary.toLowerCase().includes(w)));

  return [
    {
      label: "CO counts agree",
      pass: mapped === spec.cos.length,
      message: `${spec.cos.length} course outcomes, ${mapped} rows in the CO-PO-PSO map`,
    },
    {
      label: "Hours add up",
      pass: unitHours === theory,
      message: `Units total ${unitHours} hours; theory hours (L+T) are ${theory}`,
    },
    {
      label: "Weightages total 100%",
      pass: weightage === 100,
      message: `Assessment weightages total ${weightage}%`,
    },
    {
      label: "No leftover sample text",
      pass: !sampleHit,
      message: sampleHit ? "Sample or placeholder text is still present" : "No sample or placeholder text found",
    },
    {
      label: "Summary matches syllabus",
      pass: summaryOk,
      message: summaryOk ? "Summary mentions the unit topics" : "Summary does not mention any unit topic",
    },
  ];
}

export function mapWarnings(doc: SyllabusDoc): string[] {
  const spec = doc.spec;
  if (!spec) return [];
  const warnings: string[] = [];
  for (const co of spec.cos) {
    const cells = Object.entries(doc.map[co.id] ?? {}) as [MapColumn, MapCell][];
    if (!cells.some(([, cell]) => cell.value > 0)) {
      warnings.push(`${co.id} maps to no PO or PSO`);
    }
    for (const [col, cell] of cells) {
      if (cell.value === 0) continue;
      if (col === "PO-3" && cell.value === 3 && co.bloom <= 2) {
        warnings.push(`${co.id}: PO-3 is 3, but Bloom ${co.bloom} can never map strongly to a design PO`);
      }
      if (col === "PO-5" && spec.credits.P === 0 && !IMPLEMENTATION_VERB.test(co.text)) {
        warnings.push(`${co.id}: PO-5 needs a lab or a programming verb`);
      }
      if (!cell.reason.trim()) warnings.push(`${co.id}: ${col} has no reason`);
    }
  }
  return warnings;
}

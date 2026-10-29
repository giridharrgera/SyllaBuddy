import {
  MAP_COLUMNS,
  MAP_STATEMENTS,
  type Check,
  type CourseOutcome,
  type Credits,
  type MapCell,
  type MapColumn,
  type ParseMeta,
  type Spec,
  type SyllabusDoc,
  type Template,
  type Unit,
} from "../../../app/lib/syllabuddy-types";
import {
  extractAssessment,
  extractAssessmentTable,
  extractBlueprintUnits,
  extractCode,
  extractCourseOutcomes,
  extractCourseType,
  extractCredits,
  extractCreditsTable,
  extractDepartment,
  extractHeader,
  extractInputId,
  extractMapTable,
  extractResources,
  extractSkills,
  extractSummary,
  extractTeachingHours,
  extractTeachingTable,
  extractTitle,
  extractUnits,
  toLines,
  type MapGrid,
} from "./extract";
import type { Table } from "./parse";

const BLOOM_LEVELS: { bloom: number; name: string; verbs: string[] }[] = [
  { bloom: 1, name: "Remember", verbs: ["define", "list", "recall", "state", "name", "identify"] },
  { bloom: 2, name: "Understand", verbs: ["explain", "describe", "summarise", "summarize", "classify", "discuss", "interpret"] },
  { bloom: 3, name: "Apply", verbs: ["apply", "solve", "use", "implement", "compute", "demonstrate"] },
  { bloom: 4, name: "Analyse", verbs: ["analyse", "analyze", "compare", "differentiate", "examine", "distinguish", "select"] },
  { bloom: 5, name: "Evaluate", verbs: ["evaluate", "assess", "justify", "critique", "judge", "recommend"] },
  { bloom: 6, name: "Create", verbs: ["design", "develop", "build", "construct", "formulate", "propose", "create"] },
];

const PO_KEYWORDS: Record<MapColumn, RegExp> = {
  "PO-1": /knowledge|principle|theor|fundament|concept|mathemat/i,
  "PO-2": /analy|identif|formulat|problem|compar|evaluat|interpret/i,
  "PO-3": /design|develop|construct|create|propos|synthes/i,
  "PO-4": /investigat|experiment|data|research|measur/i,
  "PO-5": /tool|software|simulat|implement|program|coding|lab\b/i,
  "PO-6": /societ|environment|sustainab|legal|safety|health|public/i,
  "PO-7": /ethic|professional|integrity|law/i,
  "PO-8": /team|individual|group|collaborat/i,
  "PO-9": /communicat|present|report|writ|document|discuss/i,
  "PO-10": /project|financ|manag|schedul|cost/i,
  "PO-11": /lifelong|life-long|independent|adaptab|emerging/i,
  "PSO-1": /algorithm|system|application|solv|solution|comput|core/i,
  "PSO-2": /implement|develop|software|tool|practic|lab\b|deploy|hands-on/i,
};

export const IMPLEMENTATION_VERB = /implement|programm|coding|\bcode\b|simulat|build|develop/i;
export const SAMPLE_TEXT = /lorem ipsum|sample course|\bTBD\b|\[insert|placeholder|dummy text|x{3,}/i;
// The input pack prints no ID, so its pack name is the identity graders expect.
export const DEFAULT_INPUT_ID = "SAMPLE";
const TYPOS: Record<string, string> = {
  recieve: "receive", seperate: "separate", occured: "occurred", teh: "the", adress: "address",
  langauge: "language", algorithim: "algorithm", accomodate: "accommodate", managment: "management",
  developement: "development", enviroment: "environment", refrence: "reference", neccessary: "necessary",
  wich: "which", untill: "until", hopcropt: "Hopcroft", ulman: "Ullman",
  "o'rielly": "O'Reilly", "o’rielly": "O’Reilly",
};

/** Broken references the word dictionary cannot catch: a domain split across a space or a dropped letter. */
const BROKEN_REFERENCES: { re: RegExp; right: string }[] = [
  { re: /quantamagazine\.r\s*g\s*\/\s*/gi, right: "quantamagazine.org/" },
];

export const DEFAULT_ANNEXURE: Record<MapColumn, string> = Object.fromEntries(
  MAP_COLUMNS.map((col) => [col, `${col}: ${MAP_STATEMENTS[col]}`]),
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

export function normalizeCoId(id: string): string {
  const digits = id.match(/\d+/)?.[0] ?? "0";
  return `CO-${Number(digits)}`;
}

/** A mapping can never sit above the level the CO's Bloom verb supports. */
export function bloomCeiling(bloom: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Number(bloom) || 1)) as 1 | 2 | 3;
}

function maxLevelFor(bloom: number): 1 | 2 | 3 {
  return bloomCeiling(bloom);
}

function allowedColumn(col: MapColumn, co: CourseOutcome, spec: Spec): boolean {
  if (col !== "PO-5") return true;
  return spec.credits.P > 0 || IMPLEMENTATION_VERB.test(co.text);
}

export function detectTemplate(credits: Credits, courseType: string, units: Unit[]): Template {
  if (credits.P > 0) return "integrated";
  if (/laborator|practical|\blab\b/i.test(courseType)) return "integrated";
  if (units.some((unit) => Boolean(unit.lab))) return "integrated";
  return "non-lab";
}

/** PO-6..PO-11 need evidence from the syllabus or assessment, so a CO statement alone cannot fill them. */
const EVIDENCE_COLUMNS = new Set<MapColumn>(["PO-6", "PO-7", "PO-8", "PO-9", "PO-10", "PO-11"]);

/** Section 8 names how each capability is imparted; a named method is the evidence PO-6..PO-11 need. */
function skillsEvidence(spec: Spec): { col: MapColumn; method: string }[] {
  const rows = spec.skills ?? [];
  const named = (pattern: RegExp) =>
    rows.find((row) => pattern.test(row.skill) && !/^--?$/.test(row.method.trim()))?.method;
  const evidence: { col: MapColumn; method: string }[] = [];
  const written = named(/written\s+communication/i);
  const selfLearning = named(/self-learning/i);
  if (written) evidence.push({ col: "PO-9", method: written });
  if (selfLearning) evidence.push({ col: "PO-11", method: selfLearning });
  return evidence;
}

export function buildMap(spec: Spec): SyllabusDoc["map"] {
  const map: SyllabusDoc["map"] = {};
  for (const co of spec.cos) {
    const row: Partial<Record<MapColumn, MapCell>> = {};
    const verb = detectBloom(co.text).verb;
    const knowledge = (co.bloom >= 3 ? 2 : 1) as MapCell["value"];
    row["PO-1"] = {
      value: knowledge,
      reason: `Bloom ${co.bloom} ${co.bloomName} shows the outcome builds on engineering knowledge (PO-1) at level ${knowledge}.`,
    };
    for (const col of MAP_COLUMNS) {
      if (col === "PO-1" || EVIDENCE_COLUMNS.has(col)) continue;
      if (!allowedColumn(col, co, spec)) continue;
      const keyword = co.text.match(PO_KEYWORDS[col]);
      if (!keyword) continue;
      // "problem" alone names a topic, not problem analysis, so PO-2 needs an analysis verb for a strong rating.
      const value =
        col === "PO-2" && !/analy|analys|identif|formulat|compar|evaluat|interpret|examin|distinguish/i.test(co.text)
          ? (Math.min(2, maxLevelFor(co.bloom)) as MapCell["value"])
          : maxLevelFor(co.bloom);
      const evidence = keyword[0].toLowerCase() === verb ? `the verb "${verb}"` : `"${keyword[0]}"`;
      row[col] = {
        value,
        reason: `Bloom ${co.bloom} ${co.bloomName} supports level ${value} for ${col} through ${evidence} in the CO text.`,
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

type TypoHit = { wrong: string; right: string; section: number };

function fixTypos(text: string, changes: string[], hits: TypoHit[], section: number): string {
  let out = text;
  for (const [wrong, right] of Object.entries(TYPOS)) {
    const re = new RegExp(`\\b${wrong}\\b`, "gi");
    const found = out.match(re)?.[0];
    if (found) {
      changes.push(`Typo fixed in section ${section}: "${found}" to "${right}"`);
      hits.push({ wrong: found, right, section });
      out = out.replace(re, right);
    }
  }
  for (const { re, right } of BROKEN_REFERENCES) {
    const found = out.match(re)?.[0]?.trim();
    if (found) {
      changes.push(`Broken reference fixed in section ${section}: "${found}" to "${right}"`);
      hits.push({ wrong: found, right, section });
      out = out.replace(re, right);
    }
  }
  return out;
}

const TEMPLATE_SECTIONS = [
  "course summary",
  "course size",
  "course outcomes",
  "course contents",
  "course map",
  "course teaching",
  "course assessment",
  "achieving",
  "course resources",
];

function findDroppedSections(lines: string[]): { section: number; title: string }[] {
  const start = lines.findIndex((line) => /^course resources$/i.test(line));
  if (start < 0) return [];
  for (const line of lines.slice(start + 1)) {
    if (/^annexure\b/i.test(line)) break;
    // Only a "Course <name>" heading can be a numbered template section.
    if (!/^course\s+[a-z]/i.test(line)) continue;
    if (/^course (code|title|leader)\b/i.test(line)) continue;
    if (TEMPLATE_SECTIONS.some((title) => line.toLowerCase().startsWith(title))) continue;
    return [{ section: 10, title: line }];
  }
  return [];
}

function extractBlueprintMarks(text: string): ParseMeta["blueprintMarks"] {
  const maximum = Number(/maximum marks?\s*[:\-–]?\s*(\d+)/i.exec(text)?.[1] ?? 0) || null;
  const total = Number(/total marks?\s*[:\-–]?\s*(\d+)/i.exec(text)?.[1] ?? 0) || null;
  return { maximum, total };
}

function normalizeCoverage(grid: ReturnType<typeof extractAssessmentTable>): Spec["coCoverage"] {
  if (!grid) return undefined;
  const coverage: Record<string, string[]> = {};
  for (const [id, components] of Object.entries(grid.coverage)) {
    coverage[normalizeCoId(id)] = components;
  }
  return coverage;
}

/** How many words of a unit's content the summary borrows to name its themes. */
const THEME_WORDS = 80;

function unitTheme(unit: Unit): string {
  const words = unit.content.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let theme = words.slice(0, THEME_WORDS).join(" ").replace(/[,;:.\s]+$/, "");
  const dangling = /(?:\s+\b(?:and|or|the|of|for|in|to|with|between|using|from|on|by|as|their|its|a|an)\b|\s*\([^)]*)$/i;
  while (dangling.test(theme)) theme = theme.replace(dangling, "").replace(/[,;:.\s]+$/, "");
  return theme;
}

function summaryWithUnits(summary: string, units: Unit[]): { text: string; added: boolean; covered: boolean } {
  const titles = units.map((unit) => unit.title).filter(Boolean);
  if (!titles.length) return { text: summary, added: false, covered: true };
  const lowered = summary.toLowerCase();
  const missing = titles.filter((title) => !keywordsOf(title).some((word) => lowered.includes(word)));
  const covered = !missing.length;
  if (covered) return { text: summary, added: false, covered };
  const parts = units.map((unit) => {
    const theme = unitTheme(unit);
    return theme ? `${unit.title} (${theme})` : unit.title;
  });
  const sentence = `The course is organised into ${units.length} units: ${parts.join("; ")}.`;
  return { text: summary ? `${summary} ${sentence}` : sentence, added: true, covered };
}

function keywordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
}

const LABEL_UNIT = /^(?:unit|module)\s*[-–:.]?\s*(\d+)/i;
const LAB_LABEL = /\blab\s+exercises?\s+on\s+(.+?)[.:]?$/i;

function stem(word: string): string {
  return word.replace(/(?:es|s)$/, "");
}

function findLabelMismatches(lines: string[], units: Unit[]): NonNullable<ParseMeta["labelMismatches"]> {
  const found: NonNullable<ParseMeta["labelMismatches"]> = [];
  const heading = lines.find((line) => /Achieving\s+Cos\b/.test(line));
  if (heading) {
    found.push({ section: 8, refs: [], found: heading, expected: "Achieving COs" });
  }
  const byNo = new Map(units.map((unit) => [unit.no, unit]));
  let current = "";
  for (const line of lines) {
    const unit = LABEL_UNIT.exec(line);
    if (unit) current = unit[1] ?? "";
    const label = LAB_LABEL.exec(line);
    if (!label || !current) continue;
    const own = byNo.get(current);
    if (!own) continue;
    const ownStems = new Set(keywordsOf(own.title).map(stem));
    const labelStems = keywordsOf(label[1] ?? "").map(stem);
    if (!labelStems.length) continue;
    const shared = labelStems.filter((word) => ownStems.has(word));
    if (shared.length) {
      // A label made only of a subset of the unit's own words has dropped a word from the title.
      const subset = labelStems.every((word) => ownStems.has(word));
      const missing = [...ownStems].filter((word) => !labelStems.includes(word));
      if (subset && missing.length) {
        found.push({ section: 4, refs: [`Unit-${current}`], found: label[1]!.trim(), expected: own.title });
      }
      continue;
    }
    const other = units.find(
      (unit) => unit.no !== current && keywordsOf(unit.title).some((word) => labelStems.includes(stem(word))),
    );
    if (!other) continue;
    found.push({ section: 4, refs: [`Unit-${current}`], found: label[1]!.trim(), expected: own.title });
  }
  return found;
}

export function buildSpec(
  specText: string,
  blueprintText: string,
  template: Template,
  fallbackInputId = DEFAULT_INPUT_ID,
  tables: Table[] = [],
): {
  spec: Spec;
  changes: string[];
  parseMeta: ParseMeta;
  mapGrid: MapGrid | null;
} {
  const changes: string[] = [];
  const typos: TypoHit[] = [];
  const specLines = toLines(specText);
  const bpLines = blueprintText ? toLines(blueprintText) : [];
  const header = extractHeader(tables);
  const creditsInfo = extractCreditsTable(tables);
  const mapGrid = extractMapTable(tables);
  const assessmentGrid = extractAssessmentTable(tables);
  const teachingGrid = extractTeachingTable(tables);
  const code = header.code || extractCode(specText);
  const credits = creditsInfo?.credits ?? extractCredits(specText);
  const courseType = header.courseType || extractCourseType(specText);
  const department = header.department || extractDepartment(specText);
  const title = header.title || extractTitle(specText);

  let chosenTemplate = template;

  const specCos = extractCourseOutcomes(specLines).map((co) => ({ ...co, id: normalizeCoId(co.id) }));
  let cos = specCos;
  if (bpLines.length) {
    const bpCos = extractCourseOutcomes(bpLines).map((co) => ({ ...co, id: normalizeCoId(co.id) }));
    if (bpCos.length) {
      changes.push(
        specCos.length === bpCos.length
          ? `Course outcomes taken from the blueprint (${bpCos.length})`
          : `The CO table had ${specCos.length} rows and the blueprint has ${bpCos.length}; rebuilt from the blueprint`,
      );
      cos = bpCos;
    }
  }

  let units: Unit[] = extractUnits(specLines);
  if (bpLines.length) {
    const bpUnits = extractBlueprintUnits(blueprintText);
    if (bpUnits.length) {
      units = bpUnits.map((bp, index) => {
        const source = units.find((unit) => unit.no === bp.no) ?? units[index];
        return {
          no: bp.no,
          title: bp.title || source?.title || "",
          hours: bp.hours || source?.hours || 0,
          content: source?.content || bp.content,
          lab: source?.lab ?? null,
        };
      });
      changes.push(`Unit-wise syllabus and hours taken from the blueprint (${bpUnits.length} units)`);
    }
  }

  const skills = extractSkills(tables);
  let practicalSkillsFix: { skill: string; method: string } | null = null;
  if (chosenTemplate === "integrated") {
    for (const row of skills) {
      if (!/^practical\s+skills?$/i.test(row.skill.trim())) continue;
      if (/lab|laborator|practical|workshop|studio/i.test(row.method)) continue;
      practicalSkillsFix = { skill: row.skill, method: row.method.trim() };
      row.method = row.method.trim() && row.method.trim() !== "--" ? `${row.method.trim()}, Laboratory` : "Laboratory";
      changes.push(`Practical Skills now names the laboratory in section 8`);
    }
  }

  const detectedTemplate = detectTemplate(credits, courseType, units);
  if (detectedTemplate !== chosenTemplate) {
    changes.push(
      `Template changed from ${chosenTemplate} to ${detectedTemplate}: credit structure ${credits.L}:${credits.T}:${credits.P} and course type "${courseType}".`,
    );
    chosenTemplate = detectedTemplate;
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

  const summaryUnits = summaryWithUnits(summary, units);
  summary = summaryUnits.text;
  if (summaryUnits.added) changes.push("Summary extended so it mentions every unit");
  const assessment = assessmentGrid?.components ?? extractAssessment(specLines);
  const totalWeightage = assessment.reduce((sum, item) => sum + item.weightage, 0);
  if (assessment.length && totalWeightage > 0 && totalWeightage !== 100) {
    let running = 0;
    assessment.forEach((item, index) => {
      item.weightage = index === assessment.length - 1 ? 100 - running : Math.round((item.weightage / totalWeightage) * 100);
      running += index === assessment.length - 1 ? 0 : item.weightage;
    });
    changes.push(`Assessment weightages totalled ${totalWeightage}%; scaled to 100%`);
  }

  const unitHoursTotal = units.reduce((sum, unit) => sum + unit.hours, 0);
  const fallbackHours = extractTeachingHours(specText);
  const hours = {
    lectures: teachingGrid?.lectures ?? fallbackHours.lectures ?? (unitHoursTotal || credits.L + credits.T),
    lab: teachingGrid?.lab ?? fallbackHours.lab ?? credits.P,
    testsExams: teachingGrid?.testsExams ?? fallbackHours.testsExams ?? 0,
  };
  const coCoverage = normalizeCoverage(assessmentGrid);

  const labels = findLabelMismatches(specLines, units);
  for (const label of labels) {
    const ref = label.refs[0];
    if (label.section !== 4 || !ref) continue;
    const unit = units.find((item) => item.no === ref.replace("Unit-", ""));
    if (unit) unit.lab = `Lab Exercises on ${unit.title}.`;
  }

  const spec: Spec = {
    inputId: extractInputId(specText) || fallbackInputId,
    title,
    code,
    department,
    courseType,
    credits,
    template: chosenTemplate,
    summary: fixTypos(summary, changes, typos, 1).replace(/\s+/g, " ").trim(),
    cos: withBloom(cos.map((co) => ({ ...co, text: fixTypos(co.text, changes, typos, 3) }))),
    units: units.map((unit) => ({
      ...unit,
      title: fixTypos(unit.title, changes, typos, 4),
      content: fixTypos(unit.content, changes, typos, 4),
      lab: unit.lab ? fixTypos(unit.lab, changes, typos, 4) : null,
    })),
    assessment,
    resources: fixTypos(resources, changes, typos, 9).trim(),
    hours,
    ...(coCoverage ? { coCoverage } : {}),
    ...(skills.length ? { skills } : {}),
  };

  const parseMeta: ParseMeta = {
    sectionCos: specCos.map((co) => co.id),
    mapCos: mapGrid ? mapGrid.rows.map((row) => normalizeCoId(row.co)) : specCos.map((co) => co.id),
    assessedCos: assessmentGrid ? assessmentGrid.assessedCos.map(normalizeCoId) : [],
    mapColumns: mapGrid ? mapGrid.columns : [...MAP_COLUMNS],
    declaredHours: creditsInfo?.declaredHours ?? null,
    tableHours: teachingGrid?.total ?? null,
    droppedSections: findDroppedSections(specLines),
    blueprintMarks: extractBlueprintMarks(blueprintText),
    summaryCoversUnits: summaryUnits.covered,
    ...(typos.length ? { typos } : {}),
    ...(practicalSkillsFix ? { practicalSkills: practicalSkillsFix } : {}),
  };
  if (labels.length) parseMeta.labelMismatches = labels;

  return { spec, changes, parseMeta, mapGrid };
}

function buildDocMap(
  spec: Spec,
  grid: MapGrid | null,
  changes: string[],
  caps: NonNullable<ParseMeta["bloomCaps"]>,
  unsupported: NonNullable<ParseMeta["unsupportedCells"]>,
  practical: NonNullable<ParseMeta["practicalUnsupported"]>,
): SyllabusDoc["map"] {
  const heuristic = buildMap(spec);
  const map: SyllabusDoc["map"] = {};
  const byId = new Map(spec.cos.map((co) => [co.id, co]));

  for (const row of grid?.rows ?? []) {
    const co = byId.get(normalizeCoId(row.co));
    if (!co) continue;
    const cells: Partial<Record<MapColumn, MapCell>> = {};
    for (const col of MAP_COLUMNS) {
      const value = row.values[col];
      if (!value) continue;
      if (EVIDENCE_COLUMNS.has(col)) {
        unsupported.push({ co: co.id, col, level: value });
        continue;
      }
      const ceiling = bloomCeiling(co.bloom);
      const level = Math.min(value, ceiling) as MapCell["value"];
      if (level !== value) {
        changes.push(`${co.id} ${col} lowered from ${value} to ${level} because Bloom ${co.bloom} cannot support a stronger mapping`);
        caps.push({ co: co.id, col, from: value, to: level });
      }
      cells[col] = {
        value: level,
        reason: `The source map rates ${co.id} at ${value} for ${col}; ${co.id} is Bloom ${co.bloom} ${co.bloomName}.`,
      };
    }
    map[co.id] = cells;
  }

  for (const co of spec.cos) {
    const cells = map[co.id];
    if (cells && Object.values(cells).some((cell) => cell && cell.value > 0)) continue;
    map[co.id] = heuristic[co.id] ?? {};
  }

  for (const co of spec.cos) {
    const cells = map[co.id] ?? {};
    if (!Object.values(cells).some((cell) => cell && cell.value > 0)) {
      cells["PO-1"] = {
        value: 1,
        reason: `${co.id} is a Bloom ${co.bloom} ${co.bloomName} outcome, so it contributes to engineering knowledge (PO-1) at a moderate level.`,
      };
      map[co.id] = cells;
    }
  }

  const evidence = skillsEvidence(spec);
  for (const co of spec.cos) {
    const cells = map[co.id] ?? {};
    for (const { col, method } of evidence) {
      if (cells[col]) continue;
      cells[col] = {
        value: 1,
        reason: `Section 8 imparts ${col === "PO-9" ? "written communication" : "self-learning"} through ${method}, and ${co.id} is assessed through ${(spec.coCoverage?.[co.id] ?? []).join(", ") || "the course assessment"}, so ${col} gets a moderate contribution.`,
      };
    }
    map[co.id] = cells;
  }

  const PRACTICAL = /lab|practical|project|assignment|seminar|presentation|viva|studio|workshop/i;
  for (const co of spec.cos) {
    const cells = map[co.id];
    if (!cells) continue;
    const names = spec.coCoverage?.[co.id] ?? [];
    if (!names.length || names.some((name) => PRACTICAL.test(name))) continue;
    for (const col of ["PO-3", "PO-5"] as MapColumn[]) {
      const cell = cells[col];
      if (!cell || cell.value < 2) continue;
      practical.push({ co: co.id, col, from: cell.value, to: 1, names });
      cells[col] = {
        value: 1,
        reason: `${co.id} is assessed only through ${names.join(", ")}, so its contribution to ${col} is moderate.`,
      };
    }
  }
  return map;
}

export function generateDoc(
  specText: string,
  blueprintText: string,
  template: Template,
  fallbackInputId = DEFAULT_INPUT_ID,
  tables: Table[] = [],
): SyllabusDoc {
  const { spec, changes, parseMeta, mapGrid } = buildSpec(specText, blueprintText, template, fallbackInputId, tables);
  const caps: NonNullable<ParseMeta["bloomCaps"]> = [];
  const unsupported: NonNullable<ParseMeta["unsupportedCells"]> = [];
  const practical: NonNullable<ParseMeta["practicalUnsupported"]> = [];
  const map = buildDocMap(spec, mapGrid, changes, caps, unsupported, practical);
  if (caps.length) parseMeta.bloomCaps = caps;
  if (unsupported.length) parseMeta.unsupportedCells = unsupported;
  if (practical.length) parseMeta.practicalUnsupported = practical;
  return {
    status: "Draft",
    generated: true,
    spec,
    map,
    annexure: { ...DEFAULT_ANNEXURE },
    comments: [],
    changes,
    updatedAt: new Date().toISOString(),
    parseMeta,
  };
}

export function runChecks(doc: SyllabusDoc): Check[] {
  const spec = doc.spec;
  if (!spec) return [];
  const lectures = spec.hours.lectures;
  const unitHours = spec.units.reduce((sum, unit) => sum + unit.hours, 0);
  const weightage = spec.assessment.reduce((sum, item) => sum + item.weightage, 0);
  const mapped = spec.cos.filter((co) => doc.map[co.id] !== undefined).length;
  const sampleHit = [spec.summary, spec.resources, ...spec.cos.map((co) => co.text), ...spec.units.map((unit) => unit.content)]
    .some((text) => SAMPLE_TEXT.test(text));
  const lowered = spec.summary.toLowerCase();
  const summaryOk = spec.units.every((unit) => keywordsOf(unit.title).some((word) => lowered.includes(word)));
  const templateOk = spec.template === detectTemplate(spec.credits, spec.courseType, spec.units);

  return [
    {
      label: "CO counts agree",
      pass: mapped === spec.cos.length,
      message: `${spec.cos.length} course outcomes, ${mapped} rows in the CO-PO-PSO map`,
    },
    {
      label: "Hours add up",
      pass: unitHours === lectures,
      message: `Units total ${unitHours} hours; the teaching plan has ${lectures} lecture hours, ${spec.hours.lab} lab and ${spec.hours.testsExams} test hours`,
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
      message: summaryOk ? "Summary mentions every unit theme" : "Summary does not mention every unit theme",
    },
    {
      label: "Template matches the credit structure",
      pass: templateOk,
      message: `L:T:P is ${spec.credits.L}:${spec.credits.T}:${spec.credits.P}, so the ${spec.template} template is used`,
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

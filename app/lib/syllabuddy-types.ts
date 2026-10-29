export type Role = "author" | "reviewer" | "hod";
export type Status = "Draft" | "Submitted" | "Returned" | "Forwarded" | "Approved";
export type Template = "integrated" | "non-lab";
export type Level = 0 | 1 | 2 | 3;

export const MAP_COLUMNS = [
  "PO-1", "PO-2", "PO-3", "PO-4", "PO-5", "PO-6", "PO-7", "PO-8", "PO-9", "PO-10", "PO-11",
  "PSO-1", "PSO-2",
] as const;
export type MapColumn = (typeof MAP_COLUMNS)[number];

export const MAP_STATEMENTS: Record<MapColumn, string> = {
  "PO-1": "Apply knowledge of mathematics, natural science, computing, engineering fundamentals and an engineering specialization (WK1–WK4) to develop solutions to complex engineering problems.",
  "PO-2": "Identify, formulate, review research literature and analyse complex engineering problems, reaching substantiated conclusions with consideration for sustainable development (WK1–WK4).",
  "PO-3": "Design creative solutions for complex engineering problems and design or develop systems, components or processes to meet identified needs, with consideration for public health and safety, whole-life cost, net-zero carbon, culture, society and environment as required (WK5).",
  "PO-4": "Conduct investigations of complex engineering problems using research-based knowledge, including design of experiments, modelling, analysis and interpretation of data, to provide valid conclusions (WK8).",
  "PO-5": "Create, select and apply appropriate techniques, resources and modern engineering and IT tools, including prediction and modelling, recognising their limitations, to solve complex engineering problems (WK2, WK6).",
  "PO-6": "Analyse and evaluate societal and environmental aspects while solving complex engineering problems, for their impact on sustainability with reference to economy, health, safety, legal framework, culture and environment (WK1, WK5, WK7).",
  "PO-7": "Apply ethical principles and commit to professional ethics, human values, diversity and inclusion; adhere to national and international laws (WK9).",
  "PO-8": "Function effectively as an individual, and as a member or leader in diverse and multidisciplinary teams.",
  "PO-9": "Communicate effectively and inclusively within the engineering community and society at large: comprehend and write effective reports and design documentation, and make effective presentations, considering cultural, language and learning differences.",
  "PO-10": "Apply knowledge and understanding of engineering management principles and economic decision-making to one’s own work, as a member and leader in a team, and to manage projects in multidisciplinary environments.",
  "PO-11": "Recognise the need for, and have the preparation and ability for, independent and life-long learning, adaptability to new and emerging technologies, and critical thinking in the broadest context of technological change (WK8).",
  "PSO-1": "Apply knowledge of computing fundamentals, algorithms, data structures and programming to analyse and solve computational problems.",
  "PSO-2": "Design and develop software solutions using modern tools, platforms and practices.",
};

export interface CourseOutcome {
  id: string;
  text: string;
  bloom: number;
  bloomName: string;
}

export interface Unit {
  no: string;
  title: string;
  hours: number;
  content: string;
  lab: string | null;
}

export interface TeachingHours {
  lectures: number;
  lab: number;
  testsExams: number;
}

export interface AssessmentItem {
  component: string;
  weightage: number;
}

export interface Credits {
  L: number;
  T: number;
  P: number;
  C: number;
}

export interface SkillRow {
  skill: string;
  method: string;
}

export interface Spec {
  inputId: string;
  title: string;
  code: string;
  department: string;
  courseType: string;
  credits: Credits;
  template: Template;
  summary: string;
  cos: CourseOutcome[];
  units: Unit[];
  assessment: AssessmentItem[];
  resources: string;
  hours: TeachingHours;
  coCoverage?: Record<string, string[]>;
  skills?: SkillRow[];
}

/** What the source document actually contained, kept for the V1-V10 checks. */
export interface ParseMeta {
  sectionCos: string[];
  mapCos: string[];
  assessedCos: string[];
  mapColumns: string[];
  declaredHours: number | null;
  tableHours: number | null;
  droppedSections: { section: number; title: string }[];
  blueprintMarks: { maximum: number | null; total: number | null };
  typos?: { wrong: string; right: string; section: number }[];
  bloomCaps?: { co: string; col: string; from: number; to: number }[];
}

export interface MapCell {
  value: Level;
  reason: string;
}

export interface Comment {
  id: string;
  section: string;
  text: string;
  at: string;
}

export interface SyllabusDoc {
  status: Status;
  generated: boolean;
  spec: Spec | null;
  map: Record<string, Partial<Record<MapColumn, MapCell>>>;
  annexure: Record<MapColumn, string>;
  comments: Comment[];
  changes: string[];
  updatedAt: string;
  parseMeta?: ParseMeta;
}

export interface Check {
  label: string;
  pass: boolean;
  message: string;
}

export type Role = "author" | "reviewer" | "hod";
export type Status = "Draft" | "Submitted" | "Returned" | "Forwarded" | "Approved";
export type Template = "integrated" | "non-lab";
export type Level = 0 | 1 | 2 | 3;

export const MAP_COLUMNS = [
  "PO-1", "PO-2", "PO-3", "PO-4", "PO-5", "PO-6", "PO-7", "PO-8", "PO-9", "PO-10", "PO-11",
  "PSO-1", "PSO-2",
] as const;
export type MapColumn = (typeof MAP_COLUMNS)[number];

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

export interface Spec {
  title: string;
  code: string;
  credits: Credits;
  template: Template;
  summary: string;
  cos: CourseOutcome[];
  units: Unit[];
  assessment: AssessmentItem[];
  resources: string;
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
}

export interface Check {
  label: string;
  pass: boolean;
  message: string;
}

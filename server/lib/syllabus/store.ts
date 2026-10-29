import fs from "node:fs";
import path from "node:path";
import {
  MAP_COLUMNS,
  type Role,
  type Status,
  type SyllabusDoc,
} from "../../../app/lib/syllabuddy-types";
import { DEFAULT_ANNEXURE } from "./engine";

const FILE = path.resolve(process.cwd(), "data/syllabuddy.json");

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function emptyDoc(): SyllabusDoc {
  return {
    status: "Draft",
    generated: false,
    spec: null,
    map: {},
    annexure: { ...DEFAULT_ANNEXURE },
    comments: [],
    changes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadDoc(): SyllabusDoc {
  if (!fs.existsSync(FILE)) return emptyDoc();
  const doc = JSON.parse(fs.readFileSync(FILE, "utf8")) as SyllabusDoc;
  for (const col of MAP_COLUMNS) doc.annexure[col] ??= DEFAULT_ANNEXURE[col];
  return doc;
}

export function saveDoc(doc: SyllabusDoc): SyllabusDoc {
  doc.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, FILE);
  return doc;
}

export function requireRole(role: string | null | undefined, allowed: Role[], action: string): void {
  if (!role || !(allowed as string[]).includes(role)) {
    throw new HttpError(403, `Role ${role ?? "none"} cannot ${action}`);
  }
}

export function requireStatus(doc: SyllabusDoc, from: Status[], action: string): void {
  if (!from.includes(doc.status)) {
    throw new HttpError(409, `Cannot ${action} when status is ${doc.status}`);
  }
}

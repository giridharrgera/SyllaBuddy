import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { MAP_COLUMNS } from "../app/lib/syllabuddy-types";
import { loadDoc, requireRole, requireStatus, saveDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description: "Set one CO-PO-PSO map cell to 3, 2, 1, or 0 (blank), with its one-line reason.",
  schema: z.object({
    role: z.enum(["author", "reviewer", "hod"]),
    co: z.string(),
    col: z.enum(MAP_COLUMNS),
    value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    reason: z.string().max(300).default(""),
  }),
  run: async ({ role, co, col, value, reason }) => {
    requireRole(role, ["author"], "edit the map");
    const doc = loadDoc();
    requireStatus(doc, ["Draft", "Returned"], "edit the map");
    if (!doc.spec?.cos.some((c) => c.id === co)) throw new Error(`Unknown course outcome ${co}`);
    const row = (doc.map[co] ??= {});
    if (value === 0) delete row[col];
    else row[col] = { value, reason };
    return { doc: saveDoc(doc) };
  },
});

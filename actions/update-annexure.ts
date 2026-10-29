import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { MAP_COLUMNS } from "../app/lib/syllabuddy-types";
import { loadDoc, requireRole, requireStatus, saveDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description: "Replace the wording of one PO or PSO in Annexure A.",
  schema: z.object({
    role: z.enum(["author", "reviewer", "hod"]),
    col: z.enum(MAP_COLUMNS),
    text: z.string().max(1000),
  }),
  run: async ({ role, col, text }) => {
    requireRole(role, ["author"], "edit Annexure A");
    const doc = loadDoc();
    requireStatus(doc, ["Draft", "Returned"], "edit Annexure A");
    doc.annexure[col] = text;
    return { doc: saveDoc(doc) };
  },
});

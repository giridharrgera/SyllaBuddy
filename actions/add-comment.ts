import { defineAction } from "@agent-native/core/action";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadDoc, requireRole, saveDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description: "Add a reviewer comment to a section of the spec.",
  schema: z.object({
    role: z.enum(["author", "reviewer", "hod"]),
    section: z.enum(["summary", "cos", "units", "assessment", "resources", "map"]),
    text: z.string().trim().min(1).max(1000),
  }),
  run: async ({ role, section, text }) => {
    requireRole(role, ["reviewer"], "comment");
    const doc = loadDoc();
    doc.comments.push({ id: randomUUID(), section, text, at: new Date().toISOString() });
    return { doc: saveDoc(doc) };
  },
});

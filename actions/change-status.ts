import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { loadDoc, requireRole, requireStatus, saveDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description:
    "Move the spec through review: author submits, reviewer returns or forwards to HOD, HOD approves a forwarded spec.",
  schema: z.object({
    role: z.enum(["author", "reviewer", "hod"]),
    action: z.enum(["submit", "return", "forward", "approve"]),
  }),
  run: async ({ role, action }) => {
    const doc = loadDoc();
    if (!doc.spec) throw new Error("Upload a spec before changing its status.");
    switch (action) {
      case "submit":
        requireRole(role, ["author"], "submit");
        requireStatus(doc, ["Draft", "Returned"], "submit");
        doc.status = "Submitted";
        break;
      case "return":
        requireRole(role, ["reviewer"], "return to author");
        requireStatus(doc, ["Submitted"], "return to author");
        doc.status = "Returned";
        break;
      case "forward":
        requireRole(role, ["reviewer"], "forward to HOD");
        requireStatus(doc, ["Submitted"], "forward to HOD");
        doc.status = "Forwarded";
        break;
      case "approve":
        requireRole(role, ["hod"], "approve");
        requireStatus(doc, ["Forwarded"], "approve");
        doc.status = "Approved";
        break;
    }
    return { doc: saveDoc(doc) };
  },
});

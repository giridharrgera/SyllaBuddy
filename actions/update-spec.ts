import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { withBloom } from "../server/lib/syllabus/engine";
import { loadDoc, requireRole, requireStatus, saveDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description: "Save the author's edits to the course spec. Only the author can edit, and only before submission.",
  schema: z.object({
    role: z.enum(["author", "reviewer", "hod"]),
    patch: z.object({
      title: z.string().optional(),
      code: z.string().optional(),
      credits: z.object({ L: z.number(), T: z.number(), P: z.number(), C: z.number() }).optional(),
      summary: z.string().optional(),
      resources: z.string().optional(),
      cos: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
      units: z
        .array(z.object({ no: z.string(), title: z.string(), hours: z.number(), content: z.string() }))
        .optional(),
      assessment: z.array(z.object({ component: z.string(), weightage: z.number() })).optional(),
    }),
  }),
  run: async ({ role, patch }) => {
    requireRole(role, ["author"], "edit the spec");
    const doc = loadDoc();
    requireStatus(doc, ["Draft", "Returned"], "edit the spec");
    if (!doc.spec) throw new Error("Upload a spec before editing.");
    const spec = doc.spec;

    if (patch.title !== undefined) spec.title = patch.title;
    if (patch.code !== undefined) spec.code = patch.code;
    if (patch.credits) {
      spec.credits = patch.credits;
      spec.template = patch.credits.P > 0 ? "integrated" : "non-lab";
    }
    if (patch.summary !== undefined) spec.summary = patch.summary;
    if (patch.resources !== undefined) spec.resources = patch.resources;
    if (patch.units) spec.units = patch.units;
    if (patch.assessment) spec.assessment = patch.assessment;
    if (patch.cos) {
      spec.cos = withBloom(patch.cos.map((co) => ({ ...co, bloom: 0, bloomName: "" })));
      for (const co of spec.cos) doc.map[co.id] ??= {};
      for (const id of Object.keys(doc.map)) {
        if (!spec.cos.some((co) => co.id === id)) delete doc.map[id];
      }
    }

    return { doc: saveDoc(doc) };
  },
});

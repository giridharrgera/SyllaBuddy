import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { mapWarnings, runChecks } from "../server/lib/syllabus/engine";
import { loadDoc } from "../server/lib/syllabus/store";

export default defineAction({
  description: "Read the current course spec, its validation checks, and CO-PO-PSO map warnings.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const doc = loadDoc();
    return { doc, checks: runChecks(doc), warnings: mapWarnings(doc) };
  },
});

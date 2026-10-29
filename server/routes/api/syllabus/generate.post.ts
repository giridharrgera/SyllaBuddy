import { defineEventHandler, setResponseStatus } from "h3";
import { mapWarnings, generateDoc, runChecks } from "../../../lib/syllabus/engine";
import { documentToStructure } from "../../../lib/syllabus/parse";
import { HttpError, requireRole, saveDoc } from "../../../lib/syllabus/store";

export default defineEventHandler(async (event) => {
  try {
    const form = await event.req.formData();
    requireRole(form.get("role")?.toString(), ["author"], "upload a spec");
    const spec = form.get("spec");
    if (!(spec instanceof File) || spec.size === 0) throw new HttpError(400, "Upload the existing course spec.");
    const template = form.get("template");
    if (template !== "integrated" && template !== "non-lab") throw new HttpError(400, "Choose a template.");
    const blueprint = form.get("blueprint");
    const parsedSpec = await documentToStructure(spec);
    const blueprintText =
      blueprint instanceof File && blueprint.size > 0 ? (await documentToStructure(blueprint)).text : "";
    const doc = saveDoc(generateDoc(parsedSpec.text, blueprintText, template, undefined, parsedSpec.tables));
    return { doc, checks: runChecks(doc), warnings: mapWarnings(doc) };
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 400;
    setResponseStatus(event, status);
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
});

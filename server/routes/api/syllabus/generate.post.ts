import { defineEventHandler, setResponseStatus } from "h3";
import { mapWarnings, generateDoc, runChecks } from "../../../lib/syllabus/engine";
import { documentToStructure, type ParsedDocument } from "../../../lib/syllabus/parse";
import { HttpError, requireRole, saveDoc } from "../../../lib/syllabus/store";

const BLUEPRINT_MARKERS = [/question\s+paper\s+blueprint/i, /unit-?wise\s+distribution\s+of\s+marks/i];
const SPEC_MARKERS = [/course\s+specification/i, /course\s+outcomes?/i, /course\s+code/i];

function looksLikeBlueprint(doc: ParsedDocument) {
  return BLUEPRINT_MARKERS.some((re) => re.test(doc.text));
}

function looksLikeSpec(doc: ParsedDocument) {
  return SPEC_MARKERS.filter((re) => re.test(doc.text)).length >= 2;
}

export default defineEventHandler(async (event) => {
  try {
    const form = await event.req.formData();
    requireRole(form.get("role")?.toString(), ["author"], "upload a spec");
    const spec = form.get("spec");
    if (!(spec instanceof File) || spec.size === 0) throw new HttpError(400, "Upload the existing course spec.");
    const template = form.get("template");
    if (template !== "integrated" && template !== "non-lab") throw new HttpError(400, "Choose a template.");
    const blueprint = form.get("blueprint");
    let parsedSpec = await documentToStructure(spec);
    let parsedBlueprint: ParsedDocument | null =
      blueprint instanceof File && blueprint.size > 0 ? await documentToStructure(blueprint) : null;

    if (looksLikeBlueprint(parsedSpec)) {
      if (parsedBlueprint && looksLikeSpec(parsedBlueprint)) {
        [parsedSpec, parsedBlueprint] = [parsedBlueprint, parsedSpec];
      } else {
        throw new HttpError(
          400,
          "The first document is the question paper blueprint. Put the course specification in the first slot and the blueprint in the second.",
        );
      }
    }

    const doc = saveDoc(generateDoc(parsedSpec.text, parsedBlueprint?.text ?? "", template, undefined, parsedSpec.tables));
    return { doc, checks: runChecks(doc), warnings: mapWarnings(doc) };
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 400;
    setResponseStatus(event, status);
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
});

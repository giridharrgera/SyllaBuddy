import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { runChecks } from "../../../lib/syllabus/engine";
import { renderPdf } from "../../../lib/syllabus/pdf";
import { buildJson, renderHtml } from "../../../lib/syllabus/render";
import { HttpError, loadDoc } from "../../../lib/syllabus/store";

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, "kind");
  try {
    const doc = loadDoc();
    if (!doc.spec) throw new HttpError(409, "Nothing to export yet. Upload a spec first.");
    const base = doc.spec.code || "course";
    if (kind === "html") {
      return new Response(renderHtml(doc), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="${base}_spec.html"`,
        },
      });
    }
    if (kind === "pdf") {
      const pdf = await renderPdf(renderHtml(doc), doc.status !== "Approved");
      return new Response(pdf as BodyInit, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${base}_spec.pdf"`,
        },
      });
    }
    if (kind === "json") {
      return new Response(JSON.stringify(buildJson(doc, runChecks(doc)), null, 2), {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="specforge_output.json"`,
        },
      });
    }
    throw new HttpError(404, "Unknown export");
  } catch (err) {
    setResponseStatus(event, err instanceof HttpError ? err.statusCode : 500);
    return { error: err instanceof Error ? err.message : "Export failed" };
  }
});

import { describe, expect, it } from "vitest";
import { MAP_COLUMNS, MAP_STATEMENTS, type SyllabusDoc } from "../app/lib/syllabuddy-types";
import { buildSpecforgeOutput } from "../server/lib/syllabus/specforge";

function sampleDoc(): SyllabusDoc {
  return {
    status: "Draft",
    generated: true,
    spec: {
      inputId: "H1",
      title: "Design and Analysis of Algorithms",
      code: "CS301",
      department: "Department of Computer Science",
      courseType: "Professional Core",
      credits: { L: 3, T: 0, P: 1, C: 4 },
      template: "non-lab",
      summary: "Covers graph methods and their analysis.",
      cos: [
        { id: "CO1", text: "Explain graph traversal techniques.", bloom: 2, bloomName: "Understand" },
        { id: "CO2", text: "Design algorithms for graph problems.", bloom: 6, bloomName: "Create" },
      ],
      units: [
        { no: "1", title: "Graph Algorithms", hours: 3, content: "Traversal and shortest paths.", lab: "Lab: shortest path implementation" },
      ],
      assessment: [
        { component: "End Semester Exam", weightage: 60 },
        { component: "Continuous Assessment", weightage: 40 },
      ],
      resources: "Textbook A.",
      hours: { lectures: 3, lab: 1, testsExams: 0 },
    },
    map: {
      CO1: { "PO-1": { value: 2, reason: "Bloom 2 with graph theory content." } },
      CO2: { "PO-3": { value: 3, reason: "Designs new algorithms." } },
    },
    annexure: Object.fromEntries(MAP_COLUMNS.map((col) => [col, `${col}: ${MAP_STATEMENTS[col]}`])) as SyllabusDoc["annexure"],
    comments: [],
    changes: [],
    updatedAt: new Date(0).toISOString(),
  };
}

describe("buildSpecforgeOutput", () => {
  it("writes the specforge_output.v1 shape", () => {
    const output = buildSpecforgeOutput(sampleDoc());

    expect(output.schema_version).toBe("1.0");
    expect(output.input_id).toBe("H1");
    expect(output.template).toBe("non_lab");
    expect(output.course.credits_ltp).toBe("3:0:1");
    expect(output.course.department).toBe("Department of Computer Science");
    expect(output.course.course_type).toBe("Professional Core");
    expect(output.course_outcomes.map((co) => co.id)).toEqual(["CO-1", "CO-2"]);
    expect(output.units).toEqual([
      { number: 1, title: "Graph Algorithms", lab: "Lab: shortest path implementation" },
    ]);
    expect(output.co_po_pso_map["CO-2"]?.["PO-3"]).toEqual({
      level: 3,
      justification: "Designs new algorithms.",
    });
    expect(output.teaching_hours).toEqual({ lectures: 3, lab: 1, tests_exams: 0, total: 4 });
    expect(output.assessment.components[0]).toEqual({ name: "End Semester Exam", weight_percent: 60 });
    expect(output.assessment.co_coverage["CO-1"]).toEqual(["End Semester Exam", "Continuous Assessment"]);
  });

  it("reports input problems as coded defects", () => {
    const output = buildSpecforgeOutput(sampleDoc());

    expect(output.defects.every((defect) => "section" in defect.location && Array.isArray(defect.location.refs))).toBe(true);
    expect(output.defects.map((defect) => defect.code)).not.toContain("LABEL_OR_TITLE_MISMATCH");
  });

  it("collapses duplicate CO ids coming from nested tables", () => {
    const doc = sampleDoc();
    doc.spec!.cos = [
      ...doc.spec!.cos,
      { id: "CO1", text: "Demonstration using Videos", bloom: 2, bloomName: "Understand" },
    ];

    const output = buildSpecforgeOutput(doc);

    expect(output.course_outcomes.map((co) => co.id)).toEqual(["CO-1", "CO-2"]);
    expect(Object.keys(output.co_po_pso_map)).toEqual(["CO-1", "CO-2"]);
  });

  it("falls back to the pack id when the doc carries none", () => {
    const doc = sampleDoc();
    doc.spec!.inputId = "  ";

    expect(buildSpecforgeOutput(doc).input_id).toBe("SAMPLE");
  });

  it("reports unsupported PO-6..PO-11 cells and a summary that ignores the units", () => {
    const doc = sampleDoc();
    doc.parseMeta = {
      sectionCos: ["CO-1", "CO-2"],
      mapCos: ["CO-1", "CO-2"],
      assessedCos: ["CO-1", "CO-2"],
      mapColumns: [...MAP_COLUMNS],
      declaredHours: null,
      tableHours: null,
      droppedSections: [],
      blueprintMarks: { maximum: null, total: null },
      summaryCoversUnits: false,
      unsupportedCells: [{ co: "CO-1", col: "PO-10", level: 1 }],
    };

    const output = buildSpecforgeOutput(doc);
    const codes = output.defects.map((defect) => defect.code);

    expect(codes).toContain("SUMMARY_SYLLABUS_MISMATCH");
    expect(codes).toContain("MAPPING_UNSUPPORTED");
  });

  it("refuses to emit a document with no course outcomes", () => {
    const doc = sampleDoc();
    doc.spec!.cos = [];

    expect(() => buildSpecforgeOutput(doc)).toThrow(/No course outcomes/);
  });
});

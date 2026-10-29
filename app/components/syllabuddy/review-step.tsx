import { useState, type ReactNode } from "react";
import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client/hooks";
import { Button } from "@/components/ui/button";
import type { Check, Comment, Role, Spec, SyllabusDoc } from "@/lib/syllabuddy-types";
import { Card, Empty, Field, Notes, inputClass } from "./ui";

type Section = "summary" | "cos" | "units" | "assessment" | "resources";

function SectionBlock({
  title,
  section,
  comments,
  role,
  children,
  onComment,
}: {
  title: string;
  section: Section;
  comments: Comment[];
  role: Role;
  children: ReactNode;
  onComment: (section: Section, text: string) => void;
}) {
  const [text, setText] = useState("");
  const mine = comments.filter((c) => c.section === section);
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_15rem]">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </div>
      <div className="flex flex-col gap-2">
        <Notes comments={mine} />
        {role === "reviewer" && (
          <div className="flex flex-col gap-2">
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Add a note for the author"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!text.trim()}
              onClick={() => {
                onComment(section, text.trim());
                setText("");
              }}
            >
              Add note
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChecksCard({ checks, changes }: { checks: Check[]; changes: string[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-semibold">Validation report</h2>
      <ul className="flex flex-col gap-3">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-2 text-sm">
            {c.pass ? (
              <IconCircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            ) : (
              <IconCircleX className="mt-0.5 size-5 shrink-0 text-rose-600" />
            )}
            <div>
              <p className="font-medium">{c.label}</p>
              <p className="text-muted-foreground">{c.message}</p>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Changes made</h3>
        {changes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No fixes were needed.</p>
        )}
      </div>
    </Card>
  );
}

export function ReviewStep({
  doc,
  checks,
  role,
  onAfterChange,
}: {
  doc: SyllabusDoc;
  checks: Check[];
  role: Role;
  onAfterChange: () => void;
}) {
  const spec = doc.spec;
  const readOnly = role !== "author" || (doc.status !== "Draft" && doc.status !== "Returned");
  const [draft, setDraft] = useState<Spec | null>(spec);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useActionMutation("update-spec");
  const transition = useActionMutation("change-status");
  const comment = useActionMutation("add-comment");

  if (!spec || !draft) {
    return <Empty title="No spec yet" hint="Upload your course spec in step 1 to start reviewing." />;
  }

  const set = <K extends keyof Spec>(key: K, value: Spec[K]) => setDraft({ ...draft, [key]: value });
  const error = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

  const saveEdits = () => {
    setSaveError(null);
    save.mutate(
      {
        role,
        patch: {
          title: draft.title,
          code: draft.code,
          credits: draft.credits,
          summary: draft.summary,
          resources: draft.resources,
          cos: draft.cos.map((c) => ({ id: c.id, text: c.text })),
          units: draft.units,
          assessment: draft.assessment,
        },
      },
      { onSuccess: onAfterChange, onError: (e) => setSaveError(error(e)) },
    );
  };

  const move = (action: "submit" | "return" | "forward" | "approve") =>
    transition.mutate({ role, action }, { onSuccess: onAfterChange });

  const addNote = (section: Section, text: string) =>
    comment.mutate({ role, section, text }, { onSuccess: onAfterChange });

  const actions: ReactNode[] = [];
  if (role === "author" && (doc.status === "Draft" || doc.status === "Returned")) {
    actions.push(
      <Button key="submit" onClick={() => move("submit")} disabled={transition.isPending}>
        Submit to Reviewer
      </Button>,
    );
  }
  if (role === "reviewer" && doc.status === "Submitted") {
    actions.push(
      <Button key="return" variant="outline" onClick={() => move("return")}>
        Return to Author
      </Button>,
      <Button key="forward" onClick={() => move("forward")}>
        Forward to HOD
      </Button>,
    );
  }
  if (role === "hod" && doc.status === "Forwarded") {
    actions.push(
      <Button key="approve" onClick={() => move("approve")}>
        Approve
      </Button>,
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Course title">
              <input className={inputClass} disabled={readOnly} value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Course code">
              <input className={inputClass} disabled={readOnly} value={draft.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(["L", "T", "P", "C"] as const).map((k) => (
              <Field key={k} label={k}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  disabled={readOnly}
                  value={draft.credits[k]}
                  onChange={(e) => set("credits", { ...draft.credits, [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <SectionBlock title="Course summary" section="summary" comments={doc.comments} role={role} onComment={addNote}>
            <textarea className={inputClass} rows={4} disabled={readOnly} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
          </SectionBlock>
          <SectionBlock title="Course outcomes" section="cos" comments={doc.comments} role={role} onComment={addNote}>
            {draft.cos.map((co, i) => (
              <div key={co.id} className="flex gap-2">
                <span className="w-12 shrink-0 pt-2 text-sm font-medium">{co.id}</span>
                <textarea
                  rows={2}
                  className={inputClass}
                  disabled={readOnly}
                  value={co.text}
                  onChange={(e) =>
                    set("cos", draft.cos.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)))
                  }
                />
                <span className="shrink-0 pt-2 text-xs text-muted-foreground">{co.bloom ? `Bloom ${co.bloom}` : ""}</span>
              </div>
            ))}
          </SectionBlock>
          <SectionBlock title="Unit-wise syllabus" section="units" comments={doc.comments} role={role} onComment={addNote}>
            {draft.units.map((u, i) => (
              <div key={i} className="grid grid-cols-[4rem_1fr_5rem] gap-2">
                <input className={inputClass} disabled={readOnly} value={u.no} onChange={(e) => set("units", draft.units.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)))} />
                <input className={inputClass} disabled={readOnly} value={u.title} onChange={(e) => set("units", draft.units.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input type="number" min={0} className={inputClass} disabled={readOnly} value={u.hours} onChange={(e) => set("units", draft.units.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))} />
                <textarea rows={2} className={`${inputClass} col-span-3`} disabled={readOnly} value={u.content} onChange={(e) => set("units", draft.units.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} />
              </div>
            ))}
          </SectionBlock>
          <SectionBlock title="Assessment" section="assessment" comments={doc.comments} role={role} onComment={addNote}>
            {draft.assessment.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
                <input className={inputClass} disabled={readOnly} value={a.component} onChange={(e) => set("assessment", draft.assessment.map((x, j) => (j === i ? { ...x, component: e.target.value } : x)))} />
                <input type="number" min={0} className={inputClass} disabled={readOnly} value={a.weightage} onChange={(e) => set("assessment", draft.assessment.map((x, j) => (j === i ? { ...x, weightage: Number(e.target.value) } : x)))} />
              </div>
            ))}
          </SectionBlock>
          <SectionBlock title="Resources" section="resources" comments={doc.comments} role={role} onComment={addNote}>
            <textarea className={inputClass} rows={3} disabled={readOnly} value={draft.resources} onChange={(e) => set("resources", e.target.value)} />
          </SectionBlock>
          {saveError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</p>}
          <div className="flex flex-wrap gap-2">
            {role === "author" && !readOnly && (
              <Button onClick={saveEdits} disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save changes"}
              </Button>
            )}
            {actions}
          </div>
        </Card>
      </div>
      <ChecksCard checks={checks} changes={doc.changes} />
    </div>
  );
}

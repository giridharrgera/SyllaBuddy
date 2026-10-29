import { useState } from "react";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { ExportStep } from "@/components/syllabuddy/export-step";
import { MapStep } from "@/components/syllabuddy/map-step";
import { ReviewStep } from "@/components/syllabuddy/review-step";
import { UploadStep } from "@/components/syllabuddy/upload-step";
import { StatusChip } from "@/components/syllabuddy/ui";
import type { Role, Template } from "@/lib/syllabuddy-types";

export function meta() {
  return [{ title: "SyllaBuddy" }, { name: "description", content: "Clean up course specs and build CO-PO-PSO maps" }];
}

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Review" },
  { n: 3, label: "CO-PO-PSO Map" },
  { n: 4, label: "Export" },
];

export default function SyllaBuddyRoute() {
  const [role, setRole] = useState<Role>("author");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useActionQuery("get-syllabus", {});

  const doc = data?.doc;
  const refresh = () => queryClient.invalidateQueries();

  const generate = async (spec: File, blueprint: File | null, template: Template) => {
    setBusy(true);
    setUploadError(null);
    const form = new FormData();
    form.append("role", role);
    form.append("template", template);
    form.append("spec", spec);
    if (blueprint) form.append("blueprint", blueprint);
    try {
      const res = await fetch("/api/syllabus/generate", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      await refresh();
      setStep(2);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 text-foreground">
      <header className="sticky top-0 z-10 border-b border-indigo-100 bg-white/80 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-md">S</span>
            <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-lg font-bold text-transparent">SyllaBuddy</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
              >
                <option value="author">Author</option>
                <option value="reviewer">Reviewer</option>
                <option value="hod">HOD</option>
              </select>
            </label>
            {doc && <StatusChip status={doc.status} />}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <nav className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                step === s.n
                  ? "border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg"
                  : "border-indigo-100 bg-white hover:border-fuchsia-200"
              }`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  step === s.n ? "bg-white text-indigo-600" : "bg-indigo-100 text-indigo-600"
                }`}
              >
                {s.n}
              </span>
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          ))}
        </nav>

        {isLoading || !doc ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : step === 1 ? (
          <UploadStep role={role} busy={busy} error={uploadError} onGenerate={generate} />
        ) : step === 2 ? (
          <ReviewStep
            key={doc.updatedAt}
            doc={doc}
            checks={data?.checks ?? []}
            role={role}
            onAfterChange={refresh}
          />
        ) : step === 3 ? (
          <MapStep doc={doc} warnings={data?.warnings ?? []} role={role} />
        ) : (
          <ExportStep doc={doc} />
        )}
      </main>
    </div>
  );
}

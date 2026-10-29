import { useState, type DragEvent } from "react";
import { IconFileText, IconUpload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { Role, Template } from "@/lib/syllabuddy-types";
import { Card } from "./ui";

function DropZone({
  label,
  file,
  onFile,
  disabled,
}: {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled: boolean;
}) {
  const [over, setOver] = useState(false);
  const pick = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFile(e.dataTransfer.files[0] ?? null);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={pick}
      className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        over ? "border-primary bg-indigo-50" : "border-border bg-card hover:bg-muted/40"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        type="file"
        accept=".doc,.docx"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? <IconFileText className="size-8 text-emerald-600" /> : <IconUpload className="size-8 text-primary" />}
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-sm text-muted-foreground">{file ? file.name : "Drop a .doc or .docx here, or click to choose"}</span>
    </label>
  );
}

export function UploadStep({
  role,
  busy,
  error,
  onGenerate,
}: {
  role: Role;
  busy: boolean;
  error: string | null;
  onGenerate: (spec: File, blueprint: File | null, template: Template) => void;
}) {
  const [spec, setSpec] = useState<File | null>(null);
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [template, setTemplate] = useState<Template | "">("");
  const isAuthor = role === "author";

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Upload your course files</h2>
        <p className="text-sm text-muted-foreground">We will clean up the spec and build a fresh CO-PO-PSO map.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <DropZone label="Existing course spec (.docx)" file={spec} onFile={setSpec} disabled={!isAuthor || busy} />
        <DropZone
          label="Question-paper blueprint (.doc/.docx, optional)"
          file={blueprint}
          onFile={setBlueprint}
          disabled={!isAuthor || busy}
        />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground md:max-w-xs">
        Template
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as Template | "")}
          disabled={!isAuthor || busy}
          className="rounded-lg border border-border bg-card px-3 py-2 font-normal"
        >
          <option value="">Choose a template</option>
          <option value="integrated">Integrated (Theory + Lab)</option>
          <option value="non-lab">Non-lab</option>
        </select>
      </label>
      {!isAuthor && <p className="text-sm text-muted-foreground">Only the Author can upload. Switch role to Author to start.</p>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div>
        <Button
          onClick={() => spec && template && onGenerate(spec, blueprint, template)}
          disabled={!isAuthor || !spec || !template || busy}
        >
          {busy ? "Generating..." : "Generate corrected spec"}
        </Button>
      </div>
    </Card>
  );
}

import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client/hooks";
import { Button } from "@/components/ui/button";
import { MAP_COLUMNS, type Level, type MapColumn, type Role, type SyllabusDoc } from "@/lib/syllabuddy-types";
import { Card, Empty, inputClass } from "./ui";

const SHADE: Record<Level, string> = {
  0: "bg-white text-muted-foreground",
  1: "bg-indigo-100 text-indigo-900",
  2: "bg-indigo-300 text-indigo-950",
  3: "bg-indigo-600 text-white",
};

export function MapStep({
  doc,
  warnings,
  role,
}: {
  doc: SyllabusDoc;
  warnings: string[];
  role: Role;
}) {
  const spec = doc.spec;
  const [active, setActive] = useState<{ co: string; col: MapColumn } | null>(null);
  const [value, setValue] = useState<Level>(0);
  const [reason, setReason] = useState("");
  const updateCell = useActionMutation("update-cell");
  const updateAnnex = useActionMutation("update-annexure");
  const canEdit = role === "author" && (doc.status === "Draft" || doc.status === "Returned");

  if (!spec) {
    return <Empty title="No map yet" hint="Upload your course spec in step 1 to build the map." />;
  }

  const open = (co: string, col: MapColumn) => {
    const cell = doc.map[co]?.[col];
    setActive({ co, col });
    setValue((cell?.value ?? 0) as Level);
    setReason(cell?.reason ?? "");
  };

  const save = () => {
    if (!active) return;
    updateCell.mutate(
      { role, co: active.co, col: active.col, value, reason },
      { onSuccess: () => setActive(null) },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <ul className="flex flex-col gap-1 text-sm text-amber-900">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="p-3 font-medium">Course outcome</th>
              {MAP_COLUMNS.map((c) => (
                <th key={c} className="p-2 text-center font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.cos.map((co) => (
              <tr key={co.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <div className="font-medium">{co.id}</div>
                  <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                    {co.bloom ? `Bloom ${co.bloom} · ${co.bloomName}` : "No Bloom level"}
                  </span>
                </td>
                {MAP_COLUMNS.map((col) => {
                  const cell = doc.map[co.id]?.[col];
                  const v = (cell?.value ?? 0) as Level;
                  return (
                    <td key={col} className="p-1 text-center">
                      <button
                        type="button"
                        title={cell?.reason || "No mapping"}
                        onClick={() => open(co.id, col)}
                        className={`size-9 rounded-md border border-border font-medium transition-colors hover:ring-2 hover:ring-ring/50 ${SHADE[v]}`}
                      >
                        {v || ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {active && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {active.co} × {active.col}
          </p>
          <div className="flex flex-wrap gap-2">
            {([0, 1, 2, 3] as Level[]).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={value === v ? "default" : "outline"}
                disabled={!canEdit}
                onClick={() => setValue(v)}
              >
                {v === 0 ? "Blank" : v}
              </Button>
            ))}
          </div>
          <textarea
            className={inputClass}
            rows={2}
            disabled={!canEdit}
            placeholder="Why this mapping? One line."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            {canEdit && (
              <Button onClick={save} disabled={updateCell.isPending}>
                Save cell
              </Button>
            )}
            <Button variant="ghost" onClick={() => setActive(null)}>
              Close
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Annexure A</h2>
          <p className="text-sm text-muted-foreground">Wording for each PO and PSO, seeded from the programme definitions. Edit as needed.</p>
        </div>
        {MAP_COLUMNS.map((col) => (
          <AnnexureRow
            key={`${col}-${doc.annexure[col]}`}
            col={col}
            text={doc.annexure[col]}
            disabled={!canEdit}
            onSave={(text) => updateAnnex.mutate({ role, col, text })}
          />
        ))}
      </Card>
    </div>
  );
}

function AnnexureRow({
  col,
  text,
  disabled,
  onSave,
}: {
  col: MapColumn;
  text: string;
  disabled: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(text);
  return (
    <div className="grid grid-cols-[5rem_1fr] items-start gap-3">
      <span className="pt-2 text-sm font-medium">{col}</span>
      <input
        className={inputClass}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== text && onSave(draft)}
      />
    </div>
  );
}

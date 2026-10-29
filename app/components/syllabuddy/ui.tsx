import type { ReactNode } from "react";
import type { Comment, Status } from "@/lib/syllabuddy-types";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", className)}>{children}</div>
  );
}

const STATUS_STYLES: Record<Status, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Submitted: "bg-indigo-50 text-indigo-700",
  Returned: "bg-amber-50 text-amber-800",
  Forwarded: "bg-indigo-50 text-indigo-700",
  Approved: "bg-emerald-50 text-emerald-700",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_STYLES[status])}>{status}</span>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-70";

export function Notes({ comments }: { comments: Comment[] }) {
  if (!comments.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm">
          {c.text}
        </div>
      ))}
    </div>
  );
}

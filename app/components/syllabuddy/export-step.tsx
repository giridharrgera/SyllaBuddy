import { IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { SyllabusDoc } from "@/lib/syllabuddy-types";
import { Card, Empty } from "./ui";

const FILES = [
  { href: "/api/export/html", title: "Download HTML", hint: "Official template, filled in" },
  { href: "/api/export/pdf", title: "Download PDF", hint: "Shows a DRAFT watermark until approved" },
  { href: "/api/export/json", title: "Download specforge_output.json", hint: "Structured data for other tools" },
];

export function ExportStep({ doc }: { doc: SyllabusDoc }) {
  if (!doc.spec) {
    return <Empty title="Nothing to export yet" hint="Generate a corrected spec in step 1 first." />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {FILES.map((f) => (
        <Card key={f.href} className="flex flex-col gap-3">
          <div>
            <p className="font-semibold">{f.title}</p>
            <p className="text-sm text-muted-foreground">{f.hint}</p>
          </div>
          <a href={f.href} download className="mt-auto">
            <Button className="w-full">
              <IconDownload className="size-4" /> Download
            </Button>
          </a>
        </Card>
      ))}
    </div>
  );
}

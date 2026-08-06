import { useState } from "react";
import { ChevronDown, Download, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ExportFormat = "pdf" | "csv" | "xlsx";

export function ExportMenu({
  onExport,
  formats = ["pdf", "csv", "xlsx"],
  disabled,
}: {
  onExport: (f: ExportFormat) => void;
  formats?: ExportFormat[];
  disabled?: boolean;
}) {
  const label: Record<ExportFormat, string> = { pdf: "PDF", csv: "CSV", xlsx: "Excel (XLSX)" };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((f) => (
          <DropdownMenuItem key={f} onSelect={() => onExport(f)}>
            {label[f]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Filter container: always open on desktop, collapsible on mobile. */
export function FilterPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-medium sm:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
          open ? "mt-4 grid" : "hidden sm:grid",
        )}
      >
        {children}
      </div>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function SummaryCards({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label} className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.label}
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{s.value}</p>
          {s.hint && <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>}
        </Card>
      ))}
    </div>
  );
}

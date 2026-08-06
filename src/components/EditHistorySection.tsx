import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { describeChanges, useBillEditHistory } from "@/lib/bill-edit";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function EditHistorySection({ billId }: { billId: string }) {
  const [open, setOpen] = useState(false);
  const { data: rows = [], isLoading } = useBillEditHistory(billId);

  return (
    <section className="no-print surface-card mx-auto w-full max-w-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          Edit History
          <span className="text-xs font-normal text-muted-foreground">
            {isLoading ? "…" : rows.length === 0 ? "No edits made" : `${rows.length} edit${rows.length > 1 ? "s" : ""}`}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {rows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No edits made.</p>
          ) : (
            <ol className="space-y-4">
              {rows.map((row) => (
                <li key={row.id} className="border-l-2 border-primary/40 pl-3">
                  <p className="numeric text-xs text-muted-foreground">
                    {new Date(row.edited_at).toLocaleString()}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {describeChanges(row, formatMoney).map((line, i) => (
                      <li key={i} className="text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

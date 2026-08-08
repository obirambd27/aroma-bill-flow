import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_TONE } from "@/lib/payments";
import { cn } from "@/lib/utils";

export type MethodTotals = Record<string, number>;

/** Sums bill amounts per payment method (unpaid bills fall outside the three tiles). */
export function sumByMethod(
  rows: { payment_method?: string | null; paymentMethod?: string | null; amount: number }[],
): MethodTotals {
  const totals: MethodTotals = {};
  for (const m of PAYMENT_METHODS) totals[m] = 0;
  for (const r of rows) {
    const m = r.payment_method ?? r.paymentMethod;
    if (!m || !(m in totals)) continue;
    totals[m] = (totals[m] ?? 0) + r.amount;
  }
  return totals;
}

export function PaymentMethodTag({ method }: { method?: string | null }) {
  if (!method) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <StatusBadge tone={PAYMENT_METHOD_TONE[method] ?? "neutral"}>{method}</StatusBadge>
  );
}

/** Clickable Cash / Credit Card / Bank Transfer tiles with a total sales header. */
export function PaymentMethodTiles({
  totals,
  totalSales,
  active,
  onSelect,
  label = "Total Sales",
}: {
  totals: MethodTotals;
  totalSales: number;
  active?: string | null;
  onSelect?: (method: string | null) => void;
  label?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="numeric text-xl font-semibold tracking-tight">{formatMoney(totalSales)}</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PAYMENT_METHODS.map((m) => {
          const isActive = active === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelect?.(isActive ? null : m)}
              className={cn(
                "rounded-xl border border-border p-3 text-left transition-colors",
                onSelect ? "hover:bg-muted/50" : "cursor-default",
                isActive && "border-primary bg-primary/5",
              )}
            >
              <PaymentMethodTag method={m} />
              <p className="numeric mt-1.5 text-base font-semibold">
                {formatMoney(totals[m] ?? 0)}
              </p>
            </button>
          );
        })}
      </div>
      {active && (
        <button
          type="button"
          onClick={() => onSelect?.(null)}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          Clear {active} filter
        </button>
      )}
    </Card>
  );
}

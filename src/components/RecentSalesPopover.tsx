import { History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProductSales } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

function RecentSalesList({ productId }: { productId: string }) {
  const { data: sales = [], isLoading } = useProductSales(productId);
  const recent = sales.slice(0, 5);

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading recent sales…</p>;
  }
  if (recent.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">No sales recorded yet.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left font-medium uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2">Date</th>
          <th className="px-3 py-2">Customer</th>
          <th className="px-3 py-2 text-right">Qty</th>
          <th className="px-3 py-2 text-right">Price</th>
        </tr>
      </thead>
      <tbody>
        {recent.map((row) => (
          <tr key={row.id} className="border-b border-border/60 last:border-0">
            <td className="whitespace-nowrap px-3 py-2">{formatDate(row.bills?.bill_date)}</td>
            <td className="max-w-[120px] truncate px-3 py-2">
              {row.bills?.customers?.name ?? "Walk-in"}
            </td>
            <td className="numeric px-3 py-2 text-right">{row.quantity}</td>
            <td className="numeric px-3 py-2 text-right font-medium">
              {formatMoney(row.unit_price)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RecentSalesPopover({ productId }: { productId: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <History className="h-3.5 w-3.5" />
          Recent transactions
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold">Last 5 sales</p>
        <RecentSalesList productId={productId} />
      </PopoverContent>
    </Popover>
  );
}

import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useStockDiscrepancyCount } from "@/lib/stock-audit";

/** Dashboard banner shown whenever the last stock audit left unresolved flags. */
export function StockDiscrepancyAlert() {
  const count = useStockDiscrepancyCount();
  if (count <= 0) return null;
  return (
    <Link
      to="/stock-audit"
      className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive transition-colors hover:bg-destructive/15"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <strong>{count}</strong> stock discrepanc{count === 1 ? "y" : "ies"} found — review and
        correct them in the Stock Audit.
      </span>
    </Link>
  );
}

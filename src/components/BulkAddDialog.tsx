import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/lib/data";
import { formatMoney } from "@/lib/format";

type Row = { id: number; productId: string; query: string; quantity: string };

let nextId = 1;
const emptyRow = (): Row => ({ id: nextId++, productId: "", query: "", quantity: "1" });

export function BulkAddDialog({
  open,
  onOpenChange,
  products,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onAdd: (items: { productId: string; quantity: number }[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);

  const patch = (id: number, next: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const matches = (row: Row) => {
    const q = row.query.trim().toLowerCase();
    if (!q || row.productId) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q),
      )
      .slice(0, 5);
  };

  const submit = () => {
    const items = rows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId, quantity: Math.max(1, Number(r.quantity) || 1) }));
    if (items.length === 0) return;
    onAdd(items);
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add items in bulk</DialogTitle>
          <DialogDescription>
            Search a product per row, set the quantity, then add them all at once.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => {
            const found = products.find((p) => p.id === row.productId);
            const list = matches(row);
            return (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_80px_auto] gap-2">
                <div className="relative">
                  <Input
                    className="h-10"
                    placeholder="Search product"
                    value={found ? found.name : row.query}
                    onChange={(e) => patch(row.id, { query: e.target.value, productId: "" })}
                  />
                  {list.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => patch(row.id, { productId: p.id, query: p.name })}
                          >
                            <span className="min-w-0 truncate">{p.name}</span>
                            <span className="numeric shrink-0 text-xs">
                              {formatMoney(p.price)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Input
                  type="number"
                  min={1}
                  aria-label="Quantity"
                  className="numeric h-10 text-center"
                  value={row.quantity}
                  onChange={(e) => patch(row.id, { quantity: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove row"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Add to bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomers } from "@/lib/data";

/** Searchable customer selector — safe with thousands of customers. */
export function CustomerPicker({
  id,
  value,
  onChange,
  onCreateNew,
  allowWalkIn = true,
}: {
  id?: string;
  /** "walk-in" or a customer id */
  value: string;
  onChange: (value: string) => void;
  onCreateNew?: () => void;
  allowWalkIn?: boolean;
}) {
  const { data: customers = [] } = useCustomers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const selected = customers.find((c) => c.id === value) ?? null;
  const label = selected
    ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}`
    : allowWalkIn
      ? "Walk-in customer"
      : "Select customer";

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 20);
  }, [customers, debounced]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-11 w-full justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            className="h-10"
            placeholder="Search name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {allowWalkIn && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                onClick={() => {
                  onChange("walk-in");
                  setOpen(false);
                }}
              >
                Walk-in customer
              </button>
            </li>
          )}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
              >
                {c.name}
                {c.phone ? <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span> : null}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No customers match.</li>
          )}
        </ul>
        {onCreateNew && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
            >
              + New Customer
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

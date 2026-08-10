import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export type QuickRange = { label: string; from: string; to: string };

/** Common ready-made ranges offered alongside the calendar. */
export function quickRanges(): QuickRange[] {
  const now = new Date();
  const today = toISODate(now);
  const shift = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return toISODate(d);
  };
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: shift(1), to: shift(1) },
    { label: "Last 7 days", from: shift(6), to: today },
    { label: "Last 30 days", from: shift(29), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: toISODate(lastMonthStart), to: toISODate(lastMonthEnd) },
    { label: "This year", from: toISODate(new Date(now.getFullYear(), 0, 1)), to: today },
  ];
}

type Props = {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
  placeholder?: string;
};

/** Calendar-based custom date range picker with quick presets. */
export function DateRangeFilter({
  from,
  to,
  onChange,
  className,
  placeholder = "Pick a date range",
}: Props) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = from
    ? { from: parseISO(from), ...(to ? { to: parseISO(to) } : {}) }
    : undefined;

  const label = from
    ? to && to !== from
      ? `${format(parseISO(from), "dd MMM yyyy")} – ${format(parseISO(to), "dd MMM yyyy")}`
      : format(parseISO(from), "dd MMM yyyy")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-11 w-full justify-start gap-2 font-normal",
            !from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:w-40 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {quickRanges().map((r) => (
              <Button
                key={r.label}
                variant="ghost"
                size="sm"
                className="shrink-0 justify-start whitespace-nowrap text-xs"
                onClick={() => {
                  onChange({ from: r.from, to: r.to });
                  setOpen(false);
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <div>
            <Calendar
              mode="range"
              defaultMonth={selected?.from ?? new Date()}
              selected={selected}
              onSelect={(r) =>
                onChange({
                  from: r?.from ? toISODate(r.from) : "",
                  to: r?.to ? toISODate(r.to) : r?.from ? toISODate(r.from) : "",
                })
              }
              numberOfMonths={1}
              className={cn("pointer-events-auto p-3")}
            />
            <div className="flex justify-between gap-2 border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange({ from: "", to: "" });
                  setOpen(false);
                }}
              >
                Clear
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

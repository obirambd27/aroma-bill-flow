import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SIZES = [25, 50, 100, 200];

/**
 * Client-side pagination over an already-filtered list.
 * Filtering/search always runs over the full list; only rendering is paged.
 */
export function usePaged<T>(items: T[], initialSize = 50) {
  const [pageSize, setPageSize] = useState(initialSize);
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [total, pageSize]);

  const current = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return {
    pageItems,
    props: {
      page: current,
      pageCount,
      pageSize,
      total,
      onPage: setPage,
      onPageSize: setPageSize,
    },
  };
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
  label = "items",
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  label?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
      <p className="text-xs text-muted-foreground">
        Showing <span className="numeric font-medium">{from}</span>–
        <span className="numeric font-medium">{to}</span> of{" "}
        <span className="numeric font-medium">{total}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-9 w-[104px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="numeric text-xs text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

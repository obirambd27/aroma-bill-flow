import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Split-pane shell used by the list/detail screens.
 *
 * Desktop / tablet: scrollable list on the left, live detail preview on the right.
 * Mobile: only one side is rendered — the list on index routes, the detail on
 * `$id` routes — so narrow screens keep the classic full-page navigation.
 */
export function MasterDetail({
  list,
  detail,
  /** true on a `$id` route: mobile shows the detail instead of the list. */
  detailSelected = false,
  listClassName,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  detailSelected?: boolean;
  listClassName?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) return <>{detailSelected ? detail : list}</>;

  // No record selected: show the plain full-width list, like before the split view.
  if (!detailSelected) return <div className="min-w-0">{list}</div>;

  return (
    <div className="flex min-h-0 items-start gap-4">
      <div className={cn("w-[360px] shrink-0 xl:w-[420px]", listClassName)}>
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">{list}</div>
      </div>
      <div className="min-w-0 flex-1">{detail}</div>
    </div>
  );

}

/** Placeholder shown in the right pane when nothing is selected yet. */
export function DetailPlaceholder({ message }: { message: string }) {
  return (
    <div className="surface-card flex min-h-[60vh] items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Retry state shown inside the right pane when a record fails to load. */
export function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="surface-card flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}

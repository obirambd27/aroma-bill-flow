import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  assignTag,
  createTag,
  tagClass,
  unassignTag,
  useCrmInvalidate,
  useCustomerTags,
  useTagAssignments,
  type TagAssignment,
} from "@/lib/crm";

export function CustomerTagChips({
  assignments,
  className,
}: {
  assignments: TagAssignment[];
  className?: string;
}) {
  if (assignments.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {assignments.map((a) => (
        <Badge
          key={a.id}
          variant="outline"
          className={cn(
            "rounded-full px-2 py-0 text-[11px] font-medium",
            tagClass(a.customer_tags?.color),
          )}
        >
          {a.customer_tags?.name}
        </Badge>
      ))}
    </div>
  );
}

export function CustomerTagEditor({ customerId }: { customerId: string }) {
  const { data: tags = [] } = useCustomerTags();
  const { data: assignmentsByCustomer = {} } = useTagAssignments();
  const invalidate = useCrmInvalidate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const assigned = assignmentsByCustomer[customerId] ?? [];
  const assignedIds = new Set(assigned.map((a) => a.tag_id));
  const q = query.trim().toLowerCase();
  const matches = tags.filter(
    (t) => !assignedIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)),
  );
  const exact = tags.some((t) => t.name.toLowerCase() === q);

  const attach = async (tagId: string) => {
    setBusy(true);
    try {
      await assignTag(customerId, tagId);
      invalidate();
      setQuery("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the tag");
    } finally {
      setBusy(false);
    }
  };

  const createAndAttach = async () => {
    setBusy(true);
    try {
      const tag = await createTag(query);
      await assignTag(customerId, tag.id);
      invalidate();
      toast.success(`Tag “${tag.name}” created`);
      setQuery("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the tag");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (assignmentId: string) => {
    try {
      await unassignTag(assignmentId);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the tag");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assigned.map((a) => (
        <Badge
          key={a.id}
          variant="outline"
          className={cn(
            "gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium",
            tagClass(a.customer_tags?.color),
          )}
        >
          {a.customer_tags?.name}
          <button
            type="button"
            aria-label={`Remove ${a.customer_tags?.name} tag`}
            className="rounded-full p-0.5 transition-opacity hover:opacity-70"
            onClick={() => remove(a.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 rounded-full text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <Input
            autoFocus
            className="h-10"
            placeholder="Search or create a tag"
            value={query}
            maxLength={40}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {matches.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => attach(t.id)}
              >
                <span
                  className={cn("h-2.5 w-2.5 rounded-full border", tagClass(t.color))}
                  aria-hidden
                />
                {t.name}
              </button>
            ))}
            {q && !exact && (
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
                onClick={createAndAttach}
              >
                <Plus className="h-3.5 w-3.5" />
                Create tag: {query.trim()}
              </button>
            )}
            {matches.length === 0 && !q && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                All available tags are already applied.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

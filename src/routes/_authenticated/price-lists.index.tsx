import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Copy, ListChecks, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  useCreatePriceList,
  useDeletePriceList,
  useDuplicatePriceList,
  usePriceLists,
  type PriceListRow,
} from "@/lib/price-lists";

export const Route = createFileRoute("/_authenticated/price-lists/")({
  head: () => ({
    meta: [
      { title: "Price Lists — Fragrance Billing" },
      {
        name: "description",
        content: "Build shareable client price lists with custom pricing per product.",
      },
      { property: "og:title", content: "Price Lists — Fragrance Billing" },
      {
        property: "og:description",
        content: "Build shareable client price lists with custom pricing per product.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PriceListsPage,
});

function PriceListsPage() {
  const navigate = useNavigate();
  const { data: lists = [], isLoading } = usePriceLists();
  const createList = useCreatePriceList();
  const duplicateList = useDuplicatePriceList();
  const deleteList = useDeletePriceList();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PriceListRow | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createList.mutateAsync(trimmed);
      setNewOpen(false);
      setName("");
      navigate({ to: "/price-lists/$listId", params: { listId: created.id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price Lists"
        description="Curated product pricing you can share with clients."
        actions={
          <Button className="h-11" onClick={() => setNewOpen(true)}>
            <Plus />
            New Price List
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading price lists…</p>
        ) : lists.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No price lists yet"
            description="Create a list, pick products and set client-specific prices."
          />
        ) : (
          <div className="divide-y divide-border">
            {lists.map((list) => (
              <div key={list.id} className="flex flex-wrap items-center gap-3 p-4">
                <Link
                  to="/price-lists/$listId"
                  params={{ listId: list.id }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate font-semibold text-foreground">{list.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {list.client_name ?? "No client"} · {list.itemCount} products · Updated{" "}
                    {formatDateTime(list.updated_at)}
                  </p>
                </Link>
                {list.is_share_enabled && <Badge variant="secondary">Shared</Badge>}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      duplicateList
                        .mutateAsync(list)
                        .then(() => toast.success("Price list duplicated"))
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPendingDelete(list)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New price list</DialogTitle>
          </DialogHeader>
          <Input
            className="h-11"
            placeholder="e.g. Wholesale — Dubai"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={!name.trim() || createList.isPending}>
              Create & build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the list and its shared link permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                deleteList
                  .mutateAsync(pendingDelete.id)
                  .then(() => toast.success("Price list deleted"))
                  .catch((e: Error) => toast.error(e.message));
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

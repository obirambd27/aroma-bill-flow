import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, Truck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { VendorFormDialog } from "@/components/VendorFormDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useVendors } from "@/lib/purchases";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vendors/")({
  head: () => ({
    meta: [
      { title: "Vendors — Fragrance Billing" },
      { name: "description", content: "Supplier directory with purchase totals and balances." },
      { property: "og:title", content: "Vendors — Fragrance Billing" },
      {
        property: "og:description",
        content: "Supplier directory with purchase totals and balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorsPage,
});

function VendorsPage() {
  const { data: vendors = [], isLoading } = useVendors();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (v) => v.name.toLowerCase().includes(q) || (v.phone ?? "").toLowerCase().includes(q),
    );
  }, [vendors, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Suppliers you buy stock from."
        actions={
          <Button className="h-11" onClick={() => setDialogOpen(true)}>
            <Plus />
            New Vendor
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search by name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading vendors…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={vendors.length === 0 ? "No vendors yet" : "No matches"}
            description={
              vendors.length === 0
                ? "Add your first supplier to start recording purchase orders and bills."
                : "Try a different name or phone number."
            }
            {...(vendors.length === 0
              ? { actionLabel: "New Vendor", onAction: () => setDialogOpen(true) }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Total purchased</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-0 text-sm font-medium">
                      <Link
                        to="/vendors/$vendorId"
                        params={{ vendorId: v.id }}
                        className="block py-3 hover:text-primary"
                      >
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{v.phone ?? "—"}</td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(v.total_purchased)}
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(v.total_outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((v) => (
                <Link
                  key={v.id}
                  to="/vendors/$vendorId"
                  params={{ vendorId: v.id }}
                  className="block p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.phone ?? "—"}</p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(v.total_purchased)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Outstanding: {formatMoney(v.total_outstanding)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <VendorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

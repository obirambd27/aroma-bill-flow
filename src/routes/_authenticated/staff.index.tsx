import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pagination, usePaged } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { EmployeeFormDialog } from "@/components/EmployeeFormDialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import {
  useEmployees,
  useOutstandingAdvances,
  useSalariesDueThisMonth,
  type Employee,
} from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/staff/")({
  head: () => ({
    meta: [
      { title: "Staff — Fragrance Billing" },
      {
        name: "description",
        content: "Manage employees, salaries and advances for the perfume shop team.",
      },
      { property: "og:title", content: "Staff — Fragrance Billing" },
      {
        property: "og:description",
        content: "Manage employees, salaries and advances for the perfume shop team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: advanceBalances = {} } = useOutstandingAdvances();
  const { data: due } = useSalariesDueThisMonth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesQuery =
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.role ?? "").toLowerCase().includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q);
      const matchesStatus =
        status === "all" || (status === "active" ? e.is_active : !e.is_active);
      return matchesQuery && matchesStatus;
    });
  }, [employees, query, status]);

  const { pageItems, props: pageProps } = usePaged(visible, 50);

  const activeCount = employees.filter((e) => e.is_active).length;
  const monthlyPayroll = employees
    .filter((e) => e.is_active)
    .reduce((s, e) => s + Number(e.base_salary ?? 0), 0);
  const totalAdvances = Object.values(advanceBalances).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Employees, salary payments and advances."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/staff/payroll">
                <BarChart3 className="h-4 w-4" />
                Payroll summary
              </Link>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add employee
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active staff", value: String(activeCount) },
          { label: "Monthly payroll", value: formatMoney(monthlyPayroll) },
          { label: "Open advances", value: formatMoney(totalAdvances) },
          {
            label: due ? `Unpaid · ${due.month}` : "Unpaid this month",
            value: due ? `${due.due.length}` : "—",
            hint: due && due.due.length > 0 ? formatMoney(due.total) : undefined,
          },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{s.value}</p>
            {s.hint && <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, role or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search staff"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff yet"
            description="Add your team to record salaries, bonuses and advances against the ledger."
            actionLabel="Add employee"
            onAction={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 text-right font-medium">Base salary</th>
                    <th className="px-4 py-3 text-right font-medium">Open advance</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          to="/staff/$employeeId"
                          params={{ employeeId: e.id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {e.name}
                        </Link>
                        {e.phone && (
                          <p className="text-xs text-muted-foreground">{e.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.role ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(e.join_date)}
                      </td>
                      <td className="px-4 py-3 text-right numeric">
                        {e.base_salary ? formatMoney(e.base_salary) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right numeric">
                        {advanceBalances[e.id]
                          ? formatMoney(advanceBalances[e.id])
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={e.is_active ? "success" : "neutral"}>
                          {e.is_active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pageProps} label="employees" />
          </>
        )}
      </Card>

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />
    </div>
  );
}

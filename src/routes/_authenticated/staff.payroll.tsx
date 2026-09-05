import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { formatDate, formatMoney } from "@/lib/format";
import { outstandingOf, usePayrollSummary } from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/staff/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll Summary — Fragrance Billing" },
      {
        name: "description",
        content: "Monthly payroll totals, salary payments and advances.",
      },
      { property: "og:title", content: "Payroll Summary — Fragrance Billing" },
      {
        property: "og:description",
        content: "Monthly payroll totals, salary payments and advances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayrollPage,
});

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  const iso = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const range = useMemo(() => monthBounds(month), [month]);
  const { data, isLoading } = usePayrollSummary(range);

  const payments = data?.payments ?? [];
  const advances = data?.advances ?? [];
  const totalRecovered = advances.reduce(
    (s, a) => s + (Number(a.amount_recovered) || 0),
    0,
  );

  const rows = payments.map((p) => [
    formatDate(p.payment_date),
    p.payment_number,
    p.employees?.name ?? "—",
    p.period_label ?? "—",
    Number(p.base_amount ?? 0),
    Number(p.bonus_amount ?? 0),
    Number(p.deduction_amount ?? 0),
    Number(p.advance_deducted ?? 0),
    Number(p.net_amount ?? 0),
    Number(p.amount_paid ?? 0),
    p.payment_method ?? "—",
  ]);
  const headers = [
    "Date",
    "Payment #",
    "Employee",
    "Period",
    "Base",
    "Bonus",
    "Deductions",
    "Advance recovered",
    "Net",
    "Paid",
    "Method",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Summary"
        description="Salary payments and advances for the selected month."
        actions={
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-[170px]"
              aria-label="Payroll month"
            />
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() => downloadCSV(`payroll-${month}`, headers, rows)}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() => downloadXLSX(`payroll-${month}`, "Payroll", headers, rows)}
            >
              <Download className="h-4 w-4" />
              XLSX
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Salaries paid", value: formatMoney(data?.totalPaid ?? 0) },
          { label: "Employees paid", value: String(data?.employeesPaid ?? 0) },
          { label: "Advances given", value: formatMoney(data?.totalAdvances ?? 0) },
          { label: "Advances recovered", value: formatMoney(totalRecovered) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No salary payments recorded for this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Payment #</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 text-right font-medium">Net</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.payment_number}</td>
                    <td className="px-4 py-3">
                      <Link
                        to="/staff/$employeeId"
                        params={{ employeeId: p.employee_id }}
                        className="font-medium text-foreground hover:underline"
                      >
                        {p.employees?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.period_label ?? "—"}</td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(p.net_amount)}</td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(p.amount_paid)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          p.payment_status === "paid"
                            ? "success"
                            : p.payment_status === "partial"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {p.payment_status ?? "pending"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {advances.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Advances this month</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(a.advance_date)}
                    </td>
                    <td className="px-4 py-3 font-medium">{a.employees?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-3 text-right numeric">
                      {formatMoney(outstandingOf(a))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

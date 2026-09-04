import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Award,
  BadgeDollarSign,
  HandCoins,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmployeeFormDialog } from "@/components/EmployeeFormDialog";
import { SalaryPaymentDialog } from "@/components/SalaryPaymentDialog";
import { AdvanceDialog } from "@/components/AdvanceDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/data";
import { printExperienceCertificate, printPayslip } from "@/lib/payroll-docs";
import {
  deleteAdvance,
  deleteSalaryPayment,
  outstandingOf,
  useAdvances,
  useEmployee,
  useSalaryPayments,
  type EmployeeAdvance,
  type SalaryPayment,
} from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/staff/$employeeId")({
  head: () => ({
    meta: [
      { title: "Employee — Fragrance Billing" },
      {
        name: "description",
        content: "Employee profile with salary history, advances and payslips.",
      },
      { property: "og:title", content: "Employee — Fragrance Billing" },
      {
        property: "og:description",
        content: "Employee profile with salary history, advances and payslips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: employee, isLoading } = useEmployee(employeeId);
  const { data: payments = [] } = useSalaryPayments(employeeId);
  const { data: advances = [] } = useAdvances(employeeId);
  const { data: settings } = useSettings();

  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SalaryPayment | null>(null);

  const removePayment = async (payment: SalaryPayment) => {
    if (!confirm(`Delete salary payment ${payment.payment_number ?? ""}?`)) return;
    try {
      await deleteSalaryPayment(payment);
      await queryClient.invalidateQueries();
      toast.success("Salary payment deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the payment");
    }
  };

  const removeAdvance = async (advance: EmployeeAdvance) => {
    if (!confirm("Delete this advance?")) return;
    try {
      await deleteAdvance(advance);
      await queryClient.invalidateQueries();
      toast.success("Advance deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the advance");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (!employee) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">This employee could not be found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/staff">Back to staff</Link>
        </Button>
      </Card>
    );
  }

  const openAdvance = advances.reduce((s, a) => s + outstandingOf(a), 0);
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount_paid ?? 0), 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/staff">
          <ArrowLeft className="h-4 w-4" />
          Staff
        </Link>
      </Button>

      <PageHeader
        title={employee.name}
        description={[employee.role, employee.phone].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => printExperienceCertificate(employee, settings)}
            >
              <Award className="h-4 w-4" />
              Certificate
            </Button>
            <Button variant="outline" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-4 w-4" />
              Give advance
            </Button>
            <Button
              onClick={() => {
                setEditingPayment(null);
                setPayOpen(true);
              }}
            >
              <BadgeDollarSign className="h-4 w-4" />
              Pay salary
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Status", value: employee.is_active ? "Active" : "Inactive" },
          { label: "Base salary", value: formatMoney(employee.base_salary ?? 0) },
          { label: "Total paid", value: formatMoney(paidTotal) },
          { label: "Open advance", value: formatMoney(openAdvance) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="salaries">
        <TabsList>
          <TabsTrigger value="salaries">Salary history</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="salaries" className="mt-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">Payslip</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Paid on</th>
                  <th className="px-4 py-3 text-right font-medium">Net</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No salary payments recorded yet.
                    </td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{p.payment_number ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.period_label}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(p.net_amount)}</td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(p.amount_paid)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          p.payment_status === "Paid"
                            ? "success"
                            : p.payment_status === "Partial"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {p.payment_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Print payslip"
                          onClick={() => printPayslip(p, employee, settings)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit salary payment"
                          onClick={() => {
                            setEditingPayment(p);
                            setPayOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete salary payment"
                          onClick={() => removePayment(p)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="advances" className="mt-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Recovered</th>
                  <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No advances given.
                    </td>
                  </tr>
                )}
                {advances.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">{formatDate(a.advance_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-right numeric">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-3 text-right numeric">
                      {formatMoney(a.amount_recovered)}
                    </td>
                    <td className="px-4 py-3 text-right numeric">
                      {formatMoney(outstandingOf(a))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete advance"
                        onClick={() => removeAdvance(a)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            {[
              ["Role", employee.role ?? "—"],
              ["Phone", employee.phone ?? "—"],
              ["Email", employee.email ?? "—"],
              ["Joined", formatDate(employee.join_date)],
              ["Salary type", employee.salary_type],
              [
                "Commission rate",
                employee.commission_rate ? `${employee.commission_rate}%` : "—",
              ],
              ["Default method", employee.default_payment_method ?? "—"],
              ["End date", employee.end_date ? formatDate(employee.end_date) : "—"],
              ["Notes", employee.notes ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-0.5 text-sm">{value}</p>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={employee} />
      <SalaryPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        employee={employee}
        existing={editingPayment}
      />
      <AdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} employee={employee} />
    </div>
  );
}

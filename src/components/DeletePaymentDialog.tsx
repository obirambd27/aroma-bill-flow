import { useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/format";
import { useDeletePaymentReceived, type PaymentRow } from "@/lib/payments";

export function DeletePaymentDialog({
  payment,
  onOpenChange,
}: {
  payment: PaymentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const { mutateAsync, isPending } = useDeletePaymentReceived();

  const handleDelete = async () => {
    if (!payment) return;
    try {
      await mutateAsync({ paymentId: payment.id, reason: reason.trim() || null });
      toast.success(`Payment of ${formatMoney(payment.amount)} reversed`);
      setReason("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse this payment.");
    }
  };

  return (
    <AlertDialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this payment?</AlertDialogTitle>
          <AlertDialogDescription>
            {payment
              ? `${formatMoney(payment.amount)} received on ${formatDate(payment.payment_date)} via ${payment.payment_method} will be removed. Bill balances, account balances and any uncleared cheque are reversed.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {payment && payment.payment_allocations.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Affected bills
            </p>
            <ul className="space-y-1">
              {payment.payment_allocations.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 text-sm">
                  <span>{a.bills?.bill_number ?? "Unlinked bill"}</span>
                  <span className="numeric font-medium">
                    −{formatMoney(a.amount_allocated)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="reversal-reason">Reason (optional)</Label>
          <Input
            id="reversal-reason"
            className="h-11"
            placeholder="e.g. Entered by mistake"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Reversing…" : "Reverse payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

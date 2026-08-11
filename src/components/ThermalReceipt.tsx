import { WhatsAppQr } from "@/components/WhatsAppQr";
import type { Tables } from "@/integrations/supabase/types";
import type { PaymentLine } from "@/lib/bill-payments";
import { formatDate, formatMoney } from "@/lib/format";

type Bill = Tables<"bills"> & {
  customers: Tables<"customers"> | null;
  bill_items: Tables<"bill_items">[];
};

export function ThermalReceipt({
  bill,
  settings,
  payments = [],
  paid: paidProp,
  balanceDue: balanceProp,
}: {
  bill: Bill;
  settings: Tables<"settings"> | null | undefined;
  payments?: PaymentLine[];
  paid?: number;
  balanceDue?: number;
}) {
  const taxed = bill.is_taxed;
  const total = Number(bill.total_amount);
  const paid = paidProp ?? Number(bill.amount_paid ?? 0);
  const balanceDue = balanceProp ?? Math.max(total - paid, 0);
  const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});
  const dash = "--------------------------------";

  return (
    <article className="thermal-sheet mx-auto w-[302px] bg-card p-4 font-mono text-[11px] leading-snug text-foreground shadow-lg print:shadow-none">
      <div className="text-center">
        <p className="text-[13px] font-bold uppercase tracking-wide">
          {settings?.business_name ?? "—"}
        </p>
        {settings?.business_address && <p className="text-[10px]">{settings.business_address}</p>}
        {settings?.business_phone && <p className="text-[10px]">{settings.business_phone}</p>}
        {settings?.tax_id && <p className="text-[10px]">TRN: {settings.tax_id}</p>}
        <p className="mt-2 text-[11px] font-bold">{taxed ? "TAX INVOICE" : "INVOICE"}</p>
      </div>

      <p className="my-1 overflow-hidden whitespace-nowrap">{dash}</p>

      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Invoice #</span>
          <span className="font-bold">{bill.bill_number ?? "Draft"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Date</span>
          <span>{formatDate(bill.bill_date)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Customer</span>
          <span className="text-right">{bill.customers?.name ?? "Walk-in Customer"}</span>
        </div>
      </div>

      <p className="my-1 overflow-hidden whitespace-nowrap">{dash}</p>

      <div className="space-y-2">
        {bill.bill_items.map((item) => (
          <div key={item.id}>
            <p className="font-bold">{item.product_name_snapshot}</p>
            <div className="flex justify-between gap-2">
              <span>
                {Number(item.quantity)} x {formatMoney(item.unit_price)}
              </span>
              <span className="font-bold">{formatMoney(item.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="my-1 overflow-hidden whitespace-nowrap">{dash}</p>

      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Subtotal</span>
          <span>{formatMoney(bill.subtotal)}</span>
        </div>
        {Number(bill.discount_amount) > 0 && (
          <div className="flex justify-between gap-2">
            <span>Discount</span>
            <span>-{formatMoney(bill.discount_amount)}</span>
          </div>
        )}
        {taxed && (
          <div className="flex justify-between gap-2">
            <span>Tax ({Number(bill.tax_rate)}%)</span>
            <span>{formatMoney(bill.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between gap-2 text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(total)}</span>
        </div>
        {Object.entries(byMethod).map(([method, amount]) => (
          <div key={method} className="flex justify-between gap-2">
            <span>Paid ({method})</span>
            <span>{formatMoney(amount)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <span>Paid</span>
          <span>{formatMoney(paid)}</span>
        </div>
        <div className="flex justify-between gap-2 font-bold">
          <span>Balance Due</span>
          <span>{formatMoney(balanceDue)}</span>
        </div>

      </div>

      <p className="my-1 overflow-hidden whitespace-nowrap">{dash}</p>

      <div className="text-center text-[10px]">
        {settings?.invoice_footer_note && <p>{settings.invoice_footer_note}</p>}
        <div className="mt-2 flex justify-center">
          <WhatsAppQr size={72} caption="Scan to order on WhatsApp" />
        </div>
        <p className="mt-2 text-[9px] leading-tight">
          This is a computer generated bill and does not require a signature.
        </p>
        <p className="mt-1 font-bold">Thank you!</p>
      </div>
    </article>
  );
}

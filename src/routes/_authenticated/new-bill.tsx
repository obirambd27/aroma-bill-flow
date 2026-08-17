import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Search,
  Warehouse as WarehouseIcon,
  AlertTriangle,
  Package,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { BulkAddDialog } from "@/components/BulkAddDialog";
import { RecentSalesPopover } from "@/components/RecentSalesPopover";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useBill,
  useCustomers,
  useProducts,
  useProductStock,
  useSettings,
  useWarehouses,
} from "@/lib/data";
import { applyBillEdit, type BillSnapshot } from "@/lib/bill-edit";
import { useAccounts } from "@/lib/accounting";
import {
  PAYMENT_METHODS,
  accountIdByName,
  accountsForMethod,
  derivePaymentStatus,
  syncCounterPayment,
  postSalePaymentEntry,
  useCustomerLastPrices,
  type PaymentMethod,
} from "@/lib/payments";
import { formatDate, formatMoney } from "@/lib/format";
import { adjustCommitted, useSalesOrder } from "@/lib/sales";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/new-bill")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { customerId?: string; fromOrder?: string; editBill?: string } => ({
    ...(typeof search["customerId"] === "string"
      ? { customerId: search["customerId"] as string }
      : {}),
    ...(typeof search["fromOrder"] === "string"
      ? { fromOrder: search["fromOrder"] as string }
      : {}),
    ...(typeof search["editBill"] === "string"
      ? { editBill: search["editBill"] as string }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Bill — Fragrance Billing" },
      { name: "description", content: "Create a sales bill and deduct stock automatically." },
      { property: "og:title", content: "New Bill — Fragrance Billing" },
      {
        property: "og:description",
        content: "Create a sales bill and deduct stock automatically.",
      },
    ],
  }),
  component: NewBillPage,
});

type Line = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  warehouseId: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function NewBillPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stock = [] } = useProductStock();
  const { data: settings } = useSettings();

  const [customerId, setCustomerId] = useState<string>(search.customerId ?? "walk-in");
  const [billDate, setBillDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [amountPaidInput, setAmountPaidInput] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [accountId, setAccountId] = useState<string>("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);

  const [warehousePickerFor, setWarehousePickerFor] = useState<string | null>(null);

  const { data: accounts = [] } = useAccounts(true);
  const methodAccounts = useMemo(
    () => accountsForMethod(paymentMethod, accounts),
    [paymentMethod, accounts],
  );
  const { data: lastPrices = {} } = useCustomerLastPrices(
    customerId === "walk-in" ? null : customerId,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(customerQuery), 250);
    return () => clearTimeout(t);
  }, [customerQuery]);

  // Cash sales lock to "Cash in Hand"; card/bank sales pick the receiving bank account.
  useEffect(() => {
    if (methodAccounts.length === 0) return;
    if (!methodAccounts.some((a) => a.id === accountId)) setAccountId(methodAccounts[0]!.id);
  }, [accountId, methodAccounts]);

  // Pre-fill from a sales order ("Convert to Bill") with the undelivered/unbilled quantities.
  const { data: sourceOrder } = useSalesOrder(search.fromOrder ?? "");
  const [orderHydrated, setOrderHydrated] = useState(false);
  useEffect(() => {
    if (!sourceOrder || orderHydrated) return;
    setCustomerId(sourceOrder.customer_id ?? "walk-in");
    if (sourceOrder.warehouse_id) setWarehouseId(sourceOrder.warehouse_id);
    setIsTaxed(sourceOrder.is_taxed);
    setTaxRateInput(String(sourceOrder.tax_rate));
    setDiscountType(sourceOrder.discount_type === "percent" ? "percent" : "amount");
    setDiscountValue(String(sourceOrder.discount_value ?? 0));
    setLines(
      sourceOrder.sales_order_items
        .map((i) => ({
          productId: i.product_id ?? "",
          name: i.product_name_snapshot,
          unitPrice: Number(i.unit_price),
          quantity: Number(i.quantity),
          warehouseId: i.warehouse_id ?? sourceOrder.warehouse_id ?? "",
        }))
        .filter((l) => l.productId && l.quantity > 0),
    );
    setOrderHydrated(true);
  }, [sourceOrder, orderHydrated]);


  // Editing an existing bill: hydrate the builder with its current contents.
  const { data: editingBill } = useBill(search.editBill ?? "");
  const isEditing = Boolean(search.editBill && editingBill);
  const [editHydrated, setEditHydrated] = useState(false);
  useEffect(() => {
    if (!editingBill || editHydrated) return;
    setCustomerId(editingBill.customer_id ?? "walk-in");
    setBillDate(editingBill.bill_date);
    if (editingBill.warehouse_id) setWarehouseId(editingBill.warehouse_id);
    setIsTaxed(editingBill.is_taxed);
    setTaxRateInput(String(editingBill.tax_rate));
    setDiscountType(editingBill.discount_type === "percent" ? "percent" : "amount");
    setDiscountValue(String(editingBill.discount_value ?? 0));
    setAmountPaidInput(String(editingBill.amount_paid ?? 0));
    if (
      editingBill.payment_method &&
      (PAYMENT_METHODS as readonly string[]).includes(editingBill.payment_method)
    ) {
      setPaymentMethod(editingBill.payment_method as PaymentMethod);
    }
    setLines(
      editingBill.bill_items
        .map((i) => ({
          productId: i.product_id ?? "",
          name: i.product_name_snapshot,
          unitPrice: Number(i.unit_price),
          quantity: Number(i.quantity),
          warehouseId: i.warehouse_id ?? editingBill.warehouse_id ?? "",
        }))
        .filter((l) => l.productId),
    );
    setEditHydrated(true);
  }, [editingBill, editHydrated]);

  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";
  const taxRate = Number(taxRateInput ?? settings?.default_tax_rate ?? 0);

  const stockFor = (productId: string, wId: string) => {
    const row = stock.find((s) => s.product_id === productId && s.warehouse_id === wId);
    // While editing a finalized bill the original quantities are reversed first,
    // so they count as available again.
    const credited =
      editingBill && editingBill.status === "Finalized"
        ? editingBill.bill_items
            .filter((i) => i.product_id === productId && i.warehouse_id === wId)
            .reduce((sum, i) => sum + Number(i.quantity), 0)
        : 0;
    const onHand = Number(row?.stock_on_hand ?? 0) + credited;
    const committed = Number(row?.committed_stock ?? 0);
    return { onHand, committed, available: Math.max(onHand - committed, 0) };
  };

  const results = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [products, productSearch]);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountAmount = Math.min(
    Math.max(
      discountType === "percent"
        ? (subtotal * (Number(discountValue) || 0)) / 100
        : Number(discountValue) || 0,
      0,
    ),
    subtotal,
  );
  const taxable = subtotal - discountAmount;
  const taxAmount = isTaxed ? (taxable * taxRate) / 100 : 0;
  const total = taxable + taxAmount;
  const amountPaidNow = Math.min(Math.max(Number(amountPaidInput) || 0, 0), total);
  const balanceDue = Math.max(total - amountPaidNow, 0);
  const derivedStatus = derivePaymentStatus(amountPaidNow, total);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const selectedCustomerLabel = selectedCustomer
    ? `${selectedCustomer.name}${selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}`
    : "Walk-in customer";
  const customerResults = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 20);
  }, [customers, debouncedQuery]);

  const overselling = lines.filter(
    (l) => l.quantity > stockFor(l.productId, l.warehouseId).available,
  );

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        const cap = stockFor(productId, existing.warehouseId).available;
        return prev.map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.min(l.quantity + 1, Math.max(cap, 1)) }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitPrice: Number(p.price),
          quantity: 1,
          warehouseId: activeWarehouseId,
        },
      ];
    });
    setProductSearch("");
  };

  /** Add several products at once from the bulk entry modal. */
  const addMany = (items: { productId: string; quantity: number }[]) => {
    setLines((prev) => {
      let next = [...prev];
      for (const item of items) {
        const p = products.find((x) => x.id === item.productId);
        if (!p) continue;
        const existing = next.find((l) => l.productId === item.productId);
        if (existing) {
          const cap = stockFor(item.productId, existing.warehouseId).available;
          next = next.map((l) =>
            l.productId === item.productId
              ? { ...l, quantity: Math.min(l.quantity + item.quantity, Math.max(cap, 1)) }
              : l,
          );
        } else {
          const cap = stockFor(p.id, activeWarehouseId).available;
          next.push({
            productId: p.id,
            name: p.name,
            unitPrice: Number(p.price),
            quantity: Math.max(1, Math.min(item.quantity, Math.max(cap, 1))),
            warehouseId: activeWarehouseId,
          });
        }
      }
      return next;
    });
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));


  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const save = async (status: "Draft" | "Finalized") => {
    if (lines.length === 0) {
      toast.error("Add at least one product to the bill");
      return;
    }
    if (status === "Finalized" && overselling.length > 0) {
      toast.error(`Not enough stock for ${overselling[0]!.name}`);
      return;
    }
    if (status === "Finalized" && amountPaidNow > 0 && !accountId) {
      toast.error("Select the account this payment lands in");
      return;
    }

    setSaving(true);

    if (isEditing && editingBill) {
      try {
        const customerName =
          customerId === "walk-in"
            ? "Walk-in customer"
            : (customers.find((x) => x.id === customerId)?.name ?? "Customer");
        const snapshot = (
          l: { name: string; quantity: number; unitPrice: number; warehouseId: string | null }[],
          fields: Omit<BillSnapshot, "lines">,
        ): BillSnapshot => ({ ...fields, lines: l });

        const before = snapshot(
          editingBill.bill_items.map((i) => ({
            name: i.product_name_snapshot,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            warehouseId: i.warehouse_id,
          })),
          {
            customerName: editingBill.customers?.name ?? "Walk-in customer",
            warehouseId: editingBill.warehouse_id,
            isTaxed: editingBill.is_taxed,
            taxRate: Number(editingBill.tax_rate),
            subtotal: Number(editingBill.subtotal),
            discountAmount: Number(editingBill.discount_amount),
            taxAmount: Number(editingBill.tax_amount),
            total: Number(editingBill.total_amount),
          },
        );
        const after = snapshot(
          lines.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            warehouseId: l.warehouseId || null,
          })),
          {
            customerName,
            warehouseId: activeWarehouseId || null,
            isTaxed,
            taxRate: isTaxed ? taxRate : 0,
            subtotal,
            discountAmount,
            taxAmount,
            total,
          },
        );

        // Use the amount entered on the form so partial payments update the balance.
        const keptPaid =
          status === "Finalized" ? Math.min(Math.max(amountPaidNow, 0), total) : 0;

        await applyBillEdit({
          billId: editingBill.id,
          billNumber: editingBill.bill_number,
          originalStatus: editingBill.status,
          originalItems: editingBill.bill_items.map((i) => ({
            product_id: i.product_id,
            warehouse_id: i.warehouse_id,
            quantity: Number(i.quantity),
            product_name_snapshot: i.product_name_snapshot,
          })),
          lines: lines.map((l) => ({
            ...l,
            costPrice: products.find((p) => p.id === l.productId)?.cost_price ?? null,
          })),
          billFields: {
            customer_id: customerId === "walk-in" ? null : customerId,
            is_walk_in: customerId === "walk-in",
            bill_date: billDate,
            warehouse_id: activeWarehouseId || null,
            is_taxed: isTaxed,
            tax_rate: isTaxed ? taxRate : 0,
            subtotal,
            tax_amount: taxAmount,
            discount_amount: discountAmount,
            discount_type: discountType,
            discount_value: Number(discountValue) || 0,
            total_amount: total,
            amount_paid: keptPaid,
            payment_method: keptPaid > 0 ? paymentMethod : null,
            status,
          },
          billDate,
          customerName,
          amountPaid: keptPaid,
          paymentAccountId: accountId || null,
          before,
          after,
        });

        await syncCounterPayment({
          billId: editingBill.id,
          customerId: customerId === "walk-in" ? null : customerId,
          paymentDate: billDate,
          amount: keptPaid,
          method: paymentMethod,
          accountId: accountId || null,
          referenceNumber: editingBill.bill_number ?? null,
        });



        setSaving(false);
        queryClient.invalidateQueries();
        toast.success("Bill updated");
        navigate({ to: "/bills/$billId", params: { billId: editingBill.id } });
      } catch (err) {
        setSaving(false);
        toast.error(err instanceof Error ? err.message : "Could not update the bill");
      }
      return;
    }

    const isWalkIn = customerId === "walk-in";
    const paidNow = status === "Finalized" ? amountPaidNow : 0;
    const { data: bill, error } = await supabase
      .from("bills")
      .insert({
        customer_id: isWalkIn ? null : customerId,
        is_walk_in: isWalkIn,
        sales_order_id: sourceOrder?.id ?? null,
        bill_date: billDate,
        warehouse_id: activeWarehouseId || null,
        is_taxed: isTaxed,
        tax_rate: isTaxed ? taxRate : 0,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_type: discountType,
        discount_value: Number(discountValue) || 0,
        total_amount: total,
        amount_paid: paidNow,
        payment_status: derivePaymentStatus(paidNow, total),
        payment_method: paidNow > 0 ? paymentMethod : null,
        status,
      })
      .select()
      .single();

    if (error || !bill) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the bill");
      return;
    }

    const { error: itemsError } = await supabase.from("bill_items").insert(
      lines.map((l) => ({
        bill_id: bill.id,
        product_id: l.productId,
        product_name_snapshot: l.name,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        cost_price_snapshot: products.find((p) => p.id === l.productId)?.cost_price ?? null,
        line_total: l.unitPrice * l.quantity,
        warehouse_id: l.warehouseId || null,
      })),
    );

    if (itemsError) {
      setSaving(false);
      toast.error(itemsError.message);
      return;
    }

    if (status === "Draft") {
      setSaving(false);
      queryClient.invalidateQueries();
      toast.success("Draft saved");
      navigate({ to: "/bills/$billId", params: { billId: bill.id } });
      return;
    }

    // Converting a sales order: release its reservation and close it out.
    if (sourceOrder) {
      for (const item of sourceOrder.sales_order_items) {
        const wId = item.warehouse_id ?? sourceOrder.warehouse_id;
        if (item.product_id && wId) {
          await adjustCommitted(item.product_id, wId, -Number(item.quantity));
        }
      }
      await supabase
        .from("sales_orders")
        .update({ status: "Converted to Bill" })
        .eq("id", sourceOrder.id);
    }


    // Deduct stock per warehouse and log a stock movement for each line.
    for (const l of lines) {
      const row = stock.find(
        (s) => s.product_id === l.productId && s.warehouse_id === l.warehouseId,
      );
      if (row) {
        await supabase
          .from("product_stock")
          .update({ stock_on_hand: Number(row.stock_on_hand) - l.quantity })
          .eq("id", row.id);
      }
      if (l.warehouseId) {
        await supabase.from("stock_movements").insert({
          product_id: l.productId,
          warehouse_id: l.warehouseId,
          movement_type: "Sale",
          quantity_change: -l.quantity,
          related_bill_id: bill.id,
        });
      }
    }

    const customerName = isWalkIn
      ? "Walk-in customer"
      : (customers.find((x) => x.id === customerId)?.name ?? "Customer");

    // Payment taken at the counter.
    if (paidNow > 0 && accountId) {
      await postSalePaymentEntry({
        billId: bill.id,
        accountId,
        entryDate: billDate,
        amount: paidNow,
        description: `Payment for ${bill.bill_number ?? "bill"} · ${customerName}`,
      });
    }

    // Mirror counter payments into Payments Received so they show up there too.
    if (paidNow > 0) {
      await syncCounterPayment({
        billId: bill.id,
        customerId: isWalkIn ? null : customerId,
        paymentDate: billDate,
        amount: paidNow,
        method: paymentMethod,
        accountId: accountId || null,
        referenceNumber: bill.bill_number ?? null,
      });
    }

    // Revenue is booked in full regardless of payment status.
    const revenueId = await accountIdByName("Sales Revenue");
    if (revenueId) {
      await supabase.from("ledger_entries").insert({
        account_id: revenueId,
        entry_date: billDate,
        entry_type: "Sale",
        amount: total,
        related_bill_id: bill.id,
        description: `${bill.bill_number ?? "Bill"} · ${customerName}`,
      });
    }

    // Anything still owed sits in Accounts Receivable.
    const outstanding = total - paidNow;
    if (outstanding > 0.001) {
      const arId = await accountIdByName("Accounts Receivable");
      if (arId) {
        await supabase.from("ledger_entries").insert({
          account_id: arId,
          entry_date: billDate,
          entry_type: "Sale",
          amount: outstanding,
          related_bill_id: bill.id,
          description: `Outstanding on ${bill.bill_number ?? "bill"} · ${customerName}`,
        });
      }
    }

    if (!isWalkIn) {
      const c = customers.find((x) => x.id === customerId);
      if (c) {
        await supabase
          .from("customers")
          .update({
            total_spend: Number(c.total_spend) + total,
            last_purchase_at: new Date().toISOString(),
          })
          .eq("id", c.id);
      }
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(`Bill ${bill.bill_number} finalized`);
    navigate({ to: "/bills/$billId", params: { billId: bill.id } });
  };

  const pickerLine = lines.find((l) => l.productId === warehousePickerFor) ?? null;

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title={isEditing ? `Edit ${editingBill?.bill_number ?? "Bill"}` : "New Bill"}
        description={
          isEditing
            ? "Changes are logged and stock and ledger entries are adjusted automatically."
            : "Add products, confirm totals, finalize."
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="customer">Customer</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setCustomerDialog(true)}
                >
                  + New Customer
                </button>
              </div>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="customer"
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-between font-normal"
                  >
                    <span className="truncate">{selectedCustomerLabel}</span>
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                  <div className="border-b border-border p-2">
                    <Input
                      autoFocus
                      className="h-10"
                      placeholder="Search name or phone"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                  </div>
                  <ul className="max-h-64 overflow-y-auto py-1">
                    <li>
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                        onClick={() => {
                          setCustomerId("walk-in");
                          setCustomerOpen(false);
                        }}
                      >
                        Walk-in customer
                      </button>
                    </li>
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerOpen(false);
                          }}
                        >
                          {c.name}
                          {c.phone ? (
                            <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                    {customerResults.length === 0 && debouncedQuery.trim() !== "" && (
                      <li className="px-3 py-3 text-sm text-muted-foreground">
                        No customers match “{debouncedQuery}”.
                      </li>
                    )}
                  </ul>
                  <div className="border-t border-border p-2">
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                      onClick={() => {
                        setCustomerOpen(false);
                        setCustomerDialog(true);
                      }}
                    >
                      + New Customer
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-date">Bill date</Label>
              <Input
                id="bill-date"
                type="date"
                className="h-11"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="warehouse">Warehouse</Label>
              <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="warehouse" className="h-11">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="product-search">Add products</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  onClick={() => setBulkDialog(true)}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Add Items in Bulk
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setProductDialog(true)}
                >
                  + New Product
                </button>
              </div>
            </div>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                className="h-11 pl-9"
                placeholder="Search product name, SKU or brand"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => addLine(p.id)}
                      >
                        <span className="min-w-0 truncate">
                          {p.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {stockFor(p.id, activeWarehouseId).available} available
                          </span>
                        </span>
                        <span className="numeric shrink-0 font-semibold">
                          {formatMoney(p.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {lines.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No items yet. Search above to add products.
                </p>
              ) : (
                lines.map((l) => {
                  const product = products.find((p) => p.id === l.productId);
                  const { onHand, available } = stockFor(l.productId, l.warehouseId);
                  const wName =
                    warehouses.find((w) => w.id === l.warehouseId)?.name ?? "No warehouse";
                  const over = l.quantity > available;
                  const lastSold = lastPrices[l.productId];
                  return (
                    <div
                      key={l.productId}
                      className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        {product?.image_url ? (
                          <img
                            src={product.image_url}
                            alt={l.name}
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{l.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {product?.sku ?? "No SKU"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Stock on Hand: <span className="numeric">{onHand}</span>{" "}
                            {product?.unit ?? "pcs"} ·{" "}
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                              onClick={() => setWarehousePickerFor(l.productId)}
                            >
                              <WarehouseIcon className="h-3.5 w-3.5" />
                              {wName}
                            </button>
                          </p>
                          {lastSold && selectedCustomer && (
                            <p className="mt-1 text-xs text-primary">
                              Last sold to {selectedCustomer.name}: {formatMoney(lastSold.price)} on{" "}
                              {formatDate(lastSold.date)}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${l.name}`}
                          onClick={() => removeLine(l.productId)}
                        >
                          <Trash2 className="text-muted-foreground" />
                        </Button>
                      </div>

                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_88px_auto] items-start gap-2">
                        <div className="space-y-1">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            aria-label={`Unit price for ${l.name}`}
                            className="numeric h-10"
                            value={String(l.unitPrice)}
                            onChange={(e) =>
                              patchLine(l.productId, { unitPrice: Number(e.target.value) || 0 })
                            }
                          />
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs text-muted-foreground/70">
                              Cost Price: {formatMoney(product?.cost_price ?? 0)}
                            </span>
                            {isTaxed && (
                              <span className="text-xs text-muted-foreground/70">
                                Tax: {taxRate}%
                              </span>
                            )}
                            <RecentSalesPopover productId={l.productId} />
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(available, 1)}
                          aria-label={`Quantity for ${l.name}`}
                          className={cn("numeric h-10 text-center", over && "border-destructive")}
                          value={String(l.quantity)}
                          onChange={(e) =>
                            patchLine(l.productId, {
                              quantity: Math.max(
                                1,
                                Math.min(Number(e.target.value) || 1, Math.max(available, 1)),
                              ),
                            })
                          }
                        />
                        <p className="numeric w-24 pt-2 text-right text-sm font-semibold">
                          {formatMoney(l.unitPrice * l.quantity)}
                        </p>
                      </div>
                      {over && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Only {available} available in {wName}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="surface-card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Apply tax</p>
                <p className="text-xs text-muted-foreground">
                  Default rate {Number(settings?.default_tax_rate ?? 0)}%
                </p>
              </div>
              <Switch checked={isTaxed} onCheckedChange={setIsTaxed} />
            </div>

            {isTaxed && (
              <div className="space-y-2">
                <Label htmlFor="tax-rate">Tax rate (%)</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  className="numeric h-11"
                  value={taxRateInput ?? String(Number(settings?.default_tax_rate ?? 0))}
                  onChange={(e) => setTaxRateInput(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="discount">Discount</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {(["amount", "percent"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        discountType === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => setDiscountType(t)}
                    >
                      {t === "amount" ? "AED" : "%"}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                id="discount"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="amount-paid">Amount paid now</Label>
                <span className="text-xs font-medium text-muted-foreground">{derivedStatus}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  id="amount-paid"
                  type="number"
                  min={0}
                  step="0.01"
                  className="numeric h-11"
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={() => setAmountPaidInput(String(total.toFixed(2)))}
                >
                  Full
                </Button>
              </div>
            </div>

            {amountPaidNow > 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Payment method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  >
                    <SelectTrigger id="payment-method" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deposit-account">Deposit into</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="deposit-account" className="h-11">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {methodAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="surface-card p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="numeric font-medium">{formatMoney(subtotal)}</dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="numeric font-medium">−{formatMoney(discountAmount)}</dd>
                </div>
              )}
              {isTaxed && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax ({taxRate}%)</dt>
                  <dd className="numeric font-medium">{formatMoney(taxAmount)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Grand total
              </p>
              <p className="numeric mt-1 text-3xl font-bold">{formatMoney(total)}</p>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Amount paid now</dt>
                <dd className="numeric font-medium">{formatMoney(amountPaidNow)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Balance due</dt>
                <dd className="numeric font-semibold">{formatMoney(balanceDue)}</dd>
              </div>
            </dl>
            <div className="mt-5 hidden space-y-2 lg:block">
              <Button className="h-11 w-full" disabled={saving} onClick={() => save("Finalized")}>
                {saving
                  ? isEditing
                    ? "Saving…"
                    : "Finalizing…"
                  : isEditing
                    ? "Save Changes"
                    : "Finalize Bill"}
              </Button>
              {(!isEditing || editingBill?.status === "Draft") && (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={saving}
                  onClick={() => save("Draft")}
                >
                  Save as Draft
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Finalizing deducts stock from the selected warehouse and records a stock movement for
              every line.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grand total
          </span>
          <span className="numeric text-xl font-bold">{formatMoney(total)}</span>
        </div>
        <div className="flex gap-2">
          {(!isEditing || editingBill?.status === "Draft") && (
            <Button
              variant="outline"
              className="h-12 flex-1"
              disabled={saving}
              onClick={() => save("Draft")}
            >
              Draft
            </Button>
          )}
          <Button className="h-12 flex-[2]" disabled={saving} onClick={() => save("Finalized")}>
            <Plus />
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Review & Finalize"}
          </Button>
        </div>
      </div>

      <CustomerFormDialog
        open={customerDialog}
        onOpenChange={setCustomerDialog}
        onSaved={(c) => setCustomerId(c.id)}
      />
      <ProductFormDialog
        open={productDialog}
        onOpenChange={setProductDialog}
        warehouses={warehouses}
        defaultWarehouseId={activeWarehouseId}
        onSaved={(p) => addLine(p.id)}
      />
      <BulkAddDialog
        open={bulkDialog}
        onOpenChange={setBulkDialog}
        products={products}
        onAdd={addMany}
      />



      <Dialog open={Boolean(pickerLine)} onOpenChange={(o) => !o && setWarehousePickerFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select warehouse</DialogTitle>
            <DialogDescription>
              {pickerLine ? `Source warehouse for ${pickerLine.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {pickerLine && (
            <RadioGroup
              value={pickerLine.warehouseId}
              onValueChange={(v) => {
                const cap = stockFor(pickerLine.productId, v).available;
                patchLine(pickerLine.productId, {
                  warehouseId: v,
                  quantity: Math.max(1, Math.min(pickerLine.quantity, Math.max(cap, 1))),
                });
                setWarehousePickerFor(null);
              }}
              className="gap-0 overflow-x-auto"
            >
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-border text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left">Warehouse</th>
                    <th className="py-2">On hand</th>
                    <th className="py-2">Committed</th>
                    <th className="py-2">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => {
                    const s = stockFor(pickerLine.productId, w.id);
                    return (
                      <tr key={w.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3">
                          <label className="flex items-center gap-3 text-sm">
                            <RadioGroupItem value={w.id} id={`wh-${w.id}`} />
                            <span className="min-w-0 truncate">{w.name}</span>
                          </label>
                        </td>
                        <td className="numeric py-3 text-right text-sm">{s.onHand}</td>
                        <td className="numeric py-3 text-right text-sm text-muted-foreground">
                          {s.committed}
                        </td>
                        <td className="numeric py-3 text-right text-sm font-semibold">
                          {s.available}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </RadioGroup>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

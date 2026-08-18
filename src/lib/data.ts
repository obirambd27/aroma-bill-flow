import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildPaymentBreakdown, type AllocationInput } from "@/lib/bill-payments";
import { fetchAll } from "@/lib/fetch-all";

export type Settings = Tables<"settings">;
export type Product = Tables<"products">;
export type Customer = Tables<"customers">;
export type Bill = Tables<"bills">;
export type BillItem = Tables<"bill_items">;
export type Warehouse = Tables<"warehouses">;
export type ProductStock = Tables<"product_stock">;
export type Payment = Tables<"payments">;
export type StockMovement = Tables<"stock_movements">;
export type StockTransfer = Tables<"stock_transfers">;

/** Total stock per product, summed across every warehouse. */
export function useStockTotals() {
  return useQuery({
    queryKey: ["stock-totals"],
    queryFn: async () => {
      const data = await fetchAll<{ product_id: string; stock_on_hand: number; committed_stock: number }>(
        (f, t) =>
          supabase.from("product_stock").select("product_id, stock_on_hand, committed_stock").range(f, t),
      );
      const totals: Record<string, number> = {};
      for (const row of data ?? []) {
        totals[row.product_id] = (totals[row.product_id] ?? 0) + Number(row.stock_on_hand);
      }
      return totals;
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const data = await fetchAll<Product>((f, t) =>
        supabase.from("products").select("*").eq("is_active", true).order("name").range(f, t),
      );
      return data;
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const data = await fetchAll<Customer>((f, t) =>
        supabase.from("customers").select("*").order("name").range(f, t),
      );
      return data;
    },
  });
}

export function useBills() {
  return useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const data = await fetchAll<Bill & { customers: { name: string } | null }>((f, t) =>
        supabase
          .from("bills")
          .select("*, customers(name)")
          .order("created_at", { ascending: false })
          .range(f, t) as never,
      );
      return data;
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Warehouse[];
    },
  });
}

/** All per-warehouse stock rows, keyed lookup done in the component. */
export function useProductStock() {
  return useQuery({
    queryKey: ["product_stock"],
    queryFn: async () => {
      const data = await fetchAll<ProductStock>((f, t) =>
        supabase.from("product_stock").select("*").range(f, t),
      );
      return data;
    },
  });
}

export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
  });
}

/** Bills for one customer — this app's own bills only, never Zoho invoices. */
export function useCustomerBills(customerId: string) {
  return useQuery({
    queryKey: ["customer-bills", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, warehouses(name)")
        .eq("customer_id", customerId)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as (Bill & { warehouses: { name: string } | null })[];
    },
  });
}

export function useCustomerPayments(customerId: string) {
  return useQuery({
    queryKey: ["customer-payments", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, bills(bill_number)")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as (Payment & { bills: { bill_number: string | null } | null })[];
    },
  });
}

export function useBill(billId: string) {
  return useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, customers(*), warehouses(name), bill_items(*)")
        .eq("id", billId)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (Bill & {
            customers: Customer | null;
            warehouses: { name: string } | null;
            bill_items: BillItem[];
          })
        | null;
    },
    enabled: Boolean(billId),
  });
}

/* ---------- Warehouse management ---------- */

export function useAllWarehouses() {
  return useQuery({
    queryKey: ["warehouses-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as Warehouse[];
    },
  });
}

export function useWarehouse(warehouseId: string) {
  return useQuery({
    queryKey: ["warehouse", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("id", warehouseId)
        .maybeSingle();
      if (error) throw error;
      return data as Warehouse | null;
    },
  });
}

/** All products including inactive ones — used by management screens. */
export function useAllProducts() {
  return useQuery({
    queryKey: ["products-all"],
    queryFn: async () => {
      const data = await fetchAll<Product>((f, t) =>
        supabase.from("products").select("*").order("name").range(f, t),
      );
      return data;
    },
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return data as Product | null;
    },
  });
}

/** Stock rows for one warehouse, joined with the product record. */
export function useWarehouseStock(warehouseId: string) {
  return useQuery({
    queryKey: ["warehouse-stock", warehouseId],
    queryFn: async () => {
      const data = await fetchAll<ProductStock & { products: Product | null }>((f, t) =>
        supabase
          .from("product_stock")
          .select("*, products(*)")
          .eq("warehouse_id", warehouseId)
          .range(f, t) as never,
      );
      return data;
    },
  });
}

/** Stock rows for one product across every warehouse. */
export function useProductStockRows(productId: string) {
  return useQuery({
    queryKey: ["product-stock-rows", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("*, warehouses(name)")
        .eq("product_id", productId);
      if (error) throw error;
      return data as (ProductStock & { warehouses: { name: string } | null })[];
    },
  });
}

export type MovementRow = StockMovement & {
  products: { name: string; sku: string | null } | null;
  warehouses: { name: string } | null;
  bills: { bill_number: string | null } | null;
};

export function useStockMovements(filter: { warehouseId?: string; productId?: string }) {
  return useQuery({
    queryKey: ["stock-movements", filter.warehouseId ?? null, filter.productId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("*, products(name, sku), warehouses(name), bills:related_bill_id(bill_number)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
      if (filter.productId) q = q.eq("product_id", filter.productId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as MovementRow[];
    },
  });
}

export type ProductSaleRow = BillItem & {
  bills:
    | (Pick<Bill, "id" | "bill_number" | "bill_date" | "payment_status" | "status"> & {
        customers: { name: string } | null;
      })
    | null;
  warehouses: { name: string } | null;
};

export function useProductSales(productId: string) {
  return useQuery({
    queryKey: ["product-sales", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_items")
        .select(
          "*, warehouses(name), bills(id, bill_number, bill_date, payment_status, status, customers(name))",
        )
        .eq("product_id", productId);
      if (error) throw error;
      const rows = data as unknown as ProductSaleRow[];
      return rows.sort((a, b) =>
        (b.bills?.bill_date ?? "").localeCompare(a.bills?.bill_date ?? ""),
      );
    },
  });
}

/* ---------- Bill history (rich rows for the Bill History page) ---------- */

export type BillHistoryRow = Bill & {
  customers: { id: string; name: string } | null;
  bill_items: { warehouse_id: string | null; pending_quantity?: number | string | null }[];
  warehouseNames: string[];
  returns: { id: string; return_number: string | null; total_amount: number; status: string }[];
  returnedAmount: number;
  creditNotes: { id: string; credit_note_number: string | null; amount_applied: number }[];
  salesOrder: { id: string; order_number: string | null } | null;
  deliveryNotes: { id: string; delivery_number: string | null; status: string }[];
  balanceDue: number;
  /** True when at least one line item still has stock awaiting physical pickup. */
  hasPendingPickup: boolean;
  /** Money actually received on this bill, split by payment method. */
  paidByMethod: Record<string, number>;
  methods: string[];
};


export function useBillHistory() {
  return useQuery({
    queryKey: ["bill-history"],
    queryFn: async () => {
      const [billsRes, whRes, returnsRes, creditRes, dnRes, allocRes] = await Promise.all([
        fetchAll<Record<string, unknown>>((f, t) =>
          supabase
            .from("bills")
            .select(
              "*, customers(id, name), bill_items(warehouse_id, pending_quantity), sales_orders(id, order_number)",
            )

            .order("bill_date", { ascending: false })
            .order("created_at", { ascending: false })
            .range(f, t) as never,
        ).then((data) => ({ data, error: null })),
        supabase.from("warehouses").select("id, name"),
        supabase
          .from("sales_returns")
          .select("id, return_number, bill_id, total_amount, status"),
        supabase
          .from("credit_note_applications")
          .select("bill_id, amount_applied, credit_notes(id, credit_note_number)"),
        supabase
          .from("delivery_notes")
          .select("id, delivery_number, status, sales_order_id"),
        fetchAll<Record<string, unknown>>((f, t) =>
          supabase
            .from("payment_allocations")
            .select(
              "bill_id, amount_allocated, payments_received(payment_date, payment_method, reference_number)",
            )
            .range(f, t) as never,
        ).then((data) => ({ data, error: null })),
      ]);
      if (billsRes.error) throw billsRes.error;
      if (whRes.error) throw whRes.error;
      if (returnsRes.error) throw returnsRes.error;
      if (creditRes.error) throw creditRes.error;
      if (dnRes.error) throw dnRes.error;
      if (allocRes.error) throw allocRes.error;

      const whName: Record<string, string> = {};
      for (const w of whRes.data ?? []) whName[w.id] = w.name;

      const allocByBill: Record<string, AllocationInput[]> = {};
      for (const a of (allocRes.data ?? []) as unknown as {
        bill_id: string;
        amount_allocated: number;
        payments_received: {
          payment_date: string;
          payment_method: string | null;
          reference_number: string | null;
        } | null;
      }[]) {
        (allocByBill[a.bill_id] ??= []).push({
          amount: Number(a.amount_allocated),
          method: a.payments_received?.payment_method ?? null,
          date: a.payments_received?.payment_date ?? null,
          reference: a.payments_received?.reference_number ?? null,
        });
      }



      const rows = (billsRes.data ?? []) as unknown as (Bill & {
        customers: { id: string; name: string } | null;
        bill_items: { warehouse_id: string | null }[];
        sales_orders: { id: string; order_number: string | null } | null;
        sales_order_id: string | null;
      })[];

      return rows.map((b) => {
        const ids = new Set<string>();
        for (const it of b.bill_items ?? []) {
          const id = it.warehouse_id ?? b.warehouse_id;
          if (id) ids.add(id);
        }
        if (ids.size === 0 && b.warehouse_id) ids.add(b.warehouse_id);
        const returns = (returnsRes.data ?? [])
          .filter((r) => r.bill_id === b.id && r.status !== "Cancelled")
          .map((r) => ({
            id: r.id,
            return_number: r.return_number,
            total_amount: Number(r.total_amount),
            status: r.status,
          }));
        const creditNotes = ((creditRes.data ?? []) as unknown as {
          bill_id: string;
          amount_applied: number;
          credit_notes: { id: string; credit_note_number: string | null } | null;
        }[])
          .filter((c) => c.bill_id === b.id && c.credit_notes)
          .map((c) => ({
            id: c.credit_notes!.id,
            credit_note_number: c.credit_notes!.credit_note_number,
            amount_applied: Number(c.amount_applied),
          }));
        const deliveryNotes = b.sales_order_id
          ? (dnRes.data ?? [])
              .filter((d) => d.sales_order_id === b.sales_order_id)
              .map((d) => ({ id: d.id, delivery_number: d.delivery_number, status: d.status }))
          : [];
        const breakdown = buildPaymentBreakdown(b, allocByBill[b.id] ?? []);
        return {
          ...b,
          paidByMethod: breakdown.byMethod,
          methods: breakdown.methods,
          warehouseNames: [...ids].map((id) => whName[id] ?? "Unknown").sort(),
          returns,
          returnedAmount: returns.reduce((s, r) => s + r.total_amount, 0),
          creditNotes,
          salesOrder: b.sales_orders ?? null,
          deliveryNotes,
          balanceDue: breakdown.balanceDue,
          hasPendingPickup: (b.bill_items ?? []).some(
            (it) => Number((it as { pending_quantity?: number | null }).pending_quantity ?? 0) > 0,
          ),
        } as BillHistoryRow;

      });
    },
  });
}

/**
 * Live per-customer money figures derived from finalized bills:
 * `paid` = lifetime spend (money actually collected), `outstanding` = balance due.
 */
export function useCustomerTotals() {
  return useQuery({
    queryKey: ["customer-totals"],
    queryFn: async () => {
      const rows = await fetchAll<{
        customer_id: string | null;
        total_amount: number | string;
        amount_paid: number | string | null;
        status: string;
      }>((f, t) =>
        supabase
          .from("bills")
          .select("customer_id, total_amount, amount_paid, status")
          .eq("status", "Finalized")
          .range(f, t) as never,
      );
      const map: Record<string, { paid: number; outstanding: number }> = {};
      for (const b of rows) {
        if (!b.customer_id) continue;
        const entry = (map[b.customer_id] ??= { paid: 0, outstanding: 0 });
        const paid = Number(b.amount_paid ?? 0);
        const due = Number(b.total_amount ?? 0) - paid;
        entry.paid += paid;
        if (due > 0.001) entry.outstanding += due;
      }
      return map;
    },
  });
}

/** Outstanding (unpaid) balance per customer id, across finalized bills. */
export function useCustomerOutstanding() {
  const totals = useCustomerTotals();
  const data = totals.data
    ? (Object.fromEntries(
        Object.entries(totals.data).map(([id, v]) => [id, v.outstanding]),
      ) as Record<string, number>)
    : undefined;
  return { data, isLoading: totals.isLoading };
}


/** Bill line items still awaiting physical pickup by the customer. */
export function usePendingPickups() {
  return useQuery({
    queryKey: ["pending-pickups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_items")
        .select(
          "id, product_name_snapshot, pending_quantity, item_note, bills(id, bill_number, bill_date, status, customers(name))",
        )
        .gt("pending_quantity", 0);
      if (error) throw error;
      return ((data ?? []) as unknown as {
        id: string;
        product_name_snapshot: string;
        pending_quantity: number | string;
        item_note: string | null;
        bills: {
          id: string;
          bill_number: string | null;
          bill_date: string;
          status: string;
          customers: { name: string } | null;
        } | null;
      }[])
        .filter((r) => r.bills && r.bills.status !== "Voided")
        .sort((a, b) => (b.bills?.bill_date ?? "").localeCompare(a.bills?.bill_date ?? ""));
    },
  });
}

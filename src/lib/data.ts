import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
      const { data, error } = await supabase
        .from("product_stock")
        .select("product_id, stock_on_hand, committed_stock");
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useBills() {
  return useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Bill & { customers: { name: string } | null })[];
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
      const { data, error } = await supabase.from("product_stock").select("*");
      if (error) throw error;
      return data as ProductStock[];
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
  });
}

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicOrderProduct = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  stock: number;
};

export type PublicBusiness = {
  name: string;
  tagline: string | null;
  logo: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  whatsapp: string | null;
  googleReview: string | null;
};

export type PublicOrderData =
  | { available: false }
  | {
      available: true;
      list: {
        id: string;
        name: string;
        minQuantity: number | null;
        increasePercent: number;
      };
      business: PublicBusiness;
      products: PublicOrderProduct[];
    };

/** Public catalog for a shared price list. Never returns cost price or client name. */
export async function loadPublicPriceList(token: string): Promise<PublicOrderData> {
  const { data: list, error } = await supabaseAdmin
    .from("price_lists")
    .select("id, name, default_min_quantity, below_min_increase_percent, is_share_enabled")
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!list || !list.is_share_enabled) return { available: false };

  const [itemsRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from("price_list_items")
      .select("product_id, custom_price, is_included")
      .eq("price_list_id", list.id)
      .eq("is_included", true),
    supabaseAdmin
      .from("settings")
      .select(
        "business_name, business_tagline, business_logo_url, business_phone, business_email, business_address, whatsapp_qr_link, google_review_qr_link",
      )
      .limit(1)
      .maybeSingle(),
  ]);
  if (itemsRes.error) throw itemsRes.error;

  const items = itemsRes.data ?? [];
  const ids = items.map((i) => i.product_id);

  let products: PublicOrderProduct[] = [];
  if (ids.length) {
    const [prodRes, stockRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, brand, sku, price, image_url, is_active")
        .in("id", ids),
      supabaseAdmin
        .from("product_stock")
        .select("product_id, stock_on_hand, committed_stock")
        .in("product_id", ids),
    ]);
    if (prodRes.error) throw prodRes.error;
    if (stockRes.error) throw stockRes.error;

    const available: Record<string, number> = {};
    for (const s of stockRes.data ?? []) {
      available[s.product_id] =
        (available[s.product_id] ?? 0) + (s.stock_on_hand ?? 0) - (s.committed_stock ?? 0);
    }
    const priceByProduct = new Map(items.map((i) => [i.product_id, i.custom_price]));

    products = (prodRes.data ?? [])
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        sku: p.sku,
        price: priceByProduct.get(p.id) ?? p.price,
        imageUrl: p.image_url,
        stock: Math.max(0, Math.floor(available[p.id] ?? 0)),
      }))
      .filter((p) => p.stock > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    available: true,
    list: {
      id: list.id,
      name: list.name,
      minQuantity: list.default_min_quantity,
      increasePercent: Number(list.below_min_increase_percent ?? 0),
    },
    business: toBusiness(settingsRes.data),
    products,
  };
}

const DEFAULT_GOOGLE_REVIEW_LINK = "https://g.page/r/CS_TpEm4RwOjEAE/review";

type SettingsRow = {
  business_name?: string | null;
  business_tagline?: string | null;
  business_logo_url?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  business_address?: string | null;
  whatsapp_qr_link?: string | null;
  google_review_qr_link?: string | null;
} | null;

function digitsOnly(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/[^\d]/g, "").replace(/^0+/, "");
  return d.length >= 7 ? d : "";
}

/** Public-safe business block. Never exposes internal settings. */
function toBusiness(s: SettingsRow) {
  const fromLink = (s?.whatsapp_qr_link ?? "").match(/wa\.me\/(\d+)/)?.[1] ?? "";
  const whatsapp = fromLink || digitsOnly(s?.business_phone);
  return {
    name: s?.business_name ?? "",
    tagline: s?.business_tagline ?? null,
    logo: s?.business_logo_url ?? null,
    phone: s?.business_phone ?? null,
    email: s?.business_email ?? null,
    address: s?.business_address ?? null,
    whatsapp: whatsapp || null,
    googleReview: s?.google_review_qr_link?.trim() || DEFAULT_GOOGLE_REVIEW_LINK,
  };
}

export type PublicOrderReceipt = {
  orderNumber: string;
  createdAt: string;
  customer: { name: string; phone: string; email: string | null; address: string | null; note: string | null };
  items: { name: string; quantity: number; appliedPrice: number; lineTotal: number }[];
  subtotal: number;
  total: number;
  priceIncreased: boolean;
  increasePercent: number;
  business: PublicBusiness;
};

export type SubmitOrderResult =
  | { ok: true; receipt: PublicOrderReceipt }
  | { ok: false; error: "unavailable" | "empty" | "failed" }
  | { ok: false; error: "stock"; productId: string; name: string; available: number };

/** Places a public order atomically (stock check + order + deduction in one transaction). */
export async function submitPublicOrder(input: {
  token: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  items: { productId: string; quantity: number }[];
}): Promise<SubmitOrderResult> {
  const { data, error } = await supabaseAdmin.rpc("submit_price_list_order", {
    p_token: input.token,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email ?? "",
    p_address: input.address ?? "",
    p_note: input.note ?? "",
    p_items: input.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) return { ok: false, error: "failed" };

  const result = data as Record<string, unknown> | null;
  if (!result?.["ok"]) {
    const kind = String(result?.["error"] ?? "failed");
    if (kind === "stock") {
      return {
        ok: false,
        error: "stock",
        productId: String(result?.["product_id"] ?? ""),
        name: String(result?.["name"] ?? "This product"),
        available: Number(result?.["available"] ?? 0),
      };
    }
    if (kind === "unavailable" || kind === "empty") return { ok: false, error: kind };
    return { ok: false, error: "failed" };
  }

  const receipt = await loadOrderReceipt(String(result["order_id"]));
  if (!receipt) return { ok: false, error: "failed" };
  return { ok: true, receipt };
}

/** Customer-facing receipt data. Never includes warehouse or cost information. */
export async function loadOrderReceipt(orderId: string): Promise<PublicOrderReceipt | null> {
  const [orderRes, itemsRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from("price_list_orders")
      .select(
        "id, order_number, created_at, customer_name, customer_phone, customer_email, customer_address, customer_note, subtotal, total_amount, was_price_increased, increase_percent",
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabaseAdmin
      .from("price_list_order_items")
      .select("product_name_snapshot, quantity, applied_price, line_total")
      .eq("price_list_order_id", orderId),
    supabaseAdmin
      .from("settings")
      .select(
        "business_name, business_tagline, business_logo_url, business_phone, business_email, business_address, whatsapp_qr_link, google_review_qr_link",
      )
      .limit(1)
      .maybeSingle(),
  ]);
  const order = orderRes.data;
  if (!order) return null;

  return {
    orderNumber: order.order_number ?? "",
    createdAt: order.created_at,
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      address: order.customer_address,
      note: order.customer_note,
    },
    items: (itemsRes.data ?? []).map((i) => ({
      name: i.product_name_snapshot,
      quantity: Number(i.quantity),
      appliedPrice: Number(i.applied_price),
      lineTotal: Number(i.line_total),
    })),
    subtotal: Number(order.subtotal),
    total: Number(order.total_amount),
    priceIncreased: order.was_price_increased,
    increasePercent: Number(order.increase_percent ?? 0),
    business: toBusiness(settingsRes.data),
  };
}

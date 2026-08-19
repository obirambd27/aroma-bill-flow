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

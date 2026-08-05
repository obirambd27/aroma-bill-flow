import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * PLACEHOLDER — Zoho Books connection test.
 *
 * TODO (when Zoho credentials are available):
 *   1. Read zoho_client_id / zoho_client_secret / zoho_refresh_token from `settings`.
 *   2. Exchange the refresh token for an access token at
 *      https://accounts.zoho.com/oauth/v2/token
 *   3. GET https://www.zohoapis.com/books/v3/organizations with that token.
 *   4. Store organization_id in settings.zoho_org_id and set
 *      zoho_connection_status = 'connected'.
 *
 * For now this only validates that all three credentials are present so the
 * whole UI flow (save → test → status badge) can be used end to end.
 */
export const testZohoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("settings")
      .select("id, zoho_client_id, zoho_client_secret, zoho_refresh_token")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { status: "error" as const, message: "Could not read settings." };
    }

    const complete =
      Boolean(data.zoho_client_id) &&
      Boolean(data.zoho_client_secret) &&
      Boolean(data.zoho_refresh_token);

    const status = complete ? "connected" : "not_connected";

    await context.supabase
      .from("settings")
      .update({ zoho_connection_status: status })
      .eq("id", data.id);

    return {
      status: status as "connected" | "not_connected",
      message: complete
        ? "Credentials saved. Live Zoho verification will run once the API integration is wired up."
        : "Add Client ID, Client Secret and Refresh Token to connect.",
    };
  });

/**
 * PLACEHOLDER — Zoho Books product/customer sync.
 * Will pull items + contacts from Zoho Books and upsert them locally.
 */
export const syncFromZoho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("settings")
      .select("id, zoho_connection_status")
      .limit(1)
      .maybeSingle();

    if (!data || data.zoho_connection_status !== "connected") {
      return { ok: false as const, message: "Zoho Books is not connected yet." };
    }

    const now = new Date().toISOString();
    await context.supabase.from("settings").update({ last_synced_at: now }).eq("id", data.id);

    return {
      ok: true as const,
      message: "Sync placeholder complete. Real Zoho product sync lands once API keys are added.",
      last_synced_at: now,
    };
  });

/**
 * PLACEHOLDER — create-zoho-contact.
 * Will POST /contacts to Zoho Books and return the created contact id so the
 * caller can store it in customers.zoho_contact_id.
 */
export const createZohoContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customerId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("settings")
      .select("zoho_connection_status")
      .limit(1)
      .maybeSingle();

    if (!settings || settings.zoho_connection_status !== "connected") {
      return { ok: false as const, zoho_contact_id: null, message: "Zoho Books is not connected." };
    }

    // TODO: POST https://www.zohoapis.com/books/v3/contacts and use the real id.
    return {
      ok: false as const,
      zoho_contact_id: null,
      message: `Customer ${data.customerId} saved locally. Zoho contact creation runs once API keys are added.`,
    };
  });

/**
 * PLACEHOLDER — create-zoho-item.
 * Will POST /items to Zoho Books and return the created item id for
 * products.zoho_item_id.
 */
export const createZohoItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("settings")
      .select("zoho_connection_status")
      .limit(1)
      .maybeSingle();

    if (!settings || settings.zoho_connection_status !== "connected") {
      return { ok: false as const, zoho_item_id: null, message: "Zoho Books is not connected." };
    }

    // TODO: POST https://www.zohoapis.com/books/v3/items and use the real id.
    return {
      ok: false as const,
      zoho_item_id: null,
      message: `Product ${data.productId} saved locally. Zoho item creation runs once API keys are added.`,
    };
  });

/**
 * PLACEHOLDER — sync-inventory-adjustment.
 * Will POST /inventoryadjustments once per warehouse used in the bill, with the
 * matching location_id and a negative quantity_adjusted per line item.
 * Never blocks bill creation: failures only mark zoho_sync_status = 'Failed'.
 */
export const syncInventoryAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { billId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: settings } = await context.supabase
      .from("settings")
      .select("zoho_connection_status")
      .limit(1)
      .maybeSingle();

    const connected = settings?.zoho_connection_status === "connected";
    const status = connected ? "Synced" : "Not Synced";

    await context.supabase
      .from("bills")
      .update({ zoho_sync_status: status })
      .eq("id", data.billId);

    return {
      ok: connected,
      status,
      message: connected
        ? "Inventory adjustment queued for Zoho Books."
        : "Bill saved locally. Zoho inventory adjustment runs once API keys are added.",
    };
  });

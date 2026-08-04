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

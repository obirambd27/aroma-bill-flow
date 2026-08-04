import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Link2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, connectionTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, type Settings } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { testZohoConnection, syncFromZoho } from "@/lib/zoho.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Fragrance Billing" },
      {
        name: "description",
        content: "Business profile, invoice defaults and Zoho Books connection.",
      },
      { property: "og:title", content: "Settings — Fragrance Billing" },
      {
        property: "og:description",
        content: "Business profile, invoice defaults and Zoho Books connection.",
      },
    ],
  }),
  component: SettingsPage,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  error: "Error",
  not_connected: "Not Connected",
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const testConn = useServerFn(testZohoConnection);
  const sync = useServerFn(syncFromZoho);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const set = (key: keyof Settings, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }) as Partial<Settings>);

  const saveProfile = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({
        business_name: (form.business_name ?? "").slice(0, 120),
        business_address: (form.business_address ?? "").slice(0, 500),
        business_phone: (form.business_phone ?? "").slice(0, 40),
        business_email: (form.business_email ?? "").slice(0, 255),
        business_logo_url: form.business_logo_url ?? null,
        tax_id: form.tax_id ?? null,
        default_tax_rate: Number(form.default_tax_rate ?? 0),
        invoice_prefix: (form.invoice_prefix || "INV-").slice(0, 12),
        invoice_footer_note: form.invoice_footer_note ?? null,
        low_stock_threshold: Number(form.low_stock_threshold ?? 5),
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Business profile saved");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const uploadLogo = async (file: File) => {
    if (!settings) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5MB");
      return;
    }
    setUploading(true);
    const path = `logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    set("business_logo_url", data.publicUrl);
    await supabase
      .from("settings")
      .update({ business_logo_url: data.publicUrl })
      .eq("id", settings.id);
    setUploading(false);
    toast.success("Logo uploaded");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveAndTest = async () => {
    if (!settings) return;
    setTesting(true);
    const { error } = await supabase
      .from("settings")
      .update({
        zoho_client_id: form.zoho_client_id || null,
        zoho_client_secret: form.zoho_client_secret || null,
        zoho_refresh_token: form.zoho_refresh_token || null,
        zoho_org_id: form.zoho_org_id || null,
      })
      .eq("id", settings.id);

    if (error) {
      setTesting(false);
      toast.error(error.message);
      return;
    }

    try {
      const res = await testConn({ data: undefined });
      if (res.status === "connected") toast.success(res.message);
      else toast.warning(res.message);
    } catch {
      toast.error("Connection test failed.");
    } finally {
      setTesting(false);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await sync({ data: undefined });
      if (res.ok) toast.success(res.message);
      else toast.warning(res.message);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch {
      toast.error("Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const status = settings?.zoho_connection_status ?? "not_connected";
  const connected = status === "connected";

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Business profile and integrations." />

      <Section title="Business Profile" description="Appears on every bill you issue.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="business_name">Business name</Label>
            <Input
              id="business_name"
              className="h-11"
              value={form.business_name ?? ""}
              onChange={(e) => set("business_name", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                {form.business_logo_url ? (
                  <img
                    src={form.business_logo_url}
                    alt="Business logo"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                className="h-11 max-w-xs"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file);
                }}
              />
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="business_address">Address</Label>
            <Textarea
              id="business_address"
              rows={3}
              value={form.business_address ?? ""}
              onChange={(e) => set("business_address", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_phone">Phone</Label>
            <Input
              id="business_phone"
              className="h-11"
              value={form.business_phone ?? ""}
              onChange={(e) => set("business_phone", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_email">Email</Label>
            <Input
              id="business_email"
              type="email"
              className="h-11"
              value={form.business_email ?? ""}
              onChange={(e) => set("business_email", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_id">Tax ID / GST number (optional)</Label>
            <Input
              id="tax_id"
              className="h-11"
              value={form.tax_id ?? ""}
              onChange={(e) => set("tax_id", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_tax_rate">Default tax rate (%)</Label>
            <Input
              id="default_tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              className="h-11"
              value={String(form.default_tax_rate ?? 0)}
              onChange={(e) => set("default_tax_rate", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice_prefix">Invoice number prefix</Label>
            <Input
              id="invoice_prefix"
              className="h-11"
              value={form.invoice_prefix ?? "INV-"}
              onChange={(e) => set("invoice_prefix", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="low_stock_threshold">Low stock alert threshold</Label>
            <Input
              id="low_stock_threshold"
              type="number"
              min={0}
              className="h-11"
              value={String(form.low_stock_threshold ?? 5)}
              onChange={(e) => set("low_stock_threshold", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="invoice_footer_note">Invoice footer note</Label>
            <Textarea
              id="invoice_footer_note"
              rows={2}
              placeholder="Thank you for shopping with us"
              value={form.invoice_footer_note ?? ""}
              onChange={(e) => set("invoice_footer_note", e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        title="Zoho Books Connection"
        description="Connect your Zoho Books account to sync products, customers, and stock levels."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <StatusBadge tone={connectionTone(status)}>{STATUS_LABEL[status]}</StatusBadge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="zoho_client_id">Client ID</Label>
            <Input
              id="zoho_client_id"
              type="password"
              className="h-11"
              placeholder="1000.XXXXXXXXXXXX"
              value={form.zoho_client_id ?? ""}
              onChange={(e) => set("zoho_client_id", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zoho_client_secret">Client Secret</Label>
            <Input
              id="zoho_client_secret"
              type="password"
              className="h-11"
              value={form.zoho_client_secret ?? ""}
              onChange={(e) => set("zoho_client_secret", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zoho_refresh_token">Refresh Token</Label>
            <Input
              id="zoho_refresh_token"
              type="password"
              className="h-11"
              value={form.zoho_refresh_token ?? ""}
              onChange={(e) => set("zoho_refresh_token", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zoho_org_id">Organization ID (optional)</Label>
            <Input
              id="zoho_org_id"
              className="h-11"
              value={form.zoho_org_id ?? ""}
              onChange={(e) => set("zoho_org_id", e.target.value)}
            />
          </div>
        </div>

        <p className="rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          These credentials come from the Zoho API Console (Self Client). The connection test and
          sync are placeholders for now — the screens are fully built, and they start returning real
          Zoho data as soon as you add your keys.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={saveAndTest} disabled={testing}>
            <Link2 />
            {testing ? "Testing…" : "Save & Test Connection"}
          </Button>
          <Button variant="outline" onClick={runSync} disabled={!connected || syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            Sync Now
          </Button>
          <span className="text-xs text-muted-foreground">
            Last synced: {formatDateTime(settings?.last_synced_at)}
          </span>
        </div>
      </Section>
    </div>
  );
}

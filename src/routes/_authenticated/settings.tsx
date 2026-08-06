import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, type Settings } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Fragrance Billing" },
      {
        name: "description",
        content: "Business profile, invoice defaults and stock preferences.",
      },
      { property: "og:title", content: "Settings — Fragrance Billing" },
      {
        property: "og:description",
        content: "Business profile, invoice defaults and stock preferences.",
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

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    const { data } = await supabase.storage
      .from("branding")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = data?.signedUrl ?? null;
    set("business_logo_url", url);
    await supabase.from("settings").update({ business_logo_url: url }).eq("id", settings.id);
    setUploading(false);
    toast.success("Logo uploaded");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Business profile and invoice defaults." />

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
    </div>
  );
}

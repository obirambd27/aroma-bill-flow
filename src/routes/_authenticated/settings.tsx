import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { InstallAppButton } from "@/components/PwaBanners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, type Settings } from "@/lib/data";
import { DEFAULT_SHARE_FOOTER } from "@/lib/invoice-share";
import { InvoicePreview } from "@/components/InvoicePreview";
import { InvoiceTemplateGallery } from "@/components/InvoiceTemplateGallery";
import { LedgerIntegrityCheck } from "@/components/LedgerIntegrityCheck";
import { DEFAULT_GOOGLE_REVIEW_LINK, type InvoiceTemplateId } from "@/lib/invoice-doc";

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
        terms_and_conditions: form.terms_and_conditions ?? null,
        share_message_footer: form.share_message_footer ?? null,
        business_tagline: form.business_tagline ?? null,
        bank_payment_details: form.bank_payment_details ?? null,
        whatsapp_qr_link: form.whatsapp_qr_link ?? null,
        whatsapp_qr_name: form.whatsapp_qr_name ?? null,
        google_review_qr_link: form.google_review_qr_link ?? null,
        google_review_qr_name: form.google_review_qr_name ?? null,
        signature_url: form.signature_url ?? null,
        default_payment_terms: (form.default_payment_terms || "Due on Receipt").slice(0, 60),
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

  const uploadImage = async (
    file: File,
    field: "business_logo_url" | "signature_url",
    label: string,
  ) => {
    if (!settings) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`${label} must be under 5MB`);
      return;
    }
    setUploading(true);
    const path = `${field}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
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
    set(field, url);
    await supabase
      .from("settings")
      .update(
        field === "signature_url" ? { signature_url: url } : { business_logo_url: url },
      )
      .eq("id", settings.id);
    setUploading(false);
    toast.success(`${label} uploaded`);
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const selectTemplate = async (id: InvoiceTemplateId) => {
    if (!settings) return;
    set("active_invoice_template", id);
    const { error } = await supabase
      .from("settings")
      .update({ active_invoice_template: id })
      .eq("id", settings.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invoice template updated");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const uploadLogo = (file: File) => uploadImage(file, "business_logo_url", "Logo");

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
            <Label htmlFor="business_tagline">Business tagline</Label>
            <Input
              id="business_tagline"
              className="h-11"
              placeholder="Fine Fragrance House"
              value={form.business_tagline ?? ""}
              onChange={(e) => set("business_tagline", e.target.value)}
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

          <div className="space-y-2">
            <Label htmlFor="default_payment_terms">Default payment terms</Label>
            <Input
              id="default_payment_terms"
              className="h-11"
              placeholder="Due on Receipt"
              value={form.default_payment_terms ?? ""}
              onChange={(e) => set("default_payment_terms", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="share_message_footer">Share message footer</Label>
            <Textarea
              id="share_message_footer"
              rows={2}
              placeholder={DEFAULT_SHARE_FOOTER}
              value={form.share_message_footer ?? ""}
              onChange={(e) => set("share_message_footer", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Closing line for invoices shared via WhatsApp or email. Use {"{"}business_name{"}"} to
              insert your business name.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="terms_and_conditions">Terms &amp; conditions (shown on invoices)</Label>
            <Textarea
              id="terms_and_conditions"
              rows={3}
              placeholder="Goods once sold cannot be returned…"
              value={form.terms_and_conditions ?? ""}
              onChange={(e) => set("terms_and_conditions", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bank_payment_details">Bank / payment details (shown on invoices)</Label>
            <Textarea
              id="bank_payment_details"
              rows={3}
              placeholder={"Bank: Emirates NBD\nAccount: 1234567890\nIBAN: AE00 0000 0000"}
              value={form.bank_payment_details ?? ""}
              onChange={(e) => set("bank_payment_details", e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border p-4 sm:col-span-2">
            <p className="text-sm font-semibold">Invoice QR codes</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp_qr_link">WhatsApp QR — link</Label>
                <Input
                  id="whatsapp_qr_link"
                  className="h-11"
                  placeholder="https://wa.me/9715XXXXXXXX"
                  value={form.whatsapp_qr_link ?? ""}
                  onChange={(e) => set("whatsapp_qr_link", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp_qr_name">WhatsApp QR — name</Label>
                <Input
                  id="whatsapp_qr_name"
                  className="h-11"
                  placeholder="Chat on WhatsApp"
                  value={form.whatsapp_qr_name ?? ""}
                  onChange={(e) => set("whatsapp_qr_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="google_review_qr_link">Google review QR — link</Label>
                <Input
                  id="google_review_qr_link"
                  className="h-11"
                  placeholder={DEFAULT_GOOGLE_REVIEW_LINK}
                  value={form.google_review_qr_link ?? ""}
                  onChange={(e) => set("google_review_qr_link", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="google_review_qr_name">Google review QR — name</Label>
                <Input
                  id="google_review_qr_name"
                  className="h-11"
                  placeholder="Review us on Google"
                  value={form.google_review_qr_name ?? ""}
                  onChange={(e) => set("google_review_qr_name", e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Both QR codes are printed on invoices and receipts. Leave blank to use the defaults.
            </p>
          </div>



          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="signature">Signature image</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-16 w-32 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                {form.signature_url ? (
                  <img
                    src={form.signature_url}
                    alt="Authorised signature"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No signature</span>
                )}
              </div>
              <Input
                id="signature"
                type="file"
                accept="image/*"
                className="h-11 max-w-xs"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file, "signature_url", "Signature");
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        title="Invoice Template"
        description="Pick the look of your printed and shared A4 invoices."
      >
        <InvoiceTemplateGallery
          settings={form}
          activeId={form.active_invoice_template}
          onSelect={(id) => void selectTemplate(id)}
        />
      </Section>

      <Section
        title="Invoice Preview (A4)"
        description="Live preview of your printed invoice — updates as you edit the tagline, bank details or signature above."
      >
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <InvoicePreview settings={form} />
          </div>
        </div>
      </Section>

      <Section
        title="Ledger Integrity Check"
        description="Scans the ledger for asymmetric money entries (phantom reversals or collections missing from account balances) and can repair them automatically."
      >
        <LedgerIntegrityCheck />
      </Section>

      <Section
        title="Data Import & Export"
        description="This app works fully offline from any external service. Use this only as a manual backup or bulk-load tool — not required for normal use."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/import-export">
              <FileSpreadsheet />
              Open Import / Export
            </Link>
          </Button>
        </div>
      </Section>

      <Section
        title="Install App"
        description="Install Fragrance Billing on this device so it opens full screen, like a native app."
      >
        <InstallAppButton />
      </Section>
    </div>
  );
}

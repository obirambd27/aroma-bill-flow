import { InvoiceDocumentView } from "@/components/invoice-templates";
import { sampleInvoiceDoc, type SettingsLike } from "@/lib/invoice-doc";

export type InvoicePreviewSettings = SettingsLike;

/** Live A4 invoice preview — mirrors the real invoice document exactly. */
export function InvoicePreview({
  settings,
  templateId,
}: {
  settings: InvoicePreviewSettings;
  templateId?: string | null | undefined;
}) {
  return (
    <InvoiceDocumentView
      doc={sampleInvoiceDoc(settings)}
      templateId={templateId ?? settings.active_invoice_template}
    />
  );
}

import { VelvetOudTemplate } from "@/components/invoice-templates/VelvetOud";
import { OrangeBulkTemplate } from "@/components/invoice-templates/OrangeBulk";
import {
  resolveTemplateId,
  type InvoiceDoc,
  type InvoiceTemplateId,
} from "@/lib/invoice-doc";

export type TemplateMeta = {
  id: InvoiceTemplateId;
  name: string;
  description: string;
};

/** Registry — add a template here and it becomes selectable in Settings. */
export const INVOICE_TEMPLATES: TemplateMeta[] = [
  {
    id: "velvet_oud",
    name: "Velvet & Oud",
    description: "Violet hero band, tinted item cards and a rotated status stamp.",
  },
  {
    id: "orange_bulk",
    name: "Orange Bulk",
    description: "Bold wordmark, amber table header and a wide grand-total bar.",
  },
];

/** Renders a prepared invoice document in whichever template is active. */
export function InvoiceDocumentView({
  doc,
  templateId,
}: {
  doc: InvoiceDoc;
  templateId?: string | null | undefined;
}) {
  const id = resolveTemplateId(templateId);
  return id === "orange_bulk" ? (
    <OrangeBulkTemplate doc={doc} />
  ) : (
    <VelvetOudTemplate doc={doc} />
  );
}

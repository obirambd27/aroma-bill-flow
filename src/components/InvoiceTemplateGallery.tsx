import { useState } from "react";
import { Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoicePreview, type InvoicePreviewSettings } from "@/components/InvoicePreview";
import { INVOICE_TEMPLATES } from "@/components/invoice-templates";
import { resolveTemplateId, type InvoiceTemplateId } from "@/lib/invoice-doc";
import { cn } from "@/lib/utils";

/** Selectable gallery of invoice templates with scaled thumbnails and a full-size preview. */
export function InvoiceTemplateGallery({
  settings,
  activeId,
  onSelect,
}: {
  settings: InvoicePreviewSettings;
  activeId?: string | null | undefined;
  onSelect: (id: InvoiceTemplateId) => void;
}) {
  const active = resolveTemplateId(activeId);
  const [previewId, setPreviewId] = useState<InvoiceTemplateId | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {INVOICE_TEMPLATES.map((template) => {
          const selected = template.id === active;
          return (
            <div
              key={template.id}
              className={cn(
                "overflow-hidden rounded-xl border-2 transition-colors",
                selected ? "border-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(template.id)}
                aria-label={`Use the ${template.name} template`}
                className="block h-[260px] w-full overflow-hidden bg-muted/40"
              >
                <div className="pointer-events-none w-[860px] origin-top-left scale-[0.42]">
                  <InvoicePreview settings={settings} templateId={template.id} />
                </div>
              </button>

              <div className="flex items-start justify-between gap-3 border-t border-border p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {template.name}
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewId(template.id)}
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  {!selected && (
                    <Button size="sm" onClick={() => onSelect(template.id)}>
                      Use
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={previewId !== null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {INVOICE_TEMPLATES.find((t) => t.id === previewId)?.name ?? "Template preview"}
            </DialogTitle>
            <DialogDescription>
              Full-size A4 preview using sample data and your business details.
            </DialogDescription>
          </DialogHeader>
          {previewId && <InvoicePreview settings={settings} templateId={previewId} />}
          {previewId && previewId !== active && (
            <Button
              onClick={() => {
                onSelect(previewId);
                setPreviewId(null);
              }}
            >
              Use this template
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Merge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers } from "@/lib/data";
import {
  differingFields,
  useMergeCustomers,
  type MergeFieldKey,
  type MergeableCustomer,
} from "@/lib/customer-merge";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Merge two duplicate customers into one. The surviving record keeps every
 * bill, payment and note from both; the duplicate is removed afterwards.
 */
export function CustomerMergeDialog({
  open,
  onOpenChange,
  primaryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected customer to keep (the profile the dialog was opened from). */
  primaryId?: string;
}) {
  const { data: customers = [] } = useCustomers();
  const merge = useMergeCustomers();
  const [survivorId, setSurvivorId] = useState(primaryId ?? "");
  const [duplicateId, setDuplicateId] = useState("");
  const [choices, setChoices] = useState<Record<string, "survivor" | "duplicate">>({});

  useEffect(() => {
    if (open) {
      setSurvivorId(primaryId ?? "");
      setDuplicateId("");
      setChoices({});
    }
  }, [open, primaryId]);

  const survivor = customers.find((c) => c.id === survivorId) as MergeableCustomer | undefined;
  const duplicate = customers.find((c) => c.id === duplicateId) as MergeableCustomer | undefined;
  const sameRecord = Boolean(survivorId) && survivorId === duplicateId;

  const diffs = useMemo(
    () => (survivor && duplicate && !sameRecord ? differingFields(survivor, duplicate) : []),
    [survivor, duplicate, sameRecord],
  );

  const confirm = () => {
    if (!survivor || !duplicate) return;
    const finalValues: Partial<Record<MergeFieldKey, string | null>> = {};
    for (const f of diffs) {
      // Unanswered choices intentionally default to the surviving record's value.
      const pick = choices[f.key] === "duplicate" ? duplicate : survivor;
      finalValues[f.key] = (pick[f.key] ?? null) as string | null;
    }
    merge.mutate(
      { survivorId: survivor.id, duplicateId: duplicate.id, finalValues },
      {
        onSuccess: () => {
          toast.success(`Merged into ${finalValues.name ?? survivor.name}`);
          onOpenChange(false);
        },
        onError: (e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Merge failed — nothing was changed.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate customers</DialogTitle>
          <DialogDescription>
            Everything from both records ends up on the customer you keep.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Keep this customer</Label>
            <CustomerSelect
              value={survivorId}
              onChange={setSurvivorId}
              customers={customers as MergeableCustomer[]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Merge this one into it</Label>
            <CustomerSelect
              value={duplicateId}
              onChange={setDuplicateId}
              customers={customers as MergeableCustomer[]}
            />
          </div>
        </div>

        {sameRecord && (
          <p className="text-sm font-medium text-destructive">
            Pick two different customers — a record cannot be merged with itself.
          </p>
        )}

        {survivor && duplicate && !sameRecord && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard title="Keeping" c={survivor} />
              <SummaryCard title="Merging in" c={duplicate} />
            </div>

            {diffs.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Choose the final details</p>
                {diffs.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Which {f.label.toLowerCase()} should be kept?
                    </p>
                    <RadioGroup
                      value={choices[f.key] ?? "survivor"}
                      onValueChange={(v) =>
                        setChoices((c) => ({ ...c, [f.key]: v as "survivor" | "duplicate" }))
                      }
                      className="grid gap-1.5 sm:grid-cols-2"
                    >
                      <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <RadioGroupItem value="survivor" />
                        <span className="truncate">{String(survivor[f.key] ?? "—") || "—"}</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <RadioGroupItem value="duplicate" />
                        <span className="truncate">{String(duplicate[f.key] ?? "—") || "—"}</span>
                      </label>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            )}

            <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                This will combine both customers into one record. All bills, payments, sales orders
                and other history from both will be reassigned to the final merged customer. This
                cannot be undone.
              </span>
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={!survivor || !duplicate || sameRecord || merge.isPending}
          >
            <Merge />
            {merge.isPending ? "Merging…" : "Confirm Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerSelect({
  value,
  onChange,
  customers,
}: {
  value: string;
  onChange: (v: string) => void;
  customers: MergeableCustomer[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11">
        <SelectValue placeholder="Select a customer" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {customers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.phone ? ` · ${c.phone}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SummaryCard({ title, c }: { title: string; c: MergeableCustomer }) {
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 font-semibold">{c.name}</p>
      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        <Row label="Phone" value={c.phone ?? "—"} />
        <Row label="Email" value={c.email ?? "—"} />
        <Row label="Address" value={c.address ?? "—"} />
        <Row label="Total spend" value={formatMoney(c.total_spend ?? 0)} />
        <Row
          label="Last purchase"
          value={c.last_purchase_at ? formatDate(c.last_purchase_at) : "—"}
        />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}

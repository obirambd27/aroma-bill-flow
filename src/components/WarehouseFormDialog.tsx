import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Warehouse } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  address: z.string().trim().max(400, "Address is too long"),
});

export function WarehouseFormDialog({
  open,
  onOpenChange,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse?: Warehouse | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", address: "", isDefault: false, isActive: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: warehouse?.name ?? "",
      address: warehouse?.address ?? "",
      isDefault: warehouse?.is_default ?? false,
      isActive: warehouse?.is_active ?? true,
    });
  }, [open, warehouse]);

  const save = async () => {
    const parsed = schema.safeParse({ name: form.name, address: form.address });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    const payload = {
      name: parsed.data.name,
      address: parsed.data.address || null,
      is_default: form.isDefault,
      is_active: form.isActive,
    };

    // Only one warehouse may be default (enforced by a DB unique index), so
    // clear the previous default BEFORE saving this one as default.
    if (form.isDefault) {
      const clearQ = supabase.from("warehouses").update({ is_default: false }).eq("is_default", true);
      const { error: clearError } = warehouse
        ? await clearQ.neq("id", warehouse.id)
        : await clearQ;
      if (clearError) {
        setSaving(false);
        toast.error("Could not unset the previous default warehouse");
        return;
      }
    }

    const { data, error } = warehouse
      ? await supabase.from("warehouses").update(payload).eq("id", warehouse.id).select().single()
      : await supabase.from("warehouses").insert(payload).select().single();

    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the warehouse");
      return;
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(warehouse ? "Warehouse updated" : "Warehouse created");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{warehouse ? "Edit warehouse" : "New warehouse"}</DialogTitle>
          <DialogDescription>Locations that hold stock for billing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wh-name">Name</Label>
            <Input
              id="wh-name"
              className="h-11"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wh-address">Address</Label>
            <Textarea
              id="wh-address"
              rows={3}
              maxLength={400}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v === true }))}
            />
            Set as default warehouse for new bills
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v === true }))}
            />
            Active
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : warehouse ? "Save changes" : "Create warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

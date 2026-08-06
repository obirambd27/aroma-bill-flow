import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Vendor } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  phone: z.string().trim().max(30, "Phone is too long"),
  email: z.union([z.string().trim().email("Enter a valid email").max(255), z.literal("")]),
  address: z.string().trim().max(500, "Address is too long"),
  notes: z.string().trim().max(2000, "Notes are too long"),
});

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
  onSaved?: (vendor: Vendor) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: vendor?.name ?? "",
      phone: vendor?.phone ?? "",
      email: vendor?.email ?? "",
      address: vendor?.address ?? "",
      notes: vendor?.notes ?? "",
    });
  }, [open, vendor]);

  const save = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    const values = {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    };

    setSaving(true);
    if (vendor) {
      const { data, error } = await supabase
        .from("vendors")
        .update(values)
        .eq("id", vendor.id)
        .select()
        .single();
      setSaving(false);
      if (error || !data) {
        toast.error(error?.message ?? "Could not update the vendor");
        return;
      }
      queryClient.invalidateQueries();
      toast.success("Vendor updated");
      onOpenChange(false);
      onSaved?.(data as Vendor);
      return;
    }

    const { data, error } = await supabase.from("vendors").insert(values).select().single();
    setSaving(false);
    if (error || !data) {
      toast.error(error?.message ?? "Could not create the vendor");
      return;
    }
    queryClient.invalidateQueries();
    toast.success(`${data.name} added`);
    onOpenChange(false);
    onSaved?.(data as Vendor);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit vendor" : "New vendor"}</DialogTitle>
          <DialogDescription>Suppliers you buy stock from.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vendor-name">Name</Label>
            <Input
              id="vendor-name"
              className="h-11"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-phone">Phone</Label>
            <Input
              id="vendor-phone"
              type="tel"
              className="h-11"
              maxLength={30}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-email">Email</Label>
            <Input
              id="vendor-email"
              type="email"
              className="h-11"
              maxLength={255}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-address">Address</Label>
            <Textarea
              id="vendor-address"
              rows={3}
              maxLength={500}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor-notes">Notes</Label>
            <Textarea
              id="vendor-notes"
              rows={3}
              maxLength={2000}
              placeholder="Payment terms, lead times, contact person"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : vendor ? "Save changes" : "Create vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

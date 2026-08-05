import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createZohoContact } from "@/lib/zoho.functions";
import type { Customer } from "@/lib/data";
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
});

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
    });
  }, [open, customer]);

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
    };

    setSaving(true);
    if (customer) {
      const { data, error } = await supabase
        .from("customers")
        .update(values)
        .eq("id", customer.id)
        .select()
        .single();
      setSaving(false);
      if (error || !data) {
        toast.error(error?.message ?? "Could not update the customer");
        return;
      }
      queryClient.invalidateQueries();
      toast.success("Customer updated");
      onOpenChange(false);
      onSaved?.(data as Customer);
      return;
    }

    const { data, error } = await supabase.from("customers").insert(values).select().single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not create the customer");
      return;
    }

    // Placeholder for the Zoho Books contact creation (create-zoho-contact).
    try {
      const result = await createZohoContact({ data: { customerId: data.id } });
      if (result.ok && result.zoho_contact_id) {
        await supabase
          .from("customers")
          .update({ zoho_contact_id: result.zoho_contact_id })
          .eq("id", data.id);
      }
    } catch {
      // Never block local customer creation on Zoho.
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(`${data.name} added`);
    onOpenChange(false);
    onSaved?.(data as Customer);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>
            Saved here and pushed to Zoho Books contacts once your API keys are added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              className="h-11"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">Phone</Label>
            <Input
              id="cust-phone"
              type="tel"
              className="h-11"
              maxLength={30}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              className="h-11"
              maxLength={255}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-address">Address</Label>
            <Textarea
              id="cust-address"
              rows={3}
              maxLength={500}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : customer ? "Save changes" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

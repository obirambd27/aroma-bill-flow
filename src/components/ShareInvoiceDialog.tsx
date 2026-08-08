import { useState } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanPhone,
  generateInvoiceMessageText,
  generateInvoicePlainText,
  type ShareBill,
  type ShareSettings,
} from "@/lib/invoice-share";

type Channel = "whatsapp" | "email" | null;

export function ShareInvoiceDialog({
  open,
  onOpenChange,
  bill,
  settings,
  balanceDue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: ShareBill;
  settings: ShareSettings;
  balanceDue: number;
}) {
  const [channel, setChannel] = useState<Channel>(null);
  const [phone, setPhone] = useState(bill.customers?.phone ?? "");
  const [email, setEmail] = useState(bill.customers?.email ?? "");
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setChannel(null);
    onOpenChange(false);
  };

  const persist = async (field: "phone" | "email", value: string) => {
    if (!saveToProfile || !bill.customer_id) return;
    const patch = field === "phone" ? { phone: value } : { email: value };
    const { error } = await supabase.from("customers").update(patch).eq("id", bill.customer_id);
    if (error) toast.error(`Saved message, but profile update failed: ${error.message}`);
  };

  const sendWhatsApp = async () => {
    const digits = cleanPhone(phone);
    if (digits.length < 7) {
      toast.error("Enter a valid phone number with country code");
      return;
    }
    setBusy(true);
    await persist("phone", phone.trim());
    setBusy(false);
    const text = generateInvoiceMessageText(bill, settings, balanceDue);
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    close();
  };

  const sendEmail = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    await persist("email", value);
    setBusy(false);
    const subject = `Invoice ${bill.bill_number ?? ""} from ${settings?.business_name ?? "us"}`.trim();
    const body = generateInvoicePlainText(bill, settings, balanceDue);
    window.location.href = `mailto:${encodeURIComponent(value)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    close();
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(generateInvoiceMessageText(bill, settings, balanceDue));
      toast.success("Invoice message copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share invoice</DialogTitle>
          <DialogDescription>
            Sends a formatted text invoice — no attachment needed.
          </DialogDescription>
        </DialogHeader>

        {channel === null && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => setChannel("whatsapp")}
              >
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => setChannel("email")}
              >
                <Mail className="h-5 w-5" />
                Email
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={copyText}>
              Copy message text
            </Button>
          </div>
        )}

        {channel === "whatsapp" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-phone">WhatsApp number (with country code)</Label>
              <Input
                id="share-phone"
                inputMode="tel"
                placeholder="971501234567"
                className="h-11"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {bill.customer_id && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={saveToProfile}
                  onCheckedChange={(v) => setSaveToProfile(Boolean(v))}
                />
                Save to customer profile
              </label>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setChannel(null)}>
                Back
              </Button>
              <Button onClick={sendWhatsApp} disabled={busy}>
                Open WhatsApp
              </Button>
            </div>
          </div>
        )}

        {channel === "email" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Email address</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="customer@example.com"
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {bill.customer_id && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={saveToProfile}
                  onCheckedChange={(v) => setSaveToProfile(Boolean(v))}
                />
                Save to customer profile
              </label>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setChannel(null)}>
                Back
              </Button>
              <Button onClick={sendEmail} disabled={busy}>
                Open email
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { cleanPhone } from "@/lib/invoice-share";

export type AgingBucket = "current" | "30-60" | "60+" | "unknown";

export const agingLabel: Record<AgingBucket, string> = {
  current: "Current",
  "30-60": "31-60 days",
  "60+": "60+ days",
  unknown: "Unknown",
};

export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function agingBucket(oldestDueDate: string | null | undefined): AgingBucket {
  const d = daysSince(oldestDueDate);
  if (d === null) return "unknown";
  if (d <= 30) return "current";
  if (d <= 60) return "30-60";
  return "60+";
}

export function agingTone(bucket: AgingBucket) {
  if (bucket === "current") return "success" as const;
  if (bucket === "30-60") return "warning" as const;
  if (bucket === "60+") return "error" as const;
  return "neutral" as const;
}

/** Reminder text used for bulk WhatsApp payment nudges. */
export function reminderMessage(name: string, amount: string, business: string) {
  return `Hi ${name}, this is a friendly reminder that you have an outstanding balance of ${amount} with ${business}. Please reach out if you'd like to settle this. Thank you!`;
}

export function validWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = cleanPhone(phone);
  return digits.length >= 8 ? digits : null;
}

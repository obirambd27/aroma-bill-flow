import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "neutral" | "accent";

const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning-foreground border-warning/35",
  error: "bg-destructive/10 text-destructive border-destructive/25",
  neutral: "bg-muted text-muted-foreground border-border",
  accent: "bg-accent text-accent-foreground border-accent-foreground/15",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", toneClass[tone], className)}
    >
      {children}
    </Badge>
  );
}

export function stockTone(stock: number, threshold: number): { tone: Tone; label: string } {
  if (stock <= 0) return { tone: "error", label: "Out of Stock" };
  if (stock <= threshold) return { tone: "warning", label: "Low Stock" };
  return { tone: "success", label: "In Stock" };
}

export function connectionTone(status: string): Tone {
  if (status === "connected") return "success";
  if (status === "error") return "error";
  return "neutral";
}

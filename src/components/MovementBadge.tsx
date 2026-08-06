import { StatusBadge } from "@/components/StatusBadge";

const POSITIVE = ["Transfer In", "Initial Stock", "Purchase", "Sale Return"];
const NEGATIVE = ["Sale", "Transfer Out", "Purchase Return"];

export function MovementBadge({ type }: { type: string }) {
  const tone = POSITIVE.includes(type)
    ? "success"
    : NEGATIVE.includes(type)
      ? "error"
      : "accent";
  return <StatusBadge tone={tone}>{type}</StatusBadge>;
}

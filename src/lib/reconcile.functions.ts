import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Blocks a save when the money on a paid invoice would exceed the invoice total. */
export const validateBillPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        billId: z.string().uuid().nullable().optional(),
        totalAmount: z.number(),
        amountPaid: z.number(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { validateBillPayment } = await import("./reconcile.server");
    return validateBillPayment(context.supabase, data);
  });

/** Repairs payment totals and ledger links for one invoice. */
export const reconcileBillFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ billId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { reconcileBill } = await import("./reconcile.server");
    return reconcileBill(context.supabase, data.billId);
  });

/** Lists every bill / payment / ledger figure that is out of sync. */
export const scanSyncIssuesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { scanSyncIssues } = await import("./reconcile.server");
    return scanSyncIssues(context.supabase);
  });

/** One-click repair of everything the scan reports. */
export const fixSyncIssuesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fixSyncIssues } = await import("./reconcile.server");
    return fixSyncIssues(context.supabase);
  });

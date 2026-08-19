import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicPriceList = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { loadPublicPriceList } = await import("./public-order.server");
    return loadPublicPriceList(data.token);
  });

const submitSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1)
    .max(300),
});

export const submitPublicOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { submitPublicOrder } = await import("./public-order.server");
    return submitPublicOrder(data);
  });

/** Rejecting an order restores stock — runs through the guarded database transaction. */
export const rejectPriceListOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ orderId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { rejectPriceListOrder } = await import("./price-list-orders.server");
    return rejectPriceListOrder(data.orderId, data.reason ?? "");
  });

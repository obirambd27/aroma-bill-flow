import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicPriceList = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { loadPublicPriceList } = await import("./public-order.server");
    return loadPublicPriceList(data.token);
  });

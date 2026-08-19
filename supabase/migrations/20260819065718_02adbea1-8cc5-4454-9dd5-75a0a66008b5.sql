ALTER TABLE public.price_list_orders ADD COLUMN IF NOT EXISTS is_viewed boolean NOT NULL DEFAULT false;
UPDATE public.price_list_orders SET is_viewed = true WHERE status <> 'New';
ALTER TABLE public.price_list_orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_list_orders;
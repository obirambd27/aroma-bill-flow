-- Detach history references (keep snapshots)
ALTER TABLE public.bill_items DROP CONSTRAINT IF EXISTS bill_items_product_id_fkey;
ALTER TABLE public.bill_items ADD CONSTRAINT bill_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.credit_note_items DROP CONSTRAINT IF EXISTS credit_note_items_product_id_fkey;
ALTER TABLE public.credit_note_items ADD CONSTRAINT credit_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.delivery_note_items DROP CONSTRAINT IF EXISTS delivery_note_items_product_id_fkey;
ALTER TABLE public.delivery_note_items ADD CONSTRAINT delivery_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_bill_items DROP CONSTRAINT IF EXISTS purchase_bill_items_product_id_fkey;
ALTER TABLE public.purchase_bill_items ADD CONSTRAINT purchase_bill_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_return_items DROP CONSTRAINT IF EXISTS purchase_return_items_product_id_fkey;
ALTER TABLE public.purchase_return_items ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_product_id_fkey;
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.sales_return_items DROP CONSTRAINT IF EXISTS sales_return_items_product_id_fkey;
ALTER TABLE public.sales_return_items ADD CONSTRAINT sales_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Operational rows follow the product
ALTER TABLE public.product_stock DROP CONSTRAINT IF EXISTS product_stock_product_id_fkey;
ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_product_id_fkey;
ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.price_list_items DROP CONSTRAINT IF EXISTS price_list_items_product_id_fkey;
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
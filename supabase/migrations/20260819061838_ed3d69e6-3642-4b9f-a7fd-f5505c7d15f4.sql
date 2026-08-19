
REVOKE ALL ON FUNCTION public.set_price_list_order_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_price_list_order(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_price_list_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_price_list_order(text, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_price_list_order(uuid, text) TO service_role;

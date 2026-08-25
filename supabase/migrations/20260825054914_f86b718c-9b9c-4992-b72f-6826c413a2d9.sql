REVOKE ALL ON FUNCTION public.delete_payment_received(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment_received(uuid, text) TO authenticated, service_role;
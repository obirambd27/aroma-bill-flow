REVOKE EXECUTE ON FUNCTION public.audit_stock_ledger(boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_stock_correction(uuid, uuid, text, numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_bill_stock(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_bill_edit_stock(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, uuid, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.adjust_stock_on_hand(uuid, uuid, numeric) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.audit_stock_ledger(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_correction(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bill_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bill_edit_stock(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, uuid, numeric, text) TO authenticated;
/**
 * PostgREST caps every request at 1000 rows. Any list that can grow past that
 * (customers, products, bills, stock rows…) must be fetched in ranged pages,
 * otherwise records silently disappear from the app while existing in the DB.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    if (page > 200) break; // hard safety stop
  }
  return out;
}

/**
 * Page through a Supabase / PostgREST select until every matching row is
 * fetched.
 *
 * Why this exists: PostgREST silently caps a single `.range(0, 99999)` call at
 * the server-side `db-max-rows` setting (often 1,000 on hosted Supabase
 * projects). Asking for a 100k-row window does NOT return more than that cap;
 * it just returns the first page with no error. For tables that can grow past
 * 1,000 rows (entries, raffle_round_entries) the only safe pattern is to walk
 * the table page-by-page and stop when a partial page comes back.
 *
 * Usage:
 *   const all = await selectAllPaged<{ id: string }>((from, to) =>
 *     supa.from("entries").select("id").order("created_at", { ascending: true }).range(from, to)
 *   );
 */

const PAGE_SIZE = 1000;
// Backstop: if the server somehow keeps handing back full pages forever we
// don't want an API route to loop indefinitely. 1M rows is far above anything
// this app should ever see.
const HARD_LIMIT = 1_000_000;

type Pageable<Row> = PromiseLike<{ data: Row[] | null; error: any }>;

export async function selectAllPaged<Row>(
  buildPage: (from: number, to: number) => Pageable<Row>
): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  while (out.length < HARD_LIMIT) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

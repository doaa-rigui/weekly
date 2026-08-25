/**
 * Turns a Supabase error into something a user can act on. The common causes
 * are all setup problems — a migration that was never run, or RLS with no
 * matching policy — so each one names the fix rather than echoing the code.
 */
export function describeDbError(
  action: string,
  error: { code?: string; message: string }
): string {
  // The table is missing entirely — the migrations were never applied.
  if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
    return 'A table this app needs is missing. Run supabase/setup.sql in your Supabase SQL Editor, then reload.';
  }
  // A column is missing — the newest migration has not been applied.
  if (error.code === 'PGRST204') {
    return `${error.message}. Run the latest file in supabase/migrations, then reload.`;
  }
  // RLS is on but no policy grants access.
  if (error.code === '42501') {
    return 'The database rejected the request (row level security). Check the policies on planner_blocks.';
  }
  return `Could not ${action}: ${error.message}`;
}

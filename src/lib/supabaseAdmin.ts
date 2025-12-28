import type { SupabaseClient } from '@supabase/supabase-js';

export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!target) return null;

  const perPage = 200;
  const maxPages = 50; // safety

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const found = data.users.find((u) => String(u.email ?? '').toLowerCase() === target);
    if (found?.id) return found.id;

    if (data.users.length < perPage) break;
  }

  return null;
}






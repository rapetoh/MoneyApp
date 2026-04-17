import { supabase } from '../lib/supabase'

export async function seedDefaultCategories(userId: string) {
  // Fetch defaults from the DB — editable in Supabase dashboard without a rebuild
  const { data: defaults } = await supabase
    .from('default_categories')
    .select('name, color, icon')
    .order('sort_order')

  if (!defaults || defaults.length === 0) return

  // Fetch existing category names so we only insert missing ones
  const { data: existing } = await supabase
    .from('categories')
    .select('name_normalized')
    .eq('user_id', userId)

  const existingNames = new Set((existing ?? []).map((c) => c.name_normalized))

  const missing = defaults.filter((cat) => !existingNames.has(cat.name.toLowerCase()))
  if (missing.length === 0) return

  await supabase.from('categories').insert(
    missing.map((cat) => ({
      user_id: userId,
      name: cat.name,
      name_normalized: cat.name.toLowerCase(),
      color: cat.color,
      icon: cat.icon,
    })),
  )
}

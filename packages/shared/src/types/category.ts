export interface Category {
  id: string
  user_id: string
  name: string
  name_normalized: string
  color: string | null
  icon: string | null
  parent_id: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type CategoryInsert = Omit<Category, 'created_at' | 'updated_at'>
export type CategoryUpdate = Partial<CategoryInsert> & { id: string }

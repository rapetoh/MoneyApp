// REGENERATED-FROM packages/shared/src/types/database.types.ts — fix-plan
// item 1.2 ("a typed Supabase client"). Deno Edge Functions deploy only
// this function's own directory tree (no monorepo workspace resolution,
// no import map pointing `@voice-expense/shared` at the real package —
// see `supabase/functions/_shared/recurrence.ts`'s header for the same
// constraint), so the generated `Database` type is vendored here rather
// than imported.
//
// PATCHED, not a byte-for-byte copy: as of this vendoring, the upstream
// file's own header still claims it matches `supabase/migrations/
// 001-016` — it predates migrations 017 (`local_day`) and 020
// (`occurrence_date`, `anchor_day`/`anchor_weekday`/`anchor_time`), both
// of which `generate-recurring/index.ts` writes to on every insert
// (`local_day` is `NOT NULL` with no default — an untyped client masked
// that omission as a silent runtime `23502` on every recurring-generated
// row; see that function's insert call). Search this file for "PATCHED"
// to find the exact columns added beyond the upstream copy. Regenerating
// `packages/shared/src/types/database.types.ts` against the live schema
// (tracked by CI job `db-types`, currently report-only pending a
// provisioned `SUPABASE_ACCESS_TOKEN`) will include these columns
// natively — at that point a fresh copy over this file is a true
// byte-for-byte vendor again and every "PATCHED" block here can be
// deleted.
//
// Whenever `packages/shared/src/types/database.types.ts` is regenerated,
// copy the new file over this one and re-apply any columns this file's
// "PATCHED" markers add that the regeneration doesn't yet cover. If Deno
// ever gains workspace-aware resolution (or this project adds an import
// map), delete this file and import the real one instead.
//
// ============================================================
// GENERATED FILE — do not hand-edit.
//
// Produced by `supabase gen types typescript` against the live schema
// (project ohaqhwampmyoeaopdybd), which matches supabase/migrations/
// 001-016 exactly (verified via `list_migrations` at generation time —
// no drift between the repo's migration files and what's applied).
//
// Regenerate with `packages/shared/scripts/gen-db-types.sh` (needs the
// `supabase` CLI + a `SUPABASE_ACCESS_TOKEN`, never the anon/service key)
// whenever a new migration lands. CI (`.github/workflows/ci.yml`, job
// `db-types`) regenerates and diffs this file on every push so a migration
// that isn't reflected here fails the build instead of drifting silently
// (fix-plan 1.2).
//
// This file is the single source of truth for every table's Row/Insert/
// Update shape. Hand-written domain types in this directory (transaction.ts,
// profile.ts, category.ts, budget.ts, recurring.ts) are now derived from
// here — narrowing the CHECK-constrained `string` columns (codegen can't
// see CHECK constraints, only column types) to the app's literal unions.
// Renaming or removing a column here without updating those files, or any
// query that names it, is a compile error — see
// packages/shared/src/types/__tests__/database.types.test.ts.
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      ai_usage_log: {
        Row: {
          cache_hit: boolean
          call_type: string
          cost_usd_est: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          user_id_hashed: string
        }
        Insert: {
          cache_hit?: boolean
          call_type: string
          cost_usd_est?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          user_id_hashed: string
        }
        Update: {
          cache_hit?: boolean
          call_type?: string
          cost_usd_est?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id_hashed?: string
        }
        Relationships: []
      }
      ask_conversations: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          last_message_at: string
          started_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          last_message_at?: string
          started_at?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          last_message_at?: string
          started_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ask_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          question: string | null
          response: Json | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          question?: string | null
          response?: Json | null
          role: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          question?: string | null
          response?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ask_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'ask_conversations'
            referencedColumns: ['id']
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          period: string
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          period: string
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          period?: string
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          name_normalized: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          name_normalized: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          name_normalized?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      default_categories: {
        Row: {
          color: string
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          color: string
          icon: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      devices: {
        Row: {
          device_name: string | null
          id: string
          last_seen_at: string
          last_synced_at: string | null
          platform: string
          user_id: string
        }
        Insert: {
          device_name?: string | null
          id: string
          last_seen_at?: string
          last_synced_at?: string | null
          platform: string
          user_id: string
        }
        Update: {
          device_name?: string | null
          id?: string
          last_seen_at?: string
          last_synced_at?: string | null
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          analytics_opt_in: boolean
          crash_reports_opt_in: boolean
          created_at: string
          currency_code: string
          display_name: string | null
          id: string
          locale: string
          monthly_income: number | null
          monthly_income_source: string | null
          onboarding_completed_at: string | null
          plus_status: string | null
          timezone: string
          updated_at: string
          voice_language: string
        }
        Insert: {
          analytics_opt_in?: boolean
          crash_reports_opt_in?: boolean
          created_at?: string
          currency_code?: string
          display_name?: string | null
          id: string
          locale?: string
          monthly_income?: number | null
          monthly_income_source?: string | null
          onboarding_completed_at?: string | null
          plus_status?: string | null
          timezone?: string
          updated_at?: string
          voice_language?: string
        }
        Update: {
          analytics_opt_in?: boolean
          crash_reports_opt_in?: boolean
          created_at?: string
          currency_code?: string
          display_name?: string | null
          id?: string
          locale?: string
          monthly_income?: number | null
          monthly_income_source?: string | null
          onboarding_completed_at?: string | null
          plus_status?: string | null
          timezone?: string
          updated_at?: string
          voice_language?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          amount: number
          // PATCHED — migration 020_recurrence_anchors.sql, not yet in the
          // upstream generated file. Nullable: recurrence.ts derives them
          // from starts_at when absent (see that migration's comment).
          anchor_day: number | null
          anchor_time: string | null
          anchor_weekday: number | null
          category_id: string | null
          created_at: string
          currency_code: string
          direction: string
          ends_at: string | null
          frequency: string
          id: string
          interval: number
          is_active: boolean
          last_generated: string | null
          name: string | null
          note: string | null
          payment_method: string | null
          starts_at: string
          template_txn_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          // PATCHED — see Row above.
          anchor_day?: number | null
          anchor_time?: string | null
          anchor_weekday?: number | null
          category_id?: string | null
          created_at?: string
          currency_code?: string
          direction?: string
          ends_at?: string | null
          frequency: string
          id?: string
          interval?: number
          is_active?: boolean
          last_generated?: string | null
          name?: string | null
          note?: string | null
          payment_method?: string | null
          starts_at: string
          template_txn_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          // PATCHED — see Row above.
          anchor_day?: number | null
          anchor_time?: string | null
          anchor_weekday?: number | null
          category_id?: string | null
          created_at?: string
          currency_code?: string
          direction?: string
          ends_at?: string | null
          frequency?: string
          id?: string
          interval?: number
          is_active?: boolean
          last_generated?: string | null
          name?: string | null
          note?: string | null
          payment_method?: string | null
          starts_at?: string
          template_txn_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_template_txn'
            columns: ['template_txn_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurring_rules_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      sync_operations: {
        Row: {
          client_id: string
          client_timestamp: string
          conflict_resolution: string | null
          entity_id: string
          entity_type: string
          id: string
          is_conflict: boolean
          operation: string
          payload: Json
          server_timestamp: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_timestamp: string
          conflict_resolution?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_conflict?: boolean
          operation: string
          payload: Json
          server_timestamp?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_timestamp?: string
          conflict_resolution?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_conflict?: boolean
          operation?: string
          payload?: Json
          server_timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          ai_confidence: number | null
          amount: number
          amount_in_profile_currency: number | null
          category_id: string | null
          client_created_at: string
          client_id: string
          created_at: string
          currency_code: string
          deleted_at: string | null
          direction: string
          fx_rate_date: string | null
          fx_rate_to_profile: number | null
          id: string
          is_deleted: boolean
          is_recurring: boolean
          // PATCHED — migration 017_local_day.sql, not yet in the upstream
          // generated file. NOT NULL, no default: every writer (this
          // function included) must supply it.
          local_day: string
          merchant: string | null
          merchant_domain: string | null
          note: string | null
          // PATCHED — migration 020_recurrence_anchors.sql, not yet in the
          // upstream generated file. Nullable — the explicit recurring-
          // dedup key; NULL for non-recurring rows.
          occurrence_date: string | null
          payment_method: string | null
          raw_transcript: string | null
          recurring_frequency: string | null
          recurring_rule_id: string | null
          source: string
          synced_at: string | null
          transacted_at: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          ai_confidence?: number | null
          amount: number
          amount_in_profile_currency?: number | null
          category_id?: string | null
          client_created_at: string
          client_id: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          direction: string
          fx_rate_date?: string | null
          fx_rate_to_profile?: number | null
          id?: string
          is_deleted?: boolean
          is_recurring?: boolean
          // PATCHED — see Row above. Required (NOT NULL, no default).
          local_day: string
          merchant?: string | null
          merchant_domain?: string | null
          note?: string | null
          // PATCHED — see Row above.
          occurrence_date?: string | null
          payment_method?: string | null
          raw_transcript?: string | null
          recurring_frequency?: string | null
          recurring_rule_id?: string | null
          source: string
          synced_at?: string | null
          transacted_at: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          ai_confidence?: number | null
          amount?: number
          amount_in_profile_currency?: number | null
          category_id?: string | null
          client_created_at?: string
          client_id?: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          direction?: string
          fx_rate_date?: string | null
          fx_rate_to_profile?: number | null
          id?: string
          is_deleted?: boolean
          is_recurring?: boolean
          // PATCHED — see Row above.
          local_day?: string
          merchant?: string | null
          merchant_domain?: string | null
          note?: string | null
          // PATCHED — see Row above.
          occurrence_date?: string | null
          payment_method?: string | null
          raw_transcript?: string | null
          recurring_frequency?: string | null
          recurring_rule_id?: string | null
          source?: string
          synced_at?: string | null
          transacted_at?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'transactions_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_recurring_rule_id_fkey'
            columns: ['recurring_rule_id']
            isOneToOne: false
            referencedRelation: 'recurring_rules'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

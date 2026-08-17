// ============================================================
// GENERATED FILE — do not hand-edit.
//
// Produced by `supabase gen types typescript` against the live schema
// (project ohaqhwampmyoeaopdybd), which matches supabase/migrations/
// 001-023 exactly (regenerated 2026-08-09 immediately after applying
// migrations 017-023 to production: local_day, sync contract +
// sync_upsert_transaction RPC, realtime publication, recurrence anchors +
// occurrence_date, currency_code CHECK, categories.kind, fx-backfill cron).
//
// Hand-updated (not yet regenerated against production) for migration
// 025: recurring_rules.{amount_in_profile_currency,fx_rate_to_profile,
// fx_rate_date} (fix-plan 2.1's FX snapshot columns). Re-run the
// generator once 025 is applied and drop this note.
//
// Also hand-updated (not yet regenerated) for migration 026:
// transactions.snapshot_currency and profiles.monthly_income_currency
// (fix-plan 2.7's re-denomination columns). Re-run the generator once
// 026 is applied and drop this note too.
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
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
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
            foreignKeyName: "ask_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ask_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          client_id: string
          created_at: string
          currency_code: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          period: string
          starts_at: string
          synced_at: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          amount: number
          category_id?: string | null
          client_id: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          period: string
          starts_at?: string
          synced_at?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          amount?: number
          category_id?: string | null
          client_id?: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          period?: string
          starts_at?: string
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          client_id: string
          color: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          is_archived: boolean
          is_deleted: boolean
          kind: string
          name: string
          name_normalized: string
          parent_id: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          client_id: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          kind?: string
          name: string
          name_normalized: string
          parent_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          client_id?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          kind?: string
          name?: string
          name_normalized?: string
          parent_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      default_categories: {
        Row: {
          color: string
          icon: string
          id: string
          kind: string
          name: string
          sort_order: number
        }
        Insert: {
          color: string
          icon: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          icon?: string
          id?: string
          kind?: string
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
          monthly_income_currency: string | null
          monthly_income_source: string | null
          onboarding_completed_at: string | null
          plus_status: string | null
          plus_product_id: string | null
          plus_period_type: string | null
          plus_expires_at: string | null
          plus_will_renew: boolean | null
          plus_store: string | null
          plus_is_sandbox: boolean | null
          plus_synced_at: string | null
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
          monthly_income_currency?: string | null
          monthly_income_source?: string | null
          onboarding_completed_at?: string | null
          plus_status?: string | null
          plus_product_id?: string | null
          plus_period_type?: string | null
          plus_expires_at?: string | null
          plus_will_renew?: boolean | null
          plus_store?: string | null
          plus_is_sandbox?: boolean | null
          plus_synced_at?: string | null
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
          monthly_income_currency?: string | null
          monthly_income_source?: string | null
          onboarding_completed_at?: string | null
          plus_status?: string | null
          plus_product_id?: string | null
          plus_period_type?: string | null
          plus_expires_at?: string | null
          plus_will_renew?: boolean | null
          plus_store?: string | null
          plus_is_sandbox?: boolean | null
          plus_synced_at?: string | null
          timezone?: string
          updated_at?: string
          voice_language?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          amount: number
          amount_in_profile_currency: number | null
          anchor_day: number | null
          anchor_time: string | null
          anchor_weekday: number | null
          category_id: string | null
          client_id: string
          created_at: string
          currency_code: string
          deleted_at: string | null
          direction: string
          ends_at: string | null
          frequency: string
          fx_rate_date: string | null
          fx_rate_to_profile: number | null
          id: string
          interval: number
          is_active: boolean
          is_deleted: boolean
          last_generated: string | null
          name: string | null
          note: string | null
          payment_method: string | null
          starts_at: string
          synced_at: string | null
          template_txn_id: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          amount: number
          amount_in_profile_currency?: number | null
          anchor_day?: number | null
          anchor_time?: string | null
          anchor_weekday?: number | null
          category_id?: string | null
          client_id: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          direction?: string
          ends_at?: string | null
          frequency: string
          fx_rate_date?: string | null
          fx_rate_to_profile?: number | null
          id?: string
          interval?: number
          is_active?: boolean
          is_deleted?: boolean
          last_generated?: string | null
          name?: string | null
          note?: string | null
          payment_method?: string | null
          starts_at: string
          synced_at?: string | null
          template_txn_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          amount?: number
          amount_in_profile_currency?: number | null
          anchor_day?: number | null
          anchor_time?: string | null
          anchor_weekday?: number | null
          category_id?: string | null
          client_id?: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          direction?: string
          ends_at?: string | null
          frequency?: string
          fx_rate_date?: string | null
          fx_rate_to_profile?: number | null
          id?: string
          interval?: number
          is_active?: boolean
          is_deleted?: boolean
          last_generated?: string | null
          name?: string | null
          note?: string | null
          payment_method?: string | null
          starts_at?: string
          synced_at?: string | null
          template_txn_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_template_txn"
            columns: ["template_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
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
          local_day: string
          merchant: string | null
          merchant_domain: string | null
          note: string | null
          occurrence_date: string | null
          payment_method: string | null
          raw_transcript: string | null
          recurring_frequency: string | null
          recurring_rule_id: string | null
          snapshot_currency: string | null
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
          local_day: string
          merchant?: string | null
          merchant_domain?: string | null
          note?: string | null
          occurrence_date?: string | null
          payment_method?: string | null
          raw_transcript?: string | null
          recurring_frequency?: string | null
          recurring_rule_id?: string | null
          snapshot_currency?: string | null
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
          local_day?: string
          merchant?: string | null
          merchant_domain?: string | null
          note?: string | null
          occurrence_date?: string | null
          payment_method?: string | null
          raw_transcript?: string | null
          recurring_frequency?: string | null
          recurring_rule_id?: string | null
          snapshot_currency?: string | null
          source?: string
          synced_at?: string | null
          transacted_at?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      sync_upsert_transaction: {
        Args: { payload: Json }
        Returns: {
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
          local_day: string
          merchant: string | null
          merchant_domain: string | null
          note: string | null
          occurrence_date: string | null
          payment_method: string | null
          raw_transcript: string | null
          recurring_frequency: string | null
          recurring_rule_id: string | null
          snapshot_currency: string | null
          source: string
          synced_at: string | null
          transacted_at: string
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

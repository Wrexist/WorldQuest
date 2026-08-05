/**
 * GENERATED FILE — do not hand-edit.
 *
 * Source: the local stack built from `supabase/migrations`, which is the source of
 * truth. NOT the hosted project — see the note in this script.
 * Regenerate: `pnpm db:types` (needs the Supabase CLI and `pnpm db:start`).
 *
 * Editing this by hand makes the types describe a database that does not exist, which
 * is strictly worse than having no types at all — every call site then compiles
 * against a fiction. The `database` CI job regenerates it and fails on any difference,
 * which is the only thing making that sentence true rather than a request.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      coin_ledger: {
        Row: {
          amount: number
          created_at: string
          id: number
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: number
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: number
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'coin_ledger_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      entitlements: {
        Row: {
          expires_at: string | null
          granted_at: string
          product: string
          rc_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          product: string
          rc_id?: string | null
          source: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          product?: string
          rc_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entitlements_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      inventory: {
        Row: {
          acquired_at: string
          item_id: string
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          item_id: string
          source: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          item_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      lessons: {
        Row: {
          client_version: string | null
          coins_awarded: number
          completed_at: string | null
          correct: number
          hearts_lost: number
          id: string
          items: number
          kind: Database['public']['Enums']['lesson_kind']
          started_at: string
          topic_id: string | null
          user_id: string
          xp_awarded: number
        }
        Insert: {
          client_version?: string | null
          coins_awarded?: number
          completed_at?: string | null
          correct: number
          hearts_lost?: number
          id: string
          items: number
          kind: Database['public']['Enums']['lesson_kind']
          started_at: string
          topic_id?: string | null
          user_id: string
          xp_awarded?: number
        }
        Update: {
          client_version?: string | null
          coins_awarded?: number
          completed_at?: string | null
          correct?: number
          hearts_lost?: number
          id?: string
          items?: number
          kind?: Database['public']['Enums']['lesson_kind']
          started_at?: string
          topic_id?: string | null
          user_id?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_id: string
          birth_year: number | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          handle: string
          id: string
          is_child: boolean
          locale: string
          onboarded_at: string | null
          parent_id: string | null
          role: Database['public']['Enums']['user_role']
          timezone: string
        }
        Insert: {
          avatar_id?: string
          birth_year?: number | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          handle: string
          id: string
          is_child?: boolean
          locale?: string
          onboarded_at?: string | null
          parent_id?: string | null
          role?: Database['public']['Enums']['user_role']
          timezone?: string
        }
        Update: {
          avatar_id?: string
          birth_year?: number | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          handle?: string
          id?: string
          is_child?: boolean
          locale?: string
          onboarded_at?: string | null
          parent_id?: string | null
          role?: Database['public']['Enums']['user_role']
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      review_log: {
        Row: {
          created_at: string
          elapsed_ms: number
          fact_id: string
          id: number
          lesson_id: string | null
          rating: number
          template_id: string
          user_id: string
          was_correct: boolean
        }
        Insert: {
          created_at?: string
          elapsed_ms: number
          fact_id: string
          id?: number
          lesson_id?: string | null
          rating: number
          template_id: string
          user_id: string
          was_correct: boolean
        }
        Update: {
          created_at?: string
          elapsed_ms?: number
          fact_id?: string
          id?: number
          lesson_id?: string | null
          rating?: number
          template_id?: string
          user_id?: string
          was_correct?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'review_log_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      shop_items: {
        Row: {
          item_id: string
          kind: string
          price: number
        }
        Insert: {
          item_id: string
          kind: string
          price: number
        }
        Update: {
          item_id?: string
          kind?: string
          price?: number
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current: number
          freeze_used_on: string | null
          freezes_held: number
          last_active_date: string | null
          last_repair_at: string | null
          longest: number
          repair_available_until: string | null
          user_id: string
        }
        Insert: {
          current?: number
          freeze_used_on?: string | null
          freezes_held?: number
          last_active_date?: string | null
          last_repair_at?: string | null
          longest?: number
          repair_available_until?: string | null
          user_id: string
        }
        Update: {
          current?: number
          freeze_used_on?: string | null
          freezes_held?: number
          last_active_date?: string | null
          last_repair_at?: string | null
          longest?: number
          repair_available_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'streaks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      subscription_events: {
        Row: {
          id: number
          kind: string
          notification_id: string
          payload: Json
          platform: string
          received_at: string
          status_after:
            | Database['public']['Enums']['subscription_status']
            | null
          user_id: string | null
        }
        Insert: {
          id?: number
          kind: string
          notification_id: string
          payload: Json
          platform: string
          received_at?: string
          status_after?:
            | Database['public']['Enums']['subscription_status']
            | null
          user_id?: string | null
        }
        Update: {
          id?: number
          kind?: string
          notification_id?: string
          payload?: Json
          platform?: string
          received_at?: string
          status_after?:
            | Database['public']['Enums']['subscription_status']
            | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'subscription_events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          environment: string
          expires_at: string | null
          has_used_trial: boolean
          notified_at: string | null
          platform: string | null
          product_id: string | null
          status: Database['public']['Enums']['subscription_status']
          store_ref: string | null
          tier: Database['public']['Enums']['plan_tier']
          updated_at: string
          user_id: string
          will_renew: boolean
        }
        Insert: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          has_used_trial?: boolean
          notified_at?: string | null
          platform?: string | null
          product_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          store_ref?: string | null
          tier?: Database['public']['Enums']['plan_tier']
          updated_at?: string
          user_id: string
          will_renew?: boolean
        }
        Update: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          has_used_trial?: boolean
          notified_at?: string | null
          platform?: string | null
          product_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          store_ref?: string | null
          tier?: Database['public']['Enums']['plan_tier']
          updated_at?: string
          user_id?: string
          will_renew?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      user_facts: {
        Row: {
          avg_ms: number | null
          difficulty: number
          due_at: string
          fact_id: string
          lapses: number
          last_review_at: string | null
          mastery: Database['public']['Enums']['mastery_level']
          reps: number
          stability: number
          suspended: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_ms?: number | null
          difficulty: number
          due_at: string
          fact_id: string
          lapses?: number
          last_review_at?: string | null
          mastery?: Database['public']['Enums']['mastery_level']
          reps?: number
          stability: number
          suspended?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_ms?: number | null
          difficulty?: number
          due_at?: string
          fact_id?: string
          lapses?: number
          last_review_at?: string | null
          mastery?: Database['public']['Enums']['mastery_level']
          reps?: number
          stability?: number
          suspended?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_facts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      wallets: {
        Row: {
          coins: number
          gems: number
          hearts: number
          hearts_updated_at: string
          updated_at: string
          user_id: string
          xp_total: number
        }
        Insert: {
          coins?: number
          gems?: number
          hearts?: number
          hearts_updated_at?: string
          updated_at?: string
          user_id: string
          xp_total?: number
        }
        Update: {
          coins?: number
          gems?: number
          hearts?: number
          hearts_updated_at?: string
          updated_at?: string
          user_id?: string
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: 'wallets_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      xp_ledger: {
        Row: {
          amount: number
          created_at: string
          id: number
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: number
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: number
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'xp_ledger_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      purchase_freeze: {
        Args: {
          p_price?: number
        }
        Returns: Json
      }
      purchase_item: {
        Args: {
          p_item_id: string
        }
        Returns: Json
      }
      record_lesson: {
        Args: {
          p_client_version: string
          p_coins: number
          p_correct: number
          p_facts: Json
          p_hearts_lost?: number
          p_items: number
          p_kind: Database['public']['Enums']['lesson_kind']
          p_lesson_id: string
          p_max_per_hour: number
          p_reviews: Json
          p_started_at: string
          p_streak: Json
          p_streak_coins?: number
          p_streak_xp?: number
          p_topic_id: string
          p_user_id: string
          p_xp: number
        }
        Returns: Json
      }
      record_subscription_event: {
        Args: {
          p_kind: string
          p_notification_id: string
          p_payload: Json
          p_platform: string
          p_store_ref?: string
          p_subscription?: Json
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      lesson_kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
      mastery_level:
        | 'unseen'
        | 'learning'
        | 'familiar'
        | 'proficient'
        | 'mastered'
        | 'burnished'
      plan_tier: 'free' | 'premium' | 'family'
      subscription_status:
        | 'none'
        | 'trialing'
        | 'active'
        | 'in_grace'
        | 'on_hold'
        | 'expired'
      user_role:
        | 'guest'
        | 'user'
        | 'premium'
        | 'teacher'
        | 'parent'
        | 'admin'
        | 'moderator'
        | 'support'
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      lesson_kind: ['lesson', 'quest', 'review', 'challenge', 'event'],
      mastery_level: [
        'unseen',
        'learning',
        'familiar',
        'proficient',
        'mastered',
        'burnished',
      ],
      plan_tier: ['free', 'premium', 'family'],
      subscription_status: [
        'none',
        'trialing',
        'active',
        'in_grace',
        'on_hold',
        'expired',
      ],
      user_role: [
        'guest',
        'user',
        'premium',
        'teacher',
        'parent',
        'admin',
        'moderator',
        'support',
      ],
    },
  },
} as const

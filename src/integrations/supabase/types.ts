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
      cached_briefings: {
        Row: {
          fetched_at: string
          matchup_key: string
          payload: Json
        }
        Insert: {
          fetched_at?: string
          matchup_key: string
          payload: Json
        }
        Update: {
          fetched_at?: string
          matchup_key?: string
          payload?: Json
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_log: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          route: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message: string
          route?: string | null
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      fallback_events: {
        Row: {
          away_team: string
          created_at: string
          field_name: string
          game_id: string | null
          home_team: string
          id: string
          matchup: string
          source: string | null
          status: string
          team_side: string
        }
        Insert: {
          away_team: string
          created_at?: string
          field_name: string
          game_id?: string | null
          home_team: string
          id?: string
          matchup: string
          source?: string | null
          status: string
          team_side: string
        }
        Update: {
          away_team?: string
          created_at?: string
          field_name?: string
          game_id?: string | null
          home_team?: string
          id?: string
          matchup?: string
          source?: string | null
          status?: string
          team_side?: string
        }
        Relationships: []
      }
      game_events_cache: {
        Row: {
          fetched_at: string
          game_id: string
          parsed: Json
          season: string
        }
        Insert: {
          fetched_at?: string
          game_id: string
          parsed: Json
          season: string
        }
        Update: {
          fetched_at?: string
          game_id?: string
          parsed?: Json
          season?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          favorite_team: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          favorite_team?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          favorite_team?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scrape_metrics: {
        Row: {
          cache_hit: boolean
          context: Json | null
          endpoint: string
          error: string | null
          fetched_at: string
          id: string
          latency_ms: number
          season: string | null
          status: string
        }
        Insert: {
          cache_hit?: boolean
          context?: Json | null
          endpoint: string
          error?: string | null
          fetched_at?: string
          id?: string
          latency_ms: number
          season?: string | null
          status: string
        }
        Update: {
          cache_hit?: boolean
          context?: Json | null
          endpoint?: string
          error?: string | null
          fetched_at?: string
          id?: string
          latency_ms?: number
          season?: string | null
          status?: string
        }
        Relationships: []
      }
      season_check_meta: {
        Row: {
          id: number
          last_checked_at: string | null
          last_error: string | null
          last_status: string | null
        }
        Insert: {
          id: number
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: string | null
        }
        Update: {
          id?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: string | null
        }
        Relationships: []
      }
      season_detections: {
        Row: {
          competition_id: string
          detected_at: string
          id: string
          label: string | null
          resolved_at: string | null
          source_url: string | null
          status: string
        }
        Insert: {
          competition_id: string
          detected_at?: string
          id?: string
          label?: string | null
          resolved_at?: string | null
          source_url?: string | null
          status?: string
        }
        Update: {
          competition_id?: string
          detected_at?: string
          id?: string
          label?: string | null
          resolved_at?: string | null
          source_url?: string | null
          status?: string
        }
        Relationships: []
      }
      season_overrides: {
        Row: {
          competition_id: string
          created_at: string
          label: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          label: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_logo_codes: {
        Row: {
          created_at: string
          id: number
          logo_code: string
          source: string
          team_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          logo_code: string
          source?: string
          team_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          logo_code?: string
          source?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_logos: {
        Row: {
          fetched_at: string
          logo_url: string | null
          source: string | null
          status: string
          team_name: string
        }
        Insert: {
          fetched_at?: string
          logo_url?: string | null
          source?: string | null
          status?: string
          team_name: string
        }
        Update: {
          fetched_at?: string
          logo_url?: string | null
          source?: string | null
          status?: string
          team_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vmix_lineup_presets: {
        Row: {
          away_slots: Json
          away_team: string
          created_at: string
          home_slots: Json
          home_team: string
          id: number
          label: string
        }
        Insert: {
          away_slots: Json
          away_team: string
          created_at?: string
          home_slots: Json
          home_team: string
          id?: number
          label: string
        }
        Update: {
          away_slots?: Json
          away_team?: string
          created_at?: string
          home_slots?: Json
          home_team?: string
          id?: number
          label?: string
        }
        Relationships: []
      }
      vmix_publications: {
        Row: {
          away_slots: Json
          away_team: string
          away_team_code: string
          game_date: string | null
          home_slots: Json
          home_team: string
          home_team_code: string
          id: string
          is_active: boolean
          notes: string | null
          published_at: string
          published_by: string | null
          standings_json: Json
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_slots?: Json
          away_team: string
          away_team_code?: string
          game_date?: string | null
          home_slots?: Json
          home_team: string
          home_team_code?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string
          published_by?: string | null
          standings_json?: Json
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_slots?: Json
          away_team?: string
          away_team_code?: string
          game_date?: string | null
          home_slots?: Json
          home_team?: string
          home_team_code?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string
          published_by?: string | null
          standings_json?: Json
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cache_team_logo: {
        Args: { _status: string; _team: string; _url: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

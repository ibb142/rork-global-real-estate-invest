/* eslint-disable */
// AUTO-GENERATED — DO NOT EDIT
// Run migrations to regenerate.

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
      developer_proof_ledger: {
        Row: {
          action_type: string
          chat_message_id: string | null
          commit_match: boolean
          commit_sha: string | null
          commit_url: string | null
          completed_at: string | null
          created_at: string
          deployed_commit: string | null
          files_changed: Json
          final_status: string
          git_diff_summary: string | null
          live_http_status: number | null
          live_response_snippet: string | null
          live_url_tested: string | null
          render_deploy_id: string | null
          render_deploy_status: string | null
          requested_by: string
          task_id: string
          test_result: string | null
          tests_run: Json | null
          typecheck_result: string | null
        }
        Insert: {
          action_type?: string
          chat_message_id?: string | null
          commit_match?: boolean
          commit_sha?: string | null
          commit_url?: string | null
          completed_at?: string | null
          created_at?: string
          deployed_commit?: string | null
          files_changed?: Json
          final_status?: string
          git_diff_summary?: string | null
          live_http_status?: number | null
          live_response_snippet?: string | null
          live_url_tested?: string | null
          render_deploy_id?: string | null
          render_deploy_status?: string | null
          requested_by?: string
          task_id: string
          test_result?: string | null
          tests_run?: Json | null
          typecheck_result?: string | null
        }
        Update: {
          action_type?: string
          chat_message_id?: string | null
          commit_match?: boolean
          commit_sha?: string | null
          commit_url?: string | null
          completed_at?: string | null
          created_at?: string
          deployed_commit?: string | null
          files_changed?: Json
          final_status?: string
          git_diff_summary?: string | null
          live_http_status?: number | null
          live_response_snippet?: string | null
          live_url_tested?: string | null
          render_deploy_id?: string | null
          render_deploy_status?: string | null
          requested_by?: string
          task_id?: string
          test_result?: string | null
          tests_run?: Json | null
          typecheck_result?: string | null
        }
        Relationships: []
      }
      investors: {
        Row: {
          accreditation: string | null
          capital_committed: number
          capital_deployed: number
          created_at: string
          email: string
          full_name: string
          id: string
          investment_tier: string | null
          metadata: Json
          phone: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          accreditation?: string | null
          capital_committed?: number
          capital_deployed?: number
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          investment_tier?: string | null
          metadata?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          accreditation?: string | null
          capital_committed?: number
          capital_deployed?: number
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          investment_tier?: string | null
          metadata?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      lenders: {
        Row: {
          approval_status: string
          created_at: string
          id: string
          interest_rate: number
          lender_name: string
          lender_type: string
          loan_size_max: number
          loan_size_min: number
          ltv_max: number
          markets: Json
          metadata: Json
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          id?: string
          interest_rate?: number
          lender_name?: string
          lender_type?: string
          loan_size_max?: number
          loan_size_min?: number
          ltv_max?: number
          markets?: Json
          metadata?: Json
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          id?: string
          interest_rate?: number
          lender_name?: string
          lender_type?: string
          loan_size_max?: number
          loan_size_min?: number
          ltv_max?: number
          markets?: Json
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      revenue: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          deal_id: string | null
          id: string
          metadata: Json
          period: string
          property_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          deal_id?: string | null
          id?: string
          metadata?: Json
          period?: string
          property_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          deal_id?: string | null
          id?: string
          metadata?: Json
          period?: string
          property_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      candidates: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          gaps: string[]
          id: string
          invite_status: string
          job_id: string
          match_score: number
          match_summary: string
          radar_results: Json
          resume_id: string
          strengths: string[]
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          gaps?: string[]
          id?: string
          invite_status?: string
          job_id: string
          match_score: number
          match_summary: string
          radar_results?: Json
          resume_id: string
          strengths?: string[]
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          gaps?: string[]
          id?: string
          invite_status?: string
          job_id?: string
          match_score?: number
          match_summary?: string
          radar_results?: Json
          resume_id?: string
          strengths?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_resume_same_job_fkey"
            columns: ["resume_id", "job_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id", "job_id"]
          },
        ]
      }
      invitations: {
        Row: {
          approved_at: string
          approved_by: string
          candidate_id: string
          error: string | null
          id: string
          message_id: string | null
          sent_at: string | null
          sent_to: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          candidate_id: string
          error?: string | null
          id?: string
          message_id?: string | null
          sent_at?: string | null
          sent_to: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          candidate_id?: string
          error?: string | null
          id?: string
          message_id?: string | null
          sent_at?: string | null
          sent_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          description: string
          id: string
          invite_threshold: number
          status: string
          title: string
          top_talent_threshold: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invite_threshold?: number
          status?: string
          title: string
          top_talent_threshold?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invite_threshold?: number
          status?: string
          title?: string
          top_talent_threshold?: number
        }
        Relationships: []
      }
      resumes: {
        Row: {
          ats_override: boolean
          ats_reasons: string[]
          ats_score: number | null
          ats_status: string | null
          created_at: string
          extracted_text: string | null
          file_name: string
          id: string
          job_id: string
          run_id: string | null
          status: string
          storage_path: string
        }
        Insert: {
          ats_override?: boolean
          ats_reasons?: string[]
          ats_score?: number | null
          ats_status?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name: string
          id?: string
          job_id: string
          run_id?: string | null
          status?: string
          storage_path: string
        }
        Update: {
          ats_override?: boolean
          ats_reasons?: string[]
          ats_score?: number | null
          ats_status?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          id?: string
          job_id?: string
          run_id?: string | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

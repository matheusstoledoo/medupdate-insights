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
      artigos: {
        Row: {
          alt_a: string | null
          alt_b: string | null
          alt_c: string | null
          alt_d: string | null
          analise_metodologica: string | null
          ano: number | null
          citacoes: number | null
          conflitos_interesse: string | null
          contexto_vs_anterior: string | null
          created_at: string | null
          data_publicacao: string | null
          especialidade: string | null
          feedback_quiz: string | null
          grade: string | null
          grade_justificativa: string | null
          id: string
          journal: string | null
          limitacoes_autores: string | null
          link_original: string | null
          pmid: string | null
          questao: string | null
          resposta_correta: string | null
          resumo_pt: string | null
          rob_resultado: string | null
          score_relevancia: number | null
          tem_texto_completo: boolean | null
          tipo_estudo: string | null
          titulo: string
          url_texto_completo: string | null
          vieses_detalhados: string | null
        }
        Insert: {
          alt_a?: string | null
          alt_b?: string | null
          alt_c?: string | null
          alt_d?: string | null
          analise_metodologica?: string | null
          ano?: number | null
          citacoes?: number | null
          conflitos_interesse?: string | null
          contexto_vs_anterior?: string | null
          created_at?: string | null
          data_publicacao?: string | null
          especialidade?: string | null
          feedback_quiz?: string | null
          grade?: string | null
          grade_justificativa?: string | null
          id?: string
          journal?: string | null
          limitacoes_autores?: string | null
          link_original?: string | null
          pmid?: string | null
          questao?: string | null
          resposta_correta?: string | null
          resumo_pt?: string | null
          rob_resultado?: string | null
          score_relevancia?: number | null
          tem_texto_completo?: boolean | null
          tipo_estudo?: string | null
          titulo: string
          url_texto_completo?: string | null
          vieses_detalhados?: string | null
        }
        Update: {
          alt_a?: string | null
          alt_b?: string | null
          alt_c?: string | null
          alt_d?: string | null
          analise_metodologica?: string | null
          ano?: number | null
          citacoes?: number | null
          conflitos_interesse?: string | null
          contexto_vs_anterior?: string | null
          created_at?: string | null
          data_publicacao?: string | null
          especialidade?: string | null
          feedback_quiz?: string | null
          grade?: string | null
          grade_justificativa?: string | null
          id?: string
          journal?: string | null
          limitacoes_autores?: string | null
          link_original?: string | null
          pmid?: string | null
          questao?: string | null
          resposta_correta?: string | null
          resumo_pt?: string | null
          rob_resultado?: string | null
          score_relevancia?: number | null
          tem_texto_completo?: boolean | null
          tipo_estudo?: string | null
          titulo?: string
          url_texto_completo?: string | null
          vieses_detalhados?: string | null
        }
        Relationships: []
      }
      progresso: {
        Row: {
          acertou: boolean | null
          artigo_id: string
          created_at: string | null
          data_resposta: string | null
          id: string
          proxima_revisao: string | null
          respondeu: boolean | null
          usuario_id: string
          vezes_revisado: number | null
        }
        Insert: {
          acertou?: boolean | null
          artigo_id: string
          created_at?: string | null
          data_resposta?: string | null
          id?: string
          proxima_revisao?: string | null
          respondeu?: boolean | null
          usuario_id: string
          vezes_revisado?: number | null
        }
        Update: {
          acertou?: boolean | null
          artigo_id?: string
          created_at?: string | null
          data_resposta?: string | null
          id?: string
          proxima_revisao?: string | null
          respondeu?: boolean | null
          usuario_id?: string
          vezes_revisado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progresso_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "artigos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progresso_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          created_at: string | null
          id: string
          streak_atual: number | null
          streak_maximo: number | null
          total_questoes_respondidas: number | null
          ultimo_dia_ativo: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          streak_atual?: number | null
          streak_maximo?: number | null
          total_questoes_respondidas?: number | null
          ultimo_dia_ativo?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          streak_atual?: number | null
          streak_maximo?: number | null
          total_questoes_respondidas?: number | null
          ultimo_dia_ativo?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "streaks_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          created_at: string | null
          email: string | null
          especialidade: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          especialidade?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_streak: { Args: { p_usuario_id: string }; Returns: undefined }
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

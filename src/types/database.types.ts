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
      app_config: {
        Row: {
          id: string
          opening_balances_locked: boolean
          updated_at: string | null
        }
        Insert: {
          id?: string
          opening_balances_locked?: boolean
          updated_at?: string | null
        }
        Update: {
          id?: string
          opening_balances_locked?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          created_at: string | null
          deletion_reason: string | null
          id: string
          old_data: Json | null
          operation_type: string
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deletion_reason?: string | null
          id?: string
          old_data?: Json | null
          operation_type: string
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deletion_reason?: string | null
          id?: string
          old_data?: Json | null
          operation_type?: string
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_product_prices: {
        Row: {
          branch_product_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          price: number
          start_date: string
        }
        Insert: {
          branch_product_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          price: number
          start_date: string
        }
        Update: {
          branch_product_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          price?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_product_prices_branch_product_id_fkey"
            columns: ["branch_product_id"]
            isOneToOne: false
            referencedRelation: "branch_products"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_products: {
        Row: {
          branch_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          product_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          product_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string | null
          current_balance: number | null
          district_id: string | null
          id: string
          is_active: boolean | null
          name: string
          opening_balance: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_balance?: number | null
          district_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          opening_balance?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_balance?: number | null
          district_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          opening_balance?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          branch_id: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          idempotency_key: string | null
          total_sales_amount: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          idempotency_key?: string | null
          total_sales_amount: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          idempotency_key?: string | null
          total_sales_amount?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          created_at: string | null
          delivered_quantity: number
          delivery_id: string | null
          id: string
          net_quantity: number | null
          product_id: string | null
          returned_quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          delivered_quantity: number
          delivery_id?: string | null
          id?: string
          net_quantity?: number | null
          product_id?: string | null
          returned_quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          delivered_quantity?: number
          delivery_id?: string | null
          id?: string
          net_quantity?: number | null
          product_id?: string | null
          returned_quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          city_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          city_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "districts_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          delivery_id: string | null
          id: string
          payment_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string | null
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          delivery_id?: string | null
          id?: string
          payment_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          delivery_id?: string | null
          id?: string
          payment_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          created_at: string | null
          default_price: number
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          default_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          default_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          role: string
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          role: string
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          role?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _summary_range: {
        Args: { p_range: string }
        Returns: {
          end_date: string
          granularity: string
          start_date: string
        }[]
      }
      activate_branch_product: {
        Args: {
          p_branch_id: string
          p_effective_from: string
          p_new_price: number
          p_product_id: string
        }
        Returns: string
      }
      create_branch: {
        Args: {
          p_district_id: string
          p_is_active: boolean
          p_name: string
          p_opening_balance: number
          p_products?: Json
        }
        Returns: string
      }
      create_catalog_product: {
        Args: { p_default_price: number; p_image_url?: string; p_name: string }
        Returns: string
      }
      create_city: { Args: { p_name: string }; Returns: string }
      create_delivery_atomic:
        | {
            Args: {
              p_branch_id: string
              p_date: string
              p_items: Json
              p_payment_amount: number
              p_payment_type: string
            }
            Returns: string
          }
        | {
            Args: {
              p_branch_id: string
              p_date: string
              p_idempotency_key: string
              p_items: Json
              p_payment_amount: number
              p_payment_type: string
            }
            Returns: string
          }
      create_district: {
        Args: { p_city_id: string; p_name: string }
        Returns: string
      }
      get_branch_balance: { Args: { p_branch_id: string }; Returns: number }
      get_branch_hub_details: { Args: { p_branch_id: string }; Returns: Json }
      get_effective_price: {
        Args: { p_branch_product_id: string; p_date: string }
        Returns: number
      }
      get_opening_balances_locked: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      list_branch_products_with_status: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      list_branches_analytics: {
        Args: {
          p_city_id?: string
          p_date_from?: string
          p_date_to?: string
          p_days_of_week?: number[]
          p_district_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: Json
      }
      list_branches_with_context: {
        Args: { p_district_id: string }
        Returns: Json
      }
      list_catalog_products: {
        Args: { p_include_archived?: boolean }
        Returns: Json
      }
      list_cities_with_counts: { Args: never; Returns: Json }
      list_deliveries_with_payments: {
        Args: { p_branch_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_districts_with_counts: { Args: { p_city_id: string }; Returns: Json }
      log_audit: {
        Args: {
          p_deletion_reason?: string
          p_old_data?: Json
          p_operation_type: string
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
      }
      recalculate_branch_balance: {
        Args: { p_branch_id: string }
        Returns: number
      }
      record_manual_payment_atomic: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_date: string
          p_payment_type: string
        }
        Returns: string
      }
      report_branch_distribution: {
        Args: { p_limit?: number; p_range: string }
        Returns: Json
      }
      report_branch_hub_pdf: {
        Args: {
          p_branch_id: string
          p_date_from?: string
          p_date_to?: string
          p_days_of_week?: number[]
          p_product_ids?: string[]
        }
        Returns: Json
      }
      report_branch_income: {
        Args: { p_limit?: number; p_range: string }
        Returns: Json
      }
      report_branch_return_rate: {
        Args: { p_limit?: number; p_range: string }
        Returns: Json
      }
      report_branches_pdf: {
        Args: {
          p_city_id?: string
          p_date_from?: string
          p_date_to?: string
          p_days_of_week?: number[]
          p_district_id?: string
          p_product_ids?: string[]
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: Json
      }
      report_daily_series: { Args: { p_range: string }; Returns: Json }
      report_kpis: { Args: { p_range: string }; Returns: Json }
      report_product_distribution: {
        Args: { p_limit?: number; p_range: string }
        Returns: Json
      }
      report_summary_pdf: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_days_of_week?: number[]
          p_range?: string
        }
        Returns: Json
      }
      set_branch_active: {
        Args: { p_branch_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_branch_product_active: {
        Args: { p_branch_product_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_branch_product_price_atomic: {
        Args: {
          p_branch_product_id: string
          p_effective_from: string
          p_new_price: number
        }
        Returns: undefined
      }
      set_catalog_product_archived: {
        Args: { p_archived: boolean; p_product_id: string }
        Returns: undefined
      }
      set_catalog_product_default_price: {
        Args: { p_default_price: number; p_product_id: string }
        Returns: undefined
      }
      set_city_active: {
        Args: { p_city_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_district_active: {
        Args: { p_district_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_opening_balances_locked: {
        Args: { p_locked: boolean }
        Returns: undefined
      }
      soft_delete_delivery_atomic: {
        Args: { p_deletion_reason: string; p_delivery_id: string }
        Returns: undefined
      }
      update_delivery_atomic: {
        Args: { p_date: string; p_delivery_id: string; p_items: Json }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

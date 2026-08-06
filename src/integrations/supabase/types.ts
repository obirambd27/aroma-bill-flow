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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bill_items: {
        Row: {
          bill_id: string
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          bill_id: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          bill_id?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string
          bill_number: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          is_taxed: boolean
          payment_method: string | null
          payment_status: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total_amount: number
          warehouse_id: string | null
        }
        Insert: {
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          payment_method?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          warehouse_id?: string | null
        }
        Update: {
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          payment_method?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          last_purchase_at: string | null
          name: string
          phone: string | null
          total_spend: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_purchase_at?: string | null
          name: string
          phone?: string | null
          total_spend?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_purchase_at?: string | null
          name?: string
          phone?: string | null
          total_spend?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bill_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          payment_date: string
          payment_method: string | null
          status: string
        }
        Insert: {
          amount?: number
          bill_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payment_date?: string
          payment_method?: string | null
          status?: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payment_date?: string
          payment_method?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          committed_stock: number
          created_at: string
          id: string
          product_id: string
          stock_on_hand: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          committed_stock?: number
          created_at?: string
          id?: string
          product_id: string
          stock_on_hand?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          committed_stock?: number
          created_at?: string
          id?: string
          product_id?: string
          stock_on_hand?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          additional_images: string[]
          brand: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number | null
          name: string
          opening_stock_note: number | null
          price: number
          sku: string | null
          unit: string
        }
        Insert: {
          additional_images?: string[]
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          name: string
          opening_stock_note?: number | null
          price?: number
          sku?: string | null
          unit?: string
        }
        Update: {
          additional_images?: string[]
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          name?: string
          opening_stock_note?: number | null
          price?: number
          sku?: string | null
          unit?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          business_address: string
          business_email: string
          business_logo_url: string | null
          business_name: string
          business_phone: string
          created_at: string
          default_tax_rate: number
          id: string
          invoice_footer_note: string | null
          invoice_prefix: string
          low_stock_threshold: number
          tax_id: string | null
        }
        Insert: {
          business_address?: string
          business_email?: string
          business_logo_url?: string | null
          business_name?: string
          business_phone?: string
          created_at?: string
          default_tax_rate?: number
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix?: string
          low_stock_threshold?: number
          tax_id?: string | null
        }
        Update: {
          business_address?: string
          business_email?: string
          business_logo_url?: string | null
          business_name?: string
          business_phone?: string
          created_at?: string
          default_tax_rate?: number
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix?: string
          low_stock_threshold?: number
          tax_id?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          product_id: string
          quantity_change: number
          reason: string | null
          related_bill_id: string | null
          related_purchase_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          product_id: string
          quantity_change?: number
          reason?: string | null
          related_bill_id?: string | null
          related_purchase_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          product_id?: string
          quantity_change?: number
          reason?: string | null
          related_bill_id?: string | null
          related_purchase_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_related_bill_id_fkey"
            columns: ["related_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          from_warehouse_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          to_warehouse_id: string
        }
        Insert: {
          created_at?: string
          from_warehouse_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          to_warehouse_id: string
        }
        Update: {
          created_at?: string
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          to_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
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

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
      accounts: {
        Row: {
          account_number: string | null
          account_type: string
          bank_name: string | null
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      bill_delete_log: {
        Row: {
          bill_date: string | null
          bill_id: string | null
          bill_number: string | null
          created_at: string
          customer_name: string | null
          deleted_at: string
          id: string
          reason: string | null
          snapshot: Json
          total_amount: number
        }
        Insert: {
          bill_date?: string | null
          bill_id?: string | null
          bill_number?: string | null
          created_at?: string
          customer_name?: string | null
          deleted_at?: string
          id?: string
          reason?: string | null
          snapshot?: Json
          total_amount?: number
        }
        Update: {
          bill_date?: string | null
          bill_id?: string | null
          bill_number?: string | null
          created_at?: string
          customer_name?: string | null
          deleted_at?: string
          id?: string
          reason?: string | null
          snapshot?: Json
          total_amount?: number
        }
        Relationships: []
      }
      bill_edit_history: {
        Row: {
          bill_id: string
          changes_summary: Json
          created_at: string
          edited_at: string
          edited_fields: string[]
          id: string
        }
        Insert: {
          bill_id: string
          changes_summary?: Json
          created_at?: string
          edited_at?: string
          edited_fields?: string[]
          id?: string
        }
        Update: {
          bill_id?: string
          changes_summary?: Json
          created_at?: string
          edited_at?: string
          edited_fields?: string[]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_edit_history_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          cost_price_snapshot: number | null
          id: string
          item_note: string | null
          line_total: number
          pending_quantity: number
          pending_resolved_at: string | null
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          bill_id: string
          cost_price_snapshot?: number | null
          id?: string
          item_note?: string | null
          line_total?: number
          pending_quantity?: number
          pending_resolved_at?: string | null
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          bill_id?: string
          cost_price_snapshot?: number | null
          id?: string
          item_note?: string | null
          line_total?: number
          pending_quantity?: number
          pending_resolved_at?: string | null
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
          amount_paid: number
          bill_date: string
          bill_number: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          is_taxed: boolean
          is_walk_in: boolean
          notes: string | null
          payment_method: string | null
          payment_status: string
          sales_order_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total_amount: number
          warehouse_id: string | null
        }
        Insert: {
          amount_paid?: number
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          is_walk_in?: boolean
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          sales_order_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          warehouse_id?: string | null
        }
        Update: {
          amount_paid?: number
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          is_walk_in?: boolean
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          sales_order_id?: string | null
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
            foreignKeyName: "bills_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
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
      cheques: {
        Row: {
          account_id: string
          amount: number
          cheque_date: string
          cheque_number: string
          created_at: string
          id: string
          notes: string | null
          party_name: string
          related_bill_id: string | null
          related_purchase_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          cheque_date?: string
          cheque_number: string
          created_at?: string
          id?: string
          notes?: string | null
          party_name: string
          related_bill_id?: string | null
          related_purchase_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          cheque_date?: string
          cheque_number?: string
          created_at?: string
          id?: string
          notes?: string | null
          party_name?: string
          related_bill_id?: string | null
          related_purchase_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheques_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_purchase_fk"
            columns: ["related_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_related_bill_id_fkey"
            columns: ["related_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_applications: {
        Row: {
          amount_applied: number
          applied_date: string
          bill_id: string
          created_at: string
          credit_note_id: string
          id: string
        }
        Insert: {
          amount_applied?: number
          applied_date?: string
          bill_id: string
          created_at?: string
          credit_note_id: string
          id?: string
        }
        Update: {
          amount_applied?: number
          applied_date?: string
          bill_id?: string
          created_at?: string
          credit_note_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_applications_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_applications_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_items: {
        Row: {
          credit_note_id: string
          description: string
          id: string
          line_total: number
          product_id: string | null
          quantity: number | null
          unit_price: number
        }
        Insert: {
          credit_note_id: string
          description: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number | null
          unit_price?: number
        }
        Update: {
          credit_note_id?: string
          description?: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount_applied: number
          created_at: string
          credit_note_date: string
          credit_note_number: string | null
          customer_id: string | null
          id: string
          reason: string | null
          sales_return_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_applied?: number
          created_at?: string
          credit_note_date?: string
          credit_note_number?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          sales_return_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_applied?: number
          created_at?: string
          credit_note_date?: string
          credit_note_number?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          sales_return_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activities: {
        Row: {
          activity_type: string
          content: string
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          activity_type?: string
          content: string
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          activity_type?: string
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reminders: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string
          due_date: string
          id: string
          is_completed: boolean
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id: string
          due_date: string
          id?: string
          is_completed?: boolean
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          due_date?: string
          id?: string
          is_completed?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_assignments: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          anniversary_date: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          id: string
          is_active: boolean
          last_purchase_at: string | null
          name: string
          notes: string | null
          phone: string | null
          total_spend: number
        }
        Insert: {
          address?: string | null
          anniversary_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_purchase_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          total_spend?: number
        }
        Update: {
          address?: string | null
          anniversary_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_purchase_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          total_spend?: number
        }
        Relationships: []
      }
      day_book_overrides: {
        Row: {
          book_date: string
          created_at: string
          id: string
          opening_cash: number
          updated_at: string
        }
        Insert: {
          book_date: string
          created_at?: string
          id?: string
          opening_cash?: number
          updated_at?: string
        }
        Update: {
          book_date?: string
          created_at?: string
          id?: string
          opening_cash?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          carton_bag_count: string | null
          delivery_note_id: string
          id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
        }
        Insert: {
          carton_bag_count?: string | null
          delivery_note_id: string
          id?: string
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
        }
        Update: {
          carton_bag_count?: string | null
          delivery_note_id?: string
          id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          advance_amount: number | null
          balance_amount: number | null
          bill_id: string | null
          buyer_address: string | null
          buyer_name: string | null
          buyer_tel: string | null
          cargo_phone: string | null
          cargo_transport: string | null
          created_at: string
          customer_id: string | null
          delivery_date: string
          delivery_number: string | null
          id: string
          last_edited_at: string | null
          marka: string | null
          notes: string | null
          sales_order_id: string | null
          status: string
          total_amount: number | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          advance_amount?: number | null
          balance_amount?: number | null
          bill_id?: string | null
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tel?: string | null
          cargo_phone?: string | null
          cargo_transport?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_date?: string
          delivery_number?: string | null
          id?: string
          last_edited_at?: string | null
          marka?: string | null
          notes?: string | null
          sales_order_id?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          advance_amount?: number | null
          balance_amount?: number | null
          bill_id?: string | null
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tel?: string | null
          cargo_phone?: string | null
          cargo_transport?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_date?: string
          delivery_number?: string | null
          id?: string
          last_edited_at?: string | null
          marka?: string | null
          notes?: string | null
          sales_order_id?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          category_id: string | null
          created_at: string
          description: string | null
          expense_date: string
          expense_number: string | null
          id: string
          is_recurring: boolean
          next_recurrence_date: string | null
          payment_method: string
          recurrence_frequency: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_number?: string | null
          id?: string
          is_recurring?: boolean
          next_recurrence_date?: string | null
          payment_method?: string
          recurrence_frequency?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_number?: string | null
          id?: string
          is_recurring?: boolean
          next_recurrence_date?: string | null
          payment_method?: string
          recurrence_frequency?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_transfers: {
        Row: {
          amount: number
          created_at: string
          from_account_id: string
          id: string
          notes: string | null
          to_account_id: string
          transfer_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          from_account_id: string
          id?: string
          notes?: string | null
          to_account_id: string
          transfer_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_account_id?: string
          id?: string
          notes?: string | null
          to_account_id?: string
          transfer_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          created_at: string
          file_name: string
          id: string
          import_type: string
          notes: string | null
          records_created: number
          records_skipped: number
          records_updated: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          import_type: string
          notes?: string | null
          records_created?: number
          records_skipped?: number
          records_updated?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          import_type?: string
          notes?: string | null
          records_created?: number
          records_skipped?: number
          records_updated?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          description: string | null
          entry_date: string
          entry_type: string
          id: string
          related_bill_id: string | null
          related_expense_id: string | null
          related_payment_id: string | null
          related_purchase_id: string | null
          related_return_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          created_at?: string
          description?: string | null
          entry_date?: string
          entry_type: string
          id?: string
          related_bill_id?: string | null
          related_expense_id?: string | null
          related_payment_id?: string | null
          related_purchase_id?: string | null
          related_return_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          related_bill_id?: string | null
          related_expense_id?: string | null
          related_payment_id?: string | null
          related_purchase_id?: string | null
          related_return_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_purchase_fk"
            columns: ["related_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_related_bill_id_fkey"
            columns: ["related_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_related_payment_id_fkey"
            columns: ["related_payment_id"]
            isOneToOne: false
            referencedRelation: "payments_received"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_allocated: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount_allocated?: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          amount_allocated?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_received"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_made_allocations: {
        Row: {
          amount_allocated: number
          created_at: string
          id: string
          payment_id: string
          purchase_bill_id: string
        }
        Insert: {
          amount_allocated?: number
          created_at?: string
          id?: string
          payment_id: string
          purchase_bill_id: string
        }
        Update: {
          amount_allocated?: number
          created_at?: string
          id?: string
          payment_id?: string
          purchase_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_made_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_made"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_made_allocations_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
        ]
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
      payments_made: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          reference_number: string | null
          vendor_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          vendor_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_made_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_made_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_received: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          reference_number: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_received_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          created_at: string
          custom_price: number | null
          id: string
          is_included: boolean
          price_list_id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_price?: number | null
          id?: string
          is_included?: boolean
          price_list_id: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_price?: number | null
          id?: string
          is_included?: boolean
          price_list_id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_order_items: {
        Row: {
          applied_price: number
          base_price: number
          id: string
          line_total: number
          price_list_order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          warehouse_id: string | null
        }
        Insert: {
          applied_price: number
          base_price: number
          id?: string
          line_total: number
          price_list_order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          warehouse_id?: string | null
        }
        Update: {
          applied_price?: number
          base_price?: number
          id?: string
          line_total?: number
          price_list_order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_order_items_price_list_order_id_fkey"
            columns: ["price_list_order_id"]
            isOneToOne: false
            referencedRelation: "price_list_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_order_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_orders: {
        Row: {
          admin_adjusted_total: number | null
          converted_bill_id: string | null
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_note: string | null
          customer_phone: string
          id: string
          increase_percent: number
          is_viewed: boolean
          order_number: string | null
          price_list_id: string | null
          rejection_reason: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          was_price_increased: boolean
        }
        Insert: {
          admin_adjusted_total?: number | null
          converted_bill_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_note?: string | null
          customer_phone: string
          id?: string
          increase_percent?: number
          is_viewed?: boolean
          order_number?: string | null
          price_list_id?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          was_price_increased?: boolean
        }
        Update: {
          admin_adjusted_total?: number | null
          converted_bill_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_note?: string | null
          customer_phone?: string
          id?: string
          increase_percent?: number
          is_viewed?: boolean
          order_number?: string | null
          price_list_id?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          was_price_increased?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "price_list_orders_converted_bill_id_fkey"
            columns: ["converted_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_orders_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          below_min_increase_percent: number
          client_name: string | null
          created_at: string
          default_min_quantity: number | null
          id: string
          is_share_enabled: boolean
          name: string
          share_token: string
          updated_at: string
        }
        Insert: {
          below_min_increase_percent?: number
          client_name?: string | null
          created_at?: string
          default_min_quantity?: number | null
          id?: string
          is_share_enabled?: boolean
          name: string
          share_token?: string
          updated_at?: string
        }
        Update: {
          below_min_increase_percent?: number
          client_name?: string | null
          created_at?: string
          default_min_quantity?: number | null
          id?: string
          is_share_enabled?: boolean
          name?: string
          share_token?: string
          updated_at?: string
        }
        Relationships: []
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
      purchase_bill_items: {
        Row: {
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          purchase_bill_id: string
          quantity: number
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          purchase_bill_id: string
          quantity?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          purchase_bill_id?: string
          quantity?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bill_items_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bill_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          amount_paid: number
          bill_date: string
          bill_number: string | null
          created_at: string
          id: string
          notes: string | null
          payment_status: string
          purchase_order_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount_paid?: number
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_status?: string
          purchase_order_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount_paid?: number
          bill_date?: string
          bill_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_status?: string
          purchase_order_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          purchase_order_id: string
          quantity: number
          quantity_received: number
          unit_cost: number
        }
        Insert: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          purchase_order_id: string
          quantity?: number
          quantity_received?: number
          unit_cost?: number
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_date: string
          order_number: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          purchase_bill_item_id: string | null
          purchase_return_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          purchase_bill_item_id?: string | null
          purchase_return_id: string
          quantity?: number
          unit_cost?: number
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          purchase_bill_item_id?: string | null
          purchase_return_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_bill_item_id_fkey"
            columns: ["purchase_bill_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          purchase_bill_id: string | null
          reason: string | null
          return_date: string
          return_number: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_bill_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_bill_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          quantity_delivered: number
          sales_order_id: string
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          quantity_delivered?: number
          sales_order_id: string
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          quantity_delivered?: number
          sales_order_id?: string
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          customer_id: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          is_taxed: boolean
          is_walk_in: boolean
          notes: string | null
          order_date: string
          order_number: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total_amount: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          is_walk_in?: boolean
          notes?: string | null
          order_date?: string
          order_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_taxed?: boolean
          is_walk_in?: boolean
          notes?: string | null
          order_date?: string
          order_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          bill_item_id: string | null
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          sales_return_id: string
          unit_price: number
        }
        Insert: {
          bill_item_id?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          sales_return_id: string
          unit_price?: number
        }
        Update: {
          bill_item_id?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          sales_return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          bill_id: string | null
          created_at: string
          credit_note_id: string | null
          customer_id: string | null
          id: string
          notes: string | null
          reason: string | null
          return_date: string
          return_number: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          bill_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          bill_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          active_invoice_template: string
          bank_payment_details: string | null
          business_address: string
          business_email: string
          business_logo_url: string | null
          business_name: string
          business_phone: string
          business_tagline: string | null
          created_at: string
          default_payment_terms: string
          default_tax_rate: number
          google_review_qr_link: string | null
          google_review_qr_name: string | null
          id: string
          invoice_footer_note: string | null
          invoice_prefix: string
          low_stock_threshold: number
          share_message_footer: string | null
          signature_url: string | null
          tax_id: string | null
          terms_and_conditions: string | null
          whatsapp_qr_link: string | null
          whatsapp_qr_name: string | null
        }
        Insert: {
          active_invoice_template?: string
          bank_payment_details?: string | null
          business_address?: string
          business_email?: string
          business_logo_url?: string | null
          business_name?: string
          business_phone?: string
          business_tagline?: string | null
          created_at?: string
          default_payment_terms?: string
          default_tax_rate?: number
          google_review_qr_link?: string | null
          google_review_qr_name?: string | null
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix?: string
          low_stock_threshold?: number
          share_message_footer?: string | null
          signature_url?: string | null
          tax_id?: string | null
          terms_and_conditions?: string | null
          whatsapp_qr_link?: string | null
          whatsapp_qr_name?: string | null
        }
        Update: {
          active_invoice_template?: string
          bank_payment_details?: string | null
          business_address?: string
          business_email?: string
          business_logo_url?: string | null
          business_name?: string
          business_phone?: string
          business_tagline?: string | null
          created_at?: string
          default_payment_terms?: string
          default_tax_rate?: number
          google_review_qr_link?: string | null
          google_review_qr_name?: string | null
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix?: string
          low_stock_threshold?: number
          share_message_footer?: string | null
          signature_url?: string | null
          tax_id?: string | null
          terms_and_conditions?: string | null
          whatsapp_qr_link?: string | null
          whatsapp_qr_name?: string | null
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
            foreignKeyName: "stock_movements_purchase_fk"
            columns: ["related_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
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
      vendors: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          total_outstanding: number
          total_purchased: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          total_outstanding?: number
          total_purchased?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_outstanding?: number
          total_purchased?: number
          updated_at?: string
        }
        Relationships: []
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
      convert_price_list_order: {
        Args: { p_bill_id: string; p_order_id: string }
        Returns: Json
      }
      reject_price_list_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      submit_price_list_order: {
        Args: {
          p_address: string
          p_email: string
          p_items: Json
          p_name: string
          p_note: string
          p_phone: string
          p_token: string
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

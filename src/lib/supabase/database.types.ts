/**
 * Generated Studio OS Database types (Phase 4).
 * Source: local Postgres introspection after migrations.
 * Prefer regenerating via `npm run supabase:types` when Supabase CLI/Docker is available,
 * or `npm run supabase:types:from-pg` after `npm run supabase:db:test`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          id: string
          actor_user_id: string | null
          actor_type: 'user' | 'client' | 'system' | 'stripe'
          client_id: string | null
          project_id: string | null
          proposal_id: string | null
          invoice_id: string | null
          payment_id: string | null
          action: string
          subject_type: string
          subject_id: string | null
          metadata: Json
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id?: string | null
          actor_type?: 'user' | 'client' | 'system' | 'stripe'
          client_id?: string | null
          project_id?: string | null
          proposal_id?: string | null
          invoice_id?: string | null
          payment_id?: string | null
          action: string
          subject_type: string
          subject_id?: string | null
          metadata?: Json
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_user_id?: string | null
          actor_type?: 'user' | 'client' | 'system' | 'stripe'
          client_id?: string | null
          project_id?: string | null
          proposal_id?: string | null
          invoice_id?: string | null
          payment_id?: string | null
          action?: string
          subject_type?: string
          subject_id?: string | null
          metadata?: Json
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          id: string
          client_id: string
          name: string
          email: string | null
          phone: string | null
          job_title: string | null
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          email?: string | null
          phone?: string | null
          job_title?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          job_title?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_financial_summary: {
        Row: {
          client_id: string | null
          company_name: string | null
          lifetime_paid_minor: number | null
          outstanding_balance_minor: number | null
        }
        Insert: {
          client_id?: string | null
          company_name?: string | null
          lifetime_paid_minor?: number | null
          outstanding_balance_minor?: number | null
        }
        Update: {
          client_id?: string | null
          company_name?: string | null
          lifetime_paid_minor?: number | null
          outstanding_balance_minor?: number | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          company_name: string
          display_name: string | null
          billing_email: string | null
          phone: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_region: string | null
          billing_postal_code: string | null
          billing_country: string | null
          company_address_line1: string | null
          company_address_line2: string | null
          company_city: string | null
          company_region: string | null
          company_postal_code: string | null
          company_country: string | null
          notes: string | null
          status: 'active' | 'archived'
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_name: string
          display_name?: string | null
          billing_email?: string | null
          phone?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_region?: string | null
          billing_postal_code?: string | null
          billing_country?: string | null
          company_address_line1?: string | null
          company_address_line2?: string | null
          company_city?: string | null
          company_region?: string | null
          company_postal_code?: string | null
          company_country?: string | null
          notes?: string | null
          status?: 'active' | 'archived'
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_name?: string
          display_name?: string | null
          billing_email?: string | null
          phone?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_region?: string | null
          billing_postal_code?: string | null
          billing_country?: string | null
          company_address_line1?: string | null
          company_address_line2?: string | null
          company_city?: string | null
          company_region?: string | null
          company_postal_code?: string | null
          company_country?: string | null
          notes?: string | null
          status?: 'active' | 'archived'
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          resource_type: 'proposal' | 'invoice' | 'receipt'
          resource_id: string
          version_id: string | null
          document_type: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf'
          storage_bucket: string
          storage_path: string
          mime_type: string
          file_size: number | null
          checksum: string | null
          generated_at: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          resource_type: 'proposal' | 'invoice' | 'receipt'
          resource_id: string
          version_id?: string | null
          document_type: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf'
          storage_bucket: string
          storage_path: string
          mime_type?: string
          file_size?: number | null
          checksum?: string | null
          generated_at?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          resource_type?: 'proposal' | 'invoice' | 'receipt'
          resource_id?: string
          version_id?: string | null
          document_type?: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf'
          storage_bucket?: string
          storage_path?: string
          mime_type?: string
          file_size?: number | null
          checksum?: string | null
          generated_at?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          id: string
          client_id: string | null
          project_id: string | null
          proposal_id: string | null
          invoice_id: string | null
          email_type: 'proposal_sent' | 'proposal_accepted' | 'deposit_invoice' | 'final_invoice' | 'payment_received' | 'payment_reminder'
          recipient_email: string
          provider: string
          provider_message_id: string | null
          subject: string
          status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'complained'
          sent_at: string | null
          delivered_at: string | null
          bounced_at: string | null
          failure_reason: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          project_id?: string | null
          proposal_id?: string | null
          invoice_id?: string | null
          email_type: 'proposal_sent' | 'proposal_accepted' | 'deposit_invoice' | 'final_invoice' | 'payment_received' | 'payment_reminder'
          recipient_email: string
          provider?: string
          provider_message_id?: string | null
          subject: string
          status?: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'complained'
          sent_at?: string | null
          delivered_at?: string | null
          bounced_at?: string | null
          failure_reason?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          project_id?: string | null
          proposal_id?: string | null
          invoice_id?: string | null
          email_type?: 'proposal_sent' | 'proposal_accepted' | 'deposit_invoice' | 'final_invoice' | 'payment_received' | 'payment_reminder'
          recipient_email?: string
          provider?: string
          provider_message_id?: string | null
          subject?: string
          status?: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'complained'
          sent_at?: string | null
          delivered_at?: string | null
          bounced_at?: string | null
          failure_reason?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          description: string
          quantity: number
          rate_minor: number
          amount_minor: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          quantity?: number
          rate_minor?: number
          amount_minor?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          description?: string
          quantity?: number
          rate_minor?: number
          amount_minor?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      invoice_status_summary: {
        Row: {
          status: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded' | null
          invoice_count: number | null
          balance_due_minor_sum: number | null
        }
        Insert: {
          status?: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded' | null
          invoice_count?: number | null
          balance_due_minor_sum?: number | null
        }
        Update: {
          status?: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded' | null
          invoice_count?: number | null
          balance_due_minor_sum?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          client_id: string
          project_id: string | null
          proposal_id: string | null
          proposal_version_id: string | null
          generation_key: string | null
          invoice_number: string
          invoice_type: 'deposit' | 'final' | 'manual' | 'adjustment'
          status: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded'
          currency: 'CAD' | 'USD'
          issue_date: string | null
          due_date: string | null
          subtotal_minor: number
          discount_minor: number
          tax_minor: number
          tax_bps: number
          total_minor: number
          amount_paid_minor: number
          balance_due_minor: number
          payment_instructions: string | null
          client_display_name: string | null
          client_contact_name: string | null
          client_contact_email: string | null
          client_billing_address: string | null
          project_name: string | null
          studio_business_name: string | null
          studio_billing_email: string | null
          studio_business_address: string | null
          sent_at: string | null
          paid_at: string | null
          voided_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          project_id?: string | null
          proposal_id?: string | null
          proposal_version_id?: string | null
          generation_key?: string | null
          invoice_number: string
          invoice_type?: 'deposit' | 'final' | 'manual' | 'adjustment'
          status?: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded'
          currency?: 'CAD' | 'USD'
          issue_date?: string | null
          due_date?: string | null
          subtotal_minor?: number
          discount_minor?: number
          tax_minor?: number
          tax_bps?: number
          total_minor?: number
          amount_paid_minor?: number
          balance_due_minor?: number
          payment_instructions?: string | null
          client_display_name?: string | null
          client_contact_name?: string | null
          client_contact_email?: string | null
          client_billing_address?: string | null
          project_name?: string | null
          studio_business_name?: string | null
          studio_billing_email?: string | null
          studio_business_address?: string | null
          sent_at?: string | null
          paid_at?: string | null
          voided_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          project_id?: string | null
          proposal_id?: string | null
          proposal_version_id?: string | null
          generation_key?: string | null
          invoice_number?: string
          invoice_type?: 'deposit' | 'final' | 'manual' | 'adjustment'
          status?: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded'
          currency?: 'CAD' | 'USD'
          issue_date?: string | null
          due_date?: string | null
          subtotal_minor?: number
          discount_minor?: number
          tax_minor?: number
          tax_bps?: number
          total_minor?: number
          amount_paid_minor?: number
          balance_due_minor?: number
          payment_instructions?: string | null
          client_display_name?: string | null
          client_contact_name?: string | null
          client_contact_email?: string | null
          client_billing_address?: string | null
          project_name?: string | null
          studio_business_name?: string | null
          studio_billing_email?: string | null
          studio_business_address?: string | null
          sent_at?: string | null
          paid_at?: string | null
          voided_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      number_counters: {
        Row: {
          id: string
          counter_type: 'invoice' | 'proposal'
          year: number
          prefix: string
          current_value: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          counter_type: 'invoice' | 'proposal'
          year: number
          prefix: string
          current_value?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          counter_type?: 'invoice' | 'proposal'
          year?: number
          prefix?: string
          current_value?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          client_id: string
          amount_minor: number
          currency: 'CAD' | 'USD'
          payment_method: string | null
          provider: string
          provider_payment_id: string | null
          provider_checkout_session_id: string | null
          status: 'pending' | 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'canceled'
          paid_at: string | null
          failed_at: string | null
          refunded_minor: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          client_id: string
          amount_minor: number
          currency?: 'CAD' | 'USD'
          payment_method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_checkout_session_id?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'canceled'
          paid_at?: string | null
          failed_at?: string | null
          refunded_minor?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          client_id?: string
          amount_minor?: number
          currency?: 'CAD' | 'USD'
          payment_method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_checkout_session_id?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'canceled'
          paid_at?: string | null
          failed_at?: string | null
          refunded_minor?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_checkout_sessions: {
        Row: {
          id: string
          invoice_id: string
          provider_session_id: string
          amount_minor: number
          currency: 'CAD' | 'USD'
          status: string
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          provider_session_id: string
          amount_minor: number
          currency: 'CAD' | 'USD'
          status?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          provider_session_id?: string
          amount_minor?: number
          currency?: 'CAD' | 'USD'
          status?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          auth_user_id: string
          display_name: string | null
          email: string
          role: 'owner' | 'admin' | 'staff'
          status: 'active' | 'suspended'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id: string
          display_name?: string | null
          email: string
          role?: 'owner' | 'admin' | 'staff'
          status?: 'active' | 'suspended'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string
          display_name?: string | null
          email?: string
          role?: 'owner' | 'admin' | 'staff'
          status?: 'active' | 'suspended'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          client_id: string
          name: string
          project_type: string | null
          description: string | null
          scope: string | null
          deliverables: string | null
          start_date: string | null
          target_completion_date: string | null
          project_price_minor: number
          currency: 'CAD' | 'USD'
          tax_bps: number
          deposit_bps: number
          status: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived'
          internal_notes: string | null
          completed_at: string | null
          archived_at: string | null
          status_before_archive: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          project_type?: string | null
          description?: string | null
          scope?: string | null
          deliverables?: string | null
          start_date?: string | null
          target_completion_date?: string | null
          project_price_minor?: number
          currency?: 'CAD' | 'USD'
          tax_bps?: number
          deposit_bps?: number
          status?: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived'
          internal_notes?: string | null
          completed_at?: string | null
          archived_at?: string | null
          status_before_archive?: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          project_type?: string | null
          description?: string | null
          scope?: string | null
          deliverables?: string | null
          start_date?: string | null
          target_completion_date?: string | null
          project_price_minor?: number
          currency?: 'CAD' | 'USD'
          tax_bps?: number
          deposit_bps?: number
          status?: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived'
          internal_notes?: string | null
          completed_at?: string | null
          archived_at?: string | null
          status_before_archive?: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived' | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_acceptances: {
        Row: {
          id: string
          proposal_id: string
          proposal_version_id: string
          client_id: string
          accepted_by_name: string
          accepted_by_email: string
          accepted_at: string
          ip_address: string | null
          user_agent: string | null
          acceptance_method: string
          evidence_metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          proposal_version_id: string
          client_id: string
          accepted_by_name: string
          accepted_by_email: string
          accepted_at?: string
          ip_address?: string | null
          user_agent?: string | null
          acceptance_method?: string
          evidence_metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          proposal_version_id?: string
          client_id?: string
          accepted_by_name?: string
          accepted_by_email?: string
          accepted_at?: string
          ip_address?: string | null
          user_agent?: string | null
          acceptance_method?: string
          evidence_metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      proposal_items: {
        Row: {
          id: string
          proposal_version_id: string
          item_type: 'service' | 'add_on' | 'discount'
          description: string
          quantity: number
          rate_minor: number
          amount_minor: number
          sort_order: number
          optional: boolean
          selected: boolean
          created_at: string
        }
        Insert: {
          id?: string
          proposal_version_id: string
          item_type?: 'service' | 'add_on' | 'discount'
          description: string
          quantity?: number
          rate_minor?: number
          amount_minor?: number
          sort_order?: number
          optional?: boolean
          selected?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          proposal_version_id?: string
          item_type?: 'service' | 'add_on' | 'discount'
          description?: string
          quantity?: number
          rate_minor?: number
          amount_minor?: number
          sort_order?: number
          optional?: boolean
          selected?: boolean
          created_at?: string
        }
        Relationships: []
      }
      proposal_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          introduction: string | null
          project_overview: string | null
          objectives: string | null
          scope: string | null
          deliverables: string | null
          timeline: string | null
          payment_terms: string | null
          terms_and_conditions: string | null
          notes: string | null
          is_default: boolean
          is_archived: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          introduction?: string | null
          project_overview?: string | null
          objectives?: string | null
          scope?: string | null
          deliverables?: string | null
          timeline?: string | null
          payment_terms?: string | null
          terms_and_conditions?: string | null
          notes?: string | null
          is_default?: boolean
          is_archived?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          introduction?: string | null
          project_overview?: string | null
          objectives?: string | null
          scope?: string | null
          deliverables?: string | null
          timeline?: string | null
          payment_terms?: string | null
          terms_and_conditions?: string | null
          notes?: string | null
          is_default?: boolean
          is_archived?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_versions: {
        Row: {
          id: string
          proposal_id: string
          version_number: number
          title: string
          introduction: string | null
          project_overview: string | null
          objectives: string | null
          scope: string | null
          deliverables: string | null
          timeline: string | null
          payment_schedule: string | null
          terms_and_conditions: string | null
          notes: string | null
          sections: Json
          subtotal_minor: number
          discount_minor: number
          tax_minor: number
          total_minor: number
          currency: 'CAD' | 'USD'
          expires_at: string | null
          is_immutable: boolean
          created_by: string | null
          created_at: string
          client_display_name: string | null
          client_contact_name: string | null
          client_contact_email: string | null
          project_name: string | null
          tax_bps: number
          deposit_bps: number
          finalized_at: string | null
        }
        Insert: {
          id?: string
          proposal_id: string
          version_number: number
          title: string
          introduction?: string | null
          project_overview?: string | null
          objectives?: string | null
          scope?: string | null
          deliverables?: string | null
          timeline?: string | null
          payment_schedule?: string | null
          terms_and_conditions?: string | null
          notes?: string | null
          sections?: Json
          subtotal_minor?: number
          discount_minor?: number
          tax_minor?: number
          total_minor?: number
          currency?: 'CAD' | 'USD'
          expires_at?: string | null
          is_immutable?: boolean
          created_by?: string | null
          created_at?: string
          client_display_name?: string | null
          client_contact_name?: string | null
          client_contact_email?: string | null
          project_name?: string | null
          tax_bps?: number
          deposit_bps?: number
          finalized_at?: string | null
        }
        Update: {
          id?: string
          proposal_id?: string
          version_number?: number
          title?: string
          introduction?: string | null
          project_overview?: string | null
          objectives?: string | null
          scope?: string | null
          deliverables?: string | null
          timeline?: string | null
          payment_schedule?: string | null
          terms_and_conditions?: string | null
          notes?: string | null
          sections?: Json
          subtotal_minor?: number
          discount_minor?: number
          tax_minor?: number
          total_minor?: number
          currency?: 'CAD' | 'USD'
          expires_at?: string | null
          is_immutable?: boolean
          created_by?: string | null
          created_at?: string
          client_display_name?: string | null
          client_contact_name?: string | null
          client_contact_email?: string | null
          project_name?: string | null
          tax_bps?: number
          deposit_bps?: number
          finalized_at?: string | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          id: string
          client_id: string
          project_id: string
          proposal_number: string
          title: string
          status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'changes_requested' | 'expired' | 'declined' | 'archived'
          current_version_id: string | null
          expires_at: string | null
          sent_at: string | null
          accepted_at: string | null
          declined_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          project_id: string
          proposal_number: string
          title: string
          status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'changes_requested' | 'expired' | 'declined' | 'archived'
          current_version_id?: string | null
          expires_at?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          declined_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          project_id?: string
          proposal_number?: string
          title?: string
          status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'changes_requested' | 'expired' | 'declined' | 'archived'
          current_version_id?: string | null
          expires_at?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          declined_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_links: {
        Row: {
          id: string
          resource_type: 'proposal' | 'invoice' | 'receipt'
          resource_id: string
          proposal_version_id: string | null
          token_hash: string
          expires_at: string | null
          revoked_at: string | null
          created_at: string
          last_accessed_at: string | null
          first_viewed_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          resource_type: 'proposal' | 'invoice' | 'receipt'
          resource_id: string
          proposal_version_id?: string | null
          token_hash: string
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
          last_accessed_at?: string | null
          first_viewed_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          resource_type?: 'proposal' | 'invoice' | 'receipt'
          resource_id?: string
          proposal_version_id?: string | null
          token_hash?: string
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
          last_accessed_at?: string | null
          first_viewed_at?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      proposal_change_requests: {
        Row: {
          id: string
          proposal_id: string
          proposal_version_id: string
          client_id: string
          requested_by_name: string
          requested_by_email: string
          message: string
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          proposal_id: string
          proposal_version_id: string
          client_id: string
          requested_by_name: string
          requested_by_email: string
          message: string
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          proposal_id?: string
          proposal_version_id?: string
          client_id?: string
          requested_by_name?: string
          requested_by_email?: string
          message?: string
          created_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          id: string
          payment_id: string
          amount_minor: number
          currency: 'CAD' | 'USD'
          provider_refund_id: string | null
          status: 'pending' | 'succeeded' | 'failed' | 'canceled'
          reason: string | null
          refunded_at: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          amount_minor: number
          currency?: 'CAD' | 'USD'
          provider_refund_id?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'canceled'
          reason?: string | null
          refunded_at?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          amount_minor?: number
          currency?: 'CAD' | 'USD'
          provider_refund_id?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'canceled'
          reason?: string | null
          refunded_at?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      reminder_events: {
        Row: {
          id: string
          invoice_id: string
          reminder_type: 'before_due' | 'due_today' | 'overdue_3_days' | 'overdue_7_days' | 'custom'
          scheduled_for: string
          sent_at: string | null
          status: 'scheduled' | 'sent' | 'canceled' | 'failed'
          email_log_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          reminder_type: 'before_due' | 'due_today' | 'overdue_3_days' | 'overdue_7_days' | 'custom'
          scheduled_for: string
          sent_at?: string | null
          status?: 'scheduled' | 'sent' | 'canceled' | 'failed'
          email_log_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          reminder_type?: 'before_due' | 'due_today' | 'overdue_3_days' | 'overdue_7_days' | 'custom'
          scheduled_for?: string
          sent_at?: string | null
          status?: 'scheduled' | 'sent' | 'canceled' | 'failed'
          email_log_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          studio_name: string
          legal_name: string | null
          contact_email: string | null
          billing_email: string | null
          phone: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          region: string | null
          postal_code: string | null
          country: string | null
          default_currency: 'CAD' | 'USD'
          default_tax_bps: number
          default_deposit_bps: number
          invoice_prefix: string
          proposal_prefix: string
          payment_terms_days: number
          reminders_enabled: boolean
          attach_pdf_by_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          studio_name?: string
          legal_name?: string | null
          contact_email?: string | null
          billing_email?: string | null
          phone?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          region?: string | null
          postal_code?: string | null
          country?: string | null
          default_currency?: 'CAD' | 'USD'
          default_tax_bps?: number
          default_deposit_bps?: number
          invoice_prefix?: string
          proposal_prefix?: string
          payment_terms_days?: number
          reminders_enabled?: boolean
          attach_pdf_by_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          studio_name?: string
          legal_name?: string | null
          contact_email?: string | null
          billing_email?: string | null
          phone?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          region?: string | null
          postal_code?: string | null
          country?: string | null
          default_currency?: 'CAD' | 'USD'
          default_tax_bps?: number
          default_deposit_bps?: number
          invoice_prefix?: string
          proposal_prefix?: string
          payment_terms_days?: number
          reminders_enabled?: boolean
          attach_pdf_by_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          id: string
          provider: string
          provider_event_id: string
          event_type: string
          processing_status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored'
          received_at: string
          processed_at: string | null
          failure_message: string | null
          payload_metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          provider?: string
          provider_event_id: string
          event_type: string
          processing_status?: 'received' | 'processing' | 'processed' | 'failed' | 'ignored'
          received_at?: string
          processed_at?: string | null
          failure_message?: string | null
          payload_metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          provider?: string
          provider_event_id?: string
          event_type?: string
          processing_status?: 'received' | 'processing' | 'processed' | 'failed' | 'ignored'
          received_at?: string
          processed_at?: string | null
          failure_message?: string | null
          payload_metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      client_financial_summary: {
        Row: Record<string, unknown>
        Relationships: []
      }
      invoice_status_summary: {
        Row: Record<string, unknown>
        Relationships: []
      }
    }
    Functions: {
      is_studio_user: { Args: Record<string, never>; Returns: boolean }
      is_studio_admin: { Args: Record<string, never>; Returns: boolean }
      next_document_number: {
        Args: {
          p_counter_type: Database['public']['Enums']['number_counter_type']
          p_prefix: string
          p_year?: number
        }
        Returns: string
      }
      create_client_with_primary_contact: {
        Args: {
          p_company_name: string
          p_contact_name: string
          p_display_name?: string | null
          p_billing_email?: string | null
          p_phone?: string | null
          p_billing_address_line1?: string | null
          p_billing_address_line2?: string | null
          p_billing_city?: string | null
          p_billing_region?: string | null
          p_billing_postal_code?: string | null
          p_billing_country?: string | null
          p_company_address_line1?: string | null
          p_company_address_line2?: string | null
          p_company_city?: string | null
          p_company_region?: string | null
          p_company_postal_code?: string | null
          p_company_country?: string | null
          p_notes?: string | null
          p_contact_email?: string | null
          p_contact_phone?: string | null
          p_contact_job_title?: string | null
        }
        Returns: string
      }
      set_primary_client_contact: {
        Args: {
          p_client_id: string
          p_contact_id: string
        }
        Returns: undefined
      }
      transition_project: {
        Args: {
          p_project_id: string
          p_expected_status: Database['public']['Enums']['project_status']
          p_target_status: Database['public']['Enums']['project_status']
        }
        Returns: Database['public']['Tables']['projects']['Row']
      }
      set_default_proposal_template: {
        Args: { p_template_id: string }
        Returns: Database['public']['Tables']['proposal_templates']['Row']
      }
      create_proposal_revision: {
        Args: { p_proposal_id: string }
        Returns: Database['public']['Tables']['proposal_versions']['Row']
      }
      finalize_proposal_version: {
        Args: { p_proposal_id: string; p_version_id: string }
        Returns: Database['public']['Tables']['proposal_versions']['Row']
      }
      apply_succeeded_stripe_payment: {
        Args: {
          p_invoice_id: string
          p_client_id: string
          p_amount_minor: number
          p_currency: Database['public']['Enums']['currency_code']
          p_provider_payment_id: string
          p_provider_checkout_session_id?: string | null
          p_payment_method?: string | null
          p_paid_at?: string | null
          p_metadata?: Json
        }
        Returns: Json
      }
      apply_succeeded_stripe_refund: {
        Args: {
          p_provider_refund_id: string
          p_provider_payment_id: string
          p_amount_minor: number
          p_currency: Database['public']['Enums']['currency_code']
          p_refunded_at?: string | null
          p_reason?: string | null
          p_metadata?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      activity_actor_type: 'user' | 'client' | 'system' | 'stripe'
      client_status: 'active' | 'archived'
      currency_code: 'CAD' | 'USD'
      document_resource_type: 'proposal' | 'invoice' | 'receipt'
      document_type: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf'
      email_delivery_status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'complained'
      email_type: 'proposal_sent' | 'proposal_accepted' | 'deposit_invoice' | 'final_invoice' | 'payment_received' | 'payment_reminder'
      invoice_status: 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'refunded'
      invoice_type: 'deposit' | 'final' | 'manual' | 'adjustment'
      number_counter_type: 'invoice' | 'proposal'
      payment_status: 'pending' | 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'canceled'
      project_status: 'inquiry' | 'proposal' | 'awaiting_approval' | 'deposit_due' | 'active' | 'awaiting_final_payment' | 'completed' | 'archived'
      proposal_item_type: 'service' | 'add_on' | 'discount'
      proposal_status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'changes_requested' | 'expired' | 'declined' | 'archived'
      public_link_resource_type: 'proposal' | 'invoice' | 'receipt'
      refund_status: 'pending' | 'succeeded' | 'failed' | 'canceled'
      reminder_status: 'scheduled' | 'sent' | 'canceled' | 'failed'
      reminder_type: 'before_due' | 'due_today' | 'overdue_3_days' | 'overdue_7_days' | 'custom'
      studio_role: 'owner' | 'admin' | 'staff'
      studio_user_status: 'active' | 'suspended'
      webhook_processing_status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

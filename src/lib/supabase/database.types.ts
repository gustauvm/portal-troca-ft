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
      operator_profiles: {
        Row: {
          user_id: string;
          email: string | null;
          full_name: string | null;
          role: "operator" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email?: string | null;
          full_name?: string | null;
          role?: "operator" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["operator_profiles"]["Insert"]>;
        Relationships: [];
      };
      employee_directory: {
        Row: {
          id: string;
          nexti_person_id: number;
          person_external_id: string;
          enrolment: string;
          enrolment_aliases: string[];
          cpf_digits: string;
          full_name: string;
          group_key: string;
          company_id: number | null;
          company_name: string;
          company_external_id: string | null;
          company_number: string | null;
          business_unit_id: number | null;
          business_unit_name: string | null;
          workplace_id: number | null;
          workplace_external_id: string | null;
          workplace_name: string | null;
          client_name: string | null;
          career_id: number | null;
          career_external_id: string | null;
          career_name: string | null;
          schedule_id: number | null;
          schedule_external_id: string | null;
          schedule_name: string | null;
          shift_id: number | null;
          shift_external_id: string | null;
          shift_name: string | null;
          rotation_id: number | null;
          rotation_code: number | null;
          person_situation_id: number;
          situation_label: string;
          admission_date: string | null;
          is_active: boolean;
          sync_fingerprint: string;
          created_at: string;
          updated_at: string;
          last_synced_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employee_directory"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_directory"]["Insert"]>;
        Relationships: [];
      };
      workplace_directory: {
        Row: {
          id: string;
          nexti_workplace_id: number;
          workplace_external_id: string;
          name: string;
          client_name: string | null;
          service_name: string | null;
          group_key: string;
          company_id: number | null;
          company_name: string | null;
          company_external_id: string | null;
          company_number: string | null;
          business_unit_id: number | null;
          business_unit_name: string | null;
          is_active: boolean;
          sync_fingerprint: string;
          created_at: string;
          updated_at: string;
          last_synced_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workplace_directory"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workplace_directory"]["Insert"]>;
        Relationships: [];
      };
      portal_requests: {
        Row: {
          id: string;
          request_type: "swap" | "ft";
          workflow_status: "submitted" | "approved" | "rejected" | "cancelled";
          launch_status: "waiting" | "matched" | "not_found" | "error";
          launch_source: "schedule_transfer" | "replacement";
          origin: string;
          group_key: string;
          payroll_reference: string;
          payroll_period_start: string;
          payroll_period_end: string;
          requester_employee_id: string;
          substitute_employee_id: string | null;
          requester_nexti_person_id: number;
          substitute_nexti_person_id: number | null;
          requester_person_external_id: string;
          substitute_person_external_id: string | null;
          requester_name: string;
          requester_enrolment: string;
          substitute_name: string | null;
          substitute_enrolment: string | null;
          company_id: number | null;
          company_name: string;
          career_id: number | null;
          career_name: string;
          schedule_id: number | null;
          schedule_name: string | null;
          shift_id: number | null;
          shift_name: string | null;
          workplace_id: number | null;
          workplace_external_id: string | null;
          workplace_name: string | null;
          request_date: string;
          coverage_date: string | null;
          reason: string;
          validation_summary: Json;
          request_snapshot: Json;
          nexti_payload: Json;
          nexti_match_payload: Json;
          launch_error: string | null;
          approved_at: string | null;
          approved_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          cancelled_at: string | null;
          cancelled_by_employee_id: string | null;
          launched_at: string | null;
          assigned_operator_user_id: string | null;
          assigned_operator_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_type: "swap" | "ft";
          workflow_status?: "submitted" | "approved" | "rejected" | "cancelled";
          launch_status?: "waiting" | "matched" | "not_found" | "error";
          launch_source: "schedule_transfer" | "replacement";
          origin?: string;
          group_key: string;
          payroll_reference: string;
          payroll_period_start: string;
          payroll_period_end: string;
          requester_employee_id: string;
          substitute_employee_id?: string | null;
          requester_nexti_person_id: number;
          substitute_nexti_person_id?: number | null;
          requester_person_external_id: string;
          substitute_person_external_id?: string | null;
          requester_name: string;
          requester_enrolment: string;
          substitute_name?: string | null;
          substitute_enrolment?: string | null;
          company_id?: number | null;
          company_name: string;
          career_id?: number | null;
          career_name: string;
          schedule_id?: number | null;
          schedule_name?: string | null;
          shift_id?: number | null;
          shift_name?: string | null;
          workplace_id?: number | null;
          workplace_external_id?: string | null;
          workplace_name?: string | null;
          request_date: string;
          coverage_date?: string | null;
          reason: string;
          validation_summary?: Json;
          request_snapshot?: Json;
          nexti_payload?: Json;
          nexti_match_payload?: Json;
          launch_error?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          cancelled_at?: string | null;
          cancelled_by_employee_id?: string | null;
          launched_at?: string | null;
          assigned_operator_user_id?: string | null;
          assigned_operator_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_requests"]["Insert"]>;
        Relationships: [];
      };
      request_events: {
        Row: {
          id: string;
          request_id: string;
          actor_type: "employee" | "operator" | "system";
          actor_id: string | null;
          actor_label: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["request_events"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["request_events"]["Insert"]>;
        Relationships: [];
      };
      operator_assignments: {
        Row: {
          id: string;
          request_id: string;
          operator_user_id: string;
          assigned_by_user_id: string | null;
          operator_name: string | null;
          note: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["operator_assignments"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["operator_assignments"]["Insert"]>;
        Relationships: [];
      };
      nexti_sync_state: {
        Row: {
          sync_key: string;
          last_cursor_start: string | null;
          last_cursor_finish: string | null;
          last_success_at: string | null;
          last_error: string | null;
          metadata: Json;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["nexti_sync_state"]["Row"], "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["nexti_sync_state"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

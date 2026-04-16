// Auto-generated types from Supabase schema
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TicketStatus =
  | "open"
  | "in_progress"
  | "pending_customer"
  | "pending_third_party"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "critical";
export type UserRole = "customer" | "agent" | "manager" | "admin";
export type TicketSource = "portal" | "email" | "api" | "phone";
export type SentimentType = "calm" | "neutral" | "frustrated" | "urgent" | "angry";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: "starter" | "pro" | "enterprise";
          logo_url: string | null;
          primary_color: string;
          support_email: string | null;
          settings: Json;
          data_retention_days: number;
          dpa_signed_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["organizations"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          department: string | null;
          phone: string | null;
          locale: string;
          timezone: string;
          is_active: boolean;
          data_processing_consent: boolean;
          consent_given_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      categories: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          color: string;
          icon: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["categories"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
      };
      tickets: {
        Row: {
          id: string;
          ticket_number: number;
          organization_id: string;
          category_id: string | null;
          created_by: string;
          assigned_to: string | null;
          title: string;
          description: string;
          detected_language: string | null;
          status: TicketStatus;
          priority: TicketPriority;
          source: TicketSource;
          tags: string[];
          sla_policy_id: string | null;
          sla_first_response_due: string | null;
          sla_resolution_due: string | null;
          first_response_at: string | null;
          sla_first_response_met: boolean | null;
          sla_resolution_met: boolean | null;
          sla_breached: boolean;
          resolved_at: string | null;
          closed_at: string | null;
          contains_pii: boolean;
          anonymized_at: string | null;
          retention_delete_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["tickets"]["Row"], "id" | "ticket_number" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["tickets"]["Insert"]>;
      };
      ticket_comments: {
        Row: {
          id: string;
          ticket_id: string;
          author_id: string;
          content: string;
          is_internal: boolean;
          is_ai_generated: boolean;
          edited_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["ticket_comments"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["ticket_comments"]["Insert"]>;
      };
      ai_analysis: {
        Row: {
          id: string;
          ticket_id: string;
          suggested_category: string | null;
          suggested_priority: TicketPriority | null;
          confidence_score: number | null;
          summary: string | null;
          sentiment: SentimentType | null;
          keywords: string[];
          detected_language: string | null;
          contains_pii_detected: boolean;
          smart_response: string | null;
          estimated_resolution_hours: number | null;
          reasoning: string | null;
          model_used: string;
          input_tokens: number | null;
          output_tokens: number | null;
          processing_time_ms: number | null;
          raw_response: Json | null;
          category_accepted: boolean | null;
          priority_accepted: boolean | null;
          agent_feedback: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["ai_analysis"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["ai_analysis"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          ticket_id: string | null;
          type: string;
          title: string;
          message: string | null;
          action_url: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      ticket_status: TicketStatus;
      ticket_priority: TicketPriority;
      user_role: UserRole;
      ticket_source: TicketSource;
      sentiment_type: SentimentType;
    };
  };
}

// Convenience joined types
export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type AIAnalysis = Database["public"]["Tables"]["ai_analysis"]["Row"];
export type TicketComment = Database["public"]["Tables"]["ticket_comments"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type TicketWithRelations = Ticket & {
  profiles: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  categories: Pick<Category, "id" | "name" | "slug" | "color" | "icon"> | null;
  ai_analysis: AIAnalysis | null;
  assigned_profile: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
};

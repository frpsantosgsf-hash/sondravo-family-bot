/**
 * Handgeschreven Supabase-typing voor het Sondravo-register.
 * Houd dit bestand in sync met supabase/migrations/*.sql.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RankTone = 'gold' | 'red' | 'green' | 'stone' | 'neutral' | 'muted';

export interface Database {
  public: {
    Tables: {
      ranks: {
        Row: {
          key: string;
          label: string;
          glyph: string;
          tone: RankTone;
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          key: string;
          label: string;
          glyph?: string;
          tone?: RankTone;
          color?: string;
          sort_order: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ranks']['Insert']>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          slug: string;
          name: string;
          rank: string;
          discord_username: string | null;
          phone: string | null;
          avatar_url: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug?: string;
          name: string;
          rank: string;
          discord_username?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          joined_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['members']['Insert']>;
        Relationships: [];
      };
      private_member_data: {
        Row: {
          member_id: string;
          discord_user_id: string | null;
          internal_note: string | null;
          updated_at: string;
        };
        Insert: {
          member_id: string;
          discord_user_id?: string | null;
          internal_note?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['private_member_data']['Insert']>;
        Relationships: [];
      };
      admins: {
        Row: { user_id: string; label: string | null; created_at: string };
        Insert: { user_id: string; label?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['admins']['Insert']>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          family_name: string;
          member_limit: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          family_name?: string;
          member_limit?: number;
        };
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          admin_user_id: string | null;
          admin_name: string | null;
          member_id: string | null;
          member_name: string | null;
          action: string;
          old_value: Json | null;
          new_value: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: {
        Args: { uid?: string };
        Returns: boolean;
      };
      admin_save_member: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_rank: string;
          p_discord_username?: string | null;
          p_discord_user_id?: string | null;
          p_phone?: string | null;
          p_avatar_url?: string | null;
          p_joined_at?: string | null;
          p_internal_note?: string | null;
        };
        Returns: string;
      };
      admin_update_settings: {
        Args: { p_member_limit: number; p_family_name?: string | null };
        Returns: Database['public']['Tables']['settings']['Row'];
      };
      bot_add_member: {
        Args: {
          p_discord_user_id: string;
          p_name: string;
          p_discord_username?: string | null;
          p_rank?: string;
          p_avatar_url?: string | null;
          p_actor?: string;
        };
        Returns: { member_id: string; created: boolean }[];
      };
      bot_remove_member: {
        Args: { p_discord_user_id: string; p_actor?: string };
        Returns: string | null;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type MemberRow = Database['public']['Tables']['members']['Row'];
export type RankRow = Database['public']['Tables']['ranks']['Row'];
export type SettingsRow = Database['public']['Tables']['settings']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type PrivateMemberRow = Database['public']['Tables']['private_member_data']['Row'];

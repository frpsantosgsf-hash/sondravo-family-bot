import type { AuditLogRow, MemberRow, RankRow, RankTone, SettingsRow } from './database';

export type { RankTone, MemberRow, RankRow, SettingsRow, AuditLogRow };

/** Een lid zoals de publieke pagina het toont. Bevat nooit privévelden. */
export interface PublicMember {
  id: string;
  slug: string;
  name: string;
  rank: string;
  discordUsername: string | null;
  phone: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
}

/** Alles wat een ingelogde admin van een lid mag zien. */
export interface AdminMemberExtras {
  discordUserId: string | null;
  internalNote: string | null;
}

export type RegistryMember = PublicMember & Partial<AdminMemberExtras>;

export interface Rank {
  key: string;
  label: string;
  glyph: string;
  tone: RankTone;
  sortOrder: number;
}

export interface RankGroup {
  rank: Rank;
  members: RegistryMember[];
}

export interface FamilySettings {
  familyName: string;
  memberLimit: number;
  updatedAt: string | null;
}

export interface Viewer {
  id: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface RegistryData {
  members: RegistryMember[];
  ranks: Rank[];
  settings: FamilySettings;
  viewer: Viewer | null;
  /** Gezet wanneer Supabase niet (goed) geconfigureerd is. */
  configError: string | null;
}

export interface AuditEntry {
  id: string;
  adminName: string | null;
  memberName: string | null;
  memberId: string | null;
  action: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

/** Uniform resultaat van elke server action. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

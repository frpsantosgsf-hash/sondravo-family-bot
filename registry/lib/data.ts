import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from '@/lib/env';
import { RANK_LADDER, sortRanks } from '@/lib/ranks';
import type {
  AuditEntry,
  FamilySettings,
  Rank,
  RegistryData,
  RegistryMember,
  Viewer,
} from '@/types';
import type { AuditLogRow, Json, MemberRow, RankRow } from '@/types/database';

const FALLBACK_SETTINGS: FamilySettings = {
  familyName: 'The Sondravo Family',
  memberLimit: 20,
  updatedAt: null,
};

function toRank(row: RankRow): Rank {
  return {
    key: row.key,
    label: row.label,
    glyph: row.glyph,
    tone: row.tone,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

function toMember(row: MemberRow): RegistryMember {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    discordUsername: row.discord_username,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    joinedAt: row.joined_at,
  };
}

function asRecord(value: Json | null): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Haalt alles op wat de pagina nodig heeft, in één keer.
 *
 * De privévelden (interne notitie, Discord user ID) worden alleen opgevraagd
 * wanneer de bezoeker admin is. Zou die query tóch gedaan worden door een
 * gewone bezoeker, dan geeft RLS nul rijen terug — de UI is niet de beveiliging.
 */
export const getRegistryData = cache(async (): Promise<RegistryData> => {
  if (!isSupabaseConfigured) {
    return {
      members: [],
      ranks: RANK_LADDER,
      settings: FALLBACK_SETTINGS,
      viewer: null,
      configError: SUPABASE_CONFIG_ERROR,
    };
  }

  const supabase = await createClient();

  const [{ data: authData }, membersResult, ranksResult, settingsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('members').select('*').order('name', { ascending: true }),
    supabase.from('ranks').select('*').order('sort_order', { ascending: true }),
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  const user = authData?.user ?? null;

  let viewer: Viewer | null = null;
  if (user) {
    const { data: adminFlag } = await supabase.rpc('is_admin', {});
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const customClaims = (metadata['custom_claims'] ?? {}) as Record<string, unknown>;

    const name =
      (typeof customClaims['global_name'] === 'string' && customClaims['global_name']) ||
      (typeof metadata['full_name'] === 'string' && metadata['full_name']) ||
      (typeof metadata['name'] === 'string' && metadata['name']) ||
      (typeof metadata['user_name'] === 'string' && metadata['user_name']) ||
      user.email ||
      'Onbekend';

    viewer = {
      id: user.id,
      name: String(name),
      avatarUrl: typeof metadata['avatar_url'] === 'string' ? metadata['avatar_url'] : null,
      isAdmin: adminFlag === true,
    };
  }

  const ranks = ranksResult.data?.length ? sortRanks(ranksResult.data.map(toRank)) : RANK_LADDER;
  const members = (membersResult.data ?? []).map(toMember);

  if (viewer?.isAdmin && members.length > 0) {
    const { data: privateRows } = await supabase
      .from('private_member_data')
      .select('member_id, discord_user_id, internal_note');

    const byId = new Map(
      (privateRows ?? []).map((row) => [row.member_id, row] as const),
    );

    for (const member of members) {
      const extra = byId.get(member.id);
      member.discordUserId = extra?.discord_user_id ?? null;
      member.internalNote = extra?.internal_note ?? null;
    }
  }

  const settings: FamilySettings = settingsResult.data
    ? {
        familyName: settingsResult.data.family_name,
        memberLimit: settingsResult.data.member_limit,
        updatedAt: settingsResult.data.updated_at,
      }
    : FALLBACK_SETTINGS;

  const failure = membersResult.error ?? ranksResult.error ?? settingsResult.error;

  return {
    members,
    ranks,
    settings,
    viewer,
    configError: failure
      ? 'Kon de ledenlijst niet laden. Controleer of de SQL-migraties zijn uitgevoerd.'
      : null,
  };
});

/** History. Geeft een lege lijst terug voor iedereen die geen admin is (RLS). */
export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row: AuditLogRow) => ({
    id: row.id,
    adminName: row.admin_name,
    memberName: row.member_name,
    memberId: row.member_id,
    action: row.action,
    oldValue: asRecord(row.old_value),
    newValue: asRecord(row.new_value),
    createdAt: row.created_at,
  }));
}

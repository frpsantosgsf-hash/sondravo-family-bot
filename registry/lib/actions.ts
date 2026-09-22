'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import type { ActionResult } from '@/types';

/* -------------------------------------------------------------------------- */
/* Validatie                                                                   */
/* -------------------------------------------------------------------------- */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

const memberSchema = z.object({
  id: z
    .string()
    .uuid('Ongeldig lid-ID.')
    .nullable()
    .catch(null),
  name: z
    .string()
    .trim()
    .min(1, 'Naam is verplicht.')
    .max(64, 'Naam mag maximaal 64 tekens zijn.'),
  rank: z
    .string()
    .trim()
    .min(1, 'Kies een rang.')
    .max(48),
  discordUsername: optionalText(64),
  discordUserId: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || /^[0-9]{5,32}$/.test(value), {
      message: 'Discord user ID bestaat alleen uit cijfers (17–20 lang).',
    }),
  phone: optionalText(32),
  avatarUrl: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || /^https:\/\/\S+$/i.test(value), {
      message: 'Avatar URL moet met https:// beginnen.',
    }),
  joinedAt: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: 'Gebruik een geldige datum.',
    }),
  internalNote: optionalText(2000),
});

const settingsSchema = z.object({
  memberLimit: z.coerce
    .number()
    .int('Gebruik een heel getal.')
    .min(1, 'Minimaal 1.')
    .max(500, 'Maximaal 500.'),
  familyName: z
    .string()
    .trim()
    .min(1, 'Naam is verplicht.')
    .max(64, 'Naam mag maximaal 64 tekens zijn.'),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !result[key]) {
      result[key] = issue.message;
    }
  }
  return result;
}

/** Zet een databasefout om in iets dat een mens begrijpt. */
function friendlyError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Er ging iets mis. Probeer het opnieuw.';

  switch (error.code) {
    case '42501':
      return 'Geen toegang. Alleen Lead/Admin accounts mogen wijzigen.';
    case '23505':
      return 'Er bestaat al een lid met deze naam.';
    case '23503':
      return 'Die rang bestaat niet (meer).';
    case '23514':
      return 'Een van de velden voldoet niet aan de regels.';
    case 'P0002':
      return 'Dit lid bestaat niet meer.';
    default:
      return error.message || 'Er ging iets mis. Probeer het opnieuw.';
  }
}

function refresh() {
  revalidatePath('/');
  revalidatePath('/leden');
}

function readNullable(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/* -------------------------------------------------------------------------- */
/* Acties                                                                      */
/* -------------------------------------------------------------------------- */

/** Lid toevoegen of bijwerken. Gebruikt met `useActionState`. */
export async function saveMemberAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const rawId = readNullable(formData, 'id');
  const parsed = memberSchema.safeParse({
    id: rawId === '' ? null : rawId,
    name: readNullable(formData, 'name'),
    rank: readNullable(formData, 'rank'),
    discordUsername: readNullable(formData, 'discordUsername'),
    discordUserId: readNullable(formData, 'discordUserId'),
    phone: readNullable(formData, 'phone'),
    avatarUrl: readNullable(formData, 'avatarUrl'),
    joinedAt: readNullable(formData, 'joinedAt'),
    internalNote: readNullable(formData, 'internalNote'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Controleer de ingevulde velden.',
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.rpc('admin_save_member', {
    p_id: input.id,
    p_name: input.name,
    p_rank: input.rank,
    p_discord_username: input.discordUsername,
    p_discord_user_id: input.discordUserId,
    p_phone: input.phone,
    p_avatar_url: input.avatarUrl,
    p_joined_at: input.joinedAt,
    p_internal_note: input.internalNote,
  });

  if (error) {
    return { ok: false, error: friendlyError(error) };
  }

  refresh();
  return {
    ok: true,
    message: input.id ? `${input.name} is bijgewerkt.` : `${input.name} is toegevoegd.`,
  };
}

/** Lid verwijderen. */
export async function deleteMemberAction(memberId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!z.string().uuid().safeParse(memberId).success) {
    return { ok: false, error: 'Ongeldig lid.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .delete()
    .eq('id', memberId)
    .select('name')
    .maybeSingle();

  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: 'Dit lid bestaat niet meer.' };

  refresh();
  return { ok: true, message: `${data.name} is verwijderd.` };
}

/** Alleen de rang wijzigen — de snelle route vanuit de ledenlijst. */
export async function changeRankAction(memberId: string, rank: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!z.string().uuid().safeParse(memberId).success) {
    return { ok: false, error: 'Ongeldig lid.' };
  }
  if (!z.string().min(1).max(48).safeParse(rank).success) {
    return { ok: false, error: 'Ongeldige rang.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .update({ rank })
    .eq('id', memberId)
    .select('name')
    .maybeSingle();

  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: 'Dit lid bestaat niet meer.' };

  refresh();
  return { ok: true, message: `${data.name} staat nu in een andere rang.` };
}

/** Familienaam en maximale capaciteit. */
export async function saveSettingsAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = settingsSchema.safeParse({
    memberLimit: readNullable(formData, 'memberLimit'),
    familyName: readNullable(formData, 'familyName'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Controleer de ingevulde velden.',
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_update_settings', {
    p_member_limit: parsed.data.memberLimit,
    p_family_name: parsed.data.familyName,
  });

  if (error) return { ok: false, error: friendlyError(error) };

  refresh();
  return { ok: true, message: 'Instellingen opgeslagen.' };
}

/** History ophalen voor de admin-modal. Leeg voor iedereen zonder rechten. */
export async function getAuditLogAction(): Promise<
  { ok: true; entries: import('@/types').AuditEntry[] } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { getAuditLog } = await import('@/lib/data');
  return { ok: true, entries: await getAuditLog(150) };
}

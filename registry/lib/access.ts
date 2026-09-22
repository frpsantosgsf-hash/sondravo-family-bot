import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, getApplicantRoleId, getMemberRoleId } from '@/lib/env';
import { fetchDiscordProfile } from '@/lib/discord';
import { discordIdFromMetadata } from '@/lib/admin-sync';

/**
 * Wat de huidige bezoeker mag zien.
 *
 * Drie niveaus, en ze stapelen: wie familie is mag ook solliciteren zien, wie
 * admin is mag alles. De rollen worden live bij Discord opgevraagd, zodat een
 * rol die vanochtend is weggehaald vanmiddag niet nog werkt.
 */
export interface ViewerAccess {
  /** Is er überhaupt iemand ingelogd? */
  signedIn: boolean;
  /** Lead/Admin: beheert de lijst en de sollicitaties. */
  isAdmin: boolean;
  /** Draagt de familierol in Discord. */
  isFamily: boolean;
  /**
   * Staat als lid in het register, met dit Discord-account eraan gekoppeld.
   *
   * Dit is wat de database gebruikt om rijen door te laten, en dus wat
   * werkelijk toegang geeft. De rol in Discord zegt daar niets over: een lid
   * dat met de hand is toegevoegd zonder Discord-ID draagt de rol wél, maar
   * krijgt van de database niets te zien.
   */
  inRegister: boolean;
  /** Draagt de sollicitatierol: mag het formulier openen. */
  canApply: boolean;
  /** Het Discord-account van de bezoeker, voor zover bekend. */
  discord: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  /**
   * Gezet wanneer Discord niet te bereiken was. De site laat dan niets extra
   * zien — bij twijfel dicht — maar kan wél uitleggen dat het aan de
   * verbinding ligt en niet aan de rechten van de bezoeker.
   */
  discordUnavailable: boolean;
}

const GEEN_TOEGANG: ViewerAccess = {
  signedIn: false,
  isAdmin: false,
  isFamily: false,
  inRegister: false,
  canApply: false,
  discord: { userId: null, username: null, displayName: null, avatarUrl: null },
  discordUnavailable: false,
};

export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  if (!isSupabaseConfigured) return GEEN_TOEGANG;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return GEEN_TOEGANG;

  // Dezelfde vraag als de database stelt, zodat de knoppen niet iets beloven
  // wat Row Level Security daarna weigert.
  const [{ data: isAdmin }, { data: inRegister }] = await Promise.all([
    supabase.rpc('is_admin', {}),
    supabase.rpc('is_family_member', {}),
  ]);

  const discordUserId = discordIdFromMetadata(user.user_metadata as Record<string, unknown>);

  const basis: ViewerAccess = {
    ...GEEN_TOEGANG,
    signedIn: true,
    isAdmin: isAdmin === true,
    inRegister: inRegister === true,
    discord: { ...GEEN_TOEGANG.discord, userId: discordUserId },
  };

  if (!discordUserId) return basis;

  const memberRoleId = getMemberRoleId();
  const applicantRoleId = getApplicantRoleId();

  let profile: Awaited<ReturnType<typeof fetchDiscordProfile>> = null;
  try {
    profile = await fetchDiscordProfile(discordUserId);
  } catch {
    // Discord ligt eruit of het token klopt niet. Rechten worden dan niet
    // ruimer, alleen de uitleg op het scherm verandert.
    return { ...basis, discordUnavailable: true };
  }

  // Niet in de server betekent geen rollen, en dus precies wat basis al zegt.
  if (!profile || !profile.inGuild) return basis;

  return {
    ...basis,
    isFamily: memberRoleId !== null && profile.roleIds.includes(memberRoleId),
    canApply: applicantRoleId !== null && profile.roleIds.includes(applicantRoleId),
    discord: {
      userId: discordUserId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    },
  };
});

/**
 * Mag deze bezoeker de ledenlijst zien?
 *
 * Bewust op inRegister en niet op de Discord-rol: de database laat alleen
 * rijen door aan wie zelf op de lijst staat. Zou dit op de rol gaan, dan
 * kreeg iemand een lege pagina zonder uitleg in plaats van een nette melding.
 */
export function mayViewRegistry(access: ViewerAccess): boolean {
  return access.isAdmin || access.inRegister;
}

/**
 * Draagt de familierol, maar hangt nog aan geen enkel lid op de lijst.
 *
 * Dat is een koppeling die een Lead moet leggen — niet iets wat de bezoeker
 * zelf kan oplossen, dus dat hoort hij ook te horen.
 */
export function isUnlinkedFamily(access: ViewerAccess): boolean {
  return access.isFamily && !access.inRegister && !access.isAdmin;
}

/** Mag deze bezoeker het sollicitatieformulier openen? */
export function mayApply(access: ViewerAccess): boolean {
  return access.canApply || access.isAdmin || access.isFamily;
}

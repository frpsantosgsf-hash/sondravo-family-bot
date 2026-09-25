import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * De losse eindjes die alleen de Lead kan aantrekken.
 *
 * Bewust maar een handvol getallen: dit voedt het overzicht, niet de pagina's
 * zelf. Wie de sollicitaties wil lezen gaat naar de sollicitaties.
 */
export interface LeadOverzicht {
  /** Nog niet aangeraakt: staat op 'nieuw'. */
  nieuweSollicitaties: number;
  /** Alles wat nog een besluit nodig heeft. */
  openSollicitaties: number;
  /** Stemmingen die gesloten zijn maar nog geen besluit hebben. */
  wachtOpBesluit: number;
}

const LEEG: LeadOverzicht = {
  nieuweSollicitaties: 0,
  openSollicitaties: 0,
  wachtOpBesluit: 0,
};

export const getLeadOverzicht = cache(async (): Promise<LeadOverzicht> => {
  if (!isSupabaseConfigured) return LEEG;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('applications')
    .select('status, voting_closed')
    .is('archived_at', null)
    .in('status', ['nieuw', 'in_behandeling']);

  if (error || !data) return LEEG;

  return {
    nieuweSollicitaties: data.filter((rij) => rij.status === 'nieuw').length,
    openSollicitaties: data.length,
    wachtOpBesluit: data.filter((rij) => rij.voting_closed === true).length,
  };
});

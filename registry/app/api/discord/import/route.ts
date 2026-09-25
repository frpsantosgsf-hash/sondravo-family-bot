import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberRoleId } from '@/lib/env';
import {
  fetchGuildMembers,
  fetchGuildRoles,
  isDiscordSyncEnabled,
  normalizeName,
  type GuildMember,
} from '@/lib/discord';
import { DEFAULT_RANK_KEY, RANK_LADDER } from '@/lib/ranks';

/** Een rij op de ledenlijst, zoals we hem hier nodig hebben. */
interface LidRij {
  id: string;
  name: string;
  rank: string;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Haalt de ledenlijst rechtstreeks uit de Discord-rollen.
 *
 * De familierol is hier de bron van waarheid: wie die rol draagt hoort op de
 * lijst, en de rangrol die iemand daarnaast heeft bepaalt zijn plek. Daarmee
 * is het raden op namen van de baan — die gok koppelde twee mensen met een
 * gelijkende naam aan elkaar.
 *
 * De rol is de lijst, dus wie hem niet draagt gaat er ook af. Dat staat in het
 * rapport en in de geschiedenis, zodat altijd terug te zien is wat er weg is
 * gegaan en waarom.
 */
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  return voerImportUit(await createClient());
}

/**
 * Dezelfde import, maar dan door Vercel op een vast tijdstip aangeroepen.
 *
 * Vercel Cron stuurt een GET met `Authorization: Bearer $CRON_SECRET`. Zonder
 * die sleutel — of zonder dat de sleutel gezet is — gebeurt er niets: dit
 * adres mag nooit door een willekeurige bezoeker aangeroepen kunnen worden.
 *
 * Draait als service_role, want er is geen ingelogde admin bij een cronjob.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Niet geautoriseerd.' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt; de automatische sync kan niet schrijven.' },
      { status: 503 },
    );
  }

  return voerImportUit(createAdminClient());
}

/** De eigenlijke sync. Werkt met een adminsessie én met de service-role. */
async function voerImportUit(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NextResponse> {
  if (!isDiscordSyncEnabled()) {
    return NextResponse.json(
      { error: 'Discord-koppeling staat uit. Zet DISCORD_BOT_TOKEN en DISCORD_GUILD_ID in Vercel.' },
      { status: 409 },
    );
  }

  const memberRoleId = getMemberRoleId();
  if (!memberRoleId) {
    return NextResponse.json(
      { error: 'Zet DISCORD_MEMBER_ROLE_ID in Vercel op de rol-ID van de familierol.' },
      { status: 409 },
    );
  }

  const [guildLeden, guildRollen] = await Promise.all([fetchGuildMembers(), fetchGuildRoles()]);

  if (!guildLeden || !guildRollen) {
    return NextResponse.json(
      { error: 'Kon de Discord-server niet uitlezen. Staat SERVER MEMBERS INTENT aan bij je bot?' },
      { status: 502 },
    );
  }

  if (!guildRollen.has(memberRoleId)) {
    return NextResponse.json(
      { error: 'De familierol uit DISCORD_MEMBER_ROLE_ID bestaat niet in deze server.' },
      { status: 409 },
    );
  }

  // Rangrollen worden op naam herkend, niet op ID. Zo hoeft er voor negen
  // rangen geen rijtje ID's in de environment te staan dat bij elke nieuwe
  // server opnieuw goed gezet moet worden.
  const rangPerRolId = new Map<string, { key: string; sortOrder: number }>();
  for (const [rolId, rolNaam] of guildRollen) {
    const kaal = normalizeName(rolNaam);
    const rang = RANK_LADDER.find((r) => normalizeName(r.label) === kaal || r.key === kaal);
    if (rang) rangPerRolId.set(rolId, { key: rang.key, sortOrder: rang.sortOrder });
  }

  const [{ data: leden, error: ledenError }, { data: koppelingen }] = await Promise.all([
    supabase.from('members').select('id, name, rank'),
    supabase.from('private_member_data').select('member_id, discord_user_id'),
  ]);

  if (ledenError || !leden) {
    return NextResponse.json({ error: 'Kon de ledenlijst niet ophalen.' }, { status: 500 });
  }

  const metFamilierol = guildLeden.filter((lid) => lid.roleIds.includes(memberRoleId));
  const familieIds = new Set(metFamilierol.map((lid) => lid.discordUserId));

  // Welke rij op de lijst hoort bij welk Discord-account?
  const discordIdPerLid = new Map<string, string>();
  for (const koppeling of koppelingen ?? []) {
    if (koppeling.discord_user_id) discordIdPerLid.set(koppeling.member_id, koppeling.discord_user_id);
  }

  const rijen: LidRij[] = leden;
  const lidOpDiscordId = new Map<string, LidRij>();
  for (const lid of rijen) {
    const discordId = discordIdPerLid.get(lid.id);
    if (discordId) lidOpDiscordId.set(discordId, lid);
  }

  /**
   * Rijen die door niemand met de familierol worden geclaimd. Dat zijn leden
   * zonder koppeling, maar ook leden die aan het verkeerde account hangen —
   * precies die laatste groep moet weer los kunnen, anders blijft een foute
   * koppeling voor altijd staan.
   */
  const vrijeRijen = rijen.filter((lid) => {
    const discordId = discordIdPerLid.get(lid.id);
    return !discordId || !familieIds.has(discordId);
  });
  const nogVrij = new Set(vrijeRijen.map((lid) => lid.id));

  const toegevoegd: string[] = [];
  const overgenomen: string[] = [];
  const meerdereOpties: string[] = [];
  const rangAangepast: string[] = [];
  const zonderRangrol: string[] = [];
  const mislukt: string[] = [];
  let ongewijzigd = 0;

  /** Zet de rang, foto en @naam van een bestaande rij gelijk aan Discord. */
  async function werkRijBij(
    lid: LidRij,
    rang: string,
    discordLid: GuildMember,
  ): Promise<'fout' | 'rang' | 'gelijk'> {
    const patch: { rank?: string; avatar_url?: string; discord_username?: string } = {
      discord_username: discordLid.username,
    };
    if (lid.rank !== rang) patch.rank = rang;
    if (discordLid.avatarUrl) patch.avatar_url = discordLid.avatarUrl;

    const { error } = await supabase.from('members').update(patch).eq('id', lid.id);
    if (error) return 'fout';
    return patch.rank ? 'rang' : 'gelijk';
  }

  /** Hangt een rij aan een Discord-account, ook als er al een fout ID stond. */
  async function koppelRij(memberId: string, discordUserId: string): Promise<boolean> {
    const { data: bestaandeRij } = await supabase
      .from('private_member_data')
      .select('member_id')
      .eq('member_id', memberId)
      .maybeSingle();

    const { error } = bestaandeRij
      ? await supabase
          .from('private_member_data')
          .update({ discord_user_id: discordUserId, updated_at: new Date().toISOString() })
          .eq('member_id', memberId)
      : await supabase
          .from('private_member_data')
          .insert({ member_id: memberId, discord_user_id: discordUserId });

    return !error;
  }

  for (const discordLid of metFamilierol) {
    // De hoogste rang wint, zodat iemand met twee rangrollen niet op de
    // laagste belandt.
    const rangen = discordLid.roleIds
      .map((rolId) => rangPerRolId.get(rolId))
      .filter((rang): rang is { key: string; sortOrder: number } => rang !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const rang = rangen[0]?.key ?? DEFAULT_RANK_KEY;
    if (rangen.length === 0) zonderRangrol.push(discordLid.displayName);

    // 1. Al aan dit account gekoppeld: gewoon bijwerken.
    const bestaand = lidOpDiscordId.get(discordLid.discordUserId);
    if (bestaand) {
      const uitkomst = await werkRijBij(bestaand, rang, discordLid);
      if (uitkomst === 'fout') mislukt.push(bestaand.name);
      else if (uitkomst === 'rang') rangAangepast.push(`${bestaand.name}: ${bestaand.rank} -> ${rang}`);
      else ongewijzigd += 1;
      continue;
    }

    /*
     * 2. Staat hij al op de lijst onder een rij die niemand anders claimt?
     *
     * Overnemen gebeurt alleen bij een exact gelijke naam. Een rij overnemen
     * betekent dat iemand het telefoonnummer en de interne notitie van die rij
     * erft, en daarmee toegang tot de besloten lijst. Dat op een losse
     * gelijkenis doen is te riskant: "Jayden" zit ook in "Jayden Loopie", en
     * dan krijgt de verkeerde persoon andermans gegevens.
     */
    const kaal = normalizeName(discordLid.displayName);
    const kandidaten = vrijeRijen.filter(
      (lid) => nogVrij.has(lid.id) && normalizeName(lid.name) === kaal,
    );

    if (kandidaten.length === 1) {
      const rij = kandidaten[0]!;
      nogVrij.delete(rij.id);

      const gekoppeld = await koppelRij(rij.id, discordLid.discordUserId);
      const uitkomst = await werkRijBij(rij, rang, discordLid);

      if (!gekoppeld || uitkomst === 'fout') {
        mislukt.push(rij.name);
      } else {
        overgenomen.push(`${rij.name} -> @${discordLid.username}`);
      }
      continue;
    }

    /*
     * Meerdere rijen met dezelfde naam: handen eraf. Zouden we hier een nieuwe
     * rij aanmaken, dan blijven die twee over als "niemand claimt ze" en
     * worden ze verderop verwijderd — inclusief hun telefoonnummers en
     * notities. Dus markeren we ze als bezet en melden we ze.
     */
    if (kandidaten.length > 1) {
      for (const rij of kandidaten) nogVrij.delete(rij.id);
      meerdereOpties.push(`${discordLid.displayName} (${kandidaten.length} rijen)`);
      continue;
    }

    /*
     * 3. Nog niet op de lijst: erbij zetten, met de servernaam als naam.
     *
     * Een gewone insert en niet admin_save_member, want die functie eist een
     * ingelogde admin. De nachtelijke sync draait als service_role en zou daar
     * op stuklopen. Het slug-veld vult de trigger zelf.
     */
    const { data: nieuw, error } = await supabase
      .from('members')
      .insert({
        name: discordLid.displayName.slice(0, 64),
        rank: rang,
        discord_username: discordLid.username,
        avatar_url: discordLid.avatarUrl,
        // Vandaag, want vandaag zien we hem voor het eerst. Zonder deze datum
        // zou de gangpot hem vanaf de allereerste week laten meetellen en
        // stond een nieuw lid meteen weken in het rood.
        joined_at: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .maybeSingle();

    if (error || !nieuw) {
      mislukt.push(discordLid.displayName);
      continue;
    }

    if (!(await koppelRij(nieuw.id, discordLid.discordUserId))) {
      mislukt.push(discordLid.displayName);
      continue;
    }

    toegevoegd.push(discordLid.displayName);
  }

  /*
   * Rijen die na afloop nog vrij zijn, horen bij niemand met de familierol en
   * gaan van de lijst af. De rol ís de ledenlijst: draagt iemand hem niet, dan
   * hoort hij er ook niet op en telt hij niet mee in de teller.
   *
   * Eén rem daarop: levert Discord geen enkel lid met de familierol op, dan
   * klopt er iets niet aan de kant van Discord en zou dit de hele lijst
   * leegvegen. In dat geval blijft alles staan en meldt hij het alleen.
   */
  const overgebleven = vrijeRijen.filter((lid) => nogVrij.has(lid.id));
  const verwijderd: string[] = [];
  const zonderFamilierol: string[] = [];

  if (metFamilierol.length === 0) {
    zonderFamilierol.push(...overgebleven.map((lid) => lid.name));
  } else {
    for (const lid of overgebleven) {
      const { error } = await supabase.from('members').delete().eq('id', lid.id);
      if (error) {
        mislukt.push(lid.name);
      } else {
        verwijderd.push(lid.name);
      }
    }
  }

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json({
    metFamilierol: metFamilierol.length,
    toegevoegd,
    overgenomen,
    meerdereOpties,
    rangAangepast,
    ongewijzigd,
    zonderRangrol,
    verwijderd,
    zonderFamilierol,
    mislukt,
  });
}

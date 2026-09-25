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
  /** De kleur van de Discord-rol, als hex. De UI dempt hem zelf. */
  color: string;
  sortOrder: number;
}

export interface RankGroup {
  rank: Rank;
  members: RegistryMember[];
}

export interface FamilySettings {
  familyName: string;
  memberLimit: number;
  /** Staat het sollicitatieformulier open voor nieuwe aanmeldingen? */
  applicationsOpen: boolean;
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

/* ---------------------------------------------------------------------------
   Gangpot
   --------------------------------------------------------------------------- */

/** Wat een lid in één week gedaan heeft. */
export type PotWeekStatus = 'betaald' | 'open' | 'nvt';

export interface PotWeek {
  /** De vrijdag van deze week, als 'JJJJ-MM-DD'. */
  friday: string;
  weekNumber: number;
  /** Hoeveel leden betaald hebben. */
  paid: number;
  /** Hoeveel leden deze week hoorden te betalen. */
  due: number;
  /** Wat er binnenkwam. */
  received: number;
}

export interface PotMember {
  id: string;
  name: string;
  rank: string;
  avatarUrl: string | null;
  /** De eerste vrijdag waarop dit lid meetelt. */
  since: string;
  /** Status per vrijdag, gesleuteld op de datum. */
  weeks: Record<string, PotWeekStatus>;
  openWeeks: number;
  openAmount: number;
  /** Aantal weken dat wél betaald is, en wat dat samen was. */
  paidWeeks: number;
  paidAmount: number;
}

/** Wie een bijdrage afvinkte en wanneer. */
export interface PotMark {
  by: string | null;
  at: string;
}

/** Een uitgave of een inkomst — dezelfde vorm, zodat de UI er één lijst van maakt. */
export interface PotEntry {
  id: string;
  date: string;
  description: string;
  /** "Betaald door" bij een uitgave, "bron" bij een inkomst. */
  who: string | null;
  amount: number;
  note: string | null;
  createdBy: string | null;
}

export interface PotTotals {
  /** Beginsaldo uit de instellingen. */
  opening: number;
  /** Binnengekomen wekelijkse bijdragen. */
  contributions: number;
  /** Overige inkomsten. */
  income: number;
  expenses: number;
  /** Nog te betalen bijdragen. Zit níét in het saldo. */
  outstanding: number;
  /** Wat er nu in de pot zit. */
  balance: number;
}

export interface PotData {
  weeklyAmount: number;
  openingBalance: number;
  firstFriday: string;
  currentFriday: string;
  weeks: PotWeek[];
  members: PotMember[];
  /**
   * Wie welke bijdrage afvinkte, gesleuteld op "lid|vrijdag".
   *
   * Los van de leden zelf: een lid heeft één regel per week, en die zou
   * anders twee keer in de JSON staan.
   */
  marks: Record<string, PotMark>;
  expenses: PotEntry[];
  income: PotEntry[];
  totals: PotTotals;
  /** Het lid dat de bezoeker zelf is, voor zover bekend. */
  meId: string | null;
  isAdmin: boolean;
  /** Gezet wanneer de gegevens niet geladen konden worden. */
  error: string | null;
}

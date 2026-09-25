import type { AuditEntry } from '@/types';

/** Ledennaam zoals hij in de familie geschreven wordt. */
export const NAME_PREFIX = 'SDF';

export function displayName(name: string): string {
  const clean = name.trim();
  if (!clean) return NAME_PREFIX;
  // Voorkomt "SDF | SDF | Lahaye" wanneer iemand het prefix zelf intypt.
  if (/^sdf\s*\|/i.test(clean)) return clean.replace(/^sdf\s*\|\s*/i, `${NAME_PREFIX} | `);
  return `${NAME_PREFIX} | ${clean}`;
}

export function initials(name: string): string {
  const parts = name
    .replace(/^sdf\s*\|\s*/i, '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);

  if (parts.length === 0) return '??';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${(parts[0] ?? '').charAt(0)}${(parts[1] ?? '').charAt(0)}`.toUpperCase();
}

/** Stabiele "willekeurige" tint per lid, zodat fallback-avatars niet allemaal gelijk zijn. */
export function avatarSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return hash;
}

export function formatDiscordHandle(handle: string | null): string | null {
  if (!handle) return null;
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : null;
}

export function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.trim() || null;
}

const DATE_FORMAT = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATETIME_FORMAT = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATETIME_FORMAT.format(date);
}

export function relativeTime(value: string): string {
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;
  return formatDate(value) ?? '';
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) return null;
  const raw = value[key];
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

/**
 * Zet een auditregel om naar een leesbare zin, bijvoorbeeld:
 * "Lahaye zette Renzo van Mpikambana naar Zoky".
 */
export function describeAuditEntry(
  entry: AuditEntry,
  rankLabel: (key: string) => string,
): string {
  const actor = entry.adminName?.trim() || 'Systeem';
  const member = entry.memberName?.trim() || 'een lid';

  switch (entry.action) {
    case 'member.created': {
      const rank = readString(entry.newValue, 'rank');
      return `${actor} voegde ${member} toe${rank ? ` als ${rankLabel(rank)}` : ''}`;
    }
    case 'member.deleted': {
      const rank = readString(entry.oldValue, 'rank');
      return `${actor} verwijderde ${member}${rank ? ` uit ${rankLabel(rank)}` : ''}`;
    }
    case 'member.rank_changed': {
      const from = readString(entry.oldValue, 'rank');
      const to = readString(entry.newValue, 'rank');
      return `${actor} zette ${member} van ${from ? rankLabel(from) : '—'} naar ${to ? rankLabel(to) : '—'}`;
    }
    case 'member.renamed': {
      const from = readString(entry.oldValue, 'name');
      const to = readString(entry.newValue, 'name');
      return `${actor} hernoemde ${from ?? member} naar ${to ?? member}`;
    }
    case 'member.phone_changed': {
      const to = readString(entry.newValue, 'phone');
      return to
        ? `${actor} wijzigde het telefoonnummer van ${member}`
        : `${actor} verwijderde het telefoonnummer van ${member}`;
    }
    case 'member.private_updated':
      return `${actor} wijzigde de privégegevens van ${member}`;
    case 'member.private_cleared':
      return `${actor} wiste de privégegevens van ${member}`;
    case 'settings.updated': {
      const from = entry.oldValue?.['member_limit'];
      const to = entry.newValue?.['member_limit'];
      if (typeof from === 'number' && typeof to === 'number' && from !== to) {
        return `${actor} wijzigde de ledenlimiet van ${from} naar ${to}`;
      }
      return `${actor} wijzigde de instellingen`;
    }
    case 'pot.contribution.added':
      return `${actor} vinkte ${member} af als betaald`;
    case 'pot.contribution.removed':
      return `${actor} zette ${member} terug op open`;
    case 'pot.contribution.updated': {
      // Dit gebeurt in de praktijk maar één keer: als iemand de familie
      // verlaat en zijn betaalregels losgekoppeld worden van de ledenlijst.
      const was = readString(entry.oldValue, 'member_id');
      const nu = readString(entry.newValue, 'member_id');
      if (was && !nu) return `${member} verliet de familie; zijn betaalhistorie blijft staan`;
      return `${actor} wijzigde de betaalhistorie van ${member}`;
    }
    case 'pot.expense.added':
      return `${actor} boekte een uitgave${beschrijf(entry.newValue)}`;
    case 'pot.expense.updated':
      return `${actor} wijzigde een uitgave${beschrijf(entry.newValue)}`;
    case 'pot.expense.removed':
      return `${actor} verwijderde een uitgave${beschrijf(entry.oldValue)}`;
    case 'pot.income.added':
      return `${actor} boekte een inkomst${beschrijf(entry.newValue)}`;
    case 'pot.income.updated':
      return `${actor} wijzigde een inkomst${beschrijf(entry.newValue)}`;
    case 'pot.income.removed':
      return `${actor} verwijderde een inkomst${beschrijf(entry.oldValue)}`;
    case 'pot.settings.updated':
      return `${actor} wijzigde de instellingen van de gangpot`;
    case 'member.updated':
    default:
      return `${actor} wijzigde ${member}`;
  }
}

/** " — 5 x melee" bij een kasboekregel, of niets als de omschrijving ontbreekt. */
function beschrijf(value: Record<string, unknown> | null): string {
  const omschrijving = readString(value, 'description');
  return omschrijving ? ` — ${omschrijving}` : '';
}

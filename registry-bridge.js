/**
 * Brug tussen de Discord-bot en de website-ledenlijst.
 *
 * De bot praat NIET rechtstreeks met de database. Hij roept het endpoint
 * /api/bot/member van de website aan met één gedeeld geheim. Zo staat alle
 * validatie op één plek en hoeft de bot geen Supabase-sleutels te kennen.
 *
 * Benodigde environment variables:
 *   REGISTRY_URL     de publieke URL van de site, bijv. https://sondravo.vercel.app
 *   BOT_API_SECRET   exact dezelfde waarde als in de Vercel-environment
 */

const CFG = {
  baseUrl: String(process.env.REGISTRY_URL || '').replace(/\/$/, ''),
  secret: process.env.BOT_API_SECRET || '',
};

/** De rangen zoals ze in de database staan, hoog naar laag. */
const RANKS = [
  { name: 'Mpitarika', value: 'mpitarika' },
  { name: 'Lefitra', value: 'lefitra' },
  { name: 'Mpanoro', value: 'mpanoro' },
  { name: 'Mpifehy', value: 'mpifehy' },
  { name: 'Hery', value: 'hery' },
  { name: 'Mpiady', value: 'mpiady' },
  { name: 'Zoky', value: 'zoky' },
  { name: 'Mpikambana', value: 'mpikambana' },
  { name: 'Zazavao', value: 'zazavao' },
];

const DEFAULT_RANK = 'zazavao';

function isEnabled() {
  return Boolean(CFG.baseUrl && CFG.secret);
}

function rankLabel(value) {
  return RANKS.find((rank) => rank.value === value)?.name || value;
}

async function call(payload) {
  if (!isEnabled()) {
    throw new Error('De website-koppeling is niet ingesteld. Zet REGISTRY_URL en BOT_API_SECRET.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(`${CFG.baseUrl}/api/bot/member`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sondravo-bot-secret': CFG.secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      error.name === 'AbortError'
        ? 'De website reageerde niet op tijd.'
        : 'Kon de website niet bereiken.',
    );
  } finally {
    clearTimeout(timeout);
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    // Geen JSON terug; de status hieronder vertelt genoeg.
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error('De website weigert het bot-geheim. Controleer BOT_API_SECRET.');
    throw new Error(body.error || `De website gaf status ${response.status}.`);
  }

  return body;
}

/** Voegt een lid toe, of werkt het bij wanneer het Discord-account al bekend is. */
async function addMember({ discordUserId, name, discordUsername, rank, avatarUrl, actor }) {
  return call({
    action: 'add',
    discordUserId,
    name,
    discordUsername: discordUsername || null,
    rank: rank || DEFAULT_RANK,
    avatarUrl: avatarUrl || null,
    actor: actor || 'Discord bot',
  });
}

/** Haalt een lid van de ledenlijst op basis van zijn Discord-account. */
async function removeMember({ discordUserId, actor }) {
  return call({
    action: 'remove',
    discordUserId,
    actor: actor || 'Discord bot',
  });
}

module.exports = { isEnabled, addMember, removeMember, RANKS, DEFAULT_RANK, rankLabel };

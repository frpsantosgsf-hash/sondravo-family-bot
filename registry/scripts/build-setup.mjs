#!/usr/bin/env node
/**
 * Stelt supabase/setup.sql samen uit de migraties.
 *
 * Bestond niet, en daardoor liep setup.sql stil achter: hij stopte bij 0008
 * terwijl er al vijftien migraties waren. Wie het bestand als "de hele opzet"
 * vertrouwde kreeg een database zonder sollicitaties en zonder gangpot.
 *
 * Draaien met: npm run build:setup
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const migratiesMap = join(hier, '..', 'supabase', 'migrations');
const doel = join(hier, '..', 'supabase', 'setup.sql');

/**
 * Migraties die eenmalig historische gegevens overzetten horen hier niet in:
 * setup.sql is "zet de database op", niet "vul hem met de stand van vorige
 * maand". Die draai je bewust en apart.
 */
const OVERSLAAN = new Set(['0017_gangpot_beginstand.sql']);

const bestanden = (await readdir(migratiesMap))
  .filter((naam) => naam.endsWith('.sql') && !OVERSLAAN.has(naam))
  .sort();

const kop = `-- ============================================================================
--  THE SONDRAVO FAMILY — Official Family Registry
--  COMPLETE DATABASE-OPZET IN ÉÉN BESTAND
-- ============================================================================
--
--  Plak dit hele bestand in de Supabase SQL Editor en klik één keer op RUN.
--  Dat is alles. Je hoeft de losse bestanden in migrations/ niet te draaien.
--
--  Veilig om opnieuw te draaien: er ontstaan geen dubbele leden en bestaande
--  gegevens blijven staan.
--
--  Onderaan zie je een melding zoals:
--      Register bevat nu 20 leden (limiet 20).
--  Verschijnt die, dan is alles goed gegaan.
--
--  NIET MET DE HAND BEWERKEN. Dit bestand wordt samengesteld uit
--  supabase/migrations/ door \`npm run build:setup\`.
-- ============================================================================
`;

const delen = [];

for (const [index, naam] of bestanden.entries()) {
  const inhoud = await readFile(join(migratiesMap, naam), 'utf8');
  delen.push(
    [
      '',
      '-- ****************************************************************************',
      `-- *  DEEL ${index + 1} VAN ${bestanden.length}  —  ${naam}`,
      '-- ****************************************************************************',
      '',
      inhoud.trimEnd(),
      '',
    ].join('\n'),
  );
}

await writeFile(doel, `${kop}${delen.join('\n')}\n`, 'utf8');

console.log(`setup.sql samengesteld uit ${bestanden.length} migraties.`);
for (const naam of OVERSLAAN) console.log(`  overgeslagen: ${naam}`);

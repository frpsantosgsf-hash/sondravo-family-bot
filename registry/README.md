# The Sondravo Family — Official Family Registry

De officiële website van The Sondravo Family: een voorpagina met ons logo en
onze intro-clip, en daarachter de besloten kant — ledenlijst, gangpot en
sollicitaties. Alleen wie zelf op de ledenlijst staat komt daar binnen; alleen
Lead/Admin-accounts kunnen iets wijzigen.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase
(PostgreSQL + Auth + Row Level Security) · Vercel

---

## Inhoud

1. [Wat de site doet](#wat-de-site-doet)
2. [Projectstructuur](#projectstructuur)
3. [Installatie in 18 stappen](#installatie-in-18-stappen)
4. [Environment variables](#environment-variables)
5. [Eerste admin aanmaken](#eerste-admin-aanmaken)
6. [Discord-bot: /new en /verwijder](#discord-bot-new-en-verwijder)
7. [De intro-clip vervangen](#de-intro-clip-vervangen)
8. [Beveiliging](#beveiliging)
9. [Lokaal ontwikkelen](#lokaal-ontwikkelen)
10. [Wat jij zelf nog moet doen](#wat-jij-zelf-nog-moet-doen)

---

## Wat de site doet

### Voorpagina (`/`)
- Een cinematische intro-lus: het logo komt rustig in beeld en blijft ±3,5
  seconde staan, daarna vloeit er ±10 seconden uit onze clip in — met
  letterbox-balken, een trage inzoom, filmkorrel en een donkere rand eromheen —
  en dan is het logo er weer. Dat blijft zo doorgaan
- Te pauzeren met één knop (het logo blijft dan staan) en die keuze wordt
  onthouden; geluid staat standaard uit
- Live ledenteller met capaciteitsbalk
- Knop naar de ledenlijst

### Ledenlijst (`/leden`) — alleen voor de familie
- Alle leden, automatisch gegroepeerd per rang
- Rangen in vaste volgorde (nooit alfabetisch), elk in de kleur van zijn
  Discord-rol — gedempt, zodat de lijst rustig blijft
- Lege rangen zijn verborgen en verschijnen automatisch zodra er iemand in komt
- Discord-naam, avatar (of nette initialen), ingame telefoonnummer
- Realtime zoeken op naam, Discord of rang + filter per rang
- Teller `20 / 20 MEMBERS` — het aantal komt uit de database, de limiet uit
  `settings` en is door een admin aanpasbaar

### Leadkamer (`/lead`) — alleen voor Lead/Admin
Eén scherm met alles wat vandaag aandacht vraagt, zodat de leiding niet drie
pagina's en een instellingenvenster hoeft af te gaan.
- **Vraagt aandacht** — alleen wat écht iets vraagt: nieuwe sollicitaties,
  gesloten stemmingen die op een besluit wachten, leden die deze week nog niet
  betaald hebben, en leden zonder Discord-koppeling (die komen zelf de site
  niet op). Is alles bij, dan staat er één rustige groene regel
- **Kerncijfers** — saldo, ledenaantal en de stand van deze week, elk een link
  naar de pagina erachter
- **Snelle acties** — rollen ophalen, sollicitaties open of dicht, en het
  gangpot-bericht naar Discord sturen
- **Laatste activiteit** — de zes meest recente regels uit het logboek

### Gangpot (`/gangpot`) — alleen voor de familie
De kas van de familie, waar eerst een spreadsheet voor rondging.
- **Saldo** bovenaan: beginsaldo, ontvangen, uitgegeven en wat er nog openstaat.
  Het saldo wordt élke keer opnieuw uitgerekend en nergens opgeslagen, zodat er
  geen tweede waarheid kan ontstaan
- **Deze week** — alle leden onder elkaar met één knop *Betaald / Open*. Geen
  raster van twintig leden bij achttien weken: dat past op geen telefoon
- **Kasboek** — uitgaven en inkomsten, elk in een eigen lijst zodat een
  verkeerd voorteken onmogelijk is
- **Historie** — per lid een rij bolletjes, zwaarste achterstand bovenaan
- Leden lezen mee, alleen de Lead vinkt af en boekt
- Elke vrijdagochtend één bericht in Discord dat zichzelf bijwerkt zodra er
  iemand wordt afgevinkt
- Wie de familie verlaat verdwijnt uit de ledenlijst, maar zijn betalingen
  blijven met naam in de boeken staan

### Admin-modus — dezelfde pagina, extra knoppen
Zodra een Lead inlogt verschijnen op diezelfde ledenlijst:
- **+ Lid toevoegen** — modal op desktop, drawer op mobiel
- **Bewerken / Verwijderen** per lid
- **Rang wijzigen** direct via de rangbadge
- **History** — volledige wijzigingsgeschiedenis
- **Settings** — familienaam, maximale capaciteit en Discord-sync

---

## Projectstructuur

```
registry/
├── app/
│   ├── page.tsx                 Voorpagina (logo, clip, teller)
│   ├── leden/page.tsx           De ledenlijst
│   ├── gangpot/page.tsx         De kas: bijdragen, kasboek, saldo
│   ├── lead/page.tsx            Leadkamer: wat vandaag aandacht vraagt
│   ├── auth/                    Discord OAuth: login, callback, signout, error
│   ├── api/gangpot/            Afvinken, boeken, wekelijkse Discord-melding
│   ├── api/discord/sync/        Optionele Discord-sync (alleen admins)
│   ├── api/bot/member/          Endpoint voor /new en /verwijder in Discord
│   ├── opengraph-image.tsx      Deelkaart met ons logo
│   └── globals.css              Design tokens (kleuren, animaties)
├── components/
│   ├── site/                    Navigatie, logo, clip, capaciteitsmeter
│   ├── registry/                Ledenlijst, rijen, rangen, zoekbalk
│   ├── gangpot/                 Saldokaart, weeklijst, kasboek, historie
│   ├── lead/                    Aandachtslijst, kerncijfers, snelle acties
│   ├── admin/                   Modals: lid, verwijderen, history, settings
│   └── ui/                      Knoppen, velden, modal, toasts, skeletons
├── lib/
│   ├── supabase/                Browser-, server- en service-role clients
│   ├── data.ts                  Alle leesqueries
│   ├── actions.ts               Alle schrijfacties (server actions)
│   ├── auth.ts                  Server-side adminchecks
│   ├── gangpot.ts               De gangpot lezen en het saldo uitrekenen
│   ├── lead.ts                  De losse eindjes voor de leadkamer
│   ├── weken.ts                 Betaalvrijdagen, weeknummers, bedragen
│   ├── ranks.ts                 De rangladder + kleurtoon per rang
│   ├── discord.ts               Discord API (server-only)
│   └── video.ts                 YouTube/bestand-herkenning voor de clip
├── supabase/
│   ├── setup.sql                Alles-in-één: dit draai je in Supabase
│   ├── migrations/              Dezelfde opzet, opgeknipt per stap
│   ├── verify_rls.sql           Controlescript voor de beveiliging
│   └── README.md
├── types/                       Database- en app-types
└── public/                      Logo, merkteken, poster
```

Database- en authenticatielogica staat uitsluitend in `lib/`. UI-componenten
praten nooit rechtstreeks met de database.

---

## Installatie in 18 stappen

### 1. Supabase-project aanmaken
Ga naar [supabase.com](https://supabase.com) → **New project**. Kies een
regio in Europa (bijv. Frankfurt). Bewaar het databasewachtwoord.

### 2. De database vullen

Open **SQL Editor → New query**, plak de inhoud van
**`registry/supabase/setup.sql`** en klik op **Run**. Eén keer, klaar.

Onderaan verschijnt:

```
NOTICE:  Register bevat nu 20 leden (limiet 20).
```

Staat die melding er, dan is alles goed gegaan.

`setup.sql` is veilig om opnieuw te draaien: er ontstaan geen dubbele leden en
wat een admin heeft aangepast blijft staan.

<details>
<summary>Liever de losse migraties?</summary>

`setup.sql` wordt samengesteld uit de bestanden in `supabase/migrations/`.
Die kun je ook los draaien, **in deze volgorde**:

| # | Bestand | Wat het doet |
|---|---------|--------------|
| 1 | `0001_schema.sql` | Tabellen, functies, slug/updated_at/audit-triggers |
| 2 | `0002_rls_policies.sql` | Row Level Security, rechten, admin-RPC's |
| 3 | `0003_seed.sql` | Rangladder + de huidige 20 leden + capaciteit |
| 4 | `0004_bot_bridge.sql` | Koppeling voor `/new` in Discord |
| 5 | `0005_rank_colors.sql` | De kleur van elke Discord-rol |
| 6 | `0006_discord_admin_roles.sql` | Beheerrechten via de Leader-rol |
| 7 | `0007_fixes.sql` | Twee reparaties — overslaan kan niet |
| 8 | `0008_service_role_grants.sql` | Rechten voor de service-role |
| 9 | `0009_applications.sql` | Sollicitaties: tabel, RLS en insturen |
| 10 | `0010_private_registry.sql` | De ledenlijst wordt besloten |
| 11 | `0011_fix_submit_application.sql` | Rolcheck in `submit_application` |
| 12 | `0012_application_votes.sql` | Stemmen van leden over een sollicitatie |
| 13 | `0013_applications_lifecycle.sql` | Stemming sluiten, archiveren, deur dicht |
| 14 | `0014_review_fixes.sql` | Twee gaten uit de review |
| 15 | `0015_review_fixes_2.sql` | Rolcheck bot-functies, bericht-ID wisbaar |
| 16 | `0016_gangpot.sql` | De gangpot: bijdragen, kasboek, saldo |

`0017_gangpot_beginstand.sql` staat er bewust **niet** in: die zet eenmalig de
stand uit de oude spreadsheet over (beginsaldo, de betaalde weken 36 t/m 39 en
de drie uitgaven). Draai hem één keer, apart, ná `setup.sql`. Onderaan laat hij
zien welke namen uit het bestand niet op de ledenlijst gevonden zijn — die zijn
overgeslagen en vink je met de hand af op `/gangpot`.

Pas je iets aan in `migrations/`, draai dan `npm run build:setup` om
`setup.sql` opnieuw samen te stellen.

</details>

### 3. Discord Developer Application maken
Ga naar [discord.com/developers/applications](https://discord.com/developers/applications)
→ **New Application**. Onder **OAuth2** vind je de **Client ID** en
**Client Secret**. Die twee heb je bij stap 5 nodig.

### 4. Discord OAuth redirect URL instellen
In diezelfde app, onder **OAuth2 → Redirects**, voeg toe:

```
https://<jouw-project>.supabase.co/auth/v1/callback
```

De URL staat in Supabase onder **Authentication → Providers → Discord**.

### 5. Discord-provider in Supabase activeren
Supabase → **Authentication → Providers → Discord** → aanzetten, en de
Client ID en Client Secret uit stap 3 invullen. **Save**.

### 6. Environment variables instellen
Kopieer `.env.example` naar `.env.local` en vul in ieder geval in:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_ANON_KEY` staan in
  Supabase onder **Project Settings → API**.

### 7. Lahaye één keer via Discord laten inloggen
Start de site (`npm run dev`), klik rechtsboven op **Lead login** en log in met
Discord. Je krijgt de melding dat je nog geen beheerrechten hebt — dat klopt.

### 8. Supabase user UUID opzoeken
Supabase → **Authentication → Users**. Daar staat nu je Discord-account.
Kopieer de **UID** (een lange code met streepjes).

### 9. Lahaye toevoegen aan de admins-tabel
SQL Editor, met je eigen UUID:

```sql
insert into public.admins (user_id, label)
values ('PLAK-HIER-DE-UUID', 'Lahaye')
on conflict (user_id) do nothing;
```

Herlaad de site — de beheerknoppen verschijnen.

### 10. Lokaal testen
```bash
npm run dev
```
Controleer: ledenlijst vult zich, zoeken werkt, lid toevoegen werkt,
rang wijzigen verplaatst iemand meteen, de teller klopt.

### 11. Project naar GitHub pushen
```bash
git add .
git commit -m "Sondravo family registry"
git push
```

### 12. Repository in Vercel importeren
[vercel.com/new](https://vercel.com/new) → kies de repository.

> **Belangrijk:** zet **Root Directory** op `registry`. De Discord-bot staat in
> de hoofdmap van dezelfde repository; Vercel moet alleen deze map bouwen.

Framework preset: **Next.js** (wordt automatisch herkend).

### 13. Production environment variables instellen
In Vercel → **Settings → Environment Variables**, minimaal:

| Variable | Waarde |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | je Supabase-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | je anon key |
| `NEXT_PUBLIC_SITE_URL` | je definitieve URL, bijv. `https://sondravo.nl` |

Optioneel: `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_BOT_TOKEN`,
`DISCORD_GUILD_ID`, `BOT_API_SECRET`.

Daarna opnieuw deployen zodat de variabelen actief worden.

### 14. Production URL toevoegen aan Supabase
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://jouw-domein.nl`
- **Redirect URLs**: voeg toe
  - `https://jouw-domein.nl/auth/callback`
  - `https://<jouw-vercel-project>.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (om lokaal te blijven testen)

Zonder deze stap werkt inloggen in productie niet.

### 15. Eigen domein koppelen (optioneel)
Vercel → **Settings → Domains** → domein toevoegen en de DNS-instructies
volgen. Vergeet daarna stap 14 niet voor het nieuwe domein.

### 16. Public mode testen
Open de site in een privévenster (niet ingelogd):
- De ledenlijst is zichtbaar
- Er zijn geen bewerkknoppen
- Er staan geen telefoonnummers of notities die niet publiek horen te zijn

### 17. Admin mode testen
Log in als Lead en controleer: toevoegen, bewerken, rang wijzigen,
verwijderen, History en Settings. Wijzig de limiet naar 25 en kijk of de
teller `20 / 25` wordt.

### 18. RLS/security testen
Voer `supabase/verify_rls.sql` uit in de SQL Editor. Zie
[Beveiliging](#beveiliging) voor wat je moet zien.

---

## Environment variables

Alles staat met uitleg in `.env.example`. Kort samengevat:

| Variable | Verplicht | Zichtbaar in browser | Waarvoor |
|----------|-----------|----------------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ja | Verbinding met je Supabase-project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ja | Publieke sleutel; RLS bepaalt de rechten |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **nee** | Alleen voor `/new` vanuit Discord. Omzeilt RLS. |
| `DISCORD_BOT_TOKEN` | — | **nee** | Discord-naam/avatar ophalen, aanwezigheid checken |
| `DISCORD_GUILD_ID` | — | **nee** | Welke Discord-server gesynct wordt |
| `DISCORD_ADMIN_ROLE_IDS` | — | **nee** | Rollen die automatisch beheerrechten geven |
| `DISCORD_MEMBER_ROLE_ID` | — | **nee** | De familierol; bepaalt wie op de ledenlijst hoort |
| `DISCORD_APPLICANT_ROLE_ID` | — | **nee** | Rol die toegang geeft tot het sollicitatieformulier |
| `DISCORD_APPLICATION_WEBHOOK_URL` | — | **nee** | Webhook waar een nieuwe sollicitatie binnenkomt |
| `DISCORD_GANGPOT_WEBHOOK_URL` | — | **nee** | Webhook voor het wekelijkse gangpot-bericht |
| `CRON_SECRET` | — | **nee** | Geheim voor de nachtelijke rol-sync én de vrijdagse gangpot-melding |
| `BOT_API_SECRET` | — | **nee** | Gedeeld geheim tussen bot en website |
| `NEXT_PUBLIC_SITE_URL` | — | ja | Correcte OAuth-redirects en deelkaarten |
| `NEXT_PUBLIC_HERO_VIDEO_URL` | — | ja | De intro-clip op de voorpagina |

De twee `NEXT_PUBLIC_`-Supabase-waarden **mogen** publiek zijn: zonder een rij
in `admins` kan een bezoeker met die sleutel niets wijzigen.
De service-role key en het bot-token mogen dat **nooit**.

---

## Eerste admin aanmaken

Bezoekers hoeven niet in te loggen. Alleen accounts met een rij in
`public.admins` kunnen iets wijzigen.

1. Log in via Discord op de site
2. Supabase maakt automatisch een auth-user aan
3. Zoek de UUID op onder **Authentication → Users**
4. Voer uit:

```sql
insert into public.admins (user_id)
values ('UUID-HIER');
```

5. Herlaad de site — je hebt nu adminrechten

Er bestaat met opzet **geen** policy die inserts in `admins` via de API
toestaat. Iemand admin maken kan alleen via de SQL Editor. Een gekaapte sessie
kan dus nooit nieuwe admins aanmaken.

### Beheerrechten via de Leader-rol

Naast het handmatig toevoegen kun je beheerrechten aan een **Discord-rol**
koppelen. Iedereen met die rol kan na het inloggen de ledenlijst aanpassen.

Zet daarvoor in Vercel:

```bash
DISCORD_BOT_TOKEN=...                        # al nodig voor de Discord-sync
DISCORD_GUILD_ID=...                         # idem
DISCORD_ADMIN_ROLE_IDS=1488178372721901807   # Leader Sondravo Family
```

Dat rol-ID is dezelfde waarde als `FOUNDER_ROLE_ID` bij de bot. Meerdere rollen
mogen, gescheiden door komma's.

**Hoe het werkt:** bij elke login kijkt de server — met het bot-token, dus
server-side — of dit Discord-account die rol heeft.

| Situatie | Gevolg |
|----------|--------|
| Heeft de rol | Krijgt beheerrechten (`source = 'discord'`) |
| Rol kwijtgeraakt | Rechten vervallen bij de volgende login |
| Discord onbereikbaar | Er verandert **niets** — rechten blijven zoals ze waren |

Twee dingen zijn met opzet zo gebouwd:

1. **Handmatige admins worden nooit aangeraakt.** Rijen met `source = 'manual'`
   blijven altijd staan. Ligt Discord plat of is het bot-token verlopen, dan kan
   er nog steeds iemand bij. Zet jezelf dus altijd óók met de hand in `admins`.
2. **Bij twijfel gebeurt er niets.** Kan de site de rol niet ophalen, dan worden
   er geen rechten toegekend én geen rechten afgenomen.

Wie welke route volgde, zie je zo:

```sql
select user_id, label, source, created_at from public.admins order by created_at;
```

---

## Discord-bot: /new en /verwijder

De bot in de hoofdmap van deze repository kan leden direct op de website
zetten.

```
/new lid:@Ferry rang:Zazavao
/new lid:@Ferry rang:Mpikambana naam:Ferry
/verwijder lid:@Xavier
```

Alleen leiding (Founder of een management-rol) kan deze commando's gebruiken.

**Hoe het werkt:** de bot praat niet rechtstreeks met de database. Hij roept
`/api/bot/member` op de website aan met één gedeeld geheim in de header
`x-sondravo-bot-secret`. Alle validatie zit zo op één plek, en de bot hoeft
geen Supabase-sleutels te kennen.

**Instellen:**

1. Genereer een geheim: `openssl rand -hex 32`
2. Zet in Vercel: `BOT_API_SECRET` (dat geheim) en `SUPABASE_SERVICE_ROLE_KEY`
3. Zet in de omgeving van de bot (Render):
   - `BOT_API_SECRET` — exact dezelfde waarde
   - `REGISTRY_URL` — de URL van de site, bijv. `https://sondravo.vercel.app`
4. Herstart de bot; de commando's worden automatisch geregistreerd

Zonder deze variabelen blijven de commando's bestaan maar melden ze netjes dat
de koppeling niet is ingesteld. De rest van de bot werkt gewoon door.

Wie via `/new` toegevoegd wordt, verschijnt ook in de **History** op de site,
met de naam van degene die het commando gaf.

---

## De intro aanpassen

De voorpagina draait een lus: **logo → stukje clip → logo → stukje clip → ...**

### Het tijdsverloop bijstellen

Vier environment variables:

| Variable | Standaard | Wat het doet |
|----------|-----------|--------------|
| `NEXT_PUBLIC_HERO_LOGO_SECONDS` | `3.5` | Hoe lang het logo in beeld blijft, in seconden |
| `NEXT_PUBLIC_HERO_CLIP_SECONDS` | `30` | Hoe lang het fragment speelt, in seconden |
| `NEXT_PUBLIC_HERO_CLIP_FROM_END` | `true` | Rekent terug vanaf het eind van de clip |
| `NEXT_PUBLIC_HERO_CLIP_START` | `0` | Beginseconde, alleen gebruikt als `FROM_END` uit staat |

Standaard speelt de intro dus de **laatste 30 seconden** van de clip. De
speler leest de lengte van de video zelf uit en rekent terug, zodat die lengte
nergens hard ingetypt staat — verwissel je de clip, dan klopt het nog steeds.
Een halve seconde voor het eind stopt het fragment, zodat YouTube zijn
eindscherm met suggesties er niet overheen legt.

Wil je in plaats daarvan een vast stuk uit het midden, bijvoorbeeld vanaf 0:12
en 8 seconden lang, met het logo 4 seconden ertussen:

```bash
NEXT_PUBLIC_HERO_LOGO_SECONDS=4
NEXT_PUBLIC_HERO_CLIP_SECONDS=8
NEXT_PUBLIC_HERO_CLIP_FROM_END=false
NEXT_PUBLIC_HERO_CLIP_START=12
```

> Let op: dit zijn `NEXT_PUBLIC_`-waarden. Die worden bij het bouwen vastgelegd,
> dus na een wijziging in Vercel moet je opnieuw deployen.

### Een andere clip gebruiken

**Andere YouTube-link:** zet `NEXT_PUBLIC_HERO_VIDEO_URL` op de nieuwe link.
`watch?v=`, `youtu.be/` en `/shorts/` werken allemaal.

**Eigen bestand:** zet het filmpje neer als `public/media/sondravo.mp4` en zet
`NEXT_PUBLIC_HERO_VIDEO_URL=/media/sondravo.mp4`. Houd het bestand klein
(< 10 MB) — anders duurt het laden te lang op mobiel.

### Hoe bezoekers de controle houden

- **Intro pauzeren** — één knop stopt de lus en brengt het logo terug. De knop
  wordt dan **Intro afspelen**.
- Die keuze wordt onthouden, dus wie de intro uitzet houdt hem uit bij een
  volgend bezoek.
- **Geluid** staat altijd uit bij het starten en is per knop aan te zetten.
- Staat "verminderde beweging" aan in het systeem van de bezoeker, dan draait de
  lus niet vanzelf — dan blijft het logo staan tot iemand zelf op afspelen drukt.
- Laadt de clip niet (geen internet, bestand weg), dan blijft simpelweg het logo
  staan. Er verschijnt nooit een kapotte speler.

---

## Rangkleuren

Elke rang heeft de kleur van zijn Discord-rol. Die staan in de database, in
`public.ranks.color`:

| Rang | Kleur |
|------|-------|
| Mpitarika | `#1e00ff` blauw |
| Lefitra | `#b7ff00` lime |
| Mpanoro | `#00f52d` groen |
| Mpifehy | `#00f52d` groen |
| Hery | `#2ecc71` emerald |
| Mpiady | `#ddf80c` geel-lime |
| Zoky | `#f1c40f` goud |
| Mpikambana | `#ff0000` rood |
| Zazavao | `#ff0000` rood |

De site toont ze **niet** zo fel als Discord. Van elke kleur blijft de kleurtoon
staan — dat maakt de rang herkenbaar — maar verzadiging en helderheid worden
naar een vast bereik getrokken. Zonder die stap zou het blauw van Mpitarika
(bijna zwart van zichzelf) veel donkerder ogen dan het goud van Zoky en zou de
lijst ongelijk aanvoelen. Nu heeft elke rangkop dezelfde leesbaarheid.

Verandert een rolkleur in Discord? Dan pas je één regel aan:

```sql
update public.ranks set color = '#1e00ff' where key = 'mpitarika';
```

De site neemt dat direct over; er hoeft niets opnieuw gedeployed te worden.

> De emoji's uit Discord (👑 ⚜️ ⚔️ 🩸) zijn bewust **niet** overgenomen. Die
> maken de lijst druk. In plaats daarvan staan er rustige tekens (♛ ✦ ◆ ◈ ● ○)
> in de kleur van de rang. Wil je de emoji's er toch bij, dan is dat één
> update op `public.ranks.glyph`.

---

## Beveiliging

De rechten staan in de **database**, niet in de knoppen. Een knop verbergen is
geen beveiliging, dus elke schrijfactie wordt twee keer gecontroleerd: één keer
server-side in de app, en één keer door Row Level Security.

| Wie | Mag lezen | Mag schrijven |
|-----|-----------|---------------|
| Bezoeker (`anon`) | leden, rangen, instellingen | **niets** |
| Ingelogd, geen admin | precies hetzelfde als een bezoeker | **niets** |
| Admin | alles, inclusief privégegevens en history | leden, instellingen, privégegevens |

Verder:

- **RLS staat op elke tabel aan**, ook op tabellen die nergens publiek gebruikt worden.
- **`anon` heeft nergens schrijfrechten** en heeft op `private_member_data`,
  `admins` en `audit_logs` zelfs geen leesrecht. Een lek vereist dus zowel een
  kapotte policy als een kapotte grant.
- **Interne notities en Discord user ID's** staan in de aparte tabel
  `private_member_data`, die voor bezoekers volledig afgeschermd is. De publieke
  query kan er niet eens bij.
- **History is onvervalsbaar**: audit-regels worden door database-triggers
  geschreven, niet door de app. Niemand heeft INSERT-rechten op `audit_logs` —
  ook een admin niet. Een wijziging via de SQL Editor wordt net zo goed gelogd.
- **Admins worden alleen met de hand toegevoegd**, via SQL. Er is geen API-route
  die dat kan.
- **OAuth-redirects zijn afgeschermd**: alleen interne, relatieve paden worden
  geaccepteerd (`lib/redirect.ts`), dus een open redirect is niet mogelijk.
- **Login gaat via POST**, niet via een link, zodat niemand ongevraagd door een
  OAuth-flow gestuurd kan worden.
- **Het bot-endpoint** vergelijkt het geheim met `timingSafeEqual`.
- **Geheimen worden nooit gelogd.** Bij een Discord-fout loggen we alleen de
  statuscode, niet de response.
- De service-role key en het bot-token zitten achter `import 'server-only'`, dus
  ze kunnen niet per ongeluk in de browserbundel belanden.

**Controleren:** voer `supabase/verify_rls.sql` uit. Je wilt zien:
1. `rls_enabled = true` voor alle zes de tabellen
2. **0 rijen** bij de tweede query (anon heeft nergens schrijfrechten)
3. Bij de derde query alleen `SELECT` op `ranks`, `members` en `settings`

---

## Lokaal ontwikkelen

```bash
cd registry
npm install
cp .env.example .env.local     # vul de twee Supabase-waarden in
npm run dev                    # http://localhost:3000
```

Andere commando's:

```bash
npm run build       # productie-build
npm run start       # productie-build draaien
npm run lint        # ESLint
npm run typecheck   # TypeScript zonder build
```

---

## Wat jij zelf nog moet doen

Alles wat code is, is klaar. Dit kan ik niet voor je doen omdat er accounts en
geheimen bij komen kijken:

- [ ] Supabase-project aanmaken (stap 1)
- [ ] `supabase/setup.sql` één keer draaien (stap 2)
- [ ] Discord Developer Application aanmaken + redirect URL (stap 3 en 4)
- [ ] Discord-provider in Supabase aanzetten (stap 5)
- [ ] Eén keer inloggen en jezelf in `admins` zetten (stap 7 t/m 9)
- [ ] Repository in Vercel importeren met **Root Directory = `registry`** (stap 12)
- [ ] Production environment variables invullen (stap 13)
- [ ] Production URL in Supabase redirect URLs zetten (stap 14)
- [ ] Optioneel: eigen domein koppelen (stap 15)
- [ ] Optioneel: `BOT_API_SECRET` + `REGISTRY_URL` bij de bot zetten voor `/new`
- [ ] Optioneel: telefoonnummers en Discord-koppelingen per lid invullen

### Sleutels en URL's die je nodig hebt

| Wat | Waar te vinden |
|-----|----------------|
| Supabase URL + anon key | Supabase → Project Settings → API |
| Supabase service_role key | Supabase → Project Settings → API (geheim!) |
| Supabase user UUID | Supabase → Authentication → Users |
| Discord Client ID + Secret | Discord Developer Portal → OAuth2 |
| Discord Bot Token | Discord Developer Portal → Bot |
| Discord Guild ID | Rechtsklik op de server → ID kopiëren (Developer Mode aan) |
| Supabase callback URL | `https://<project>.supabase.co/auth/v1/callback` |
| Site callback URL | `https://<jouw-domein>/auth/callback` |

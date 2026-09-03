# 🩸 Sondravo Family Bot

Discord management bot voor de **Sondravo Family**. De bot beheert de gangpot, wekelijkse betalingen, uitgaven, ledenstatus en beheerlogs. De gegevens worden opgeslagen in **Google Sheets** en de bot draait via **Render**.

---

## 📌 Wat doet de bot?

Het managementdashboard wordt in Discord geplaatst met `/setup`. Vanuit dat dashboard kan de leiding de administratie beheren.

Het dashboard toont onder andere:

- 💰 huidige gangpot
- 💵 bedrag van de weekpot per persoon
- 📅 actieve week
- ✅ hoeveel leden betaald hebben
- ⏳ hoeveel leden nog openstaan
- 📈 totale inkomsten
- 📉 totale uitgaven

De administratie wordt opgeslagen in Google Sheets zodat de gegevens bewaard blijven na een restart of nieuwe deployment van de bot.

---

## 🔐 Rechten

De belangrijkste beheerfuncties zijn alleen beschikbaar voor de **Founder/leiding**.

Founder Role ID:

```text
1488178372721901807
```

De bot controleert deze rol voordat beheeracties uitgevoerd worden. Ook de Discord-servereigenaar wordt als Founder behandeld.

Family-leden worden herkend via de ingestelde rollen `FAMILY_ROLE_ID`, `MPIKAMBANA_ROLE_ID` en de Founder-rol.

---

## 🖥️ Managementdashboard

Gebruik in Discord:

```text
/setup
```

Alleen Founder kan `/setup` uitvoeren.

De bot plaatst vervolgens het managementdashboard in het kanaal waarin het commando is uitgevoerd en bewaart het kanaal- en bericht-ID in Google Sheets. Daardoor kan het dashboard later automatisch worden bijgewerkt.

### 💰 Gangpot

Toont:

- huidig saldo
- totale inkomsten
- totale uitgaven

Het saldo wordt berekend uit de transacties in Google Sheets.

### 💵 Weekpot beheren

Alleen Founder/leiding.

Hier ziet de leiding voor de actieve week:

- bedrag per persoon
- aantal betaald
- aantal openstaand

Via **Nieuwe betaling aanmaken** kiest de leiding vervolgens het lid dat betaald heeft.

Na het kiezen van een persoon:

1. de betaling wordt geregistreerd;
2. de persoon wordt voor die week als betaald gemarkeerd;
3. het ingestelde weekbedrag wordt bij de gangpot opgeteld;
4. er wordt een transactie opgeslagen;
5. er wordt een logregel opgeslagen;
6. het dashboard wordt bijgewerkt.

Een persoon kan niet twee keer als betaald worden geregistreerd voor dezelfde actieve week zolang de eerdere betaling actief is.

### 💸 Uitgave

Alleen Founder/leiding.

Bij een nieuwe uitgave vraagt de bot om:

- bedrag
- categorie
- omschrijving

Daarna wordt het bedrag van de gangpot afgetrokken en opgeslagen in `Uitgaven`, `Transacties` en `Logs`.

### 👥 Leden

Toont de Family-leden en hun betaalstatus voor de actieve week:

- ✅ = betaald
- ⏳ = nog openstaand

### 📊 Overzicht

Toont de meest recente transacties, bijvoorbeeld weekbetalingen, uitgaven en correcties.

### 📜 Logs

Alleen Founder/leiding.

Toont recente beheeracties. Belangrijke wijzigingen worden gelogd zodat de geschiedenis controleerbaar blijft.

---

## ⚙️ Founder beheer

De Founder heeft extra beheerfuncties voor de weekadministratie.

### 📅 Nieuwe week starten

Hiermee wordt de actieve week handmatig naar de volgende week gezet.

Voor de nieuwe week staat iedereen opnieuw als **openstaand** totdat de leiding voor die persoon een betaling registreert.

De oude weekbetalingen blijven in Google Sheets staan en worden dus niet verwijderd.

### ↩️ Betaling terugdraaien

Gebruik dit wanneer een betaling verkeerd is geregistreerd.

De Founder kiest een bestaande betaling. Daarna:

1. wordt de betaling als teruggedraaid gemarkeerd;
2. wordt het weekbedrag weer van de gangpot afgehaald;
3. staat het betreffende lid voor die week weer open;
4. wordt een tegenboeking/transactie opgeslagen;
5. wordt de actie gelogd.

De oorspronkelijke geschiedenis wordt niet stilletjes gewist.

### 🗑️ Uitgave terugdraaien

Gebruik dit wanneer een uitgave onjuist was.

De Founder kiest een recente uitgave. Daarna:

1. wordt de uitgave als teruggedraaid gemarkeerd;
2. komt het bedrag terug in de gangpot;
3. wordt een tegenboeking opgeslagen;
4. wordt de actie gelogd.

### 📜 Alles blijft gelogd

Betalingen en uitgaven worden bij terugdraaien niet simpelweg uit de administratie gewist. De bot bewaart de geschiedenis en registreert de correctie/terugdraaiing zodat later zichtbaar blijft wat er is gebeurd.

---

## ⌨️ Slash commands

### `/setup`

Plaatst het managementdashboard in het huidige Discord-kanaal.

**Toegang:** Founder.

### `/saldo`

Toont het huidige saldo van de gangpot, inkomsten en uitgaven.

### `/correctie`

Handmatige correctie van de gangpot.

Je kiest:

- `plus` om geld toe te voegen;
- `min` om geld af te trekken;
- bedrag;
- reden.

**Toegang:** Founder.

Gebruik een correctie alleen wanneer er daadwerkelijk iets administratief gecorrigeerd moet worden. Normale weekbetalingen en uitgaven horen via de knoppen van het dashboard verwerkt te worden.

---

## 📊 Google Sheets

De bot gebruikt één Google Spreadsheet en maakt/gebruikt de volgende tabbladen:

### `Dashboard`

Samenvatting van onder andere:

- laatste update
- huidig saldo
- totale inkomsten
- totale uitgaven
- weekpottarief

### `Weekbetalingen`

Bevat de geregistreerde weekbetalingen met onder andere:

- Payment ID
- week
- Discord ID
- Discord-naam
- bedrag
- status
- datum/tijd
- wie de betaling heeft aangemaakt
- opmerkingen

### `Uitgaven`

Bevat de uitgavenadministratie.

### `Transacties`

Dit is het financiële transactieregister. Hieruit wordt de gangpot berekend.

### `Logs`

Auditlog van beheeracties.

### `Settings`

Interne instellingen van de bot, bijvoorbeeld het kanaal en bericht van het Discord-dashboard en de actieve week.

> Bewerk de financiële tabbladen bij voorkeur niet handmatig terwijl de bot actief wordt gebruikt. Gebruik de Discord-beheerfuncties zodat transacties en logs met elkaar blijven kloppen.

---

## 🔑 Environment Variables op Render

De bot gebruikt environment variables zodat tokens, IDs en Google-gegevens niet in de openbare code hoeven te staan.

| Key | Betekenis |
|---|---|
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_CLIENT_ID` | Application/Client ID van de Discord-bot |
| `DISCORD_GUILD_ID` | ID van de Discord-server |
| `FOUNDER_ROLE_ID` | Discord Role ID van Founder/leiding |
| `MPIKAMBANA_ROLE_ID` | Discord Role ID van Mpikambana |
| `FAMILY_ROLE_ID` | Discord Role ID van de Family-leden |
| `GOOGLE_SPREADSHEET_ID` | ID van de Google Spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | volledige Google service-account JSON |
| `GANG_NAME` | naam die de bot in het dashboard gebruikt |
| `CURRENCY` | valuta, bijvoorbeeld `$` |
| `WEEKLY_AMOUNT` | weekpotbedrag per persoon, bijvoorbeeld `50000` |
| `EMBED_COLOR` | kleur van Discord embeds, bijvoorbeeld `#8B0000` |
| `FOOTER_TEXT` | tekst onderaan de embeds |

### ⚠️ Geheimen

Zet `DISCORD_TOKEN` en `GOOGLE_SERVICE_ACCOUNT_JSON` **nooit in GitHub, screenshots of Discord-berichten**. Bewaar deze alleen als geheime environment variables in Render.

Als een Discord-token ooit openbaar is geworden, reset/regenerate het token in de Discord Developer Portal en vervang daarna `DISCORD_TOKEN` in Render.

---

## ☁️ Render deployment

De service draait als Node.js web service op Render.

Gebruik de instellingen die bij het project horen, waaronder de startopdracht voor de bot, bijvoorbeeld:

```bash
node index.js
```

Na een nieuwe commit op de gekoppelde branch kan Render automatisch opnieuw deployen wanneer Auto-Deploy is ingeschakeld.

Tijdens deployment kun je onder **Logs** controleren of de build en bot succesvol starten.

De code bevat daarnaast een kleine HTTP health server voor Render.

### Free instance

Een gratis Render web-service kan bij inactiviteit spinnen/slapen. Daardoor kan een request na inactiviteit vertraagd zijn. Voor een service die zonder dergelijke free-instance slaapbeperkingen moet blijven draaien, is een passend betaald Render-plan nodig.

---

## 🔄 Normale werkwijze voor de leiding

1. Open het managementdashboard in Discord.
2. Klik op **💵 Weekpot beheren** wanneer iemand zijn weekpot betaalt.
3. Klik op **Nieuwe betaling aanmaken**.
4. Kies de persoon die daadwerkelijk betaald heeft.
5. De bot telt het weekbedrag automatisch bij de gangpot op.
6. Gebruik **💸 Uitgave** wanneer er geld uit de gangpot wordt uitgegeven.
7. Gebruik **⚙️ Founder beheer** voor een nieuwe week of wanneer een fout teruggedraaid moet worden.
8. Controleer **📜 Logs** wanneer je wilt zien welke beheeracties zijn uitgevoerd.

---

## 🧾 Voorbeeld

Stel:

```text
WEEKLY_AMOUNT=50000
```

Persoon A betaalt zijn weekpot.

De leiding kiest Persoon A bij **Nieuwe betaling aanmaken**.

Resultaat:

```text
Persoon A: ✅ betaald
Gangpot: +$50.000
```

Persoon B betaalt daarna:

```text
Persoon B: ✅ betaald
Gangpot: nogmaals +$50.000
```

Er is nu in totaal `$100.000` aan weekbetalingen geregistreerd.

Als de betaling van Persoon B fout was ingevoerd, gebruikt Founder **Betaling terugdraaien**. De betaling wordt administratief teruggedraaid, Persoon B staat weer open en het bedrag wordt gecorrigeerd in de gangpot.

---

## 🛠️ Problemen oplossen

### Bot reageert niet

Controleer eerst de Render logs en kijk of de service succesvol gestart is.

Controleer daarna of:

- `DISCORD_TOKEN` correct is;
- de bot nog in de Discord-server zit;
- de bot voldoende Discord-permissies heeft;
- de juiste server-ID en role IDs zijn ingesteld.

### `Missing Access`

Dit betekent meestal dat de bot een Discord-resource niet mag gebruiken of bereiken. Controleer de rechten van de bot in het betreffende kanaal en de server.

### `Request with opcode 8 was rate limited`

De bot is aangepast om onnodige volledige Discord-member-searches te vermijden. Als deze melding opnieuw verschijnt, controleer de nieuwste Render logs en zorg dat de nieuwste commit daadwerkelijk gedeployed is.

### Google Sheets werkt niet

Controleer:

- `GOOGLE_SERVICE_ACCOUNT_JSON`;
- `GOOGLE_SPREADSHEET_ID`;
- of de spreadsheet gedeeld is met het e-mailadres van het Google service account;
- of de JSON als volledige geldige JSON in Render staat.

### Dashboard toont oude gegevens

Voer geen transacties rechtstreeks in Sheets in als de bot die wijziging ook hoort te verwerken. Gebruik de Discord-knoppen. Controleer bij problemen de Render logs en herstart/deploy de service indien nodig.

---

## 🔒 Administratieprincipe

De bot is opgezet zodat de leiding de financiële administratie beheert en belangrijke wijzigingen traceerbaar blijven.

Daarom geldt:

- betalingen worden geregistreerd met persoon en week;
- uitgaven krijgen een omschrijving en beheerder;
- terugdraaiingen worden als nieuwe administratieve actie verwerkt;
- logs blijven behouden;
- gevoelige tokens worden buiten GitHub opgeslagen.

Zo blijft de gangpot controleerbaar zonder dat oude financiële geschiedenis stilletjes hoeft te verdwijnen.

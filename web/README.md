# Sondravo Family Web Management

Dit is de nieuwe weblaag naast de bestaande Discord-bot. De huidige bot in de repository blijft voorlopig de fallback en wordt niet verwijderd.

## Doel

- custom zwart/rood management dashboard
- Discord login en rollencontrole
- PostgreSQL als centrale database
- weekbetalingen van $50.000
- alleen Discord-rol `1488178372700803233` telt als betalend lid
- Founder beheer, uitgaven, transacties en audit logs
- later tweeweg-sync met Discord-bot en Google Sheets

## Lokaal starten

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

## Database

Prisma schema staat in `prisma/schema.prisma`. Zodra een PostgreSQL database is gekozen:

```bash
npm run prisma:generate
npx prisma migrate dev --name init
```

## Bouwvolgorde

1. Basis dashboard UI
2. Database verbinding + services
3. Discord OAuth login
4. Rollen/autorisatie
5. Betalingen en uitgaven vanuit web
6. Discord bot aan dezelfde database koppelen
7. Google Sheets als export/sync
8. productiehosting en back-ups

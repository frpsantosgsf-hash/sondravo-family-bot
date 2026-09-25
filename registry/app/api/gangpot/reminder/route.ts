import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { syncGangpotBericht } from '@/lib/gangpot-discord';
import { huidigeVrijdag } from '@/lib/weken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * De wekelijkse gangpot-melding plaatsen of bijwerken.
 *
 * Draait elke vrijdagochtend via de cron van Vercel. Bestaat het bericht van
 * deze week al, dan wordt het bijgewerkt in plaats van er een tweede naast te
 * zetten — twee keer draaien levert dus nooit twee berichten op.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Niet geautoriseerd.' }, { status: 401 });
  }

  const resultaat = await syncGangpotBericht(huidigeVrijdag(), true);
  return NextResponse.json({ ok: true, resultaat });
}

/** Dezelfde melding, maar dan omdat de Lead er zelf om vraagt. */
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  const resultaat = await syncGangpotBericht(huidigeVrijdag(), true);
  return NextResponse.json({ ok: true, resultaat });
}

import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { executarSincronizacaoNFe } from '@/lib/cartao/nfe';

export const dynamic = 'force-dynamic';

/**
 * Chamada pela função agendada da Netlify (netlify/functions/nfe-agendada.mjs)
 * com o segredo CRON_SECRET. O botão manual do TI usa a server action, não esta rota.
 */
export async function POST(request: NextRequest) {
  const segredo = process.env.CRON_SECRET ?? '';
  const recebido = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const valido =
    segredo.length >= 16 &&
    recebido.length === segredo.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(segredo));
  if (!valido) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });

  const resultado = await executarSincronizacaoNFe();
  return NextResponse.json(resultado);
}

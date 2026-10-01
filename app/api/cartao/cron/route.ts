import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { conciliarPendentes, somarDias } from '@/lib/cartao/conciliacaoDb';
import { contasML, sincronizarContasML } from '@/lib/cartao/sincronizacaoML';
import { executarSincronizacaoNFe, vincularNotas } from '@/lib/cartao/nfe';

export const dynamic = 'force-dynamic';

/**
 * Rotinas automáticas, chamadas pelas funções agendadas da Netlify
 * (netlify/functions/*-agendada.mjs) com o segredo CRON_SECRET:
 *   ?tarefa=ml  → puxa as compras de todas as contas do Mercado Livre (últimos 45 dias),
 *                 concilia faturas pendentes e vincula notas fiscais;
 *   ?tarefa=nfe → busca notas fiscais na SEFAZ (só se o certificado foi configurado).
 */
export async function POST(request: NextRequest) {
  const segredo = process.env.CRON_SECRET ?? '';
  const recebido = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const valido =
    segredo.length >= 16 &&
    recebido.length === segredo.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(segredo));
  if (!valido) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });

  const tarefa = request.nextUrl.searchParams.get('tarefa');
  if (tarefa === 'ml') {
    const desde = somarDias(new Date().toISOString().slice(0, 10), -45);
    const { total, falhas } = await sincronizarContasML(await contasML(), desde);
    const service = createServiceRoleClient();
    const conciliados = await conciliarPendentes(service);
    const notas = await vincularNotas(service);
    return NextResponse.json({ ok: true, compras: total, conciliados, notas, falhas });
  }
  if (tarefa === 'nfe') {
    return NextResponse.json(await executarSincronizacaoNFe());
  }
  return NextResponse.json({ erro: 'tarefa inválida' }, { status: 400 });
}

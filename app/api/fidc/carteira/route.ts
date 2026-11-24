import { NextResponse } from 'next/server';
import { requireFidcCarteira } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { conferirTitulos, resumir, type ResumoConferencia, type TituloConferido } from '@/lib/fidc/carteira';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export interface RespostaCarteira {
  titulos?: TituloConferido[];
  resumos?: Record<number, ResumoConferencia | { erro: string }>;
  erro?: string;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function conferir(id: number) {
  const db = createServiceRoleClient();
  const [{ data: b, error }, { data: ts, error: e2 }] = await Promise.all([
    db.from('fidc_borderos').select('id,fidc,empresa,cedente_cnpj').eq('id', id).maybeSingle(),
    db.from('fidc_bordero_titulos').select('ordem,numero,sacado,vencimento,valor').eq('bordero_id', id).order('ordem'),
  ]);
  if (error || e2) throw new Error((error ?? e2)!.message);
  if (!b) throw new Error('Borderô não encontrado.');
  return conferirTitulos(
    (ts ?? []).map((t) => ({ ...t, valor: Number(t.valor) })),
    b.fidc,
    b.empresa,
    b.cedente_cnpj ?? ''
  );
}

/**
 * ?id=N → títulos do borderô conferidos com o ORGM (carteira de cada um).
 * ?ids=1,2,3 → só o resumo de cada borderô (quantos ok / faltam / outra carteira / não achados).
 */
export async function GET(request: Request) {
  await requireFidcCarteira();
  const url = new URL(request.url);
  try {
    const id = Number(url.searchParams.get('id'));
    if (id) return NextResponse.json({ titulos: await conferir(id) } satisfies RespostaCarteira);

    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => n > 0)
      .slice(0, 60);
    const resumos: RespostaCarteira['resumos'] = {};
    // um de cada vez para não abrir muitas consultas no ERP ao mesmo tempo
    for (const i of ids) {
      try {
        resumos[i] = resumir(await conferir(i));
      } catch (e) {
        resumos[i] = { erro: msg(e) };
      }
    }
    return NextResponse.json({ resumos } satisfies RespostaCarteira);
  } catch (e) {
    const m = msg(e);
    const semErp = /ECONNREFUSED|ETIMEOUT|ESOCKET|Failed to connect|login failed/i.test(m);
    return NextResponse.json({ erro: semErp ? 'Não consegui falar com o ORGM agora. Tente de novo em instantes.' : m } satisfies RespostaCarteira, {
      status: 500,
    });
  }
}

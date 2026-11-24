import { NextResponse } from 'next/server';
import { requireFidcMensal } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { lerAbasXlsx } from '@/lib/fidc/lerXlsx';
import { lerRisco } from '@/lib/fidc/risco';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const erro = (mensagem: string, status = 400) => NextResponse.json({ erro: mensagem }, { status });
const SQL = 'Falta rodar o supabase/fidc_risco.sql no Supabase.';

/**
 * Recebe a planilha "RISCO GERAL OPERAÇÕES FIDCs <MÊS> <ANO>.xlsx" ("planilha") e, opcional,
 * o mês ("mes" = AAAA-MM) quando o nome do arquivo não diz. Importar o mesmo mês de novo
 * substitui o que estava (não duplica).
 */
export async function POST(request: Request) {
  const { representante } = await requireFidcMensal();
  const form = await request.formData();
  const arquivo = form.get('planilha');
  const mesEscolhido = String(form.get('mes') ?? '').trim();
  if (!(arquivo instanceof File) || !arquivo.size) return erro('Selecione a planilha RISCO GERAL OPERAÇÕES FIDCs (.xlsx).');
  if (!/\.xlsx$/i.test(arquivo.name)) return erro('A planilha precisa estar em .xlsx.');

  let risco;
  try {
    risco = lerRisco(await lerAbasXlsx(await arquivo.arrayBuffer()), arquivo.name);
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e));
  }
  const mes = /^\d{4}-\d{2}$/.test(mesEscolhido) ? mesEscolhido : risco.mes;
  if (!mes) return NextResponse.json({ precisaMes: true, erro: 'Não consegui saber o mês pelo nome do arquivo. Escolha o mês.' }, { status: 400 });

  const db = createServiceRoleClient();
  const dia = `${mes}-01`;
  const { data: antes } = await db.from('fidc_risco_meses').select('mes').eq('mes', dia).maybeSingle();
  const r1 = await db.from('fidc_risco_meses').upsert(
    {
      mes: dia,
      data_posicao: risco.dataPosicao,
      arquivo: arquivo.name,
      usuario_id: representante.id,
      usuario_nome: representante.nome,
      importado_em: new Date().toISOString(),
    },
    { onConflict: 'mes' }
  );
  if (r1.error) return erro(/fidc_risco/.test(r1.error.message) ? SQL : r1.error.message, 500);
  const r2 = await db.from('fidc_risco').delete().eq('mes', dia);
  if (r2.error) return erro(r2.error.message, 500);
  const r3 = await db.from('fidc_risco').insert(risco.linhas.map((l) => ({ ...l, mes: dia })));
  if (r3.error) return erro(r3.error.message, 500);

  const aVencer = risco.linhas.reduce((s, l) => s + l.a_vencer, 0);
  const vencidos = risco.linhas.reduce((s, l) => s + l.vencidos, 0);
  return NextResponse.json({
    ok: true,
    mes,
    dataPosicao: risco.dataPosicao,
    linhas: risco.linhas.length,
    aVencer,
    vencidos,
    atualizado: Boolean(antes),
  });
}

import { requireFidc } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabasePaginado';
import { PainelMensal, type LinhaRisco, type MesRisco, type OpMes } from './PainelMensal';

export const dynamic = 'force-dynamic';

/** Mensal FIDC: risco (a vencer / vencidos) por empresa e FIDC, mês a mês, da planilha RISCO do financeiro. */
export default async function FidcMensalPage() {
  await requireFidc();
  const db = createServiceRoleClient();
  const num = (v: unknown) => Number(v) || 0;

  let meses: MesRisco[] = [];
  let linhas: LinhaRisco[] = [];
  let ops: OpMes[] = [];
  let falta: string | null = null;
  try {
    const { data, error } = await db
      .from('fidc_risco_meses')
      .select('mes,data_posicao,arquivo,usuario_nome,importado_em')
      .order('mes', { ascending: true });
    if (error) throw new Error(error.message);
    meses = (data ?? []).map((m) => ({ ...m, mes: String(m.mes).slice(0, 7) })) as MesRisco[];

    const brutas = await buscarTodas<{ mes: string; ordem: number; empresa: string; fidc: string; a_vencer: number; vencidos: number }>((de, ate) =>
      db.from('fidc_risco').select('mes,ordem,empresa,fidc,a_vencer,vencidos').order('mes').order('ordem').range(de, ate)
    );
    linhas = brutas.map((l) => ({ ...l, mes: String(l.mes).slice(0, 7), a_vencer: num(l.a_vencer), vencidos: num(l.vencidos) }));

    // operações (antecipado e custo) dos meses que têm risco, somadas por mês/FIDC/empresa
    if (meses.length) {
      const de = `${meses[0].mes}-01`;
      const operacoes = await buscarTodas<{ data: string; fidc: string; empresa: string; bruto: number; despesas: number }>((a, b) =>
        db.from('fidc_operacoes').select('data,fidc,empresa,bruto,despesas').gte('data', de).order('id').range(a, b)
      );
      const soma = new Map<string, OpMes>();
      for (const o of operacoes) {
        const k = `${o.data.slice(0, 7)}|${o.fidc}|${o.empresa}`;
        const s = soma.get(k) ?? { mes: o.data.slice(0, 7), fidc: o.fidc, empresa: o.empresa, bruto: 0, despesas: 0, qtd: 0 };
        s.bruto += num(o.bruto);
        s.despesas += num(o.despesas);
        s.qtd++;
        soma.set(k, s);
      }
      ops = Array.from(soma.values());
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    falta = /fidc_risco/.test(msg) ? 'Falta rodar o supabase/fidc_risco.sql no Supabase.' : msg;
  }

  return (
    <div>
      <PageHeading
        title="Mensal FIDC"
        subtitle="Risco nas FIDCs mês a mês: quanto está a vencer e vencido em cada FIDC e empresa, da planilha RISCO do financeiro."
      />
      {falta ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{falta}</p>
      ) : (
        <PainelMensal meses={meses} linhas={linhas} ops={ops} />
      )}
    </div>
  );
}

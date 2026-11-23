import { requireFidc } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabasePaginado';
import { PainelFidc, type Importacao, type Operacao } from './PainelFidc';

export const dynamic = 'force-dynamic';

/** FIDC: operações de antecipação de recebíveis (diretoria acompanha; financeiro importa a planilha do dia). */
export default async function FidcPage() {
  await requireFidc();
  const db = createServiceRoleClient();

  let operacoes: Operacao[] = [];
  let ultima: Importacao | null = null;
  let falta: string | null = null;
  try {
    operacoes = await buscarTodas<Operacao>((de, ate) =>
      db
        .from('fidc_operacoes')
        .select('id,data,aba,nome_original,fidc,empresa,bruto,recompras,refaturamento,nota_troca,substituicao,prorrogacao,desconto,despesas,liquido,bordero_id,origem')
        .order('data', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    const { data } = await db
      .from('fidc_importacoes')
      .select('criado_em,usuario_nome,arquivo,dias,operacoes,primeira_data,ultima_data')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    ultima = (data as Importacao | null) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    falta = /fidc_/.test(msg) ? 'Falta rodar o supabase/fidc.sql no Supabase.' : msg;
  }

  // numeric vem como texto do PostgREST em alguns casos
  const num = (v: unknown) => Number(v) || 0;
  operacoes = operacoes.map((o) => ({
    ...o,
    bruto: num(o.bruto),
    recompras: num(o.recompras),
    refaturamento: num(o.refaturamento),
    nota_troca: num(o.nota_troca),
    substituicao: num(o.substituicao),
    prorrogacao: num(o.prorrogacao),
    desconto: num(o.desconto),
    despesas: num(o.despesas),
    liquido: num(o.liquido),
  }));

  return (
    <div>
      <PageHeading
        title="FIDC"
        subtitle="Antecipações de recebíveis: quanto foi antecipado, quanto custou e quanto entrou, por FIDC, empresa e mês."
      />
      {falta ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{falta}</p>
      ) : (
        <PainelFidc operacoes={operacoes} ultima={ultima} />
      )}
    </div>
  );
}

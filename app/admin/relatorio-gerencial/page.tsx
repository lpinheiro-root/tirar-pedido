import { requireSuperAdmin } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarContasAno } from '@/lib/gerencial/dados';
import type { Ajuste, ContaMes, Mensal } from '@/lib/gerencial/rubricas';
import { PainelGerencial } from './PainelGerencial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Relatório Gerencial (DG): despesas pagas no mês por rubrica, direto do ORGM, com os acertos do controle. */
export default async function RelatorioGerencialPage({ searchParams }: { searchParams: { ano?: string } }) {
  await requireSuperAdmin();
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const anoAtual = Number(hoje.slice(0, 4));
  const pedido = Number(searchParams.ano);
  const ano = Number.isInteger(pedido) && pedido >= 2023 && pedido <= anoAtual ? pedido : anoAtual;
  const num = (v: unknown) => Number(v) || 0;

  let contas: ContaMes[] = [];
  let erroOrgm: string | null = null;
  try {
    contas = await buscarContasAno(ano);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    erroOrgm = /ECONNREFUSED|ETIMEOUT|ESOCKET|ECONNRESET|Failed to connect|login failed/i.test(m)
      ? 'Sem conexão com o ORGM agora. Atualize a página em instantes.'
      : m;
  }

  const db = createServiceRoleClient();
  let falta: string | null = null;
  const [mensalR, ajustesR, deparaR, paramR] = await Promise.all([
    db.from('gerencial_mensal').select('*').eq('ano', ano),
    db.from('gerencial_ajustes').select('*').eq('ano', ano).order('mes').order('id'),
    db.from('gerencial_depara').select('conta,rubrica'),
    db.from('gerencial_parametros').select('rubrica,percentual'),
  ]);
  const erroDb = mensalR.error ?? ajustesR.error ?? deparaR.error ?? paramR.error;
  if (erroDb) falta = /gerencial_/.test(erroDb.message) ? 'Falta rodar o supabase/gerencial.sql no Supabase.' : erroDb.message;

  const mensal: Mensal[] = (mensalR.data ?? []).map((m) => ({
    ano: m.ano,
    mes: m.mes,
    faturamento: num(m.faturamento),
    fat_off: num(m.fat_off),
    fat_terceiros: num(m.fat_terceiros),
    fat_ecommerce: num(m.fat_ecommerce),
    fat_exportacao: num(m.fat_exportacao),
    recebimento: num(m.recebimento),
    cheque_especial: num(m.cheque_especial),
  }));
  const ajustes: Ajuste[] = (ajustesR.data ?? []).map((a) => ({ ...a, valor: num(a.valor) }));
  const depara: Record<string, string> = Object.fromEntries((deparaR.data ?? []).map((d) => [d.conta, d.rubrica]));
  const parametros: Record<string, number> = Object.fromEntries((paramR.data ?? []).map((p) => [p.rubrica, num(p.percentual)]));

  // meses fechados: no ano corrente, até o mês anterior ao de hoje
  const ultimoMesFechado = ano < anoAtual ? 12 : Number(hoje.slice(5, 7)) - 1;

  return (
    <div>
      <PageHeading
        title="Relatório Gerencial"
        subtitle="Despesas pagas no mês por rubrica, direto do ORGM (pagamentos por conta contábil), com faturamento, parâmetros e os acertos do controle."
      />
      {falta && <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{falta}</p>}
      {erroOrgm ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{erroOrgm}</p>
      ) : (
        <PainelGerencial
          ano={ano}
          anoAtual={anoAtual}
          ultimoMesFechado={ultimoMesFechado}
          contas={contas}
          mensal={mensal}
          ajustes={ajustes}
          depara={depara}
          parametros={parametros}
        />
      )}
    </div>
  );
}

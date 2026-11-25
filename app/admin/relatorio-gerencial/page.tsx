import { requireRelatorioGerencial } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { carregarManuais, hojeSP, ultimoMesFechado } from '@/lib/gerencial/carregar';
import { buscarContasAno } from '@/lib/gerencial/dados';
import type { ContaMes } from '@/lib/gerencial/rubricas';
import { PainelGerencial } from './PainelGerencial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Relatório Gerencial (DG): despesas pagas no mês por rubrica, direto do ORGM, com os acertos do controle. */
export default async function RelatorioGerencialPage({ searchParams }: { searchParams: { ano?: string } }) {
  await requireRelatorioGerencial();
  const { anoAtual } = hojeSP();
  const pedido = Number(searchParams.ano);
  const ano = Number.isInteger(pedido) && pedido >= 2023 && pedido <= anoAtual ? pedido : anoAtual;

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
  const { mensal, ajustes, depara, parametros, lancamentos, falta } = await carregarManuais(ano);

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
          ultimoMesFechado={ultimoMesFechado(ano)}
          contas={contas}
          mensal={mensal}
          ajustes={ajustes}
          depara={depara}
          parametros={parametros}
          lancamentos={lancamentos}
        />
      )}
    </div>
  );
}

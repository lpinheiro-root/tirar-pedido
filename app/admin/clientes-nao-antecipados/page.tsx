import { requireNaoAntecipados } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { buscarNaoAntecipados } from '@/lib/naoAntecipados/dados';
import { dataValida, periodoPadrao, type TituloNaoAntecipado } from '@/lib/naoAntecipados/comum';
import { PainelNaoAntecipados } from './PainelNaoAntecipados';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Clientes não antecipados: CR em aberto dos clientes com "Bloqueia antecipação CR" no ORGM. */
export default async function NaoAntecipadosPage({ searchParams }: { searchParams: { de?: string; ate?: string; todos?: string } }) {
  await requireNaoAntecipados();
  const padrao = periodoPadrao();
  const todos = searchParams.todos === '1';
  const de = todos ? '' : dataValida(searchParams.de) || padrao.de;
  const ate = todos ? '' : dataValida(searchParams.ate) || padrao.ate;
  let titulos: TituloNaoAntecipado[] = [];
  let erro: string | null = null;
  try {
    titulos = await buscarNaoAntecipados(de, ate);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    erro = /ECONNREFUSED|ETIMEOUT|ESOCKET|ECONNRESET|Failed to connect|login failed/i.test(m)
      ? 'Sem conexão com o ORGM agora. Atualize a página em instantes.'
      : m;
  }

  return (
    <div>
      <PageHeading
        title="Clientes não antecipados"
        subtitle="Títulos a receber em aberto dos clientes marcados no ORGM com “Bloqueia antecipação CR”, pela data de emissão."
      />
      {erro ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{erro}</p>
      ) : (
        <PainelNaoAntecipados titulos={titulos} de={de} ate={ate} />
      )}
    </div>
  );
}

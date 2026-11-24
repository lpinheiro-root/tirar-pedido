import { requireInadimplencia } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarVencidos } from '@/lib/inadimplencia/dados';
import type { TituloVencido } from '@/lib/inadimplencia/comum';
import { PainelInadimplencia, type Foto } from './PainelInadimplencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Inadimplência: títulos a receber vencidos e não pagos, direto do ORGM. */
export default async function InadimplenciaPage({ searchParams }: { searchParams: { grupo?: string } }) {
  await requireInadimplencia();
  const incluirGrupo = searchParams.grupo === '1';
  let titulos: TituloVencido[] = [];
  let erro: string | null = null;
  let fotos: Foto[] = [];
  try {
    titulos = await buscarVencidos(incluirGrupo);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    erro = /ECONNREFUSED|ETIMEOUT|ESOCKET|ECONNRESET|Failed to connect|login failed/i.test(m)
      ? 'Sem conexão com o ORGM agora. Atualize a página em instantes.'
      : m;
  }

  // foto do dia (só clientes de fora do grupo) para a evolução; e as fotos guardadas
  const db = createServiceRoleClient();
  try {
    if (!erro) {
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      const soma = new Map<string, { dia: string; empresa_id: string; empresa: string; tipo: string; qtd: number; saldo: number }>();
      for (const t of titulos.filter((x) => !x.grupo)) {
        const k = `${t.empresaId}|${t.tipoCarteira}`;
        const s = soma.get(k) ?? { dia: hoje, empresa_id: t.empresaId, empresa: t.empresa, tipo: t.tipoCarteira, qtd: 0, saldo: 0 };
        s.qtd++;
        s.saldo = Math.round((s.saldo + t.saldo) * 100) / 100;
        soma.set(k, s);
      }
      await db.from('inadimplencia_fotos').delete().eq('dia', hoje);
      if (soma.size) await db.from('inadimplencia_fotos').insert(Array.from(soma.values()).map((s) => ({ ...s, atualizado_em: new Date().toISOString() })));
    }
    const { data } = await db.from('inadimplencia_fotos').select('dia,empresa_id,tipo,qtd,saldo').order('dia').limit(20000);
    fotos = (data ?? []).map((f) => ({ ...f, saldo: Number(f.saldo) || 0 })) as Foto[];
  } catch {
    // sem a tabela ainda: só não mostra a evolução
  }

  return (
    <div>
      <PageHeading
        title="Inadimplência"
        subtitle="Títulos a receber vencidos e não pagos, direto do ORGM: por empresa, cliente, carteira (FIDC, banco ou própria) e tempo de atraso."
      />
      {erro ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{erro}</p>
      ) : (
        <PainelInadimplencia titulos={titulos} incluirGrupo={incluirGrupo} fotos={fotos} />
      )}
    </div>
  );
}

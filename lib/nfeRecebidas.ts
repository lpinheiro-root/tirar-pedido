import type { SupabaseClient } from '@supabase/supabase-js';

/** Filtros da tela NF-e Recebidas (vindos da URL). */
export interface FiltrosNFe {
  empresa: string; // CNPJ do destinatário ou '' (todas)
  mes: string; // yyyy-mm ou '' (todos)
  busca: string; // nome ou CNPJ do emitente
  vinculo: '' | 'com' | 'sem'; // ligada a compra do cartão
}

export function lerFiltros(params: Record<string, string | undefined>): FiltrosNFe {
  return {
    empresa: /^\d{14}$/.test(params.empresa ?? '') ? params.empresa! : '',
    mes: /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : '',
    busca: (params.busca ?? '').trim().slice(0, 80),
    vinculo: params.vinculo === 'com' || params.vinculo === 'sem' ? params.vinculo : '',
  };
}

export function filtrosParaUrl(f: FiltrosNFe, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.empresa) q.set('empresa', f.empresa);
  if (f.mes) q.set('mes', f.mes);
  if (f.busca) q.set('busca', f.busca);
  if (f.vinculo) q.set('vinculo', f.vinculo);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Aplica os filtros numa consulta de cartao_notas (só NF-e válidas, sem as canceladas por padrão). */
export function aplicarFiltros<T extends { eq: any; gte: any; lt: any; or: any; is: any; not: any }>(
  query: T,
  f: FiltrosNFe
): T {
  let q = query;
  if (f.empresa) q = q.eq('cnpj_destinatario', f.empresa);
  if (f.mes) {
    const [ano, mes] = f.mes.split('-').map(Number);
    const fim = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
    q = q.gte('data_emissao', `${f.mes}-01T00:00:00-03:00`).lt('data_emissao', `${fim}-01T00:00:00-03:00`);
  }
  if (f.busca) {
    const digitos = f.busca.replace(/\D/g, '');
    const nome = f.busca.replace(/[%,()]/g, ' ');
    q = q.or(
      digitos.length >= 4 ? `nome_emitente.ilike.%${nome}%,cnpj_emitente.like.%${digitos}%` : `nome_emitente.ilike.%${nome}%`
    );
  }
  if (f.vinculo === 'com') q = q.not('compra_id', 'is', null);
  if (f.vinculo === 'sem') q = q.is('compra_id', null);
  return q;
}

export type Supabase = SupabaseClient;

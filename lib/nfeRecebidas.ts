import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarTodas } from '@/lib/supabasePaginado';
import { ocorrenciaEncerrada } from '@/lib/devolucoes';

/** Filtros da tela NF-e Recebidas (devoluções), vindos da URL. */
export interface FiltrosNFe {
  empresa: string; // CNPJ da empresa do grupo ou '' (todas)
  mes: string; // yyyy-mm ou '' (todos)
  busca: string; // cliente (nome ou documento) ou número da NFD
  situacao: '' | 'abertas' | 'encerradas';
}

export function lerFiltros(params: Record<string, string | undefined>): FiltrosNFe {
  return {
    empresa: /^\d{14}$/.test(params.empresa ?? '') ? params.empresa! : '',
    mes: /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : '',
    busca: (params.busca ?? '').trim().slice(0, 80),
    situacao: params.situacao === 'abertas' || params.situacao === 'encerradas' ? params.situacao : '',
  };
}

export function filtrosParaUrl(f: FiltrosNFe, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.empresa) q.set('empresa', f.empresa);
  if (f.mes) q.set('mes', f.mes);
  if (f.busca) q.set('busca', f.busca);
  if (f.situacao) q.set('situacao', f.situacao);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface Acompanhamento {
  motivo: string | null;
  volta_fabrica: string | null;
  retorno: string | null;
  transportadora: string | null;
  transportadora_debitada: string | null;
  pagamento_cliente: string | null;
  pagamento_feito: string | null;
  status: string | null;
  nf_fiscal: string | null;
}

export interface Devolucao {
  id: string;
  chave: string;
  data_emissao: string | null;
  valor_total: number | null;
  situacao: string;
  cnpj_destinatario: string | null;
  nome_destinatario: string | null;
  empresa_uf: string | null;
  cliente_nome: string | null;
  cliente_doc: string | null;
  cliente_uf: string | null;
  notas_origem: string[] | null;
  transportadora: string | null;
  devolucao_origem: 'cliente' | 'propria' | null;
  devolucoes_acompanhamento: Acompanhamento | null;
}

const COLUNAS =
  'id, chave, data_emissao, valor_total, situacao, cnpj_destinatario, nome_destinatario, empresa_uf, cliente_nome, cliente_doc, cliente_uf, notas_origem, transportadora, devolucao_origem, devolucoes_acompanhamento(motivo, volta_fabrica, retorno, transportadora, transportadora_debitada, pagamento_cliente, pagamento_feito, status, nf_fiscal)';

/**
 * Todas as devoluções do filtro (volume baixo: dezenas a centenas por mês).
 * A situação (aberta/encerrada) vem do status preenchido pela equipe, por isso
 * é filtrada aqui.
 */
export async function buscarDevolucoes(supabase: SupabaseClient, f: FiltrosNFe): Promise<Devolucao[]> {
  const linhas = await buscarTodas<Devolucao>((de, ate) => {
    // só NFD emitidas pelos clientes (as entradas próprias não entram no controle da equipe)
    let q = supabase.from('cartao_notas').select(COLUNAS).eq('tipo', 'devolucao').eq('devolucao_origem', 'cliente');
    if (f.empresa) q = q.eq('cnpj_destinatario', f.empresa);
    if (f.mes) {
      const [ano, mes] = f.mes.split('-').map(Number);
      const fim = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
      q = q.gte('data_emissao', `${f.mes}-01T00:00:00-03:00`).lt('data_emissao', `${fim}-01T00:00:00-03:00`);
    }
    if (f.busca) {
      const digitos = f.busca.replace(/\D/g, '');
      const nome = f.busca.replace(/[%,()]/g, ' ');
      const ou = [`cliente_nome.ilike.%${nome}%`];
      if (digitos.length >= 3 && digitos.length <= 9) ou.push(`chave.like.%${digitos.padStart(9, '0')}%`);
      if (digitos.length >= 4) ou.push(`cliente_doc.like.%${digitos}%`);
      q = q.or(ou.join(','));
    }
    // a chave é PK do acompanhamento: o PostgREST devolve objeto (um por NFD), não lista
    return q.order('data_emissao', { ascending: false }).order('chave').range(de, ate).returns<Devolucao[]>();
  });
  if (!f.situacao) return linhas;
  return linhas.filter((d) =>
    f.situacao === 'encerradas'
      ? ocorrenciaEncerrada(d.devolucoes_acompanhamento?.status)
      : !ocorrenciaEncerrada(d.devolucoes_acompanhamento?.status)
  );
}

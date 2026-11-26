/**
 * Clientes não antecipados: tipos e filtros usados pela tela e pelo Excel (sem acesso a banco).
 */
export interface TituloNaoAntecipado {
  finMovId: number;
  empresa: string;
  cnpj: string;
  clienteCod: string;
  /** "8001 - SUPERMERCADOS FEIRA NOVA LTDA", como no ORGM (com os espaços do cadastro) */
  cliente: string;
  /** carteira (ContaPrevPgtoDesc): banco / FIDC / CARTEIRA */
  contaNome: string;
  historico: string;
  valorOriginal: number;
  valorPago: number;
  saldo: number;
  documento: string;
  emissao: string | null;
  vencimento: string | null;
  venda: number;
  vendedor: string;
}

export interface FiltrosNaoAntecipados {
  empresa?: string;
  /** código do cliente (clique na visão por cliente) */
  cliente?: string;
  carteira?: string;
  vendedor?: string;
  venda?: '' | '0' | '1';
  busca?: string;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

export function filtrar(ts: TituloNaoAntecipado[], f: FiltrosNaoAntecipados) {
  const busca = norm((f.busca ?? '').trim());
  const digitos = busca.replace(/\D/g, '');
  return ts.filter(
    (t) =>
      (!f.empresa || t.empresa === f.empresa) &&
      (!f.cliente || t.clienteCod === f.cliente) &&
      (!f.carteira || t.contaNome === f.carteira) &&
      (!f.vendedor || t.vendedor === f.vendedor) &&
      (!f.venda || String(t.venda) === f.venda) &&
      (!busca ||
        norm(`${t.cliente} ${t.documento} ${t.historico} ${t.finMovId}`).includes(busca) ||
        (digitos.length >= 3 && t.cnpj.replace(/\D/g, '').includes(digitos)))
  );
}

/** Primeiro dia do mês e hoje (horário de Brasília), em yyyy-mm-dd. */
export function periodoPadrao() {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

export const dataValida = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');

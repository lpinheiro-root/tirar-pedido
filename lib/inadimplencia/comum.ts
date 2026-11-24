/**
 * Inadimplência: tipos, classificação e filtros usados pela tela e pelo Excel (sem acesso ao banco,
 * pode ser importado no navegador). A leitura do ORGM fica em ./dados.ts.
 */

export type TipoCarteira = 'fidc' | 'banco' | 'carteira' | 'outra';

export interface TituloVencido {
  finMovId: number;
  empresaId: string;
  empresa: string;
  clienteCod: string;
  cliente: string;
  clienteFantasia: string;
  cnpj: string;
  documento: string;
  emissao: string | null;
  vencimento: string; // AAAA-MM-DD
  dias: number; // dias de atraso
  valor: number;
  pago: number;
  saldo: number;
  carteiraCod: string;
  carteira: string;
  tipoCarteira: TipoCarteira;
  fidc: string | null; // nome da FIDC quando a carteira é de FIDC
  recompra: boolean; // histórico do título diz "RECOMPRADO"
  descricao: string; // "DESCRIÇÃO BANCARIA" da planilha da cobrança: RECOMPRA / nome da FIDC / CARTEIRA
  vendedorCod: string;
  vendedor: string;
  ufVendedor: string | null;
  regiao: string;
  cidade: string; // "GOIANIA/GO"
  bairro: string;
  grupo: boolean; // cliente é empresa do grupo (venda entre empresas)
}

/**
 * Vendedores que não podem aparecer no sistema (inadimplência): títulos deles, ou de clientes que
 * têm eles como representante, ficam de fora. 9233 = MAURICIO(ITALAC).
 */
export const VENDEDORES_OCULTOS = ['9233'];

/** Como a cobrança escreve na coluna DESCRIÇÃO BANCARIA. */
export function descricaoBancaria(tipo: TipoCarteira, fidc: string | null, recompra: boolean) {
  if (recompra) return 'RECOMPRA';
  if (tipo === 'fidc' && fidc) return semAcento(fidc).toUpperCase();
  return 'CARTEIRA';
}

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
/** "MARIA DO ROCIO ( MS )", "EVANILDO (MT)", "RODRIGO QUINTINO CLEMENTE(GO)" → UF. */
export function ufDoNome(nome: string): string | null {
  const m = nome.toUpperCase().match(/\(\s*([A-Z]{2})\b/);
  return m && UFS.includes(m[1]) ? m[1] : null;
}

export const REGIOES: Record<string, string[]> = {
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
export function regiaoDaUf(uf: string | null): string {
  if (!uf) return 'Sem região';
  for (const [r, ufs] of Object.entries(REGIOES)) if (ufs.includes(uf)) return r;
  return 'Sem região';
}

export const TIPOS_CARTEIRA: { id: TipoCarteira; rotulo: string }[] = [
  { id: 'fidc', rotulo: 'Em FIDC' },
  { id: 'banco', rotulo: 'Cobrança no banco' },
  { id: 'carteira', rotulo: 'Carteira própria' },
  { id: 'outra', rotulo: 'Outras' },
];

/** FIDCs pelo nome da carteira no ORGM ("GOAL VENEZA RJ", "LECCA FIDC ROMA", "AMPLIC ROMA AG 36455..."). */
const FIDCS: [string, RegExp][] = [
  ['Amplic', /\bAMPLIC\b/],
  ['Crescer', /\bCRESCER\b/],
  ['Goal', /\bGOAL\b/],
  ['Prévia', /\bPREVIA\b/],
  ['Lecca', /\b(LECCA|RIVO)\b/],
  ['Lira', /\bLIRA\b/],
  ['Lavoro', /\bLAVORO\b/],
  ['Braspor', /\bBRASPOR\b/],
  ['Opera', /\bOPERA\b/],
  ['Delta', /\bDELTA\b/],
  ['Guanabara', /\bGUANABARA\b/],
  ['Via Capital', /\bVIA CAPITAL\b/],
  ['SRM', /\bSRM\b/],
  ['Investhor', /\bINVESTHOR\b/],
];

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function classificarCarteira(nome: string): { tipo: TipoCarteira; fidc: string | null } {
  const n = semAcento(nome ?? '').toUpperCase();
  if (!n.trim() || /^CARTEIRA$/.test(n.trim())) return { tipo: 'carteira', fidc: null };
  for (const [f, re] of FIDCS) if (re.test(n)) return { tipo: 'fidc', fidc: f };
  // "SANTANDER ROMA AG 4271 CC ..." é conta no banco; "SANTANDER VENEZA PE" (sem agência) é antecipação
  if (/\bSANTANDER\b/.test(n)) return /\bAG\b/.test(n) ? { tipo: 'banco', fidc: null } : { tipo: 'fidc', fidc: 'Santander' };
  if (/\b(BANCO|BRADESCO|ITAU|CAIXA|SICOOB|SICREDI|INTER)\b|\bAG\b/.test(n)) return { tipo: 'banco', fidc: null };
  return { tipo: 'outra', fidc: null };
}

export const FAIXAS = [
  { id: 'f30', rotulo: 'Até 30 dias', min: 1, max: 30 },
  { id: 'f60', rotulo: '31 a 60 dias', min: 31, max: 60 },
  { id: 'f90', rotulo: '61 a 90 dias', min: 61, max: 90 },
  { id: 'f180', rotulo: '91 a 180 dias', min: 91, max: 180 },
  { id: 'f365', rotulo: '181 a 365 dias', min: 181, max: 365 },
  { id: 'f999', rotulo: 'Mais de 1 ano', min: 366, max: Infinity },
] as const;
export type Faixa = (typeof FAIXAS)[number]['id'];
export const faixaDe = (dias: number): Faixa => (FAIXAS.find((f) => dias >= f.min && dias <= f.max) ?? FAIXAS[FAIXAS.length - 1]).id;

export interface Filtros {
  empresa?: string;
  tipo?: TipoCarteira | '';
  fidc?: string;
  faixa?: Faixa | '';
  vendedor?: string; // código do vendedor
  regiao?: string;
  busca?: string;
}

export function filtrar(ts: TituloVencido[], f: Filtros) {
  const b = semAcento(f.busca ?? '')
    .toLowerCase()
    .trim();
  const bDig = b.replace(/\D/g, '');
  return ts.filter(
    (t) =>
      (!f.empresa || t.empresaId === f.empresa) &&
      (!f.tipo || t.tipoCarteira === f.tipo) &&
      (!f.fidc || t.fidc === f.fidc) &&
      (!f.faixa || faixaDe(t.dias) === f.faixa) &&
      (!f.vendedor || t.vendedorCod === f.vendedor) &&
      (!f.regiao || t.regiao === f.regiao) &&
      (!b ||
        semAcento(`${t.cliente} ${t.clienteFantasia} ${t.documento} ${t.clienteCod} ${t.vendedor} ${t.cidade}`).toLowerCase().includes(b) ||
        t.vendedorCod.toLowerCase() === b ||
        (bDig.length >= 4 && t.cnpj.replace(/\D/g, '').includes(bDig)))
  );
}

/**
 * Ordem das empresas e FIDCs igual às tabelas dinâmicas da planilha RISCO (DIN.1 / DIN.2):
 * empresas em ordem alfabética, com VENEZA RS por último (entrou depois na planilha);
 * FIDCs em ordem alfabética, com as escritas em maiúsculas (OPERA) no fim.
 */
const EMPRESAS = ['BIOSENSE', 'ROMA', 'VENEZA PE', 'VENEZA RJ', 'VENEZA SP', 'VENEZA RS'];

export function ordemEmpresa(a: string, b: string) {
  const ia = EMPRESAS.indexOf(a);
  const ib = EMPRESAS.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'pt-BR');
  return a.localeCompare(b, 'pt-BR');
}

const maiuscula = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s);
export function ordemFidc(a: string, b: string) {
  return Number(maiuscula(a)) - Number(maiuscula(b)) || a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
/** Chave para juntar a FIDC da planilha RISCO ("Previa", "OPERA") com a das operações ("Prévia", "Opera"). */
export const chaveFidc = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z]/g, '');

export const NOMES_MES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

/** Empresas do grupo que compram no cartão e recebem NF-e (CNPJ → nome curto). */
export const EMPRESAS_GRUPO: Record<string, string> = {
  '30066989000105': 'Biosense',
  '34467748000110': 'Veneza',
  '29323477000190': 'Roma',
};

export function formatarCnpj(c: string | null | undefined): string {
  if (!c) return '';
  return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
}

/**
 * Nome curto para as empresas do grupo, separando matriz e filiais pelo CNPJ
 * (ex.: "Biosense", "Biosense — filial 0005"); para as demais, o nome informado.
 */
export function nomeCurtoEmpresa(cnpj: string, nome?: string | null): string {
  const raiz = cnpj.slice(0, 8);
  const grupo = Object.entries(EMPRESAS_GRUPO).find(([c]) => c.slice(0, 8) === raiz)?.[1];
  if (grupo) return cnpj.slice(8, 12) === '0001' ? grupo : `${grupo} — filial ${cnpj.slice(8, 12)}`;
  return nome?.trim() || formatarCnpj(cnpj);
}

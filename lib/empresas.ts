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

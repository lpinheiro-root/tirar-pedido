export const BANCO_LABEL: Record<string, string> = {
  itau: 'Itaú',
  bradesco: 'Bradesco',
  nubank: 'Nubank',
  inter: 'Inter',
  c6: 'C6 Bank',
  santander: 'Santander',
  bb: 'Banco do Brasil',
  caixa: 'Caixa',
  desconhecido: 'Banco não identificado',
};

export const ORIGEM_LABEL: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  magalu: 'Magalu',
  amazon: 'Amazon',
  outro: 'Outro',
};

export type StatusLancamento = 'pendente' | 'conciliado' | 'divergente' | 'ignorado';

export const STATUS_LANCAMENTO: Record<StatusLancamento, { label: string; classe: string }> = {
  conciliado: { label: 'Conciliado', classe: 'bg-green-100 text-green-700' },
  divergente: { label: 'Divergente', classe: 'bg-amber-100 text-amber-800' },
  pendente: { label: 'Sem compra', classe: 'bg-error-container text-error-on-container' },
  ignorado: { label: 'Resolvido', classe: 'bg-surface-container text-on-surface-variant' },
};

export const TIPO_LABEL: Record<string, string> = {
  compra: 'Compra',
  estorno: 'Estorno',
  pagamento: 'Pagamento',
  encargo: 'Encargo',
};

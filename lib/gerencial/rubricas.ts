/**
 * Relatório Gerencial (DG): rubricas da planilha do controle e o de-para padrão
 * "conta contábil do ORGM → rubrica". Sem acesso a banco: pode ser importado no navegador.
 * O controle pode trocar a rubrica de qualquer conta na tela (tabela gerencial_depara),
 * que vale por cima deste padrão.
 */

export interface Rubrica {
  cod: string;
  nome: string;
  /** parâmetro sobre o faturamento (0.10 = 10%), da coluna "PARAMETRO S/ FAT" da planilha */
  parametro: number;
}

export const RUBRICAS: Rubrica[] = [
  { cod: '001', nome: 'Comissões vendas', parametro: 0.1 },
  { cod: '002', nome: 'Gerência vendas', parametro: 0 },
  { cod: '003', nome: 'Incentivo vendas / brindes / feiras de negócios', parametro: 0.005 },
  { cod: '004', nome: 'ADS - Incentivo vendas on-line', parametro: 0.015 },
  { cod: '005', nome: 'Premiações / gratificações', parametro: 0.01 },
  { cod: '006', nome: 'Propaganda / publicidade / registros produtos', parametro: 0.01 },
  { cod: '007', nome: 'Administrativo vendas - RDV', parametro: 0.005 },
  { cod: '008', nome: 'Manutenção vendas', parametro: 0 },
  { cod: '009', nome: 'Recompra de títulos / desp. factoring', parametro: 0 },
  { cod: '010', nome: 'Juros / multas pagos / cheque especial', parametro: 0 },
  { cod: '011', nome: 'Tarifas antecipações / prorrog. / desc. / títulos', parametro: 0 },
  { cod: '012', nome: 'Cartão de crédito', parametro: 0 },
  { cod: '013', nome: 'Tarifas banco, taxas diversas, IPTU, cartórios', parametro: 0.005 },
  { cod: '014', nome: 'Frete entrega / fornecedor', parametro: 0.08 },
  { cod: '015', nome: 'Frete fornecedores / outros transportes', parametro: 0.005 },
  { cod: '016', nome: 'Prestação serviços / uniformes / MEI', parametro: 0.025 },
  { cod: '017', nome: 'Seguros / combustível', parametro: 0.003 },
  { cod: '018', nome: 'Aluguéis de móveis / imóveis', parametro: 0.005 },
  { cod: '032', nome: 'Manutenção fábricas', parametro: 0.005 },
  { cod: '036', nome: 'Serviços gerais / limpeza', parametro: 0.002 },
  { cod: '041', nome: 'Cozinha', parametro: 0.01 },
  { cod: '042', nome: 'Cesta básica', parametro: 0.003 },
  { cod: '043', nome: 'Material escritório / expediente / laboratório', parametro: 0.005 },
  { cod: '044', nome: 'Correio / malotes', parametro: 0 },
  { cod: '045', nome: 'Impressões / toner / folhas', parametro: 0 },
  { cod: '046', nome: 'Energia elétrica', parametro: 0.015 },
  { cod: '047', nome: 'Água', parametro: 0 },
  { cod: '048', nome: 'Gás', parametro: 0 },
  { cod: '049', nome: 'Telefones', parametro: 0 },
  { cod: '050', nome: 'Imobilizado / BNDES / fotovoltaico', parametro: 0.015 },
  { cod: '051', nome: 'Sindicato', parametro: 0 },
  { cod: '052', nome: 'PIS, CSLL, Simples Nacional', parametro: 0.01 },
  { cod: '053', nome: 'COFINS / IPI', parametro: 0.005 },
  { cod: '054', nome: 'IRPJ', parametro: 0.015 },
  { cod: '055', nome: 'Parcelamentos gerais', parametro: 0.03 },
  { cod: '056', nome: 'Substituição tributária', parametro: 0.015 },
  { cod: '057', nome: 'ICMS', parametro: 0.015 },
  { cod: '058', nome: 'INSS empresa', parametro: 0.02 },
  { cod: '059', nome: 'FGTS folha mês', parametro: 0.01 },
  { cod: '060', nome: 'Empréstimos sócios / bancos / reembolsos', parametro: 0.02 },
  { cod: '061', nome: '13º salários', parametro: 0 },
  { cod: '062', nome: 'Férias', parametro: 0.015 },
  { cod: '063', nome: 'Rescisões e multa 40% / acordo judicial', parametro: 0.01 },
  { cod: '064', nome: 'Despesas Sankhya até 2022 / bloqueio judicial', parametro: 0 },
  { cod: '065', nome: 'Matéria-prima', parametro: 0.17 },
  { cod: '066', nome: 'Embalagens', parametro: 0.17 },
  { cod: '067', nome: 'ISS', parametro: 0 },
  { cod: '068', nome: 'IRRF terceiros', parametro: 0.001 },
  { cod: '069', nome: 'Folha pagto. líq. / ajuda de custo / hora extra', parametro: 0.1 },
  { cod: '070', nome: 'Plano de saúde', parametro: 0.005 },
  { cod: '071', nome: 'Vale-transporte / combustível colaborador', parametro: 0.005 },
  { cod: '072', nome: 'Diretoria pró-labore / sócios', parametro: 0.01 },
  { cod: '073', nome: 'Caixa - pequenas despesas', parametro: 0.001 },
  { cod: '074', nome: 'Acerto financeiro - capital de giro fábrica', parametro: 0 },
  { cod: '075', nome: 'Despesas de obras CD', parametro: 0 },
];

export const NOME_RUBRICA = new Map(RUBRICAS.map((r) => [r.cod, r.nome]));

/** Conta contábil do ORGM (ctbContaID) → rubrica. Conferido com jan–jun/2026 da planilha do controle. */
const PADRAO: Record<string, string[]> = {
  '001': ['01.113'],
  '003': ['01.191', '01.192'],
  '005': ['09.180'],
  '006': ['01.083', '5.2.2.01.003', '5.2.2.01.013', '01.182', '5.2.2.01.008'],
  '007': ['01.189', '5.1.1.01.005', '01.130'],
  '009': ['03.149'],
  '010': ['5.3.1.01.001', '03.166'],
  '011': ['5.3.1.01.007', '03.143', '03.124', '3.1.2.01.001', '03.168'],
  '012': ['01.107'],
  '013': ['03.135', '01.128', '01.109', '01.075', '01.187', '05.167', '01.179', '5.2.3.03.003', '01.190'],
  '014': ['01.005', '01.116', '01.152'],
  '016': [
    '08.034', '08.035', '08.037', '08.038', '08.099', '08.100', '08.108', '08.111', '08.112', '08.161', '08.169',
    '5.2.3.02.010', '5.2.3.02.001', '5.2.3.02.005', '5.2.3.02.006', '5.2.3.02.008', '5.2.3.02.009', '5.2.3.02.012',
    '5.2.1.02.002', '4.1.1.02.017', '01.006', '01.118', '01.184',
  ],
  '017': ['01.126', '01.175', '10.055', '10.049'],
  '018': ['01.080', '4.1.1.03.001', '5.2.3.01.001', '5.2.3.01.009'],
  '032': ['07.030', '07.031', '07.032', '07.033', '07.034', '5.2.3.02.003', '5.2.3.02.004', '10.136', '5.2.3.01.027'],
  '036': ['4.1.1.03.020', '5.2.3.01.030', '04.092'],
  '041': ['09.081', '5.2.3.01.024', '09.178'],
  '042': ['09.041', '5.2.1.02.008'],
  '043': ['4.1.1.03.010', '4.1.1.03.023', '4.1.1.03.022', '5.2.3.01.010', '5.2.3.01.018', '04.091', '04.086', '5.2.3.01.026'],
  '044': ['01.002'],
  '046': ['01.003', '4.1.1.03.003'],
  '047': ['01.001'],
  '048': ['4.1.1.03.004'],
  '049': ['01.011', '01.012'],
  '050': ['02.015', '02.016', '02.017', '5.2.3.01.034', '1.3.2.01.001'],
  '051': ['09.062', '4.1.1.02.007'],
  '052': ['05.025', '05.106', '5.2.3.03.004'],
  '053': ['05.023'],
  '054': ['05.105'],
  '055': ['05.171'],
  '056': ['05.026', '05.144'],
  '057': ['05.024', '05.157', '05.158', '05.159'],
  '058': ['06.029'],
  '059': ['06.028', '06.102'],
  '060': ['03.127', '2.2.1.01.001', '1.2.1.01.001'],
  '062': ['09.042'],
  '063': ['09.045', '09.120', '09.134', '01.129', '05.151'],
  '065': ['1.1.4.01.001', '04.085'],
  '066': ['1.1.4.02.001', '04.094'],
  '067': ['05.123'],
  '068': ['06.101', '5.2.1.02.015'],
  '069': ['09.046', '09.119', '09.079', '09.082', '5.2.1.01.003', '09.122'],
  '070': ['5.2.1.02.004', '4.1.1.02.019', '09.110'],
  '071': ['09.065', '4.1.1.02.028'],
  '072': ['09.044', '5.2.1.01.001'],
  '073': ['01.115'],
};

export const DEPARA_PADRAO: Record<string, string> = Object.fromEntries(
  Object.entries(PADRAO).flatMap(([rub, contas]) => contas.map((c) => [c, rub]))
);

/** Pseudo-contas criadas pelo sistema (não existem no plano de contas do ORGM). */
export const CONTA_ADS = 'ADS'; // anúncios (Shopee/ADYEN, Instagram) que vêm na conta PROPAGANDA
export const CONTA_AA_MP = 'AA-MP'; // antecipação de pedido de compra de matéria-prima
export const CONTA_AA_EMB = 'AA-EMB'; // antecipação de pedido de compra de embalagem
export const CONTA_AA_OUTROS = 'AA-OUTROS'; // antecipação de pedido de outros itens (uniforme, brinde…)
export const CONTA_AA_SEM = 'AA-SEM'; // pagamento sem conta contábil e sem pedido de compra reconhecido

Object.assign(DEPARA_PADRAO, {
  [CONTA_ADS]: '004',
  [CONTA_AA_MP]: '065',
  [CONTA_AA_EMB]: '066',
});

export const NOME_PSEUDO: Record<string, string> = {
  [CONTA_ADS]: 'ADS (anúncios Shopee/Instagram, separados de Propaganda)',
  [CONTA_AA_MP]: 'AA - antecipação pedido de compra: matéria-prima',
  [CONTA_AA_EMB]: 'AA - antecipação pedido de compra: embalagem',
  [CONTA_AA_OUTROS]: 'AA - antecipação pedido de compra: outros itens',
  [CONTA_AA_SEM]: 'AA - pagamento sem conta contábil (sem pedido reconhecido)',
};

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Valores do mês digitados pelo controle (faturamento, recebimento, cheque especial). */
export interface Mensal {
  ano: number;
  mes: number;
  faturamento: number;
  fat_off: number;
  fat_terceiros: number;
  fat_ecommerce: number;
  fat_exportacao: number;
  recebimento: number;
  cheque_especial: number;
}

export interface Ajuste {
  id: number;
  ano: number;
  mes: number;
  de_rubrica: string | null;
  para_rubrica: string | null;
  valor: number;
  descricao: string;
  criado_por: string | null;
  criado_em: string;
}

/** Soma do ORGM por conta e mês (valor pago no mês). */
export interface ContaMes {
  conta: string; // ctbContaID ou pseudo-conta
  nome: string;
  grupo: string; // conta-pai
  mes: number;
  valor: number;
  qtd: number;
}

/** Linha de pagamento (para abrir o detalhe de uma conta/mês). */
export interface Pagamento {
  finMovId: number;
  conta: string;
  mes: number;
  data: string;
  favorecido: string;
  historico: string;
  empresa: string;
  valor: number;
  pedido: number | null;
  /** AA: item de maior valor do pedido de compra */
  item?: string | null;
}

/**
 * Controle de devoluções (NFD): colunas do acompanhamento e as respostas usadas
 * pela equipe (tiradas da planilha "STATUS DE DEVOLUÇÃO 2026"). Respostas com
 * [data] ou [nº] pedem um complemento, montado no texto final igual à planilha.
 */

export type CampoAcompanhamento =
  | 'motivo'
  | 'volta_fabrica'
  | 'retorno'
  | 'transportadora'
  | 'transportadora_debitada'
  | 'pagamento_cliente'
  | 'pagamento_feito'
  | 'status'
  | 'nf_fiscal';

export const CAMPOS: { campo: CampoAcompanhamento; titulo: string; opcoes: string[] }[] = [
  {
    campo: 'motivo',
    titulo: 'Motivo',
    opcoes: [
      'FALTA',
      'AVARIA NO ESTOQUE',
      'AVARIA',
      'FALTA POR INVERSÃO',
      'FALTA E AVARIA',
      'SEM GIRO',
      'ACORDO COMERCIAL',
      'ACORDO COMERCIAL (TRANSFERÊNCIA)',
      'FALTA POR TROCA',
      'FALTA POR SOBRA',
      'FALTA DENTRO DA CAIXA',
      'NÃO CONFORMIDADE',
      'NÃO CONFORMIDADE LOTE',
      'DESACORDO',
      'ITEM NÃO CONSTA NO PEDIDO',
      'SEM PEDIDO DE COMPRA',
      'ERRO NO LOTE (VALIDADE)',
      'ERRO DE DIGITAÇÃO DA REPRESENTANTE',
      'AVARIA/VENCIDOS',
      'TROCA',
      'NFD INDEVIDA',
      'NFD INDEVIDA (DUPLICIDADE)',
    ],
  },
  {
    campo: 'volta_fabrica',
    titulo: 'Mercadoria vai voltar p/ fábrica?',
    opcoes: [
      'SIM',
      'NÃO',
      'NÃO, CLIENTE VAI DESCARTAR',
      'NÃO, CLIENTE DESCARTOU',
      'NÃO, REPRESENTANTE VAI COLETAR',
      'NÃO, PROMOTORA COLETOU',
      'NÃO, TRANSFERÊNCIA ENTRE AS FILIAIS',
      'NÃO, EXTRAVIO DA TRANSPORTADORA',
      'NÃO, TRANSPORTADORA VAI DESCARTAR',
      'NÃO, CARGA DIRETA',
      'NÃO, CLIENTE VAI USAR PARA AÇÃO',
      'NÃO, CLIENTE NÃO DEVOLVEU',
      'SIM, A SOBRA',
      'SIM, FALTA LOCALIZADA',
      'AGUARDANDO INFORMAÇÃO',
      'NFD INDEVIDA',
      'NFD INDEVIDA (DUPLICIDADE)',
    ],
  },
  {
    campo: 'retorno',
    titulo: 'Dia do retorno da mercadoria / retornou para estoque?',
    opcoes: ['RETORNOU PARA ESTOQUE DIA {data}', 'MERCADORIA RETORNOU DIA {data}', 'NÃO VAI RETORNAR', 'AGUARDANDO RETORNO'],
  },
  {
    campo: 'transportadora',
    titulo: 'Transportadora',
    opcoes: [
      'USINLOG',
      'VELOCARGAS',
      'MIRA',
      'POSITIVA',
      'ATIVA',
      'MRIO',
      'PACIFICO',
      'SR',
      'BELA FERRAZ',
      'EVIDENCIA',
      'JEOMAR',
      'BOLARI',
      'CAMINHÃO DA CASA',
    ],
  },
  {
    campo: 'transportadora_debitada',
    titulo: 'Transportadora será debitada?',
    opcoes: [
      'NÃO, ACORDO COMERCIAL',
      'SIM, EMISSÃO DE NF E BOLETO',
      'NÃO, SEM RESSALVA',
      'SIM, ENCONTRO DE CONTAS',
      'NÃO',
      'AGUARDANDO ANÁLISE',
      'NÃO, INVERSÃO',
      'NÃO, CARGA DIRETA',
      'SIM, CARTA DE DÉBITO',
      'SIM, PARCIAL CARTA DE DÉBITO',
      'NÃO, NÃO CONFORMIDADE',
      'NÃO, NÃO CONFORMIDADE LOTE',
      'NÃO, FALTA DENTRO DA CAIXA',
      'NÃO, DESACORDO',
      'NÃO, DESACORDO COM PEDIDO',
      'NÃO, ITEM EM ESTOQUE',
      'NÃO, CAMINHÃO DA CASA',
      'NÃO, MERCADORIA RETORNOU',
      'NÃO, RETORNOU PARA ESTOQUE',
      'NÃO, MERCADORIA NÃO FOI DEVOLVIDA',
      'NÃO, CT-E RETIDO',
      'NÃO, ERRO DE DIGITAÇÃO',
      'AGUARDANDO INFORMAÇÃO',
      'NFD INDEVIDA',
    ],
  },
  {
    campo: 'pagamento_cliente',
    titulo: 'Pagamento ao cliente?',
    opcoes: [
      'VIA PIX',
      'CRÉDITO EM BONIFICAÇÃO',
      'DESCONTO NA NF {num}',
      'NÃO GEROU DÉBITO (ACORDO)',
      'ABATIMENTO NO PEDIDO À VISTA',
      'BAIXA DO TÍTULO',
      'BAIXA NA NF DE ORIGEM',
      'CONTA CORRENTE',
      'BOLETO GERADO PELO CLIENTE',
      'EM TRATATIVA',
      'NFD INDEVIDA',
      'NFD INDEVIDA (DUPLICIDADE)',
    ],
  },
  {
    campo: 'pagamento_feito',
    titulo: 'Foi feito pagamento?',
    opcoes: [
      'PAGAMENTO EM BONIFICAÇÃO',
      'SOLICITADO DIA {data}',
      'PAGO DIA {data}',
      'AINDA NÃO',
      'AGUARDANDO INFORMAÇÃO DO CLIENTE',
      'AGUARDANDO EM QUAL TÍTULO SERÁ DADO',
      'AGUARDANDO INF. DE QUAL NF',
      'NÃO GEROU DÉBITO (ACORDO)',
      'NFD INDEVIDA',
    ],
  },
  {
    campo: 'status',
    titulo: 'Status',
    opcoes: [
      'SOLICITEI BAIXA NA NFD ({data}). OCORRÊNCIA ENCERRADA',
      'MERCADORIA ANALISADA. OCORRÊNCIA ENCERRADA ({data})',
      'SOLICITEI COBRANÇA CONTRA A TRANSPORTADORA ({data}). OCORRÊNCIA ENCERRADA',
      'SOLICITEI NF DE RETORNO DIA {data}.',
      'AGUARDANDO MERCADORIA',
      'AGUARDANDO INFORMAÇÃO',
      'EM ANDAMENTO',
    ],
  },
  {
    campo: 'nf_fiscal',
    titulo: 'NF fiscal',
    opcoes: [
      'SOLICITEI NF DE RETORNO DIA {data}.',
      'NF DE RETORNO {num} ({data})',
      'NF DE BAIXA {num} ({data})',
      'FISCAL DEU BAIXA DA NFD ({data})',
      'FISCAL DEU ENTRADA NA NFD ({data})',
      'BAIXA REALIZADA ({data})',
      'NF CONTRA A TRANSPORTADORA {num} ({data})',
    ],
  },
];

export const CAMPOS_VALIDOS = new Set<string>(CAMPOS.map((c) => c.campo));

/** Monta o texto final de uma resposta com complemento. */
export function preencherModelo(modelo: string, valores: { data?: string; num?: string }): string {
  const data = valores.data ? valores.data.split('-').reverse().join('/') : '';
  return modelo.replace('{data}', data).replace('{num}', (valores.num ?? '').trim()).replace(/\s+/g, ' ').trim();
}

/** Ocorrência encerrada quando o status diz isso (igual à planilha). */
export function ocorrenciaEncerrada(status: string | null | undefined): boolean {
  return /ENCERRADA/i.test(status ?? '');
}

/**
 * Nome curto da empresa no estilo da planilha: primeira palavra da razão social
 * + UF quando a empresa tem unidades em mais de um estado (ex.: "VENEZA RJ"),
 * e "MATRIZ" para a 0001 quando há filiais no mesmo estado.
 */
export function nomeEmpresaPlanilha(
  cnpj: string | null,
  nome: string | null,
  uf: string | null,
  unidades: { cnpj: string; uf: string | null }[]
): string {
  if (!cnpj) return '';
  const palavra = (nome ?? '').trim().split(/\s+/)[0]?.toUpperCase() || cnpj;
  const mesmaRaiz = unidades.filter((u) => u.cnpj.slice(0, 8) === cnpj.slice(0, 8));
  const ufs = new Set(mesmaRaiz.map((u) => u.uf).filter(Boolean));
  if (ufs.size > 1 && uf) return `${palavra} ${uf}`;
  if (mesmaRaiz.length > 1 && cnpj.slice(8, 12) === '0001') return `${palavra} MATRIZ`;
  if (mesmaRaiz.length > 1) return `${palavra} ${cnpj.slice(8, 12)}`;
  return palavra;
}

export function numeroDaChave(chave: string): string {
  return String(Number(chave.slice(25, 34)));
}

/**
 * Transforma uma resposta já usada em opção reaproveitável: a data vira {data}
 * e o número (NF, título…) vira {num}. Ex.: "SOLICITADO DIA 23/07/2026" →
 * "SOLICITADO DIA {data}"; "NF DE RETORNO 35311 (04/08/2026)" →
 * "NF DE RETORNO {num} ({data})". Respostas com mais de uma data ou número
 * ficam como estão (são casos específicos).
 */
export function modeloDaResposta(resposta: string): string {
  const t = resposta.toUpperCase().replace(/\s+/g, ' ').trim();
  const datas = t.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g) ?? [];
  const semDatas = t.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '');
  const numeros = semDatas.match(/\b\d{3,}\b/g) ?? [];
  if (datas.length > 1 || numeros.length > 1) return t;
  let modelo = t;
  if (datas.length === 1) modelo = modelo.replace(datas[0], '{data}');
  if (numeros.length === 1) modelo = modelo.replace(new RegExp('\\b' + numeros[0] + '\\b'), '{num}');
  return modelo;
}

/**
 * Opções de um campo: respostas já usadas (planilhas importadas + sistema),
 * das mais usadas para as menos, e depois a lista base que ainda não apareceu.
 */
export function opcoesDoCampo(campo: CampoAcompanhamento, respostas: (string | null | undefined)[], limite = 30): string[] {
  // agrupa variações de pontuação/acento ("ENCERRADA." e "ENCERRADA", "ANÁLISADA" e
  // "ANALISADA") e mostra a grafia mais usada de cada grupo
  const chave = (m: string) =>
    m
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9{}]/g, '');
  const grupos = new Map<string, { total: number; grafias: Map<string, number> }>();
  for (const r of respostas) {
    if (!r?.trim()) continue;
    const m = modeloDaResposta(r);
    const g = grupos.get(chave(m)) ?? { total: 0, grafias: new Map() };
    g.total++;
    g.grafias.set(m, (g.grafias.get(m) ?? 0) + 1);
    grupos.set(chave(m), g);
  }
  // respostas usadas uma vez só costumam ser casos específicos: ficam de fora da lista
  const usadas = Array.from(grupos.values())
    .filter((g) => g.total >= 2)
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
    .map((g) => Array.from(g.grafias.entries()).sort((a, b) => b[1] - a[1])[0][0]);
  const jaTem = new Set(usadas.map(chave));
  const base = CAMPOS.find((c) => c.campo === campo)?.opcoes ?? [];
  return [...usadas, ...base.filter((o) => !jaTem.has(chave(o.toUpperCase())))];
}

import { getPool } from '@/lib/sqlserver';
import {
  CONTA_AA_EMB,
  CONTA_AA_MP,
  CONTA_AA_OUTROS,
  CONTA_AA_SEM,
  CONTA_ADS,
  DEPARA_PADRAO,
  NOME_PSEUDO,
  type ContaMes,
  type Pagamento,
} from './rubricas';

/**
 * Relatório Gerencial: pagamentos do ORGM (só leitura) pela view vFinMovimentosCtbPagtos, a mesma do
 * relatório "pagamentos listados por títulos e por ordem de conta contábil" que o controle baixa.
 * Conta: títulos a pagar (TipoPara CP) e pagamentos avulsos sem título (ND), pela data do pagamento.
 */

const FILTRO = `DTPagto >= @de AND DTPagto < @ate AND TipoPara IN ('CP','ND')`;

/** Anúncios (Shopee via ADYEN, Instagram via Conta Simples) vêm na conta PROPAGANDA; o controle separa em ADS. */
const CONTA_SQL = `CASE WHEN ctbContaID = '01.083' AND (ContaNome LIKE 'ADYEN%' OR ContaNome LIKE 'CONTA SIMPLES%'
    OR ISNULL(HistoricoCPCR, Historico) LIKE '%ANUNCIO%' OR ISNULL(HistoricoCPCR, Historico) LIKE '%ANÚNCIO%'
    OR ISNULL(HistoricoCPCR, Historico) LIKE '% ADS %') THEN '${CONTA_ADS}' ELSE ctbContaID END`;

/**
 * Pagamentos sem conta contábil ("AA"): quase todos são antecipação de pedido de compra. O número do pedido
 * vem no histórico; o item do pedido tem a conta de estoque (1.1.4.10.002 matéria-prima, 1.1.4.10.007 embalagem).
 * Feito em duas consultas (pagamentos, depois pedidos): numa só, o SQL Server reavalia a view e leva mais de um minuto.
 */
const AA_SQL = `
  SELECT FinMovID, CONVERT(char(10), DTPagto, 23) AS data, MONTH(DTPagto) AS mes, ValorPagoCTB AS valor,
    ISNULL(HistoricoCPCR, Historico) AS historico, ISNULL(ClienteDesc, ContaNome) AS favorecido, EmpresaNome
  FROM dbo.vFinMovimentosCtbPagtos
  WHERE ${FILTRO} AND ContaContabil IS NULL`;

interface LinhaAA {
  FinMovID: number;
  data: string;
  mes: number;
  valor: number;
  historico: string | null;
  favorecido: string | null;
  EmpresaNome: string | null;
  pedido: number | null;
  pedidoExiste: number | null;
  param: string | null;
}

function contaAA(l: LinhaAA): string {
  const p = (l.param ?? '').trim();
  if (p === '1.1.4.10.002') return CONTA_AA_MP;
  if (p === '1.1.4.10.007') return CONTA_AA_EMB;
  if (p && DEPARA_PADRAO[p]) return p; // item com conta de despesa conhecida (uniforme, expediente, limpeza…)
  if (l.pedidoExiste) return CONTA_AA_OUTROS;
  return CONTA_AA_SEM;
}

function periodo(ano: number, mes?: number) {
  const de = mes ? `${ano}-${String(mes).padStart(2, '0')}-01` : `${ano}-01-01`;
  const fim = mes ? (mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`) : `${ano + 1}-01-01`;
  return { de, ate: fim };
}

async function buscarAA(ano: number, mes?: number): Promise<LinhaAA[]> {
  const { de, ate } = periodo(ano, mes);
  const pool = await getPool();
  const { recordset } = await pool.request().input('de', de).input('ate', ate).query(AA_SQL);
  const linhas = (recordset as LinhaAA[]).map((r) => {
    const m = String(r.historico ?? '').match(/1\d{5}/);
    return { ...r, valor: Number(r.valor) || 0, pedido: m ? Number(m[0]) : null, pedidoExiste: null, param: null } as LinhaAA;
  });
  const pedidos = Array.from(new Set(linhas.map((l) => l.pedido).filter((p): p is number => p !== null)));
  if (!pedidos.length) return linhas;

  // conta do item de maior valor de cada pedido (números inteiros vindos do regex: seguro montar o IN)
  const { recordset: cls } = await pool.request().query(`
    SELECT c.numero_ordem AS pedido,
      (SELECT TOP 1 i.ctbParametroItemID FROM dbo.linhas_oc l LEFT JOIN dbo.Itenstab i ON i.item = l.item
        WHERE l.numero_ordem = c.numero_ordem GROUP BY i.ctbParametroItemID
        ORDER BY SUM(ISNULL(l.Total, 0)) DESC, COUNT(*) DESC) AS param
    FROM dbo.Compras c WHERE c.numero_ordem IN (${pedidos.join(',')})`);
  const porPedido = new Map((cls as { pedido: number; param: string | null }[]).map((c) => [Number(c.pedido), c.param]));
  for (const l of linhas) {
    if (l.pedido !== null && porPedido.has(l.pedido)) {
      l.pedidoExiste = l.pedido;
      l.param = porPedido.get(l.pedido) ?? null;
    }
  }
  return linhas;
}

/** Soma do ano por conta contábil e mês (já com ADS e AA separados). */
export async function buscarContasAno(ano: number): Promise<ContaMes[]> {
  const { de, ate } = periodo(ano);
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('de', de)
    .input('ate', ate)
    .query(`
      SELECT ${CONTA_SQL} AS conta, MAX(ContaContabil) AS nome, MAX(ContaContabilPai) AS grupo,
        MONTH(DTPagto) AS mes, SUM(ValorPagoCTB) AS valor, COUNT(*) AS qtd
      FROM dbo.vFinMovimentosCtbPagtos
      WHERE ${FILTRO} AND ContaContabil IS NOT NULL
      GROUP BY ${CONTA_SQL}, MONTH(DTPagto)`);

  const contas: ContaMes[] = (recordset as Record<string, unknown>[]).map((r) => {
    const conta = String(r.conta ?? '').trim();
    return {
      conta,
      nome: NOME_PSEUDO[conta] ?? String(r.nome ?? conta).trim(),
      grupo: conta === CONTA_ADS ? 'ADMINISTRATIVO' : String(r.grupo ?? '').trim(),
      mes: Number(r.mes),
      valor: Number(r.valor) || 0,
      qtd: Number(r.qtd) || 0,
    };
  });

  // AA: uma linha por conta/mês
  const nomes = new Map(contas.map((c) => [c.conta, c.nome]));
  const soma = new Map<string, ContaMes>();
  for (const l of await buscarAA(ano)) {
    const conta = contaAA(l);
    const k = `${conta}|${l.mes}`;
    const s =
      soma.get(k) ??
      ({ conta, nome: NOME_PSEUDO[conta] ?? `AA - ${nomes.get(conta) ?? conta}`, grupo: 'SEM CONTA (AA)', mes: l.mes, valor: 0, qtd: 0 } as ContaMes);
    s.valor += l.valor;
    s.qtd++;
    soma.set(k, s);
  }
  // AA com conta de despesa conhecida entra junto com a própria conta (mesma rubrica)
  const final: ContaMes[] = [];
  const porChave = new Map<string, ContaMes>();
  for (const c of [...contas, ...Array.from(soma.values())]) {
    const k = `${c.conta}|${c.mes}`;
    const ja = porChave.get(k);
    if (ja) {
      ja.valor += c.valor;
      ja.qtd += c.qtd;
    } else {
      const novo = { ...c };
      porChave.set(k, novo);
      final.push(novo);
    }
  }
  return final;
}

/** Pagamentos de uma conta num mês (para conferir na tela). */
export async function buscarPagamentosConta(ano: number, mes: number, conta: string): Promise<Pagamento[]> {
  const { de, ate } = periodo(ano, mes);
  // AA também cai em contas de despesa (item do pedido com conta conhecida, formato 4.1.1.03.010)
  const ehAA = conta.startsWith('AA-') || /^\d\.\d\.\d\.\d{2}\.\d{3}$/.test(conta);
  const lista: Pagamento[] = [];

  if (!conta.startsWith('AA-')) {
    const pool = await getPool();
    const { recordset } = await pool
      .request()
      .input('de', de)
      .input('ate', ate)
      .input('conta', conta)
      .query(`
        SELECT FinMovID, CONVERT(char(10), DTPagto, 23) AS data, ISNULL(ClienteDesc, ContaNome) AS favorecido,
          ISNULL(HistoricoCPCR, Historico) AS historico, EmpresaNome, ValorPagoCTB AS valor
        FROM dbo.vFinMovimentosCtbPagtos
        WHERE ${FILTRO} AND ContaContabil IS NOT NULL AND ${CONTA_SQL} = @conta
        ORDER BY ValorPagoCTB DESC`);
    for (const r of recordset as Record<string, unknown>[]) {
      lista.push({
        finMovId: Number(r.FinMovID),
        conta,
        mes,
        data: String(r.data),
        favorecido: String(r.favorecido ?? '').trim(),
        historico: String(r.historico ?? '').trim(),
        empresa: String(r.EmpresaNome ?? '').trim(),
        valor: Number(r.valor) || 0,
        pedido: null,
      });
    }
  }
  if (ehAA) {
    for (const l of await buscarAA(ano, mes)) {
      if (contaAA(l) !== conta) continue;
      lista.push({
        finMovId: l.FinMovID,
        conta,
        mes,
        data: l.data,
        favorecido: String(l.favorecido ?? '').trim(),
        historico: String(l.historico ?? '').trim(),
        empresa: String(l.EmpresaNome ?? '').trim(),
        valor: l.valor,
        pedido: l.pedido,
      });
    }
  }
  return lista.sort((a, b) => b.valor - a.valor);
}


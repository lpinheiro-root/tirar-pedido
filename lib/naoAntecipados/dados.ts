import sql from 'mssql';
import { getPool } from '@/lib/sqlserver';
import type { TituloNaoAntecipado } from './comum';

/**
 * Títulos a receber em aberto dos clientes marcados no ORGM com "Bloqueia antecipação CR"
 * (Contas.BloqueiaAntecipacaoCR = 1), só leitura. É a consulta "TÍTULOS COBRANÇA" do dashboard
 * do ORGM (ConsultaID 8182) com o filtro desses clientes e da emissão no período.
 * `de`/`ate` vazios = sem limite de emissão (todos em aberto).
 */
export async function buscarNaoAntecipados(de: string, ate: string): Promise<TituloNaoAntecipado[]> {
  const pool = await getPool().catch(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return getPool();
  });
  const req = pool.request();
  let periodo = '';
  if (de) {
    req.input('de', sql.Date, de);
    periodo += ' AND x.Emissao >= @de';
  }
  if (ate) {
    req.input('ate', sql.Date, ate);
    periodo += ' AND x.Emissao < DATEADD(day, 1, @ate)';
  }
  const { recordset } = await req.query(`
    SELECT x.finMovID, x.NomeEmpresa, x.CNPJ, RTRIM(x.ClienteCod) AS ClienteCod, CONCAT(x.ClienteCod, ' - ', x.ClienteDesc) AS CLIENTE,
      x.ContaPrevPgtoDesc AS ContaNome, x.Historico, x.ValorOriginal, x.ValorPagoCtb, x.Saldo, x.Documento,
      CONVERT(char(10), x.Emissao, 23) AS Emissao, CONVERT(char(10), x.Vencimento, 23) AS Vencimento,
      CAST(ISNULL(x.Venda, 0) AS int) AS Venda, x.VendedorContFant AS Vendedor
    FROM dbo.vFinMovimentosCTB x
    JOIN dbo.Contas c ON RTRIM(c.ContaID) = RTRIM(x.ClienteCod)
    WHERE x.Tipo = 'CR' AND x.Saldo > 0 AND ISNULL(x.EncerradoView, 0) = 0
      AND c.BloqueiaAntecipacaoCR = 1${periodo}
    ORDER BY x.finMovID`);

  const vistos = new Set<number>();
  const lista: TituloNaoAntecipado[] = [];
  for (const r of recordset as Record<string, unknown>[]) {
    const id = Number(r.finMovID);
    if (vistos.has(id)) continue; // título rateado pode aparecer mais de uma vez na view
    vistos.add(id);
    lista.push({
      finMovId: id,
      empresa: String(r.NomeEmpresa ?? '').trim(),
      cnpj: String(r.CNPJ ?? '').trim(),
      clienteCod: String(r.ClienteCod ?? ''),
      cliente: String(r.CLIENTE ?? ''),
      contaNome: r.ContaNome == null ? '' : String(r.ContaNome).trim(),
      historico: String(r.Historico ?? ''),
      valorOriginal: Number(r.ValorOriginal) || 0,
      valorPago: Number(r.ValorPagoCtb) || 0,
      saldo: Number(r.Saldo) || 0,
      documento: String(r.Documento ?? '').trim(),
      emissao: r.Emissao ? String(r.Emissao) : null,
      vencimento: r.Vencimento ? String(r.Vencimento) : null,
      venda: Number(r.Venda) || 0,
      vendedor: String(r.Vendedor ?? ''),
    });
  }
  return lista;
}

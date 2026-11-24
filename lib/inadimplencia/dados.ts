import { getPool } from '@/lib/sqlserver';
import { classificarCarteira, type TituloVencido } from './comum';

/**
 * Títulos a receber vencidos e não pagos, lidos do ORGM (WORK_NATUHAIR), só leitura.
 * vFinMovimentosCTB traz um título por linha no contas a receber, com o saldo, o cliente e se o
 * cliente é empresa do grupo (EmpresaDoGrupo). A carteira (ContaPrevPgto) vem de FinMovimentos.
 * Vendas entre empresas do grupo (Biosense → Roma/Veneza...) ficam de fora, a não ser que
 * `incluirGrupo` seja true.
 */
export async function buscarVencidos(incluirGrupo: boolean): Promise<TituloVencido[]> {
  const pool = await getPool().catch(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return getPool();
  });
  const { recordset } = await pool.request().query(`
    SELECT x.FinMovID, RTRIM(x.EmpresaID) AS EmpresaID, RTRIM(x.NomeEmpresa) AS NomeEmpresa,
      RTRIM(x.ClienteCod) AS ClienteCod, RTRIM(x.ClienteDesc) AS ClienteDesc, RTRIM(x.CNPJ) AS CNPJ,
      RTRIM(x.Documento) AS Documento, CONVERT(char(10), x.Emissao, 23) AS Emissao,
      CONVERT(char(10), x.Vencimento, 23) AS Vencimento, DATEDIFF(day, x.Vencimento, CAST(GETDATE() AS date)) AS Dias,
      ISNULL(x.ValorOriginal, 0) AS Valor, ISNULL(x.ValorPago, 0) AS Pago, x.Saldo,
      RTRIM(f.ContaPrevPgto) AS CarteiraCod, RTRIM(c.ContRazSoc) AS Carteira,
      RTRIM(ISNULL(x.VendedorContFant, '')) AS Vendedor, CAST(ISNULL(x.EmpresaDoGrupo, 0) AS int) AS Grupo
    FROM dbo.vFinMovimentosCTB x
    JOIN dbo.FinMovimentos f ON f.FinMovID = x.FinMovID
    LEFT JOIN dbo.Contas c ON RTRIM(c.ContaID) = RTRIM(f.ContaPrevPgto)
    WHERE x.Tipo = 'CR' AND x.Vencimento < CAST(GETDATE() AS date) AND x.Saldo > 0.01
      AND ISNULL(f.Cancelado, 0) = 0 AND ISNULL(f.Encerrado, 0) = 0
      ${incluirGrupo ? '' : 'AND ISNULL(x.EmpresaDoGrupo, 0) = 0'}`);

  const vistos = new Set<number>();
  const lista: TituloVencido[] = [];
  for (const r of recordset as Record<string, unknown>[]) {
    const id = Number(r.FinMovID);
    if (vistos.has(id)) continue; // título rateado aparece mais de uma vez na view
    vistos.add(id);
    const carteira = String(r.Carteira ?? '');
    const { tipo, fidc } = classificarCarteira(carteira);
    lista.push({
      finMovId: id,
      empresaId: String(r.EmpresaID ?? ''),
      empresa: String(r.NomeEmpresa ?? r.EmpresaID ?? ''),
      clienteCod: String(r.ClienteCod ?? ''),
      cliente: String(r.ClienteDesc ?? '').replace(/\s+/g, ' '),
      cnpj: String(r.CNPJ ?? ''),
      documento: String(r.Documento ?? ''),
      emissao: r.Emissao ? String(r.Emissao) : null,
      vencimento: String(r.Vencimento),
      dias: Number(r.Dias) || 0,
      valor: Number(r.Valor) || 0,
      pago: Number(r.Pago) || 0,
      saldo: Number(r.Saldo) || 0,
      carteiraCod: String(r.CarteiraCod ?? ''),
      carteira: carteira || 'CARTEIRA',
      tipoCarteira: tipo,
      fidc,
      vendedor: String(r.Vendedor ?? '').replace(/\s+/g, ' ').trim(),
      grupo: Number(r.Grupo) === 1,
    });
  }
  return lista.sort((a, b) => b.dias - a.dias || b.saldo - a.saldo);
}

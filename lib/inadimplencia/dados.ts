import { getPool } from '@/lib/sqlserver';
import { classificarCarteira, descricaoBancaria, regiaoDaUf, ufDoNome, type TituloVencido } from './comum';

/**
 * Títulos a receber vencidos e não pagos, lidos do ORGM (WORK_NATUHAIR), só leitura.
 * - vFinMovimentosCTB: um título por linha no contas a receber, com saldo, cliente e se o cliente é
 *   empresa do grupo (EmpresaDoGrupo).
 * - FinMovimentos: carteira (ContaPrevPgto), vendedor do título e histórico ("RECOMPRADO EM ...").
 * - Vendedor: o do título; se estiver vazio, o representante do cadastro do cliente.
 * - Cidade/UF do cliente: endereço principal (Enderecos + Municipios).
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
      RTRIM(x.ClienteCod) AS ClienteCod, RTRIM(x.ClienteDesc) AS ClienteDesc, RTRIM(cli.ContFant) AS ClienteFant, RTRIM(x.CNPJ) AS CNPJ,
      RTRIM(x.Documento) AS Documento, CONVERT(char(10), x.Emissao, 23) AS Emissao,
      CONVERT(char(10), x.Vencimento, 23) AS Vencimento, DATEDIFF(day, x.Vencimento, CAST(GETDATE() AS date)) AS Dias,
      ISNULL(x.ValorOriginal, 0) AS Valor, ISNULL(x.ValorPago, 0) AS Pago, x.Saldo,
      RTRIM(f.ContaPrevPgto) AS CarteiraCod, RTRIM(c.ContRazSoc) AS Carteira,
      CASE WHEN f.Historico LIKE '%RECOMPR%' THEN 1 ELSE 0 END AS Recompra,
      RTRIM(v.ContaID) AS VendedorCod, RTRIM(COALESCE(NULLIF(v.ContFant, ''), v.ContRazSoc)) AS Vendedor, RTRIM(v.ContRazSoc) AS VendedorRazao,
      RTRIM(m.Nome) AS Cidade, RTRIM(e.Estado) AS UF, RTRIM(e.Bairro) AS Bairro,
      CAST(ISNULL(x.EmpresaDoGrupo, 0) AS int) AS Grupo
    FROM dbo.vFinMovimentosCTB x
    JOIN dbo.FinMovimentos f ON f.FinMovID = x.FinMovID
    LEFT JOIN dbo.Contas c ON RTRIM(c.ContaID) = RTRIM(f.ContaPrevPgto)
    LEFT JOIN dbo.Contas cli ON RTRIM(cli.ContaID) = RTRIM(f.ContaID)
    LEFT JOIN dbo.Contas v ON RTRIM(v.ContaID) = COALESCE(NULLIF(RTRIM(f.Vendedor), ''), NULLIF(NULLIF(RTRIM(cli.Representante), ''), 'V0'))
    OUTER APPLY (SELECT TOP 1 Estado, Bairro, MunicipioID FROM dbo.Enderecos WHERE ContaID = f.ContaID ORDER BY Correspondencia DESC) e
    LEFT JOIN dbo.Municipios m ON m.MunicipioID = e.MunicipioID
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
    const recompra = Number(r.Recompra) === 1;
    const vendedor = String(r.Vendedor ?? '').replace(/\s+/g, ' ').trim();
    const uf = String(r.UF ?? '').trim().toUpperCase();
    // UF do vendedor: a que vem no nome ("MARIA DO ROCIO ( MS )"); se não tiver, a do cliente
    const ufVendedor = ufDoNome(vendedor) ?? ufDoNome(String(r.VendedorRazao ?? '')) ?? (uf || null);
    const cidade = String(r.Cidade ?? '').trim();
    lista.push({
      finMovId: id,
      empresaId: String(r.EmpresaID ?? ''),
      empresa: String(r.NomeEmpresa ?? r.EmpresaID ?? ''),
      clienteCod: String(r.ClienteCod ?? ''),
      cliente: String(r.ClienteDesc ?? '').replace(/\s+/g, ' '),
      clienteFantasia: String(r.ClienteFant || r.ClienteDesc || '').replace(/\s+/g, ' ').trim(),
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
      recompra,
      descricao: descricaoBancaria(tipo, fidc, recompra),
      vendedorCod: String(r.VendedorCod ?? ''),
      vendedor: vendedor || 'SEM VENDEDOR',
      ufVendedor,
      regiao: regiaoDaUf(ufVendedor),
      cidade: cidade ? `${cidade}${uf ? `/${uf}` : ''}` : uf,
      bairro: String(r.Bairro ?? '').trim(),
      grupo: Number(r.Grupo) === 1,
    });
  }
  return lista.sort((a, b) => b.dias - a.dias || b.saldo - a.saldo);
}

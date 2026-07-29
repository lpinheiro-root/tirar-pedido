import sql, { type ConnectionPool } from 'mssql';
import type { Cliente, GrupoProduto, Produto } from '@/types';

const config: sql.config = {
  server: process.env.SQLSERVER_HOST!,
  port: Number(process.env.SQLSERVER_PORT ?? 1433),
  user: process.env.SQLSERVER_USER!,
  password: process.env.SQLSERVER_PASSWORD!,
  database: process.env.SQLSERVER_DATABASE!,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERT === 'true',
  },
};

/** Só produtos acabados (cosméticos de venda) devem aparecer no catálogo do representante. */
const CATEGORIA_PRODUTO_ACABADO = "i.Categoria = 'PA - Produto Acabado'";

let poolPromise: Promise<ConnectionPool> | null = null;

function getPool(): Promise<ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/**
 * O ERP (base WORK_NATUHAIR) guarda clientes, representantes e fornecedores
 * numa única tabela `Contas` (ContCliente/ContRepr/ContForn distinguem o
 * papel). Endereço — e portanto o Estado usado para o filtro por UF — vive
 * em `Enderecos`, não em `Contas.ContEst` (que está sempre vazio na base
 * real). A tabela de preço aplicada a cada cliente é `Contas.Tabela`, que
 * referencia `TabelaPrecoSub.Tabela`.
 */

const CLIENTE_SELECT = `
  SELECT
    c.ContaID AS id,
    c.ContRazSoc AS nome,
    m.Nome AS cidade,
    e.Estado AS estado,
    c.Representante AS codigoRepresentante,
    c.Tabela AS tabelaPreco,
    COALESCE(c.ContTel1, e.Telefone) AS telefone,
    c.ContInternetEMail AS email
  FROM dbo.Contas c
  OUTER APPLY (
    SELECT TOP 1 *
    FROM dbo.Enderecos
    WHERE ContaID = c.ContaID
    ORDER BY Correspondencia DESC
  ) e
  LEFT JOIN dbo.Municipios m ON m.MunicipioID = e.MunicipioID
`;

function mapCliente(r: Record<string, unknown>): Cliente {
  return {
    id: String(r.id),
    nome: String(r.nome ?? '').trim(),
    cidade: r.cidade ? String(r.cidade) : '',
    estado: r.estado ? String(r.estado) : '',
    codigoRepresentante: String(r.codigoRepresentante ?? ''),
    tabelaPreco: r.tabelaPreco != null ? String(r.tabelaPreco) : null,
    telefone: r.telefone ? String(r.telefone) : null,
    email: r.email ? String(r.email) : null,
  };
}

export async function getClientesPorEstado(
  estado: string,
  codigoRepresentante?: string
): Promise<Cliente[]> {
  const pool = await getPool();
  const request = pool.request();
  request.input('estado', sql.NVarChar, estado);

  let where =
    "c.ContCliente = 1 AND c.ContInativo = 0 AND e.Estado = @estado AND c.Tabela IS NOT NULL AND c.Tabela <> ''";
  if (codigoRepresentante) {
    request.input('codigoRepresentante', sql.NVarChar, codigoRepresentante);
    where += ' AND c.Representante = @codigoRepresentante';
  }

  const result = await request.query(`
    ${CLIENTE_SELECT}
    WHERE ${where}
    ORDER BY c.ContRazSoc ASC
  `);

  return result.recordset.map(mapCliente);
}

export async function getClientePorId(clienteId: string): Promise<Cliente | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('clienteId', sql.NVarChar, clienteId)
    .query(`
      ${CLIENTE_SELECT}
      WHERE c.ContaID = @clienteId AND c.ContCliente = 1
    `);

  if (result.recordset.length === 0) return null;
  return mapCliente(result.recordset[0]);
}

/**
 * Grupos de produtos (`Grupos`) que tenham ao menos um item cadastrado em
 * `Itenstab` com preço definido em `TabelaPrecoSub` para a tabela de preço
 * informada — isso naturalmente exclui matéria-prima/embalagem (que também
 * vivem em `Itenstab`/`Grupos` mas nunca têm preço de venda ao cliente).
 * Sem `tabelaPreco`, cai para "tem preço em qualquer tabela" (uso administrativo).
 */
export async function getGruposDeProdutos(tabelaPreco?: string | null): Promise<GrupoProduto[]> {
  const pool = await getPool();
  const request = pool.request();

  let tabelaFiltro = '';
  if (tabelaPreco) {
    request.input('tabelaPreco', sql.NVarChar, tabelaPreco);
    tabelaFiltro = 'AND tp.Tabela = @tabelaPreco';
  }

  const result = await request.query(`
    SELECT
      g.grupo AS id,
      g.descricao AS nome,
      COUNT(DISTINCT i.item) AS totalProdutos
    FROM dbo.Grupos g
    INNER JOIN dbo.Itenstab i ON i.grupo1 = g.grupo AND i.Inativo = 0 AND ${CATEGORIA_PRODUTO_ACABADO}
    INNER JOIN dbo.TabelaPrecoSub tp ON tp.Item = i.item ${tabelaFiltro}
    GROUP BY g.grupo, g.descricao
    ORDER BY g.descricao ASC
  `);

  return result.recordset.map((r) => ({
    id: String(r.id),
    nome: String(r.nome ?? '').trim(),
    imagemUrl: null,
    totalProdutos: Number(r.totalProdutos ?? 0),
  }));
}

export async function getProdutosPorGrupo(
  grupoId: string,
  tabelaPreco?: string | null
): Promise<Produto[]> {
  const pool = await getPool();
  const request = pool.request();
  request.input('grupoId', sql.NVarChar, grupoId);

  let tabelaFiltro = '';
  if (tabelaPreco) {
    request.input('tabelaPreco', sql.NVarChar, tabelaPreco);
    tabelaFiltro = 'AND Tabela = @tabelaPreco';
  }

  const result = await request.query(`
    SELECT
      i.item AS id,
      i.item AS codigo,
      i.descricao AS nome,
      i.grupo1 AS grupoId,
      g.descricao AS grupoNome,
      tp.Valor AS preco,
      i.FotoPrincipal AS imagemUrl,
      COALESCE(est.disponivel, 0) AS estoque,
      CASE WHEN i.promoção = 1 THEN 'PROMOÇÃO' ELSE NULL END AS destaque
    FROM dbo.Itenstab i
    OUTER APPLY (
      SELECT TOP 1 Valor FROM dbo.TabelaPrecoSub
      WHERE Item = i.item ${tabelaFiltro}
      ORDER BY Tabela
    ) tp
    LEFT JOIN dbo.Grupos g ON g.grupo = i.grupo1
    OUTER APPLY (
      SELECT SUM(Estoque) - SUM(Reservado) AS disponivel
      FROM dbo.estEstoquePorLocal
      WHERE Item = i.item
    ) est
    WHERE i.grupo1 = @grupoId AND i.Inativo = 0 AND ${CATEGORIA_PRODUTO_ACABADO} AND tp.Valor IS NOT NULL
    ORDER BY i.descricao ASC
  `);

  return result.recordset.map(mapProduto);
}

function mapProduto(r: Record<string, unknown>): Produto {
  return {
    id: String(r.id),
    codigo: String(r.codigo),
    nome: String(r.nome ?? '').trim(),
    grupoId: String(r.grupoId),
    grupoNome: r.grupoNome ? String(r.grupoNome).trim() : undefined,
    preco: Number(r.preco ?? 0),
    imagemUrl: r.imagemUrl ? String(r.imagemUrl) : null,
    estoque: Number(r.estoque ?? 0),
    ativo: true,
    destaque: r.destaque ? String(r.destaque) : null,
  };
}

export async function getTodosProdutos(tabelaPreco?: string | null): Promise<Produto[]> {
  const pool = await getPool();
  const request = pool.request();

  let tabelaFiltro = '';
  if (tabelaPreco) {
    request.input('tabelaPreco', sql.NVarChar, tabelaPreco);
    tabelaFiltro = 'AND Tabela = @tabelaPreco';
  }

  const result = await request.query(`
    SELECT
      i.item AS id,
      i.item AS codigo,
      i.descricao AS nome,
      i.grupo1 AS grupoId,
      g.descricao AS grupoNome,
      tp.Valor AS preco,
      i.FotoPrincipal AS imagemUrl,
      COALESCE(est.disponivel, 0) AS estoque,
      CASE WHEN i.promoção = 1 THEN 'PROMOÇÃO' ELSE NULL END AS destaque
    FROM dbo.Itenstab i
    OUTER APPLY (
      SELECT TOP 1 Valor FROM dbo.TabelaPrecoSub
      WHERE Item = i.item ${tabelaFiltro}
      ORDER BY Tabela
    ) tp
    LEFT JOIN dbo.Grupos g ON g.grupo = i.grupo1
    OUTER APPLY (
      SELECT SUM(Estoque) - SUM(Reservado) AS disponivel
      FROM dbo.estEstoquePorLocal
      WHERE Item = i.item
    ) est
    WHERE i.Inativo = 0 AND ${CATEGORIA_PRODUTO_ACABADO} AND tp.Valor IS NOT NULL
    ORDER BY g.descricao ASC, i.descricao ASC
  `);

  return result.recordset.map(mapProduto);
}

export async function getProdutosPorIds(
  produtoIds: string[],
  tabelaPreco?: string | null
): Promise<Produto[]> {
  if (produtoIds.length === 0) return [];
  const pool = await getPool();
  const request = pool.request();
  const placeholders = produtoIds.map((id, i) => {
    request.input(`id${i}`, sql.NVarChar, id);
    return `@id${i}`;
  });

  let tabelaFiltro = '';
  if (tabelaPreco) {
    request.input('tabelaPreco', sql.NVarChar, tabelaPreco);
    tabelaFiltro = 'AND Tabela = @tabelaPreco';
  }

  const result = await request.query(`
    SELECT
      i.item AS id,
      i.item AS codigo,
      i.descricao AS nome,
      i.grupo1 AS grupoId,
      g.descricao AS grupoNome,
      tp.Valor AS preco,
      i.FotoPrincipal AS imagemUrl,
      0 AS estoque,
      NULL AS destaque
    FROM dbo.Itenstab i
    OUTER APPLY (
      SELECT TOP 1 Valor FROM dbo.TabelaPrecoSub
      WHERE Item = i.item ${tabelaFiltro}
      ORDER BY Tabela
    ) tp
    LEFT JOIN dbo.Grupos g ON g.grupo = i.grupo1
    WHERE i.item IN (${placeholders.join(', ')}) AND ${CATEGORIA_PRODUTO_ACABADO} AND tp.Valor IS NOT NULL
  `);

  return result.recordset.map(mapProduto);
}

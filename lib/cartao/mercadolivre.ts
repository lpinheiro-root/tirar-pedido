import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Integração com a API oficial do Mercado Livre (OAuth 2.0).
 * A conta da empresa autoriza o app uma vez; guardamos access/refresh token
 * (tabela cartao_integracoes, acessível só pelo service role) e lemos as
 * compras via /orders/search?buyer=. Nenhuma senha é armazenada.
 *
 * Variáveis de ambiente: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI
 * (a mesma URL cadastrada no app em developers.mercadolivre.com.br).
 */

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolivre.com.br/authorization';

export interface IntegracaoML {
  id: string;
  usuario_externo_id: string;
  apelido: string;
  access_token: string;
  refresh_token: string;
  expira_em: string;
  ultima_sincronizacao: string | null;
}

export interface CompraML {
  origem: 'mercadolivre';
  conta: string;
  pedido_externo: string;
  data: string;
  loja: string;
  descricao: string;
  valor_total: number;
  parcelas: number;
  valor_parcela: number | null;
  /** pedidos e packs do pagamento — o vendedor costuma citar um deles na nota fiscal */
  pedidos: string[];
  fonte: 'api';
}

interface TokenResponse {
  access_token: string;
  /** só vem quando o app tem o escopo offline_access habilitado */
  refresh_token?: string;
  expires_in: number;
  user_id: number;
}

interface PagamentoML {
  id: number;
  status: string;
  payment_type?: string;
  date_approved?: string | null;
  date_created?: string;
  transaction_amount?: number;
  total_paid_amount?: number;
  installments?: number;
  installment_amount?: number | null;
}

interface PedidoML {
  id: number;
  pack_id?: number | null;
  date_created: string;
  order_items?: { item?: { title?: string } }[];
  payments?: PagamentoML[];
}

function config() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Integração Mercado Livre não configurada (ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI).');
  }
  return { clientId, clientSecret, redirectUri };
}

export function mercadoLivreConfigurado(): boolean {
  return Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET && process.env.ML_REDIRECT_URI);
}

export function urlAutorizacao(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH}?${params}`;
}

async function pedirToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Mercado Livre recusou o token (${res.status}): ${await res.text()}`);
  return res.json();
}

async function apiGet<T>(caminho: string, token: string): Promise<T> {
  const res = await fetch(`${API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Mercado Livre ${caminho} (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Troca o `code` do callback OAuth por tokens e grava/atualiza a conta do usuário. */
export async function conectarConta(code: string, usuarioId: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = config();
  const token = await pedirToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const usuario = await apiGet<{ nickname: string }>('/users/me', token.access_token);

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('cartao_integracoes').upsert(
    {
      usuario_id: usuarioId,
      provedor: 'mercadolivre',
      usuario_externo_id: String(token.user_id),
      apelido: usuario.nickname,
      access_token: token.access_token,
      // sem offline_access o ML não manda refresh token: gravamos vazio e o
      // usuário reconecta quando o access token (~6h) expirar
      refresh_token: token.refresh_token ?? '',
      expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    },
    { onConflict: 'usuario_id,provedor,usuario_externo_id' }
  );
  if (error) throw new Error(error.message);
  return usuario.nickname;
}

/** Access token válido, renovando se faltar menos de 5 min (o refresh token é de uso único). */
async function tokenValido(integracao: IntegracaoML): Promise<string> {
  if (Date.parse(integracao.expira_em) - Date.now() > 5 * 60_000) return integracao.access_token;
  if (!integracao.refresh_token) {
    throw new Error('a conexão expirou — clique em "Reconectar" para autorizar de novo');
  }

  const { clientId, clientSecret } = config();
  const token = await pedirToken({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: integracao.refresh_token,
  });
  const supabase = createServiceRoleClient();
  await supabase
    .from('cartao_integracoes')
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? '',
      expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    })
    .eq('id', integracao.id);
  return token.access_token;
}

/**
 * Busca as compras da conta desde `desde` (yyyy-mm-dd). Retorna um registro
 * por pagamento aprovado no cartão de crédito — é o que aparece na fatura.
 */
export async function buscarCompras(integracao: IntegracaoML, desde: string): Promise<CompraML[]> {
  const token = await tokenValido(integracao);
  const pagamentos = new Map<number, { pagamento: PagamentoML; titulos: string[]; pedidos: number[]; packs: number[] }>();

  const limite = 50;
  for (let offset = 0; offset < 5000; offset += limite) {
    const pagina = await apiGet<{ results: PedidoML[]; paging: { total: number } }>(
      `/orders/search?buyer=${integracao.usuario_externo_id}&sort=date_desc&limit=${limite}&offset=${offset}`,
      token
    );
    let passouDoPeriodo = false;
    for (const pedido of pagina.results) {
      if (pedido.date_created.slice(0, 10) < desde) {
        passouDoPeriodo = true;
        continue;
      }
      const titulos = (pedido.order_items ?? []).map((i) => i.item?.title).filter(Boolean) as string[];
      for (const pg of pedido.payments ?? []) {
        if (pg.status !== 'approved' || (pg.payment_type && pg.payment_type !== 'credit_card')) continue;
        const atual = pagamentos.get(pg.id) ?? { pagamento: pg, titulos: [], pedidos: [], packs: [] };
        atual.titulos.push(...titulos);
        atual.pedidos.push(pedido.id);
        if (pedido.pack_id) atual.packs.push(pedido.pack_id);
        pagamentos.set(pg.id, atual);
      }
    }
    if (passouDoPeriodo || offset + limite >= pagina.paging.total) break;
  }

  return Array.from(pagamentos.values()).map(({ pagamento: pg, titulos, pedidos, packs }) => ({
    origem: 'mercadolivre',
    conta: integracao.apelido,
    pedido_externo: `pagamento:${pg.id}`,
    data: (pg.date_approved ?? pg.date_created ?? '').slice(0, 10),
    loja: 'Mercado Livre',
    descricao: `${titulos.join(' | ')} (pedido ${pedidos.join(', ')})`.slice(0, 500),
    valor_total: pg.total_paid_amount ?? pg.transaction_amount ?? 0,
    parcelas: pg.installments && pg.installments > 0 ? pg.installments : 1,
    valor_parcela: pg.installment_amount ?? null,
    pedidos: Array.from(new Set([...pedidos, ...packs].map(String))),
    fonte: 'api',
  }));
}

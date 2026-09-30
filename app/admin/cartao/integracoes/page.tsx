import { headers } from 'next/headers';
import { requireRepresentante } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/format';
import { mercadoLivreConfigurado } from '@/lib/cartao/mercadolivre';
import { desconectarMercadoLivre } from '../actions';
import { SincronizarForm } from './SincronizarForm';

export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: { conectado?: string; erro?: string };
}) {
  await requireRepresentante('admin');
  const configurado = mercadoLivreConfigurado();
  const host = headers().get('x-forwarded-host') ?? headers().get('host');
  const urlCallback = `https://${host}/api/cartao/mercadolivre/callback`;

  // tokens ficam só no servidor: seleciona apenas os campos exibidos
  const { data } = await createServiceRoleClient()
    .from('cartao_integracoes')
    .select('id, apelido, ultima_sincronizacao, criado_em')
    .eq('provedor', 'mercadolivre')
    .order('criado_em');
  const contas = data ?? [];

  return (
    <div>
      <PageHeading
        title="Integrações"
        subtitle="Contas da empresa conectadas por autorização oficial (OAuth) — nenhuma senha é guardada."
      />

      {searchParams.conectado && (
        <p className="mb-4 rounded-md bg-green-100 px-4 py-3 text-body-sm text-green-800">
          Conta <strong>{searchParams.conectado}</strong> conectada. Sincronize para trazer as compras.
        </p>
      )}
      {searchParams.erro && (
        <p className="mb-4 rounded-md bg-error-container/40 px-4 py-3 text-body-sm text-error-on-container">
          {searchParams.erro}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mercado Livre</CardTitle>
          {configurado && (
            <a
              href="/api/cartao/mercadolivre/conectar"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-body-sm font-medium text-on-primary hover:bg-primary/90"
            >
              Conectar conta
            </a>
          )}
        </CardHeader>
        <CardContent>
          {!configurado ? (
            <div className="rounded-md bg-surface-container-low p-4 text-body-sm text-on-surface-variant">
              <p className="font-medium text-on-surface">Integração ainda não configurada.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Crie um aplicativo em <strong>developers.mercadolivre.com.br</strong> (Minhas aplicações).
                </li>
                <li>
                  Em &quot;URI de redirect&quot;, cadastre{' '}
                  <code className="select-all rounded bg-surface-container px-1">{urlCallback}</code>
                </li>
                <li>
                  Na Netlify (Variáveis ambientais), crie <code>ML_CLIENT_ID</code>, <code>ML_CLIENT_SECRET</code> e{' '}
                  <code>ML_REDIRECT_URI</code> (com o endereço acima) e faça um novo deploy.
                </li>
              </ol>
            </div>
          ) : (
            <>
              <table className="mb-4 w-full text-left">
                <thead>
                  <tr className="text-label uppercase text-on-surface-variant">
                    <th className="py-2 font-medium">Conta</th>
                    <th className="py-2 font-medium">Última sincronização</th>
                    <th className="py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contas.map((c) => (
                    <tr key={c.id} className="border-t border-border-muted">
                      <td className="py-3 text-body font-medium text-on-surface">{c.apelido}</td>
                      <td className="py-3 text-body-sm text-on-surface-variant">
                        {c.ultima_sincronizacao ? formatDateTime(c.ultima_sincronizacao) : 'Nunca'}
                      </td>
                      <td className="py-3 text-right">
                        <form action={desconectarMercadoLivre}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-label font-medium text-on-surface-variant hover:text-error">
                            Desconectar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {contas.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-body-sm text-on-surface-variant">
                        Nenhuma conta conectada. Clique em &quot;Conectar conta&quot; logado na conta da empresa no
                        Mercado Livre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {contas.length > 0 && <SincronizarForm />}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shopee, Magalu e outros sites</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-on-surface-variant">
            Esses sites não oferecem API para consultar as compras de quem compra. Exporte ou monte uma
            planilha com os pedidos e importe em <strong>Compras</strong> — a conciliação roda
            automaticamente em todas as faturas com pendências.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

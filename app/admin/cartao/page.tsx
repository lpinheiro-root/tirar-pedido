import Link from 'next/link';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { IconEye } from '@/components/ui/Icons';
import { formatCurrency, formatDate } from '@/lib/format';
import { BANCO_LABEL } from '@/lib/cartao/rotulos';
import { EnviarFaturaForm } from './EnviarFaturaForm';

interface FaturaLista {
  id: string;
  banco: string;
  arquivo_nome: string;
  vencimento: string | null;
  total: number | null;
  criado_por: string | null;
  cartao_lancamentos: { status: string; tipo: string }[];
}


/** Para o super admin: nome de quem é dono de cada registro. */
async function nomesDosDonos(supabase: ReturnType<typeof createClient>, ids: string[]) {
  const nomes = new Map<string, string>();
  if (!ids.length) return nomes;
  const { data } = await supabase.from('representantes').select('id, nome').in('id', Array.from(new Set(ids)));
  for (const u of data ?? []) nomes.set(u.id, u.nome);
  return nomes;
}

export default async function CartaoFaturasPage() {
  const { representante } = await requireRepresentante('admin');
  const supabase = createClient();
  const { data } = await supabase
    .from('cartao_faturas')
    .select('id, banco, arquivo_nome, vencimento, total, criado_por, cartao_lancamentos(status, tipo)')
    .order('vencimento', { ascending: false, nullsFirst: false })
    .limit(100);
  const faturas = (data ?? []) as FaturaLista[];
  const donos = representante.super_admin
    ? await nomesDosDonos(supabase, faturas.map((f) => f.criado_por).filter(Boolean) as string[])
    : null;

  return (
    <div>
      <PageHeading
        title="Conciliação de Cartão"
        subtitle="Envie o PDF da fatura: cada compra é conferida com os pedidos feitos nos sites."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Nova fatura</CardTitle>
        </CardHeader>
        <CardContent>
          <EnviarFaturaForm />
          <p className="mt-3 text-body-sm text-on-surface-variant">
            Itaú, Bradesco, Nubank, Inter, C6, Santander, Banco do Brasil e Caixa. Use o PDF original
            baixado do app ou site do banco (não escaneado).
          </p>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Banco</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Compras</th>
                <th className="px-4 py-3 font-medium">Conciliação</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {faturas.map((f) => {
                const compras = f.cartao_lancamentos.filter((l) => l.tipo === 'compra');
                const resolvidas = compras.filter((l) => l.status === 'conciliado' || l.status === 'ignorado').length;
                const divergentes = compras.filter((l) => l.status === 'divergente').length;
                const pendentes = compras.filter((l) => l.status === 'pendente').length;
                const pct = compras.length ? Math.round((resolvidas / compras.length) * 100) : 0;
                return (
                  <tr key={f.id} className="border-t border-border-muted hover:bg-surface-container-low/50">
                    <td className="px-4 py-3">
                      <p className="text-body font-medium text-on-surface">{BANCO_LABEL[f.banco] ?? f.banco}</p>
                      <p className="max-w-64 truncate text-body-sm text-on-surface-variant">{f.arquivo_nome}</p>
                      {donos && f.criado_por && (
                        <p className="text-label text-on-surface-variant">Enviada por {donos.get(f.criado_por) ?? '—'}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      {f.vencimento ? formatDate(`${f.vencimento}T12:00:00`) : '—'}
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-on-surface">
                      {f.total != null ? formatCurrency(Number(f.total)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">{compras.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-container">
                          <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-body-sm text-on-surface">{pct}%</span>
                      </div>
                      {(pendentes > 0 || divergentes > 0) && (
                        <p className="mt-1 text-label text-on-surface-variant">
                          {pendentes > 0 && `${pendentes} sem compra`}
                          {pendentes > 0 && divergentes > 0 && ' · '}
                          {divergentes > 0 && `${divergentes} divergente(s)`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/cartao/${f.id}`}
                        className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                      >
                        <IconEye width={16} height={16} /> Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {faturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhuma fatura enviada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

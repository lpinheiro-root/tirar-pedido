import { type NextRequest } from 'next/server';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { dataExcel, respostaExcel } from '@/lib/cartao/exportacao';

export const dynamic = 'force-dynamic';

const FONTE_LABEL: Record<string, string> = { api: 'API', importacao: 'Planilha', manual: 'Manual' };

/** Exporta as compras visíveis ao usuário (RLS: as próprias; super admin: todas). */
export async function GET(request: NextRequest) {
  const { representante } = await requireRepresentante('admin');
  const supabase = createClient();
  const origem = request.nextUrl.searchParams.get('origem');

  let query = supabase
    .from('cartao_compras')
    .select('*, cartao_lancamentos(id)')
    .order('data', { ascending: false })
    .limit(10000);
  if (origem && origem !== 'todas') query = query.eq('origem', origem);
  const { data } = await query;
  const compras = data ?? [];

  const donos = new Map<string, string>();
  if (representante.super_admin && compras.length) {
    const { data: usuarios } = await supabase
      .from('representantes')
      .select('id, nome')
      .in('id', Array.from(new Set(compras.map((c) => c.usuario_id as string))));
    for (const u of usuarios ?? []) donos.set(u.id, u.nome);
  }

  const linhas = compras.map((c) => {
    const parcelas = Number(c.parcelas);
    const encontradas = (c.cartao_lancamentos as unknown[]).length;
    return {
      ...(representante.super_admin ? { Usuário: donos.get(c.usuario_id) ?? '' } : {}),
      Data: dataExcel(c.data),
      Site: ORIGEM_LABEL[c.origem] ?? c.origem,
      Conta: c.conta ?? '',
      Loja: c.loja ?? '',
      Descrição: c.descricao ?? '',
      Pedido: String(c.pedido_externo ?? '').replace(/^pagamento:/, 'pgto '),
      'Valor total': Number(c.valor_total),
      Parcelas: parcelas,
      'Parcela (R$)': parcelas > 1 ? Number(c.valor_parcela ?? Number(c.valor_total) / parcelas) : Number(c.valor_total),
      'Na fatura':
        encontradas === 0 ? 'Não localizada' : parcelas > 1 ? `${encontradas}/${parcelas} parcelas` : 'Conciliada',
      Fonte: FONTE_LABEL[c.fonte] ?? c.fonte,
    };
  });

  const hoje = new Date().toISOString().slice(0, 10);
  return respostaExcel(linhas, 'Compras', `compras-${hoje}.xlsx`);
}

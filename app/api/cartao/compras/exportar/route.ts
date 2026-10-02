import { type NextRequest } from 'next/server';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';
import { dataExcel, respostaExcel } from '@/lib/cartao/exportacao';
import { mesAtual, rotuloMes, situacaoNoMes, textoSituacao } from '@/lib/cartao/parcelas';

export const dynamic = 'force-dynamic';

const FONTE_LABEL: Record<string, string> = { api: 'API', importacao: 'Planilha', manual: 'Manual' };

/** Exporta as compras visíveis ao usuário (RLS: as próprias; super admin: todas). */
export async function GET(request: NextRequest) {
  const { representante } = await requireRepresentante('admin');
  const supabase = createClient();
  const params = request.nextUrl.searchParams;
  const origem = params.get('origem');
  const mesParam = params.get('mes') ?? '';
  const mes = /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual();
  const soMes = params.get('so_mes') === '1';

  let query = supabase
    .from('cartao_compras')
    .select('*, cartao_lancamentos(id, parcela_atual, cartao_faturas(vencimento)), cartao_notas(chave, situacao)')
    .order('data', { ascending: false })
    .limit(10000);
  if (origem && origem !== 'todas') query = query.eq('origem', origem);
  const { data } = await query;

  const compras = (data ?? []).map((c) => {
    const lancs = (c.cartao_lancamentos ?? []) as {
      parcela_atual: number | null;
      cartao_faturas: { vencimento: string | null } | null;
    }[];
    return {
      ...c,
      encontradas: lancs.length,
      situacao: situacaoNoMes(
        c,
        mes,
        lancs.map((l) => ({ parcela_atual: l.parcela_atual, vencimento: l.cartao_faturas?.vencimento ?? null }))
      ),
    };
  });
  const lista = soMes ? compras.filter((c) => c.situacao.estado === 'no_mes') : compras;

  const donos = new Map<string, string>();
  if (representante.super_admin && lista.length) {
    const { data: usuarios } = await supabase
      .from('representantes')
      .select('id, nome')
      .in('id', Array.from(new Set(lista.map((c) => c.usuario_id as string))));
    for (const u of usuarios ?? []) donos.set(u.id, u.nome);
  }

  const ref = rotuloMes(mes);
  const linhas = lista.map((c) => {
    const parcelas = Number(c.parcelas);
    const s = c.situacao;
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
      [`Parcela em ${ref}`]: s.estado === 'no_mes' ? `${s.parcela}/${s.total}` : textoSituacao(s),
      'Faltam pagar': s.estado === 'quitada' ? 0 : s.faltam,
      [`Valor em ${ref}`]: s.valorMes || null,
      'Parcela confirmada': s.estado === 'no_mes' ? (s.confirmado ? 'Sim (fatura)' : 'Estimada') : '',
      'Na fatura':
        c.encontradas === 0 ? 'Não localizada' : parcelas > 1 ? `${c.encontradas}/${parcelas} parcelas` : 'Conciliada',
      'Nota fiscal': ((c.cartao_notas ?? []) as { chave: string; situacao: string }[]).some((n) => n.situacao === 'completa')
        ? 'Sim'
        : c.faturamento === 'cpf'
          ? 'Compra no CPF (sem nota)'
          : 'Pendente',
      'Chave da nota': ((c.cartao_notas ?? []) as { chave: string; situacao: string }[])
        .filter((n) => n.situacao === 'completa')
        .map((n) => n.chave)
        .join(', '),
      Fonte: FONTE_LABEL[c.fonte] ?? c.fonte,
    };
  });

  return respostaExcel(linhas, 'Compras', `compras-${mes}.xlsx`);
}

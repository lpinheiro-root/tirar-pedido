import { type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { dataExcel, respostaExcel } from '@/lib/cartao/exportacao';
import { EMPRESAS_GRUPO, formatarCnpj, nomeCurtoEmpresa } from '@/lib/empresas';
import { aplicarFiltros, lerFiltros } from '@/lib/nfeRecebidas';
import { ORIGEM_LABEL } from '@/lib/cartao/rotulos';

export const dynamic = 'force-dynamic';

/** Excel da lista de NF-e recebidas com os mesmos filtros da tela. */
export async function GET(request: NextRequest) {
  await requireSuperAdmin();
  const filtros = lerFiltros(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = createClient();
  const { data: destinatarios } = await supabase.from('nfe_destinatarios').select('cnpj, nome');
  const nomePadrao = new Map((destinatarios ?? []).map((d) => [d.cnpj as string, d.nome as string]));
  const { data } = await aplicarFiltros(
    supabase
      .from('cartao_notas')
      .select(
        'chave, nome_emitente, cnpj_emitente, cnpj_destinatario, nome_destinatario, data_emissao, valor_total, situacao, cartao_compras(descricao, origem, data)'
      ),
    filtros
  )
    .order('data_emissao', { ascending: false })
    .limit(20000);

  const linhas = (data ?? []).map((n) => {
    const c = n.cartao_compras as unknown as { descricao: string | null; origem: string; data: string } | null;
    return {
      Emissão: dataExcel(n.data_emissao),
      Número: Number(n.chave.slice(25, 34)),
      Série: Number(n.chave.slice(22, 25)),
      Emitente: n.nome_emitente ?? '',
      'CNPJ emitente': formatarCnpj(n.cnpj_emitente),
      Empresa: n.cnpj_destinatario
        ? nomeCurtoEmpresa(n.cnpj_destinatario, nomePadrao.get(n.cnpj_destinatario) ?? n.nome_destinatario)
        : '',
      'CNPJ empresa': formatarCnpj(n.cnpj_destinatario),
      Valor: n.valor_total != null ? Number(n.valor_total) : null,
      Situação: n.situacao === 'cancelada' ? 'Cancelada' : 'Autorizada',
      'Compra do cartão': c ? `${ORIGEM_LABEL[c.origem] ?? c.origem} · ${c.descricao ?? ''}` : '',
      'Chave de acesso': n.chave,
    };
  });

  const sufixo = [filtros.mes, filtros.empresa ? EMPRESAS_GRUPO[filtros.empresa] ?? filtros.empresa : ''].filter(Boolean).join('-');
  return respostaExcel(linhas, 'NF-e Recebidas', `nfe-recebidas${sufixo ? '-' + sufixo : ''}.xlsx`);
}

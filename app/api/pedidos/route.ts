import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gerarExcelPedido } from '@/lib/excel';
import { enviarEmailPedido } from '@/lib/email';
import { enviarWhatsappConfirmacao } from '@/lib/whatsapp';
import type { NovoPedidoPayload } from '@/types';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  const { data: representante } = await supabase
    .from('representantes')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!representante || !representante.ativo) {
    return NextResponse.json({ erro: 'Representante inválido ou inativo.' }, { status: 403 });
  }

  let payload: NovoPedidoPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { clienteIdSql, clienteNome, itens } = payload;

  if (!clienteIdSql || !clienteNome || !Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ erro: 'Pedido inválido: informe cliente e ao menos um item.' }, { status: 400 });
  }

  for (const item of itens) {
    if (!item.produtoId || !item.nome || item.quantidade <= 0 || item.preco < 0) {
      return NextResponse.json({ erro: 'Item de pedido inválido.' }, { status: 400 });
    }
  }

  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos')
    .insert({
      representante_id: representante.id,
      cliente_id_sql: clienteIdSql,
      cliente_nome: clienteNome,
      status: 'enviado',
    })
    .select()
    .single();

  if (erroPedido || !pedido) {
    return NextResponse.json({ erro: 'Falha ao registrar o pedido.' }, { status: 500 });
  }

  const itensParaInserir = itens.map((item) => ({
    pedido_id: pedido.id,
    produto_id_sql: item.produtoId,
    produto_nome: item.nome,
    produto_imagem_url: item.imagemUrl ?? null,
    quantidade: item.quantidade,
    preco_unitario: item.preco,
    subtotal: Number((item.preco * item.quantidade).toFixed(2)),
  }));

  const { error: erroItens } = await supabase.from('pedido_itens').insert(itensParaInserir);

  if (erroItens) {
    await supabase.from('pedidos').delete().eq('id', pedido.id);
    return NextResponse.json({ erro: 'Falha ao registrar os itens do pedido.' }, { status: 500 });
  }

  const total = itensParaInserir.reduce((acc, i) => acc + Number(i.subtotal), 0);
  const criadoEm = new Date(pedido.criado_em);

  const excelBuffer = await gerarExcelPedido({
    pedidoId: pedido.id,
    clienteNome,
    representanteNome: representante.nome,
    criadoEm,
    itens,
  });

  const excelFileName = `pedido-${pedido.id.slice(0, 8)}.xlsx`;
  const storagePath = `${representante.id}/${pedido.id}/${excelFileName}`;

  const { error: erroUpload } = await supabase.storage
    .from('pedidos-excel')
    .upload(storagePath, excelBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });

  let excelUrl: string | null = null;
  if (!erroUpload) {
    excelUrl = storagePath;
  }

  const enviadoEmail = await enviarEmailPedido({
    pedidoId: pedido.id,
    clienteNome,
    representanteNome: representante.nome,
    representanteEmail: representante.email,
    total,
    excelBuffer,
    excelFileName,
  });

  let enviadoWhatsapp = false;
  if (representante.telefone) {
    enviadoWhatsapp = await enviarWhatsappConfirmacao({
      telefone: representante.telefone,
      representanteNome: representante.nome,
      clienteNome,
      pedidoId: pedido.id,
      total,
    });
  }

  await supabase
    .from('pedidos')
    .update({
      excel_url: excelUrl,
      enviado_email: enviadoEmail,
      enviado_whatsapp: enviadoWhatsapp,
    })
    .eq('id', pedido.id);

  return NextResponse.json({
    pedidoId: pedido.id,
    enviadoEmail,
    enviadoWhatsapp,
  });
}

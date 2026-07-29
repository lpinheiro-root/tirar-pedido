import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('excel_url')
    .eq('id', params.id)
    .single();

  if (!pedido?.excel_url) {
    return NextResponse.json({ erro: 'Excel não encontrado para este pedido.' }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('pedidos-excel')
    .createSignedUrl(pedido.excel_url, 60);

  if (error || !data) {
    return NextResponse.json({ erro: 'Falha ao gerar o link de download.' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}

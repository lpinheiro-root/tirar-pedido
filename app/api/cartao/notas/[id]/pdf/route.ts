import { NextResponse } from 'next/server';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { gerarDanfePdf } from '@/lib/cartao/danfePdf';
import { xmlDaNota } from '@/lib/cartao/xmlNota';

export const dynamic = 'force-dynamic';

/** Download do DANFE em PDF (RLS: dono da compra vinculada ou super admin). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requireRepresentante('admin');
  const { data: nota } = await createClient()
    .from('cartao_notas')
    .select('chave, xml, xml_gz')
    .eq('id', params.id)
    .maybeSingle();
  const xml = xmlDaNota(nota);
  if (!nota || !xml) return NextResponse.json({ erro: 'Nota fiscal ainda não disponível' }, { status: 404 });

  const pdf = await gerarDanfePdf(xml, nota.chave);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="NFe${nota.chave}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

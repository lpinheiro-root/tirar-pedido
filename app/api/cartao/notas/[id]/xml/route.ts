import { NextResponse } from 'next/server';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Download do XML da NF-e (RLS: dono da compra vinculada ou super admin). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requireRepresentante('admin');
  const { data: nota } = await createClient()
    .from('cartao_notas')
    .select('chave, xml')
    .eq('id', params.id)
    .maybeSingle();
  if (!nota?.xml) return NextResponse.json({ erro: 'XML ainda não disponível' }, { status: 404 });

  return new Response(nota.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="NFe${nota.chave}.xml"`,
      'Cache-Control': 'no-store',
    },
  });
}

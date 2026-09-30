import { NextResponse, type NextRequest } from 'next/server';
import { requireRepresentante } from '@/lib/auth';
import { conectarConta } from '@/lib/cartao/mercadolivre';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await requireRepresentante('admin');
  const destino = new URL('/admin/cartao/integracoes', request.url);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state || state !== request.cookies.get('ml_oauth_state')?.value) {
    destino.searchParams.set('erro', 'Autorização inválida ou expirada. Tente conectar novamente.');
  } else {
    try {
      destino.searchParams.set('conectado', await conectarConta(code));
    } catch (e) {
      destino.searchParams.set('erro', (e as Error).message);
    }
  }

  const response = NextResponse.redirect(destino);
  response.cookies.delete('ml_oauth_state');
  return response;
}

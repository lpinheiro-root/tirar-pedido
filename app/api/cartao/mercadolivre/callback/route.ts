import { NextResponse, type NextRequest } from 'next/server';
import { requireCartao } from '@/lib/auth';
import { conectarConta } from '@/lib/cartao/mercadolivre';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { userId } = await requireCartao();
  // Na Netlify, request.url traz o endereço interno do deploy (<id>--site.netlify.app),
  // onde o navegador não tem a sessão: a volta usa o domínio oficial do ML_REDIRECT_URI.
  const destino = new URL('/admin/cartao/integracoes', process.env.ML_REDIRECT_URI ?? request.url);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state || state !== request.cookies.get('ml_oauth_state')?.value) {
    destino.searchParams.set('erro', 'Autorização inválida ou expirada. Tente conectar novamente.');
  } else {
    try {
      destino.searchParams.set('conectado', await conectarConta(code, userId));
    } catch (e) {
      destino.searchParams.set('erro', (e as Error).message);
    }
  }

  const response = NextResponse.redirect(destino);
  response.cookies.delete('ml_oauth_state');
  return response;
}

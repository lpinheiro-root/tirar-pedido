import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { requireCartao } from '@/lib/auth';
import { urlAutorizacao } from '@/lib/cartao/mercadolivre';

export const dynamic = 'force-dynamic';

/** Inicia o OAuth: redireciona o admin para autorizar a conta da empresa no Mercado Livre. */
export async function GET() {
  await requireCartao();
  const state = randomBytes(16).toString('hex');
  const response = NextResponse.redirect(urlAutorizacao(state));
  response.cookies.set('ml_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && (process.env.ML_REDIRECT_URI ?? '').startsWith('https'),
    maxAge: 600,
    path: '/',
  });
  return response;
}

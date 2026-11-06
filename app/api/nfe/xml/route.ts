import { requireNfe } from '@/lib/auth';
import { limparChave } from '@/lib/nfe/dados';
import { obterXml } from '@/lib/nfe/xml';

export const dynamic = 'force-dynamic';

/** Baixa o XML da nota (?chave=44 dígitos). */
export async function GET(request: Request) {
  await requireNfe();
  const chave = limparChave(new URL(request.url).searchParams.get('chave') ?? '');
  if (chave.length !== 44) return new Response('Chave inválida.', { status: 400 });
  const achado = await obterXml(chave);
  if (!achado) return new Response('XML não encontrado no ERP nem no NF-Stock.', { status: 404 });
  return new Response(achado.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${chave}.xml"`,
      'Cache-Control': 'no-store',
    },
  });
}

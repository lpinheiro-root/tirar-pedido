import { requireNfe } from '@/lib/auth';
import { gerarDanfePdf } from '@/lib/cartao/danfePdf';
import { limparChave } from '@/lib/nfe/dados';
import { obterXml } from '@/lib/nfe/xml';

export const dynamic = 'force-dynamic';

/** DANFE em PDF gerado a partir do XML da nota (?chave=44 dígitos). */
export async function GET(request: Request) {
  await requireNfe();
  const chave = limparChave(new URL(request.url).searchParams.get('chave') ?? '');
  if (chave.length !== 44) return new Response('Chave inválida.', { status: 400 });
  const achado = await obterXml(chave);
  if (!achado) return new Response('XML não encontrado no ERP nem no NF-Stock: sem ele não dá para montar o DANFE.', { status: 404 });
  const pdf = await gerarDanfePdf(achado.xml, chave);
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE-${chave}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

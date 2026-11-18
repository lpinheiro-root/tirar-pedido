import JSZip from 'jszip';
import { requireNfe } from '@/lib/auth';
import { gerarDanfePdf } from '@/lib/cartao/danfePdf';
import { limparChave } from '@/lib/nfe/dados';
import { obterXml } from '@/lib/nfe/xml';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAXIMO = 300;

/**
 * Baixa várias notas num ZIP: { chaves: string[], formato: 'ambos' | 'xml' | 'danfe' }.
 * Cada nota vira "NF <número> - <chave>.xml" e/ou ".pdf" (DANFE montado do XML).
 */
export async function POST(request: Request) {
  await requireNfe();
  const corpo = (await request.json().catch(() => null)) as { chaves?: unknown; formato?: unknown } | null;
  const chaves = Array.from(
    new Set((Array.isArray(corpo?.chaves) ? corpo.chaves : []).map((c) => limparChave(String(c))).filter((c) => c.length === 44))
  );
  const formato = corpo?.formato === 'xml' || corpo?.formato === 'danfe' ? corpo.formato : 'ambos';
  if (!chaves.length) return new Response('Marque ao menos uma nota.', { status: 400 });
  if (chaves.length > MAXIMO) return new Response(`Marque no máximo ${MAXIMO} notas por vez.`, { status: 400 });

  const zip = new JSZip();
  const faltando: string[] = [];
  for (const chave of chaves) {
    const achado = await obterXml(chave);
    if (!achado) {
      faltando.push(chave);
      continue;
    }
    const numero = achado.xml.match(/<nNF>(\d+)<\/nNF>/)?.[1] ?? chave.slice(25, 34).replace(/^0+/, '');
    const nome = `NF ${numero} - ${chave}`;
    if (formato !== 'danfe') zip.file(`${nome}.xml`, achado.xml);
    if (formato !== 'xml') {
      try {
        zip.file(`${nome}.pdf`, await gerarDanfePdf(achado.xml, chave));
      } catch (e) {
        console.error('[nfe/lote] danfe', chave, e);
        faltando.push(`${chave} (DANFE)`);
      }
    }
  }
  if (faltando.length) {
    zip.file('NAO ENCONTRADAS.txt', `XML não encontrado no ERP nem no NF-Stock:\r\n${faltando.join('\r\n')}\r\n`);
  }

  const dados = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Response(Buffer.from(dados), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="notas-${new Date().toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

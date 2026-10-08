import { cpus } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { deflateSync, inflateSync } from 'zlib';
import { PDFDocument, PDFName, PDFRawStream, type PDFDict } from 'pdf-lib';

/**
 * Leitura de fatura que veio como imagem (PDF "impresso" do site do banco ou
 * escaneado): tira a imagem de cada página e passa pelo OCR (tesseract.js,
 * português). O dicionário é baixado uma vez e fica em .cache/tesseract.
 * Devolve as linhas já limpas para o parser genérico.
 */

const PASTA_CACHE = join(process.cwd(), '.cache', 'tesseract');
const WORKERS = Math.max(1, Math.min(4, cpus().length - 1));
const ESCALA = Number(process.env.OCR_ESCALA ?? 2);

// ── PNG mínimo a partir dos pixels crus da imagem do PDF ──
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const x of b) c = TABELA_CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo: string, dados: Buffer) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}
/**
 * PNG a partir dos pixels, ampliado ESCALA vezes: imagens de ~150 dpi perdem
 * sinais pequenos (o "-" dos créditos) se forem lidas no tamanho original.
 */
function png(pixels: Buffer, largura: number, altura: number, canais: 1 | 3): Buffer {
  const linhas: Buffer[] = [];
  const passo = largura * canais;
  for (let y = 0; y < altura; y++) {
    const origem = pixels.subarray(y * passo, (y + 1) * passo);
    const linha = Buffer.alloc(1 + passo * ESCALA);
    for (let x = 0; x < largura; x++) {
      for (let e = 0; e < ESCALA; e++) origem.copy(linha, 1 + (x * ESCALA + e) * canais, x * canais, (x + 1) * canais);
    }
    for (let e = 0; e < ESCALA; e++) linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura * ESCALA, 0);
  ihdr.writeUInt32BE(altura * ESCALA, 4);
  ihdr[8] = 8;
  ihdr[9] = canais === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/** maior imagem de cada página, como PNG ou JPEG */
async function imagensDasPaginas(dados: Uint8Array): Promise<Buffer[]> {
  const doc = await PDFDocument.load(dados, { ignoreEncryption: true });
  const imagens: Buffer[] = [];
  for (const pagina of doc.getPages()) {
    const xobjs = pagina.node.Resources()?.lookup(PDFName.of('XObject')) as PDFDict | undefined;
    if (!xobjs) continue;
    let melhor: { area: number; img: Buffer } | null = null;
    for (const nome of xobjs.keys()) {
      const obj = xobjs.lookup(nome);
      if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
      const largura = Number(obj.dict.get(PDFName.of('Width'))?.toString());
      const altura = Number(obj.dict.get(PDFName.of('Height'))?.toString());
      const filtro = obj.dict.get(PDFName.of('Filter'))?.toString();
      const area = largura * altura;
      if (melhor && melhor.area >= area) continue;
      let img: Buffer | null = null;
      if (filtro === '/DCTDecode') img = Buffer.from(obj.contents);
      else if (filtro === '/FlateDecode' && !obj.dict.get(PDFName.of('DecodeParms'))) {
        const pixels = inflateSync(Buffer.from(obj.contents));
        const canais = pixels.length / area;
        if (canais === 1 || canais === 3) img = png(pixels, largura, altura, canais);
      }
      if (img) melhor = { area, img };
    }
    if (melhor) imagens.push(melhor.img);
  }
  return imagens;
}

/** acerta o que o OCR costuma trazer torto nas linhas de lançamento */
function limparLinha(linha: string): string {
  return (
    linha
      // 29-09-2025 → 29/09/2025
      .replace(/\b(\d{2})-(\d{2})-(\d{4})\b/g, '$1/$2/$3')
      // traços/aspas soltos logo depois da data
      .replace(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)[\s"'”“—–=_|&/\\-]+(?=\S)/, '$1 ')
      // "PARC 12/12Sao" → "PARC 12 DE 12 Sao" (assim "12/12" não parece a data de outro lançamento);
      // o OCR às vezes lê o "S" grudado como "8": "PARC 04/128AO PAULO"
      .replace(/\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*\/\s*(\d{2})\d?(?=\D|$)/gi, 'PARC $1 DE $2 ')
      // internacional: "... 20,00 USD 20,00 110,26 5,51" → tira a cotação do fim (o valor em R$ fica por último)
      .replace(/(\b[A-Z]{3}\s+[\d.]*\d,\d{2}\s+[\d.]*\d,\d{2})\s+\d{1,2},\d{2,4}\s*$/, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export async function ocrPdf(dados: Uint8Array): Promise<string[]> {
  const imagens = await imagensDasPaginas(dados);
  if (!imagens.length) return [];

  mkdirSync(PASTA_CACHE, { recursive: true });
  const { createScheduler, createWorker } = await import('tesseract.js');
  const agendador = createScheduler();
  try {
    const workers = await Promise.all(
      Array.from({ length: Math.min(WORKERS, imagens.length) }, () => createWorker('por', 1, { cachePath: PASTA_CACHE }))
    );
    workers.forEach((w) => agendador.addWorker(w));
    const paginas = await Promise.all(imagens.map((img) => agendador.addJob('recognize', img)));
    return paginas.flatMap((p) => p.data.text.split('\n').map(limparLinha).filter(Boolean));
  } finally {
    await agendador.terminate();
  }
}

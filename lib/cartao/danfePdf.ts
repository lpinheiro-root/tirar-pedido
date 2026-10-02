import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { lerXml } from './sefaz';

/**
 * DANFE simplificado em PDF, gerado no servidor a partir do XML autorizado.
 * Usa as fontes padrão do PDF (WinAnsi): caracteres fora dessa tabela são
 * trocados por equivalentes simples.
 */

type No = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0);
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// WinAnsi não tem alguns símbolos comuns em XML de NF-e
function limpar(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E -ÿ]/g, '');
}

function cnpjCpf(v: unknown) {
  const s = txt(v);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return s;
}

function endereco(e: No | undefined) {
  if (!e) return '';
  return [
    [txt(e.xLgr), txt(e.nro)].filter(Boolean).join(', '),
    txt(e.xBairro),
    [txt(e.xMun), txt(e.UF)].filter(Boolean).join('/'),
    txt(e.CEP),
  ]
    .filter(Boolean)
    .join(' - ');
}

const A4 = { w: 595.28, h: 841.89 };
const M = 28;
const LARGURA = A4.w - 2 * M;
const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.35, 0.35, 0.35);

class Desenho {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private f: PDFFont,
    private fb: PDFFont
  ) {
    this.page = doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }
  novaPagina() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }
  garantir(altura: number) {
    if (this.y - altura < M) this.novaPagina();
  }
  /** corta o texto para caber na largura (com reticências) */
  caber(s: string, tamanho: number, largura: number, negrito = false) {
    const fonte = negrito ? this.fb : this.f;
    let t = limpar(s);
    if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
    while (t.length > 1 && fonte.widthOfTextAtSize(t + '...', tamanho) > largura) t = t.slice(0, -1);
    return t + '...';
  }
  /** quebra o texto em linhas que caibam na largura */
  quebrar(s: string, tamanho: number, largura: number) {
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of limpar(s).split(' ')) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (this.f.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }
  texto(s: string, x: number, y: number, tamanho: number, negrito = false, cor = PRETO) {
    this.page.drawText(limpar(s), { x, y, size: tamanho, font: negrito ? this.fb : this.f, color: cor });
  }
  caixa(x: number, y: number, w: number, h: number) {
    this.page.drawRectangle({ x, y, width: w, height: h, borderColor: CINZA, borderWidth: 0.6 });
  }
  /** campo rotulado (caixa com título pequeno e valor) */
  campo(rotulo: string, valor: string, x: number, w: number, h = 24, negrito = false) {
    this.caixa(x, this.y - h, w, h);
    this.texto(rotulo.toUpperCase(), x + 3, this.y - 8, 5.5, false, CINZA);
    this.texto(this.caber(valor, 8.5, w - 6, negrito), x + 3, this.y - 19, 8.5, negrito);
  }
  linhaDeCampos(campos: { rotulo: string; valor: string; peso: number; negrito?: boolean }[], h = 24) {
    this.garantir(h + 2);
    const total = campos.reduce((s, c) => s + c.peso, 0);
    let x = M;
    for (const c of campos) {
      const w = (LARGURA * c.peso) / total;
      this.campo(c.rotulo, c.valor, x, w, h, c.negrito);
      x += w;
    }
    this.y -= h + 2;
  }
  titulo(s: string) {
    this.garantir(16);
    this.texto(s.toUpperCase(), M, this.y - 9, 7, true);
    this.y -= 12;
  }
}

export async function gerarDanfePdf(xml: string, chave: string): Promise<Uint8Array> {
  const doc = lerXml(xml);
  const proc = (doc.nfeProc ?? doc.procNFe ?? {}) as No;
  const inf = ((proc.NFe as No)?.infNFe ?? {}) as Record<string, No>;
  const prot = ((proc.protNFe as No)?.infProt ?? {}) as No;
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const tot = ((inf.total as No)?.ICMSTot ?? {}) as No;
  const itens = (inf.det ?? []) as unknown as { '@nItem': string; prod: No }[];
  const emissao = txt(ide.dhEmi ?? ide.dEmi);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`NF-e ${txt(ide.nNF)} - ${limpar(txt(emit.xNome))}`);
  pdf.setProducer('Natuhair Finanças');
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const d = new Desenho(pdf, f, fb);

  // cabeçalho: emitente + quadro DANFE
  const hCab = 64;
  const wDanfe = 150;
  d.caixa(M, d.y - hCab, LARGURA - wDanfe - 2, hCab);
  d.texto(d.caber(txt(emit.xNome), 11, LARGURA - wDanfe - 12, true), M + 6, d.y - 16, 11, true);
  d.quebrar(endereco(emit.enderEmit as No), 7.5, LARGURA - wDanfe - 12)
    .slice(0, 2)
    .forEach((l, i) => d.texto(l, M + 6, d.y - 30 - i * 10, 7.5));
  d.texto(`CNPJ ${cnpjCpf(emit.CNPJ ?? emit.CPF)}   IE ${txt(emit.IE)}`, M + 6, d.y - 54, 7.5);
  const xD = M + LARGURA - wDanfe;
  d.caixa(xD, d.y - hCab, wDanfe, hCab);
  d.texto('DANFE', xD + 52, d.y - 16, 14, true);
  d.texto('Documento Auxiliar da Nota', xD + 22, d.y - 27, 6.5);
  d.texto('Fiscal Eletrônica', xD + 46, d.y - 35, 6.5);
  d.texto(txt(ide.tpNF) === '0' ? '0 - ENTRADA' : '1 - SAÍDA', xD + 45, d.y - 46, 7.5);
  d.texto(`Nº ${txt(ide.nNF)}   Série ${txt(ide.serie)}`, xD + 30, d.y - 58, 8.5, true);
  d.y -= hCab + 4;

  d.linhaDeCampos([
    { rotulo: 'Chave de acesso', valor: chave.replace(/(\d{4})(?=\d)/g, '$1 '), peso: 3, negrito: true },
    {
      rotulo: 'Protocolo de autorização',
      valor: `${txt(prot.nProt)} ${prot.dhRecbto ? new Date(txt(prot.dhRecbto)).toLocaleString('pt-BR') : ''}`,
      peso: 1.6,
    },
  ]);
  d.linhaDeCampos([
    { rotulo: 'Natureza da operação', valor: txt(ide.natOp), peso: 3 },
    { rotulo: 'Data de emissão', valor: emissao ? new Date(emissao).toLocaleDateString('pt-BR') : '', peso: 1 },
  ]);

  d.titulo('Destinatário');
  d.linhaDeCampos([
    { rotulo: 'Nome / razão social', valor: txt(dest.xNome), peso: 3 },
    { rotulo: 'CNPJ / CPF', valor: cnpjCpf(dest.CNPJ ?? dest.CPF), peso: 1.4 },
  ]);
  d.linhaDeCampos([{ rotulo: 'Endereço', valor: endereco(dest.enderDest as No), peso: 1 }]);

  d.titulo('Totais');
  d.linhaDeCampos([
    { rotulo: 'Produtos', valor: moeda(num(tot.vProd)), peso: 1 },
    { rotulo: 'Frete', valor: moeda(num(tot.vFrete)), peso: 1 },
    { rotulo: 'Desconto', valor: moeda(num(tot.vDesc)), peso: 1 },
    { rotulo: 'ICMS', valor: moeda(num(tot.vICMS)), peso: 1 },
    { rotulo: 'IPI', valor: moeda(num(tot.vIPI)), peso: 1 },
    { rotulo: 'Total da nota', valor: moeda(num(tot.vNF)), peso: 1.2, negrito: true },
  ]);

  // itens
  d.titulo('Itens');
  const cols = [
    { t: 'Código', w: 58 },
    { t: 'Descrição', w: 207 },
    { t: 'NCM', w: 46 },
    { t: 'CFOP', w: 30 },
    { t: 'Un', w: 26 },
    { t: 'Qtd', w: 42, dir: true },
    { t: 'V. unit', w: 65, dir: true },
    { t: 'V. total', w: LARGURA - 474, dir: true },
  ];
  const cabecalhoItens = () => {
    d.garantir(14);
    let x = M;
    d.page.drawRectangle({ x: M, y: d.y - 12, width: LARGURA, height: 12, color: rgb(0.92, 0.92, 0.92) });
    for (const c of cols) {
      d.texto(c.t.toUpperCase(), x + 2, d.y - 9, 6, true);
      x += c.w;
    }
    d.y -= 13;
  };
  cabecalhoItens();
  for (const it of itens) {
    const p = it.prod ?? {};
    const linhasDesc = d.quebrar(txt(p.xProd), 7, cols[1].w - 4).slice(0, 3);
    const h = 4 + linhasDesc.length * 8.5;
    if (d.y - h < M) {
      d.novaPagina();
      cabecalhoItens();
    }
    const valores = [
      txt(p.cProd),
      '',
      txt(p.NCM),
      txt(p.CFOP),
      txt(p.uCom),
      num(p.qCom).toLocaleString('pt-BR', { maximumFractionDigits: 4 }),
      moeda(num(p.vUnCom)),
      moeda(num(p.vProd)),
    ];
    let x = M;
    cols.forEach((c, i) => {
      if (i === 1) linhasDesc.forEach((l, j) => d.texto(l, x + 2, d.y - 8 - j * 8.5, 7));
      else {
        const v = d.caber(valores[i], 7, c.w - 4);
        const xx = c.dir ? x + c.w - 2 - f.widthOfTextAtSize(v, 7) : x + 2;
        d.texto(v, xx, d.y - 8, 7);
      }
      x += c.w;
    });
    d.y -= h;
    d.page.drawLine({ start: { x: M, y: d.y }, end: { x: M + LARGURA, y: d.y }, thickness: 0.3, color: CINZA });
  }

  const infCpl = txt((inf.infAdic as No | undefined)?.infCpl);
  if (infCpl) {
    d.y -= 6;
    d.titulo('Informações complementares');
    for (const l of d.quebrar(infCpl, 7, LARGURA - 6).slice(0, 14)) {
      d.garantir(10);
      d.texto(l, M + 3, d.y - 8, 7);
      d.y -= 9;
    }
  }

  d.garantir(14);
  d.texto(
    'DANFE simplificado gerado pelo Natuhair Finanças a partir do XML autorizado. O documento fiscal válido é o XML.',
    M,
    M - 10 + 0,
    6,
    false,
    CINZA
  );

  return pdf.save();
}

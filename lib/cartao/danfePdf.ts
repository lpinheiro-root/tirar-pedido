import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { lerXml } from './sefaz';

/**
 * DANFE em PDF no layout padrão (o mesmo do NF-Stock / portal da NF-e), gerado
 * no servidor a partir do XML autorizado: canhoto, emitente, quadro DANFE,
 * código de barras da chave, destinatário, fatura, cálculo do imposto,
 * transportador, produtos e dados adicionais. Usa as fontes padrão do PDF
 * (WinAnsi): caracteres fora dessa tabela são trocados por equivalentes simples.
 */

type No = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0);
const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const decimal = (v: unknown, casas = 2, max = casas) =>
  num(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: max });
const FUSO = 'America/Sao_Paulo';
const data = (v: unknown) => (v ? new Date(txt(v)).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '');
const hora = (v: unknown) => (v ? new Date(txt(v)).toLocaleTimeString('pt-BR', { timeZone: FUSO }) : '');

// WinAnsi não tem alguns símbolos comuns em XML de NF-e
function limpar(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function cnpjCpf(v: unknown) {
  const s = txt(v);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return s;
}
const cep = (v: unknown) => txt(v).replace(/^(\d{5})(\d{3})$/, '$1-$2');
const numeroNota = (v: unknown) => txt(v).padStart(9, '0').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3');
const serieNota = (v: unknown) => txt(v).padStart(3, '0');

const MOD_FRETE: Record<string, string> = {
  '0': '(0) Emitente',
  '1': '(1) Destinatário',
  '2': '(2) Terceiros',
  '3': '(3) Próprio Remetente',
  '4': '(4) Próprio Destinatário',
  '9': '(9) Sem Frete',
};

// ── Code 128 (conjunto C) para a chave de acesso ─────────────────────────────
const CODE128 = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 ' +
  '113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 ' +
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 ' +
  '113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 ' +
  '241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 ' +
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 ' +
  '211232 2331112'
).split(' ');

/** Larguras (em módulos) alternando barra/espaço, começando por barra. */
function code128c(digitos: string): number[] {
  const valores = [105];
  for (let i = 0; i < digitos.length; i += 2) valores.push(Number(digitos.slice(i, i + 2)));
  const soma = valores.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  valores.push(soma % 103, 106);
  return valores.flatMap((v) => CODE128[v].split('').map(Number));
}

// ── Página ──────────────────────────────────────────────────────────────────
const A4 = { w: 595.28, h: 841.89 };
const M = 14;
const W = A4.w - 2 * M;
const PRETO = rgb(0, 0, 0);
const LINHA = 0.6;

type Alinhamento = 'esq' | 'dir' | 'centro';

class Folha {
  page!: PDFPage;
  t = 0; // cursor medido do topo da página
  constructor(
    private doc: PDFDocument,
    readonly f: PDFFont,
    readonly fb: PDFFont,
    readonly fi: PDFFont
  ) {}

  nova() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.t = M;
  }
  cabe(altura: number) {
    return this.t + altura <= A4.h - M - 8;
  }

  /** ajusta o texto à largura: diminui a fonte até `min` e, se preciso, corta */
  ajustar(s: string, tamanho: number, largura: number, fonte: PDFFont, min = 5) {
    let t = limpar(s);
    let tam = tamanho;
    while (tam > min && fonte.widthOfTextAtSize(t, tam) > largura) tam -= 0.25;
    if (fonte.widthOfTextAtSize(t, tam) > largura) {
      while (t.length > 1 && fonte.widthOfTextAtSize(t + '...', tam) > largura) t = t.slice(0, -1);
      t += '...';
    }
    return { t, tam };
  }
  quebrar(s: string, tamanho: number, largura: number, fonte = this.f) {
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of limpar(s).split(' ')) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
        while (fonte.widthOfTextAtSize(atual, tamanho) > largura && atual.length > 1) {
          let corte = atual.length - 1;
          while (corte > 1 && fonte.widthOfTextAtSize(atual.slice(0, corte), tamanho) > largura) corte--;
          linhas.push(atual.slice(0, corte));
          atual = atual.slice(corte);
        }
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  /** texto com a linha de base em `topo` (medido do topo) */
  texto(s: string, x: number, topo: number, tamanho: number, fonte = this.f, largura?: number, alinhar: Alinhamento = 'esq') {
    const { t, tam } = largura ? this.ajustar(s, tamanho, largura, fonte) : { t: limpar(s), tam: tamanho };
    let xx = x;
    if (largura && alinhar !== 'esq') {
      const sobra = largura - fonte.widthOfTextAtSize(t, tam);
      xx = x + (alinhar === 'dir' ? sobra : sobra / 2);
    }
    this.page.drawText(t, { x: xx, y: A4.h - topo, size: tam, font: fonte, color: PRETO });
  }
  caixa(x: number, topo: number, w: number, h: number) {
    this.page.drawRectangle({ x, y: A4.h - topo - h, width: w, height: h, borderColor: PRETO, borderWidth: LINHA });
  }
  linha(x1: number, t1: number, x2: number, t2: number, tracejada = false) {
    this.page.drawLine({
      start: { x: x1, y: A4.h - t1 },
      end: { x: x2, y: A4.h - t2 },
      thickness: LINHA,
      color: PRETO,
      dashArray: tracejada ? [3, 2] : undefined,
    });
  }
  /** campo: caixa com rótulo pequeno em cima e o valor embaixo */
  campo(x: number, topo: number, w: number, h: number, rotulo: string, valor: string, alinhar: Alinhamento = 'esq', tamanho = 8.5) {
    this.caixa(x, topo, w, h);
    this.texto(rotulo.toUpperCase(), x + 2, topo + 6.5, 5.2, this.f, w - 4);
    if (valor) this.texto(valor, x + 3, topo + h - 4, tamanho, this.fb, w - 6, alinhar);
  }
  /** linha de campos com larguras proporcionais ao peso, ocupando a largura útil */
  linhaCampos(campos: { r: string; v: string; p: number; a?: Alinhamento }[], h = 21, tamanho = 8.5) {
    const total = campos.reduce((s, c) => s + c.p, 0);
    let x = M;
    for (const c of campos) {
      const w = (W * c.p) / total;
      this.campo(x, this.t, w, h, c.r, c.v, c.a, tamanho);
      x += w;
    }
    this.t += h;
  }
  titulo(s: string) {
    this.texto(s.toUpperCase(), M, this.t + 9, 7, this.fb);
    this.t += 11;
  }
}

export async function gerarDanfePdf(xml: string, chave: string): Promise<Uint8Array> {
  const doc = lerXml(xml);
  const proc = (doc.nfeProc ?? doc.procNFe ?? {}) as No;
  const inf = ((proc.NFe as No)?.infNFe ?? (doc.NFe as No)?.infNFe ?? {}) as Record<string, No>;
  const prot = ((proc.protNFe as No)?.infProt ?? {}) as No;
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const ender = (emit.enderEmit ?? {}) as No;
  const dest = inf.dest ?? {};
  const enderDest = (dest.enderDest ?? {}) as No;
  const tot = ((inf.total as No)?.ICMSTot ?? {}) as No;
  const transp = (inf.transp ?? {}) as No;
  const transporta = (transp.transporta ?? {}) as No;
  const veiculo = (transp.veicTransp ?? {}) as No;
  const volumes = lista(transp.vol as No | No[]);
  const duplicatas = lista(((inf.cobr as No | undefined)?.dup ?? undefined) as No | No[] | undefined);
  const itens = (inf.det ?? []) as unknown as { '@nItem': string; prod: No; imposto?: No; infAdProd?: string }[];
  const infAdic = (inf.infAdic ?? {}) as No;
  const emissao = ide.dhEmi ?? ide.dEmi;
  const saida = ide.dhSaiEnt ?? ide.dSaiEnt;
  const chaveFmt = chave.replace(/(\d{4})(?=\d)/g, '$1 ');

  const pdf = await PDFDocument.create();
  pdf.setTitle(`NF-e ${txt(ide.nNF)} - ${limpar(txt(emit.xNome))}`);
  pdf.setProducer('Natuhair Finanças');
  const d = new Folha(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    await pdf.embedFont(StandardFonts.HelveticaOblique)
  );
  const folhas: { page: PDFPage; x: number; topo: number; w: number }[] = [];

  // ── canhoto (só na 1ª folha) ──
  const canhoto = () => {
    const wNf = 105;
    const wTexto = W - wNf;
    d.caixa(M, d.t, wTexto, 26);
    const recebemos =
      `RECEBEMOS DE ${txt(emit.xNome)} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. ` +
      `EMISSÃO: ${data(emissao)} VALOR TOTAL: R$ ${decimal(tot.vNF)} DESTINATÁRIO: ${txt(dest.xNome)} - ` +
      `${[txt(enderDest.xLgr), txt(enderDest.nro), txt(enderDest.xBairro), txt(enderDest.xMun)].filter(Boolean).join(', ')}-${txt(enderDest.UF)}`;
    d.quebrar(recebemos.toUpperCase(), 6.2, wTexto - 6)
      .slice(0, 3)
      .forEach((l, i) => d.texto(l, M + 3, d.t + 7.5 + i * 7.5, 6.2));
    d.campo(M, d.t + 26, 130, 24, 'Data de recebimento', '');
    d.campo(M + 130, d.t + 26, wTexto - 130, 24, 'Identificação e assinatura do recebedor', '');
    const xN = M + wTexto;
    d.caixa(xN, d.t, wNf, 50);
    d.texto('NF-e', xN, d.t + 15, 13, d.fb, wNf, 'centro');
    d.texto(`Nº. ${numeroNota(ide.nNF)}`, xN, d.t + 30, 8, d.fb, wNf, 'centro');
    d.texto(`Série ${serieNota(ide.serie)}`, xN, d.t + 41, 8, d.fb, wNf, 'centro');
    d.t += 56;
    d.linha(M, d.t, M + W, d.t, true);
    d.t += 6;
  };

  // ── quadro do emitente, DANFE e chave (repete em todas as folhas) ──
  const cabecalho = () => {
    const h = 104;
    const wEmit = 222;
    const wDanfe = 100;
    const xDanfe = M + wEmit;
    const xChave = xDanfe + wDanfe;
    const wChave = W - wEmit - wDanfe;
    const topo = d.t;

    // emitente
    d.caixa(M, topo, wEmit, h);
    d.texto('IDENTIFICAÇÃO DO EMITENTE', M, topo + 9, 6, d.fi, wEmit, 'centro');
    const nome = d.quebrar(txt(emit.xNome), 10, wEmit - 12, d.fb).slice(0, 2);
    let ty = topo + 30 - (nome.length - 1) * 5;
    for (const l of nome) {
      d.texto(l, M + 6, ty, 10, d.fb, wEmit - 12, 'centro');
      ty += 11.5;
    }
    const endEmit = [
      [txt(ender.xLgr), txt(ender.nro), txt(ender.xCpl)].filter(Boolean).join(', '),
      [txt(ender.xBairro), cep(ender.CEP)].filter(Boolean).join(' - '),
      [txt(ender.xMun), txt(ender.UF)].filter(Boolean).join(' - '),
      ender.fone ? `Fone: ${txt(ender.fone)}` : '',
    ].filter(Boolean);
    endEmit.forEach((l, i) => d.texto(l.toUpperCase(), M + 4, ty + 3 + i * 9, 7.2, d.f, wEmit - 8, 'centro'));

    // quadro DANFE
    d.caixa(xDanfe, topo, wDanfe, h);
    d.texto('DANFE', xDanfe, topo + 17, 14, d.fb, wDanfe, 'centro');
    d.texto('Documento Auxiliar da Nota Fiscal', xDanfe + 4, topo + 26, 5.6, d.f, wDanfe - 8, 'centro');
    d.texto('Eletrônica', xDanfe + 4, topo + 32.5, 5.6, d.f, wDanfe - 8, 'centro');
    d.texto('0 - ENTRADA', xDanfe + 14, topo + 44, 6.2);
    d.texto('1 - SAÍDA', xDanfe + 14, topo + 52, 6.2);
    d.caixa(xDanfe + 66, topo + 39, 13, 14);
    d.texto(txt(ide.tpNF), xDanfe + 66, topo + 50, 9, d.fb, 13, 'centro');
    d.texto(`Nº. ${numeroNota(ide.nNF)}`, xDanfe, topo + 68, 8.5, d.fb, wDanfe, 'centro');
    d.texto(`Série ${serieNota(ide.serie)}`, xDanfe, topo + 79, 8.5, d.fb, wDanfe, 'centro');
    folhas.push({ page: d.page, x: xDanfe, topo: topo + 90, w: wDanfe });

    // código de barras, chave e consulta
    d.caixa(xChave, topo, wChave, 40);
    const barras = code128c(chave);
    const modulos = barras.reduce((s, b) => s + b, 0);
    const modulo = (wChave - 16) / modulos;
    let bx = xChave + 8;
    barras.forEach((largura, i) => {
      if (i % 2 === 0) {
        d.page.drawRectangle({ x: bx, y: A4.h - topo - 35, width: largura * modulo, height: 30, color: PRETO });
      }
      bx += largura * modulo;
    });
    d.campo(xChave, topo + 40, wChave, 22, 'Chave de acesso', '');
    d.texto(chaveFmt, xChave + 3, topo + 58, 8, d.fb, wChave - 6, 'centro');
    d.caixa(xChave, topo + 62, wChave, h - 62);
    d.texto('Consulta de autenticidade no portal nacional da NF-e', xChave + 3, topo + 78, 6.8, d.f, wChave - 6, 'centro');
    d.texto(
      'www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora',
      xChave + 3,
      topo + 87,
      6.8,
      d.f,
      wChave - 6,
      'centro'
    );
    d.t += h;

    // natureza da operação / protocolo
    const wNat = wEmit + wDanfe;
    d.campo(M, d.t, wNat, 21, 'Natureza da operação', txt(ide.natOp).toUpperCase(), 'centro');
    d.campo(
      M + wNat,
      d.t,
      W - wNat,
      21,
      'Protocolo de autorização de uso',
      prot.nProt ? `${txt(prot.nProt)} - ${data(prot.dhRecbto)} ${hora(prot.dhRecbto)}` : '',
      'centro'
    );
    d.t += 21;
    d.linhaCampos([
      { r: 'Inscrição estadual', v: txt(emit.IE), p: 1 },
      { r: 'Inscrição estadual do subst. tribut.', v: txt(emit.IEST), p: 1 },
      { r: 'CNPJ', v: cnpjCpf(emit.CNPJ ?? emit.CPF), p: 1, a: 'centro' },
    ]);
  };

  d.nova();
  canhoto();
  cabecalho();

  // ── destinatário / remetente ──
  d.titulo('Destinatário / Remetente');
  d.linhaCampos([
    { r: 'Nome / razão social', v: txt(dest.xNome).toUpperCase(), p: 6 },
    { r: 'CNPJ / CPF', v: cnpjCpf(dest.CNPJ ?? dest.CPF ?? dest.idEstrangeiro), p: 2.3 },
    { r: 'Data da emissão', v: data(emissao), p: 1.7 },
  ]);
  d.linhaCampos([
    { r: 'Endereço', v: [txt(enderDest.xLgr), txt(enderDest.nro), txt(enderDest.xCpl)].filter(Boolean).join(', ').toUpperCase(), p: 4.3 },
    { r: 'Bairro / distrito', v: txt(enderDest.xBairro).toUpperCase(), p: 2.4 },
    { r: 'CEP', v: cep(enderDest.CEP), p: 1.6 },
    { r: 'Data da saída/entrada', v: data(saida), p: 1.7 },
  ]);
  d.linhaCampos([
    { r: 'Município', v: txt(enderDest.xMun).toUpperCase(), p: 3.6 },
    { r: 'UF', v: txt(enderDest.UF), p: 0.7 },
    { r: 'Fone / fax', v: txt(enderDest.fone), p: 1.7 },
    { r: 'Inscrição estadual', v: txt(dest.IE), p: 2.3 },
    { r: 'Hora da saída/entrada', v: hora(saida), p: 1.7 },
  ]);

  // ── fatura / duplicatas ──
  if (duplicatas.length) {
    d.titulo('Fatura / Duplicatas');
    const porLinha = 7;
    const wDup = W / porLinha;
    duplicatas.forEach((dup, i) => {
      const x = M + (i % porLinha) * wDup;
      if (i > 0 && i % porLinha === 0) d.t += 26;
      d.caixa(x, d.t, wDup, 26);
      d.texto(`Num.: ${txt(dup.nDup)}`, x + 3, d.t + 8, 6.5, d.f, wDup - 6);
      d.texto(`Venc.: ${data(txt(dup.dVenc) + 'T12:00:00')}`, x + 3, d.t + 15.5, 6.5, d.f, wDup - 6);
      d.texto(`Valor: R$ ${decimal(dup.vDup)}`, x + 3, d.t + 23, 6.5, d.fb, wDup - 6);
    });
    d.t += 26;
  }

  // ── cálculo do imposto ──
  d.titulo('Cálculo do imposto');
  d.linhaCampos([
    { r: 'Base de cálculo do ICMS', v: decimal(tot.vBC), p: 1, a: 'dir' },
    { r: 'Valor do ICMS', v: decimal(tot.vICMS), p: 1, a: 'dir' },
    { r: 'Base de cálc. ICMS S.T.', v: decimal(tot.vBCST), p: 1, a: 'dir' },
    { r: 'Valor do ICMS subst.', v: decimal(tot.vST), p: 1, a: 'dir' },
    { r: 'Valor imp. importação', v: decimal(tot.vII), p: 1, a: 'dir' },
    { r: 'Valor do PIS', v: decimal(tot.vPIS), p: 1, a: 'dir' },
    { r: 'Valor total dos produtos', v: decimal(tot.vProd), p: 1.2, a: 'dir' },
  ]);
  d.linhaCampos([
    { r: 'Valor do frete', v: decimal(tot.vFrete), p: 1, a: 'dir' },
    { r: 'Valor do seguro', v: decimal(tot.vSeg), p: 1, a: 'dir' },
    { r: 'Desconto', v: decimal(tot.vDesc), p: 1, a: 'dir' },
    { r: 'Outras despesas', v: decimal(tot.vOutro), p: 1, a: 'dir' },
    { r: 'Valor total do IPI', v: decimal(tot.vIPI), p: 1, a: 'dir' },
    { r: 'Valor da COFINS', v: decimal(tot.vCOFINS), p: 1, a: 'dir' },
    { r: 'Valor total da nota', v: decimal(tot.vNF), p: 1.2, a: 'dir' },
  ]);

  // ── transportador / volumes ──
  d.titulo('Transportador / Volumes transportados');
  d.linhaCampos([
    { r: 'Nome / razão social', v: txt(transporta.xNome).toUpperCase(), p: 3.4 },
    { r: 'Frete por conta', v: MOD_FRETE[txt(transp.modFrete)] ?? txt(transp.modFrete), p: 1.9 },
    { r: 'Código ANTT', v: txt(veiculo.RNTC), p: 1.3 },
    { r: 'Placa do veículo', v: txt(veiculo.placa), p: 1.3 },
    { r: 'UF', v: txt(veiculo.UF), p: 0.5 },
    { r: 'CNPJ / CPF', v: cnpjCpf(transporta.CNPJ ?? transporta.CPF), p: 2 },
  ]);
  d.linhaCampos([
    { r: 'Endereço', v: txt(transporta.xEnder).toUpperCase(), p: 4.5 },
    { r: 'Município', v: txt(transporta.xMun).toUpperCase(), p: 3.1 },
    { r: 'UF', v: txt(transporta.UF), p: 0.5 },
    { r: 'Inscrição estadual', v: txt(transporta.IE), p: 2.3 },
  ]);
  const somaVol = (campo: string) => volumes.reduce((s, v) => s + num(v[campo]), 0);
  const primeiroVol = (campo: string) => txt(volumes.find((v) => v[campo])?.[campo]);
  d.linhaCampos([
    { r: 'Quantidade', v: volumes.length ? String(somaVol('qVol') || '') : '', p: 1 },
    { r: 'Espécie', v: primeiroVol('esp').toUpperCase(), p: 1.3 },
    { r: 'Marca', v: primeiroVol('marca').toUpperCase(), p: 1.3 },
    { r: 'Numeração', v: primeiroVol('nVol'), p: 1.3 },
    { r: 'Peso bruto', v: volumes.length ? decimal(somaVol('pesoB'), 3) : '', p: 1.3, a: 'dir' },
    { r: 'Peso líquido', v: volumes.length ? decimal(somaVol('pesoL'), 3) : '', p: 1.3, a: 'dir' },
  ]);

  // ── produtos ──
  const fixas = [
    { t: 'Código produto', w: 42 },
    { t: 'Descrição do produto / serviço', w: 0 },
    { t: 'NCM/SH', w: 36 },
    { t: 'O/CST', w: 22 },
    { t: 'CFOP', w: 22 },
    { t: 'UN', w: 18 },
    { t: 'Quant', w: 36, dir: true },
    { t: 'Valor unit', w: 44, dir: true },
    { t: 'Valor total', w: 46, dir: true },
    { t: 'B.Cálc ICMS', w: 40, dir: true },
    { t: 'Valor ICMS', w: 36, dir: true },
    { t: 'Valor IPI', w: 32, dir: true },
    { t: 'Alíq. ICMS', w: 22, dir: true },
    { t: 'Alíq. IPI', w: 22, dir: true },
  ];
  fixas[1].w = W - fixas.reduce((s, c) => s + c.w, 0);
  const colunasX = fixas.reduce<number[]>((xs, c, i) => [...xs, i === 0 ? M : xs[i - 1] + fixas[i - 1].w], []);

  let inicioTabela = 0;
  const cabecalhoProdutos = () => {
    d.titulo('Dados dos produtos / serviços');
    inicioTabela = d.t;
    d.caixa(M, d.t, W, 16);
    fixas.forEach((c, i) => {
      const linhas = d.quebrar(c.t.toUpperCase(), 5, c.w - 3);
      linhas.slice(0, 2).forEach((l, j) => d.texto(l, colunasX[i] + 1.5, d.t + (linhas.length > 1 ? 6.5 : 9.5) + j * 6, 5, d.f, c.w - 3, 'centro'));
    });
    d.t += 16;
  };
  const fecharTabela = () => {
    d.caixa(M, inicioTabela, W, d.t - inicioTabela);
    for (const x of colunasX.slice(1)) d.linha(x, inicioTabela, x, d.t);
  };

  cabecalhoProdutos();
  for (const it of itens) {
    const p = it.prod ?? {};
    const imposto = (it.imposto ?? {}) as No;
    const icms = (Object.values((imposto.ICMS ?? {}) as No)[0] ?? {}) as No;
    const ipi = (((imposto.IPI ?? {}) as No).IPITrib ?? {}) as No;
    const descricao = [txt(p.xProd), txt(it.infAdProd)].filter(Boolean).join(' ');
    const linhasDesc = d.quebrar(descricao, 6.3, fixas[1].w - 4).slice(0, 6);
    const h = 4 + linhasDesc.length * 7.5;
    if (!d.cabe(h)) {
      fecharTabela();
      d.nova();
      cabecalho();
      cabecalhoProdutos();
    }
    const valores = [
      txt(p.cProd),
      '',
      txt(p.NCM),
      `${txt(icms.orig)}${txt(icms.CST ?? icms.CSOSN)}`,
      txt(p.CFOP),
      txt(p.uCom),
      decimal(p.qCom, 4),
      decimal(p.vUnCom, 2, 4),
      decimal(p.vProd),
      decimal(icms.vBC),
      decimal(icms.vICMS),
      decimal(ipi.vIPI),
      decimal(icms.pICMS),
      decimal(ipi.pIPI),
    ];
    fixas.forEach((c, i) => {
      if (i === 1) linhasDesc.forEach((l, j) => d.texto(l, colunasX[i] + 2, d.t + 7.5 + j * 7.5, 6.3));
      else d.texto(valores[i], colunasX[i] + 1.5, d.t + 7.5, 6.3, d.f, c.w - 3, c.dir ? 'dir' : 'centro');
    });
    d.t += h;
  }
  fecharTabela();

  // ── dados adicionais ──
  const complementares = [txt(infAdic.infCpl)].filter(Boolean).join(' ');
  const fisco = txt(infAdic.infAdFisco);
  const wCompl = W * 0.68;
  const linhasCompl = d.quebrar(complementares, 6.3, wCompl - 6);
  const linhasFisco = d.quebrar(fisco, 6.3, W - wCompl - 6);
  let feitas = 0;
  while (feitas < linhasCompl.length || feitas === 0) {
    if (!d.cabe(11 + 40)) {
      d.nova();
      cabecalho();
    }
    d.t += 3;
    d.titulo('Dados adicionais');
    const cabem = Math.max(4, Math.floor((A4.h - M - 8 - d.t - 12) / 7.5));
    const parte = linhasCompl.slice(feitas, feitas + cabem);
    const h = Math.max(60, 12 + Math.max(parte.length, feitas === 0 ? linhasFisco.length : 0) * 7.5);
    d.campo(M, d.t, wCompl, h, 'Informações complementares', '');
    parte.forEach((l, i) => d.texto(l, M + 3, d.t + 14 + i * 7.5, 6.3));
    d.campo(M + wCompl, d.t, W - wCompl, h, 'Reservado ao fisco', '');
    if (feitas === 0) linhasFisco.forEach((l, i) => d.texto(l, M + wCompl + 3, d.t + 14 + i * 7.5, 6.3));
    d.t += h;
    feitas += Math.max(parte.length, 1);
  }

  // numeração das folhas e rodapé
  folhas.forEach((fl, i) => {
    fl.page.drawText(`Folha ${i + 1}/${folhas.length}`, {
      x: fl.x + (fl.w - d.fi.widthOfTextAtSize(`Folha ${i + 1}/${folhas.length}`, 7)) / 2,
      y: A4.h - fl.topo,
      size: 7,
      font: d.fi,
      color: PRETO,
    });
    fl.page.drawText('DANFE gerado pelo Natuhair Finanças a partir do XML autorizado.', {
      x: M,
      y: M - 6,
      size: 5.5,
      font: d.f,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  return pdf.save();
}

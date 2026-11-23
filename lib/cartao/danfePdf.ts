import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { lerXml } from './sefaz';

/**
 * DANFE em PDF no mesmo layout do ORGM (que imprime com o DanfeSharp), gerado no servidor a
 * partir do XML autorizado: canhoto, emitente, quadro DANFE, código de barras da chave,
 * destinatário, fatura, cálculo do imposto (com IBS/CBS), transportador, produtos e, no pé da
 * 1ª folha, os dados adicionais montados como o ORGM monta:
 *   "Inf. Contribuinte: <infCpl> Pedido: <xPed>" + "Valor Aproximado dos Tributos: R$ <vTotTrib>".
 * Fonte Times (padrão do PDF, WinAnsi): caracteres fora dessa tabela viram equivalentes simples.
 * Conferido com o DANFE da NF 38024 (ROMA) baixado do ORGM.
 */

type No = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0);
const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const decimal = (v: unknown, casas = 2, max = casas) =>
  num(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: max });
/** valor só quando o campo existe no XML (o ORGM deixa a célula vazia quando não há) */
const decimalSe = (v: unknown, casas = 2) => (v == null || v === '' ? '' : decimal(v, casas));
const FUSO = 'America/Sao_Paulo';
const data = (v: unknown) => (v ? new Date(txt(v)).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '');
const hora = (v: unknown) => (v ? new Date(txt(v)).toLocaleTimeString('pt-BR', { timeZone: FUSO }) : '');
const dataDia = (v: unknown) => (v ? txt(v).slice(0, 10).split('-').reverse().join('/') : '');

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
function fone(v: unknown) {
  const s = txt(v).replace(/\D/g, '');
  if (s.length === 10) return s.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  if (s.length === 11) return s.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return txt(v);
}
const numeroNota = (v: unknown) => txt(v).padStart(9, '0').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3');
const cfop = (v: unknown) => txt(v).replace(/^(\d)(\d{3})$/, '$1.$2');

const MOD_FRETE: Record<string, string> = {
  '0': '0-Por conta Remetente',
  '1': '1-Por conta Destinatário',
  '2': '2-Por conta Terceiros',
  '3': '3-Próprio Remetente',
  '4': '4-Próprio Destinatário',
  '9': '9-Sem Transporte',
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
const H = 16; // altura das linhas de campos

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
  /** quebra mantendo as quebras de linha do texto */
  paragrafos(s: string, tamanho: number, largura: number, fonte = this.f) {
    return s
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .flatMap((l) => this.quebrar(l, tamanho, largura, fonte));
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
      thickness: tracejada ? 0.4 : LINHA,
      color: PRETO,
      dashArray: tracejada ? [2.5, 2] : undefined,
    });
  }
  /** campo: caixa com rótulo pequeno em cima e o valor embaixo, em negrito */
  campo(x: number, topo: number, w: number, h: number, rotulo: string, valor: string, alinhar: Alinhamento = 'esq', tamanho = 9.5) {
    this.caixa(x, topo, w, h);
    this.texto(rotulo.toUpperCase(), x + 1.5, topo + 5.6, 5.2, this.f, w - 3);
    if (valor) this.texto(valor, x + 2, topo + h - 2.5, tamanho, this.fb, w - 4, alinhar);
  }
  /** linha de campos com larguras proporcionais ao peso, ocupando a largura útil */
  linhaCampos(campos: { r: string; v: string; p: number; a?: Alinhamento }[], h = H, tamanho = 9.5) {
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
    this.texto(s.toUpperCase(), M, this.t + 6.8, 6.8, this.f);
    this.t += 8;
  }
}

/** Texto de "Informações complementares" como o ORGM (DanfeSharp) monta. */
function textoAdicional(inf: Record<string, No>, ide: No, dest: No, tot: No): string {
  const infAdic = (inf.infAdic ?? {}) as No;
  const compra = (inf.compra ?? {}) as No;
  const partes: string[] = [];
  const add = (chave: string, valor: string) => partes.push(`${chave}: ${valor}`);
  const infCpl = txt(infAdic.infCpl).trim();
  if (infCpl) add('Inf. Contribuinte', infCpl.replace(/;/g, '\n'));
  if (txt(dest.email).trim()) add('Email do Destinatário', txt(dest.email).trim());
  if (txt(infAdic.infAdFisco).trim()) add('Inf. fisco', txt(infAdic.infAdFisco).trim());
  const pedido = txt(compra.xPed).trim();
  if (pedido) {
    const jaTem = new RegExp(`Pedido\\s*:?\\s*${pedido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(infCpl);
    if (!jaTem) add('Pedido', pedido);
  }
  if (txt(compra.xCont).trim()) add('Contrato Nº', txt(compra.xCont).trim());
  if (txt(compra.xNEmp).trim()) add('Nota de Empenho', txt(compra.xNEmp).trim());
  for (const ref of lista(ide.NFref as No | No[] | undefined)) {
    if (ref.refNFe) partes.push(`refNFe: ${txt(ref.refNFe).replace(/(\d{4})(?=\d)/g, '$1 ')}`);
  }
  let texto = partes.join(' ');
  if (tot.vTotTrib != null) texto += `\nValor Aproximado dos Tributos: R$ ${decimal(tot.vTotTrib)}`;
  return texto;
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
  const total = (inf.total ?? {}) as No;
  const tot = (total.ICMSTot ?? {}) as No;
  const ibsCbs = (total.IBSCBSTot ?? null) as No | null;
  const transp = (inf.transp ?? {}) as No;
  const transporta = (transp.transporta ?? {}) as No;
  const veiculo = (transp.veicTransp ?? {}) as No;
  const volumes = lista(transp.vol as No | No[]);
  const duplicatas = lista(((inf.cobr as No | undefined)?.dup ?? undefined) as No | No[] | undefined);
  const itens = (inf.det ?? []) as unknown as { '@nItem': string; prod: No; imposto?: No; infAdProd?: string }[];
  const emissao = ide.dhEmi ?? ide.dEmi;
  const saida = ide.dhSaiEnt ?? ide.dSaiEnt;
  const chaveFmt = chave.replace(/(\d{4})(?=\d)/g, '$1 ');
  const nNF = numeroNota(ide.nNF);
  const serie = txt(ide.serie).replace(/^0+(?=\d)/, '');

  const pdf = await PDFDocument.create();
  pdf.setTitle(`NF-e ${txt(ide.nNF)} - ${limpar(txt(emit.xNome))}`);
  pdf.setProducer('Natuhair');
  const d = new Folha(
    pdf,
    await pdf.embedFont(StandardFonts.TimesRoman),
    await pdf.embedFont(StandardFonts.TimesRomanBold),
    await pdf.embedFont(StandardFonts.TimesRomanItalic)
  );
  const folhas: { page: PDFPage; x: number; topo: number; w: number }[] = [];

  // ── canhoto (só na 1ª folha) ──
  const canhoto = () => {
    const wNf = 95;
    const wTexto = W - wNf;
    const h = 48;
    d.caixa(M, d.t, wTexto, 26);
    const l1 = `Recebemos de ${txt(emit.xNome)} os produtos e/ou serviços constantes na Nota Fiscal Eletrônica indicada abaixo.`;
    const l2 = `Emissão: ${data(emissao)} Valor Total: R$ ${decimal(tot.vNF)} Destinatário: ${txt(dest.xNome)}`;
    [...d.quebrar(l1, 7.8, wTexto - 6), ...d.quebrar(l2, 7.8, wTexto - 6)]
      .slice(0, 3)
      .forEach((l, i) => d.texto(l, M + 3, d.t + 8 + i * 8, 7.8));
    d.campo(M, d.t + 26, wTexto / 2, h - 26, 'Data de recebimento', '');
    d.campo(M + wTexto / 2, d.t + 26, wTexto / 2, h - 26, 'Identificação e assinatura do recebedor', '');
    const xN = M + wTexto;
    d.caixa(xN, d.t, wNf, h);
    d.texto('NF-e', xN, d.t + 15, 14, d.fb, wNf, 'centro');
    d.texto(`Nº.: ${nNF}`, xN, d.t + 31, 10, d.fb, wNf, 'centro');
    d.texto(`Série: ${serie}`, xN, d.t + 42, 10, d.fb, wNf, 'centro');
    d.t += h + 5;
    d.linha(M, d.t, M + W, d.t, true);
    d.t += 7;
  };

  // ── quadro do emitente, DANFE e chave (repete em todas as folhas) ──
  const cabecalho = () => {
    const h = 80;
    const wEmit = 223;
    const wDanfe = 86;
    const xDanfe = M + wEmit;
    const xChave = xDanfe + wDanfe;
    const wChave = W - wEmit - wDanfe;
    const topo = d.t;

    // emitente
    d.caixa(M, topo, wEmit, h);
    d.texto('IDENTIFICAÇÃO DO EMITENTE', M, topo + 6.5, 5.5, d.f, wEmit, 'centro');
    // nome numa linha só (como o ORGM), diminuindo a fonte até 8,5; se não couber, quebra
    let tamNome = 10.5;
    while (tamNome > 8.5 && d.fb.widthOfTextAtSize(limpar(txt(emit.xNome)), tamNome) > wEmit - 8) tamNome -= 0.25;
    const nome = d.quebrar(txt(emit.xNome), tamNome, wEmit - 8, d.fb).slice(0, 2);
    let ty = topo + 32 - (nome.length - 1) * 5.5;
    for (const l of nome) {
      d.texto(l, M + 4, ty, tamNome, d.fb, wEmit - 8, 'centro');
      ty += tamNome;
    }
    const linha1 = `${[txt(ender.xLgr), txt(ender.nro)].filter(Boolean).join(', ')}${ender.xCpl ? ` - ${txt(ender.xCpl)}` : ''}`;
    const linha2 = [txt(ender.xBairro), ender.CEP ? `CEP: ${cep(ender.CEP)}` : ''].filter(Boolean).join(' - ');
    const linha3 = `${[txt(ender.xMun), txt(ender.UF)].filter(Boolean).join(' - ')}${ender.fone ? ` Fone: ${fone(ender.fone)}` : ''}`;
    [linha1, linha2, linha3]
      .filter(Boolean)
      .forEach((l, i) => d.texto(l, M + 4, ty - 2 + i * 7.6, 7.6, d.f, wEmit - 8, 'centro'));

    // quadro DANFE
    d.caixa(xDanfe, topo, wDanfe, h);
    d.texto('DANFE', xDanfe, topo + 11, 12, d.fb, wDanfe, 'centro');
    d.texto('Documento Auxiliar da', xDanfe + 3, topo + 19.5, 7.4, d.f, wDanfe - 6, 'centro');
    d.texto('Nota Fiscal Eletrônica', xDanfe + 3, topo + 27, 7.4, d.f, wDanfe - 6, 'centro');
    d.texto('0 - ENTRADA', xDanfe + 4, topo + 36, 7);
    d.texto('1 - SAÍDA', xDanfe + 4, topo + 44, 7);
    d.caixa(xDanfe + 60, topo + 32, 11, 12);
    d.texto(txt(ide.tpNF), xDanfe + 60, topo + 41.5, 9, d.fb, 11, 'centro');
    d.texto(`Nº.: ${nNF}`, xDanfe + 2, topo + 56, 9, d.fb, wDanfe - 4, 'centro');
    d.texto(`Série: ${serie}`, xDanfe, topo + 66, 9, d.fb, wDanfe, 'centro');
    folhas.push({ page: d.page, x: xDanfe, topo: topo + 75.5, w: wDanfe });

    // código de barras, chave e consulta
    const barras = code128c(chave);
    const modulos = barras.reduce((s, b) => s + b, 0);
    const modulo = (wChave - 20) / modulos;
    let bx = xChave + 10;
    barras.forEach((largura, i) => {
      if (i % 2 === 0) d.page.drawRectangle({ x: bx, y: A4.h - topo - 33, width: largura * modulo, height: 29, color: PRETO });
      bx += largura * modulo;
    });
    d.campo(xChave, topo + 36, wChave, 17, 'Chave de acesso', chaveFmt, 'centro', 9.5);
    d.caixa(xChave, topo + 53, wChave, h - 53);
    d.texto('Consulta de autenticidade no portal nacional da NF-e', xChave + 3, topo + 63, 8.4, d.f, wChave - 6, 'centro');
    d.texto('www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora', xChave + 3, topo + 72.5, 8.4, d.f, wChave - 6, 'centro');
    d.t += h;

    // natureza da operação / protocolo
    const wNat = wEmit + wDanfe;
    d.campo(M, d.t, wNat, H, 'Natureza da operação', txt(ide.natOp));
    d.campo(
      M + wNat,
      d.t,
      W - wNat,
      H,
      'Protocolo de autorização',
      prot.nProt ? `${txt(prot.nProt)} - ${data(prot.dhRecbto)} ${hora(prot.dhRecbto)}` : '',
      'centro'
    );
    d.t += H;
    d.linhaCampos([
      { r: 'Inscrição estadual', v: txt(emit.IE), p: 3.1, a: 'centro' },
      { r: 'Inscrição estadual do subst. tributário', v: txt(emit.IEST), p: 2.95, a: 'centro' },
      { r: 'CNPJ', v: cnpjCpf(emit.CNPJ ?? emit.CPF), p: 3.1, a: 'centro' },
    ]);
  };

  d.nova();
  canhoto();
  cabecalho();

  // ── destinatário / remetente ──
  d.titulo('Destinatário / Remetente');
  d.linhaCampos([
    { r: 'Razão social', v: txt(dest.xNome), p: 530 },
    { r: 'CNPJ / CPF', v: cnpjCpf(dest.CNPJ ?? dest.CPF ?? dest.idEstrangeiro), p: 225, a: 'dir' },
    { r: 'Data de emissão', v: data(emissao), p: 145, a: 'centro' },
  ]);
  d.linhaCampos([
    {
      r: 'Endereço',
      v: `${[txt(enderDest.xLgr), txt(enderDest.nro)].filter(Boolean).join(', ')}${enderDest.xCpl ? ` - ${txt(enderDest.xCpl)}` : ''}`,
      p: 415,
    },
    { r: 'Bairro / distrito', v: txt(enderDest.xBairro), p: 190 },
    { r: 'CEP', v: cep(enderDest.CEP), p: 150, a: 'centro' },
    { r: 'Data entrada / saída', v: data(saida), p: 145, a: 'centro' },
  ]);
  d.linhaCampos([
    { r: 'Município', v: txt(enderDest.xMun), p: 290 },
    { r: 'Fone / fax', v: enderDest.fone ? fone(enderDest.fone) : '', p: 155, a: 'dir' },
    { r: 'UF', v: txt(enderDest.UF), p: 30, a: 'centro' },
    { r: 'Inscrição estadual', v: txt(dest.IE), p: 280, a: 'centro' },
    { r: 'Hora entrada / saída', v: hora(saida), p: 145, a: 'centro' },
  ]);

  // ── fatura / duplicatas ──
  if (duplicatas.length) {
    d.titulo('Fatura / Duplicata');
    const porLinha = 9;
    const wDup = W / porLinha;
    const linhas = Math.ceil(duplicatas.length / porLinha);
    const hLinha = 24;
    d.caixa(M, d.t, W, linhas * hLinha);
    duplicatas.forEach((dup, i) => {
      const x = M + (i % porLinha) * wDup;
      const y = d.t + Math.floor(i / porLinha) * hLinha;
      const par = (rotulo: string, valor: string, yy: number) => {
        d.texto(rotulo, x + 2, yy, 5.8);
        d.texto(valor, x + 2 + d.f.widthOfTextAtSize(rotulo, 5.8) + 2, yy, 6.2, d.fb, wDup - 6 - d.f.widthOfTextAtSize(rotulo, 5.8) - 2, 'dir');
      };
      par('Número', txt(dup.nDup), y + 7);
      par('Vencimento:', dataDia(dup.dVenc), y + 14.5);
      par('Valor:', `R$ ${decimal(dup.vDup)}`, y + 22);
    });
    d.t += linhas * hLinha;
  }

  // ── cálculo do imposto ──
  d.titulo('Cálculo do imposto');
  const v = (r: string, x: unknown) => ({ r, v: decimal(x), p: 1, a: 'dir' as Alinhamento });
  d.linhaCampos([
    v('Base de cálc. do ICMS', tot.vBC),
    v('Valor do ICMS', tot.vICMS),
    v('Base de cálc. ICMS S.T.', tot.vBCST),
    v('Valor do ICMS subst.', tot.vST),
    v('V. imp. importação', tot.vII),
    v('V. ICMS UF remet.', tot.vICMSUFRemet),
    v('Valor do FCP', tot.vFCP),
    v('Valor do PIS', tot.vPIS),
    v('V. total produtos', tot.vProd),
  ]);
  d.linhaCampos([
    v('Valor do frete', tot.vFrete),
    v('Valor do seguro', tot.vSeg),
    v('Desconto', tot.vDesc),
    v('Outras despesas', tot.vOutro),
    v('Valor IPI', tot.vIPI),
    v('V. ICMS UF dest.', tot.vICMSUFDest),
    v('V. tot. trib.', tot.vTotTrib),
    v('Valor do COFINS', tot.vCOFINS),
    v('Valor total da nota', tot.vNF),
  ]);
  if (ibsCbs) {
    const gIBS = (ibsCbs.gIBS ?? {}) as No;
    d.linhaCampos([
      v('Base de cálc. IBS/CBS', ibsCbs.vBCIBSCBS),
      v('Valor IBS UF', ((gIBS.gIBSUF ?? {}) as No).vIBSUF),
      v('Valor IBS mun.', ((gIBS.gIBSMun ?? {}) as No).vIBSMun),
      v('Valor CBS', ((ibsCbs.gCBS ?? {}) as No).vCBS),
    ]);
  }

  // ── transportador / volumes ──
  d.titulo('Transportador / Volumes transportados');
  d.linhaCampos([
    { r: 'Razão social', v: txt(transporta.xNome), p: 370 },
    { r: 'Frete', v: MOD_FRETE[txt(transp.modFrete)] ?? txt(transp.modFrete), p: 115 },
    { r: 'Código ANTT', v: txt(veiculo.RNTC), p: 120 },
    { r: 'Placa do veículo', v: txt(veiculo.placa), p: 115 },
    { r: 'UF', v: txt(veiculo.UF), p: 30, a: 'centro' },
    { r: 'CNPJ / CPF', v: cnpjCpf(transporta.CNPJ ?? transporta.CPF), p: 150, a: 'dir' },
  ]);
  d.linhaCampos([
    { r: 'Endereço', v: txt(transporta.xEnder), p: 485 },
    { r: 'Município', v: txt(transporta.xMun), p: 235 },
    { r: 'UF', v: txt(transporta.UF), p: 30, a: 'centro' },
    { r: 'Inscrição estadual', v: txt(transporta.IE), p: 150, a: 'dir' },
  ]);
  const somaVol = (campo: string) => volumes.reduce((s, x) => s + num(x[campo]), 0);
  const primeiroVol = (campo: string) => txt(volumes.find((x) => x[campo])?.[campo]);
  d.linhaCampos([
    { r: 'Quantidade', v: volumes.length ? decimal(somaVol('qVol'), 3) : '', p: 70, a: 'dir' },
    { r: 'Espécie', v: primeiroVol('esp'), p: 205 },
    { r: 'Marca', v: primeiroVol('marca'), p: 210 },
    { r: 'Numeração', v: primeiroVol('nVol'), p: 120 },
    { r: 'Peso bruto', v: volumes.length ? decimal(somaVol('pesoB'), 3) : '', p: 145, a: 'dir' },
    { r: 'Peso líquido', v: volumes.length ? decimal(somaVol('pesoL'), 3) : '', p: 150, a: 'dir' },
  ]);

  // ── dados adicionais (pé da 1ª folha) ──
  const adicional = textoAdicional(inf, ide, dest, tot);
  const wCompl = (W * 620) / 900;
  const linhasCompl = d.paragrafos(adicional, 8, wCompl - 6);
  const hAdic = Math.max(92, 12 + linhasCompl.length * 8.6);
  const fundoFolha1 = A4.h - M - 10 - hAdic - 8; // 8 = título "DADOS ADICIONAIS"
  const fundoOutras = A4.h - M - 10;

  // ── produtos ──
  const cols = [
    { t: 'Código produto', w: 75 },
    { t: 'Descrição do produto / serviço', w: 333 },
    { t: 'NCM/SH', w: 45 },
    { t: 'O/CST', w: 33 },
    { t: 'CFOP', w: 30 },
    { t: 'UN', w: 24 },
    { t: 'Quanti.', w: 53, dir: true },
    { t: 'Valor unit.', w: 55, dir: true },
    { t: 'Valor total', w: 55, dir: true },
    { t: 'B cálc ICMS', w: 55, dir: true },
    { t: 'Valor ICMS', w: 50, dir: true },
    { t: 'Valor IPI', w: 32, dir: true },
    { t: 'Aliq. ICMS', w: 30, dir: true },
    { t: 'Aliq. IPI', w: 30, dir: true },
  ].map((c) => ({ ...c, w: (c.w * W) / 900 }));
  const colX = cols.reduce<number[]>((xs, c, i) => [...xs, i === 0 ? M : xs[i - 1] + cols[i - 1].w], []);
  const wDesc = cols[1].w - 4;

  let inicioTabela = 0;
  let fundoTabela = fundoFolha1;
  const cabecalhoProdutos = (fundo: number) => {
    d.titulo('Dados dos produtos / serviços');
    inicioTabela = d.t;
    fundoTabela = fundo;
    d.caixa(M, d.t, W, 16);
    cols.forEach((c, i) => {
      const linhas = d.quebrar(c.t.toUpperCase(), 5.4, c.w - 2);
      linhas.slice(0, 2).forEach((l, j) => d.texto(l, colX[i] + 1, d.t + (linhas.length > 1 ? 6.5 : 9.5) + j * 6, 5.4, d.f, c.w - 2, 'centro'));
    });
    d.t += 16;
  };
  const fecharTabela = () => {
    d.caixa(M, inicioTabela, W, fundoTabela - inicioTabela);
    for (const x of colX.slice(1)) d.linha(x, inicioTabela, x, fundoTabela);
  };

  cabecalhoProdutos(fundoFolha1);
  itens.forEach((it, n) => {
    const p = it.prod ?? {};
    const imposto = (it.imposto ?? {}) as No;
    const icms = (Object.values((imposto.ICMS ?? {}) as No)[0] ?? {}) as No;
    const ipi = (((imposto.IPI ?? {}) as No).IPITrib ?? null) as No | null;
    const linhasDesc = d.quebrar(txt(p.xProd), 6.2, wDesc);
    const linhasAd = it.infAdProd ? d.paragrafos(txt(it.infAdProd), 5.2, wDesc) : [];
    const h = 2 + linhasDesc.length * 6.4 + linhasAd.length * 5.4 + 1.8;
    if (d.t + h > fundoTabela) {
      fecharTabela();
      d.nova();
      cabecalho();
      cabecalhoProdutos(fundoOutras);
    }
    const valores = [
      txt(p.cProd),
      '',
      txt(p.NCM),
      `${txt(icms.orig)}${txt(icms.CST ?? icms.CSOSN)}`,
      cfop(p.CFOP),
      txt(p.uCom),
      decimal(p.qCom, 2, 4),
      decimal(p.vUnCom, 2, 4),
      decimal(p.vProd),
      decimalSe(icms.vBC),
      decimalSe(icms.vICMS),
      ipi ? decimalSe(ipi.vIPI) : '',
      decimalSe(icms.pICMS),
      ipi ? decimalSe(ipi.pIPI) : '',
    ];
    cols.forEach((c, i) => {
      if (i === 1) {
        linhasDesc.forEach((l, j) => d.texto(l, colX[i] + 2, d.t + 6.6 + j * 6.4, 6.2));
        linhasAd.forEach((l, j) => d.texto(l, colX[i] + 2, d.t + 6.6 + linhasDesc.length * 6.4 + j * 5.4 - 0.8, 5.2));
      } else {
        d.texto(valores[i], colX[i] + 1.5, d.t + 6.6, 6.2, d.f, c.w - 3, c.dir ? 'dir' : 'centro');
      }
    });
    d.t += h;
    if (n < itens.length - 1 && d.t < fundoTabela) d.linha(M, d.t, M + W, d.t, true);
  });
  fecharTabela();

  // dados adicionais no pé da 1ª folha
  const pag1 = pdf.getPage(0);
  const atual = d.page;
  d.page = pag1;
  d.t = fundoFolha1 + 2;
  d.titulo('Dados adicionais');
  d.campo(M, d.t, wCompl, hAdic, 'Informações complementares', '');
  linhasCompl.forEach((l, i) => d.texto(l, M + 2, d.t + 13 + i * 8.6, 8));
  d.campo(M + wCompl, d.t, W - wCompl, hAdic, 'Reservado ao fisco', '');
  d.page = atual;

  // numeração das folhas
  folhas.forEach((fl, i) => {
    const s = `Folha ${i + 1}/${folhas.length}`;
    fl.page.drawText(s, { x: fl.x + (fl.w - d.fb.widthOfTextAtSize(s, 9)) / 2, y: A4.h - fl.topo, size: 9, font: d.fb, color: PRETO });
  });

  return pdf.save();
}

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { Conciliado, ResultadoConciliacao } from './tipos';

/**
 * Relatório da conciliação em PDF (A4 deitado): resumo, cada repasse da planilha
 * ao lado do crédito encontrado no extrato, os não encontrados com o que pode
 * ser, os créditos de marketplace do extrato que não estão na planilha e o
 * total por dia que vai para o Fluxo Financeiro.
 */

const L = 841.89;
const A = 595.28;
const M = 24;
const W = L - 2 * M;
const PRETO = rgb(0.1, 0.1, 0.12);
const CINZA = rgb(0.42, 0.45, 0.5);
const LINHA = rgb(0.85, 0.87, 0.9);
const AZUL = rgb(0.15, 0.39, 0.92);
const FUNDO_AZUL = rgb(0.93, 0.95, 1);
const VERDE = rgb(0.08, 0.5, 0.24);
const FUNDO_VERDE = rgb(0.9, 0.97, 0.92);
const VERMELHO = rgb(0.75, 0.1, 0.1);
const FUNDO_VERMELHO = rgb(0.99, 0.92, 0.92);
const AMBAR = rgb(0.65, 0.4, 0.02);
const FUNDO_AMBAR = rgb(1, 0.96, 0.86);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const moeda = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const curtaEmpresa = (empresa: string, conta: string) => `${empresa.split(' ')[0]} ${conta.slice(-4)}`;
const limpar = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

type Col = { t: string; w: number; dir?: boolean };

class Relatorio {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private f: PDFFont,
    private fb: PDFFont,
    private titulo: string
  ) {
    this.nova();
  }
  nova() {
    this.page = this.doc.addPage([L, A]);
    this.y = A - M;
    this.texto(this.titulo, M, this.y - 10, 8, this.fb, CINZA);
    this.y -= 18;
  }
  garantir(h: number) {
    if (this.y - h < M + 14) this.nova();
  }
  caber(s: string, tam: number, w: number, fonte = this.f) {
    let t = limpar(s);
    if (fonte.widthOfTextAtSize(t, tam) <= w) return t;
    while (t.length > 1 && fonte.widthOfTextAtSize(t + '...', tam) > w) t = t.slice(0, -1);
    return t + '...';
  }
  texto(s: string, x: number, y: number, tam: number, fonte = this.f, cor: RGB = PRETO, w?: number, dir = false) {
    const t = w ? this.caber(s, tam, w, fonte) : limpar(s);
    const xx = dir && w ? x + w - fonte.widthOfTextAtSize(t, tam) : x;
    this.page.drawText(t, { x: xx, y, size: tam, font: fonte, color: cor });
  }
  retangulo(x: number, y: number, w: number, h: number, cor: RGB) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: cor });
  }
  secao(s: string) {
    this.garantir(40);
    this.y -= 8;
    this.texto(s.toUpperCase(), M, this.y - 10, 10, this.fb, AZUL);
    this.y -= 16;
  }
  cabecalho(cols: Col[], grupos?: { t: string; de: number; ate: number; cor: RGB }[]) {
    if (grupos) {
      this.garantir(30);
      for (const g of grupos) {
        const x = M + cols.slice(0, g.de).reduce((s, c) => s + c.w, 0);
        const w = cols.slice(g.de, g.ate + 1).reduce((s, c) => s + c.w, 0);
        this.retangulo(x, this.y - 12, w - 2, 12, g.cor);
        this.texto(g.t, x + 4, this.y - 9, 7, this.fb, PRETO);
      }
      this.y -= 13;
    }
    this.garantir(16);
    this.retangulo(M, this.y - 13, W, 13, rgb(0.95, 0.96, 0.97));
    let x = M;
    for (const c of cols) {
      this.texto(c.t.toUpperCase(), x + 3, this.y - 9.5, 6.3, this.fb, CINZA, c.w - 6, c.dir);
      x += c.w;
    }
    this.y -= 14;
  }
  linha(cols: Col[], valores: string[], opts: { negrito?: boolean[]; cores?: (RGB | undefined)[]; fundo?: RGB } = {}) {
    const h = 12;
    this.garantir(h);
    if (opts.fundo) this.retangulo(M, this.y - h + 1, W, h, opts.fundo);
    let x = M;
    cols.forEach((c, i) => {
      this.texto(valores[i] ?? '', x + 3, this.y - 8.5, 7, opts.negrito?.[i] ? this.fb : this.f, opts.cores?.[i] ?? PRETO, c.w - 6, c.dir);
      x += c.w;
    });
    this.y -= h;
    this.page.drawLine({ start: { x: M, y: this.y + 0.5 }, end: { x: M + W, y: this.y + 0.5 }, thickness: 0.4, color: LINHA });
  }
}

export async function gerarRelatorioConciliacao(r: ResultadoConciliacao): Promise<Uint8Array> {
  const [ano, mes] = r.mes.split('-').map(Number);
  const nomeMes = `${MESES[mes - 1]} de ${ano}`;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Conciliação E-Commerce - ${nomeMes}`);
  pdf.setProducer('Natuhair Finanças');
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const d = new Relatorio(pdf, f, fb, `Natuhair Finanças - Conciliação E-Commerce - ${nomeMes}`);

  // ── cabeçalho e resumo ──
  d.texto(`Conciliação E-Commerce — ${nomeMes}`, M, d.y - 16, 17, fb);
  d.texto(
    `Período: ${br(r.inicio)} a ${br(r.fim)} (o que cai no dia 1º do mês seguinte entra no último dia útil do mês)   ·   Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    M,
    d.y - 30,
    8,
    f,
    CINZA
  );
  d.y -= 44;

  const naoAchados = r.conciliados.filter((c) => !c.banco);
  const cards: { t: string; v: string; cor: RGB; fundo: RGB }[] = [
    { t: 'Total da planilha', v: moeda(r.totais.planilha), cor: PRETO, fundo: rgb(0.96, 0.97, 0.98) },
    { t: `Conciliado (${r.conciliados.length - naoAchados.length} lançamentos)`, v: moeda(r.totais.conciliado), cor: VERDE, fundo: FUNDO_VERDE },
    { t: `Não encontrado (${naoAchados.length})`, v: moeda(r.totais.naoEncontrado), cor: naoAchados.length ? VERMELHO : VERDE, fundo: naoAchados.length ? FUNDO_VERMELHO : FUNDO_VERDE },
    {
      t: 'TOTAL DE ENTRADAS (CONSOLIDADO)',
      v: r.planilha.totalConsolidado != null ? moeda(r.planilha.totalConsolidado) : '—',
      cor: r.planilha.totalConsolidado != null && Math.abs(r.planilha.totalConsolidado - r.totais.planilha) > 0.01 ? AMBAR : PRETO,
      fundo: rgb(0.96, 0.97, 0.98),
    },
  ];
  const wCard = (W - 3 * 8) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (wCard + 8);
    d.retangulo(x, d.y - 40, wCard, 40, c.fundo);
    d.texto(c.t.toUpperCase(), x + 8, d.y - 13, 6.5, fb, CINZA, wCard - 16);
    d.texto(`R$ ${c.v}`, x + 8, d.y - 31, 13, fb, c.cor, wCard - 16);
  });
  d.y -= 50;

  d.texto('Extratos lidos:', M, d.y - 8, 7.5, fb);
  d.y -= 11;
  for (const e of r.extratos) {
    d.texto(`- ${e.arquivo} — ${e.banco} · ${e.empresa} · conta ${e.conta} · ${e.periodo} · ${e.lancamentos} lançamentos`, M + 6, d.y - 8, 7, f, CINZA);
    d.y -= 10;
  }
  d.texto(`Planilha: ${r.planilha.arquivo}`, M, d.y - 8, 7.5, fb);
  d.y -= 11;
  for (const a of r.planilha.avisos) {
    d.texto(`- ${a}`, M + 6, d.y - 8, 7, f, AMBAR);
    d.y -= 10;
  }

  // ── lado a lado, por canal ──
  d.secao('Planilha × extrato do banco');
  const cols: Col[] = [
    { t: 'Data', w: 48 },
    { t: 'Referência', w: 165 },
    { t: 'Valor', w: 62, dir: true },
    { t: 'Empresa / conta', w: 82 },
    { t: 'Data banco', w: 50 },
    { t: 'Histórico no extrato', w: 214 },
    { t: 'Valor', w: 62, dir: true },
    { t: 'Situação', w: W - 683 },
  ];
  // linha de subtotal do canal: o nome ocupa as colunas de data e referência
  const colsCanal: Col[] = [
    { t: '', w: cols[0].w + cols[1].w },
    cols[2],
    { t: '', w: cols[3].w + cols[4].w },
    cols[5],
    cols[6],
    cols[7],
  ];
  const grupos = [
    { t: 'PLANILHA DO MARKETPLACE', de: 0, ate: 2, cor: FUNDO_AZUL },
    { t: 'EXTRATO DO BANCO', de: 3, ate: 6, cor: rgb(0.95, 0.96, 0.97) },
    { t: 'CONFERÊNCIA', de: 7, ate: 7, cor: rgb(0.95, 0.96, 0.97) },
  ];
  const canais = Array.from(new Set(r.conciliados.map((c) => c.item.canal)));
  const situacao = (c: Conciliado): [string, RGB, RGB | undefined] => {
    if (!c.banco) return ['NÃO ACHADO', VERMELHO, FUNDO_VERMELHO];
    if (!c.diaFluxo) return ['OK - fora do período', AMBAR, FUNDO_AMBAR];
    if (c.diaFluxo !== c.banco.data) return [`OK - entra em ${br(c.diaFluxo).slice(0, 5)}`, VERDE, undefined];
    return ['OK - valor confere', VERDE, undefined];
  };
  d.cabecalho(cols, grupos);
  for (const canal of canais) {
    const lista = r.conciliados.filter((c) => c.item.canal === canal);
    const total = lista.reduce((s, c) => s + c.item.valor, 0);
    const achado = lista.filter((c) => c.banco).reduce((s, c) => s + c.item.valor, 0);
    const confere = Math.abs(total - achado) < 0.01;
    d.garantir(26);
    d.linha(
      colsCanal,
      [`${canal}  (${lista.length} lançamento(s))`, moeda(total), '', `conciliado no extrato`, moeda(achado), confere ? 'TUDO CONFERE' : `FALTA ${moeda(total - achado)}`],
      {
        negrito: [true, true, false, false, true, true],
        cores: [AZUL, PRETO, undefined, CINZA, PRETO, confere ? VERDE : VERMELHO],
        fundo: FUNDO_AZUL,
      }
    );
    for (const c of lista) {
      const [txt, cor, fundo] = situacao(c);
      d.linha(
        cols,
        [
          br(c.item.data),
          c.item.referencia,
          moeda(c.item.valor),
          c.banco ? curtaEmpresa(c.banco.empresa, c.banco.conta) : '',
          c.banco ? br(c.banco.data) : '',
          c.banco ? c.banco.historico : c.sugestoes.length ? 'veja "o que pode ser" abaixo' : 'nenhum crédito com esse valor no período',
          c.banco ? moeda(c.banco.valor) : '',
          txt,
        ],
        {
          cores: [undefined, undefined, undefined, undefined, undefined, c.banco ? PRETO : CINZA, undefined, cor],
          negrito: [false, false, false, false, false, false, false, true],
          fundo,
        }
      );
    }
    d.y -= 4;
  }

  // ── não encontrados ──
  d.secao(`Não encontrados no extrato (${naoAchados.length})`);
  if (!naoAchados.length) {
    d.texto('Todos os valores da planilha foram encontrados no extrato do banco.', M, d.y - 9, 8, f, VERDE);
    d.y -= 14;
  } else {
    const c2: Col[] = [
      { t: 'Canal', w: 110 },
      { t: 'Data', w: 50 },
      { t: 'Valor', w: 65, dir: true },
      { t: 'Referência', w: 160 },
      { t: 'O que pode ser (crédito parecido no extrato)', w: W - 385 },
    ];
    d.cabecalho(c2);
    for (const c of naoAchados) {
      const pode = c.sugestoes.length
        ? c.sugestoes
            .map((s) => `${br(s.banco.data).slice(0, 5)} ${curtaEmpresa(s.banco.empresa, s.banco.conta)} ${s.banco.historico.slice(0, 40)} R$ ${moeda(s.banco.valor)} (dif. ${moeda(s.diferenca)})`)
            .join('  |  ')
        : 'Nenhum crédito parecido. Pode ainda não ter caído, ter ido para outra conta/banco ou ter sido somado com outro repasse.';
      d.linha(c2, [c.item.canal, br(c.item.data), moeda(c.item.valor), c.item.referencia, pode], {
        cores: [undefined, undefined, VERMELHO, undefined, CINZA],
        fundo: FUNDO_VERMELHO,
      });
    }
  }

  // ── sobras no extrato ──
  d.secao(`No extrato, mas fora da planilha (${r.sobrasExtrato.length})`);
  d.texto(
    'Créditos do período que vieram de quem paga os marketplaces (mesmo CNPJ/maquininha), mas não estão na planilha. Os do dia 1º costumam ser do mês anterior ou do seguinte.',
    M,
    d.y - 8,
    7,
    f,
    CINZA
  );
  d.y -= 13;
  if (r.sobrasExtrato.length) {
    const c3: Col[] = [
      { t: 'Data', w: 50 },
      { t: 'Empresa / conta', w: 90 },
      { t: 'Histórico', w: 330 },
      { t: 'Valor', w: 70, dir: true },
      { t: 'Mesmo pagador de', w: W - 540 },
    ];
    d.cabecalho(c3);
    for (const s of r.sobrasExtrato) {
      d.linha(c3, [br(s.banco.data), curtaEmpresa(s.banco.empresa, s.banco.conta), s.banco.historico, moeda(s.banco.valor), s.provavelCanal], {
        fundo: FUNDO_AMBAR,
      });
    }
  }

  // ── por dia ──
  d.secao('Créditos E-commerce por dia (vai para o Fluxo Financeiro)');
  const c4: Col[] = [
    { t: 'Dia', w: 80 },
    { t: 'Lançamentos', w: 80, dir: true },
    { t: 'Valor', w: 100, dir: true },
  ];
  d.cabecalho(c4);
  for (const p of r.porDia) d.linha(c4, [br(p.dia), String(p.itens), moeda(p.valor)]);
  d.linha(c4, ['TOTAL', String(r.porDia.reduce((s, p) => s + p.itens, 0)), moeda(r.porDia.reduce((s, p) => s + p.valor, 0))], {
    negrito: [true, true, true],
    fundo: FUNDO_AZUL,
  });

  // numeração
  const paginas = pdf.getPages();
  paginas.forEach((p, i) =>
    p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: L - M - 60, y: M - 8, size: 7, font: f, color: CINZA })
  );
  return pdf.save();
}

import ExcelJS from 'exceljs';
import { calcular, soma, zeros, type CampoMensal } from '@/lib/gerencial/calculo';
import { carregarAno, hojeSP } from '@/lib/gerencial/carregar';
import { MESES, NOME_RUBRICA, RUBRICAS } from '@/lib/gerencial/rubricas';


/**
 * Excel no modelo da planilha do controle ("DG - Relatorio gerencial financeiro"): faturamento, recebimento e
 * cheque especial no topo; uma linha por rubrica com o valor e o % s/ faturamento de cada mês, o ano, % s/ fat.,
 * % s/ receb., média, projeção, parâmetro, custo parametrizado e "dentro ou fora"; total geral, variação e o
 * faturamento por tipo. Abas extras: Contas (conta contábil → rubrica, mês a mês) e Ajustes.
 */

const CINZA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
const CINZA_CLARO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const LARANJA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
const AMARELO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const AZUL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const fino: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDA: Partial<ExcelJS.Borders> = { top: fino, left: fino, bottom: fino, right: fino };
const NUM = '#,##0_ ;-#,##0 ';
const PCT = '0.0%';
const DENTRO = '"R$" #,##0;[Red]-"R$" #,##0';
const div = (a: number, b: number) => (b ? a / b : null);

export async function gerarExcelGerencial(ano: number): Promise<{ buf: ArrayBuffer; nome: string }> {
  const { hoje } = hojeSP();
  const [atual, anterior] = await Promise.all([carregarAno(ano), ano > 2023 ? carregarAno(ano - 1) : Promise.resolve(null)]);
  const c = calcular(atual);
  const ca = anterior ? calcular(anterior) : null;
  const aa = String(ano).slice(2);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Natuhair';
  wb.created = new Date();
  const ws = wb.addWorksheet(String(ano), { views: [{ state: 'frozen', xSplit: 2, ySplit: 9, zoomScale: 85 }] });

  // colunas: A cód | B nome | C ano anterior | D..AA mês (valor, %) | AB ano | AC s/fat | AD s/receb | AE média |
  // AF projeção | AG proj. × ano anterior | AH parâmetro | AI custo param. | AJ dentro/fora
  const colMes = (i: number) => 4 + i * 2;
  const C_ANO = 28;
  const ULT = 36;
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 52;
  ws.getColumn(3).width = 15;
  for (let i = 0; i < 12; i++) {
    ws.getColumn(colMes(i)).width = 14;
    ws.getColumn(colMes(i) + 1).width = 8;
  }
  [15, 9, 9, 14, 15, 11, 10, 15, 16].forEach((w, k) => (ws.getColumn(C_ANO + k).width = w));

  const estilo = (cel: ExcelJS.Cell, o: { fmt?: string; fill?: ExcelJS.Fill; bold?: boolean; center?: boolean; size?: number } = {}) => {
    cel.font = { name: 'Calibri', size: o.size ?? 11, bold: o.bold ?? true };
    if (o.fmt) cel.numFmt = o.fmt;
    if (o.fill) cel.fill = o.fill;
    cel.border = BORDA;
    cel.alignment = { vertical: 'middle', horizontal: o.center ? 'center' : undefined, wrapText: o.center };
  };
  const linhaMeses = (r: number, rotulo: string, v: number[], o: { fill?: ExcelJS.Fill; pct?: (i: number) => number | null; anterior?: number; media?: boolean } = {}) => {
    const row = ws.getRow(r);
    row.getCell(1).value = '';
    row.getCell(2).value = rotulo;
    estilo(row.getCell(1), { fill: o.fill });
    estilo(row.getCell(2), { fill: o.fill });
    row.getCell(3).value = o.anterior ?? null;
    estilo(row.getCell(3), { fmt: NUM, fill: o.fill });
    for (let i = 0; i < 12; i++) {
      const cv = row.getCell(colMes(i));
      cv.value = Math.abs(v[i]) > 0.005 ? Math.round(v[i] * 100) / 100 : null;
      estilo(cv, { fmt: NUM, fill: o.fill });
      const cp = row.getCell(colMes(i) + 1);
      cp.value = o.pct ? o.pct(i) : null;
      estilo(cp, { fmt: PCT, fill: o.fill, bold: false });
    }
    row.getCell(C_ANO).value = Math.round(soma(v) * 100) / 100;
    estilo(row.getCell(C_ANO), { fmt: NUM, fill: LARANJA });
    if (o.media) {
      row.getCell(C_ANO + 3).value = c.mediaLancada(v);
      estilo(row.getCell(C_ANO + 3), { fmt: NUM, fill: o.fill });
    }
    return row;
  };

  // título
  ws.mergeCells(1, 1, 1, ULT);
  ws.getCell(1, 1).value = `RELATÓRIO GERENCIAL FINANCEIRO - ANO ${ano}`;
  estilo(ws.getCell(1, 1), { fill: CINZA, size: 18, center: true });
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, ULT);
  ws.getCell(2, 1).value =
    `Despesas = valores pagos no mês (data do pagamento) no ORGM, por conta contábil, distribuídos nas rubricas do controle, com os ajustes lançados no sistema. ` +
    `Média e projeção usam os ${c.fechados.length} meses fechados; % s/ faturamento e s/ recebimento só os meses com esses valores lançados (${c.mesesFat.map((i) => MESES[i]).join(', ') || 'nenhum'}). Gerado em ${hoje.split('-').reverse().join('/')}.`;
  ws.getCell(2, 1).font = { name: 'Calibri', size: 10, italic: true };

  // topo: faturamento, recebimento, cheque especial
  const fatA = ca ? soma(ca.fat) : undefined;
  linhaMeses(3, 'FATURAMENTO (base do % s/ faturamento)', c.fat, { fill: AZUL, anterior: fatA, media: true, pct: (i) => (i > 0 && c.fat[i] && c.fat[i - 1] ? c.fat[i] / c.fat[i - 1] - 1 : null) });
  linhaMeses(4, 'RECEBIMENTO (mapa dos círculos)', c.receb, { fill: AZUL, anterior: ca ? soma(ca.receb) : undefined, media: true });
  linhaMeses(5, 'CHEQUE ESPECIAL', c.linhaMensal('cheque_especial'), { fill: AZUL, anterior: ca ? soma(ca.linhaMensal('cheque_especial')) : undefined });
  ws.getCell(3, colMes(0) + 1).note = 'Na linha do faturamento, a coluna % mostra a variação sobre o mês anterior.';

  // cabeçalho
  const H = 9;
  const cab = ws.getRow(H);
  cab.height = 34;
  const cabecalhos: [number, string, ExcelJS.Fill?][] = [
    [1, 'Cód. conta'],
    [2, 'Nomenclatura conta'],
    [3, String(ano - 1)],
    ...MESES.flatMap((m, i) => [
      [colMes(i), `DESPESAS ${m.toUpperCase()}/${aa}`],
      [colMes(i) + 1, '% FAT'],
    ] as [number, string][]),
    [C_ANO, String(ano), LARANJA],
    [C_ANO + 1, 'S/ FAT'],
    [C_ANO + 2, 'S/ RECEB'],
    [C_ANO + 3, 'MÉDIA'],
    [C_ANO + 4, `PROJEÇÃO ${ano}`],
    [C_ANO + 5, `PROJEÇÃO × ${ano - 1}`],
    [C_ANO + 6, 'PARÂMETRO S/ FAT'],
    [C_ANO + 7, 'CUSTO PARAMETRIZADO'],
    [C_ANO + 8, 'DENTRO DO PARÂMETRO OU FORA'],
  ];
  for (const [col, txt, fill] of cabecalhos) {
    cab.getCell(col).value = txt;
    estilo(cab.getCell(col), { fill: fill ?? CINZA, center: true });
  }

  // rubricas
  let r = H + 1;
  const anteriorDe = (cod: string) => (ca ? soma(ca.porRub.get(cod) ?? zeros()) : null);
  const linhaRubrica = (cod: string, nome: string, v: number[], p: number, fill?: ExcelJS.Fill) => {
    const row = ws.getRow(r++);
    row.getCell(1).value = cod;
    row.getCell(2).value = nome;
    estilo(row.getCell(1), { center: true, fill });
    estilo(row.getCell(2), { fill });
    const ant = cod ? anteriorDe(cod) : null;
    row.getCell(3).value = ant && Math.abs(ant) > 0.5 ? Math.round(ant * 100) / 100 : null;
    estilo(row.getCell(3), { fmt: NUM, fill });
    for (let i = 0; i < 12; i++) {
      const cv = row.getCell(colMes(i));
      cv.value = Math.abs(v[i]) > 0.005 ? Math.round(v[i] * 100) / 100 : null;
      estilo(cv, { fmt: NUM, fill });
      const cp = row.getCell(colMes(i) + 1);
      cp.value = Math.abs(v[i]) > 0.005 ? div(v[i], c.fat[i]) : null;
      estilo(cp, { fmt: PCT, bold: false, fill });
    }
    const totalAno = soma(v);
    const media = c.somaMeses(v) / c.nMeses;
    const custo = p * c.mediaReceb;
    const valores: [number, number | null, string][] = [
      [C_ANO, Math.round(totalAno * 100) / 100, NUM],
      [C_ANO + 1, c.pctFat(v), PCT],
      [C_ANO + 2, c.pctReceb(v), PCT],
      [C_ANO + 3, media, NUM],
      [C_ANO + 4, media * 12, NUM],
      [C_ANO + 5, ant ? media * 12 / ant - 1 : null, PCT],
      [C_ANO + 6, p || null, PCT],
      [C_ANO + 7, p ? custo : null, NUM],
      [C_ANO + 8, p ? custo - media : null, DENTRO],
    ];
    for (const [col, val, fmt] of valores) {
      row.getCell(col).value = val;
      estilo(row.getCell(col), { fmt, fill: col === C_ANO ? LARANJA : fill });
    }
    return row;
  };
  for (const rb of RUBRICAS) {
    const v = c.porRub.get(rb.cod) ?? zeros();
    const row = linhaRubrica(rb.cod, rb.nome, v, c.param(rb.cod));
    const aj = c.ajPorRub.get(rb.cod);
    if (aj && aj.some((x) => Math.abs(x) > 0.5)) {
      row.getCell(2).note = `Inclui ajustes manuais: ${aj
        .map((x, i) => (Math.abs(x) > 0.5 ? `${MESES[i]} ${x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''))
        .filter(Boolean)
        .join('; ')}`;
    }
  }
  if (c.semRubrica.length) linhaRubrica('', 'SEM CONTA CONTÁBIL (pagamentos ainda não classificados)', c.porRub.get('') ?? zeros(), 0, AMARELO);

  // total e variação
  const totRow = linhaRubrica('', 'TOTAL GERAL DESPESAS GERADAS', c.total, RUBRICAS.reduce((s, rb) => s + c.param(rb.cod), 0), CINZA);
  totRow.getCell(3).value = ca ? Math.round(soma(ca.total) * 100) / 100 : null;
  totRow.height = 22;
  {
    const row = ws.getRow(r++);
    row.getCell(2).value = 'VARIAÇÃO DO TOTAL SOBRE O MÊS ANTERIOR';
    estilo(row.getCell(2), { fill: CINZA_CLARO });
    for (let i = 1; i < 12; i++) {
      const cp = row.getCell(colMes(i) + 1);
      cp.value = c.total[i] && c.total[i - 1] ? c.total[i] / c.total[i - 1] - 1 : null;
      estilo(cp, { fmt: PCT, fill: CINZA_CLARO });
    }
  }
  linhaMeses(r++, 'RECEBIMENTO − DESPESAS', c.receb.map((x, i) => (x ? x - c.total[i] : 0)), { fill: CINZA_CLARO });

  // faturamento por tipo
  r += 2;
  const cabFat = ws.getRow(r++);
  cabFat.getCell(2).value = 'TIPO DE FATURAMENTO';
  estilo(cabFat.getCell(2), { fill: CINZA });
  cabFat.getCell(3).value = String(ano - 1);
  estilo(cabFat.getCell(3), { fill: CINZA, center: true });
  MESES.forEach((m, i) => {
    cabFat.getCell(colMes(i)).value = `${m.toUpperCase()}/${aa}`;
    estilo(cabFat.getCell(colMes(i)), { fill: CINZA, center: true });
    cabFat.getCell(colMes(i) + 1).value = 'VAR.';
    estilo(cabFat.getCell(colMes(i) + 1), { fill: CINZA, center: true });
  });
  cabFat.getCell(C_ANO).value = String(ano);
  estilo(cabFat.getCell(C_ANO), { fill: LARANJA, center: true });
  cabFat.getCell(C_ANO + 3).value = 'MÉDIA';
  estilo(cabFat.getCell(C_ANO + 3), { fill: CINZA, center: true });
  const tipos: [CampoMensal, string][] = [
    ['fat_off', 'FATURAMENTO NATUHAIR OFF'],
    ['fat_terceiros', 'FATURAMENTO NATUHAIR - TERCEIROS'],
    ['fat_ecommerce', 'FATURAMENTO E-COMMERCE'],
    ['fat_exportacao', 'FATURAMENTO EXPORTAÇÃO'],
  ];
  const somaTipos = zeros();
  for (const [campo, rotulo] of tipos) {
    const v = c.linhaMensal(campo);
    v.forEach((x, i) => (somaTipos[i] += x));
    linhaMeses(r++, rotulo, v, { anterior: ca ? soma(ca.linhaMensal(campo)) : undefined, media: true, pct: (i) => (i > 0 && v[i] && v[i - 1] ? v[i] / v[i - 1] - 1 : null) });
  }
  linhaMeses(r++, 'TOTAIS - FATURAMENTO MÊS POR CATEGORIA', somaTipos, {
    fill: CINZA,
    media: true,
    anterior: ca ? tipos.reduce((s, [campo]) => s + soma(ca.linhaMensal(campo)), 0) : undefined,
    pct: (i) => (i > 0 && somaTipos[i] && somaTipos[i - 1] ? somaTipos[i] / somaTipos[i - 1] - 1 : null),
  });

  // aba Contas
  const wc = wb.addWorksheet('Contas', { views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] });
  wc.columns = [
    { header: 'Cód. conta', width: 9 },
    { header: 'Conta contábil (relatório)', width: 38 },
    { header: 'Conta no ORGM', width: 15 },
    { header: 'Nome no ORGM', width: 44 },
    { header: 'Grupo (conta-pai)', width: 26 },
    ...MESES.map((m) => ({ header: `${m}/${aa}`, width: 13 })),
    { header: String(ano), width: 15 },
    { header: 'Trocada no sistema', width: 14 },
  ];
  wc.getRow(1).eachCell((cel) => estilo(cel, { fill: CINZA, center: true }));
  const rubs = [...RUBRICAS.map((x) => x.cod), ''];
  for (const cod of rubs) {
    const contas = Array.from(c.contasPorRub.get(cod)?.values() ?? []).sort((a, b) => soma(b.v) - soma(a.v));
    for (const ct of contas) {
      const row = wc.addRow([
        cod || '—',
        cod ? NOME_RUBRICA.get(cod) : 'SEM CONTA CONTÁBIL',
        ct.conta,
        ct.nome,
        ct.grupo,
        ...ct.v.map((x) => (Math.abs(x) > 0.005 ? Math.round(x * 100) / 100 : null)),
        Math.round(soma(ct.v) * 100) / 100,
        ct.trocada ? 'sim' : '',
      ]);
      row.eachCell({ includeEmpty: true }, (cel, col) => {
        estilo(cel, { bold: col === 18, fmt: col >= 6 && col <= 18 ? NUM : undefined, fill: cod ? undefined : AMARELO });
      });
    }
  }

  // aba Ajustes
  const wa = wb.addWorksheet('Ajustes', { views: [{ state: 'frozen', ySplit: 1 }] });
  wa.columns = [
    { header: 'Mês', width: 8 },
    { header: 'Sai da conta contábil', width: 44 },
    { header: 'Entra na conta contábil', width: 44 },
    { header: 'Valor', width: 15 },
    { header: 'Motivo', width: 60 },
    { header: 'Lançado por', width: 22 },
    { header: 'Em', width: 18 },
  ];
  wa.getRow(1).eachCell((cel) => estilo(cel, { fill: CINZA, center: true }));
  for (const a of atual.ajustes) {
    const row = wa.addRow([
      MESES[a.mes - 1],
      a.de_rubrica ? `${a.de_rubrica} ${NOME_RUBRICA.get(a.de_rubrica) ?? ''}` : '—',
      a.para_rubrica ? `${a.para_rubrica} ${NOME_RUBRICA.get(a.para_rubrica) ?? ''}` : '—',
      a.valor,
      a.descricao,
      a.criado_por ?? '',
      new Date(a.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ]);
    row.eachCell({ includeEmpty: true }, (cel, col) => estilo(cel, { bold: false, fmt: col === 4 ? '"R$" #,##0.00' : undefined }));
  }
  if (!atual.ajustes.length) wa.addRow(['', 'Nenhum ajuste lançado neste ano.']);

  const nome = `DG - Relatorio gerencial financeiro - ${ano}.xlsx`;
  return { buf: (await wb.xlsx.writeBuffer()) as ArrayBuffer, nome };
}

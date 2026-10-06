import JSZip from 'jszip';

/**
 * Preenche a coluna "Creditos Eccomerce" do Fluxo Financeiro com a soma de cada
 * dia. Mexe só nessas células, direto no XML da aba, para não perder nada do
 * arquivo (formatação, fórmulas, outras abas); as fórmulas recalculam ao abrir.
 * Dias com texto (SABADO, DOMINGO, FERIADO) e células com fórmula ficam como estão.
 */

const sem = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const desfazEntidades = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export interface FluxoPreenchido {
  arquivo: Uint8Array;
  aba: string;
  coluna: string;
  gravados: { dia: string; antes: number | null; depois: number }[];
}

export async function preencherFluxo(
  dados: ArrayBuffer,
  porDia: { dia: string; valor: number }[],
  inicio: string,
  fim: string
): Promise<FluxoPreenchido> {
  // 1) acha a aba, a coluna e as linhas de cada dia (com o ExcelJS, que entende datas)
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dados);
  let alvo: { aba: string; coluna: string; linhaCab: number } | null = null;
  for (const ws of wb.worksheets) {
    ws.eachRow((row, r) => {
      if (alvo) return;
      row.eachCell((cell) => {
        if (!alvo && typeof cell.value === 'string' && /creditos? e-?c+om+erce/.test(sem(cell.value))) {
          alvo = { aba: ws.name, coluna: cell.address.replace(/\d+/g, ''), linhaCab: r };
        }
      });
    });
    if (alvo) break;
  }
  if (!alvo) throw new Error('Não achei a coluna "Creditos Ecommerce" no Fluxo Financeiro.');
  const { aba, coluna, linhaCab } = alvo as { aba: string; coluna: string; linhaCab: number };

  const ws = wb.getWorksheet(aba)!;
  const linhaDoDia = new Map<string, number>();
  for (let r = linhaCab + 1; r <= ws.rowCount; r++) {
    let v = ws.getCell(`A${r}`).value as unknown;
    if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result;
    if (!(v instanceof Date)) continue;
    const dia = v.toISOString().slice(0, 10);
    if (dia >= inicio && dia < fim && !linhaDoDia.has(dia)) linhaDoDia.set(dia, r);
  }
  if (!linhaDoDia.size) throw new Error(`O Fluxo Financeiro não tem as datas de ${inicio.slice(5, 7)}/${inicio.slice(0, 4)} na coluna A.`);

  // 2) acha o XML da aba
  const zip = await JSZip.loadAsync(dados);
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const rid = Array.from(wbXml.matchAll(/<sheet\b[^>]*>/g))
    .map((m) => m[0])
    .find((tag) => desfazEntidades(tag.match(/name="([^"]*)"/)?.[1] ?? '') === aba)
    ?.match(/r:id="([^"]+)"/)?.[1];
  const alvoRel = Array.from(rels.matchAll(/<Relationship\b[^>]*>/g))
    .map((m) => m[0])
    .find((tag) => tag.includes(`Id="${rid}"`))
    ?.match(/Target="([^"]+)"/)?.[1];
  if (!alvoRel) throw new Error('Não consegui abrir a aba do Fluxo Financeiro.');
  const caminho = alvoRel.startsWith('/') ? alvoRel.slice(1) : `xl/${alvoRel}`;
  let xml = await zip.file(caminho)!.async('string');

  // 3) grava cada dia
  const valores = new Map(porDia.map((d) => [d.dia, d.valor]));
  const gravados: FluxoPreenchido['gravados'] = [];
  linhaDoDia.forEach((linha, dia) => {
    const ref = `${coluna}${linha}`;
    const re = new RegExp(`<c r="${ref}"((?:\\s+[a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>([\\s\\S]*?)</c>)`);
    const m = xml.match(re);
    if (!m) return;
    const atributos = m[1].replace(/\s+t="[^"]*"/, '');
    const conteudo = m[2] ?? '';
    if (/\bt="(s|str|inlineStr|b|e)"/.test(m[1]) || /<f[\s>]/.test(conteudo)) return; // texto ou fórmula
    const antes = /<v>([^<]*)<\/v>/.test(conteudo) ? Number(conteudo.match(/<v>([^<]*)<\/v>/)![1]) : null;
    const depois = Math.round((valores.get(dia) ?? 0) * 100) / 100;
    if (antes == null && !depois) return; // célula vazia e nada a lançar
    xml = xml.replace(re, `<c r="${ref}"${atributos}><v>${depois}</v></c>`);
    gravados.push({ dia, antes, depois });
  });
  zip.file(caminho, xml);

  let wbNovo = wbXml;
  if (!/fullCalcOnLoad/.test(wbNovo)) {
    wbNovo = /<calcPr\b/.test(wbNovo)
      ? wbNovo.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
      : wbNovo.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  }
  zip.file('xl/workbook.xml', wbNovo);

  const arquivo = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { arquivo, aba, coluna, gravados: gravados.sort((a, b) => a.dia.localeCompare(b.dia)) };
}

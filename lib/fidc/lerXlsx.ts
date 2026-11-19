import ExcelJS from 'exceljs';
import type { Grade, Valor } from './planilha';

/** Converte cada aba do .xlsx numa grade de valores simples (fórmula → resultado; célula mesclada só na principal). */
export async function lerAbasXlsx(dados: ArrayBuffer): Promise<{ nome: string; grade: Grade }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dados);
  const abas: { nome: string; grade: Grade }[] = [];
  wb.eachSheet((ws) => {
    const grade: Grade = [];
    const linhas = ws.rowCount;
    const colunas = Math.min(ws.columnCount, 40);
    for (let r = 1; r <= linhas; r++) {
      const row = ws.getRow(r);
      const linha: Valor[] = [];
      for (let c = 1; c <= colunas; c++) {
        const cell = row.getCell(c);
        linha.push(cell.isMerged && cell.master !== cell ? null : simples(cell.value));
      }
      grade.push(linha);
    }
    abas.push({ nome: ws.name, grade });
  });
  return abas;
}

function simples(v: ExcelJS.CellValue): Valor {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v;
  if (typeof v === 'boolean') return null;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
  if ('result' in o) {
    const r = o.result;
    return typeof r === 'string' || typeof r === 'number' || r instanceof Date ? r : null;
  }
  if (o.richText) return o.richText.map((t) => t.text).join('');
  if (typeof o.text === 'string') return o.text;
  return null;
}

import * as XLSX from 'xlsx';

export type LinhaPlanilha = Record<string, string | number | Date | null>;

/** Data yyyy-mm-dd como Date local, para o Excel mostrar como data (não texto). */
export function dataExcel(iso: string | null): Date | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Monta um .xlsx de uma aba e devolve a resposta HTTP de download. */
export function respostaExcel(linhas: LinhaPlanilha[], aba: string, arquivo: string): Response {
  const sheet = XLSX.utils.json_to_sheet(linhas, { cellDates: true, dateNF: 'dd/mm/yyyy' });

  // largura das colunas pelo maior conteúdo (limitada) e formato de moeda
  const colunas = Object.keys(linhas[0] ?? {});
  sheet['!cols'] = colunas.map((c) => ({
    wch: Math.min(60, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length)) + 2),
  }));
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  colunas.forEach((c, i) => {
    if (!/valor|diferen|parcela \(r\$\)/i.test(c)) return;
    for (let r = 1; r <= range.e.r; r++) {
      const cel = sheet[XLSX.utils.encode_cell({ r, c: i })];
      if (cel && typeof cel.v === 'number') cel.z = '"R$" #,##0.00';
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, aba.slice(0, 31));
  const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'no-store',
    },
  });
}

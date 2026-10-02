'use server';

import { revalidatePath } from 'next/cache';
import { requireDevolucoes } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// coluna da planilha exportada (1 = A) de cada campo da equipe; Q (17) traz a chave da NFD
const COLUNAS_IMPORTACAO: Record<string, number> = {
  motivo: 7,
  volta_fabrica: 8,
  retorno: 9,
  transportadora: 10,
  transportadora_debitada: 11,
  pagamento_cliente: 12,
  pagamento_feito: 13,
  status: 15,
  nf_fiscal: 16,
};

function textoDaCelula(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result != null) return textoDaCelula(o.result);
    return o.text ?? '';
  }
  return String(v);
}

export interface ImportacaoState {
  erro?: string;
  mensagem?: string;
}

/** Lê o Excel exportado (já preenchido pela equipe) e grava as respostas de cada NFD. */
export async function importarExcelDevolucoes(
  _prev: ImportacaoState | undefined,
  formData: FormData
): Promise<ImportacaoState> {
  const { userId } = await requireDevolucoes();
  const arquivo = formData.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione o Excel preenchido.' };

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    return { erro: 'Não consegui ler o arquivo. Use o Excel baixado em "Exportar Excel".' };
  }

  const registros = new Map<string, Record<string, string | null>>();
  for (const ws of wb.worksheets) {
    if (ws.name === 'Listas') continue;
    ws.eachRow((row, i) => {
      if (i < 3) return;
      const chave = textoDaCelula(row.getCell(17).value).replace(/\D/g, '');
      if (chave.length !== 44) return;
      const reg: Record<string, string | null> = { chave };
      for (const [campo, col] of Object.entries(COLUNAS_IMPORTACAO)) {
        const t = textoDaCelula(row.getCell(col).value).replace(/\s+/g, ' ').trim();
        reg[campo] = t ? t.toUpperCase().slice(0, 500) : null;
      }
      registros.set(chave, reg);
    });
  }
  if (!registros.size) {
    return { erro: 'Nenhuma linha reconhecida. O arquivo precisa ser o Excel baixado do sistema (ele traz a chave da NFD escondida).' };
  }

  const supabase = createClient();
  const agora = new Date().toISOString();
  const lista = Array.from(registros.values()).map((r) => ({ ...r, atualizado_por: userId, atualizado_em: agora }));
  for (let i = 0; i < lista.length; i += 200) {
    const { error } = await supabase.from('devolucoes_acompanhamento').upsert(lista.slice(i, i + 200), { onConflict: 'chave' });
    if (error) return { erro: `Erro ao gravar: ${error.message}` };
  }
  revalidatePath('/admin/nfe-recebidas');
  const preenchidas = Array.from(registros.values()).filter((r) => Object.keys(COLUNAS_IMPORTACAO).some((c) => r[c])).length;
  return { mensagem: `${lista.length} devolução(ões) atualizada(s) a partir do Excel (${preenchidas} com algum campo preenchido).` };
}

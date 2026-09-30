import { getDocumentProxy } from 'unpdf';

export class PdfSenhaError extends Error {
  constructor(public readonly senhaIncorreta: boolean) {
    super(senhaIncorreta ? 'Senha do PDF incorreta.' : 'O PDF é protegido por senha.');
  }
}

interface ItemTexto {
  str: string;
  x: number;
  y: number;
  largura: number;
}

/**
 * Extrai o texto do PDF reconstruindo as linhas visuais: os itens de texto
 * são agrupados pela coordenada vertical e ordenados da esquerda para a direita.
 * Muitos bancos (Bradesco, Santander, Caixa) protegem a fatura com senha,
 * normalmente parte do CPF do titular.
 */
export async function extrairLinhasPdf(dados: Uint8Array, senha?: string): Promise<string[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(dados, senha ? { password: senha } : {});
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') {
      throw new PdfSenhaError(Boolean(senha));
    }
    throw e;
  }

  const linhas: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const itens: ItemTexto[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      itens.push({ str: item.str, x: item.transform[4], y: item.transform[5], largura: item.width });
    }

    // agrupa por linha com tolerância de 3pt (itens da mesma linha podem ter
    // baseline ligeiramente diferente)
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos: ItemTexto[][] = [];
    for (const item of itens) {
      const grupo = grupos[grupos.length - 1];
      if (grupo && Math.abs(grupo[0].y - item.y) <= 3) grupo.push(item);
      else grupos.push([item]);
    }

    for (const grupo of grupos) {
      grupo.sort((a, b) => a.x - b.x);
      let linha = '';
      let fimAnterior: number | null = null;
      for (const item of grupo) {
        if (fimAnterior !== null) {
          // espaço visual grande vira separador duplo (colunas)
          linha += item.x - fimAnterior > 12 ? '   ' : item.x - fimAnterior > 1 ? ' ' : '';
        }
        linha += item.str;
        fimAnterior = item.x + item.largura;
      }
      linhas.push(linha.replace(/\s+$/, ''));
    }
  }
  await pdf.cleanup();
  return linhas;
}

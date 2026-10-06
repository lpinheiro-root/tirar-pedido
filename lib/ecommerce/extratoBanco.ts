import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtratoLido, LancamentoBanco } from './tipos';

/**
 * Lê o extrato em PDF do Santander Empresas ("Data / Histórico / Documento /
 * Valor / Saldo"). Cada lançamento começa com a data; o histórico pode continuar
 * na linha de baixo (ex.: "Cr Cob Bloq Comp Conf Recebimento" + "4271/002549735").
 * Outros bancos ainda não são reconhecidos.
 */

const DINHEIRO = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
const LANCAMENTO = new RegExp(String.raw`^(\d{2})\/(\d{2})\/(\d{4}) (.+?) (${DINHEIRO}) (${DINHEIRO})(?: (.*))?$`);
// fim da lista de lançamentos: quadro de saldos, rodapé, número de página
const FIM_DE_BLOCO = /^(Saldo|Posição|Entenda|[A-J] [–-] |Central de Atendimento|SAC|Ouvidoria|\d+\/\d+$|Data Histórico|Período)/;

const numero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

export async function lerExtratoPdf(arquivo: string, dados: Uint8Array, proximoId: () => number): Promise<ExtratoLido> {
  const pdf = await getDocumentProxy(dados);
  const { text } = await extractText(pdf, { mergePages: false });
  const linhas = (text as string[]).join('\n').split('\n').map((l) => l.trim()).filter(Boolean);

  if (!linhas.some((l) => /Santander/i.test(l))) {
    throw new Error(`${arquivo}: só o extrato do Santander Empresas é reconhecido por enquanto.`);
  }
  const cab = linhas.find((l) => /Agência:\s*\d+.*Conta:\s*\d+/.test(l)) ?? '';
  const [, empresa = '', agencia = '', conta = ''] = cab.match(/^(.*?)\s*Agência:\s*(\d+)\s*Conta:\s*(\d+)/) ?? [];
  const periodo = linhas.find((l) => /^Períodos?:/.test(l))?.match(/(\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4})/)?.[1] ?? '';

  // junta as continuações do histórico na linha do lançamento
  const blocos: string[] = [];
  let aberto = false;
  for (const linha of linhas) {
    if (/^\d{2}\/\d{2}\/\d{4} /.test(linha)) {
      blocos.push(linha);
      aberto = true;
    } else if (FIM_DE_BLOCO.test(linha)) {
      aberto = false;
    } else if (aberto) {
      blocos[blocos.length - 1] += ' ' + linha;
    }
  }

  const lancamentos: LancamentoBanco[] = [];
  for (const bloco of blocos) {
    const m = bloco.match(LANCAMENTO);
    if (!m) continue;
    const historico = [m[4], m[7]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    lancamentos.push({
      id: proximoId(),
      arquivo,
      empresa: empresa.trim(),
      conta,
      data: `${m[3]}-${m[2]}-${m[1]}`,
      historico,
      documento: historico.match(/\b(\d{14}|\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})\b/)?.[1]?.replace(/\D/g, '') ?? null,
      valor: numero(m[5]),
      saldo: numero(m[6]),
    });
  }
  if (!lancamentos.length) throw new Error(`${arquivo}: nenhum lançamento encontrado no extrato.`);

  return { arquivo, banco: 'Santander', empresa: empresa.trim(), agencia, conta, periodo, lancamentos };
}

/** Junta os extratos e tira lançamentos repetidos (mesmo período baixado em dois arquivos). */
export function juntarLancamentos(extratos: ExtratoLido[]): LancamentoBanco[] {
  const vistos = new Set<string>();
  const todos: LancamentoBanco[] = [];
  for (const e of extratos) {
    for (const l of e.lancamentos) {
      const chave = `${l.conta}|${l.data}|${l.historico}|${l.valor}|${l.saldo}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      todos.push(l);
    }
  }
  return todos;
}

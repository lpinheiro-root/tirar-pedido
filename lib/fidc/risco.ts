import type { Grade, Valor } from './planilha';

/**
 * Leitor da planilha "RISCO GERAL OPERAÇÕES FIDCs <MÊS> <ANO>.xlsx" do financeiro.
 * Os dados ficam na aba BASE: data da posição no topo (A1) e a tabela
 * EMPRESA | FIDIC | A VENCER | VENCIDOS | TOTAL. As abas DIN.1 e DIN.2 são tabelas
 * dinâmicas montadas em cima dela, então não precisam ser lidas.
 */

export interface LinhaRisco {
  ordem: number;
  empresa: string;
  fidc: string;
  a_vencer: number;
  vencidos: number;
}

export interface Risco {
  /** AAAA-MM, pelo nome do arquivo (null se não deu para saber). */
  mes: string | null;
  /** AAAA-MM-DD, data que vem no topo da aba BASE. */
  dataPosicao: string | null;
  linhas: LinhaRisco[];
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const texto = (v: Valor) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const numero = (v: Valor) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "RISCO GERAL OPERAÇÕES FIDCs  JUlLHO 2026.xlsx" → "2026-07". */
export function mesDoArquivo(nome: string): string | null {
  const s = semAcento(nome).toUpperCase().replace(/\.XLSX?$/, '');
  const ano = s.match(/\b(20\d{2})\b/)?.[1];
  const palavras = s.split(/[^A-Z]+/).filter((p) => p.length >= 3);
  // ignora palavras do título que começam igual a um mês ("OPERACOES" não, mas fica a regra geral)
  const titulo = new Set(['RISCO', 'GERAL', 'OPERACOES', 'FIDCS', 'FIDC', 'FIDIC', 'XLSX']);
  const p = palavras.find((x) => !titulo.has(x) && MESES.includes(x.slice(0, 3)));
  if (!ano || !p) return null;
  return `${ano}-${String(MESES.indexOf(p.slice(0, 3)) + 1).padStart(2, '0')}`;
}

export function lerRisco(abas: { nome: string; grade: Grade }[], nomeArquivo: string): Risco {
  // a aba BASE; se não tiver esse nome, a primeira que tiver o cabeçalho EMPRESA / A VENCER
  const ordem = [...abas.filter((a) => /^BASE$/i.test(a.nome.trim())), ...abas];
  for (const aba of ordem) {
    const g = aba.grade;
    const iCab = g.findIndex((l) => l.some((v) => /^EMPRESA$/i.test(texto(v))) && l.some((v) => /^A VENCER$/i.test(texto(v))));
    if (iCab < 0) continue;
    const cab = g[iCab].map((v) => semAcento(texto(v)).toUpperCase());
    const cEmp = cab.indexOf('EMPRESA');
    const cFidc = cab.findIndex((t) => /^FID(I)?C/.test(t));
    const cVencer = cab.indexOf('A VENCER');
    const cVencidos = cab.indexOf('VENCIDOS');
    if (cFidc < 0 || cVencidos < 0) throw new Error(`A aba ${aba.nome} não tem as colunas FIDIC e VENCIDOS.`);

    let dataPosicao: string | null = null;
    for (let i = 0; i < iCab && !dataPosicao; i++) {
      const d = g[i].find((v) => v instanceof Date) as Date | undefined;
      if (d) dataPosicao = d.toISOString().slice(0, 10);
    }

    const linhas: LinhaRisco[] = [];
    for (let i = iCab + 1; i < g.length; i++) {
      const empresa = texto(g[i][cEmp]).toUpperCase();
      const fidc = texto(g[i][cFidc]);
      if (!empresa || !fidc || /^TOTAL/i.test(empresa)) continue;
      linhas.push({
        ordem: linhas.length + 1,
        empresa,
        fidc,
        a_vencer: r2(numero(g[i][cVencer])),
        vencidos: r2(numero(g[i][cVencidos])),
      });
    }
    if (!linhas.length) throw new Error(`A aba ${aba.nome} não tem nenhuma linha de empresa/FIDC.`);
    return { mes: mesDoArquivo(nomeArquivo), dataPosicao, linhas };
  }
  throw new Error('Não achei a aba BASE (EMPRESA / FIDIC / A VENCER / VENCIDOS). Confira se é a planilha RISCO GERAL OPERAÇÕES FIDCs.');
}

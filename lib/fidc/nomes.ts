/**
 * A planilha de operações escreve a mesma FIDC e a mesma empresa de vários
 * jeitos ("CRESACER ROMA", "C RESCER - RJ", "ROMA - CRESCER", "GOALRJ"...).
 * Aqui tudo vira um nome padrão. O nome como estava na planilha fica guardado
 * em `nome_original`, para conferência.
 */

export const SEM_FIDC = 'Não informado';
export const SEM_EMPRESA = 'Não informada';

/** FIDCs conhecidas: nome padrão → jeitos de escrever (já sem acento, maiúsculo e sem espaço). */
const FIDCS: [string, string[]][] = [
  ['Crescer', ['CRESCER', 'CRESACER', 'CRESCE', 'CRESCRE', 'CRESECR']],
  ['Amplic', ['AMPLIC']],
  ['Prévia', ['PREVIA', 'PEVIA']],
  ['Goal', ['GOAL', 'GOA']],
  ['Delta', ['DELTA']],
  ['Lecca', ['LECCA', 'RIVO']], // no borderô a Lecca aparece como "RIVO FUNDO INVESTIMENTO..."
  ['Guanabara', ['GUANABARA', 'CASAGUANABARA', 'CASASGUANABARA', 'CASASGUABARA', 'CSGUANABARA']],
  ['Braspor', ['BRASPOR', 'BRASPO']],
  ['Lira', ['LIRA']],
  ['Via Capital', ['VIACAPITAL']],
  ['SRM', ['SRM']],
  ['Investhor', ['INVESTHOR', 'INVESTOR']],
  ['Lavoro', ['LAVORO']],
  ['Santander', ['SANTANDER', 'ANTENCIPACAOSANTANDER', 'ANTECIPACAOSANTANDER']],
  ['Dank', ['DANK']],
  ['Mobi', ['MOBI']],
  ['RNX', ['RNX']],
  ['Pinarello', ['PINARELLO', 'PINARELO']],
  ['IAP', ['IAP']],
  ['Fronteira', ['FRONTEIRA', 'FRONTEIRAS']],
  ['Fronteira/IAP', ['FRONTEIRAIAP']],
  ['Irmãos Mattar', ['IRMAOSMATTAR', 'IRMAOSMATAR', 'MATTAR']],
  ['Minas Fac', ['MINASFAC', 'MINASFARC']],
  ['Opera', ['OPERA']],
  ['Mateus', ['MATEUS']],
];

/**
 * Empresas do grupo. "RJ", "SP", "PE", "RS" e "MG" sozinhos são as filiais da
 * Veneza (a planilha usa "Crescer RJ" e "Crescer Veneza RJ" para a mesma coisa).
 */
const EMPRESAS: [string, RegExp][] = [
  ['Roma', /\b(ROMA|RMA)\b/],
  ['Lucerna', /\b(LUCERNA|LUCENA)\b/],
  ['Verona', /\bVERONA\b/],
  ['Biosense', /\b(BIOSENSE|BISENSE|BOSENSE)\b/],
  ['Modena', /\bMODENA\b/],
  ['Veneza RJ', /\b(VENEZA )?RJ\b/],
  ['Veneza SP', /\b(VENEZA )?SP\b/],
  ['Veneza PE', /\b(VENEZA )?PE\b/],
  ['Veneza RS', /\b(VENEZA )?RS\b/],
  ['Veneza MG', /\b(VENEZA )?MG\b/],
  ['Veneza', /\bVENEZA\b/],
];

/** Mesma lista sem \b, para nomes colados ("GOALRJ", "CRESCERBIOSENSE", "PREVIAVENEZA SP"). */
const EMPRESAS_COLADAS: [string, RegExp][] = [
  ['Roma', /(ROMA)$/],
  ['Lucerna', /(LUCERNA)$/],
  ['Verona', /(VERONA)$/],
  ['Biosense', /(BIOSENSE)$/],
  ['Modena', /(MODENA)$/],
  ['Veneza RJ', /(VENEZA ?RJ|RJ)$/],
  ['Veneza SP', /(VENEZA ?SP|SP)$/],
  ['Veneza PE', /(VENEZA ?PE|PE)$/],
  ['Veneza RS', /(VENEZA ?RS|RS)$/],
  ['Veneza', /(VENEZA)$/],
];

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

function limpar(nome: string) {
  return semAcento(nome)
    .toUpperCase()
    .replace(/\(?FACTORING\)?/g, ' ')
    .replace(/[-/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fidcDe(resto: string): string | null {
  const compacto = resto.replace(/[^A-Z]/g, '');
  if (!compacto) return null;
  for (const [padrao, jeitos] of FIDCS) if (jeitos.includes(compacto)) return padrao;
  // "C RESCER" → "CRESCER" já cai acima; aqui ficam os que começam com o nome (ex.: "PREVIA LUCERNA FACTORING")
  for (const [padrao, jeitos] of FIDCS) if (jeitos.some((j) => j.length >= 4 && compacto.startsWith(j))) return padrao;
  return null;
}

/** Se o texto não tem letras (ex.: "R$ 105.899,30" ou ","), não é uma linha de operação. */
export function pareceNome(nome: string) {
  return /[A-Za-zÀ-ú]{2,}/.test(nome) && !/^\s*R\$/.test(nome);
}

export function normalizarNome(nome: string): { fidc: string; empresa: string; reconhecido: boolean } {
  const s = limpar(nome);
  let empresa: string | null = null;
  let resto = s;

  for (const [padrao, re] of EMPRESAS) {
    const m = s.match(re);
    if (m) {
      empresa = padrao;
      resto = s.replace(re, ' ').trim();
      break;
    }
  }
  if (!empresa) {
    for (const [padrao, re] of EMPRESAS_COLADAS) {
      const m = s.match(re);
      if (m && s.length > m[1].length) {
        const antes = s.slice(0, s.length - m[1].length);
        if (fidcDe(antes)) {
          empresa = padrao;
          resto = antes;
          break;
        }
      }
    }
  }

  const fidc = fidcDe(resto);
  const reconhecido = Boolean(fidc) || !resto.replace(/[^A-Z]/g, '');
  return {
    fidc: fidc ?? (resto ? titulo(resto) : SEM_FIDC),
    empresa: empresa ?? SEM_EMPRESA,
    reconhecido,
  };
}

/** Nomes padrão das FIDCs conhecidas (para escolher numa lista). */
export const FIDCS_CONHECIDAS = FIDCS.map(([padrao]) => padrao);
/** Nomes padrão das empresas do grupo. */
export const EMPRESAS_CONHECIDAS = ['Roma', 'Lucerna', 'Verona', 'Biosense', 'Modena', 'Veneza RJ', 'Veneza SP', 'Veneza PE', 'Veneza RS', 'Veneza MG', 'Veneza'];

/**
 * FIDC pelo nome que vem no borderô ("AMPLIC FUNDO DE INVESTIMEN EM DIREITOS CREDITORIOS",
 * "CRESCER FIDC MULTISEGMENTOS", "RIVO FUNDO ..."): a primeira palavra que for uma FIDC conhecida.
 */
export function fidcDoBordero(nome: string): string | null {
  const palavras = limpar(nome).split(' ');
  for (const p of palavras) {
    const f = fidcDe(p);
    if (f && p.length >= 4) return f;
  }
  return fidcDe(palavras.join(''));
}

/**
 * Empresa pelo nome do cedente no borderô. Só as que não têm filial; Veneza depende do CNPJ
 * (a filial), então volta null e a pessoa escolhe uma vez.
 */
export function empresaDoCedente(nome: string): string | null {
  const s = limpar(nome);
  for (const [padrao, re] of EMPRESAS.slice(0, 5)) if (re.test(s)) return padrao;
  return null;
}

function titulo(s: string) {
  return s.toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());
}

// Robô de notas fiscais: Alterdata Pack (NF-Stock) e caixas de e-mail → Natuhair Finanças.
//
// Roda dentro da rede (servidor 10.0.255.126, PM2, a cada 30 min):
//  1. lista pelo índice (sem abrir XML) as chaves das NF-e (modelo 55) do mês
//     atual e do anterior em wfiscal.arquivos_xml_danfe;
//  2. abre só as chaves ainda não vistas (cache em estado.json) e fica com as
//     notas cujo destinatário é uma das empresas cadastradas no NF-Stock
//     (wfiscal.configuracao_nfstock), emitidas por fornecedores de fora do grupo;
//  3. grava essas notas (XML comprimido) no Supabase e pede ao site para
//     vincular as notas às compras do cartão.
// O acesso ao Alterdata é feito com um usuário somente leitura.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { caixasConfiguradas, xmlsDaCaixa } from './email.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ARQ_ESTADO = path.join(DIR, 'estado.json');

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

const env = { ...lerEnv(path.join(DIR, '.env')), ...process.env };
// empresas extras além das do NF-Stock (opcional)
const EMPRESAS_EXTRAS = (env.EMPRESAS_CNPJ ?? '').split(',').map((c) => c.replace(/\D/g, '')).filter((c) => c.length === 14);
const LOTE = 200;
// carga histórica pontual: MESES=2601,2602,... (AAMM) e SO_DEVOLUCOES=1
const MESES_FIXOS = (env.MESES ?? '').split(',').map((m) => m.trim()).filter((m) => /^\d{4}$/.test(m));
const SO_DEVOLUCOES = env.SO_DEVOLUCOES === '1';
const MAX_POR_RODADA = Number(env.MAX_POR_RODADA ?? 3000);
const UFS = ['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53'];

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) throw new Error(`Configuração ausente: ${k}`);
}
const USA_ALTERDATA = Boolean(env.ALTERDATA_HOST && env.ALTERDATA_SENHA);
const CAIXAS = caixasConfiguradas(env);

/** Meses (AAMM, como na chave de acesso) do mês atual e do anterior, no horário de Brasília. */
function mesesRecentes() {
  const agora = new Date(Date.now() - 3 * 3_600_000);
  const atual = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const anterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
  const aamm = (d) => String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0');
  return [aamm(anterior), aamm(atual)];
}

function proximoAamm(aamm) {
  let ano = Number(aamm.slice(0, 2));
  let mes = Number(aamm.slice(2)) + 1;
  if (mes === 13) { mes = 1; ano++; }
  return String(ano).padStart(2, '0') + String(mes).padStart(2, '0');
}

function lerEstado(meses) {
  let estado = { vistos: {} };
  try { estado = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8')); } catch { /* primeira rodada */ }
  // esquece meses que saíram da janela
  for (const [chave, aamm] of Object.entries(estado.vistos)) if (!meses.includes(aamm)) delete estado.vistos[chave];
  return estado;
}

function salvarEstado(estado) {
  fs.writeFileSync(ARQ_ESTADO + '.tmp', JSON.stringify(estado));
  fs.renameSync(ARQ_ESTADO + '.tmp', ARQ_ESTADO);
}

// ── leitura da NF-e (mesma lógica de lib/cartao/sefaz.ts → lerNotaCompleta) ──
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (nome) => nome === 'det',
});

function destinatarioCnpj(xml) {
  const dest = xml.match(/<dest>([\s\S]*?)<\/dest>/);
  return dest?.[1].match(/<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ?? null;
}

// CFOPs de devolução (o cliente devolvendo mercadoria) e o equivalente na entrada
const CFOP_DEVOLUCAO = /^[1-7](20[1-9]|21[0-1]|41[0-3]|503|553|55[56]|66[0-2]|91[89])$/;

/** Devolução: finalidade 4 ou algum item com CFOP de devolução. */
function ehDevolucao(xml) {
  if (/<finNFe>4<\/finNFe>/.test(xml)) return true;
  return [...xml.matchAll(/<CFOP>(\d{4})<\/CFOP>/g)].some((m) => CFOP_DEVOLUCAO.test(m[1]));
}

/** Nota de entrada emitida pela própria empresa para registrar a devolução de um cliente. */
function ehEntradaDevolucaoPropria(xml) {
  return /<tpNF>0<\/tpNF>/.test(xml) && ehDevolucao(xml);
}

/**
 * `propria`: nota emitida pela empresa do grupo (entrada de devolução) — aí a
 * empresa é o emitente e o cliente é o destinatário; nas demais, ao contrário.
 */
function lerNota(chave, xml, propria = false) {
  const doc = parser.parse(xml);
  const proc = doc.nfeProc ?? doc.procNFe ?? { NFe: doc.NFe };
  const inf = proc.NFe?.infNFe ?? {};
  // XML vindo de e-mail: a chave sai do protocolo ou do Id da nota
  chave = chave || String(proc.protNFe?.infProt?.chNFe ?? '') || String(inf['@Id'] ?? '').replace(/^NFe/, '');
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const det = inf.det ?? [];
  const textos = [...det.map((d) => d.prod?.xPed), inf.infAdic?.infCpl, inf.compra?.xPed].map((t) => String(t ?? '')).join(' ');
  const devolucao = ehDevolucao(xml);
  const empresa = propria ? emit : dest;
  const cliente = propria ? dest : emit;
  // notas de venda citadas pela devolução (NFref → chaves)
  const refs = [inf.ide?.NFref].flat().filter(Boolean);
  const notasOrigem = refs.map((r) => String(r.refNFe ?? '')).filter((c) => /^\d{44}$/.test(c));
  return {
    chave,
    cnpj_emitente: String(emit.CNPJ ?? emit.CPF ?? ''),
    nome_emitente: String(emit.xNome ?? ''),
    // empresa do grupo envolvida (destinatária, ou emitente na entrada própria)
    cnpj_destinatario: String(empresa.CNPJ ?? '') || null,
    nome_destinatario: String(empresa.xNome ?? '') || null,
    tipo: devolucao ? 'devolucao' : 'compra',
    devolucao_origem: devolucao ? (propria ? 'propria' : 'cliente') : null,
    cliente_nome: devolucao ? String(cliente.xNome ?? '') || null : null,
    cliente_doc: devolucao ? String(cliente.CNPJ ?? cliente.CPF ?? '') || null : null,
    cliente_uf: devolucao ? String((propria ? cliente.enderDest : cliente.enderEmit)?.UF ?? '') || null : null,
    empresa_uf: String((propria ? empresa.enderEmit : empresa.enderDest)?.UF ?? '') || null,
    notas_origem: devolucao ? notasOrigem : null,
    transportadora: String(inf.transp?.transporta?.xNome ?? '') || null,
    data_emissao: String(inf.ide?.dhEmi ?? inf.ide?.dEmi ?? '') || null,
    valor_total: Number(inf.total?.ICMSTot?.vNF ?? 0),
    situacao: 'completa',
    // XML comprimido (gzip/base64) para economizar espaço no Supabase
    xml: null,
    xml_gz: gzipSync(Buffer.from(xml, 'utf8')).toString('base64'),
    pedidos_ref: Array.from(new Set(textos.match(/\b\d{10,20}\b/g) ?? [])),
    atualizado_em: new Date().toISOString(),
  };
}

// ── fonte 1: Alterdata (NF-Stock) ──
async function buscarAlterdata(supabase, estado, meses) {
  const db = new pg.Client({
    host: env.ALTERDATA_HOST,
    port: Number(env.ALTERDATA_PORTA ?? 5432),
    database: env.ALTERDATA_BANCO,
    user: env.ALTERDATA_USUARIO,
    password: env.ALTERDATA_SENHA,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 60_000,
    application_name: 'natuhair-financas-robo-notas',
  });
  await db.connect();

  let analisadas = 0;
  let enviadas = 0;
  try {
    // empresas cadastradas no NF-Stock (lidas a cada rodada: empresa nova entra sozinha)
    const { rows: cadastro } = await db.query(
      "select distinct regexp_replace(empresa_cnpj, '\\D', '', 'g') as cnpj from wfiscal.configuracao_nfstock"
    );
    const empresas = new Set([...cadastro.map((r) => r.cnpj).filter((c) => c?.length === 14), ...EMPRESAS_EXTRAS]);
    if (!empresas.size) throw new Error('nenhuma empresa cadastrada no NF-Stock');

    // raízes de CNPJ do grupo (matriz e filiais): o CNPJ do emitente está na chave
    const raizesGrupo = new Set([...empresas].map((c) => c.slice(0, 8)));

    // 1. chaves do período pelo índice: só NF-e (modelo 55 — a tabela também guarda CT-e, modelo 57)
    const faixas = meses.flatMap((aamm) => UFS.map((uf) => `(id >= '${uf}${aamm}' and id < '${uf}${proximoAamm(aamm)}')`));
    const { rows } = await db.query(
      `select id from wfiscal.arquivos_xml_danfe where (${faixas.join(' or ')}) and length(id) = 44 and substring(id, 21, 2) = '55'`
    );
    const novas = rows.map((r) => r.id).filter((id) => !estado.vistos[id]).slice(0, MAX_POR_RODADA);

    // 2. abre só as novas, em lotes, e fica com:
    //    - notas de fora do grupo destinadas às empresas (compras e NFD de clientes);
    //    - notas de entrada de devolução emitidas pela própria empresa.
    //    Transferências e vendas entre as empresas do grupo não entram.
    for (let i = 0; i < novas.length; i += LOTE) {
      const lote = novas.slice(i, i + LOTE);
      const { rows: xmls } = await db.query('select id, xml from wfiscal.arquivos_xml_danfe where id = any($1::varchar[])', [lote]);
      const notas = [];
      for (const { id, xml } of xmls) {
        analisadas++;
        if (!xml) continue;
        const doGrupo = raizesGrupo.has(id.slice(6, 14));
        try {
          if (!doGrupo && empresas.has(destinatarioCnpj(xml))) notas.push(lerNota(id, xml));
          else if (doGrupo && ehEntradaDevolucaoPropria(xml)) notas.push(lerNota(id, xml, true));
          // devoluções entre empresas do grupo não entram: o controle é só de clientes
        } catch (e) {
          console.log('nota ilegível', id, e.message);
        }
      }
      if (SO_DEVOLUCOES) notas.splice(0, notas.length, ...notas.filter((n) => n.tipo === 'devolucao'));
      if (notas.length) {
        const { error } = await supabase.from('cartao_notas').upsert(notas, { onConflict: 'chave' });
        if (error) throw new Error(`Supabase: ${error.message}`);
        enviadas += notas.length;
      }
      for (const id of lote) estado.vistos[id] = id.slice(2, 6);
      salvarEstado(estado);
    }
  } finally {
    await db.end();
  }
  return `Alterdata: ${analisadas} nova(s) analisada(s), ${enviadas} das empresas`;
}

// ── fonte 2: caixas de e-mail (notas no CPF e as que o vendedor manda por e-mail) ──
async function buscarEmails(supabase, estado) {
  const partes = [];
  estado.email ??= {};
  for (const caixa of CAIXAS) {
    try {
      const estadoCaixa = (estado.email[caixa.usuario] ??= {});
      const xmls = await xmlsDaCaixa(caixa, estadoCaixa);
      const porChave = new Map();
      for (const xml of xmls) {
        try {
          const nota = lerNota(null, xml);
          if (/^\d{44}$/.test(nota.chave) && nota.chave.slice(20, 22) === '55') porChave.set(nota.chave, nota);
        } catch { /* XML que não é NF-e */ }
      }
      if (porChave.size) {
        // a mesma nota pode já ter vindo pelo Alterdata: não sobrescreve
        const { error } = await supabase
          .from('cartao_notas')
          .upsert([...porChave.values()], { onConflict: 'chave', ignoreDuplicates: true });
        if (error) throw new Error(`Supabase: ${error.message}`);
      }
      salvarEstado(estado);
      partes.push(`${caixa.usuario}: ${porChave.size} nota(s)`);
    } catch (e) {
      partes.push(`${caixa.usuario}: ERRO ${e.message}`);
    }
  }
  return partes.length ? `E-mail: ${partes.join(', ')}` : '';
}

// ── rodada ──
async function main() {
  const inicio = Date.now();
  const meses = MESES_FIXOS.length ? MESES_FIXOS : mesesRecentes();
  const estado = lerEstado(meses);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // as fontes são independentes: a falha de uma não impede a outra
  const partes = [];
  if (USA_ALTERDATA) {
    try { partes.push(await buscarAlterdata(supabase, estado, meses)); } catch (e) { partes.push(`Alterdata: ERRO ${e.message}`); }
  }
  if (CAIXAS.length) partes.push(await buscarEmails(supabase, estado));

  // vincula as notas às compras
  if (env.SITE_URL && env.CRON_SECRET) {
    try {
      const r = await fetch(`${env.SITE_URL}/api/cartao/cron?tarefa=vincular`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      });
      partes.push(r.ok ? `${(await r.json()).notas ?? 0} vinculada(s)` : `vínculo falhou (${r.status})`);
    } catch (e) {
      partes.push(`vínculo falhou (${e.message})`);
    }
  }

  const status = `${partes.filter(Boolean).join(' · ')} · ${Date.now() - inicio} ms`;
  await supabase
    .from('cartao_nfe_config')
    .upsert({ id: 1, ultima_consulta: new Date().toISOString(), ultimo_status: status.slice(0, 500), atualizado_em: new Date().toISOString() });
  console.log(new Date().toISOString(), status);
}

main().catch(async (e) => {
  console.error(new Date().toISOString(), 'ERRO:', e.message);
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    await supabase.from('cartao_nfe_config').upsert({ id: 1, ultima_consulta: new Date().toISOString(), ultimo_status: `ERRO: ${e.message}`.slice(0, 500) });
  } catch { /* sem como registrar */ }
  process.exitCode = 1;
});

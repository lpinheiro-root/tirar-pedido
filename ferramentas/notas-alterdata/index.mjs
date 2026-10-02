// Robô de notas fiscais: Alterdata Pack (NF-Stock) → Natuhair Finanças.
//
// Roda dentro da rede (servidor 10.0.255.126, PM2, a cada 30 min):
//  1. lista pelo índice (sem abrir XML) as chaves das NF-e do mês atual e do
//     anterior em wfiscal.arquivos_xml_danfe, descartando as emitidas pelas
//     próprias empresas (o CNPJ do emitente está na chave);
//  2. abre só as chaves ainda não vistas (cache em estado.json) e fica com as
//     notas cujo destinatário é uma das empresas que compram no cartão;
//  3. grava essas notas (XML completo) no Supabase e pede ao site para
//     vincular as notas às compras.
// O acesso ao Alterdata é feito com um usuário somente leitura.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

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
const EMPRESAS = (env.EMPRESAS_CNPJ ?? '').split(',').map((c) => c.replace(/\D/g, '')).filter((c) => c.length === 14);
const RAIZES = Array.from(new Set(EMPRESAS.map((c) => c.slice(0, 8))));
const LOTE = 200;
const MAX_POR_RODADA = Number(env.MAX_POR_RODADA ?? 3000);
const UFS = ['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53'];

for (const k of ['ALTERDATA_HOST', 'ALTERDATA_BANCO', 'ALTERDATA_USUARIO', 'ALTERDATA_SENHA', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) throw new Error(`Configuração ausente: ${k}`);
}
if (!EMPRESAS.length) throw new Error('Configuração ausente: EMPRESAS_CNPJ');

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

function lerNota(chave, xml) {
  const doc = parser.parse(xml);
  const proc = doc.nfeProc ?? doc.procNFe ?? {};
  const inf = proc.NFe?.infNFe ?? {};
  const emit = inf.emit ?? {};
  const det = inf.det ?? [];
  const textos = [...det.map((d) => d.prod?.xPed), inf.infAdic?.infCpl, inf.compra?.xPed].map((t) => String(t ?? '')).join(' ');
  return {
    chave,
    cnpj_emitente: String(emit.CNPJ ?? emit.CPF ?? ''),
    nome_emitente: String(emit.xNome ?? ''),
    data_emissao: String(inf.ide?.dhEmi ?? inf.ide?.dEmi ?? '') || null,
    valor_total: Number(inf.total?.ICMSTot?.vNF ?? 0),
    situacao: 'completa',
    xml,
    pedidos_ref: Array.from(new Set(textos.match(/\b\d{10,20}\b/g) ?? [])),
    atualizado_em: new Date().toISOString(),
  };
}

// ── rodada ──
async function main() {
  const inicio = Date.now();
  const meses = mesesRecentes();
  const estado = lerEstado(meses);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
    // 1. chaves do período pelo índice, sem as emitidas pelas próprias empresas
    const faixas = meses.flatMap((aamm) => UFS.map((uf) => `(id >= '${uf}${aamm}' and id < '${uf}${proximoAamm(aamm)}')`));
    const { rows } = await db.query(
      `select id from wfiscal.arquivos_xml_danfe where (${faixas.join(' or ')}) and length(id) = 44 and substring(id, 7, 8) <> all($1::text[])`,
      [RAIZES]
    );
    const novas = rows.map((r) => r.id).filter((id) => !estado.vistos[id]).slice(0, MAX_POR_RODADA);

    // 2. abre só as novas, em lotes, e fica com as destinadas às empresas
    for (let i = 0; i < novas.length; i += LOTE) {
      const lote = novas.slice(i, i + LOTE);
      const { rows: xmls } = await db.query('select id, xml from wfiscal.arquivos_xml_danfe where id = any($1::varchar[])', [lote]);
      const notas = [];
      for (const { id, xml } of xmls) {
        analisadas++;
        if (EMPRESAS.includes(destinatarioCnpj(xml ?? ''))) {
          try { notas.push(lerNota(id, xml)); } catch (e) { console.log('nota ilegível', id, e.message); }
        }
      }
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

  // 3. vincula as notas às compras
  let vinculo = '';
  if (env.SITE_URL && env.CRON_SECRET) {
    const r = await fetch(`${env.SITE_URL}/api/cartao/cron?tarefa=vincular`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    vinculo = r.ok ? ` · ${(await r.json()).notas ?? 0} vinculada(s)` : ` · vínculo falhou (${r.status})`;
  }

  const status = `Alterdata: ${analisadas} nota(s) nova(s) analisada(s), ${enviadas} das empresas enviada(s)${vinculo}. Meses ${meses.join(', ')} · ${Date.now() - inicio} ms`;
  await supabase.from('cartao_nfe_config').upsert({ id: 1, ultima_consulta: new Date().toISOString(), ultimo_status: status, atualizado_em: new Date().toISOString() });
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

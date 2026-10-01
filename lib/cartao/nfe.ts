import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  abrirCertificado,
  distribuicaoPorNSU,
  lerEvento,
  lerNotaCompleta,
  lerResumo,
  registrarCiencia,
  type Certificado,
  type DadosNota,
} from './sefaz';

/**
 * Rotina de notas fiscais (roda agendada e pelo botão "Buscar agora" do TI):
 *  1. busca na SEFAZ os documentos novos do CNPJ (Distribuição DF-e por NSU);
 *  2. registra a Ciência da Operação das notas que só vieram em resumo — a SEFAZ
 *     então passa a distribuir o XML completo nas próximas consultas;
 *  3. casa as notas com as compras (número do pedido citado na nota ou valor + data).
 *
 * Regra da SEFAZ: quando não há documento novo (cStat 137) ou já se chegou ao
 * último NSU, a próxima consulta só pode ser feita depois de 1 hora; consultar
 * antes gera "consumo indevido" (656) e bloqueio temporário. Isso é respeitado
 * sempre, inclusive no botão manual.
 */

const BUCKET = 'cartao-certificados';
const ARQUIVO_CERT = 'certificado.pfx';
const ESPERA_MS = 61 * 60_000;
const ORCAMENTO_MS = 7_000; // funções da Netlify têm ~10s

type Service = ReturnType<typeof createServiceRoleClient>;

export interface ConfigNFe {
  cnpj: string | null;
  uf: string | null;
  cert_titular: string | null;
  cert_validade: string | null;
  cert_senha: string | null;
  ult_nsu: string;
  max_nsu: string | null;
  proxima_consulta: string | null;
  ultima_consulta: string | null;
  ultimo_status: string | null;
}

export async function lerConfigNFe(service: Service): Promise<ConfigNFe | null> {
  const { data } = await service.from('cartao_nfe_config').select('*').eq('id', 1).maybeSingle();
  return data as ConfigNFe | null;
}

/** Valida e guarda o certificado A1 (arquivo no storage privado, senha na config). */
export async function salvarCertificadoNFe(pfx: Buffer, senha: string, uf: string): Promise<Certificado> {
  const cert = abrirCertificado(pfx, senha);
  if (!cert.cnpj) throw new Error('Este certificado não é um e-CNPJ (não encontrei o CNPJ no titular).');
  if (cert.validoAte.getTime() < Date.now()) throw new Error('Este certificado está vencido.');

  const service = createServiceRoleClient();
  const { error: erroUpload } = await service.storage
    .from(BUCKET)
    .upload(ARQUIVO_CERT, pfx, { upsert: true, contentType: 'application/x-pkcs12' });
  if (erroUpload) throw new Error(`Falha ao guardar o certificado: ${erroUpload.message}`);

  const atual = await lerConfigNFe(service);
  const { error } = await service.from('cartao_nfe_config').upsert({
    id: 1,
    cnpj: cert.cnpj,
    uf,
    cert_titular: cert.titular,
    cert_validade: cert.validoAte.toISOString(),
    cert_senha: senha,
    // outro CNPJ: recomeça a distribuição do zero
    ...(atual?.cnpj && atual.cnpj !== cert.cnpj ? { ult_nsu: '000000000000000', max_nsu: null } : {}),
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return cert;
}

async function certificadoSalvo(service: Service, config: ConfigNFe): Promise<Certificado> {
  const { data, error } = await service.storage.from(BUCKET).download(ARQUIVO_CERT);
  if (error || !data) throw new Error('Certificado não encontrado. Envie o certificado A1 novamente.');
  return abrirCertificado(Buffer.from(await data.arrayBuffer()), config.cert_senha ?? '');
}

// ─────────────────────────────────────────────────────────────
// gravação dos documentos
// ─────────────────────────────────────────────────────────────

function linhaNota(n: DadosNota, nsu: string) {
  return {
    chave: n.chave,
    nsu,
    cnpj_emitente: n.cnpjEmitente,
    nome_emitente: n.nomeEmitente,
    data_emissao: n.dataEmissao || null,
    valor_total: Number.isFinite(n.valorTotal) ? n.valorTotal : null,
    atualizado_em: new Date().toISOString(),
  };
}

async function gravarDocumentos(
  service: Service,
  cnpjEmpresa: string,
  docs: { nsu: string; schema: string; xml: string }[]
) {
  for (const doc of docs) {
    try {
      if (doc.schema.startsWith('resNFe')) {
        const n = lerResumo(doc.xml);
        if (!n.chave || n.cnpjEmitente === cnpjEmpresa) continue; // ignora notas emitidas pela própria empresa
        // não rebaixa uma nota que já está completa
        await service
          .from('cartao_notas')
          .upsert({ ...linhaNota(n, doc.nsu), situacao: n.cancelada ? 'cancelada' : 'resumo' }, {
            onConflict: 'chave',
            ignoreDuplicates: true,
          });
      } else if (doc.schema.startsWith('procNFe')) {
        const n = lerNotaCompleta(doc.xml);
        if (!n.chave || n.cnpjEmitente === cnpjEmpresa) continue;
        await service
          .from('cartao_notas')
          .upsert(
            { ...linhaNota(n, doc.nsu), situacao: 'completa', xml: doc.xml, pedidos_ref: n.pedidos },
            { onConflict: 'chave' }
          );
      } else if (doc.schema.startsWith('resEvento') || doc.schema.startsWith('procEventoNFe')) {
        const ev = lerEvento(doc.xml);
        if (ev?.tpEvento === '110111') {
          await service.from('cartao_notas').update({ situacao: 'cancelada' }).eq('chave', ev.chave);
        }
      }
    } catch {
      // um documento ilegível não pode travar a fila de NSU
    }
  }
}

// ─────────────────────────────────────────────────────────────
// vínculo nota ↔ compra
// ─────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;

export async function vincularNotas(service: Service): Promise<number> {
  const desde = new Date(Date.now() - 200 * DIA_MS).toISOString();
  const [{ data: notas }, { data: compras }] = await Promise.all([
    service
      .from('cartao_notas')
      .select('id, data_emissao, valor_total, pedidos_ref')
      .is('compra_id', null)
      .neq('situacao', 'cancelada')
      .gte('data_emissao', desde),
    service
      .from('cartao_compras')
      .select('id, data, valor_total, pedidos, pedido_externo')
      .gte('data', desde.slice(0, 10)),
  ]);
  if (!notas?.length || !compras?.length) return 0;

  let vinculadas = 0;
  for (const nota of notas) {
    const refs = new Set((nota.pedidos_ref as string[] | null) ?? []);
    let compra = compras.find((c) =>
      [...((c.pedidos as string[] | null) ?? []), String(c.pedido_externo ?? '').replace(/^pagamento:/, '')].some(
        (p) => p && refs.has(p)
      )
    );
    if (!compra && nota.data_emissao && nota.valor_total != null) {
      const emissao = Date.parse(nota.data_emissao);
      const candidatas = compras.filter((c) => {
        const dias = (emissao - Date.parse(`${c.data}T12:00:00-03:00`)) / DIA_MS;
        return Math.abs(Number(c.valor_total) - Number(nota.valor_total)) <= 0.05 && dias >= -2 && dias <= 20;
      });
      if (candidatas.length === 1) compra = candidatas[0];
    }
    if (compra) {
      await service.from('cartao_notas').update({ compra_id: compra.id, vinculo: 'auto' }).eq('id', nota.id);
      vinculadas++;
    }
  }
  return vinculadas;
}

// ─────────────────────────────────────────────────────────────
// rotina
// ─────────────────────────────────────────────────────────────

export interface ResultadoSincronizacao {
  ok: boolean;
  mensagem: string;
}

function horaBrasilia(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export async function executarSincronizacaoNFe(): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();
  const service = createServiceRoleClient();
  const config = await lerConfigNFe(service);
  if (!config?.cnpj || !config.uf || !config.cert_senha) {
    return { ok: false, mensagem: 'Notas fiscais não configuradas: envie o certificado A1.' };
  }
  if (config.proxima_consulta && Date.parse(config.proxima_consulta) > Date.now()) {
    const vinculadas = await vincularNotas(service);
    return {
      ok: true,
      mensagem: `A SEFAZ só permite nova consulta às ${horaBrasilia(config.proxima_consulta)}.${
        vinculadas ? ` ${vinculadas} nota(s) vinculada(s) a compras.` : ''
      }`,
    };
  }

  const cert = await certificadoSalvo(service, config);
  let ultNSU = config.ult_nsu;
  let maxNSU = config.max_nsu;
  let proxima: string | null = null;
  let status = '';
  let recebidos = 0;

  try {
    for (let i = 0; i < 6 && Date.now() - inicio < ORCAMENTO_MS; i++) {
      const r = await distribuicaoPorNSU(cert, config.cnpj, config.uf, ultNSU);
      status = `${r.cStat} ${r.xMotivo}`;
      if (r.cStat === '138') {
        await gravarDocumentos(service, config.cnpj, r.docs);
        recebidos += r.docs.length;
        ultNSU = r.ultNSU || ultNSU;
        maxNSU = r.maxNSU || maxNSU;
        await service.from('cartao_nfe_config').update({ ult_nsu: ultNSU, max_nsu: maxNSU }).eq('id', 1);
        if (maxNSU && Number(ultNSU) >= Number(maxNSU)) {
          proxima = new Date(Date.now() + ESPERA_MS).toISOString();
          break;
        }
      } else {
        // 137 = nada novo; 656 = consumo indevido; demais = erro — em todos, esperar 1h
        if (r.ultNSU) ultNSU = r.ultNSU;
        proxima = new Date(Date.now() + ESPERA_MS).toISOString();
        break;
      }
    }
  } catch (e) {
    status = `Erro: ${(e as Error).message}`;
    proxima = new Date(Date.now() + 15 * 60_000).toISOString();
  }

  // ciência das notas que só vieram em resumo (lote de até 20)
  let ciencias = 0;
  const falhasCiencia: string[] = [];
  if (Date.now() - inicio < ORCAMENTO_MS + 1_000) {
    const { data: pendentes } = await service
      .from('cartao_notas')
      .select('chave')
      .eq('situacao', 'resumo')
      .is('ciencia_em', null)
      .order('data_emissao', { ascending: false })
      .limit(20);
    if (pendentes?.length) {
      try {
        const resultados = await registrarCiencia(cert, config.cnpj, pendentes.map((p) => p.chave));
        for (const r of resultados) {
          await service
            .from('cartao_notas')
            .update({
              ciencia_em: r.ok ? new Date().toISOString() : null,
              ciencia_status: `${r.cStat} ${r.xMotivo}`,
            })
            .eq('chave', r.chave);
          if (r.ok) ciencias++;
          else falhasCiencia.push(`${r.cStat} ${r.xMotivo}`);
        }
      } catch (e) {
        falhasCiencia.push((e as Error).message);
      }
    }
  }

  const vinculadas = await vincularNotas(service);
  const resumo =
    `${recebidos} documento(s) recebido(s), ${ciencias} ciência(s) registrada(s), ${vinculadas} nota(s) vinculada(s). ` +
    `SEFAZ: ${status}` +
    (falhasCiencia.length ? ` | Ciência com erro: ${falhasCiencia[0]}` : '');
  await service
    .from('cartao_nfe_config')
    .update({
      ultima_consulta: new Date().toISOString(),
      proxima_consulta: proxima,
      ultimo_status: resumo.slice(0, 500),
    })
    .eq('id', 1);

  return { ok: !status.startsWith('Erro'), mensagem: resumo };
}

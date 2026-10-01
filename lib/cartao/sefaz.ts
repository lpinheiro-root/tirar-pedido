import https from 'https';
import { gunzipSync } from 'zlib';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { XMLParser } from 'fast-xml-parser';

/**
 * Comunicação com os web services nacionais da NF-e (Ambiente Nacional):
 *  - NFeDistribuicaoDFe: lista as NF-e emitidas contra o CNPJ (resumos e XML completos);
 *  - NFeRecepcaoEvento4: registra a "Ciência da Operação" (210210), exigida para
 *    a SEFAZ liberar o XML completo de uma nota ao destinatário.
 * A conexão usa TLS mútuo com o certificado A1 (e-CNPJ) da empresa.
 */

const URL_DIST = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_EVENTO = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';

export const UF_IBGE: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22',
  CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32',
  RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

// ─────────────────────────────────────────────────────────────
// certificado
// ─────────────────────────────────────────────────────────────

export interface Certificado {
  pfx: Buffer;
  senha: string;
  chavePem: string;
  certPem: string;
  titular: string;
  cnpj: string | null;
  validoAte: Date;
}

/** Abre o .pfx/.p12 e extrai chave, certificado, titular, CNPJ (do e-CNPJ) e validade. */
export function abrirCertificado(pfx: Buffer, senha: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    throw new Error('Não foi possível abrir o certificado: confira o arquivo e a senha.');
  }
  const chaves =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const chave = chaves[0]?.key;
  if (!chave) throw new Error('O certificado não contém a chave privada.');

  // o certificado do titular é o que casa com a chave privada (o .pfx pode trazer a cadeia)
  const pub = forge.pki.setRsaPublicKey((chave as forge.pki.rsa.PrivateKey).n, (chave as forge.pki.rsa.PrivateKey).e);
  const titularBag =
    certs.find((b) => b.cert && forge.pki.publicKeyToPem(b.cert.publicKey) === forge.pki.publicKeyToPem(pub)) ??
    certs[0];
  const cert = titularBag?.cert;
  if (!cert) throw new Error('O arquivo não contém o certificado do titular.');

  const cn = String(cert.subject.getField('CN')?.value ?? '');
  // e-CNPJ ICP-Brasil: CN = "RAZAO SOCIAL:00000000000000"
  const cnpj = cn.match(/:(\d{14})$/)?.[1] ?? null;

  return {
    pfx,
    senha,
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(cert),
    titular: cn.replace(/:\d{14}$/, ''),
    cnpj,
    validoAte: cert.validity.notAfter,
  };
}

// ─────────────────────────────────────────────────────────────
// SOAP com TLS mútuo
// ─────────────────────────────────────────────────────────────

function soap(url: string, action: string, corpo: string, cert: Certificado): Promise<string> {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        pfx: cert.pfx,
        passphrase: cert.senha,
        timeout: 20_000,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
          'Content-Length': Buffer.byteLength(envelope),
        },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on('data', (p) => partes.push(p));
        res.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}: ${texto.slice(0, 300)}`));
          } else resolve(texto);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('SEFAZ não respondeu (timeout).')));
    req.on('error', reject);
    req.end(envelope);
  });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (nome) => ['docZip', 'retEvento', 'det'].includes(nome),
});

export function lerXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Distribuição DF-e
// ─────────────────────────────────────────────────────────────

export interface DocDistribuido {
  nsu: string;
  schema: string; // ex.: resNFe_v1.01.xsd, procNFe_v4.00.xsd, resEvento_v1.01.xsd
  xml: string;
}

export interface RespostaDist {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: DocDistribuido[];
}

/** Interpreta o retDistDFeInt (separado para poder ser testado sem a SEFAZ). */
export function interpretarDist(respostaSoap: string): RespostaDist {
  const doc = lerXml(respostaSoap);
  const ret = (
    ((doc.Envelope as Record<string, unknown>)?.Body as Record<string, unknown>)?.nfeDistDFeInteresseResponse as Record<
      string,
      unknown
    >
  )?.nfeDistDFeInteresseResult as Record<string, unknown>;
  const r = (ret?.retDistDFeInt ?? {}) as Record<string, unknown>;
  const lote = (r.loteDistDFeInt ?? {}) as { docZip?: Record<string, string>[] };
  return {
    cStat: String(r.cStat ?? ''),
    xMotivo: String(r.xMotivo ?? ''),
    ultNSU: String(r.ultNSU ?? ''),
    maxNSU: String(r.maxNSU ?? ''),
    docs: (lote.docZip ?? []).map((z) => ({
      nsu: z['@NSU'],
      schema: z['@schema'],
      xml: gunzipSync(Buffer.from(z['#text'], 'base64')).toString('utf8'),
    })),
  };
}

/** Busca o próximo lote de documentos a partir do último NSU (até 50 por chamada). */
export async function distribuicaoPorNSU(
  cert: Certificado,
  cnpj: string,
  uf: string,
  ultNSU: string
): Promise<RespostaDist> {
  const corpo =
    '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>' +
    `<distDFeInt xmlns="${NS_NFE}" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>${UF_IBGE[uf]}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU></distDFeInt>` +
    '</nfeDadosMsg></nfeDistDFeInteresse>';
  const resposta = await soap(
    URL_DIST,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse',
    corpo,
    cert
  );
  return interpretarDist(resposta);
}

// ─────────────────────────────────────────────────────────────
// Ciência da Operação (evento 210210)
// ─────────────────────────────────────────────────────────────

function dataHoraBrasilia(): string {
  const d = new Date(Date.now() - 3 * 3_600_000);
  return `${d.toISOString().slice(0, 19)}-03:00`;
}

/** Monta e assina um <evento> de Ciência da Operação para a chave. */
export function eventoCienciaAssinado(cert: Certificado, cnpj: string, chave: string): string {
  const id = `ID210210${chave}01`;
  const evento =
    `<evento xmlns="${NS_NFE}" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>1</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dataHoraBrasilia()}</dhEvento>` +
    '<tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>' +
    '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>';

  const sig = new SignedXml({
    privateKey: cert.chavePem,
    publicCert: cert.certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(evento, {
    location: { reference: "//*[local-name(.)='infEvento']", action: 'after' },
  });
  return sig.getSignedXml();
}

export interface ResultadoEvento {
  chave: string;
  cStat: string;
  xMotivo: string;
  /** 135/136 = registrado; 573 = já havia ciência (duplicidade) */
  ok: boolean;
}

/** Registra a Ciência da Operação para até 20 chaves num único lote. */
export async function registrarCiencia(cert: Certificado, cnpj: string, chaves: string[]): Promise<ResultadoEvento[]> {
  if (!chaves.length) return [];
  if (chaves.length > 20) throw new Error('No máximo 20 eventos por lote.');
  const eventos = chaves.map((c) => eventoCienciaAssinado(cert, cnpj, c).replace(/^<\?xml[^>]*>/, ''));
  const idLote = String(Date.now()).slice(-15).padStart(15, '0');
  const corpo =
    '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">' +
    `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${idLote}</idLote>${eventos.join('')}</envEvento>` +
    '</nfeDadosMsg>';
  const resposta = await soap(
    URL_EVENTO,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento',
    corpo,
    cert
  );
  return interpretarEventos(resposta);
}

export function interpretarEventos(respostaSoap: string): ResultadoEvento[] {
  const doc = lerXml(respostaSoap);
  const body = (doc.Envelope as Record<string, unknown>)?.Body as Record<string, unknown>;
  const result = (body?.nfeRecepcaoEventoNFResult ?? body?.nfeResultMsg) as Record<string, unknown> | undefined;
  const ret = (result?.retEnvEvento ?? {}) as Record<string, unknown>;
  const lista = (ret.retEvento ?? []) as { infEvento: Record<string, string> }[];
  if (!lista.length) {
    throw new Error(`SEFAZ recusou o lote de eventos: ${ret.cStat ?? '?'} ${ret.xMotivo ?? ''}`.trim());
  }
  return lista.map(({ infEvento: i }) => ({
    chave: String(i.chNFe ?? ''),
    cStat: String(i.cStat ?? ''),
    xMotivo: String(i.xMotivo ?? ''),
    ok: ['135', '136', '573'].includes(String(i.cStat)),
  }));
}

// ─────────────────────────────────────────────────────────────
// leitura das notas
// ─────────────────────────────────────────────────────────────

export interface DadosNota {
  chave: string;
  cnpjEmitente: string;
  nomeEmitente: string;
  dataEmissao: string;
  valorTotal: number;
  cancelada: boolean;
  /** números de pedido citados na nota (xPed, informações complementares) */
  pedidos: string[];
}

function pedidosCitados(...textos: unknown[]): string[] {
  const todos = textos.flat().map((t) => String(t ?? '')).join(' ');
  return Array.from(new Set(todos.match(/\b\d{10,20}\b/g) ?? []));
}

/** Resumo (resNFe): vem antes da ciência, sem itens. */
export function lerResumo(xml: string): DadosNota {
  const r = (lerXml(xml).resNFe ?? {}) as Record<string, string>;
  return {
    chave: r.chNFe,
    cnpjEmitente: r.CNPJ ?? r.CPF ?? '',
    nomeEmitente: r.xNome ?? '',
    dataEmissao: r.dhEmi,
    valorTotal: Number(r.vNF),
    cancelada: r.cSitNFe === '3',
    pedidos: [],
  };
}

/** XML completo (nfeProc / procNFe). */
export function lerNotaCompleta(xml: string): DadosNota {
  const doc = lerXml(xml);
  const proc = (doc.nfeProc ?? doc.procNFe ?? {}) as Record<string, Record<string, unknown>>;
  const inf = ((proc.NFe as Record<string, unknown>)?.infNFe ?? {}) as Record<string, Record<string, unknown>>;
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const total = (inf.total?.ICMSTot ?? {}) as Record<string, string>;
  const det = (inf.det ?? []) as unknown as { prod?: Record<string, string> }[];
  const chave =
    String((proc.protNFe?.infProt as Record<string, string> | undefined)?.chNFe ?? '') ||
    String(inf['@Id'] ?? '').replace(/^NFe/, '');
  return {
    chave,
    cnpjEmitente: String(emit.CNPJ ?? emit.CPF ?? ''),
    nomeEmitente: String(emit.xNome ?? ''),
    dataEmissao: String(ide.dhEmi ?? ide.dEmi ?? ''),
    valorTotal: Number(total.vNF ?? 0),
    cancelada: false,
    pedidos: pedidosCitados(
      det.map((d) => d.prod?.xPed),
      (inf.infAdic as Record<string, string> | undefined)?.infCpl,
      (inf.compra as Record<string, string> | undefined)?.xPed
    ),
  };
}

/** Evento distribuído (resEvento/procEventoNFe): interessa o cancelamento (110111). */
export function lerEvento(xml: string): { chave: string; tpEvento: string } | null {
  const doc = lerXml(xml);
  const res = doc.resEvento as Record<string, string> | undefined;
  if (res) return { chave: res.chNFe, tpEvento: res.tpEvento };
  const proc = doc.procEventoNFe as Record<string, Record<string, Record<string, string>>> | undefined;
  const inf = proc?.evento?.infEvento;
  return inf ? { chave: inf.chNFe, tpEvento: inf.tpEvento } : null;
}

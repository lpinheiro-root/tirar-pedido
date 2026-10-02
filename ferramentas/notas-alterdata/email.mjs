// Leitura das NF-e que chegam por e-mail (ex.: notas de compras no CPF, que
// não passam pelo NF-Stock). Só leitura: a caixa é aberta em modo somente
// leitura (nada é marcado como lido, movido ou apagado), a busca é feita no
// próprio Gmail só por mensagens com anexo .xml e só os anexos XML de NF-e são
// baixados — o texto dos e-mails não é lido nem guardado.
//
// Configuração no .env (uma ou mais caixas, numeradas):
//   EMAIL_1_USUARIO=fulano@gmail.com
//   EMAIL_1_SENHA_APP=xxxx xxxx xxxx xxxx   (senha de app do Google)
//   EMAIL_1_SERVIDOR=imap.gmail.com          (opcional)

import { ImapFlow } from 'imapflow';

const DIAS_PRIMEIRA_BUSCA = 90;

export function caixasConfiguradas(env) {
  const caixas = [];
  for (let i = 1; i <= 10; i++) {
    const usuario = env[`EMAIL_${i}_USUARIO`];
    const senha = env[`EMAIL_${i}_SENHA_APP`];
    if (usuario && senha) {
      caixas.push({ usuario, senha: senha.replace(/\s+/g, ''), servidor: env[`EMAIL_${i}_SERVIDOR`] || 'imap.gmail.com' });
    }
  }
  return caixas;
}

/** Percorre a estrutura MIME e devolve as partes que são anexos XML. */
function partesXml(no, lista = []) {
  if (!no) return lista;
  if (no.childNodes) for (const filho of no.childNodes) partesXml(filho, lista);
  const nome = String(no.dispositionParameters?.filename ?? no.parameters?.name ?? '').toLowerCase();
  const tipo = String(no.type ?? '').toLowerCase();
  if (no.part && (nome.endsWith('.xml') || tipo === 'application/xml' || tipo === 'text/xml')) lista.push(no.part);
  return lista;
}

async function baixar(cliente, uid, parte) {
  const { content } = await cliente.download(uid, parte, { uid: true });
  const pedacos = [];
  for await (const p of content) pedacos.push(p);
  return Buffer.concat(pedacos).toString('utf8');
}

/**
 * Busca XMLs de NF-e novos na caixa. `estadoCaixa` guarda o último UID visto
 * (e o UIDVALIDITY, que muda se o Gmail recriar a pasta).
 * Devolve os XMLs encontrados; quem chama decide o que gravar.
 */
export async function xmlsDaCaixa(caixa, estadoCaixa) {
  const cliente = new ImapFlow({
    host: caixa.servidor,
    port: 993,
    secure: true,
    auth: { user: caixa.usuario, pass: caixa.senha },
    logger: false,
  });
  await cliente.connect();
  const xmls = [];
  try {
    // "Todos os e-mails" no Gmail; somente leitura
    const pasta = caixa.servidor.includes('gmail') ? '[Gmail]/All Mail' : 'INBOX';
    let caixaAberta;
    try {
      caixaAberta = await cliente.mailboxOpen(pasta, { readOnly: true });
    } catch {
      caixaAberta = await cliente.mailboxOpen(caixa.servidor.includes('gmail') ? '[Gmail]/Todos os e-mails' : 'INBOX', {
        readOnly: true,
      });
    }
    const validade = String(caixaAberta.uidValidity);
    if (estadoCaixa.uidValidity !== validade) {
      estadoCaixa.uidValidity = validade;
      estadoCaixa.ultimoUid = 0;
    }

    const criterio = caixa.servidor.includes('gmail')
      ? { gmraw: `has:attachment filename:xml newer_than:${DIAS_PRIMEIRA_BUSCA}d` }
      : { since: new Date(Date.now() - DIAS_PRIMEIRA_BUSCA * 86_400_000) };
    const uids = ((await cliente.search(criterio, { uid: true })) || []).filter((u) => u > (estadoCaixa.ultimoUid ?? 0));
    uids.sort((a, b) => a - b);

    for (const uid of uids) {
      const msg = await cliente.fetchOne(String(uid), { bodyStructure: true }, { uid: true });
      for (const parte of partesXml(msg?.bodyStructure)) {
        try {
          const xml = await baixar(cliente, String(uid), parte);
          if (/<(nfeProc|procNFe)[\s>]/.test(xml) || /<NFe[\s>]/.test(xml)) xmls.push(xml);
        } catch {
          // anexo ilegível: segue para o próximo
        }
      }
      estadoCaixa.ultimoUid = uid;
    }
  } finally {
    await cliente.logout().catch(() => {});
  }
  return xmls;
}

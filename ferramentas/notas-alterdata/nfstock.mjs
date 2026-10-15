// Fonte NF-Stock: entra com usuário e senha, percorre as empresas do "visualizar
// como", lista as NF-e recebidas do período e baixa o XML das notas novas.
// Pega também as notas sem manifestação, que ainda não foram para o Alterdata Pack.
// Só leitura: não manifesta, não envia e-mail, não altera nada no NF-Stock.
//
// Configuração no .env: NFSTOCK_URL, NFSTOCK_USUARIO, NFSTOCK_SENHA

const PAUSA_MS = 300; // entre requisições, para não sobrecarregar o site

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const dataBR = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

class SessaoNfstock {
  constructor(base) {
    this.base = base.replace(/\/+$/, '');
    this.cookies = new Map();
  }

  async req(caminho, opcoes = {}) {
    let url = caminho.startsWith('http') ? caminho : this.base + caminho;
    for (let i = 0; i < 6; i++) {
      await dormir(PAUSA_MS);
      const r = await fetch(url, {
        ...opcoes,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (natuhair-financas robo-notas)',
          cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          ...(opcoes.headers ?? {}),
        },
      });
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const [kv] = c.split(';');
        const j = kv.indexOf('=');
        this.cookies.set(kv.slice(0, j), kv.slice(j + 1));
      }
      const destino = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && destino) {
        url = new URL(destino, url).href;
        opcoes = { headers: opcoes.headers };
        continue;
      }
      return { status: r.status, url, texto: await r.text(), headers: r.headers };
    }
    throw new Error(`NF-Stock: redirecionamentos demais em ${caminho}`);
  }

  async entrar(usuario, senha) {
    const { texto } = await this.req('/');
    const token = texto.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1];
    if (!token) throw new Error('NF-Stock: tela de login mudou (token não encontrado)');
    const { url } = await this.req('/', {
      method: 'POST',
      body: new URLSearchParams({ Cnpj: usuario, Password: senha, RememberMe: 'false', __RequestVerificationToken: token }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!/\/Sistema\/Home/i.test(url)) throw new Error('NF-Stock: login recusado (confira usuário e senha)');
  }

  /** Empresas do seletor "visualizar como". */
  async empresas() {
    const { texto } = await this.req('/Nfe/Recebidas?pagina=1&tamanho=100');
    return [...texto.matchAll(/<option class="to-upper" value="(\d+)">\s*([^<]+?)\s*<\/option>/g)].map((m) => ({
      id: m[1],
      nome: m[2].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim(),
    }));
  }

  /** NF-e recebidas pela empresa com emissão no período: [{ id, cancelada }]. */
  async idsRecebidas(empresaId, de, ate) {
    await this.req(`/Clientes/VisualizarCliente?id=${empresaId}`);
    const filtro = new URLSearchParams({
      OrdernarPor: '', Tipo: '', MostrarOpcaoFiltroImportacao: '', Serie: '', Numero: '', Chave: '',
      StrCpfCnpjEmitente: '', NomeEmitente: '', UfPrestacao: '', DataDe: dataBR(de), DataAte: dataBR(ate),
      SituacaoManifestacao: '', Status: '', InscricaoEstadualDestinatario: '',
    });
    await this.req(`/Nfe/RecebidasFiltro?${filtro}`);
    const notas = new Map();
    for (let pagina = 1; pagina <= 100; pagina++) {
      const { texto } = await this.req(`/Nfe/Recebidas?pagina=${pagina}&tamanho=100`);
      // status no ícone da coluna Status: title "Autorizada"/"Authorized", "Cancelada"/"Cancelled"...
      const daPagina = [...texto.matchAll(/<tr[^>]*data-id="(\d+)"[\s\S]*?<\/tr>/g)].map((m) => ({
        id: m[1],
        cancelada: /cancel/i.test(m[0].match(/data-title="Status"[\s\S]*?title="([^"]*)"/)?.[1] ?? ''),
      }));
      const antes = notas.size;
      daPagina.forEach((n) => notas.set(n.id, n));
      if (daPagina.length < 100 || notas.size === antes) break;
    }
    return [...notas.values()];
  }

  async xml(idNota) {
    const { status, texto } = await this.req('/Downloads/NfeXml', {
      method: 'POST',
      body: JSON.stringify({ IdNota: idNota }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (status !== 200 || !/<(nfeProc|NFe)[\s>]/.test(texto)) return null;
    return texto;
  }

  /**
   * Chave de acesso de uma nota cancelada: o download dela vem num ZIP só com o
   * evento de cancelamento, e a chave está no nome do arquivo (<chave>_evento_...xml).
   */
  async chaveCancelada(idNota) {
    const { status, texto } = await this.req('/Downloads/NfeXml', {
      method: 'POST',
      body: JSON.stringify({ IdNota: idNota }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (status !== 200) return null;
    return chaveDoXml(texto) ?? texto.match(/(\d{44})_evento/)?.[1] ?? null;
  }
}

const chaveDoXml = (xml) => xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ?? xml.match(/Id="NFe(\d{44})"/)?.[1] ?? null;

/**
 * Notas novas do NF-Stock desde `dias` atrás. `estado.vistos` guarda os IDs já
 * baixados (com a data em que foram vistos) para não baixar de novo;
 * `estado.chaves` a chave de cada ID e `estado.canceladas` os cancelamentos já
 * gravados. Notas já baixadas que aparecem canceladas voltam em `canceladas`.
 */
export async function xmlsNovosDoNfstock(env, estado, dias) {
  const sessao = new SessaoNfstock(env.NFSTOCK_URL);
  await sessao.entrar(env.NFSTOCK_USUARIO, env.NFSTOCK_SENHA);
  const ate = new Date();
  const de = new Date(Date.now() - dias * 86_400_000);
  const hoje = ate.toISOString().slice(0, 10);
  estado.vistos ??= {};
  estado.chaves ??= {};
  estado.canceladas ??= {};

  const novas = [];
  const canceladas = [];
  let listadas = 0;
  for (const empresa of await sessao.empresas()) {
    const notas = await sessao.idsRecebidas(empresa.id, de, ate);
    listadas += notas.length;
    for (const { id, cancelada } of notas) {
      if (cancelada) {
        // cancelada: o NF-Stock não entrega mais o XML da nota, só o evento.
        // Marca a nota já gravada (por esta ou outra fonte); a chave sai do cache ou do ZIP.
        if (estado.canceladas[id]) continue;
        const chave = estado.chaves[id] ?? (await sessao.chaveCancelada(id));
        if (chave) canceladas.push({ id, chave });
      } else if (!estado.vistos[id]) {
        const xml = await sessao.xml(id);
        if (xml) novas.push({ id, xml, empresa: empresa.nome, chave: chaveDoXml(xml) });
      }
    }
  }
  // esquece IDs vistos há mais de 120 dias (já saíram da janela)
  const limite = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  for (const [id, quando] of Object.entries(estado.vistos)) {
    if (quando >= limite) continue;
    delete estado.vistos[id];
    delete estado.chaves[id];
  }
  for (const [id, quando] of Object.entries(estado.canceladas)) if (quando < limite) delete estado.canceladas[id];

  // quem chama marca só depois de gravar no Supabase
  const marcarVistas = (lista) =>
    lista.forEach(({ id, chave }) => {
      estado.vistos[id] = hoje;
      if (chave) estado.chaves[id] = chave;
    });
  const marcarCanceladas = (lista) => lista.forEach(({ id }) => (estado.canceladas[id] = hoje));
  return { novas, canceladas, listadas, marcarVistas, marcarCanceladas };
}

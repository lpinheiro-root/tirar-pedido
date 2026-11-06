import Link from 'next/link';
import { requireNfe } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { IconDownload } from '@/components/ui/Icons';
import { formatCurrency } from '@/lib/format';
import {
  ABAS,
  LIMITE_TELA,
  MAX_DIAS,
  buscarEmitidas,
  buscarEntradas,
  buscarNaoLancadas,
  buscarPorChave,
  diasNoPeriodo,
  filtrosParaUrl,
  lerFiltros,
  limparChave,
  nomesEmpresas,
  xmlEmitida,
  type Aba,
  type Filtros,
  type NotaEmitida,
  type NotaEntrada,
  type NotaNaoLancada,
} from '@/lib/nfe/dados';
import { chavesComXmlNoNfStock } from '@/lib/nfe/xml';

export const dynamic = 'force-dynamic';

const campo = 'h-9 rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-2 text-body-sm text-on-surface';
const th = 'px-3 py-2.5 font-medium';
const td = 'px-3 py-2 text-body-sm';
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const SITUACAO = {
  autorizada: { rotulo: 'Autorizada', cor: 'bg-green-100 text-green-800' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-red-100 text-red-800' },
  pendente: { rotulo: 'Sem autorização', cor: 'bg-amber-100 text-amber-800' },
} as const;

/**
 * NFE: notas fiscais direto do ERP (só leitura) — emitidas, entradas de fornecedores,
 * consulta por chave e notas recebidas no ERP que ainda não viraram nota de entrada.
 */
export default async function NfePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireNfe();
  const f = lerFiltros(searchParams);
  const aba: Aba = ABAS.some((a) => a.id === searchParams.aba) ? (searchParams.aba as Aba) : 'emitidas';

  let empresas = new Map<string, string>();
  try {
    empresas = await nomesEmpresas();
  } catch (e) {
    console.error('[nfe] empresas', e);
  }

  return (
    <div>
      <PageHeading
        title="NFE"
        subtitle="Notas fiscais direto do ERP: emitidas, entradas de fornecedores, consulta por chave e notas recebidas que ainda não foram lançadas. Só consulta — nada é alterado no ERP."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={filtrosParaUrl(f, { aba: a.id })}
            className={`rounded-full px-3 py-1.5 text-body-sm font-medium ${
              aba === a.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === 'chave' ? (
        <ConsultaChave chave={limparChave(String(searchParams.chave ?? ''))} empresas={empresas} />
      ) : (
        <Lista aba={aba} f={f} empresas={empresas} />
      )}
    </div>
  );
}

function Filtro({ aba, f, empresas }: { aba: Aba; f: Filtros; empresas: Map<string, string> }) {
  const rotuloData = aba === 'entradas' ? 'Lançamento de' : 'Emissão de';
  return (
    <Card className="mb-4 p-4">
      <form className="flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="aba" value={aba} />
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">{rotuloData}</label>
          <input type="date" name="de" defaultValue={f.de} className={campo} />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">até</label>
          <input type="date" name="ate" defaultValue={f.ate} className={campo} />
        </div>
        <div>
          <label className="mb-1 block text-label text-on-surface-variant">Empresa</label>
          <select name="empresa" defaultValue={f.empresa} className={`${campo} max-w-64`}>
            <option value="">Todas</option>
            {Array.from(empresas)
              .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
              .map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
          </select>
        </div>
        {aba === 'emitidas' && (
          <>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">Tipo</label>
              <select name="tipo" defaultValue={f.tipo} className={campo}>
                <option value="">Todas</option>
                <option value="saida">Saída</option>
                <option value="entrada">Entrada (emitida pela empresa)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-label text-on-surface-variant">Situação</label>
              <select name="situacao" defaultValue={f.situacao} className={campo}>
                <option value="">Todas</option>
                <option value="autorizada">Autorizada</option>
                <option value="cancelada">Cancelada</option>
                <option value="pendente">Sem autorização</option>
              </select>
            </div>
          </>
        )}
        {aba === 'entradas' && (
          <div>
            <label className="mb-1 block text-label text-on-surface-variant">Conta a pagar</label>
            <select name="cp" defaultValue={f.cp} className={campo}>
              <option value="">Todas</option>
              <option value="sim">Já gerou</option>
              <option value="nao">Não gerou</option>
            </select>
          </div>
        )}
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-label text-on-surface-variant">Buscar</label>
          <input
            name="busca"
            defaultValue={f.busca}
            placeholder={aba === 'emitidas' ? 'Nº, destinatário, CNPJ ou chave' : 'Nº, fornecedor, CNPJ ou chave'}
            className={`${campo} w-full`}
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:bg-primary/90"
        >
          Consultar
        </button>
        <a
          href={`/api/nfe/exportar${filtrosParaUrl(f, { aba })}`}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
        >
          <IconDownload width={16} height={16} /> Exportar Excel
        </a>
      </form>
    </Card>
  );
}

function Kpis({ itens }: { itens: { t: string; v: string; c?: string; d?: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((k) => (
        <Card key={k.t} className="p-4">
          <p className="text-label uppercase text-on-surface-variant">{k.t}</p>
          <p className={`mt-1 text-h2 ${k.c ?? 'text-on-surface'}`}>{k.v}</p>
          {k.d && <p className="text-label text-on-surface-variant">{k.d}</p>}
        </Card>
      ))}
    </div>
  );
}

function Baixar({ chave }: { chave: string }) {
  return (
    <span className="inline-flex gap-2 whitespace-nowrap">
      <a href={`/api/nfe/danfe?chave=${chave}`} target="_blank" className="font-medium text-primary hover:underline">
        DANFE
      </a>
      <a href={`/api/nfe/xml?chave=${chave}`} className="font-medium text-primary hover:underline">
        XML
      </a>
    </span>
  );
}

const Vazio = ({ cols, texto }: { cols: number; texto: string }) => (
  <tr>
    <td colSpan={cols} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
      {texto}
    </td>
  </tr>
);

function Aviso({ total }: { total: number }) {
  if (total <= LIMITE_TELA) return null;
  return (
    <p className="border-t border-border-muted px-4 py-3 text-body-sm text-on-surface-variant">
      Mostrando as {LIMITE_TELA} mais recentes de {total}. Use os filtros ou o Exportar Excel para ver todas.
    </p>
  );
}

async function Lista({ aba, f, empresas }: { aba: Aba; f: Filtros; empresas: Map<string, string> }) {
  const empresa = (id: string) => empresas.get(id) ?? id;
  let erro: string | null = null;
  if (diasNoPeriodo(f) < 1) erro = 'A data final é antes da inicial.';
  else if (diasNoPeriodo(f) > MAX_DIAS) erro = `Escolha um período de até ${MAX_DIAS} dias.`;

  let emitidas: NotaEmitida[] = [];
  let entradas: NotaEntrada[] = [];
  let naoLancadas: NotaNaoLancada[] = [];
  let comXml = new Set<string>();
  if (!erro) {
    try {
      if (aba === 'emitidas') emitidas = await buscarEmitidas(f);
      if (aba === 'entradas') entradas = await buscarEntradas(f);
      if (aba === 'naolancadas') naoLancadas = await buscarNaoLancadas(f);
      // Recebidas: XML/DANFE só quando a nota está no NF-Stock sincronizado.
      const chaves = [...entradas, ...naoLancadas].slice(0, LIMITE_TELA).map((n) => n.chave);
      if (chaves.length) comXml = await chavesComXmlNoNfStock(chaves);
    } catch (e) {
      console.error('[nfe]', e);
      erro = 'Não consegui consultar o ERP agora. Tente de novo em instantes.';
    }
  }

  return (
    <>
      <Filtro aba={aba} f={f} empresas={empresas} />
      {erro ? (
        <Card className="p-6 text-body-sm text-error">{erro}</Card>
      ) : aba === 'emitidas' ? (
        <>
          <Kpis
            itens={[
              { t: 'Notas', v: String(emitidas.length), d: `${br(f.de)} a ${br(f.ate)}` },
              {
                t: 'Valor autorizado',
                v: formatCurrency(emitidas.filter((n) => n.situacao === 'autorizada').reduce((s, n) => s + n.valor, 0)),
                c: 'text-green-700',
              },
              { t: 'Canceladas', v: String(emitidas.filter((n) => n.situacao === 'cancelada').length), c: 'text-error' },
              { t: 'Sem autorização', v: String(emitidas.filter((n) => n.situacao === 'pendente').length), c: 'text-amber-700' },
            ]}
          />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
                  <tr>
                    <th className={th}>Emissão</th>
                    <th className={th}>Nº / série</th>
                    <th className={th}>Empresa</th>
                    <th className={th}>Destinatário</th>
                    <th className={th}>Natureza</th>
                    <th className={`${th} text-right`}>Valor</th>
                    <th className={th}>Situação</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {emitidas.slice(0, LIMITE_TELA).map((n) => (
                    <tr key={n.id} className="border-t border-border-muted align-top">
                      <td className={`${td} whitespace-nowrap`}>{br(n.emissao)}</td>
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {n.numero}
                        {n.serie && <span className="text-on-surface-variant"> / {n.serie}</span>}
                        {n.tipo === 'entrada' && <span className="ml-1 rounded-sm bg-sky-100 px-1.5 text-label text-sky-800">entrada</span>}
                      </td>
                      <td className={`${td} text-on-surface-variant`}>{empresa(n.empresaId)}</td>
                      <td className={td}>
                        {n.destinatario}
                        <div className="text-label text-on-surface-variant">
                          {n.documento} {n.uf && `· ${n.uf}`}
                        </div>
                      </td>
                      <td className={`${td} text-on-surface-variant`}>{n.natureza}</td>
                      <td className={`${td} whitespace-nowrap text-right font-medium`}>{formatCurrency(n.valor)}</td>
                      <td className={td}>
                        <span className={`whitespace-nowrap rounded-sm px-2 py-0.5 text-label font-medium ${SITUACAO[n.situacao].cor}`}>
                          {SITUACAO[n.situacao].rotulo}
                        </span>
                      </td>
                      <td className={td}>{n.chave && n.situacao !== 'pendente' && <Baixar chave={n.chave} />}</td>
                    </tr>
                  ))}
                  {emitidas.length === 0 && <Vazio cols={8} texto="Nenhuma nota emitida nesse período com esses filtros." />}
                </tbody>
              </table>
            </div>
            <Aviso total={emitidas.length} />
          </Card>
        </>
      ) : aba === 'entradas' ? (
        <>
          <Kpis
            itens={[
              { t: 'Notas lançadas', v: String(entradas.length), d: `${br(f.de)} a ${br(f.ate)}` },
              { t: 'Valor', v: formatCurrency(entradas.reduce((s, n) => s + n.valor, 0)) },
              {
                t: 'Sem conta a pagar',
                v: String(entradas.filter((n) => n.geraCp && !n.geradoCp).length),
                c: 'text-amber-700',
                d: 'operação gera CP, mas não gerou',
              },
              { t: 'Fornecedores', v: String(new Set(entradas.map((n) => n.cnpj || n.fornecedor)).size) },
            ]}
          />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
                  <tr>
                    <th className={th}>Lançamento</th>
                    <th className={th}>Nº / série</th>
                    <th className={th}>Empresa</th>
                    <th className={th}>Fornecedor</th>
                    <th className={th}>Operação</th>
                    <th className={`${th} text-right`}>Valor</th>
                    <th className={th}>Conta a pagar</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {entradas.slice(0, LIMITE_TELA).map((n) => (
                    <tr key={n.id} className="border-t border-border-muted align-top">
                      <td className={`${td} whitespace-nowrap`}>
                        {br(n.lancamento)}
                        <div className="text-label text-on-surface-variant">emitida {br(n.emissao)}</div>
                      </td>
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {n.numero}
                        {n.serie && <span className="text-on-surface-variant"> / {n.serie}</span>}
                      </td>
                      <td className={`${td} text-on-surface-variant`}>{empresa(n.empresaId)}</td>
                      <td className={td}>
                        {n.fornecedor}
                        <div className="text-label text-on-surface-variant">{n.cnpj}</div>
                      </td>
                      <td className={`${td} text-on-surface-variant`}>{n.operacao}</td>
                      <td className={`${td} whitespace-nowrap text-right font-medium`}>{formatCurrency(n.valor)}</td>
                      <td className={td}>
                        {n.geradoCp ? (
                          <span className="rounded-sm bg-green-100 px-2 py-0.5 text-label font-medium text-green-800">Gerou</span>
                        ) : n.geraCp ? (
                          <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-label font-medium text-amber-800">Ainda não</span>
                        ) : (
                          <span className="text-label text-on-surface-variant">Não gera</span>
                        )}
                      </td>
                      <td className={td}>{comXml.has(n.chave) && <Baixar chave={n.chave} />}</td>
                    </tr>
                  ))}
                  {entradas.length === 0 && <Vazio cols={8} texto="Nenhuma nota de entrada lançada nesse período com esses filtros." />}
                </tbody>
              </table>
            </div>
            <Aviso total={entradas.length} />
          </Card>
        </>
      ) : (
        <>
          <Card className="mb-4 p-4 text-body-sm text-on-surface-variant">
            Notas que chegaram ao ERP pelo recebimento de XML e ainda não viraram nota de entrada. A lista completa do que a SEFAZ
            registrou contra os CNPJs do grupo fica num banco do ERP que o sistema ainda não acessa.
          </Card>
          <Kpis
            itens={[
              { t: 'Não lançadas', v: String(naoLancadas.length), c: naoLancadas.length ? 'text-amber-700' : 'text-on-surface' },
              { t: 'Valor', v: formatCurrency(naoLancadas.reduce((s, n) => s + n.valor, 0)) },
            ]}
          />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low text-label uppercase text-on-surface-variant">
                  <tr>
                    <th className={th}>Emissão</th>
                    <th className={th}>Nº / série</th>
                    <th className={th}>Empresa</th>
                    <th className={th}>Fornecedor</th>
                    <th className={`${th} text-right`}>Valor</th>
                    <th className={th}>Recebida no ERP</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {naoLancadas.slice(0, LIMITE_TELA).map((n) => (
                    <tr key={n.id} className="border-t border-border-muted align-top">
                      <td className={`${td} whitespace-nowrap`}>{br(n.emissao)}</td>
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {n.numero}
                        {n.serie && <span className="text-on-surface-variant"> / {n.serie}</span>}
                      </td>
                      <td className={`${td} text-on-surface-variant`}>{empresa(n.empresaId)}</td>
                      <td className={td}>
                        {n.fornecedor}
                        <div className="text-label text-on-surface-variant">{n.cnpj}</div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-right font-medium`}>{formatCurrency(n.valor)}</td>
                      <td className={`${td} whitespace-nowrap text-on-surface-variant`}>
                        {n.recebimento ? br(n.recebimento) : '—'}
                        {n.status && <div className="text-label">status {n.status}</div>}
                      </td>
                      <td className={td}>{comXml.has(n.chave) && <Baixar chave={n.chave} />}</td>
                    </tr>
                  ))}
                  {naoLancadas.length === 0 && <Vazio cols={7} texto="Nenhuma nota recebida sem lançamento nesse período." />}
                </tbody>
              </table>
            </div>
            <Aviso total={naoLancadas.length} />
          </Card>
        </>
      )}
    </>
  );
}

async function ConsultaChave({ chave, empresas }: { chave: string; empresas: Map<string, string> }) {
  const empresa = (id: string) => empresas.get(id) ?? id;
  const valida = chave.length === 44;
  let resultado: Awaited<ReturnType<typeof buscarPorChave>> | null = null;
  let temXml = false;
  let erro: string | null = null;
  if (valida) {
    try {
      resultado = await buscarPorChave(chave);
      temXml = Boolean(await xmlEmitida(chave)) || (await chavesComXmlNoNfStock([chave])).has(chave);
    } catch (e) {
      console.error('[nfe] chave', e);
      erro = 'Não consegui consultar o ERP agora. Tente de novo em instantes.';
    }
  }
  const nada = resultado && !resultado.emitidas.length && !resultado.entradas.length && !resultado.recebidas.length;
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="flex gap-3 py-1 text-body-sm">
      <span className="w-40 shrink-0 text-on-surface-variant">{rotulo}</span>
      <span className="text-on-surface">{valor}</span>
    </div>
  );

  return (
    <>
      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="aba" value="chave" />
          <div className="min-w-80 flex-1">
            <label className="mb-1 block text-label text-on-surface-variant">Chave de acesso (44 números)</label>
            <input name="chave" defaultValue={chave} placeholder="Cole a chave da NF-e" className={`${campo} w-full font-mono`} autoFocus />
          </div>
          <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:bg-primary/90">
            Consultar
          </button>
        </form>
        {chave && !valida && <p className="mt-2 text-body-sm text-error">A chave tem {chave.length} números; precisa ter 44.</p>}
      </Card>

      {erro && <Card className="p-6 text-body-sm text-error">{erro}</Card>}
      {nada && (
        <Card className="p-6 text-body-sm text-on-surface-variant">
          Essa chave não está no ERP: não é nota emitida pelo grupo, nem nota de entrada lançada, nem XML recebido.
          {temXml && ' O XML dela está no NF-Stock — dá para baixar abaixo.'}
        </Card>
      )}
      {resultado && (
        <div className="space-y-4">
          {temXml && (
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <span className="text-body-sm text-on-surface-variant">Arquivos da nota:</span>
              <a href={`/api/nfe/danfe?chave=${chave}`} target="_blank" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary">
                Abrir DANFE
              </a>
              <a href={`/api/nfe/xml?chave=${chave}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-primary px-3 text-body-sm font-medium text-primary">
                <IconDownload width={16} height={16} /> Baixar XML
              </a>
            </Card>
          )}
          {resultado.emitidas.map((n) => (
            <Card key={`e${n.id}`} className="p-5">
              <h3 className="mb-2 text-body font-semibold">Nota emitida pelo grupo</h3>
              {linha('Número / série', `${n.numero}${n.serie ? ` / ${n.serie}` : ''} (${n.tipo === 'saida' ? 'saída' : 'entrada'})`)}
              {linha('Emissão', br(n.emissao))}
              {linha('Empresa', empresa(n.empresaId))}
              {linha('Destinatário', `${n.destinatario} · ${n.documento}${n.uf ? ` · ${n.uf}` : ''}`)}
              {linha('Natureza', n.natureza)}
              {linha('Valor', formatCurrency(n.valor))}
              {linha('Situação', <span className={`rounded-sm px-2 py-0.5 text-label font-medium ${SITUACAO[n.situacao].cor}`}>{SITUACAO[n.situacao].rotulo}</span>)}
              {n.protocolo && linha('Protocolo', `${n.protocolo}${n.autorizacao ? ` · ${br(n.autorizacao)} ${n.autorizacao.slice(11)}` : ''}`)}
            </Card>
          ))}
          {resultado.entradas.map((n) => (
            <Card key={`n${n.id}`} className="p-5">
              <h3 className="mb-2 text-body font-semibold">Nota de entrada lançada no ERP</h3>
              {linha('Número / série', `${n.numero}${n.serie ? ` / ${n.serie}` : ''}`)}
              {linha('Emissão / lançamento', `${br(n.emissao)} · lançada em ${br(n.lancamento)}`)}
              {linha('Empresa', empresa(n.empresaId))}
              {linha('Fornecedor', `${n.fornecedor} · ${n.cnpj}`)}
              {linha('Operação', n.operacao)}
              {linha('Valor', formatCurrency(n.valor))}
              {linha('Conta a pagar', n.geradoCp ? 'Gerou' : n.geraCp ? 'Ainda não gerou' : 'A operação não gera')}
            </Card>
          ))}
          {resultado.recebidas.length > 0 && resultado.entradas.length === 0 &&
            resultado.recebidas.map((n) => (
              <Card key={`r${n.id}`} className="border-amber-300 p-5">
                <h3 className="mb-2 text-body font-semibold text-amber-800">Recebida no ERP, mas ainda não lançada</h3>
                {linha('Número / série', `${n.numero}${n.serie ? ` / ${n.serie}` : ''}`)}
                {linha('Emissão', br(n.emissao))}
                {linha('Empresa', empresa(n.empresaId))}
                {linha('Fornecedor', `${n.fornecedor} · ${n.cnpj}`)}
                {linha('Valor', formatCurrency(n.valor))}
              </Card>
            ))}
        </div>
      )}
    </>
  );
}

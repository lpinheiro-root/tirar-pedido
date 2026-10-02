import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/format';
import { lerXml } from '@/lib/cartao/sefaz';
import { ImprimirButton } from './ImprimirButton';
import { xmlDaNota } from '@/lib/cartao/xmlNota';

type No = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0);

function cnpjCpf(v: unknown) {
  const s = txt(v);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return s;
}

function endereco(e: No | undefined) {
  if (!e) return '';
  return [
    [txt(e.xLgr), txt(e.nro)].filter(Boolean).join(', '),
    txt(e.xBairro),
    [txt(e.xMun), txt(e.UF)].filter(Boolean).join('/'),
    txt(e.CEP),
  ]
    .filter(Boolean)
    .join(' · ');
}

function Campo({ rotulo, valor, className = '' }: { rotulo: string; valor: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-black/60 px-2 py-1 ${className}`}>
      <p className="text-[9px] uppercase leading-tight text-black/70">{rotulo}</p>
      <p className="text-[12px] leading-tight text-black">{valor || ' '}</p>
    </div>
  );
}

/** DANFE simplificado a partir do XML autorizado (imprimir / salvar como PDF pelo navegador). */
export default async function DanfePage({ params }: { params: { id: string } }) {
  await requireRepresentante('admin');
  const { data: nota } = await createClient()
    .from('cartao_notas')
    .select('chave, xml, xml_gz')
    .eq('id', params.id)
    .maybeSingle();
  const xml = xmlDaNota(nota);
  if (!nota || !xml) notFound();

  const doc = lerXml(xml);
  const proc = (doc.nfeProc ?? doc.procNFe ?? {}) as No;
  const inf = ((proc.NFe as No)?.infNFe ?? {}) as Record<string, No>;
  const prot = ((proc.protNFe as No)?.infProt ?? {}) as No;
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const tot = ((inf.total as No)?.ICMSTot ?? {}) as No;
  const itens = (inf.det ?? []) as unknown as { '@nItem': string; prod: No }[];
  const chave = nota.chave.replace(/(\d{4})(?=\d)/g, '$1 ');
  const emissao = txt(ide.dhEmi ?? ide.dEmi);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/admin/cartao/notas" className="text-body-sm font-medium text-primary hover:underline">
          ← Voltar para notas fiscais
        </Link>
        <div className="flex gap-2">
          <a
            href={`/api/cartao/notas/${params.id}/xml`}
            className="inline-flex h-9 items-center rounded-md border border-primary px-3 text-body-sm font-medium text-primary hover:bg-primary/5"
          >
            Baixar XML
          </a>
          <ImprimirButton />
        </div>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-4 font-sans text-black shadow-ambient print:max-w-none print:p-0 print:shadow-none">
        <div className="grid grid-cols-[1fr_auto] gap-1">
          <div className="border border-black/60 p-2">
            <p className="text-[14px] font-bold">{txt(emit.xNome)}</p>
            <p className="text-[11px]">{endereco(emit.enderEmit as No)}</p>
            <p className="text-[11px]">
              CNPJ {cnpjCpf(emit.CNPJ ?? emit.CPF)} · IE {txt(emit.IE)}
            </p>
          </div>
          <div className="w-44 border border-black/60 p-2 text-center">
            <p className="text-[16px] font-bold">DANFE</p>
            <p className="text-[9px]">Documento Auxiliar da Nota Fiscal Eletrônica</p>
            <p className="mt-1 text-[11px]">
              {txt(ide.tpNF) === '0' ? '0 - Entrada' : '1 - Saída'}
            </p>
            <p className="text-[12px] font-bold">
              Nº {txt(ide.nNF)} · Série {txt(ide.serie)}
            </p>
          </div>
        </div>

        <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
          <Campo rotulo="Chave de acesso" valor={<span className="font-mono text-[11px]">{chave}</span>} />
          <Campo
            rotulo="Protocolo de autorização"
            valor={`${txt(prot.nProt)} ${prot.dhRecbto ? new Date(txt(prot.dhRecbto)).toLocaleString('pt-BR') : ''}`}
          />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
          <Campo rotulo="Natureza da operação" valor={txt(ide.natOp)} />
          <Campo rotulo="Data de emissão" valor={emissao ? new Date(emissao).toLocaleDateString('pt-BR') : ''} />
        </div>

        <p className="mt-2 text-[10px] font-bold uppercase">Destinatário</p>
        <div className="grid grid-cols-[2fr_1fr] gap-1">
          <Campo rotulo="Nome / razão social" valor={txt(dest.xNome)} />
          <Campo rotulo="CNPJ / CPF" valor={cnpjCpf(dest.CNPJ ?? dest.CPF)} />
        </div>
        <Campo className="mt-1" rotulo="Endereço" valor={endereco(dest.enderDest as No)} />

        <p className="mt-2 text-[10px] font-bold uppercase">Itens</p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase">
              {['Código', 'Descrição', 'NCM', 'CFOP', 'Un', 'Qtd', 'V. unit', 'V. total'].map((h) => (
                <th key={h} className="border border-black/60 px-1 py-0.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((d) => (
              <tr key={d['@nItem']}>
                <td className="border border-black/60 px-1">{txt(d.prod.cProd)}</td>
                <td className="border border-black/60 px-1">{txt(d.prod.xProd)}</td>
                <td className="border border-black/60 px-1">{txt(d.prod.NCM)}</td>
                <td className="border border-black/60 px-1">{txt(d.prod.CFOP)}</td>
                <td className="border border-black/60 px-1">{txt(d.prod.uCom)}</td>
                <td className="border border-black/60 px-1 text-right">{num(d.prod.qCom).toLocaleString('pt-BR')}</td>
                <td className="border border-black/60 px-1 text-right">{formatCurrency(num(d.prod.vUnCom))}</td>
                <td className="border border-black/60 px-1 text-right">{formatCurrency(num(d.prod.vProd))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-2 text-[10px] font-bold uppercase">Totais</p>
        <div className="grid grid-cols-5 gap-1">
          <Campo rotulo="Produtos" valor={formatCurrency(num(tot.vProd))} />
          <Campo rotulo="Frete" valor={formatCurrency(num(tot.vFrete))} />
          <Campo rotulo="Desconto" valor={formatCurrency(num(tot.vDesc))} />
          <Campo rotulo="ICMS" valor={formatCurrency(num(tot.vICMS))} />
          <Campo rotulo="Total da nota" valor={<strong>{formatCurrency(num(tot.vNF))}</strong>} />
        </div>

        {txt((inf.infAdic as No | undefined)?.infCpl) && (
          <>
            <p className="mt-2 text-[10px] font-bold uppercase">Informações complementares</p>
            <div className="border border-black/60 p-2 text-[10px]">{txt((inf.infAdic as No).infCpl)}</div>
          </>
        )}
        <p className="mt-2 text-[9px] text-black/60">
          DANFE simplificado gerado a partir do XML autorizado pela SEFAZ. O documento fiscal válido é o XML.
        </p>
      </div>
    </div>
  );
}

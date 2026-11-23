import { NextResponse } from 'next/server';
import { requireFidc } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { lerBordero, linhasDoPdf } from '@/lib/fidc/bordero';
import { EMPRESAS_CONHECIDAS, FIDCS_CONHECIDAS, empresaDoCedente, fidcDoBordero } from '@/lib/fidc/nomes';
import { vincularBorderos } from '@/lib/fidc/vincular';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export type ResultadoBordero =
  | {
      arquivo: string;
      ok: true;
      id: number;
      fidc: string;
      empresa: string;
      numero: string;
      data: string;
      bruto: number;
      despesas: number;
      liquido: number;
      qtdTitulos: number;
      vinculo: 'planilha' | 'novo';
      atualizado: boolean;
      avisos: string[];
    }
  | { arquivo: string; ok: false; erro: string }
  | {
      arquivo: string;
      ok: false;
      falta: { fidc: boolean; empresa: boolean };
      fidcNome: string;
      cedente: string;
      cnpj: string;
      fidcs: string[];
      empresas: string[];
    };

const SQL = 'Falta rodar o supabase/fidc_bordero.sql no Supabase.';
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Recebe um ou mais PDFs de borderô ("arquivos"). Opcional: "fidc" e "empresa" para quando o
 * sistema não reconheceu sozinho (a escolha da empresa fica guardada pelo CNPJ do cedente).
 * Importar o mesmo borderô de novo atualiza, não duplica.
 */
export async function POST(request: Request) {
  const { representante } = await requireFidc();
  const form = await request.formData();
  const arquivos = form.getAll('arquivos').filter((a): a is File => a instanceof File && a.size > 0);
  const fidcEscolhida = String(form.get('fidc') ?? '').trim();
  const empresaEscolhida = String(form.get('empresa') ?? '').trim();
  if (!arquivos.length) return NextResponse.json({ erro: 'Selecione o PDF do borderô.' }, { status: 400 });

  const db = createServiceRoleClient();
  const resultados: ResultadoBordero[] = [];

  for (const arq of arquivos) {
    const arquivo = arq.name;
    try {
      if (!/\.pdf$/i.test(arquivo)) throw new Error('O borderô precisa ser o PDF baixado do Meus Recebíveis.');
      const b = lerBordero(await linhasDoPdf(await arq.arrayBuffer()));

      const fidc = (FIDCS_CONHECIDAS.includes(fidcEscolhida) && fidcEscolhida) || fidcDoBordero(b.fidcNome);
      let empresa = EMPRESAS_CONHECIDAS.includes(empresaEscolhida) ? empresaEscolhida : null;
      if (!empresa && b.cedenteCnpj) {
        const { data, error } = await db.from('fidc_cedentes').select('empresa').eq('cnpj', b.cedenteCnpj).maybeSingle();
        if (error) throw new Error(/fidc_cedentes/.test(error.message) ? SQL : error.message);
        empresa = data?.empresa ?? null;
      }
      empresa ??= empresaDoCedente(b.cedenteNome, b.cedenteTelefone);
      if (!fidc || !empresa) {
        resultados.push({
          arquivo,
          ok: false,
          falta: { fidc: !fidc, empresa: !empresa },
          fidcNome: b.fidcNome,
          cedente: b.cedenteNome,
          cnpj: b.cedenteCnpj,
          fidcs: FIDCS_CONHECIDAS,
          empresas: EMPRESAS_CONHECIDAS,
        });
        continue;
      }
      if (b.cedenteCnpj) {
        const r = await db.from('fidc_cedentes').upsert({ cnpj: b.cedenteCnpj, empresa, nome: b.cedenteNome }, { onConflict: 'cnpj' });
        if (r.error) throw new Error(r.error.message);
      }

      const { data: antes } = await db
        .from('fidc_borderos')
        .select('id')
        .eq('fidc', fidc)
        .eq('cedente_cnpj', b.cedenteCnpj)
        .eq('numero', b.numero)
        .maybeSingle();
      const { data: salvo, error: e1 } = await db
        .from('fidc_borderos')
        .upsert(
          {
            atualizado_em: new Date().toISOString(),
            usuario_id: representante.id,
            usuario_nome: representante.nome,
            arquivo,
            fidc,
            fidc_nome: b.fidcNome,
            empresa,
            cedente_nome: b.cedenteNome,
            cedente_cnpj: b.cedenteCnpj,
            tipo: b.tipo,
            numero: b.numero,
            data: b.data,
            qtd_titulos: b.qtdTitulos,
            bruto: b.bruto,
            desagio: b.desagio,
            taxa_servico: b.taxaServico,
            iss: b.iss,
            iof: b.iof,
            despesas_bancarias: b.despesasBancarias,
            despesas: b.despesas,
            liquido_operacao: b.liquidoOperacao,
            recompra: b.recompra,
            desconto: b.desconto,
            liquido: b.liquido,
          },
          { onConflict: 'fidc,cedente_cnpj,numero' }
        )
        .select('id')
        .single();
      if (e1) throw new Error(/fidc_borderos/.test(e1.message) ? SQL : e1.message);
      const id = salvo.id as number;

      // títulos: troca todos
      const d = await db.from('fidc_bordero_titulos').delete().eq('bordero_id', id);
      if (d.error) throw new Error(d.error.message);
      if (b.titulos.length) {
        const t = await db.from('fidc_bordero_titulos').insert(b.titulos.map((x) => ({ ...x, bordero_id: id })));
        if (t.error) throw new Error(t.error.message);
      }

      // desfaz a ligação anterior (o borderô pode ter mudado de data/valor) e liga de novo
      const u = await db.from('fidc_operacoes').update({ bordero_id: null }).eq('bordero_id', id).neq('origem', 'bordero');
      if (u.error) throw new Error(u.error.message);
      const x = await db.from('fidc_operacoes').delete().eq('bordero_id', id).eq('origem', 'bordero');
      if (x.error) throw new Error(x.error.message);
      await vincularBorderos(db, [b.data]);
      const { data: op } = await db.from('fidc_operacoes').select('origem').eq('bordero_id', id).limit(1).maybeSingle();

      resultados.push({
        arquivo,
        ok: true,
        id,
        fidc,
        empresa,
        numero: b.numero,
        data: b.data,
        bruto: b.bruto,
        despesas: b.despesas,
        liquido: b.liquido,
        qtdTitulos: b.titulos.length,
        vinculo: op?.origem === 'bordero' ? 'novo' : 'planilha',
        atualizado: Boolean(antes),
        avisos: b.avisos,
      });
    } catch (e) {
      resultados.push({ arquivo, ok: false, erro: msg(e) });
    }
  }

  return NextResponse.json({ resultados });
}

/** Títulos de um borderô (?id=). */
export async function GET(request: Request) {
  await requireFidc();
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ erro: 'Borderô inválido.' }, { status: 400 });
  const db = createServiceRoleClient();
  const [{ data: bordero, error }, { data: titulos, error: e2 }] = await Promise.all([
    db.from('fidc_borderos').select('*').eq('id', id).maybeSingle(),
    db.from('fidc_bordero_titulos').select('ordem,numero,vencimento,sacado,valor,desagio,desagiado').eq('bordero_id', id).order('ordem'),
  ]);
  if (error || e2) return NextResponse.json({ erro: (error ?? e2)!.message }, { status: 500 });
  if (!bordero) return NextResponse.json({ erro: 'Borderô não encontrado.' }, { status: 404 });
  return NextResponse.json({ bordero, titulos: titulos ?? [] });
}

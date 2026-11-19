import { NextResponse } from 'next/server';
import { requireFidc } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { lerAbasXlsx } from '@/lib/fidc/lerXlsx';
import { lerPlanilhaFidc } from '@/lib/fidc/planilha';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const erro = (mensagem: string, status = 400) => NextResponse.json({ erro: mensagem }, { status });

/**
 * Recebe a planilha de operações (pode ser a planilha inteira, com todas as abas,
 * ou só a do dia). Os dias que vierem nela são apagados e gravados de novo, então
 * importar a mesma planilha duas vezes não duplica nada e correções em dias
 * antigos entram.
 */
export async function POST(request: Request) {
  const { representante } = await requireFidc();
  const form = await request.formData();
  const arquivo = form.get('planilha');
  if (!(arquivo instanceof File) || !arquivo.size) return erro('Selecione a planilha de operações (.xlsx).');
  if (!/\.xlsx$/i.test(arquivo.name)) return erro('A planilha precisa estar em .xlsx.');

  let lida;
  try {
    lida = lerPlanilhaFidc(await lerAbasXlsx(await arquivo.arrayBuffer()));
  } catch (e) {
    return erro(`Não consegui abrir a planilha: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!lida.operacoes.length) {
    return erro('Não achei nenhuma operação. Confira se é a planilha de operações (abas com "FIDC/ EMPRESA").');
  }

  const db = createServiceRoleClient();
  const dias = Array.from(new Set(lida.operacoes.map((o) => o.data).concat(lida.faturamentos.map((f) => f.data_operacao)))).sort();

  const { data: imp, error: erroImp } = await db
    .from('fidc_importacoes')
    .insert({
      usuario_id: representante.id,
      usuario_nome: representante.nome,
      arquivo: arquivo.name,
      dias: dias.length,
      operacoes: lida.operacoes.length,
      primeira_data: dias[0],
      ultima_data: dias[dias.length - 1],
      avisos: lida.avisos,
    })
    .select('id')
    .single();
  if (erroImp) {
    if (/fidc_importacoes/.test(erroImp.message)) return erro('Falta rodar o supabase/fidc.sql no Supabase.', 500);
    return erro(erroImp.message, 500);
  }

  try {
    // apaga os dias que vieram na planilha (em blocos, para a URL não ficar enorme)
    for (let i = 0; i < dias.length; i += 100) {
      const bloco = dias.slice(i, i + 100);
      const a = await db.from('fidc_operacoes').delete().in('data', bloco);
      if (a.error) throw new Error(a.error.message);
      const b = await db.from('fidc_faturamentos').delete().in('data_operacao', bloco);
      if (b.error) throw new Error(b.error.message);
    }
    for (let i = 0; i < lida.operacoes.length; i += 500) {
      const { error } = await db
        .from('fidc_operacoes')
        .insert(lida.operacoes.slice(i, i + 500).map((o) => ({ ...o, importacao_id: imp.id })));
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < lida.faturamentos.length; i += 500) {
      const { error } = await db
        .from('fidc_faturamentos')
        .insert(lida.faturamentos.slice(i, i + 500).map((f) => ({ ...f, importacao_id: imp.id })));
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    return erro(`Falha ao gravar no banco: ${e instanceof Error ? e.message : String(e)}. Importe de novo.`, 500);
  }

  return NextResponse.json({
    dias: dias.length,
    operacoes: lida.operacoes.length,
    faturamentos: lida.faturamentos.length,
    primeira: dias[0],
    ultima: dias[dias.length - 1],
    avisos: lida.avisos,
    abasIgnoradas: lida.abasIgnoradas,
  });
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Liga cada borderô dos dias informados à sua operação.
 *
 * - Se a planilha do financeiro já tem a mesma operação (mesmo dia, FIDC, empresa e valor bruto),
 *   a linha da planilha ganha o borderô e nada é duplicado.
 * - Se não tem (o borderô chegou antes da planilha), o borderô vira uma operação própria
 *   (origem "bordero"). Quando a planilha desse dia for importada, essa linha é trocada pela
 *   da planilha.
 */
export async function vincularBorderos(db: SupabaseClient, dias: string[]) {
  for (let i = 0; i < dias.length; i += 100) {
    const { data: borderos, error } = await db
      .from('fidc_borderos')
      .select('id,data,fidc,empresa,numero,bruto,recompra,desconto,despesas,liquido')
      .in('data', dias.slice(i, i + 100));
    if (error) throw new Error(error.message);

    for (const b of borderos ?? []) {
      const bruto = Number(b.bruto);
      const { data: ops, error: e1 } = await db
        .from('fidc_operacoes')
        .select('id,bruto,origem,bordero_id')
        .eq('data', b.data)
        .eq('fidc', b.fidc)
        .eq('empresa', b.empresa);
      if (e1) throw new Error(e1.message);
      const lista = ops ?? [];
      const livres = lista.filter((o) => o.origem !== 'bordero' && (!o.bordero_id || o.bordero_id === b.id));
      const irmaos = (borderos ?? []).filter((x) => x.data === b.data && x.fidc === b.fidc && x.empresa === b.empresa).length;
      // mesmo valor bruto; ou, se só existe uma operação e um borderô dessa FIDC/empresa no dia,
      // é a mesma (a planilha pode ter digitado o valor diferente) e não pode entrar em dobro
      const daPlanilha =
        livres.find((o) => Math.abs(Number(o.bruto) - bruto) < 0.01) ??
        (livres.length === 1 && irmaos === 1 && lista.filter((o) => o.origem !== 'bordero').length === 1 ? livres[0] : undefined);
      const propria = lista.find((o) => o.origem === 'bordero' && o.bordero_id === b.id);

      if (daPlanilha) {
        if (daPlanilha.bordero_id !== b.id) {
          const r = await db.from('fidc_operacoes').update({ bordero_id: b.id }).eq('id', daPlanilha.id);
          if (r.error) throw new Error(r.error.message);
        }
        if (propria) {
          const r = await db.from('fidc_operacoes').delete().eq('id', propria.id);
          if (r.error) throw new Error(r.error.message);
        }
        continue;
      }

      const linha = {
        data: b.data,
        aba: `Borderô ${b.fidc} ${b.numero}`,
        ordem: 1,
        nome_original: `${b.fidc} - ${b.empresa} (borderô ${b.numero})`.toUpperCase(),
        fidc: b.fidc,
        empresa: b.empresa,
        valor_operacao: bruto,
        bruto,
        recompras: Number(b.recompra),
        desconto: Number(b.desconto),
        despesas: Number(b.despesas),
        liquido: Number(b.liquido),
        origem: 'bordero',
        bordero_id: b.id,
      };
      const r = propria
        ? await db.from('fidc_operacoes').update(linha).eq('id', propria.id)
        : await db.from('fidc_operacoes').upsert(linha, { onConflict: 'data,aba,ordem' });
      if (r.error) throw new Error(r.error.message);
    }
  }
}

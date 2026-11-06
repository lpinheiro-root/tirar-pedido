import { xmlDaNota } from '@/lib/cartao/xmlNota';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { xmlEmitida } from './dados';

export type OrigemXml = 'erp' | 'nfstock';

/**
 * XML de uma nota pela chave: primeiro o das notas emitidas guardado no ERP; se não for
 * emitida, o das notas recebidas que o robô do NF-Stock já trouxe para o sistema
 * (cartao_notas). O XML das recebidas no ERP fica num banco que o usuário do ERP não acessa.
 */
export async function obterXml(chave: string): Promise<{ xml: string; origem: OrigemXml } | null> {
  const doErp = await xmlEmitida(chave);
  if (doErp) return { xml: doErp, origem: 'erp' };

  const { data } = await createServiceRoleClient().from('cartao_notas').select('xml, xml_gz').eq('chave', chave).maybeSingle();
  const doNfStock = xmlDaNota(data);
  return doNfStock ? { xml: doNfStock, origem: 'nfstock' } : null;
}

/** Quais chaves de uma lista têm XML (para mostrar os botões XML/DANFE só quando dá para baixar). */
export async function chavesComXmlNoNfStock(chaves: string[]): Promise<Set<string>> {
  const validas = chaves.filter((c) => /^\d{44}$/.test(c));
  if (validas.length === 0) return new Set();
  const service = createServiceRoleClient();
  const achadas = new Set<string>();
  for (let i = 0; i < validas.length; i += 200) {
    const { data } = await service.from('cartao_notas').select('chave').in('chave', validas.slice(i, i + 200));
    for (const r of data ?? []) achadas.add(r.chave as string);
  }
  return achadas;
}

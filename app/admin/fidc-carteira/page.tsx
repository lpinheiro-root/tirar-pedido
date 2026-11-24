import { requireFidcCarteira } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabasePaginado';
import { PainelCarteira, type BorderoLista } from './PainelCarteira';

export const dynamic = 'force-dynamic';

/** Carteira FIDC: borderô importado × carteira dos títulos no ORGM. */
export default async function FidcCarteiraPage() {
  await requireFidcCarteira();
  const db = createServiceRoleClient();
  let borderos: BorderoLista[] = [];
  let falta: string | null = null;
  try {
    borderos = await buscarTodas<BorderoLista>((de, ate) =>
      db
        .from('fidc_borderos')
        .select('id,data,fidc,empresa,numero,qtd_titulos,bruto,liquido,arquivo,usuario_nome,atualizado_em')
        .order('data', { ascending: false })
        .order('id', { ascending: false })
        .range(de, ate)
    );
    borderos = borderos.map((b) => ({ ...b, bruto: Number(b.bruto) || 0, liquido: Number(b.liquido) || 0 }));
  } catch (e) {
    falta = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeading
        title="Carteira FIDC"
        subtitle="Importe o borderô e confira, título por título, se a carteira no ORGM já foi trocada para a FIDC."
      />
      {falta ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900">{falta}</p>
      ) : (
        <PainelCarteira borderos={borderos} />
      )}
    </div>
  );
}

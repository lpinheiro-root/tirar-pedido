import { requireNfe } from '@/lib/auth';
import { nomesEmpresas, origemDaRemessa } from '@/lib/nfe/dados';

export const dynamic = 'force-dynamic';

/** Nota de origem de uma remessa por conta e ordem (?id=fscNFID da remessa). */
export async function GET(request: Request) {
  await requireNfe();
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ erro: 'Nota inválida.' }, { status: 400 });
  try {
    const [origem, empresas] = await Promise.all([origemDaRemessa(id), nomesEmpresas()]);
    return Response.json({ ...origem, empresa: origem.nota ? empresas.get(origem.nota.empresaId) ?? origem.nota.empresaId : null });
  } catch (e) {
    console.error('[nfe] origem', e);
    return Response.json({ erro: 'Não consegui consultar o ERP agora.' }, { status: 500 });
  }
}

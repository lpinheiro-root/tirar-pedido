import { IconDownload } from '@/components/ui/Icons';

const EMPRESAS: Record<string, string> = {
  '30066989000105': 'Biosense',
  '34467748000110': 'Veneza',
  '29323477000190': 'Roma',
};

const DIA_MS = 86_400_000;

/**
 * Situação da nota fiscal de uma compra: link para o PDF/XML quando a nota já
 * chegou (Alterdata/NF-Stock); senão, a explicação do porquê ainda não tem.
 */
export function NotaFiscalCelula({
  notas,
  faturamento,
  faturamentoCnpj,
  data,
}: {
  notas: { id: string; situacao: string }[];
  faturamento: 'cpf' | 'cnpj' | null;
  faturamentoCnpj: string | null;
  data: string;
}) {
  const completas = notas.filter((n) => n.situacao === 'completa');
  if (completas.length) {
    return (
      <div className="flex flex-col gap-1">
        {completas.map((n, i) => (
          <div key={n.id} className="flex items-center gap-3 whitespace-nowrap">
            <a
              href={`/api/cartao/notas/${n.id}/pdf`}
              className="inline-flex items-center gap-1 rounded-md bg-primary-fixed px-2 py-1 text-label font-medium text-primary hover:bg-primary/15"
            >
              <IconDownload width={14} height={14} /> Baixar PDF{completas.length > 1 ? ` ${i + 1}` : ''}
            </a>
            <a href={`/api/cartao/notas/${n.id}/xml`} className="text-label text-on-surface-variant hover:text-primary">
              XML
            </a>
          </div>
        ))}
      </div>
    );
  }

  if (faturamento === 'cpf') {
    return (
      <p className="max-w-44 text-label text-on-surface-variant">
        Compra no CPF — sem nota fiscal para a empresa.
      </p>
    );
  }

  const dias = Math.max(0, Math.floor((Date.now() - Date.parse(`${data}T12:00:00-03:00`)) / DIA_MS));
  const empresa = faturamentoCnpj ? EMPRESAS[faturamentoCnpj] : null;
  if (dias <= 7) {
    return (
      <p className="max-w-44 text-label text-on-surface-variant">
        Aguardando o vendedor emitir a nota{empresa ? ` para a ${empresa}` : ''}.
      </p>
    );
  }
  return (
    <p className="max-w-44 text-label font-medium text-amber-800">
      Sem nota há {dias} dias{empresa ? ` (${empresa})` : ''} — peça ao vendedor.
    </p>
  );
}

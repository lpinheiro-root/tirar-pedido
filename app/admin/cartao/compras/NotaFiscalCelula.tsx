import { IconDownload } from '@/components/ui/Icons';
import { EMPRESAS_GRUPO } from '@/lib/empresas';

const EMPRESAS = EMPRESAS_GRUPO;

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
      <Situacao
        etiqueta="Compra no CPF"
        detalhe="sem nota para a empresa"
        classe="bg-surface-container text-on-surface-variant"
      />
    );
  }

  const dias = Math.max(0, Math.floor((Date.now() - Date.parse(`${data}T12:00:00-03:00`)) / DIA_MS));
  const empresa = faturamentoCnpj ? EMPRESAS[faturamentoCnpj] : null;
  if (dias <= 7) {
    return (
      <Situacao
        etiqueta="Aguardando emissão"
        detalhe={empresa ? `vendedor ainda não emitiu (${empresa})` : 'vendedor ainda não emitiu'}
        classe="bg-blue-50 text-primary"
      />
    );
  }
  return (
    <Situacao
      etiqueta={`Sem nota há ${dias} dias`}
      detalhe={empresa ? `${empresa} · peça ao vendedor` : 'peça ao vendedor'}
      classe="bg-amber-100 text-amber-800"
    />
  );
}

function Situacao({ etiqueta, detalhe, classe }: { etiqueta: string; detalhe: string; classe: string }) {
  return (
    <div className="min-w-[150px]">
      <span className={`inline-flex whitespace-nowrap rounded-sm px-2 py-1 text-label font-medium ${classe}`}>
        {etiqueta}
      </span>
      <p className="mt-1 whitespace-nowrap text-label text-on-surface-variant">{detalhe}</p>
    </div>
  );
}

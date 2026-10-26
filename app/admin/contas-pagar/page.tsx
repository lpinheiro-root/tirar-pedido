import { requireContasPagar } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';

/** Contas a Pagar: em construção (o processo vai ser montado por partes com o financeiro). */
export default async function ContasPagarPage() {
  await requireContasPagar();

  return (
    <div>
      <PageHeading title="Contas a Pagar" subtitle="Controle das contas a pagar junto com o financeiro." />
      <Card className="p-8 text-center">
        <p className="text-h2 text-on-surface">Em construção</p>
        <p className="mt-2 text-body-sm text-on-surface-variant">Estamos montando esta tela por partes.</p>
      </Card>
    </div>
  );
}

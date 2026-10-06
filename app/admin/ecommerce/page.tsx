import { requireEcommerce } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';

/** E-Commerce (com o financeiro): dados importados de planilha. Em construção. */
export default async function EcommercePage() {
  await requireEcommerce();

  return (
    <div>
      <PageHeading title="E-Commerce" subtitle="Controle do e-commerce junto com o financeiro." />
      <Card className="p-8 text-center">
        <p className="text-h2 text-on-surface">Em construção</p>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Esta tela vai receber a importação da planilha do e-commerce. Estamos montando por partes.
        </p>
      </Card>
    </div>
  );
}

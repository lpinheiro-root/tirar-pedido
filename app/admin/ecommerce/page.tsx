import { requireEcommerce } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';
import { ConciliacaoEcommerce } from './ConciliacaoEcommerce';

/** E-Commerce (com o financeiro): concilia os repasses dos marketplaces com os extratos do banco. */
export default async function EcommercePage() {
  await requireEcommerce();

  return (
    <div>
      <PageHeading
        title="E-Commerce"
        subtitle="Concilia os repasses dos marketplaces com os extratos do banco e preenche os Créditos Ecommerce do Fluxo Financeiro."
      />
      <ConciliacaoEcommerce />
    </div>
  );
}

import { requireRepresentante } from '@/lib/auth';
import { ContaPage } from '@/components/conta/ContaPage';

export default async function RepresentanteContaPage() {
  const { representante } = await requireRepresentante('representante');
  return <ContaPage representante={representante} />;
}

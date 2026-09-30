import { requireRepresentante } from '@/lib/auth';
import { ContaPage } from '@/components/conta/ContaPage';

export default async function AdminContaPage() {
  const { representante } = await requireRepresentante('admin');
  return <ContaPage representante={representante} />;
}

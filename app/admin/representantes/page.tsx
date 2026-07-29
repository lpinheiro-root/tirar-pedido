import { requireRepresentante } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { RepresentanteRow } from './RepresentanteRow';
import { NovoRepresentanteForm } from './NovoRepresentanteForm';
import type { Representante } from '@/types';

export default async function AdminRepresentantesPage() {
  await requireRepresentante('admin');
  const supabase = createClient();

  const { data: representantes } = await supabase
    .from('representantes')
    .select('*')
    .order('nome', { ascending: true });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          title="Representantes"
          subtitle="Gerencie o acesso e os dados dos representantes de vendas."
        />
        <NovoRepresentanteForm />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Representante</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Código SQL</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Desde</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(representantes as Representante[] | null)?.map((rep) => (
                <RepresentanteRow key={rep.id} representante={rep} />
              ))}
              {(!representantes || representantes.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                    Nenhum representante cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

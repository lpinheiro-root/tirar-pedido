import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Representante } from '@/types';
import { NovoUsuarioForm } from './NovoUsuarioForm';
import { UsuarioRow } from './UsuarioRow';

export default async function UsuariosPage() {
  const { userId } = await requireSuperAdmin();
  const supabase = createClient();
  const { data } = await supabase
    .from('representantes')
    .select('*')
    .eq('role', 'admin')
    .order('nome');
  const usuarios = (data ?? []) as Representante[];

  return (
    <div>
      <PageHeading title="Usuários" subtitle="Quem pode acessar o Natuhair Finanças." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Novo usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <NovoUsuarioForm />
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="text-label uppercase text-on-surface-variant">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Desde</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Acesso extra</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <UsuarioRow key={u.id} usuario={u} ehVoce={u.id === userId} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

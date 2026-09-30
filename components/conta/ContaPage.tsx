import { PageHeading } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Representante } from '@/types';
import { AlterarSenhaForm } from './AlterarSenhaForm';

export function ContaPage({ representante }: { representante: Representante }) {
  return (
    <div>
      <PageHeading title="Minha conta" subtitle={`${representante.nome} · ${representante.email}`} />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm email={representante.email} />
        </CardContent>
      </Card>
    </div>
  );
}

import { requireRepresentante } from '@/lib/auth';
import { getClientesPorEstado } from '@/lib/sqlserver';
import { PageHeading } from '@/components/layout/Header';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { ClientesList } from './ClientesList';
import type { Cliente } from '@/types';

export default async function ClientesPage() {
  const { representante } = await requireRepresentante('representante');

  let clientes: Cliente[] = [];
  let erroConexao = false;
  try {
    clientes = await getClientesPorEstado(representante.estado, representante.codigo_representante_sql);
  } catch (err) {
    console.error('Falha ao conectar ao SQL Server:', err);
    erroConexao = true;
  }

  return (
    <div>
      <PageHeading
        title="Meus Clientes"
        subtitle={`Clientes do estado ${representante.estado} atribuídos a você.`}
      />
      {erroConexao ? (
        <ErrorNotice
          title="Não foi possível conectar ao SQL Server de clientes"
          message="Verifique as variáveis SQLSERVER_HOST, SQLSERVER_USER, SQLSERVER_PASSWORD e SQLSERVER_DATABASE no .env.local."
        />
      ) : (
        <ClientesList clientes={clientes} />
      )}
    </div>
  );
}

import { requireRepresentante } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { IconCreditCard } from '@/components/ui/Icons';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { representante } = await requireRepresentante('admin');

  // Nesta versão (Natuhair Cartão) o painel admin expõe só o módulo Cartão.
  const links = [{ href: '/admin/cartao', label: 'Cartão', icon: <IconCreditCard /> }];

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar
        links={links}
        titulo="Natuhair Cartão"
        nome={representante.nome}
        subtitulo="Administrador"
        footer={<SidebarFooter contaHref="/admin/conta" />}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-content flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

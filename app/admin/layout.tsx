import { requireRepresentante } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { IconChart, IconClipboard, IconBox, IconUsers, IconCreditCard } from '@/components/ui/Icons';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { representante } = await requireRepresentante('admin');

  const links = [
    { href: '/admin', label: 'Visão Geral', icon: <IconChart /> },
    { href: '/admin/pedidos', label: 'Pedidos', icon: <IconClipboard /> },
    { href: '/admin/produtos', label: 'Produtos', icon: <IconBox /> },
    { href: '/admin/representantes', label: 'Representantes', icon: <IconUsers /> },
    { href: '/admin/cartao', label: 'Cartão', icon: <IconCreditCard /> },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar
        links={links}
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

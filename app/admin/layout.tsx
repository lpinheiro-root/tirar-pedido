import { acessos, requireRepresentante } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { IconCart, IconCreditCard, IconDocument, IconUsers } from '@/components/ui/Icons';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { representante } = await requireRepresentante('admin');

  // Natuhair Finanças: cada usuário vê só as telas liberadas na tela de Usuários.
  const acesso = acessos(representante);
  const links = [
    ...(acesso.cartao ? [{ href: '/admin/cartao', label: 'Cartão', icon: <IconCreditCard /> }] : []),
    ...(acesso.devolucoes
      ? [{ href: '/admin/nfe-recebidas', label: 'NF-e Recebidas', icon: <IconDocument /> }]
      : []),
    ...(acesso.ecommerce ? [{ href: '/admin/ecommerce', label: 'E-Commerce', icon: <IconCart /> }] : []),
    ...(representante.super_admin ? [{ href: '/admin/usuarios', label: 'Usuários', icon: <IconUsers /> }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar
        links={links}
        titulo="Natuhair Finanças"
        nome={representante.nome}
        subtitulo={representante.super_admin ? 'Administrador' : 'Usuário'}
        footer={<SidebarFooter contaHref="/admin/conta" />}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-content flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

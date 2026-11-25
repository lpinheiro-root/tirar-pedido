import { acessos, requireRepresentante } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { FundoTech } from '@/components/layout/FundoTech';
import { IconAlert, IconBank, IconCart, IconChart, IconCreditCard, IconDocument, IconPresentation, IconReceipt, IconUsers, IconWallet } from '@/components/ui/Icons';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { representante } = await requireRepresentante('admin');

  // Natuhair: cada usuário vê só as telas liberadas na tela de Usuários.
  const acesso = acessos(representante);
  const links = [
    ...(acesso.cartao ? [{ href: '/admin/cartao', label: 'Cartão', icon: <IconCreditCard /> }] : []),
    ...(acesso.devolucoes
      ? [{ href: '/admin/nfe-recebidas', label: 'NF-e Recebidas', icon: <IconDocument /> }]
      : []),
    ...(acesso.ecommerce ? [{ href: '/admin/ecommerce', label: 'E-Commerce', icon: <IconCart /> }] : []),
    ...(acesso.contasPagar
      ? [{ href: '/admin/contas-pagar', label: 'Contas a Pagar', icon: <IconReceipt /> }]
      : []),
    ...(acesso.nfe ? [{ href: '/admin/nfe', label: 'NFE', icon: <IconDocument /> }] : []),
    ...(acesso.fidc ? [{ href: '/admin/fidc', label: 'FIDC', icon: <IconBank /> }] : []),
    ...(acesso.fidcMensal ? [{ href: '/admin/fidc-mensal', label: 'Mensal FIDC', icon: <IconChart /> }] : []),
    ...(acesso.fidcCarteira ? [{ href: '/admin/fidc-carteira', label: 'Carteira FIDC', icon: <IconWallet /> }] : []),
    ...(acesso.inadimplencia ? [{ href: '/admin/inadimplencia', label: 'Inadimplência', icon: <IconAlert /> }] : []),
    ...(acesso.relatorioGerencial ? [{ href: '/admin/relatorio-gerencial', label: 'Relatório Gerencial', icon: <IconPresentation /> }] : []),
    ...(representante.super_admin ? [{ href: '/admin/usuarios', label: 'Usuários', icon: <IconUsers /> }] : []),
  ];

  return (
    <div className="relative isolate flex min-h-screen">
      <FundoTech />
      <Sidebar
        links={links}
        titulo="Natuhair"
        logo="/natuhair-logo.jpg"
        nome={representante.nome}
        foto={representante.foto}
        subtitulo={representante.super_admin ? 'Administrador' : 'Usuário'}
        footer={<SidebarFooter contaHref="/admin/conta" />}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header usuario={{ nome: representante.nome, email: representante.email, foto: representante.foto, contaHref: '/admin/conta' }} />
        <main className="mx-auto w-full max-w-content flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

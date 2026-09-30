import { requireRepresentante } from '@/lib/auth';
import { CartProvider } from '@/components/cart/CartContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ClientSelectorBadge } from '@/components/cart/ClientSelectorBadge';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { IconHome, IconBox, IconClipboard, IconCart } from '@/components/ui/Icons';

export default async function RepresentanteLayout({ children }: { children: React.ReactNode }) {
  const { representante } = await requireRepresentante('representante');

  const links = [
    { href: '/representante', label: 'Início', icon: <IconHome /> },
    { href: '/representante/clientes', label: 'Fazer Pedido', icon: <IconCart /> },
    { href: '/representante/produtos', label: 'Produtos', icon: <IconBox /> },
    { href: '/representante/pedidos', label: 'Meus Pedidos', icon: <IconClipboard /> },
  ];

  return (
    <CartProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar
          links={links}
          nome={representante.nome}
          subtitulo="Representante B2B"
          footer={<SidebarFooter contaHref="/representante/conta" />}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <Header rightSlot={<ClientSelectorBadge />} />
          <main className="mx-auto w-full max-w-content flex-1 px-8 py-8">{children}</main>
        </div>
      </div>
    </CartProvider>
  );
}

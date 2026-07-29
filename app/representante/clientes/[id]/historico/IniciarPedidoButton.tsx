'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart/CartContext';
import { Button } from '@/components/ui/Button';

export function IniciarPedidoButton({
  clienteId,
  clienteNome,
}: {
  clienteId: string;
  clienteNome: string;
}) {
  const { setCliente } = useCart();
  const router = useRouter();

  return (
    <Button
      onClick={() => {
        setCliente({ id: clienteId, nome: clienteNome });
        router.push('/representante/produtos');
      }}
    >
      Novo Pedido
    </Button>
  );
}

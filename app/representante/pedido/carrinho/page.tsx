'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart/CartContext';
import { PageHeading } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { IconMinus, IconPlus, IconChevronLeft } from '@/components/ui/Icons';
import type { NovoPedidoPayload } from '@/types';

export default function CarrinhoPage() {
  const { itens, cliente, totalValor, setQuantidade, removeItem, clear, setCliente } = useCart();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ pedidoId: string; email: boolean; whatsapp: boolean } | null>(
    null
  );

  async function enviarPedido() {
    if (!cliente || itens.length === 0) return;
    setEnviando(true);
    setErro(null);

    const payload: NovoPedidoPayload = {
      clienteIdSql: cliente.id,
      clienteNome: cliente.nome,
      itens,
    };

    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.erro ?? 'Não foi possível enviar o pedido.');
        return;
      }

      setSucesso({ pedidoId: data.pedidoId, email: data.enviadoEmail, whatsapp: data.enviadoWhatsapp });
      setCliente(null);
    } catch {
      setErro('Falha de conexão ao enviar o pedido.');
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          ✓
        </div>
        <h1 className="text-h1 text-on-surface">Pedido enviado com sucesso!</h1>
        <p className="mt-2 text-body text-on-surface-variant">
          Pedido #{sucesso.pedidoId.slice(0, 8)} registrado.{' '}
          {sucesso.email ? 'E-mail enviado ao time comercial.' : 'Falha ao enviar e-mail — verifique manualmente.'}{' '}
          {sucesso.whatsapp
            ? 'Confirmação enviada por WhatsApp.'
            : 'Não foi possível enviar a confirmação por WhatsApp.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/representante/clientes">
            <Button variant="secondary">Ver clientes</Button>
          </Link>
          <Link href="/representante">
            <Button>Voltar ao início</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/representante/produtos"
        className="mb-4 inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
      >
        <IconChevronLeft width={16} height={16} /> Continuar comprando
      </Link>

      <PageHeading
        title="Carrinho do Pedido"
        subtitle={cliente ? `Cliente: ${cliente.nome}` : 'Nenhum cliente selecionado'}
      />

      {itens.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-body-sm text-on-surface-variant">
            Seu carrinho está vazio.{' '}
            <Link href="/representante/produtos" className="font-medium text-primary hover:underline">
              Explorar produtos
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="divide-y divide-border-muted">
              {itens.map((item) => (
                <div key={item.produtoId} className="flex items-center gap-4 p-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-container-low">
                    {item.imagemUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imagemUrl} alt={item.nome} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-label text-on-surface-variant">Cód. {item.codigo}</p>
                    <p className="truncate text-body font-medium text-on-surface">{item.nome}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {formatCurrency(item.preco)} / un.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-border-muted">
                    <button
                      type="button"
                      onClick={() => setQuantidade(item.produtoId, item.quantidade - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
                      aria-label="Diminuir quantidade"
                    >
                      <IconMinus width={14} height={14} />
                    </button>
                    <span className="w-6 text-center text-body-sm font-medium text-on-surface">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantidade(item.produtoId, item.quantidade + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
                      aria-label="Aumentar quantidade"
                    >
                      <IconPlus width={14} height={14} />
                    </button>
                  </div>
                  <p className="w-24 shrink-0 text-right text-body font-semibold text-on-surface">
                    {formatCurrency(item.preco * item.quantidade)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.produtoId)}
                    className="text-label text-error hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {erro && (
            <p className="mt-4 rounded-md bg-error-container px-3 py-2 text-body-sm text-error-on-container">
              {erro}
            </p>
          )}

          <div className="sticky bottom-0 mt-6 flex items-center justify-between rounded-md border border-border-muted bg-surface-container-lowest px-5 py-4 shadow-ambient">
            <div>
              <p className="text-label text-on-surface-variant">Total do Pedido</p>
              <p className="text-h1 text-primary">{formatCurrency(totalValor)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={clear} disabled={enviando}>
                Limpar Tudo
              </Button>
              <Button onClick={enviarPedido} disabled={enviando || !cliente}>
                {enviando ? 'Enviando...' : 'Enviar Pedido'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

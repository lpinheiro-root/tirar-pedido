'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem } from '@/types';
import { CLIENTE_COOKIE } from '@/lib/clienteCookie';

const STORAGE_KEY = 'natuhair.carrinho';
const CLIENTE_KEY = 'natuhair.cliente-selecionado';

function setClienteCookie(clienteId: string | null) {
  if (clienteId) {
    document.cookie = `${CLIENTE_COOKIE}=${encodeURIComponent(clienteId)}; path=/; max-age=${60 * 60 * 24 * 7}`;
  } else {
    document.cookie = `${CLIENTE_COOKIE}=; path=/; max-age=0`;
  }
}

export interface ClienteSelecionado {
  id: string;
  nome: string;
}

interface CartContextValue {
  itens: CartItem[];
  cliente: ClienteSelecionado | null;
  totalItens: number;
  totalValor: number;
  setCliente: (cliente: ClienteSelecionado | null) => void;
  addItem: (item: CartItem) => void;
  setQuantidade: (produtoId: string, quantidade: number) => void;
  removeItem: (produtoId: string) => void;
  clear: () => void;
  quantidadeDe: (produtoId: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<CartItem[]>([]);
  const [cliente, setClienteState] = useState<ClienteSelecionado | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawItens = localStorage.getItem(STORAGE_KEY);
      if (rawItens) setItens(JSON.parse(rawItens));
      const rawCliente = localStorage.getItem(CLIENTE_KEY);
      if (rawCliente) setClienteState(JSON.parse(rawCliente));
    } catch {
      // localStorage indisponível — segue com carrinho vazio
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itens));
  }, [itens, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (cliente) localStorage.setItem(CLIENTE_KEY, JSON.stringify(cliente));
    else localStorage.removeItem(CLIENTE_KEY);
    setClienteCookie(cliente?.id ?? null);
  }, [cliente, hydrated]);

  const setCliente = useCallback((novoCliente: ClienteSelecionado | null) => {
    setClienteState((atual) => {
      if (atual?.id !== novoCliente?.id) {
        setItens([]);
      }
      return novoCliente;
    });
  }, []);

  const addItem = useCallback((item: CartItem) => {
    setItens((atual) => {
      const existente = atual.find((i) => i.produtoId === item.produtoId);
      if (existente) {
        return atual.map((i) =>
          i.produtoId === item.produtoId ? { ...i, quantidade: item.quantidade } : i
        );
      }
      return [...atual, item];
    });
  }, []);

  const setQuantidade = useCallback((produtoId: string, quantidade: number) => {
    setItens((atual) => {
      if (quantidade <= 0) return atual.filter((i) => i.produtoId !== produtoId);
      return atual.map((i) => (i.produtoId === produtoId ? { ...i, quantidade } : i));
    });
  }, []);

  const removeItem = useCallback((produtoId: string) => {
    setItens((atual) => atual.filter((i) => i.produtoId !== produtoId));
  }, []);

  const clear = useCallback(() => setItens([]), []);

  const quantidadeDe = useCallback(
    (produtoId: string) => itens.find((i) => i.produtoId === produtoId)?.quantidade ?? 0,
    [itens]
  );

  const totalItens = useMemo(() => itens.reduce((acc, i) => acc + i.quantidade, 0), [itens]);
  const totalValor = useMemo(
    () => itens.reduce((acc, i) => acc + i.quantidade * i.preco, 0),
    [itens]
  );

  const value = useMemo(
    () => ({
      itens,
      cliente,
      totalItens,
      totalValor,
      setCliente,
      addItem,
      setQuantidade,
      removeItem,
      clear,
      quantidadeDe,
    }),
    [itens, cliente, totalItens, totalValor, setCliente, addItem, setQuantidade, removeItem, clear, quantidadeDe]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de CartProvider');
  return ctx;
}

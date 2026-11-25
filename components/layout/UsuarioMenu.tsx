'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { salvarFoto } from '@/lib/conta/foto';
import { Avatar } from '@/components/ui/Avatar';

/** Recorta o centro da imagem em quadrado e reduz para 160x160 JPEG (~10 KB). */
function reduzir(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      c.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 160, 160);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => falha(new Error('Não consegui ler essa imagem.'));
    img.src = URL.createObjectURL(arquivo);
  });
}

/** Nome, e-mail e foto de quem está logado, no canto do topo; clicando abre o menu da conta. */
export function UsuarioMenu({ nome, email, foto, contaHref }: { nome: string; email: string; foto?: string | null; contaHref: string }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const trocar = (nova: string | null) =>
    iniciar(async () => {
      setErro('');
      const r = await salvarFoto(nova);
      if (r.erro) setErro(r.erro);
      else {
        setAberto(false);
        router.refresh();
      }
    });

  async function sair() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="group flex items-center gap-3 rounded-2xl py-1 pl-3 pr-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
        aria-expanded={aberto}
        aria-haspopup="menu"
      >
        <span className="hidden text-right sm:block">
          <span className="block max-w-[220px] truncate text-body font-bold text-on-surface">{nome}</span>
          <span className="block max-w-[220px] truncate text-label text-on-surface-variant">{email}</span>
        </span>
        <Avatar nome={nome} foto={foto} tamanho="lg" />
        <svg viewBox="0 0 20 20" className={`h-4 w-4 text-on-surface-variant transition-transform ${aberto ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden>
          <path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" />
        </svg>
      </button>

      {aberto && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-border-muted bg-white p-2 shadow-xl">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar nome={nome} foto={foto} tamanho="lg" />
            <div className="min-w-0">
              <p className="truncate text-body font-bold text-on-surface">{nome}</p>
              <p className="truncate text-label text-on-surface-variant">{email}</p>
            </div>
          </div>
          <div className="my-1 border-t border-border-muted" />
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                trocar(await reduzir(f));
              } catch (x) {
                setErro(x instanceof Error ? x.message : String(x));
              }
            }}
          />
          <button
            type="button"
            role="menuitem"
            disabled={salvando}
            onClick={() => arquivo.current?.click()}
            className="w-full rounded-xl px-3 py-2 text-left text-body font-semibold text-on-surface hover:bg-primary/5 hover:text-primary disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : foto ? 'Trocar foto' : 'Colocar foto'}
          </button>
          {foto && (
            <button
              type="button"
              role="menuitem"
              disabled={salvando}
              onClick={() => trocar(null)}
              className="w-full rounded-xl px-3 py-2 text-left text-body font-semibold text-on-surface hover:bg-primary/5 hover:text-primary disabled:opacity-50"
            >
              Tirar foto
            </button>
          )}
          <Link
            href={contaHref}
            role="menuitem"
            onClick={() => setAberto(false)}
            className="block rounded-xl px-3 py-2 text-body font-semibold text-on-surface hover:bg-primary/5 hover:text-primary"
          >
            Minha conta / alterar senha
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={sair}
            className="w-full rounded-xl px-3 py-2 text-left text-body font-semibold text-error hover:bg-error/5"
          >
            Sair
          </button>
          {erro && <p className="px-3 py-1 text-label text-error">{erro}</p>}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { login } from './actions';

function Icone({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICONE = {
  email: 'M4 6h16v12H4zM4 7l8 6 8-6',
  chave: 'M14 10a4 4 0 1 0-3.5 3.97L9 15.5V18H6.5v2H4v-2.5l5.03-5.03A4 4 0 0 0 14 10zm1-1h.01',
  olho: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  olhoFechado:
    'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  seta: 'M5 12h14M13 6l6 6-6 6',
};

const rotulo = 'text-xs font-bold uppercase tracking-wide text-on-surface-variant';
const campo =
  'h-12 w-full rounded-full border border-[#dbe4f3] bg-[#eef4ff] text-sm text-on-surface placeholder:text-outline outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15';

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1d4ed8] to-primary py-3.5 text-base font-bold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.7)] transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? (
        'Entrando…'
      ) : (
        <>
          Acessar Natuhair <Icone d={ICONE.seta} className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(login, undefined);
  const [verSenha, setVerSenha] = useState(false);
  const [esqueceu, setEsqueceu] = useState(false);

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <label className="block space-y-2">
        <span className={rotulo}>E-mail</span>
        <span className="relative block">
          <Icone d={ICONE.email} className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input name="email" type="email" required autoComplete="email" placeholder="seu.email@natuhair.ind.br" className={`${campo} pl-11 pr-4`} />
        </span>
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="senha" className={rotulo}>
            Senha de acesso
          </label>
          <button type="button" onClick={() => setEsqueceu((v) => !v)} className="text-sm font-bold text-primary hover:underline">
            Esqueceu a senha?
          </button>
        </div>
        <div className="relative">
          <Icone d={ICONE.chave} className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            id="senha"
            name="senha"
            type={verSenha ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="Sua senha"
            className={`${campo} px-11`}
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-outline hover:text-primary"
            aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}
          >
            <Icone d={verSenha ? ICONE.olhoFechado : ICONE.olho} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {esqueceu && (
        <p className="rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface">
          Peça ao TI da Natuhair para criar uma senha nova para o seu e-mail.
        </p>
      )}
      {state?.erro && <p className="rounded-xl bg-error-container px-4 py-3 text-sm font-semibold text-error-on-container">{state.erro}</p>}

      <Entrar />
    </form>
  );
}

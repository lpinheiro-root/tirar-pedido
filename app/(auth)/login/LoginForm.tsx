'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { login } from './actions';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { IconEye } from '@/components/ui/Icons';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-2 w-full">
      {pending ? 'Entrando...' : 'Entrar'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(login, undefined);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-label text-on-surface-variant">
          Email Institucional
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="exemplo@natuhair.com.br"
          required
          autoComplete="email"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="senha" className="block text-label text-on-surface-variant">
            Senha
          </label>
          <a href="#" className="text-label text-primary hover:underline">
            Esqueceu a senha?
          </a>
        </div>
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
            aria-label="Mostrar senha"
          >
            <IconEye width={18} height={18} />
          </button>
        </div>
      </div>

      {state?.erro && (
        <p className="rounded-md bg-error-container px-3 py-2 text-body-sm text-error-on-container">
          {state.erro}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

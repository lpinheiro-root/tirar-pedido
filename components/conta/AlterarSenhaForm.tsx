'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const SENHA_MINIMA = 8;

export function AlterarSenhaForm({ email }: { email: string }) {
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok?: boolean; erro?: string } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    const atual = String(dados.get('atual') ?? '');
    const nova = String(dados.get('nova') ?? '');
    const confirmacao = String(dados.get('confirmacao') ?? '');

    if (nova.length < SENHA_MINIMA) {
      setResultado({ erro: `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` });
      return;
    }
    if (nova !== confirmacao) {
      setResultado({ erro: 'A confirmação não confere com a nova senha.' });
      return;
    }

    setSalvando(true);
    setResultado(null);
    const supabase = createClient();

    // confirma a senha atual antes de trocar
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (erroLogin) {
      setSalvando(false);
      setResultado({ erro: 'Senha atual incorreta.' });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if (error) {
      setResultado({
        erro: error.message.includes('different')
          ? 'A nova senha precisa ser diferente da atual.'
          : error.message,
      });
      return;
    }
    form.reset();
    setResultado({ ok: true });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
      <div>
        <label className="mb-1 block text-label text-on-surface-variant">Senha atual</label>
        <Input name="atual" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="mb-1 block text-label text-on-surface-variant">Nova senha</label>
        <Input name="nova" type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required />
      </div>
      <div>
        <label className="mb-1 block text-label text-on-surface-variant">Confirmar nova senha</label>
        <Input name="confirmacao" type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required />
      </div>
      <div>
        <Button type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Alterar senha'}
        </Button>
      </div>
      {resultado?.ok && <p className="text-body-sm text-green-700">Senha alterada com sucesso.</p>}
      {resultado?.erro && <p className="text-body-sm text-error">{resultado.erro}</p>}
    </form>
  );
}

import { redirect } from 'next/navigation';
import { requireRepresentante, telaInicial } from '@/lib/auth';

// Natuhair Finanças: abre a primeira tela liberada para o usuário (Cartão ou NF-e Recebidas).
export default async function AdminPage() {
  const { representante } = await requireRepresentante('admin');
  redirect(telaInicial(representante));
}

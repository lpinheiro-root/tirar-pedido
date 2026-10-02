import { redirect } from 'next/navigation';

// Nesta versão (Natuhair Finanças) o painel admin é só o módulo Cartão.
export default function AdminPage() {
  redirect('/admin/cartao');
}

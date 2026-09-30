import { redirect } from 'next/navigation';

// Nesta versão (Natuhair Cartão) o painel admin é só o módulo Cartão.
export default function AdminPage() {
  redirect('/admin/cartao');
}

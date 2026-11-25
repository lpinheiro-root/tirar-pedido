import { requireSuperAdmin } from '@/lib/auth';
import { PageHeading } from '@/components/layout/Header';

/** Relatório Gerencial: em construção (por enquanto só administradores veem). */
export default async function RelatorioGerencialPage() {
  await requireSuperAdmin();
  return (
    <div>
      <PageHeading title="Relatório Gerencial" subtitle="Visão gerencial da empresa, montada a partir do relatório usado hoje." />
      <div className="rounded-2xl border border-dashed border-primary/30 bg-white/70 p-10 text-center">
        <p className="text-h2 font-bold text-primary">Em construção</p>
        <p className="mt-2 text-body text-on-surface-variant">Os quadros deste relatório vão entrar aqui aos poucos.</p>
      </div>
    </div>
  );
}

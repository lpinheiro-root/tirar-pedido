import { LoginForm } from './LoginForm';

const MODULOS = ['Cartão', 'NF-e Recebidas', 'E-Commerce', 'Contas a Pagar', 'NFE', 'FIDC'];

function Icone({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const BRILHO = 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6';
const CADEADO = 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3';
const PREDIO = 'M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <p className="bg-gradient-to-r from-[#1d4ed8] via-primary to-[#0ea5e9] px-4 py-3 text-center text-sm font-bold text-white">
        Os números da Natuhair, organizados num só lugar
      </p>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-12">
        {/* Apresentação (só no computador) */}
        <section className="hidden rounded-[28px] border border-primary/10 bg-gradient-to-br from-[#e0ebff] via-[#eef4ff] to-[#e0f2fe] p-10 shadow-[0_24px_60px_-30px_rgba(37,99,235,0.35)] lg:block">
          <p className="text-lg font-extrabold tracking-tight text-on-surface">
            NATUHAIR <span className="text-primary">GESTÃO</span>
          </p>
          <hr className="my-6 border-primary/10" />
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-on-surface">
            <Icone d={BRILHO} className="h-4 w-4 text-primary" />
            Financeiro, fiscal e diretoria
          </span>
          <h2 className="mt-6 text-[2.6rem] font-extrabold leading-[1.1] tracking-tight text-on-surface">
            Decidir bem começa
            <br />
            com o número <span className="text-primary">certo.</span>
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-on-surface-variant">
            Cartões, notas fiscais, e-commerce, contas a pagar e antecipações trabalhando juntos, conectados ao{' '}
            <b className="text-on-surface">ORGM</b>, para a Natuhair enxergar o dia a dia com clareza.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2">
            {MODULOS.map((m) => (
              <li key={m} className="rounded-full border border-primary/15 bg-white/80 px-3.5 py-1.5 text-sm font-semibold text-on-surface">
                {m}
              </li>
            ))}
          </ul>
        </section>

        {/* Acesso */}
        <section className="mx-auto w-full max-w-md rounded-[28px] border border-border-muted bg-white p-7 shadow-[0_24px_60px_-30px_rgba(37,99,235,0.3)] sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/natuhair-logo.jpg" alt="Natuhair" className="h-11 w-11 rounded-full object-cover" />
              <div className="leading-tight">
                <p className="text-sm font-extrabold text-primary">NATUHAIR</p>
                <p className="text-xs text-on-surface-variant">Natuhair Cosméticos</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Icone d={CADEADO} className="h-3.5 w-3.5" />
              Acesso restrito
            </span>
          </div>

          <h1 className="mt-8 text-[1.75rem] font-extrabold leading-tight tracking-tight text-on-surface">
            Bem-vindo ao <span className="text-primary">Natuhair</span>
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">Entre com seu e-mail e senha para acessar.</p>

          <LoginForm />

          <div className="mt-7 flex items-center justify-between border-t border-border-muted pt-5 text-xs text-on-surface-variant">
            <span className="flex items-center gap-2">
              <Icone d={PREDIO} className="h-4 w-4" />
              Uso interno Natuhair
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-600" />
              Ambiente seguro
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

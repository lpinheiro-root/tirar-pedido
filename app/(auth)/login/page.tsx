import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-secondary/20 blur-3xl" />

      <div className="relative w-full max-w-md rounded-lg border border-border-muted bg-surface-container-lowest p-8 shadow-ambient">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-on-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-h1 text-on-surface">Natuhair Cartão</h1>
          <p className="mt-1 text-body text-on-surface-variant">
            Conciliação de faturas de cartão
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-label text-outline">
          🔒 ACESSO SEGURO SSL
        </p>
        <p className="mt-1 text-center text-body-sm text-on-surface-variant">
          Este é um portal restrito para usuários autorizados da Natuhair.
        </p>
      </div>
    </main>
  );
}

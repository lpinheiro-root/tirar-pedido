export function Avatar({ nome, foto, tamanho = 'md' }: { nome: string; foto?: string | null; tamanho?: 'md' | 'lg' }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const lado = tamanho === 'lg' ? 'h-11 w-11 text-body' : 'h-9 w-9 text-label';

  if (foto)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={foto} alt={nome} className={`${lado} shrink-0 rounded-full object-cover shadow-md ring-2 ring-white`} />
    );

  return (
    <div
      className={`${lado} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 font-semibold text-white shadow-md ring-2 ring-white`}
    >
      {iniciais || '?'}
    </div>
  );
}

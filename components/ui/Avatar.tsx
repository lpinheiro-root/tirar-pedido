export function Avatar({ nome }: { nome: string }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-label font-semibold text-primary">
      {iniciais || '?'}
    </div>
  );
}

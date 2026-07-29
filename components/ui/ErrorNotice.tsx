export function ErrorNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-error-container bg-error-container/40 p-6 text-center">
      <p className="text-body font-semibold text-error-on-container">{title}</p>
      <p className="mt-1 text-body-sm text-error-on-container">{message}</p>
    </div>
  );
}

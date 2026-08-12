"use client";

export function Modal({
  titulo,
  children,
  onCerrar,
}: {
  titulo: string;
  children: React.ReactNode;
  onCerrar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="serif text-xl font-semibold">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="rounded px-2 text-xl leading-none text-faint hover:text-ink"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

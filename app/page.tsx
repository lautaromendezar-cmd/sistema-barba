"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { money, fecha, totalRemito } from "@/lib/formato";

export default function Inicio() {
  const { db, stock, cliente, usuario } = useStore();

  const enDeposito = db.productos.reduce((a, p) => a + stock(p.codigo), 0);
  const sinStock = db.productos.filter((p) => stock(p.codigo) <= 0).length;
  const emitidos = db.remitos.filter((r) => r.estado === "emitido");
  const pendientes = emitidos.flatMap((r) =>
    r.lineas.filter((l) => !l.entregado),
  );
  const ultimos = [...db.remitos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  return (
    <div>
      <h1 className="serif text-3xl font-semibold">
        Hola, {usuario?.nombre.split(" ")[0]}
      </h1>
      <p className="mt-1 text-muted">
        Depósito y remitos de Grupo Barba.
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta valor={String(db.productos.length)} etiqueta="Productos" />
        <Tarjeta
          valor={enDeposito.toLocaleString("es-AR")}
          etiqueta="Unidades en depósito"
        />
        <Tarjeta
          valor={String(sinStock)}
          etiqueta="Sin stock o en negativo"
          alerta={sinStock > 0}
        />
        <Tarjeta
          valor={String(pendientes.length)}
          etiqueta="Líneas pendientes de entrega"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/remitos/nuevo"
          className="rounded-md bg-wine px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wine-ink"
        >
          Nuevo remito
        </Link>
        <Link
          href="/ingresos"
          className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-wine hover:text-wine"
        >
          Cargar mercadería que entró
        </Link>
        <Link
          href="/productos"
          className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-wine hover:text-wine"
        >
          Ver stock
        </Link>
      </div>

      <h2 className="serif mt-10 mb-3 border-b border-line pb-2 text-xl font-semibold">
        Últimos remitos
      </h2>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
              <th className="px-4 py-2.5 font-semibold">Número</th>
              <th className="px-4 py-2.5 font-semibold">Fecha</th>
              <th className="px-4 py-2.5 font-semibold">Cliente</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ultimos.map((r) => {
              const { total } = totalRemito(r.lineas, r.ajustePct);
              return (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-paper"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href="/remitos"
                      className="font-medium text-wine hover:underline"
                    >
                      {r.numero}
                    </Link>
                    {r.estado === "anulado" && (
                      <span className="ml-2 rounded bg-wine-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-wine uppercase">
                        Anulado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{fecha(r.fecha)}</td>
                  <td className="px-4 py-2.5">
                    {cliente(r.clienteId)?.nombre ?? "—"}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {money(total)}
                  </td>
                </tr>
              );
            })}
            {ultimos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Todavía no hay remitos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tarjeta({
  valor,
  etiqueta,
  alerta,
}: {
  valor: string;
  etiqueta: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div
        className={`tnum serif text-3xl font-semibold ${alerta ? "text-wine" : ""}`}
      >
        {valor}
      </div>
      <div className="mt-0.5 text-xs text-muted">{etiqueta}</div>
    </div>
  );
}

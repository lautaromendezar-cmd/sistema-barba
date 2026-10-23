"use client";

import { useStore } from "@/lib/store";
import { fechaHora } from "@/lib/formato";
import type { Ingreso } from "@/lib/types";

/**
 * La hoja de lo que entró de un proveedor. Sirve sobre todo cuando el
 * proveedor no da remito: queda el papel de lo que se recibió.
 */
export function IngresoDoc({ ingreso }: { ingreso: Ingreso }) {
  const { db, producto } = useStore();
  const proveedor =
    db.proveedores.find((v) => v.id === ingreso.proveedorId)?.nombre ??
    ingreso.bodega;
  const sueltasDe = (l: Ingreso["lineas"][number]) =>
    l.sueltas ??
    l.unidades - l.bultos * (producto(l.productoCodigo)?.unidadesPorBulto ?? 1);
  const totalBultos = ingreso.lineas.reduce((a, l) => a + l.bultos, 0);
  const totalUnidades = ingreso.lineas.reduce((a, l) => a + l.unidades, 0);

  return (
    <div className="print-sheet bg-white text-[13px] text-ink">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/grupo-barba.png"
          alt="Grupo Barba · Distribuidora de vinos"
          width={834}
          height={508}
          className="h-24 w-auto"
        />
        <div className="text-right">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
            Ingreso de mercadería
          </div>
          <div className="tnum mt-1 text-xs text-muted">
            {fechaHora(ingreso.fecha)}
          </div>
          {ingreso.anuladoAt && (
            <div className="mt-2 inline-block border border-ink px-2 py-0.5 text-[10px] font-bold tracking-widest text-acento-ink uppercase">
              Anulado
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
            Proveedor
          </div>
          <div className="mt-1 font-semibold">{proveedor}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
            Nº de remito del proveedor
          </div>
          <div className="tnum mt-1">{ingreso.nroRemitoProveedor || "Sin remito"}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
            Cargó
          </div>
          <div className="mt-1">{ingreso.usuario}</div>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-ink/25 text-left text-[10px] tracking-wider text-muted uppercase">
            <th className="py-1.5 pr-2 font-semibold">Código</th>
            <th className="py-1.5 pr-2 font-semibold">Producto</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Bultos</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Sueltas</th>
            <th className="py-1.5 text-right font-semibold">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {ingreso.lineas.map((l) => {
            const p = producto(l.productoCodigo);
            return (
              <tr key={l.productoCodigo} className="border-b border-line">
                <td className="tnum py-1.5 pr-2 font-mono text-[11px] text-muted">
                  {l.productoCodigo}
                </td>
                <td className="py-1.5 pr-2">
                  {p?.nombre ?? l.productoCodigo}
                  {p?.presentacion && (
                    <span className="text-muted"> · {p.presentacion}</span>
                  )}
                </td>
                <td className="tnum py-1.5 pr-2 text-right">{l.bultos}</td>
                <td className="tnum py-1.5 pr-2 text-right">{sueltasDe(l)}</td>
                <td className="tnum py-1.5 text-right">{l.unidades}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-2 pr-2" colSpan={2}>
              {ingreso.lineas.length} producto(s)
            </td>
            <td className="tnum py-2 pr-2 text-right">{totalBultos}</td>
            <td></td>
            <td className="tnum py-2 text-right">{totalUnidades}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-6 border-t border-line pt-2 text-[10px] text-faint">
        Documento interno de ingreso al depósito.
      </p>
    </div>
  );
}

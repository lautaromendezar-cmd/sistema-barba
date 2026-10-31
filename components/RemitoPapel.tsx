import { money, fecha, pct, totalRemito } from "@/lib/formato";
import type { RemitoLinea } from "@/lib/types";
import { codigoCliente } from "@/lib/clientes";

export type ClienteDelPapel = {
  numero?: number;
  apodo: string;
  razonSocial: string;
  direccion: string;
  localidad: string;
  telefono: string;
  notas: string;
};

/**
 * El papel en sí. No usa el store: lo muestra el sistema (RemitoDoc) y también
 * el link que recibe el cliente, que no tiene sesión. Cada línea llega con su
 * nombre en `descripcion`.
 */
export function RemitoPapel({
  remito,
  cliente: c,
}: {
  remito: {
    numero: string;
    fecha: string;
    estado: string;
    ajustePct: number;
    notas: string;
    usuario: string;
    lineas: RemitoLinea[];
  };
  cliente: ClienteDelPapel | null | undefined;
}) {
  const entregadas = remito.lineas.filter((l) => l.entregado);
  const pendientes = remito.lineas.filter((l) => !l.entregado);
  const { subtotal, ajuste, total } = totalRemito(remito.lineas, remito.ajustePct);

  return (
    <div className="print-sheet bg-white text-[13px] text-ink">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-4">
        <div className="flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marca/grupo-barba.png"
            alt="Grupo Barba · Distribuidora de vinos"
            width={834}
            height={508}
            className="h-24 w-auto"
          />
          <div className="mt-1 text-xs leading-relaxed text-muted">
            1165047011 / 1172399523
            <br />
            barbavinos@gmail.com
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
            Remito
          </div>
          <div className="titulo tnum text-2xl font-semibold text-acento-ink">
            {remito.numero}
          </div>
          <div className="tnum mt-1 text-xs text-muted">
            {fecha(remito.fecha)}
          </div>
          {remito.estado === "anulado" && (
            <div className="mt-2 inline-block border border-ink px-2 py-0.5 text-[10px] font-bold tracking-widest text-acento-ink uppercase">
              Anulado
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
            Cliente{c?.numero ? ` ${codigoCliente(c.numero)}` : ""}
          </div>
          <div className="mt-1 font-semibold">
            {c ? c.razonSocial.trim() || c.apodo : "—"}
          </div>
          {c?.razonSocial.trim() && (
            <div className="text-xs text-muted">{c.apodo}</div>
          )}
          <div className="text-xs leading-relaxed text-muted">
            {c?.direccion}
            {c?.localidad ? ` · ${c.localidad}` : ""}
            {c?.telefono ? <><br />{c.telefono}</> : null}
          </div>
        </div>
        {c?.notas && (
          <div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
              Notas de entrega
            </div>
            <div className="mt-1 text-xs text-muted">{c.notas}</div>
          </div>
        )}
      </div>

      {entregadas.length === 0 ? (
        <p className="mt-5 border-y border-line py-3 text-center text-xs text-muted">
          Este remito no tiene mercadería entregada: todo quedó pendiente.
        </p>
      ) : (
      <>
      {/* En el celular la tabla no entra y el precio quedaría afuera. */}
      <ul className="mt-5 border-t border-ink/25 sm:hidden print:hidden">
        {entregadas.map((l, i) => (
          <li key={i} className="border-b border-line py-2">
            <div>{l.descripcion}</div>
            <div className="tnum mt-0.5 flex justify-between gap-3 text-xs text-muted">
              <span>
                {l.productoCodigo && `${l.productoCodigo} · ${l.bultos} bulto(s) · `}
                {l.unidades} u × {money(l.precioUnitario)}
              </span>
              <span className="text-[13px] font-medium text-ink">
                {money(l.unidades * l.precioUnitario)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <table className="mt-5 hidden w-full border-collapse text-[12.5px] sm:table print:table">
        <thead>
          <tr className="border-b border-ink/25 text-left text-[10px] tracking-wider text-muted uppercase">
            <th className="py-1.5 pr-2 font-semibold">Código</th>
            <th className="py-1.5 pr-2 font-semibold">Producto</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Bultos</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Unid.</th>
            <th className="py-1.5 pr-2 text-right font-semibold">P. unit.</th>
            <th className="py-1.5 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {entregadas.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="tnum py-1.5 pr-2 font-mono text-[11px] text-muted">
                  {l.productoCodigo || "—"}
                </td>
                <td className="py-1.5 pr-2">
                  {l.descripcion}
                </td>
                <td className="tnum py-1.5 pr-2 text-right">
                  {l.productoCodigo ? l.bultos : "—"}
                </td>
                <td className="tnum py-1.5 pr-2 text-right">{l.unidades}</td>
                <td className="tnum py-1.5 pr-2 text-right">
                  {money(l.precioUnitario)}
                </td>
                <td className="tnum py-1.5 text-right">
                  {money(l.unidades * l.precioUnitario)}
                </td>
              </tr>
          ))}
        </tbody>
      </table>
      </>
      )}

      {pendientes.length > 0 && (
        <div className="mt-4 border border-line bg-acento-soft p-3">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-acento-ink uppercase">
            Pendiente de entrega — se pide al proveedor
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {pendientes.map((l, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    <span className="tnum font-mono text-[11px] text-muted">
                      {l.productoCodigo}
                    </span>{" "}
                    {l.descripcion}
                  </span>
                  <span className="tnum shrink-0">
                    {l.bultos} bulto(s) · {l.unidades} u ·{" "}
                    {money(l.unidades * l.precioUnitario)}
                  </span>
                </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Estas líneas no salieron del depósito y no descuentan stock.
          </p>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <table className="tnum text-[13px]">
          <tbody>
            <tr>
              <td className="py-1 pr-8 text-muted">Subtotal</td>
              <td className="py-1 text-right">{money(subtotal)}</td>
            </tr>
            {remito.ajustePct !== 0 && (
              <tr>
                <td className="py-1 pr-8 text-muted">
                  {remito.ajustePct > 0 ? "Recargo" : "Descuento"}{" "}
                  {remito.ajustePct > 0 ? "+" : ""}
                  {pct(remito.ajustePct)}
                </td>
                <td className="py-1 text-right">{money(ajuste)}</td>
              </tr>
            )}
            <tr className="border-t border-ink/30">
              <td className="titulo py-1.5 pr-8 text-base font-semibold">
                Total
              </td>
              <td className="titulo py-1.5 text-right text-base font-semibold">
                {money(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {remito.notas && (
        <p className="mt-4 text-xs text-muted">
          <span className="font-semibold">Observaciones:</span> {remito.notas}
        </p>
      )}

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="border-t border-ink/40 pt-1 text-[10px] tracking-wider text-muted uppercase">
            Entregó · {remito.usuario}
          </div>
        </div>
        <div>
          <div className="border-t border-ink/40 pt-1 text-[10px] tracking-wider text-muted uppercase">
            Recibí conforme · aclaración y fecha
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-2 text-[10px] text-faint">
        Documento interno de entrega. No válido como factura.
      </p>
    </div>
  );
}

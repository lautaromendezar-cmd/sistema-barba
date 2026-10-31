"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { nombreCliente, textoBuscableCliente } from "@/lib/clientes";
import { money, fecha, fechaHora, totalRemito } from "@/lib/formato";
import { coincide, normalizar } from "@/lib/texto";
import { RemitoDoc } from "@/components/RemitoDoc";
import { BotonWhatsApp } from "@/components/BotonWhatsApp";
import type { Remito } from "@/lib/types";

/** "2026-10-13" en la hora de acá, que es como lo devuelve un <input type="date">. */
function diaLocal(d: Date) {
  return d.toLocaleDateString("en-CA");
}
function sumarDias(dia: string, n: number) {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + n);
  return diaLocal(d);
}

type Rango = { desde: string; hasta: string };

export default function Remitos() {
  const { db, cliente, producto, anularRemito, remitosEntre } = useStore();
  const [verId, setVerId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Con fechas elegidas los remitos se piden a la base: db.remitos son solo
  // los ultimos 500, y un control de fin de mes no puede quedar corto.
  const [rango, setRango] = useState<Rango | null>(null);
  const [delRango, setDelRango] = useState<Remito[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Al cambiar de fechas no se muestran los números del rango anterior.
  const elegir = (r: Rango | null) => {
    setDelRango(null);
    setRango(r);
  };

  useEffect(() => {
    if (!rango || rango.desde > rango.hasta) return;
    let vigente = true;
    // db.remitos cambia cuando otra PC emite o anula: se vuelve a pedir.
    (async () => {
      setBuscando(true);
      const lista = await remitosEntre(
        new Date(`${rango.desde}T00:00:00`).toISOString(),
        new Date(`${sumarDias(rango.hasta, 1)}T00:00:00`).toISOString(),
      );
      if (!vigente) return;
      setBuscando(false);
      if (lista) setDelRango(lista);
    })();
    return () => {
      vigente = false;
    };
  }, [rango, db.remitos, remitosEntre]);

  const hoy = diaLocal(new Date());
  const atajos: { texto: string; rango: Rango }[] = [
    { texto: "Hoy", rango: { desde: hoy, hasta: hoy } },
    { texto: "Ayer", rango: { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) } },
    { texto: "Últimos 7 días", rango: { desde: sumarDias(hoy, -6), hasta: hoy } },
    { texto: "Este mes", rango: { desde: `${hoy.slice(0, 8)}01`, hasta: hoy } },
  ];
  const mismoRango = (a: Rango | null, b: Rango) =>
    a?.desde === b.desde && a?.hasta === b.hasta;

  const base = useMemo(
    () => (rango ? (delRango ?? []) : db.remitos),
    [rango, delRango, db.remitos],
  );

  const remitos = useMemo(() => {
    const t = normalizar(q);
    return [...base]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .filter((r) => {
        if (!t) return true;
        const c = db.clientes.find((x) => x.id === r.clienteId);
        return coincide(r.numero, t) || (c ? coincide(textoBuscableCliente(c), t) : false);
      });
  }, [base, db.clientes, q]);

  /** Lo que se ve de un vistazo al final del día: cuántos, a quién, cuánto. */
  const resumen = useMemo(() => {
    const validos = remitos.filter((r) => r.estado === "emitido");
    return {
      emitidos: validos.length,
      anulados: remitos.filter((r) => r.estado === "anulado").length,
      clientes: new Set(validos.map((r) => r.clienteId)).size,
      bultos: validos.reduce(
        (a, r) =>
          a + r.lineas.filter((l) => l.entregado).reduce((b, l) => b + l.bultos, 0),
        0,
      ),
      conPendientes: validos.filter((r) => r.lineas.some((l) => !l.entregado)).length,
      total: validos.reduce((a, r) => a + totalRemito(r.lineas, r.ajustePct).total, 0),
    };
  }, [remitos]);

  /** Lo que se vendió y no salió del depósito, agrupado por bodega. */
  const pendientes = useMemo(() => {
    const porBodega = new Map<string, { nombre: string; unidades: number }[]>();
    for (const r of db.remitos) {
      if (r.estado === "anulado") continue;
      for (const l of r.lineas) {
        if (l.entregado || !l.productoCodigo) continue;
        const p = producto(l.productoCodigo);
        const bodega = p?.bodega ?? "Sin bodega";
        const lista = porBodega.get(bodega) ?? [];
        lista.push({
          nombre: `${p?.nombre ?? l.productoCodigo} · ${r.numero}`,
          unidades: l.unidades,
        });
        porBodega.set(bodega, lista);
      }
    }
    return [...porBodega.entries()];
  }, [db.remitos, producto]);

  const ver = verId
    ? (base.find((r) => r.id === verId) ?? db.remitos.find((r) => r.id === verId))
    : null;

  const chip = (activo: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm transition ${
      activo
        ? "border-ink bg-acento-soft text-acento-ink"
        : "border-line bg-surface text-muted hover:border-ink"
    }`;

  return (
    <div>
      <div className={ver ? "no-print" : ""}>
        <div className="no-print flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="titulo text-3xl font-semibold">Remitos</h1>
            <p className="mt-1 text-muted">
              Emitidos desde el sistema. Se anulan, nunca se borran.
            </p>
          </div>
          <Link
            href="/remitos/nuevo"
            className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover"
          >
            Nuevo remito
          </Link>
        </div>

        {/* Solo en papel: el título del listado. */}
        <h1 className="titulo hidden text-xl font-semibold print:block">
          Remitos
          {rango &&
            (rango.desde === rango.hasta
              ? ` del ${fecha(`${rango.desde}T12:00:00`)}`
              : ` del ${fecha(`${rango.desde}T12:00:00`)} al ${fecha(`${rango.hasta}T12:00:00`)}`)}
        </h1>

        <div className="no-print mt-6 flex flex-wrap items-center gap-2">
          <button onClick={() => elegir(null)} className={chip(rango === null)}>
            Todos
          </button>
          {atajos.map((a) => (
            <button
              key={a.texto}
              onClick={() => elegir(a.rango)}
              className={chip(mismoRango(rango, a.rango))}
            >
              {a.texto}
            </button>
          ))}
          <span className="ml-1 flex items-center gap-1.5 text-sm text-muted">
            Desde
            <input
              type="date"
              value={rango?.desde ?? ""}
              max={hoy}
              onChange={(e) =>
                e.target.value &&
                elegir({ desde: e.target.value, hasta: rango?.hasta ?? hoy })
              }
              className="tnum rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-ink"
            />
            hasta
            <input
              type="date"
              value={rango?.hasta ?? ""}
              max={hoy}
              onChange={(e) =>
                e.target.value &&
                elegir({ desde: rango?.desde ?? e.target.value, hasta: e.target.value })
              }
              className="tnum rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-ink"
            />
          </span>
        </div>

        <div className="no-print mt-3 flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número o cliente…"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink sm:max-w-sm"
          />
          {rango && remitos.length > 0 && (
            <button
              onClick={() => window.print()}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted transition hover:border-ink hover:text-acento-ink"
            >
              Imprimir listado
            </button>
          )}
        </div>

        {rango && rango.desde > rango.hasta && (
          <p className="text-alerta mt-3 text-sm">
            La fecha «desde» es posterior a «hasta».
          </p>
        )}

        {rango && (
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Remitos", resumen.emitidos],
              ["Clientes", resumen.clientes],
              ["Bultos entregados", resumen.bultos],
              ["Con pendientes", resumen.conPendientes],
              ["Anulados", resumen.anulados],
              ["Total", money(resumen.total)],
            ].map(([t, v]) => (
              <div key={t} className="bg-surface px-4 py-3">
                <div className="text-[11px] tracking-wider text-faint uppercase">{t}</div>
                <div className="titulo tnum mt-0.5 text-lg font-semibold">
                  {buscando && delRango === null ? "…" : v}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                <th className="px-3 py-2.5 font-semibold">Número</th>
                <th className="px-3 py-2.5 font-semibold">Fecha</th>
                <th className="px-3 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Emitió</th>
                <th className="px-3 py-2.5 text-right font-semibold">Bultos</th>
                <th className="px-3 py-2.5 font-semibold">Entrega</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                <th className="no-print px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {remitos.map((r) => {
                const { total } = totalRemito(r.lineas, r.ajustePct);
                const anulado = r.estado === "anulado";
                const nombre =
                  nombreCliente(cliente(r.clienteId)) || r.clienteDatos?.apodo || "—";
                const bultos = r.lineas
                  .filter((l) => l.entregado)
                  .reduce((a, l) => a + l.bultos, 0);
                const sinEntregar = r.lineas.filter((l) => !l.entregado).length;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-line last:border-0 hover:bg-canvas"
                  >
                    <td className="tnum px-3 py-3 font-medium whitespace-nowrap">
                      {r.numero}
                      {anulado && (
                        <span className="ml-2 rounded bg-acento-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-acento-ink uppercase">
                          Anulado
                        </span>
                      )}
                      {anulado && r.motivoAnulacion && (
                        <div className="mt-0.5 text-xs font-normal text-faint">
                          {r.motivoAnulacion}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {rango ? fechaHora(r.fecha) : fecha(r.fecha)}
                    </td>
                    <td className="px-3 py-3">{nombre}</td>
                    <td className="px-3 py-3 text-muted">{r.usuario}</td>
                    <td className="tnum px-3 py-3 text-right text-muted">
                      {anulado ? "—" : bultos}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {anulado ? (
                        <span className="text-faint">—</span>
                      ) : sinEntregar > 0 ? (
                        <span className="text-alerta font-medium">
                          {sinEntregar} pendiente{sinEntregar > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-muted">Completa</span>
                      )}
                    </td>
                    <td
                      className={`tnum px-3 py-3 text-right ${anulado ? "text-faint line-through" : ""}`}
                    >
                      {money(total)}
                    </td>
                    <td className="no-print px-3 py-3">
                      <div className="flex min-w-[200px] flex-wrap items-center justify-end gap-1 whitespace-nowrap min-[1340px]:flex-nowrap">
                      <button
                        onClick={() => setVerId(r.id)}
                        className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                      >
                        Ver / imprimir
                      </button>
                      <BotonWhatsApp remito={r} compacto />
                      {r.estado === "emitido" && (
                        <Link
                          href={`/remitos/nuevo?corrige=${r.id}`}
                          className="inline-block rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                        >
                          Corregir
                        </Link>
                      )}
                      {r.estado === "emitido" && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `¿Anular el remito ${r.numero}? El stock entregado vuelve al depósito.`,
                              )
                            )
                              anularRemito(r.id);
                          }}
                          className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                        >
                          Anular
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {remitos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    {buscando
                      ? "Buscando…"
                      : rango
                        ? "No hay remitos en esas fechas."
                        : "No hay remitos que coincidan."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="no-print">
          <h2 className="titulo mt-10 mb-1 border-b border-line pb-2 text-xl font-semibold">
            Falta pedirle al proveedor
          </h2>
          <p className="mb-3 text-sm text-muted">
            Lo que se vendió de lista y todavía no está en el depósito.
          </p>

          {pendientes.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-muted">
              No hay nada pendiente.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pendientes.map(([bodega, items]) => (
                <div
                  key={bodega}
                  className="rounded-lg border border-line bg-surface p-4"
                >
                  <div className="font-medium">{bodega}</div>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>{it.nombre}</span>
                        <span className="tnum shrink-0">{it.unidades} u</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {ver && (
        <div className="print-area fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 py-8">
          <div className="mx-auto max-w-3xl">
            <div className="no-print mb-3 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-hover"
              >
                Imprimir
              </button>
              <BotonWhatsApp
                remito={ver}
                className="rounded-md px-4 py-2 text-sm"
              />
              <button
                onClick={() => setVerId(null)}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm transition hover:border-ink hover:text-acento-ink"
              >
                Cerrar
              </button>
            </div>
            <div className="rounded-lg bg-white p-8 shadow-xl print:rounded-none print:p-0 print:shadow-none">
              <RemitoDoc remito={ver} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

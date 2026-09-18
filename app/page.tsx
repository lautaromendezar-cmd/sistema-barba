"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { money, enBultos, fecha, totalRemito } from "@/lib/formato";

/** Un producto con menos de un bulto entero se considera bajo. */
const estaBajo = (unidades: number, porBulto: number) =>
  unidades > 0 && unidades < Math.max(porBulto, 1);

export default function Inicio() {
  const { db, usuario, stock, aPedir } = useStore();

  const datos = useMemo(() => {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    const emitidos = db.remitos.filter((r) => r.estado === "emitido");
    const totalDe = (r: (typeof emitidos)[number]) =>
      totalRemito(
        r.lineas.filter((l) => l.entregado),
        r.ajustePct,
      ).total;

    const delMes = emitidos.filter((r) => {
      const d = new Date(r.fecha);
      return d.getMonth() === mesActual && d.getFullYear() === anioActual;
    });

    const mesPasado = new Date(anioActual, mesActual - 1, 1);
    const delMesPasado = emitidos.filter((r) => {
      const d = new Date(r.fecha);
      return (
        d.getMonth() === mesPasado.getMonth() &&
        d.getFullYear() === mesPasado.getFullYear()
      );
    });

    const vendidoMes = delMes.reduce((a, r) => a + totalDe(r), 0);
    const vendidoMesPasado = delMesPasado.reduce((a, r) => a + totalDe(r), 0);

    // Stock, en tres estados que no se pisan.
    let enStock = 0;
    let bajo = 0;
    let sinStock = 0;
    let valorizado = 0;
    for (const p of db.productos) {
      const u = stock(p.codigo);
      valorizado += Math.max(u, 0) * p.precioLista;
      if (u <= 0) sinStock++;
      else if (estaBajo(u, p.unidadesPorBulto)) bajo++;
      else enStock++;
    }

    // Doce meses de ventas para el gráfico.
    const meses: { etiqueta: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anioActual, mesActual - i, 1);
      const total = emitidos
        .filter((r) => {
          const f = new Date(r.fecha);
          return (
            f.getMonth() === d.getMonth() && f.getFullYear() === d.getFullYear()
          );
        })
        .reduce((a, r) => a + totalDe(r), 0);
      meses.push({
        etiqueta: d.toLocaleDateString("es-AR", { month: "short" }),
        total,
      });
    }

    // Lo que más sale, por unidades entregadas.
    const porProducto = new Map<string, { unidades: number; importe: number }>();
    for (const r of emitidos) {
      for (const l of r.lineas) {
        if (!l.entregado) continue;
        const act = porProducto.get(l.productoCodigo) ?? {
          unidades: 0,
          importe: 0,
        };
        act.unidades += l.unidades;
        act.importe += l.unidades * l.precioUnitario;
        porProducto.set(l.productoCodigo, act);
      }
    }
    const masVendidos = [...porProducto.entries()]
      .map(([codigo, v]) => ({
        codigo,
        producto: db.productos.find((p) => p.codigo === codigo),
        ...v,
      }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 5);

    const alertas = db.productos
      .map((p) => ({ p, u: stock(p.codigo), pedir: aPedir(p.codigo) }))
      .filter((x) => x.u <= 0 || estaBajo(x.u, x.p.unidadesPorBulto))
      .sort((a, b) => a.u - b.u)
      .slice(0, 6);

    const pendientes = db.productos.reduce((a, p) => a + aPedir(p.codigo), 0);

    return {
      vendidoMes,
      vendidoMesPasado,
      remitosMes: delMes.length,
      remitosMesPasado: delMesPasado.length,
      enStock,
      bajo,
      sinStock,
      valorizado,
      meses,
      masVendidos,
      alertas,
      pendientes,
      ultimos: emitidos.slice(0, 5),
      totalDe,
    };
  }, [db, stock, aPedir]);

  const sinDatos = db.remitos.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-2xl">
            Hola, {usuario?.nombre?.split(" ")[0]}
          </h1>
          <p className="text-muted mt-1 text-sm">
            {new Date().toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ingresos"
            className="border-line bg-surface hover:border-ink rounded-lg border px-4 py-2.5 text-sm font-medium transition"
          >
            Cargar mercadería
          </Link>
          <Link
            href="/remitos/nuevo"
            className="bg-ink hover:bg-ink-hover rounded-lg px-4 py-2.5 text-sm font-medium text-white transition"
          >
            Nuevo remito
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          titulo="Vendido este mes"
          valor={money(datos.vendidoMes)}
          anterior={datos.vendidoMesPasado}
          actual={datos.vendidoMes}
          pie="contra el mes pasado"
        />
        <Kpi
          titulo="Remitos emitidos"
          valor={String(datos.remitosMes)}
          anterior={datos.remitosMesPasado}
          actual={datos.remitosMes}
          pie="contra el mes pasado"
        />
        <Kpi
          titulo="Stock valorizado"
          valor={money(datos.valorizado)}
          pie={`${db.productos.length} productos en el catálogo`}
        />
        <Kpi
          titulo="Falta entregar"
          valor={`${datos.pendientes} u`}
          pie="vendido y todavía no entregado"
          alerta={datos.pendientes > 0}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <section className="tarjeta p-5">
          <h2 className="titulo text-[15px]">Estado del depósito</h2>
          <Donut
            enStock={datos.enStock}
            bajo={datos.bajo}
            sinStock={datos.sinStock}
          />
        </section>

        <section className="tarjeta p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="titulo text-[15px]">Ventas de los últimos 12 meses</h2>
            <span className="text-faint text-xs">sólo remitos emitidos</span>
          </div>
          <GraficoVentas meses={datos.meses} />
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="tarjeta overflow-hidden">
          <div className="border-line flex items-center justify-between border-b px-5 py-4">
            <h2 className="titulo text-[15px]">Hay que reponer</h2>
            <Link
              href="/productos"
              className="text-muted hover:text-ink text-xs underline underline-offset-2"
            >
              ver todo
            </Link>
          </div>
          {datos.alertas.length === 0 ? (
            <p className="text-faint px-5 py-8 text-center text-sm">
              Ningún producto en cero ni por debajo de un bulto.
            </p>
          ) : (
            <ul>
              {datos.alertas.map(({ p, u, pedir }) => (
                <li
                  key={p.codigo}
                  className="border-line flex items-center gap-3 border-b px-5 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.nombre}
                    </div>
                    <div className="text-faint truncate text-xs">
                      {p.bodega}
                      {pedir > 0 && ` · ${pedir} u comprometidas`}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      u <= 0
                        ? "bg-alerta-soft text-alerta"
                        : "bg-acento-soft text-acento-ink"
                    }`}
                  >
                    {u <= 0 ? (u === 0 ? "Sin stock" : `${u} u`) : "Queda poco"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta overflow-hidden">
          <div className="border-line flex items-center justify-between border-b px-5 py-4">
            <h2 className="titulo text-[15px]">Lo que más sale</h2>
            <Link
              href="/remitos"
              className="text-muted hover:text-ink text-xs underline underline-offset-2"
            >
              ver remitos
            </Link>
          </div>
          {datos.masVendidos.length === 0 ? (
            <p className="text-faint px-5 py-8 text-center text-sm">
              Todavía no se emitió ningún remito.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line text-faint border-b text-left text-[10px] tracking-wide uppercase">
                  <th className="px-5 py-2.5 font-semibold">Producto</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Unidades
                  </th>
                  <th className="px-5 py-2.5 text-right font-semibold">
                    Facturado
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.masVendidos.map((m) => (
                  <tr
                    key={m.codigo}
                    className="border-line border-b last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="max-w-[240px] truncate font-medium">
                        {m.producto?.nombre ?? m.codigo}
                      </div>
                      <div className="text-faint text-xs">
                        {m.producto?.bodega}
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right">{m.unidades}</td>
                    <td className="tnum px-5 py-3 text-right">
                      {money(m.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="tarjeta overflow-hidden">
        <div className="border-line flex items-center justify-between border-b px-5 py-4">
          <h2 className="titulo text-[15px]">Últimos remitos</h2>
          <Link
            href="/remitos"
            className="text-muted hover:text-ink text-xs underline underline-offset-2"
          >
            ver todos
          </Link>
        </div>
        {datos.ultimos.length === 0 ? (
          <p className="text-faint px-5 py-8 text-center text-sm">
            Cuando emitas el primero, aparece acá.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line text-faint border-b text-left text-[10px] tracking-wide uppercase">
                  <th className="px-5 py-2.5 font-semibold">Número</th>
                  <th className="px-3 py-2.5 font-semibold">Fecha</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Emitió</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {datos.ultimos.map((r) => (
                  <tr key={r.id} className="border-line border-b last:border-0">
                    <td className="tnum text-acento-ink px-5 py-3 font-medium">
                      {r.numero}
                    </td>
                    <td className="tnum text-muted px-3 py-3">
                      {fecha(r.fecha)}
                    </td>
                    <td className="px-3 py-3">
                      {db.clientes.find((c) => c.id === r.clienteId)?.nombre ??
                        "—"}
                    </td>
                    <td className="text-muted px-3 py-3">{r.usuario}</td>
                    <td className="tnum px-5 py-3 text-right font-medium">
                      {money(datos.totalDe(r))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sinDatos && (
        <p className="text-faint text-center text-xs">
          El sistema todavía no tiene movimiento: los números se llenan solos a
          medida que se carguen ingresos y se emitan remitos.
        </p>
      )}
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  actual,
  anterior,
  pie,
  alerta,
}: {
  titulo: string;
  valor: string;
  actual?: number;
  anterior?: number;
  pie: string;
  alerta?: boolean;
}) {
  // Sin mes anterior no hay con qué comparar: mejor no mostrar nada que
  // inventar un "+100%" que no significa nada.
  const variacion =
    actual !== undefined && anterior !== undefined && anterior > 0
      ? ((actual - anterior) / anterior) * 100
      : null;

  return (
    <div className="tarjeta p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted text-[13px]">{titulo}</span>
        {variacion !== null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              variacion >= 0
                ? "bg-ok-soft text-ok"
                : "bg-alerta-soft text-alerta"
            }`}
          >
            {variacion >= 0 ? "+" : ""}
            {variacion.toFixed(0)}%
          </span>
        )}
      </div>
      <div
        className={`titulo tnum mt-2 text-[26px] leading-tight ${alerta ? "text-acento-ink" : ""}`}
      >
        {valor}
      </div>
      <div className="text-faint mt-1 text-xs">{pie}</div>
    </div>
  );
}

function Donut({
  enStock,
  bajo,
  sinStock,
}: {
  enStock: number;
  bajo: number;
  sinStock: number;
}) {
  const total = enStock + bajo + sinStock;
  const radio = 58;
  const circunferencia = 2 * Math.PI * radio;

  const partes = [
    { valor: enStock, color: "var(--color-ink)", nombre: "Con stock" },
    { valor: bajo, color: "var(--color-acento)", nombre: "Queda poco" },
    { valor: sinStock, color: "var(--color-line)", nombre: "Sin stock" },
  ];

  let acumulado = 0;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 150 150" className="h-36 w-36 shrink-0 -rotate-90">
        {total === 0 ? (
          <circle
            cx="75"
            cy="75"
            r={radio}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="16"
          />
        ) : (
          partes.map((p) => {
            const largo = (p.valor / total) * circunferencia;
            const el = (
              <circle
                key={p.nombre}
                cx="75"
                cy="75"
                r={radio}
                fill="none"
                stroke={p.color}
                strokeWidth="16"
                strokeDasharray={`${largo} ${circunferencia - largo}`}
                strokeDashoffset={-acumulado}
              />
            );
            acumulado += largo;
            return el;
          })
        )}
      </svg>

      <ul className="min-w-[150px] flex-1 space-y-2.5">
        {partes.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-muted flex-1">{p.nombre}</span>
            <span className="tnum font-medium">{p.valor}</span>
          </li>
        ))}
        <li className="border-line text-muted flex items-center gap-2.5 border-t pt-2.5 text-sm">
          <span className="flex-1">Total</span>
          <span className="tnum font-semibold">{total}</span>
        </li>
      </ul>
    </div>
  );
}

/** 11.236.000 -> "11,2M". Un eje lleno de ceros no se lee. */
function corto(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function GraficoVentas({
  meses,
}: {
  meses: { etiqueta: string; total: number }[];
}) {
  const ancho = 720;
  const alto = 210;
  const margen = { arriba: 12, abajo: 26, izq: 52, der: 8 };
  const maximo = Math.max(...meses.map((m) => m.total), 1);

  const x = (i: number) =>
    margen.izq +
    (i * (ancho - margen.izq - margen.der)) / Math.max(meses.length - 1, 1);
  const y = (v: number) =>
    margen.arriba + (1 - v / maximo) * (alto - margen.arriba - margen.abajo);

  const linea = meses.map((m, i) => `${x(i)},${y(m.total)}`).join(" ");
  const area = `${margen.izq},${y(0)} ${linea} ${x(meses.length - 1)},${y(0)}`;

  const referencias = [0, 0.5, 1].map((f) => ({
    v: maximo * f,
    y: y(maximo * f),
  }));

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="mt-3 w-full"
      role="img"
      aria-label="Ventas por mes"
    >
      <defs>
        <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-acento)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-acento)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {referencias.map((r) => (
        <g key={r.v}>
          <line
            x1={margen.izq}
            x2={ancho - margen.der}
            y1={r.y}
            y2={r.y}
            stroke="var(--color-line)"
            strokeDasharray="3 4"
          />
          <text
            x={margen.izq - 8}
            y={r.y + 4}
            textAnchor="end"
            className="fill-faint"
            style={{ fontSize: 10 }}
          >
            {corto(r.v)}
          </text>
        </g>
      ))}

      <polygon points={area} fill="url(#relleno)" />
      <polyline
        points={linea}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {meses.map((m, i) => (
        <g key={`${m.etiqueta}-${i}`}>
          {m.total > 0 && (
            <circle cx={x(i)} cy={y(m.total)} r="3" fill="var(--color-ink)" />
          )}
          <text
            x={x(i)}
            y={alto - 8}
            textAnchor="middle"
            className="fill-faint"
            style={{ fontSize: 10 }}
          >
            {m.etiqueta}
          </text>
        </g>
      ))}
    </svg>
  );
}

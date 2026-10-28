"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { money } from "@/lib/formato";
import {
  aAplicar,
  comparar,
  hojasDe,
  leerOferta,
  leerOficial,
  planillaDeOferta,
  type Cambio,
  type Comparacion,
  type Renglon,
} from "@/lib/listas";
import type { Lista } from "@/lib/types";

const etiqueta =
  "mb-1 block text-xs font-semibold tracking-wide text-muted uppercase";

/** SheetJS pesa: se baja recién cuando alguien elige un archivo. */
const xlsx = () => import("xlsx");

/**
 * Actualizar precios desde Excel (pedido de Federico, 28-oct-2026).
 * La oficial se sube tal cual llega; la oferta, por la planilla del sistema.
 * Nada se guarda hasta tocar «Aplicar»: antes se ve qué sube, qué baja y qué
 * no se encontró, y los saltos raros hay que tildarlos uno por uno.
 */
export default function ActualizarPrecios() {
  const { db, aplicarPrecios } = useStore();
  const [lista, setLista] = useState<Lista>("oficial");
  const [archivo, setArchivo] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [hojas, setHojas] = useState<{ leidas: string[]; salteadas: string[] }>();
  const [comp, setComp] = useState<Comparacion | null>(null);
  const [tildados, setTildados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<number | null>(null);

  function empezar(l: Lista) {
    setLista(l);
    setArchivo("");
    setError("");
    setHojas(undefined);
    setComp(null);
    setTildados(new Set());
    setResultado(null);
  }

  async function leer(file: File) {
    setLeyendo(true);
    setError("");
    setComp(null);
    setResultado(null);
    setTildados(new Set());
    setArchivo(file.name);
    try {
      const XLSX = await xlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const matrices = hojasDe(XLSX.utils)(wb);
      const leido =
        lista === "oficial"
          ? leerOficial(matrices, db.productos)
          : leerOferta(matrices, db.productos);
      setHojas({ leidas: leido.hojasLeidas, salteadas: leido.hojasSalteadas });
      if (leido.hojasLeidas.length === 0) {
        setError(
          lista === "oficial"
            ? "No encontré ninguna hoja con las columnas CODIGO, BODEGA, Producto y «Precio unitario». ¿Es la lista oficial? La oferta se carga en la otra pestaña."
            : "No encontré las columnas «Código» y «Precio oferta x u». La oferta se carga con la planilla que baja el botón de arriba, no con el Excel de la oferta.",
        );
        return;
      }
      setComp(comparar(lista, leido.renglones));
    } catch (e) {
      console.error(e);
      setError("No pude leer el archivo. ¿Es un Excel (.xlsx o .xls)?");
    } finally {
      setLeyendo(false);
    }
  }

  async function bajarPlanilla() {
    const XLSX = await xlsx();
    const hoja = XLSX.utils.aoa_to_sheet(planillaDeOferta(db.productos));
    hoja["!cols"] = [{ wch: 9 }, { wch: 24 }, { wch: 44 }, { wch: 6 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja, "Oferta");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Planilla de oferta ${hoy}.xlsx`);
  }

  const paraAplicar = comp ? aAplicar(comp, tildados) : [];

  async function aplicar() {
    if (!comp || paraAplicar.length === 0 || aplicando) return;
    setAplicando(true);
    const n = await aplicarPrecios(comp.lista, paraAplicar);
    setAplicando(false);
    if (n !== null) {
      setResultado(n);
      setComp(null);
    }
  }

  const tildar = (codigo: string) =>
    setTildados((t) => {
      const n = new Set(t);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });

  return (
    <div>
      <Link href="/productos" className="text-sm text-muted hover:text-acento-ink">
        ← Productos y stock
      </Link>
      <h1 className="titulo mt-2 text-3xl font-semibold">Actualizar precios</h1>
      <p className="mt-1 text-muted">
        Se sube el Excel, se revisa qué cambia y recién al tocar «Aplicar» se
        guarda. Los remitos ya emitidos no cambian: guardan el precio con el que
        salieron.
      </p>

      <div className="mt-6 flex gap-2">
        {(["oficial", "oferta"] as const).map((l) => (
          <button
            key={l}
            onClick={() => empezar(l)}
            aria-pressed={lista === l}
            className={`rounded-md border px-4 py-2 text-sm transition ${
              lista === l
                ? "border-ink bg-acento-soft font-medium text-acento-ink"
                : "border-line bg-surface text-muted hover:border-ink"
            }`}
          >
            {l === "oficial" ? "Lista oficial" : "Lista de oferta"}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        {lista === "oficial" ? (
          <p className="text-sm text-muted">
            Subí el Excel de la lista <b className="text-ink">tal cual llega</b>.
            Se leen las hojas que tienen las columnas CODIGO y «Precio unitario»
            (las de chocolates, cristalería y cavas quedan afuera). Lo que dice
            «Consultar» no pisa el precio que hay.
          </p>
        ) : (
          <div className="text-sm text-muted">
            <p>
              El Excel de la oferta no trae códigos, así que va por una planilla
              del sistema: <b className="text-ink">bajala</b>, completá o cambiá
              la última columna («Precio oferta x u», por unidad) y{" "}
              <b className="text-ink">subila</b>. Vacía = ese producto sale de la
              oferta. Los productos que borres de la planilla quedan como están.
            </p>
            <button
              onClick={() => void bajarPlanilla()}
              className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-ink hover:text-acento-ink"
            >
              Bajar planilla de oferta ({db.productos.filter((p) => p.activo !== false).length} productos)
            </button>
          </div>
        )}

        <label className={`${etiqueta} mt-5`}>
          {lista === "oficial" ? "Excel de la lista oficial" : "Planilla de oferta completada"}
        </label>
        <input
          key={lista}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          disabled={leyendo || aplicando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leer(f);
            e.target.value = "";
          }}
          className="block text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm file:text-ink hover:file:border-ink"
        />
        {leyendo && <p className="mt-3 text-sm text-muted">Leyendo {archivo}…</p>}
        {error && <p className="text-alerta mt-3 text-sm font-medium">{error}</p>}
        {hojas && hojas.leidas.length > 0 && (
          <p className="mt-3 text-xs text-faint">
            {archivo}: leí {hojas.leidas.join(", ")}
            {hojas.salteadas.length > 0 && ` · salteé ${hojas.salteadas.join(", ")}`}
          </p>
        )}
        {resultado !== null && (
          <p className="mt-3 text-sm font-medium text-ink">
            Listo: {resultado.toLocaleString("es-AR")} precios de la lista {lista}{" "}
            cambiados. Los remitos nuevos ya salen con estos precios.
          </p>
        )}
      </div>

      {comp && (
        <Vista
          comp={comp}
          tildados={tildados}
          onTildar={tildar}
          cuantos={paraAplicar.length}
          aplicando={aplicando}
          onAplicar={() => void aplicar()}
        />
      )}
    </div>
  );
}

function Vista({
  comp,
  tildados,
  onTildar,
  cuantos,
  aplicando,
  onAplicar,
}: {
  comp: Comparacion;
  tildados: Set<string>;
  onTildar: (codigo: string) => void;
  cuantos: number;
  aplicando: boolean;
  onAplicar: () => void;
}) {
  const oferta = comp.lista === "oferta";
  const resumen: [string, number][] = [
    ["Suben", comp.suben.length],
    ["Bajan", comp.bajan.length],
    [oferta ? "Entran a la oferta" : "Tenían «a consultar»", comp.nuevos.length],
    ...(oferta ? ([["Salen de la oferta", comp.salen.length]] as [string, number][]) : []),
    ["Quedan igual", comp.iguales],
    ["No encontrados", comp.noEncontrados.length],
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {resumen.map(([t, n]) => (
          <div key={t} className="rounded-lg border border-line bg-surface px-4 py-3">
            <div className="tnum text-2xl font-semibold">{n.toLocaleString("es-AR")}</div>
            <div className="text-xs text-muted">{t}</div>
          </div>
        ))}
      </div>

      {comp.aRevisar.length > 0 && (
        <Seccion
          titulo={`Para revisar (${comp.aRevisar.length})`}
          nota="No entran salvo que los tildes. Suele ser un error de tipeo o un cambio de presentación (caja de 6 a caja de 12)."
          abierta
        >
          <TablaCambios cambios={comp.aRevisar} tildados={tildados} onTildar={onTildar} />
        </Seccion>
      )}
      {comp.suben.length > 0 && (
        <Seccion titulo={`Suben (${comp.suben.length})`}>
          <TablaCambios cambios={comp.suben} />
        </Seccion>
      )}
      {comp.bajan.length > 0 && (
        <Seccion titulo={`Bajan (${comp.bajan.length})`}>
          <TablaCambios cambios={comp.bajan} />
        </Seccion>
      )}
      {comp.nuevos.length > 0 && (
        <Seccion
          titulo={`${oferta ? "Entran a la oferta" : "Tenían «a consultar» y ahora tienen precio"} (${comp.nuevos.length})`}
        >
          <TablaCambios cambios={comp.nuevos} />
        </Seccion>
      )}
      {comp.salen.length > 0 && (
        <Seccion titulo={`Salen de la oferta (${comp.salen.length})`}>
          <TablaCambios cambios={comp.salen} />
        </Seccion>
      )}
      {comp.consultar.length > 0 && (
        <Seccion
          titulo={`Dicen «Consultar» y el sistema tiene precio (${comp.consultar.length})`}
          nota="No se tocan: queda el precio que tienen."
        >
          <TablaRenglones renglones={comp.consultar} />
        </Seccion>
      )}
      {comp.repetidos.length > 0 && (
        <Seccion
          titulo={`Repetidos con precios distintos (${comp.repetidos.length} renglones)`}
          nota="El mismo producto aparece dos veces con precios diferentes: no se toca. Corregilo a mano en Productos."
        >
          <TablaRenglones renglones={comp.repetidos} />
        </Seccion>
      )}
      {comp.noEncontrados.length > 0 && (
        <Seccion
          titulo={`No encontrados (${comp.noEncontrados.length})`}
          nota="No están en el sistema, o el código o el nombre no coinciden. Si hacen falta, se dan de alta en Productos."
        >
          <button
            onClick={() =>
              void navigator.clipboard.writeText(
                comp.noEncontrados
                  .map((r) =>
                    [r.hoja, r.fila, r.codigoExcel, r.bodega, r.nombre, r.precio ?? ""].join("\t"),
                  )
                  .join("\n"),
              )
            }
            className="mb-3 rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
          >
            Copiar la lista (para pegar en Excel)
          </button>
          <TablaRenglones renglones={comp.noEncontrados} />
        </Seccion>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm">
        <span className="text-sm text-muted">
          {cuantos === 0
            ? "No hay nada para cambiar."
            : `Se van a cambiar ${cuantos.toLocaleString("es-AR")} precios de la lista ${comp.lista}.`}
          {comp.aRevisar.length > 0 &&
            ` ${comp.aRevisar.length - comp.aRevisar.filter((c) => tildados.has(c.producto.codigo)).length} para revisar quedan afuera.`}
        </span>
        <button
          onClick={onAplicar}
          disabled={cuantos === 0 || aplicando}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
        >
          {aplicando ? "Aplicando…" : "Aplicar"}
        </button>
      </div>
    </div>
  );
}

function Seccion({
  titulo,
  nota,
  abierta = false,
  children,
}: {
  titulo: string;
  nota?: string;
  abierta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={abierta} className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer font-medium">{titulo}</summary>
      {nota && <p className="mt-2 text-sm text-muted">{nota}</p>}
      <div className="mt-3 max-h-[480px] overflow-auto">{children}</div>
    </details>
  );
}

const th = "py-2 pr-3 font-semibold";

function TablaCambios({
  cambios,
  tildados,
  onTildar,
}: {
  cambios: Cambio[];
  tildados?: Set<string>;
  onTildar?: (codigo: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
          {onTildar && <th className="w-8 py-2"></th>}
          <th className={th}>Código</th>
          <th className={th}>Producto</th>
          <th className={`${th} text-right`}>Antes x u</th>
          <th className={`${th} text-right`}>Ahora x u</th>
          <th className={`${th} text-right`}>Dif.</th>
          {onTildar && <th className={th}>Por qué</th>}
        </tr>
      </thead>
      <tbody>
        {cambios.map((c) => (
          <tr key={c.producto.codigo} className="border-b border-line last:border-0">
            {onTildar && (
              <td className="py-1.5">
                <input
                  type="checkbox"
                  checked={tildados?.has(c.producto.codigo) ?? false}
                  onChange={() => onTildar(c.producto.codigo)}
                  aria-label={`Aplicar ${c.producto.codigo}`}
                />
              </td>
            )}
            <td className="tnum py-1.5 pr-3 font-mono text-xs text-muted">{c.producto.codigo}</td>
            <td className="py-1.5 pr-3">
              {c.producto.nombre}
              <span className="text-xs text-faint">
                {" "}· {c.producto.bodega}
                {c.renglon.por === "nombre" && " · encontrado por nombre"}
              </span>
            </td>
            <td className="tnum py-1.5 pr-3 text-right text-muted">
              {c.antes === null ? "—" : money(c.antes)}
            </td>
            <td className="tnum py-1.5 pr-3 text-right font-medium">
              {c.despues === null ? "sale" : money(c.despues)}
            </td>
            <td className="tnum py-1.5 pr-3 text-right text-xs text-muted">
              {c.antes && c.despues
                ? `${c.despues > c.antes ? "+" : ""}${Math.round((c.despues / c.antes - 1) * 100)} %`
                : ""}
            </td>
            {onTildar && <td className="py-1.5 pr-3 text-xs text-alerta">{c.revisar}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaRenglones({ renglones }: { renglones: Renglon[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
          <th className={th}>Hoja · fila</th>
          <th className={th}>Código</th>
          <th className={th}>Bodega</th>
          <th className={th}>Producto</th>
          <th className={`${th} text-right`}>Precio x u</th>
        </tr>
      </thead>
      <tbody>
        {renglones.map((r) => (
          <tr key={`${r.hoja}-${r.fila}`} className="border-b border-line last:border-0">
            <td className="py-1.5 pr-3 text-xs whitespace-nowrap text-muted">
              {r.hoja} · {r.fila}
            </td>
            <td className="tnum py-1.5 pr-3 font-mono text-xs text-muted">{r.codigoExcel || "—"}</td>
            <td className="py-1.5 pr-3">{r.bodega}</td>
            <td className="py-1.5 pr-3">{r.nombre}</td>
            <td className="tnum py-1.5 pr-3 text-right">
              {r.consultar ? "Consultar" : r.precio === null ? "—" : money(r.precio)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

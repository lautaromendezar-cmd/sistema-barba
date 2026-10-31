import { numeroRemito } from "@/lib/formato";
import type { ClienteEnRemito, RemitoLinea } from "@/lib/types";

/** Lo que muestra el link que recibe el cliente: lo mismo que el papel. */
export type RemitoPublico = {
  numero: string;
  fecha: string;
  estado: "emitido" | "anulado";
  ajustePct: number;
  notas: string;
  cliente: ClienteEnRemito | null;
  usuario: string;
  lineas: RemitoLinea[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Null si el código no es de ningún remito. Pregunta siempre a la base, sin
 * caché: si lo anulan, el cliente lo tiene que ver anulado.
 */
export async function traerRemitoPublico(
  codigo: string,
): Promise<RemitoPublico | null> {
  if (!UUID.test(codigo)) return null;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/remito_publico`,
    {
      method: "POST",
      headers: {
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_codigo: codigo }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`remito_publico respondió ${res.status}`);
  const r = await res.json();
  if (!r) return null;
  return {
    numero: numeroRemito(r.numero),
    fecha: r.fecha,
    estado: r.estado,
    ajustePct: Number(r.ajuste_pct ?? 0),
    notas: r.notas ?? "",
    cliente: r.cliente ?? null,
    usuario: r.usuario ?? "",
    lineas: (r.lineas as Record<string, unknown>[]).map((l) => ({
      productoCodigo: (l.codigo as string | null) ?? "",
      descripcion: (l.descripcion as string | null) ?? "",
      bultos: Number(l.bultos),
      unidades: Number(l.unidades),
      precioUnitario: Number(l.precio),
      entregado: l.entregado as boolean,
    })),
  };
}

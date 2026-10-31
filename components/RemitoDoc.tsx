"use client";

import { useStore } from "@/lib/store";
import type { Remito } from "@/lib/types";
import { RemitoPapel } from "./RemitoPapel";

/** El papel que viaja en la camioneta. Se imprime con Ctrl+P. */
export function RemitoDoc({ remito }: { remito: Remito }) {
  const { producto, cliente } = useStore();
  // Un remito emitido muestra el cliente como estaba al emitirse, no la ficha
  // de hoy. Los borradores (y los anteriores a la copia) leen la ficha.
  const ficha = cliente(remito.clienteId);
  const copia = remito.clienteDatos;
  const c = copia
    ? {
        numero: copia.numero,
        apodo: copia.apodo ?? "",
        razonSocial: copia.razon_social ?? "",
        direccion: copia.direccion ?? "",
        localidad: copia.localidad ?? "",
        telefono: copia.telefono ?? "",
        notas: copia.notas ?? "",
      }
    : ficha && {
        numero: ficha.numero,
        apodo: ficha.nombre,
        razonSocial: ficha.razonSocial ?? "",
        direccion: ficha.direccion,
        localidad: ficha.localidad,
        telefono: ficha.telefono,
        notas: ficha.notas,
      };
  const conNombres = {
    ...remito,
    lineas: remito.lineas.map((l) => ({
      ...l,
      descripcion:
        l.descripcion ?? producto(l.productoCodigo)?.nombre ?? l.productoCodigo,
    })),
  };

  return <RemitoPapel remito={conNombres} cliente={c} />;
}

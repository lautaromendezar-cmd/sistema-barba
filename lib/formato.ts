const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const pesosDecimales = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (n: number) => pesos.format(Math.round(n));
export const money2 = (n: number) => pesosDecimales.format(n);

/** 10.5 -> "10,5%" (con coma, como se escribe acá). */
export function pct(n: number) {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

export function fecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fechaHora(iso: string) {
  const d = new Date(iso);
  return `${fecha(iso)} ${d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** "48 u · 4 caj" — el stock se cuenta en unidades y se muestra también en bultos. */
export function enBultos(unidades: number, unidadesPorBulto: number) {
  if (unidadesPorBulto <= 1) return `${unidades} u`;
  const bultos = Math.floor(Math.abs(unidades) / unidadesPorBulto);
  const sueltas = Math.abs(unidades) % unidadesPorBulto;
  const signo = unidades < 0 ? "-" : "";
  if (bultos === 0) return `${unidades} u`;
  return `${unidades} u · ${signo}${bultos} caj${sueltas ? ` + ${sueltas}` : ""}`;
}

export function totalRemito(
  lineas: { unidades: number; precioUnitario: number }[],
  ajustePct: number,
) {
  const subtotal = lineas.reduce(
    (acc, l) => acc + l.unidades * l.precioUnitario,
    0,
  );
  const ajuste = subtotal * (ajustePct / 100);
  return { subtotal, ajuste, total: subtotal + ajuste };
}

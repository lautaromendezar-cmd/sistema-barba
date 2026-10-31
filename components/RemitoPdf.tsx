import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { codigoCliente } from "@/lib/clientes";
import { fecha, money, pct, totalRemito } from "@/lib/formato";
import type { RemitoPublico } from "@/lib/remitoPublico";

const TINTA = "#111111";
const GRIS = "#666666";
const LINEA = "#dddddd";

const e = StyleSheet.create({
  pagina: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: TINTA },
  fila: { flexDirection: "row" },
  entre: { flexDirection: "row", justifyContent: "space-between" },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: TINTA,
    paddingBottom: 10,
  },
  etiqueta: { fontSize: 7, color: GRIS, letterSpacing: 1 },
  gris: { color: GRIS, fontSize: 8.5, lineHeight: 1.4 },
  negrita: { fontFamily: "Helvetica-Bold" },
  celda: { paddingVertical: 4, paddingRight: 5 },
  renglon: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINEA },
  titulos: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: GRIS },
  firma: {
    flex: 1,
    borderTopWidth: 0.75,
    borderTopColor: GRIS,
    paddingTop: 3,
    fontSize: 7,
    color: GRIS,
  },
});

/** Anchos de: código, producto, bultos, unidades, precio, importe. */
const ANCHOS = ["11%", "44%", "8%", "7%", "15%", "15%"];
const derecha = (i: number) => (i >= 2 ? ({ textAlign: "right" } as const) : {});

/** El mismo remito de RemitoPapel, para bajar. Si cambia uno, cambia el otro. */
export function RemitoPdf({ remito, logo }: { remito: RemitoPublico; logo: Buffer }) {
  const c = remito.cliente;
  const razon = c?.razon_social?.trim();
  const entregadas = remito.lineas.filter((l) => l.entregado);
  const pendientes = remito.lineas.filter((l) => !l.entregado);
  const { subtotal, ajuste, total } = totalRemito(remito.lineas, remito.ajustePct);
  const domicilio = [c?.direccion, c?.localidad].filter(Boolean).join(" · ");

  return (
    <Document title={`Remito ${remito.numero}`} author="Grupo Barba">
      <Page size="A4" style={e.pagina}>
        <View style={e.encabezado}>
          <View style={[e.fila, { alignItems: "center", gap: 12 }]}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={{ data: logo, format: "png" }} style={{ height: 62 }} />
            <Text style={e.gris}>
              1165047011 / 1172399523{"\n"}barbavinos@gmail.com
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={e.etiqueta}>REMITO</Text>
            <Text style={[e.negrita, { fontSize: 17, marginTop: 2 }]}>{remito.numero}</Text>
            <Text style={[e.gris, { marginTop: 2 }]}>{fecha(remito.fecha)}</Text>
            {remito.estado === "anulado" && (
              <Text style={[e.negrita, { marginTop: 5, fontSize: 9 }]}>ANULADO</Text>
            )}
          </View>
        </View>

        <View style={[e.fila, { marginTop: 12, gap: 20 }]}>
          <View style={{ flex: 1 }}>
            <Text style={e.etiqueta}>
              CLIENTE{c?.numero ? ` ${codigoCliente(c.numero)}` : ""}
            </Text>
            <Text style={[e.negrita, { marginTop: 3 }]}>{razon || c?.apodo || "—"}</Text>
            {razon && <Text style={e.gris}>{c?.apodo}</Text>}
            {domicilio && <Text style={e.gris}>{domicilio}</Text>}
            {c?.telefono && <Text style={e.gris}>{c.telefono}</Text>}
          </View>
          {c?.notas && (
            <View style={{ flex: 1 }}>
              <Text style={e.etiqueta}>NOTAS DE ENTREGA</Text>
              <Text style={[e.gris, { marginTop: 3 }]}>{c.notas}</Text>
            </View>
          )}
        </View>

        {entregadas.length === 0 ? (
          <Text style={[e.gris, { marginTop: 16, textAlign: "center" }]}>
            Este remito no tiene mercadería entregada: todo quedó pendiente.
          </Text>
        ) : (
          <View style={{ marginTop: 16 }}>
            <View style={e.titulos} fixed>
              {["CÓDIGO", "PRODUCTO", "BULTOS", "UNID.", "P. UNIT.", "IMPORTE"].map((t, i) => (
                <Text
                  key={t}
                  style={[e.celda, { width: ANCHOS[i], fontSize: 7, color: GRIS }, derecha(i)]}
                >
                  {t}
                </Text>
              ))}
            </View>
            {entregadas.map((l, n) => (
              <View key={n} style={e.renglon} wrap={false}>
                {[
                  l.productoCodigo || "—",
                  l.descripcion ?? "",
                  l.productoCodigo ? String(l.bultos) : "—",
                  String(l.unidades),
                  money(l.precioUnitario),
                  money(l.unidades * l.precioUnitario),
                ].map((t, i) => (
                  <Text key={i} style={[e.celda, { width: ANCHOS[i] }, derecha(i)]}>
                    {t}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {pendientes.length > 0 && (
          <View
            style={{ marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: LINEA }}
            wrap={false}
          >
            <Text style={e.etiqueta}>PENDIENTE DE ENTREGA — SE PIDE AL PROVEEDOR</Text>
            {pendientes.map((l, n) => (
              <View key={n} style={[e.entre, { marginTop: 3, gap: 12 }]}>
                <Text style={{ flex: 1 }}>
                  {l.productoCodigo} {l.descripcion}
                </Text>
                <Text>
                  {l.bultos} bulto(s) · {l.unidades} u · {money(l.unidades * l.precioUnitario)}
                </Text>
              </View>
            ))}
            <Text style={[e.gris, { marginTop: 5 }]}>
              Estas líneas no salieron del depósito y no descuentan stock.
            </Text>
          </View>
        )}

        <View style={{ marginTop: 14, alignSelf: "flex-end", width: 190 }} wrap={false}>
          <View style={[e.entre, { paddingVertical: 2 }]}>
            <Text style={e.gris}>Subtotal</Text>
            <Text>{money(subtotal)}</Text>
          </View>
          {remito.ajustePct !== 0 && (
            <View style={[e.entre, { paddingVertical: 2 }]}>
              <Text style={e.gris}>
                {remito.ajustePct > 0 ? "Recargo +" : "Descuento "}
                {pct(remito.ajustePct)}
              </Text>
              <Text>{money(ajuste)}</Text>
            </View>
          )}
          <View
            style={[
              e.entre,
              { paddingTop: 4, marginTop: 2, borderTopWidth: 0.75, borderTopColor: GRIS },
            ]}
          >
            <Text style={[e.negrita, { fontSize: 12 }]}>Total</Text>
            <Text style={[e.negrita, { fontSize: 12 }]}>{money(total)}</Text>
          </View>
        </View>

        {remito.notas !== "" && (
          <Text style={[e.gris, { marginTop: 10 }]}>Observaciones: {remito.notas}</Text>
        )}

        <View style={[e.fila, { marginTop: 34, gap: 24 }]} wrap={false}>
          <Text style={e.firma}>ENTREGÓ · {remito.usuario.toUpperCase()}</Text>
          <Text style={e.firma}>RECIBÍ CONFORME · ACLARACIÓN Y FECHA</Text>
        </View>

        <Text style={[e.gris, { marginTop: 16, fontSize: 7 }]}>
          Documento interno de entrega. No válido como factura.
        </Text>
      </Page>
    </Document>
  );
}

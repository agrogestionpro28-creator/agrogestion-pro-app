import { NextResponse } from "next/server";

export async function GET() {
  // Intentamos múltiples fuentes para obtener BNA divisa venta
  // La divisa venta del BNA es el tipo de cambio mayorista/exportación

  // Fuente 1: Ámbito — diferencia entre billete y divisa
  try {
    const res = await fetch(
      "https://mercados.ambito.com/dolar/oficial/variacion",
      { next: { revalidate: 1800 } } // cache 30 min
    );
    if (res.ok) {
      const data = await res.json();
      // Ámbito devuelve: { compra, venta, fecha, variacion, ... }
      const venta = parseFloat(String(data.venta).replace(",", "."));
      const compra = parseFloat(String(data.compra).replace(",", "."));
      if (!isNaN(venta) && venta > 0) {
        return NextResponse.json({
          venta,
          compra,
          fecha: new Date().toISOString().split("T")[0],
          fuente: "BNA Divisa Venta (Ámbito)",
        });
      }
    }
  } catch {}

  // Fuente 2: argentinadatos — dólar oficial (BNA)
  try {
    const res = await fetch(
      "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial",
      { next: { revalidate: 1800 } }
    );
    if (res.ok) {
      const data = await res.json();
      const ultimo = Array.isArray(data) ? data[data.length - 1] : data;
      const venta = Number(ultimo?.venta);
      const compra = Number(ultimo?.compra);
      if (!isNaN(venta) && venta > 0) {
        return NextResponse.json({
          venta,
          compra,
          fecha: ultimo?.fecha ?? new Date().toISOString().split("T")[0],
          fuente: "BNA Divisa Venta (ArgentinaDatos)",
        });
      }
    }
  } catch {}

  // Fuente 3: dolarapi — oficial
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 1800 },
    });
    if (res.ok) {
      const data = await res.json();
      const venta = Number(data.venta);
      const compra = Number(data.compra);
      if (!isNaN(venta) && venta > 0) {
        return NextResponse.json({
          venta,
          compra,
          fecha: new Date().toISOString().split("T")[0],
          fuente: "BNA Divisa Venta (DolarApi)",
        });
      }
    }
  } catch {}

  return NextResponse.json(
    { error: "No se pudo obtener la cotización BNA divisa venta", venta: null },
    { status: 503 }
  );
}

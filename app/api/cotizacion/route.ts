import { NextResponse } from "next/server";

export async function GET() {
  try {
    // API pública que trae cotizaciones del BNA oficial
    const res = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial", {
      next: { revalidate: 3600 }, // cache 1 hora
    });

    if (!res.ok) throw new Error("Error al obtener cotización");

    const data = await res.json();

    // Trae array ordenado por fecha — tomamos el último
    const ultimo = Array.isArray(data) ? data[data.length - 1] : data;

    // BNA divisa venta
    const venta = ultimo?.venta ?? null;
    const compra = ultimo?.compra ?? null;
    const fecha = ultimo?.fecha ?? new Date().toISOString().split("T")[0];

    if (!venta) throw new Error("Sin dato de venta");

    return NextResponse.json({
      venta: Number(venta),
      compra: Number(compra),
      fecha,
      fuente: "BNA Oficial",
    });
  } catch (error) {
    // Fallback: intentar con otra fuente
    try {
      const res2 = await fetch("https://dolarapi.com/v1/dolares/oficial");
      const data2 = await res2.json();
      return NextResponse.json({
        venta: Number(data2.venta),
        compra: Number(data2.compra),
        fecha: new Date().toISOString().split("T")[0],
        fuente: "BNA Oficial (fallback)",
      });
    } catch {
      return NextResponse.json(
        { error: "No se pudo obtener la cotización", venta: null },
        { status: 503 }
      );
    }
  }
}

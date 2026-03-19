"use client";
import { useState, useRef, useCallback } from "react";

type TipoDocumento =
  | "factura_insumos"
  | "liquidacion_granos"
  | "cheque"
  | "remito_gasoil"
  | "factura_compra"
  | "guia_hacienda"
  | "recibo_sueldo"
  | "desconocido";

type ResultadoIA = {
  tipo: TipoDocumento;
  confianza: number;
  descripcion: string;
  datos: Record<string, any>;
  modulo_destino: string;
  accion: string;
};

const TIPO_CONFIG: Record<TipoDocumento, { icon: string; color: string; label: string; modulo: string }> = {
  factura_insumos:  { icon: "🧪", color: "#4ADE80", label: "Factura de Insumos",     modulo: "Stock → Insumos" },
  liquidacion_granos:{ icon: "🌾", color: "#C9A227", label: "Liquidación de Granos",  modulo: "Stock → Granos + Finanzas" },
  cheque:           { icon: "💳", color: "#60A5FA", label: "Cheque",                  modulo: "Finanzas → Cheques" },
  remito_gasoil:    { icon: "⛽", color: "#FB923C", label: "Remito de Gasoil",        modulo: "Stock → Gasoil" },
  factura_compra:   { icon: "🧾", color: "#A78BFA", label: "Factura de Compra",       modulo: "Finanzas → Movimientos" },
  guia_hacienda:    { icon: "🐄", color: "#4ADE80", label: "Guía de Hacienda",        modulo: "Hacienda → Movimientos" },
  recibo_sueldo:    { icon: "👷", color: "#FB923C", label: "Recibo de Sueldo",        modulo: "Documentos → Empleados" },
  desconocido:      { icon: "📄", color: "#9CA3AF", label: "Documento General",       modulo: "Documentos" },
};

interface Props {
  empresaId: string;
  onCargado?: (tipo: TipoDocumento, datos: Record<string, any>) => void;
}

export default function EscanerIA({ empresaId, onCargado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<"subir" | "analizando" | "preview" | "cargando" | "listo" | "error">("subir");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);
  const [datosEditados, setDatosEditados] = useState<Record<string, any>>({});
  const [msgError, setMsgError] = useState("");
  const [arrastrar, setArrastrar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const resetear = () => {
    setPaso("subir"); setArchivo(null); setPreview(null);
    setResultado(null); setDatosEditados({}); setMsgError("");
  };

  const procesarArchivo = async (file: File) => {
    setArchivo(file);
    // Preview imagen
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
    setPaso("analizando");
    await analizarConIA(file);
  };

  const analizarConIA = async (file: File) => {
    try {
      // Convertir a base64
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const esImagen = file.type.startsWith("image/");
      const esPDF = file.type === "application/pdf";

      const contenido: any[] = [];

      if (esImagen) {
        contenido.push({
          type: "image",
          source: { type: "base64", media_type: file.type, data: base64 }
        });
      } else if (esPDF) {
        contenido.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 }
        });
      }

      contenido.push({
        type: "text",
        text: `Analizá este documento agropecuario argentino y respondé SOLO con un JSON válido (sin markdown, sin explicaciones, solo el JSON).

Detectá el tipo de documento y extraé todos los datos relevantes.

Tipos posibles:
- factura_insumos: factura de compra de semillas, fertilizantes, agroquímicos, herbicidas
- liquidacion_granos: liquidación de venta de granos (soja, maíz, trigo, etc.)
- cheque: cheque físico o echeq
- remito_gasoil: remito o factura de gasoil/combustible
- factura_compra: cualquier otra factura de compra general
- guia_hacienda: guía de traslado de hacienda o DTE
- recibo_sueldo: recibo de sueldo de empleado
- desconocido: si no podés identificar

Respondé con este formato exacto:
{
  "tipo": "tipo_detectado",
  "confianza": 0.95,
  "descripcion": "Descripción breve de lo que es el documento",
  "modulo_destino": "Nombre del módulo donde se cargará",
  "accion": "Descripción de qué se va a hacer",
  "datos": {
    // Para factura_insumos:
    "proveedor": "nombre proveedor",
    "numero_factura": "0001-00001234",
    "fecha": "2025-03-15",
    "items": [
      {
        "nombre": "Glifosato 48%",
        "categoria": "agroquimico",
        "cantidad": 100,
        "unidad": "litros",
        "precio_unitario": 1500,
        "precio_total": 150000
      }
    ],
    "total": 150000,
    "condicion_pago": "contado"
    
    // Para liquidacion_granos:
    // "corredor": "nombre corredor",
    // "cultivo": "soja",
    // "kilos_brutos": 30000,
    // "kilos_netos": 29100,
    // "precio_tonelada": 280000,
    // "total_bruto": 8148000,
    // "descuentos": [{"concepto": "secada", "monto": 45000}],
    // "total_neto": 8000000,
    // "fecha": "2025-03-15",
    // "destino": "nombre empresa"
    
    // Para cheque:
    // "banco": "Banco Nación",
    // "numero": "12345678",
    // "librador": "Nombre Librador",
    // "monto": 500000,
    // "fecha_emision": "2025-03-15",
    // "fecha_pago": "2025-04-15",
    // "tipo": "fisico o echeq"
    
    // Para remito_gasoil:
    // "proveedor": "YPF",
    // "litros": 500,
    // "precio_litro": 1200,
    // "total": 600000,
    // "fecha": "2025-03-15",
    // "tanque": "propio"
    
    // Para guia_hacienda:
    // "tipo_movimiento": "venta o compra o traslado",
    // "especie": "bovino",
    // "cantidad": 50,
    // "origen": "nombre establecimiento origen",
    // "destino": "nombre establecimiento destino",
    // "fecha": "2025-03-15",
    // "numero_guia": "GD-12345"
  }
}`
      });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: contenido }]
        })
      });

      const data = await res.json();
      const texto = data.content?.[0]?.text ?? "";

      // Parsear JSON
      let json: ResultadoIA;
      try {
        const clean = texto.replace(/```json|```/g, "").trim();
        json = JSON.parse(clean);
      } catch {
        throw new Error("No se pudo parsear la respuesta de IA");
      }

      setResultado(json);
      setDatosEditados(json.datos ?? {});
      setPaso("preview");

    } catch (err: any) {
      setMsgError(err.message ?? "Error al analizar el documento");
      setPaso("error");
    }
  };

  const confirmarCarga = async () => {
    if (!resultado || !empresaId) return;
    setPaso("cargando");
    const sb = await getSB();

    try {
      switch (resultado.tipo) {

        case "factura_insumos": {
          const items = datosEditados.items ?? [];
          for (const item of items) {
            await sb.from("stock_insumos").insert({
              empresa_id: empresaId,
              nombre: item.nombre ?? "Insumo",
              categoria: item.categoria ?? "agroquimico",
              cantidad: Number(item.cantidad ?? 0),
              unidad: item.unidad ?? "unidad",
              precio_unitario: Number(item.precio_unitario ?? 0),
              proveedor: datosEditados.proveedor ?? "",
              ubicacion: "deposito",
              fecha_compra: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
              observaciones: `Cargado por Escáner IA · Factura ${datosEditados.numero_factura ?? ""}`,
            });
          }
          // También cargar en finanzas como gasto
          if (datosEditados.total) {
            await sb.from("finanzas_movimientos").insert({
              empresa_id: empresaId,
              tipo: "egreso",
              categoria: "insumos",
              descripcion: `Compra insumos - ${datosEditados.proveedor ?? "Proveedor"} · Escáner IA`,
              monto: Number(datosEditados.total),
              fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
              comprobante: datosEditados.numero_factura ?? "",
            });
          }
          break;
        }

        case "liquidacion_granos": {
          // Cargar en stock granos como venta
          await sb.from("stock_movimientos").insert({
            empresa_id: empresaId,
            tipo_stock: "granos",
            tipo_movimiento: "venta",
            producto: datosEditados.cultivo ?? "Granos",
            cantidad: Number(datosEditados.kilos_netos ?? datosEditados.kilos_brutos ?? 0),
            unidad: "kg",
            precio_unitario: datosEditados.precio_tonelada ? Number(datosEditados.precio_tonelada) / 1000 : 0,
            monto_total: Number(datosEditados.total_neto ?? datosEditados.total_bruto ?? 0),
            fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
            observaciones: `Liquidación ${datosEditados.corredor ?? ""} · Escáner IA`,
          });
          // Cargar en finanzas como ingreso
          await sb.from("finanzas_movimientos").insert({
            empresa_id: empresaId,
            tipo: "ingreso",
            categoria: "venta_granos",
            descripcion: `Liquidación ${datosEditados.cultivo ?? "granos"} - ${datosEditados.corredor ?? ""} · Escáner IA`,
            monto: Number(datosEditados.total_neto ?? datosEditados.total_bruto ?? 0),
            fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
          });
          break;
        }

        case "cheque": {
          await sb.from("finanzas_cheques").insert({
            empresa_id: empresaId,
            tipo_cheque: datosEditados.tipo === "echeq" ? "echeq" : "fisico",
            tipo_operacion: "recibido",
            banco: datosEditados.banco ?? "",
            numero: datosEditados.numero ?? "",
            librador: datosEditados.librador ?? "",
            monto: Number(datosEditados.monto ?? 0),
            fecha_emision: datosEditados.fecha_emision ?? new Date().toISOString().split("T")[0],
            fecha_pago: datosEditados.fecha_pago ?? null,
            estado: "en_cartera",
            observaciones: "Cargado por Escáner IA",
          });
          break;
        }

        case "remito_gasoil": {
          await sb.from("stock_gasoil").insert({
            empresa_id: empresaId,
            tipo: datosEditados.tanque === "proveedor" ? "proveedor" : "propio",
            litros_cargados: Number(datosEditados.litros ?? 0),
            precio_litro: Number(datosEditados.precio_litro ?? 0),
            proveedor: datosEditados.proveedor ?? "",
            fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
            observaciones: "Cargado por Escáner IA",
          });
          break;
        }

        case "factura_compra": {
          await sb.from("finanzas_movimientos").insert({
            empresa_id: empresaId,
            tipo: "egreso",
            categoria: "compras_generales",
            descripcion: `${datosEditados.proveedor ?? "Proveedor"} · Escáner IA`,
            monto: Number(datosEditados.total ?? datosEditados.monto ?? 0),
            fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
            comprobante: datosEditados.numero_factura ?? "",
          });
          break;
        }

        case "guia_hacienda": {
          await sb.from("hacienda_movimientos").insert({
            empresa_id: empresaId,
            tipo: datosEditados.tipo_movimiento ?? "compra",
            cantidad: Number(datosEditados.cantidad ?? 0),
            peso_total: 0,
            precio_cabeza: 0,
            precio_kg: 0,
            monto_total: 0,
            fecha: datosEditados.fecha ?? new Date().toISOString().split("T")[0],
            procedencia: datosEditados.origen ?? "",
            destino: datosEditados.destino ?? "",
            observaciones: `Guía ${datosEditados.numero_guia ?? ""} · Escáner IA`,
          });
          break;
        }

        default: {
          // Guardar en documentos generales
          await sb.from("documentos").insert({
            empresa_id: empresaId,
            categoria: "otro",
            nombre: resultado.descripcion ?? "Documento escaneado",
            descripcion: `Cargado por Escáner IA · ${resultado.tipo}`,
            fecha: new Date().toISOString().split("T")[0],
            activo: true,
          });
        }
      }

      setPaso("listo");
      if (onCargado) onCargado(resultado.tipo, datosEditados);

    } catch (err: any) {
      setMsgError(err.message ?? "Error al cargar los datos");
      setPaso("error");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setArrastrar(false);
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  }, []);

  const inputClass = "w-full bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono";

  return (
    <>
      {/* Botón flotante */}
      <button onClick={() => { setAbierto(true); resetear(); }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#00FF80] shadow-lg shadow-[#00FF80]/30 flex items-center justify-center text-2xl hover:scale-110 transition-all hover:shadow-[#00FF80]/50"
        title="Escáner IA — Subí una foto y cargamos automáticamente">
        📸
      </button>

      {/* Modal */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setAbierto(false); resetear(); } }}>
          <div className="absolute inset-0 bg-[#020810]/80 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl bg-[#0a1628] border border-[#00FF80]/30 rounded-2xl shadow-2xl shadow-[#00FF80]/10 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#00FF80]/15">
              <div>
                <h2 className="text-[#00FF80] font-mono font-bold text-lg">📸 ESCÁNER IA</h2>
                <p className="text-[#4B5563] text-xs font-mono">Subí una foto o PDF y la IA carga los datos automáticamente</p>
              </div>
              <button onClick={() => { setAbierto(false); resetear(); }} className="text-[#4B5563] hover:text-[#9CA3AF] text-xl font-mono">✕</button>
            </div>

            <div className="p-6">

              {/* PASO 1 — Subir */}
              {paso === "subir" && (
                <div>
                  <div
                    onDragOver={e => { e.preventDefault(); setArrastrar(true); }}
                    onDragLeave={() => setArrastrar(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${arrastrar ? "border-[#00FF80] bg-[#00FF80]/10" : "border-[#00FF80]/20 hover:border-[#00FF80]/40 hover:bg-[#00FF80]/5"}`}>
                    <div className="text-5xl mb-4">📸</div>
                    <p className="text-[#E5E7EB] font-mono font-bold mb-2">Arrastrá o clickeá para subir</p>
                    <p className="text-[#4B5563] text-xs font-mono">Foto de factura, liquidación, cheque, remito, guía de hacienda...</p>
                    <p className="text-[#4B5563] text-xs font-mono mt-1">JPG · PNG · PDF</p>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); }} />

                  {/* Tips */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      { icon: "🧪", text: "Factura insumos → Stock" },
                      { icon: "🌾", text: "Liquidación → Granos + Finanzas" },
                      { icon: "💳", text: "Cheque → Cartera" },
                      { icon: "⛽", text: "Remito gasoil → Stock" },
                      { icon: "🧾", text: "Factura compra → Egresos" },
                      { icon: "🐄", text: "Guía hacienda → Movimientos" },
                    ].map(t => (
                      <div key={t.text} className="flex items-center gap-2 text-xs text-[#4B5563] font-mono bg-[#020810]/60 px-3 py-2 rounded-lg border border-[#00FF80]/5">
                        <span>{t.icon}</span><span>{t.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PASO 2 — Analizando */}
              {paso === "analizando" && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-6 animate-pulse">🤖</div>
                  <p className="text-[#00FF80] font-mono font-bold text-lg mb-2">Analizando documento...</p>
                  <p className="text-[#4B5563] text-xs font-mono">La IA está leyendo y clasificando el contenido</p>
                  {preview && (
                    <div className="mt-6 flex justify-center">
                      <img src={preview} alt="preview" className="max-h-40 rounded-xl border border-[#00FF80]/20 opacity-50" />
                    </div>
                  )}
                  <div className="mt-6 flex justify-center gap-1">
                    {[0,1,2,3,4].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#00FF80] animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* PASO 3 — Preview */}
              {paso === "preview" && resultado && (
                <div>
                  <div className="flex items-center gap-4 mb-5">
                    {preview && <img src={preview} alt="doc" className="w-20 h-20 object-cover rounded-xl border border-[#00FF80]/20" />}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{TIPO_CONFIG[resultado.tipo]?.icon}</span>
                        <span className="font-bold text-[#E5E7EB] font-mono">{TIPO_CONFIG[resultado.tipo]?.label}</span>
                        <span className="text-xs bg-[#00FF80]/10 text-[#00FF80] px-2 py-0.5 rounded font-mono border border-[#00FF80]/20">
                          {Math.round((resultado.confianza ?? 0.9) * 100)}% confianza
                        </span>
                      </div>
                      <p className="text-xs text-[#4B5563] font-mono">{resultado.descripcion}</p>
                      <p className="text-xs font-mono mt-1" style={{ color: TIPO_CONFIG[resultado.tipo]?.color }}>
                        → Se cargará en: {TIPO_CONFIG[resultado.tipo]?.modulo}
                      </p>
                    </div>
                  </div>

                  {/* Datos editables */}
                  <div className="bg-[#020810]/60 border border-[#00FF80]/10 rounded-xl p-4 mb-5 max-h-72 overflow-y-auto">
                    <p className="text-xs text-[#4B5563] font-mono mb-3">◆ REVISÁ Y EDITÁ LOS DATOS ANTES DE CONFIRMAR</p>

                    {/* Items de factura */}
                    {resultado.tipo === "factura_insumos" && datosEditados.items && (
                      <div className="mb-4">
                        <p className="text-xs text-[#00FF80] font-mono mb-2">PRODUCTOS DETECTADOS:</p>
                        {datosEditados.items.map((item: any, i: number) => (
                          <div key={i} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-lg p-3 mb-2 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-[#4B5563] font-mono">Nombre</label>
                              <input value={item.nombre ?? ""} onChange={e => {
                                const items = [...datosEditados.items];
                                items[i] = { ...items[i], nombre: e.target.value };
                                setDatosEditados({ ...datosEditados, items });
                              }} className={inputClass} />
                            </div>
                            <div>
                              <label className="text-xs text-[#4B5563] font-mono">Categoría</label>
                              <select value={item.categoria ?? ""} onChange={e => {
                                const items = [...datosEditados.items];
                                items[i] = { ...items[i], categoria: e.target.value };
                                setDatosEditados({ ...datosEditados, items });
                              }} className={inputClass}>
                                <option value="semilla">Semilla</option>
                                <option value="fertilizante">Fertilizante</option>
                                <option value="agroquimico">Agroquímico</option>
                                <option value="herbicida">Herbicida</option>
                                <option value="fungicida">Fungicida</option>
                                <option value="insecticida">Insecticida</option>
                                <option value="otro">Otro</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-[#4B5563] font-mono">Cantidad</label>
                              <input type="number" value={item.cantidad ?? ""} onChange={e => {
                                const items = [...datosEditados.items];
                                items[i] = { ...items[i], cantidad: e.target.value };
                                setDatosEditados({ ...datosEditados, items });
                              }} className={inputClass} />
                            </div>
                            <div>
                              <label className="text-xs text-[#4B5563] font-mono">Precio unitario</label>
                              <input type="number" value={item.precio_unitario ?? ""} onChange={e => {
                                const items = [...datosEditados.items];
                                items[i] = { ...items[i], precio_unitario: e.target.value };
                                setDatosEditados({ ...datosEditados, items });
                              }} className={inputClass} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Campos genéricos para otros tipos */}
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(datosEditados)
                        .filter(([k]) => k !== "items" && k !== "descuentos")
                        .map(([key, val]) => (
                          <div key={key}>
                            <label className="text-xs text-[#4B5563] font-mono capitalize">{key.replace(/_/g, " ")}</label>
                            <input
                              value={typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}
                              onChange={e => setDatosEditados({ ...datosEditados, [key]: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={confirmarCarga}
                      className="flex-1 bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold py-3 rounded-xl font-mono hover:bg-[#00FF80]/20 transition-all">
                      ▶ Confirmar y Cargar
                    </button>
                    <button onClick={resetear} className="border border-[#1C2128] text-[#4B5563] px-5 py-3 rounded-xl font-mono hover:text-[#9CA3AF] transition-all">
                      Volver
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 4 — Cargando */}
              {paso === "cargando" && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-6 animate-spin">⚙️</div>
                  <p className="text-[#00FF80] font-mono font-bold text-lg mb-2">Cargando datos...</p>
                  <p className="text-[#4B5563] text-xs font-mono">Guardando en {resultado ? TIPO_CONFIG[resultado.tipo]?.modulo : "el sistema"}</p>
                </div>
              )}

              {/* PASO 5 — Listo */}
              {paso === "listo" && resultado && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">✅</div>
                  <p className="text-[#4ADE80] font-mono font-bold text-xl mb-2">¡Cargado exitosamente!</p>
                  <p className="text-[#9CA3AF] text-sm font-mono mb-2">{resultado.descripcion}</p>
                  <p className="text-xs font-mono mb-8" style={{ color: TIPO_CONFIG[resultado.tipo]?.color }}>
                    → Guardado en: {TIPO_CONFIG[resultado.tipo]?.modulo}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={resetear}
                      className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl font-mono hover:bg-[#00FF80]/20 transition-all">
                      📸 Escanear otro
                    </button>
                    <button onClick={() => { setAbierto(false); resetear(); }}
                      className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl font-mono hover:text-[#9CA3AF] transition-all">
                      Cerrar
                    </button>
                  </div>
                </div>
              )}

              {/* ERROR */}
              {paso === "error" && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">❌</div>
                  <p className="text-[#F87171] font-mono font-bold text-lg mb-2">No se pudo procesar</p>
                  <p className="text-[#4B5563] text-xs font-mono mb-6">{msgError}</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={resetear}
                      className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl font-mono hover:bg-[#00FF80]/20 transition-all">
                      Intentar de nuevo
                    </button>
                    <button onClick={() => { setAbierto(false); resetear(); }}
                      className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl font-mono">
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

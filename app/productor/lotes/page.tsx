"use client";
// @ts-nocheck
import { useEffect, useState, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import EscanerIA from "@/components/EscanerIA";

type Lote = {
  id: string; nombre: string; hectareas: number;
  tipo_tenencia: string; partido: string; provincia: string;
  cultivo: string; cultivo_orden: string; cultivo_completo: string;
  campana_id: string; fecha_siembra: string; fecha_cosecha: string;
  variedad: string; hibrido: string;
  rendimiento_esperado: number; rendimiento_real: number;
  estado: string; es_segundo_cultivo: boolean;
  lote_id_primer_cultivo: string | null; observaciones: string;
};
type Campana = { id: string; nombre: string; año_inicio: number; año_fin: number; activa: boolean; };
type Labor = {
  id: string; lote_id: string; fecha: string; tipo: string; descripcion: string;
  productos?: string; dosis?: string;
  hectareas_trabajadas?: number; tipo_aplicacion?: string;
  precio_aplicacion_ha?: number; costo_total_usd?: number;
  metodo_carga?: string; metodo_entrada?: string;
  estado_carga?: string; cargado_por_rol?: string;
  producto_dosis?: string; aplicador?: string;
  costo_aplicacion_ha?: number; costo_total?: number;
  superficie_ha?: number; comentario?: string; observaciones?: string;
  operario?: string; maquinaria?: string;
  costo_aplicador_ha?: number;
  costo_aplicador_total?: number;
};
type InsumoStock = {
  id: string; nombre: string; cantidad: number; unidad: string;
  precio_ppp: number; precio_unitario: number; categoria: string;
};
type DescuentoItem = {
  insumo_id: string; nombre: string; unidad: string;
  cantidad_sugerida: number; cantidad_ajustada: number;
  precio_ppp: number; costo_total: number; seleccionado: boolean;
};

const CULTIVOS_LISTA = [
  { cultivo:"soja",    orden:"1ra",         label:"Soja 1º",    color:"#22c55e", icon:"🌱", admite2do:false, usaHibrido:false },
  { cultivo:"soja",    orden:"2da",         label:"Soja 2º",    color:"#86efac", icon:"🌿", admite2do:false, usaHibrido:false },
  { cultivo:"maiz",    orden:"1ro_temprano",label:"Maíz 1º",    color:"#eab308", icon:"🌽", admite2do:false, usaHibrido:true  },
  { cultivo:"maiz",    orden:"1ro_tardio",  label:"Maíz 1º Tardío", color:"#d97706", icon:"🌽", admite2do:false, usaHibrido:true  },
  { cultivo:"maiz",    orden:"2do",         label:"Maíz 2º",    color:"#fde047", icon:"🌽", admite2do:false, usaHibrido:true  },
  { cultivo:"trigo",   orden:"1ro",         label:"Trigo",      color:"#f59e0b", icon:"🌾", admite2do:true,  usaHibrido:false },
  { cultivo:"girasol", orden:"1ro",         label:"Girasol",    color:"#f97316", icon:"🌻", admite2do:false, usaHibrido:true  },
  { cultivo:"sorgo",   orden:"1ro",         label:"Sorgo 1º",   color:"#ef4444", icon:"🌿", admite2do:false, usaHibrido:true  },
  { cultivo:"sorgo",   orden:"2do",         label:"Sorgo 2º",   color:"#fca5a5", icon:"🌿", admite2do:false, usaHibrido:true  },
  { cultivo:"cebada",  orden:"1ra",         label:"Cebada",     color:"#8b5cf6", icon:"🍃", admite2do:true,  usaHibrido:false },
  { cultivo:"arveja",  orden:"1ra",         label:"Arveja",     color:"#06b6d4", icon:"🫛", admite2do:true,  usaHibrido:false },
  { cultivo:"carinata",orden:"1ra",         label:"Carinata",   color:"#0ea5e9", icon:"🌱", admite2do:false, usaHibrido:false },
  { cultivo:"camelina",orden:"1ra",         label:"Camelina",   color:"#38bdf8", icon:"🌱", admite2do:false, usaHibrido:false },
  { cultivo:"pastura", orden:"libre",       label:"Pastura",    color:"#10b981", icon:"🌾", admite2do:false, usaHibrido:false, libre:true },
  { cultivo:"otros",   orden:"libre",       label:"Otros",      color:"#6b7280", icon:"🌱", admite2do:false, usaHibrido:false, libre:true },
];

const TIPOS_LABOR = ["Siembra","Aplicación","Fertilización","Cosecha","Labranza","Riego","Control malezas","Recorrida","Otro"];
const APLICADORES = ["Propio","Alquilado","Avión","Drone","—"];
const ESTADOS = [
  {v:"planificado",  l:"Planificado", c:"#6b7280"},
  {v:"sembrado",     l:"Sembrado",    c:"#22c55e"},
  {v:"en_desarrollo",l:"En Desarrollo",c:"#eab308"},
  {v:"cosechado",    l:"Cosechado",   c:"#60a5fa"},
  {v:"barbecho",     l:"Barbecho",    c:"#a78bfa"},
];

function naturalSort(a: string, b: string): number {
  const seg = (s: string) => {
    const p: Array<string|number> = []; let i = 0;
    while (i < s.length) {
      if (s[i] >= "0" && s[i] <= "9") {
        let n = ""; while (i < s.length && s[i] >= "0" && s[i] <= "9") { n += s[i]; i++; }
        p.push(parseInt(n, 10));
      } else {
        let t = ""; while (i < s.length && !(s[i] >= "0" && s[i] <= "9")) { t += s[i]; i++; }
        p.push(t.toLowerCase());
      }
    }
    return p;
  };
  const pa = seg(a); const pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0; const vb = pb[i] ?? 0;
    if (typeof va === "number" && typeof vb === "number") { if (va !== vb) return va - vb; }
    else { const sa = String(va); const sb = String(vb); if (sa < sb) return -1; if (sa > sb) return 1; }
  }
  return 0;
}

function getCultivoInfo(cultivo: string, orden: string) {
  if (!cultivo) return { label:"Sin cultivo", color:"#4b5563", icon:"🌾", admite2do:false, usaHibrido:false };
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { label:cultivo.charAt(0).toUpperCase()+cultivo.slice(1), color:"#6b7280", icon:"🌱", admite2do:false, usaHibrido:false };
}

function parseFecha(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s === "0") return null;
  const n = Number(s);
  if (!isNaN(n) && n > 1000) { const d = new Date((n-25569)*86400*1000); return d.toISOString().split("T")[0]; }
  const p = s.split(/[/\-]/);
  if (p.length === 3) { const y = p[2].length===2?"20"+p[2]:p[2]; return y+"-"+p[1].padStart(2,"0")+"-"+p[0].padStart(2,"0"); }
  return s || null;
}

const APLIC_ICON: Record<string,string> = { "Mosquito":"🚜","Drone":"🚁","Avión":"✈️","Tractor":"🚜","Manual":"👤","—":"—" };

function laborColor(tipo: string): string {
  if (tipo==="Siembra") return "#22c55e";
  if (tipo==="Cosecha") return "#60a5fa";
  if (tipo==="Fertilización") return "#a78bfa";
  if (tipo==="Aplicación"||tipo==="Control malezas") return "#f97316";
  if (tipo==="Labranza") return "#eab308";
  if (tipo==="Recorrida") return "#06b6d4";
  return "#6b7280";
}

export default function IngenieroLotesPage() {
  const [empresaId, setEmpresaId] = useState("");
  const [productorNombre, setProductorNombre] = useState("");
  const [modoCompartido, setModoCompartido] = useState(false);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState("");
  const [margenes, setMargenes] = useState<any[]>([]);
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lotes"|"margen">("lotes");
  const [filterCultivo, setFilterCultivo] = useState("todos");
  const [showFormLote, setShowFormLote] = useState(false);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [showFormMargen, setShowFormMargen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportCuaderno, setShowImportCuaderno] = useState(false);
  const [editandoLote, setEditandoLote] = useState<string|null>(null);
  const [editandoLabor, setEditandoLabor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [cuadernoPreview, setCuadernoPreview] = useState<any[]>([]);
  const [cuadernoMsg, setCuadernoMsg] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const importCuadernoRef = useRef<HTMLInputElement>(null);
  const importCuadernoMultiRef = useRef<HTMLInputElement>(null);
  const adjuntoRef = useRef<HTMLInputElement>(null);
  const [usdUsado, setUsdUsado] = useState(1);
  const [vozEstado, setVozEstado] = useState<"idle"|"escuchando"|"procesando"|"respondiendo"|"error">("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozTranscripcion, setVozTranscripcion] = useState("");
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);
  const [showDescuento, setShowDescuento] = useState(false);
  const [insumosStock, setInsumosStock] = useState<InsumoStock[]>([]);
  const [descuentoItems, setDescuentoItems] = useState<DescuentoItem[]>([]);
  const [laborPendiente, setLaborPendiente] = useState<any>(null);
  const [insumosNoEncontrados, setInsumosNoEncontrados] = useState<{nombre:string;cantidad:number;unidad:string;categoria:string}[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
    if (!u) return;
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id);
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
    const { data: cot } = await sb.from("finanzas_cotizaciones").select("usd_usado").eq("empresa_id", emp.id).order("fecha", { ascending: false }).limit(1);
    setCampanas(camps ?? []);
    if (cot?.[0]) setUsdUsado(cot[0].usd_usado || 1);
    const activa = (camps ?? []).find((c: any) => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    setCampanaActiva(activa);
    if (activa) await fetchLotes(emp.id, activa);
    setLoading(false);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const [ls, lbs, mgs] = await Promise.all([
      sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("lote_labores").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("margen_bruto_detalle").select("*").eq("empresa_id", eid),
    ]);
    const sorted = (ls.data ?? []).sort((a: any, b: any) => naturalSort(a.nombre ?? "", b.nombre ?? ""));
    const laboresNorm = (lbs.data ?? []).map((l: any) => ({
      ...l,
      producto_dosis:      l.productos || l.dosis || l.descripcion || "",
      aplicador:           l.tipo_aplicacion || "",
      costo_aplicacion_ha: l.precio_aplicacion_ha || 0,
      costo_total:         l.costo_total_usd || 0,
      superficie_ha:       l.hectareas_trabajadas || 0,
      comentario:          l.observaciones || "",
    }));
    setLotes(sorted); setLabores(laboresNorm); setMargenes(mgs.data ?? []);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const getCampanaId = async (sb: any): Promise<string> => {
    if (campanaActiva) return campanaActiva;
    const anio = new Date().getFullYear();
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id: empresaId, nombre: anio+"/"+(anio+1), año_inicio: anio, año_fin: anio+1, activa: true }).select().single();
    if (nueva) { setCampanaActiva(nueva.id); setCampanas(p => [nueva,...p]); return nueva.id; }
    return "";
  };

  const guardarLote = async () => {
    if (!empresaId || !form.nombre?.trim()) { msg("❌ Ingresá el nombre del lote"); return; }
    const sb = await getSB();
    const cid = await getCampanaId(sb);
    if (!cid) { msg("❌ Sin campaña"); return; }
    const ci = CULTIVOS_LISTA.find(c => c.cultivo+"|"+c.orden === form.cultivo_key) ?? CULTIVOS_LISTA[0];
    const payload: Record<string,any> = {
      empresa_id: empresaId, campana_id: cid,
      nombre: form.nombre.trim(), hectareas: Number(form.hectareas ?? 0),
      estado: form.estado ?? "planificado", es_segundo_cultivo: false,
    };
    if (form.cultivo_key) { payload.cultivo=ci.cultivo; payload.cultivo_orden=ci.orden; payload.cultivo_completo=ci.label; }
    if (form.tipo_tenencia) payload.tipo_tenencia=form.tipo_tenencia;
    if (form.partido?.trim()) payload.partido=form.partido.trim();
    if (form.fecha_siembra) payload.fecha_siembra=form.fecha_siembra;
    if (form.fecha_cosecha) payload.fecha_cosecha=form.fecha_cosecha;
    if (form.variedad?.trim()) { payload.variedad=form.variedad.trim(); payload.hibrido=form.variedad.trim(); }
    if (form.rendimiento_esperado) payload.rendimiento_esperado=Number(form.rendimiento_esperado);
    if (form.observaciones?.trim()) payload.observaciones=form.observaciones.trim();
    try {
      if (editandoLote) {
        await sb.from("lotes").update(payload).eq("id", editandoLote);
        const { data: updated } = await sb.from("lotes").select("*").eq("id", editandoLote).single();
        if (updated) setLoteActivo(updated);
        setEditandoLote(null);
      } else {
        await sb.from("lotes").insert(payload);
      }
      msg("✅ Lote guardado");
      await fetchLotes(empresaId, campanaActiva);
      setShowFormLote(false); setForm({});
    } catch(e: any) { msg("❌ "+e.message); }
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("¿Eliminar lote?")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
    setLoteActivo(null);
  };

  const mapAplicador = (v: string): string|null => {
    const s = (v||"").toLowerCase().trim();
    if (s.includes("avion")||s.includes("avión")) return "avion";
    if (s.includes("drone")||s.includes("dron"))  return "drone";
    if (s.includes("alquil"))                     return "alquilado";
    if (s.includes("propio")||s.includes("tractor")||s.includes("mosquito")||s.includes("manual")) return "propio";
    return null;
  };

  const parsearInsumosDeDescripcion = (desc: string, ha: number): DescuentoItem[] => {
    if (!desc || !insumosStock.length) return [];
    const CANT_RE = /([0-9]+[,.]?[0-9]*)\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)(?=[\s\/+\-,]|$)/gi;
    const segmentos = desc.split(/\s*\+\s*/);
    const segsParseados: Array<{palabras: string[]; cantHa: number}> = [];
    for (const seg of segmentos) {
      const s = seg.trim(); if (!s) continue;
      CANT_RE.lastIndex = 0;
      const m = CANT_RE.exec(s); if (!m) continue;
      const cantHa = parseFloat(m[1].replace(',', '.'));
      const nombreSeg = s.replace(/[0-9]+[,.]?[0-9]*\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)\s*(\/ha)?/gi, '').trim();
      const palabras = nombreSeg.toLowerCase().split(/[\s,]+/).filter((p: string) => p.length >= 2);
      segsParseados.push({ palabras, cantHa });
    }
    const items: DescuentoItem[] = [];
    const usados = new Set<number>();
    for (const ins of insumosStock) {
      const insNorm = ins.nombre.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const insPals = insNorm.split(/\s+/).filter((p: string) => p.length >= 3);
      if (!insPals.length) continue;
      let bestIdx = -1, bestScore = 0;
      for (let i = 0; i < segsParseados.length; i++) {
        if (usados.has(i)) continue;
        const seg = segsParseados[i];
        let score = 0;
        for (const ip of insPals) if (seg.palabras.some((sp: string) => sp.includes(ip) || ip.includes(sp))) score++;
        for (const sp of seg.palabras) if (sp.length >= 3 && insNorm.includes(sp)) score++;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      if (bestIdx < 0 || bestScore === 0) continue;
      usados.add(bestIdx);
      const cantTotal = Math.round(segsParseados[bestIdx].cantHa * ha * 100) / 100;
      const ppp = ins.precio_ppp || ins.precio_unitario || 0;
      items.push({ insumo_id: ins.id, nombre: ins.nombre, unidad: ins.unidad, cantidad_sugerida: cantTotal, cantidad_ajustada: cantTotal, precio_ppp: ppp, costo_total: Math.round(cantTotal * ppp), seleccionado: true });
    }
    return items;
  };

  const abrirPanelDescuento = async (laborPayload: any, ha: number, desc: string) => {
    const sb = await getSB();
    // Traer TODOS los insumos, incluso con cantidad <= 0
    const { data: ins } = await sb.from("stock_insumos").select("id,nombre,cantidad,unidad,precio_ppp,precio_unitario,categoria").eq("empresa_id", empresaId).order("categoria");
    const stockList = (ins ?? []) as InsumoStock[];
    setInsumosStock(stockList);
    const sugeridos = parsearInsumosDeDescripcion(desc, ha);
    if (sugeridos.length === 0) {
      setDescuentoItems(stockList.map(i => ({ insumo_id: i.id, nombre: i.nombre, unidad: i.unidad, cantidad_sugerida: 0, cantidad_ajustada: 0, precio_ppp: i.precio_ppp || i.precio_unitario || 0, costo_total: 0, seleccionado: false })));
    } else {
      setDescuentoItems(sugeridos);
    }
    // Detectar productos mencionados que NO están en stock
    const segDesc = desc.split(/\s*\+\s*/);
    const noEnc: {nombre:string;cantidad:number;unidad:string;categoria:string}[] = [];
    for (const seg of segDesc) {
      const s = seg.trim(); if (!s) continue;
      const mCant = /([0-9]+[,.]?[0-9]*)\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)(?=[\s\/+\-,]|$)/i.exec(s);
      if (!mCant) continue;
      const cantHa = parseFloat(mCant[1].replace(",","."));
      const nombreSeg = s.replace(/[0-9]+[,.]?[0-9]*\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)\s*(\/ha)?/gi,"").trim();
      if (!nombreSeg || nombreSeg.length < 3) continue;
      const yaEnStock = stockList.some(i => {
        const n = i.nombre.toLowerCase().replace(/[^a-z0-9]/g," ");
        return nombreSeg.toLowerCase().split(/[\s,]+/).filter((p:string)=>p.length>=3).some((p:string) => n.includes(p));
      });
      if (!yaEnStock) {
        const unidad = mCant[2].toLowerCase().startsWith("kg")||mCant[2].toLowerCase()==="g" ? "kg" : "litros";
        const cat = /urea|sulfato|map|dap|fertil|fosfat|nitro/i.test(nombreSeg) ? "fertilizante" : "agroquimico";
        noEnc.push({ nombre: nombreSeg.toUpperCase(), cantidad: Math.round(cantHa * ha * 100)/100, unidad, categoria: cat });
      }
    }
    setInsumosNoEncontrados(noEnc);
    setLaborPendiente(laborPayload);
    setShowDescuento(true);
  };

  const confirmarDescuento = async () => {
    if (!laborPendiente || !empresaId) return;
    const sb = await getSB();
    const itemsSeleccionados = descuentoItems.filter(d => d.seleccionado && d.cantidad_ajustada > 0);
    let costoAgroTotal = 0;
    let costoFertiTotal = 0;

    // Crear insumos negativos para productos no encontrados en stock
    for (const noEnc of insumosNoEncontrados) {
      const { data: nuevo } = await sb.from("stock_insumos").insert({
        empresa_id: empresaId, nombre: noEnc.nombre, categoria: noEnc.categoria,
        subcategoria: noEnc.categoria === "fertilizante" ? "Fertilizante" : "Herbicida",
        cantidad: -noEnc.cantidad, unidad: noEnc.unidad,
        precio_unitario: 0, precio_ppp: 0, costo_total_stock: 0,
        ubicacion: "", tipo_ubicacion: "deposito_propio"
      }).select().single();
      if (nuevo) {
        await sb.from("stock_insumos_movimientos").insert({
          empresa_id: empresaId, insumo_id: nuevo.id,
          fecha: laborPendiente.fecha || new Date().toISOString().split("T")[0],
          tipo: "uso", cantidad: noEnc.cantidad, precio_unitario: 0, precio_ppp: 0,
          lote_id: laborPendiente.lote_id,
          descripcion: `Uso en labor (stock negativo - ajustar precio): ${laborPendiente.descripcion || ""}`,
          metodo: "productor"
        });
      }
    }

    // Descontar insumos con IVA
    for (const item of itemsSeleccionados) {
      const ins = insumosStock.find(i => i.id === item.insumo_id);
      if (!ins) continue;
      const nuevaCant = ins.cantidad - item.cantidad_ajustada;
      const ppp = ins.precio_ppp || ins.precio_unitario || 0;
      const costoBase = item.cantidad_ajustada * ppp;
      const iva = ins.categoria === "fertilizante" ? 0.105 : 0.21;
      const costoConIva = costoBase * (1 + iva);
      if (ins.categoria === "fertilizante") costoFertiTotal += costoConIva;
      else costoAgroTotal += costoConIva;
      await sb.from("stock_insumos").update({ cantidad: nuevaCant, costo_total_stock: nuevaCant * ppp }).eq("id", item.insumo_id);
      await sb.from("stock_insumos_movimientos").insert({
        empresa_id: empresaId, insumo_id: item.insumo_id,
        fecha: laborPendiente.fecha || new Date().toISOString().split("T")[0],
        tipo: "uso", cantidad: item.cantidad_ajustada, precio_unitario: 0, precio_ppp: ppp,
        lote_id: laborPendiente.lote_id,
        descripcion: `Uso: ${item.cantidad_ajustada} ${item.unidad} @ PPP $${ppp.toFixed(2)} + IVA ${ins.categoria === "fertilizante" ? "10.5" : "21"}% = U$S ${costoConIva.toFixed(2)}`,
        metodo: "productor"
      });
    }

    const costoInsumosTotal = costoAgroTotal + costoFertiTotal;
    const costoAplicador = laborPendiente._costo_aplicador_total || 0;

    if (laborPendiente._labor_id) {
      await sb.from("lote_labores").update({
        costo_insumos_usd: costoInsumosTotal,
        costo_total_usd: (laborPendiente.costo_total_usd || 0) + costoInsumosTotal
      }).eq("id", laborPendiente._labor_id);
    }

    // Imputar al Margen Bruto
    if (loteActivo && (costoAgroTotal > 0 || costoFertiTotal > 0 || costoAplicador > 0)) {
      const existing = margenes.find(m => m.lote_id === loteActivo.id);
      if (existing) {
        const nuevoAgro = (existing.costo_agroquimicos || 0) + costoAgroTotal;
        const nuevoFerti = (existing.costo_fertilizante || 0) + costoFertiTotal;
        const labsLote = labores.filter(l => l.lote_id === loteActivo.id);
        const totalLabores = labsLote.reduce((a, l) => a + (l.costo_total || 0), 0) + costoAplicador;
        const cd = (existing.costo_semilla || 0) + nuevoFerti + nuevoAgro + totalLabores + (existing.costo_alquiler || 0) + (existing.costo_flete || 0) + (existing.costo_comercializacion || 0) + (existing.otros_costos || 0);
        const mb = (existing.ingreso_bruto || 0) - cd;
        await sb.from("margen_bruto_detalle").update({
          costo_agroquimicos: nuevoAgro, costo_fertilizante: nuevoFerti,
          costo_labores: totalLabores, costo_directo_total: cd,
          margen_bruto: mb, margen_bruto_ha: existing.hectareas > 0 ? mb / existing.hectareas : 0,
          margen_bruto_usd: mb / usdUsado
        }).eq("id", existing.id);
      }
    }

    const partes = [];
    if (itemsSeleccionados.length > 0) partes.push(`${itemsSeleccionados.length} insumos → U$S ${costoInsumosTotal.toFixed(2)} (c/IVA)`);
    if (insumosNoEncontrados.length > 0) partes.push(`${insumosNoEncontrados.length} en negativo`);
    if (costoAplicador > 0) partes.push(`Aplicador U$S ${costoAplicador.toFixed(0)}`);
    msg("✅ " + (partes.join(" · ") || "Sin cambios"));

    setShowDescuento(false); setLaborPendiente(null); setDescuentoItems([]); setInsumosNoEncontrados([]);
    await fetchLotes(empresaId, campanaActiva);
  };

  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = Number(form.superficie_ha ?? loteActivo.hectareas ?? 0);
    const costoAplicadorHa = Number(form.costo_aplicador_ha ?? 0);
    const costoAplicadorTotal = costoAplicadorHa * ha;
    const costoTotal = form.costo_total_lab ? Number(form.costo_total_lab) : form.costo_aplicacion_ha ? Number(form.costo_aplicacion_ha) * ha : 0;
    const desc = form.producto_dosis || form.descripcion_lab || "";
    const payload: Record<string,any> = {
      empresa_id: empresaId, lote_id: loteActivo.id, tipo: form.tipo_lab ?? "Aplicación", descripcion: desc, productos: form.producto_dosis || "", dosis: form.producto_dosis || "", fecha: form.fecha_lab ?? new Date().toISOString().split("T")[0], metodo_carga: "manual", metodo_entrada: "manual", hectareas_trabajadas: ha, tipo_aplicacion: mapAplicador(form.aplicador || "") || null, precio_aplicacion_ha: Number(form.costo_aplicacion_ha ?? 0), costo_total_usd: costoTotal + costoAplicadorTotal, estado_carga: "confirmado", cargado_por_rol: "productor",
    };
    let laborId: string | null = null;
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id", editandoLabor);
      laborId = editandoLabor; setEditandoLabor(null);
    } else {
      const { data: nueva } = await sb.from("lote_labores").insert(payload).select("id").single();
      laborId = nueva?.id ?? null;
    }
    if (costoTotal + costoAplicadorTotal > 0) await actualizarCostoLaboresEnMB(loteActivo.id, costoTotal + costoAplicadorTotal);
    msg("✅ Labor guardada");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
    const tipoLabor = form.tipo_lab ?? "Aplicación";
    if (["Aplicación","Fertilización","Siembra"].includes(tipoLabor) && laborId) {
      await abrirPanelDescuento({ ...payload, _labor_id: laborId, _costo_aplicador_total: costoAplicadorTotal }, ha, desc);
    }
  };

  const actualizarCostoLaboresEnMB = async (loteId: string, costoNuevo: number) => {
    const sb = await getSB();
    const existing = margenes.find(m => m.lote_id === loteId);
    if (!existing) return;
    const labsLote = labores.filter(l => l.lote_id === loteId);
    const totalLabores = labsLote.reduce((a,l) => a + (l.costo_total||0), 0) + costoNuevo;
    const cd = (existing.costo_semilla||0)+(existing.costo_fertilizante||0)+(existing.costo_agroquimicos||0)+totalLabores+(existing.costo_alquiler||0)+(existing.costo_flete||0)+(existing.costo_comercializacion||0)+(existing.otros_costos||0);
    const mb = (existing.ingreso_bruto||0) - cd;
    await sb.from("margen_bruto_detalle").update({ costo_labores: totalLabores, costo_directo_total: cd, margen_bruto: mb, margen_bruto_ha: existing.hectareas>0?mb/existing.hectareas:0, margen_bruto_usd: mb/usdUsado }).eq("id", existing.id);
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
  };

  const guardarMargen = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = loteActivo.hectareas || 0;
    const rend = Number(form.mg_rend_real || form.mg_rend_esp || 0);
    const precio = Number(form.mg_precio || 0);
    const ing2 = ha * rend * precio;
    const labsLote = labores.filter(l => l.lote_id === loteActivo.id);
    const costoLaboresCargadas = labsLote.reduce((a,l)=>a+(l.costo_total||0),0);
    const costoLaboresForm = Number(form.mg_labores||0);
    const costoLaboresFinal = Math.max(costoLaboresForm, costoLaboresCargadas);
    const costos = [form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,String(costoLaboresFinal),form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros];
    const cd = costos.reduce((a,v) => a+Number(v||0), 0);
    const mb = ing2 - cd;
    const existing = margenes.find(m => m.lote_id === loteActivo.id);
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo.id, cultivo: loteActivo.cultivo, cultivo_orden: loteActivo.cultivo_orden, hectareas: ha, rendimiento_esperado: Number(form.mg_rend_esp||0), rendimiento_real: Number(form.mg_rend_real||0), precio_tn: precio, ingreso_bruto: ing2, costo_semilla: Number(form.mg_semilla||0), costo_fertilizante: Number(form.mg_fertilizante||0), costo_agroquimicos: Number(form.mg_agroquimicos||0), costo_labores: costoLaboresFinal, costo_alquiler: Number(form.mg_alquiler||0), costo_flete: Number(form.mg_flete||0), costo_comercializacion: Number(form.mg_comercializacion||0), otros_costos: Number(form.mg_otros||0), costo_directo_total: cd, margen_bruto: mb, margen_bruto_ha: ha>0?mb/ha:0, margen_bruto_usd: mb/usdUsado, cotizacion_usd: usdUsado, estado: form.mg_rend_real ? "real" : "estimado",
    };
    if (existing) await sb.from("margen_bruto_detalle").update(payload).eq("id", existing.id);
    else await sb.from("margen_bruto_detalle").insert(payload);
    msg("✅ Margen guardado");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormMargen(false); setForm({});
  };

  const subirAdjunto = async (file: File, tipo: string) => {
    if (!empresaId || !loteActivo) return;
    try {
      const sb = await getSB();
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = empresaId+"/"+loteActivo.id+"/"+tipo+"_"+Date.now()+"."+ext;
      const { error } = await sb.storage.from("lotes-adjuntos").upload(path, file, { upsert:true });
      if (error) { msg("❌ "+error.message); return; }
      try { await sb.from("lote_adjuntos").insert({ empresa_id:empresaId, lote_id:loteActivo.id, tipo, nombre:file.name, path }); } catch {}
      msg("✅ Adjunto guardado");
    } catch(e: any) { msg("❌ "+e.message); }
  };

  const exportarLotes = async () => {
    const XLSX = await import("xlsx");
    const data = lotesPrincipales.map(l => {
      const mg = margenes.find(m => m.lote_id === l.id);
      return { LOTE:l.nombre, HECTAREAS:l.hectareas, CULTIVO:l.cultivo_completo||l.cultivo, VARIEDAD:l.variedad||l.hibrido||"", ESTADO:l.estado, FECHA_SIEMBRA:l.fecha_siembra||"", TENENCIA:l.tipo_tenencia||"", PARTIDO:l.partido||"", REND_ESP:l.rendimiento_esperado||0, MARGEN_BRUTO:mg?Math.round(mg.margen_bruto):"", MB_HA:mg?Math.round(mg.margen_bruto_ha):"" };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, "lotes_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const exportarCuaderno = async () => {
    if (!loteActivo) return;
    const XLSX = await import("xlsx");
    const data = laboresLote.map(l => ({
      LOTE: loteActivo.nombre, FECHA: l.fecha, TIPO: l.tipo,
      PRODUCTO_DOSIS: (l as any).producto_dosis||l.descripcion||"",
      APLICADOR: (l as any).aplicador||"",
      HA: (l as any).superficie_ha||l.hectareas_trabajadas||0,
      COSTO_HA: (l as any).costo_aplicacion_ha||"",
      COSTO_TOTAL: l.costo_total||0,
      COMENTARIO: (l as any).comentario||l.observaciones||""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Cuaderno");
    XLSX.writeFile(wb, "cuaderno_"+loteActivo.nombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const leerExcelLotes = async (file: File) => {
    setImportMsg("Leyendo...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const wsData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (wsData.length < 2) { setImportMsg("Sin datos"); return; }
      const headers = wsData[0].map((h: any) => String(h).toLowerCase().trim().replace(/ /g,"_"));
      const ci = headers.findIndex((h: string) => h.includes("lote")||h.includes("nombre")||h.includes("campo"));
      const ch = headers.findIndex((h: string) => h.includes("ha")||h.includes("hect"));
      const cc = headers.findIndex((h: string) => h.includes("cultivo")||h.includes("especie"));
      const cv = headers.findIndex((h: string) => h.includes("varie")||h.includes("hibri"));
      const cf = headers.findIndex((h: string) => h.includes("siem"));
      const cp = headers.findIndex((h: string) => h.includes("partido")||h.includes("localidad"));
      const colN = ci >= 0 ? ci : 0;
      const preview = wsData.slice(1).filter((r: any) => r[colN]&&String(r[colN]).trim()).map((r: any) => {
        const nombre = String(r[colN]).trim();
        const cultTexto = cc >= 0 ? String(r[cc]).toLowerCase().trim() : "";
        let cultivo = ""; let orden = "1ra";
        if (cultTexto) {
          if (cultTexto.includes("maiz")||cultTexto.includes("maíz")) { cultivo="maiz"; orden=cultTexto.includes("2")?"2do":cultTexto.includes("tard")?"1ro_tardio":"1ro_temprano"; }
          else if (cultTexto.includes("trigo")) { cultivo="trigo"; orden="1ro"; }
          else if (cultTexto.includes("girasol")) { cultivo="girasol"; orden="1ro"; }
          else if (cultTexto.includes("sorgo")) { cultivo="sorgo"; orden=cultTexto.includes("2")?"2do":"1ro"; }
          else if (cultTexto.includes("cebada")) { cultivo="cebada"; orden="1ra"; }
          else if (cultTexto.includes("arveja")) { cultivo="arveja"; orden="1ra"; }
          else if (cultTexto.includes("soja")||cultTexto.includes("soy")) { cultivo="soja"; orden=cultTexto.includes("2")?"2da":"1ra"; }
          else if (cultTexto.includes("carinata")) { cultivo="carinata"; orden="1ra"; }
          else if (cultTexto.includes("camelina")) { cultivo="camelina"; orden="1ra"; }
        }
        const existe = lotes.find(l => l.nombre.toLowerCase().trim()===nombre.toLowerCase());
        const info = cultivo ? getCultivoInfo(cultivo, orden) : null;
        return { nombre, hectareas: ch>=0?(Number(r[ch])||0):0, cultivo:cultivo||null, cultivo_orden:orden, cultivo_completo:info?.label||"", partido:cp>=0?String(r[cp]).trim():"", fecha_siembra:cf>=0?parseFecha(r[cf]):null, variedad:cv>=0?String(r[cv]).trim():"", accion:existe?"actualizar":"crear", id_existente:existe?.id??null };
      });
      setImportPreview(preview);
      setImportMsg("✅ "+preview.length+" lotes detectados");
    } catch(e: any) { setImportMsg("❌ "+e.message); }
  };

  const confirmarImportLotes = async () => {
    if (!empresaId||!importPreview.length) return;
    const sb = await getSB();
    const cid = await getCampanaId(sb);
    if (!cid) { msg("❌ Sin campaña"); return; }
    let creados=0; let actualizados=0; const errores: string[]=[];
    const procesados: string[] = [];
    for (const l of importPreview) {
      const key = l.nombre.toLowerCase().trim();
      if (procesados.includes(key)) continue; procesados.push(key);
      try {
        if (l.accion==="actualizar"&&l.id_existente) {
          const upd: Record<string,any>={hectareas:l.hectareas};
          if (l.cultivo) { upd.cultivo=l.cultivo; upd.cultivo_orden=l.cultivo_orden; upd.cultivo_completo=l.cultivo_completo; }
          if (l.partido) upd.partido=l.partido; if (l.fecha_siembra) upd.fecha_siembra=l.fecha_siembra; if (l.variedad) { upd.variedad=l.variedad; upd.hibrido=l.variedad; }
          const{error}=await sb.from("lotes").update(upd).eq("id",l.id_existente);
          if(error)errores.push(l.nombre+": "+error.message); else actualizados++;
        } else {
          const ins: Record<string,any>={empresa_id:empresaId,campana_id:cid,nombre:l.nombre,hectareas:l.hectareas||0,estado:"planificado",es_segundo_cultivo:false};
          if(l.cultivo){ins.cultivo=l.cultivo;ins.cultivo_orden=l.cultivo_orden;ins.cultivo_completo=l.cultivo_completo;}
          if(l.partido)ins.partido=l.partido; if(l.fecha_siembra)ins.fecha_siembra=l.fecha_siembra; if(l.variedad){ins.variedad=l.variedad;ins.hibrido=l.variedad;}
          const{error}=await sb.from("lotes").insert(ins);
          if(error)errores.push(l.nombre+": "+error.message); else creados++;
        }
      } catch(e: any){errores.push(l.nombre+": "+e.message);}
    }
    if (creados+actualizados>0) {
      msg("✅ "+creados+" creados · "+actualizados+" actualizados"+(errores.length?" · "+errores.length+" errores":""));
      await fetchLotes(empresaId, cid);
      setImportPreview([]); setImportMsg(""); setShowImport(false);
    } else { msg("❌ "+errores.slice(0,2).join(" | ")); }
  };

  const leerExcelCuaderno = async (file: File) => {
    setCuadernoMsg("Leyendo...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (rows.length < 2) { setCuadernoMsg("Sin datos"); return; }
      const norm = (s: any) => String(s ?? "").toLowerCase().trim().replace(/[áà]/g,"a").replace(/[éè]/g,"e").replace(/[íì]/g,"i").replace(/[óò]/g,"o").replace(/[úù]/g,"u").replace(/[ñ]/g,"n").replace(/º|°/g,"").replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");
      const hdrs = rows[0].map((h: any) => norm(h));
      const col = (nombres: string[]): number => { for (const n of nombres) { const i = hdrs.indexOf(n); if (i >= 0) return i; } return -1; };
      const cFecha=col(["fecha","date","dia","fec"]); const cLote=col(["lote","campo","parcela","lot","n_lote","nro","numero","num"]); const cHas=col(["has","hectareas","superficie","ha_lote","hect"]); const cCultivo=col(["cultivo","especie","crop","cult"]); const cDosis=col(["dosis","producto","producto_dosis","descripcion","desc","detalle"]); const cAplic=col(["aplicador","equipo","maquina","aplic","mosquito","drone"]); const cCostoHa=col(["costo_ha","precio_ha","valor_ha","costo_por_ha","cosha"]); const cCostoT=col(["costo_total","total","importe","monto","costo_tot"]); const cTipo=col(["tipo","tipo_labor","labor","accion","tarea"]); const cComent=col(["comentario","observacion","obs","nota","coment"]);
      if (cFecha===-1) { setCuadernoMsg("❌ No encontré columna FECHA. Headers: "+hdrs.join(", ")); return; }
      if (cLote===-1) { setCuadernoMsg("❌ No encontré columna LOTE. Headers: "+hdrs.join(", ")); return; }
      const buscarLote = (val: any) => {
        const v = String(val ?? "").trim(); if (!v || v === "0") return undefined;
        const vl = v.toLowerCase();
        let f = lotes.find(l => l.nombre.toLowerCase().trim() === vl); if (f) return f;
        if (/^\d+$/.test(v)) { f = lotes.find(l => { const n = l.nombre.trim(); return n === v || n.startsWith(v + "-") || n.startsWith(v + " -") || n.startsWith(v + " ") || new RegExp("^" + v + "\\b").test(n); }); if (f) return f; }
        if (vl.length >= 3) { f = lotes.find(l => l.nombre.toLowerCase().includes(vl)); if (f) return f; }
        return undefined;
      };
      const preview = rows.slice(1).filter((r: any) => String(r[cFecha] ?? "").trim() && String(r[cLote] ?? "").trim()).map((r: any) => {
        const loteVal=String(r[cLote]).trim(); const loteObj=buscarLote(loteVal); const fechaStr=parseFecha(r[cFecha]); const haExcel=cHas>=0&&r[cHas]!==""?Number(r[cHas])||0:0; const ha=haExcel>0?haExcel:(loteObj?.hectareas??0); const cultivo=cCultivo>=0?String(r[cCultivo]??"").trim():""; const dosis=cDosis>=0?String(r[cDosis]??"").trim():""; const tipoRaw=cTipo>=0?String(r[cTipo]??"").trim():""; const txt=(tipoRaw+dosis+cultivo).toLowerCase(); const tipo=tipoRaw||(txt.includes("siem")?"Siembra":txt.includes("cosech")?"Cosecha":txt.includes("fertil")?"Fertilización":txt.includes("labr")?"Labranza":txt.includes("recorr")?"Recorrida":"Aplicación"); const costoHaRaw=cCostoHa>=0?r[cCostoHa]:""; const costoHa=costoHaRaw!==""&&costoHaRaw!==null?Number(costoHaRaw)||0:0; const costoTRaw=cCostoT>=0?r[cCostoT]:""; const costoT=costoTRaw!==""&&costoTRaw!==null?Number(costoTRaw)||0:0; const costoFinal=costoT>0?costoT:(costoHa>0&&ha>0?costoHa*ha:0);
        return { lote_nombre:loteVal, lote_id:loteObj?.id??null, lote_match:loteObj?.nombre??null, hectareas:ha, fecha:fechaStr, tipo, cultivo_excel:cultivo, producto_dosis:dosis||cultivo, descripcion:dosis||cultivo, aplicador:cAplic>=0?String(r[cAplic]??"").trim():"", costo_aplicacion_ha:costoHa, costo_total:costoFinal, comentario:cComent>=0?String(r[cComent]??"").trim():"" };
      });
      setCuadernoPreview(preview);
      const con=preview.filter(p=>p.lote_id).length; const sin=preview.filter(p=>!p.lote_id).length;
      setCuadernoMsg(`✅ ${preview.length} labores · ${con} lotes encontrados${sin>0?` · ⚠ ${sin} sin match`:""}`);
    } catch(e: any) { setCuadernoMsg("❌ "+e.message); }
  };

  const confirmarImportCuaderno = async () => {
    if (!empresaId || !cuadernoPreview.length) return;
    const sb = await getSB();
    let ok = 0; let err = 0; let errMsg = "";
    for (const l of cuadernoPreview) {
      if (!l.lote_id) { err++; continue; }
      const payload: Record<string,any> = { empresa_id:empresaId, lote_id:l.lote_id, tipo:l.tipo||"Aplicación", descripcion:l.producto_dosis||l.descripcion||"", productos:l.producto_dosis||"", dosis:l.producto_dosis||"", fecha:l.fecha||new Date().toISOString().split("T")[0], metodo_carga:"excel", metodo_entrada:"excel", hectareas_trabajadas:l.hectareas||0, tipo_aplicacion:mapAplicador(l.aplicador||"")||null, precio_aplicacion_ha:l.costo_aplicacion_ha||0, costo_total_usd:l.costo_total||0, estado_carga:"confirmado", cargado_por_rol:"productor" };
      const { error } = await sb.from("lote_labores").insert(payload);
      if (error) { errMsg = error.message; err++; continue; }
      ok++;
    }
    if (ok > 0) msg(`✅ ${ok} labores importadas${err > 0 ? ` · ${err} errores` : ""}`);
    else msg(`❌ Error: ${errMsg || "sin lotes encontrados"}`);
    await fetchLotes(empresaId, campanaActiva);
    setCuadernoPreview([]); setCuadernoMsg(""); setShowImportCuaderno(false);
  };

  const hablar = useCallback((texto: string) => {
    if (typeof window==="undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto); utt.lang="es-AR"; utt.rate=1.05;
    const v = window.speechSynthesis.getVoices().find(x => x.lang.startsWith("es")); if (v) utt.voice=v;
    utt.onstart=()=>setVozEstado("respondiendo"); utt.onend=()=>setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const resumen = lotes.slice(0,10).map(l => l.nombre+":"+l.hectareas+"ha "+(l.cultivo_completo||l.cultivo)+"("+l.estado+")").join(";");
    const hoy = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/api/scanner", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500, messages:[{ role:"user", content:`Asistente cuaderno de campo agropecuario Argentina. Lotes: ${resumen}. Fecha hoy: ${hoy}. Voz del productor: "${texto}". Respondé SOLO JSON sin markdown: {"texto":"respuesta breve","accion":"consulta|nueva_labor|crear_lote","datos":{}} Para nueva_labor incluir: lote_nombre, fecha (YYYY-MM-DD), tipo, producto_dosis, aplicador, costo_total, comentario. Para crear_lote incluir: nombre, hectareas, cultivo.` }] }) });
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??""); hablar(parsed.texto??"");
      if (parsed.accion==="nueva_labor" && parsed.datos) {
        const d = parsed.datos;
        const loteTarget = lotes.find(l => l.nombre.toLowerCase().includes((d.lote_nombre??"").toLowerCase()) || (d.lote_nombre??"").toLowerCase().includes(l.nombre.toLowerCase()));
        if (loteTarget) {
          setLoteActivo(loteTarget);
          setForm({ tipo_lab:d.tipo||"Aplicación", fecha_lab:d.fecha||hoy, descripcion_lab:d.producto_dosis||"", producto_dosis:d.producto_dosis||"", aplicador:d.aplicador||"", costo_total_lab:String(d.costo_total||""), comentario:d.comentario||"", operario:"", superficie_ha:String(loteTarget.hectareas) });
          setShowFormLabor(true);
        }
      }
      if (parsed.accion==="crear_lote" && parsed.datos) {
        const ci2 = CULTIVOS_LISTA.find(c=>(parsed.datos.cultivo??"").toLowerCase().includes(c.cultivo));
        setForm({ nombre:parsed.datos.nombre??"", hectareas:String(parsed.datos.hectareas??""), cultivo_key:ci2?ci2.cultivo+"|"+ci2.orden:"soja|1ra" });
        setShowFormLote(true);
      }
      setVozEstado("respondiendo");
    } catch { const e="No pude interpretar el audio."; setVozRespuesta(e); hablar(e); setVozEstado("error"); setTimeout(()=>setVozEstado("idle"),2000); }
  }, [lotes, hablar]);

  const escucharVoz = () => {
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    if (!hasSR) { alert("Usá Chrome para reconocimiento de voz"); return; }
    const SR = (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang="es-AR"; rec.continuous=false;
    recRef.current=rec; setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult=(e: any)=>{const t=e.results[0][0].transcript;setVozTranscripcion(t);interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  const VOZ_COLOR: Record<string,string>={idle:"#22c55e",escuchando:"#ef4444",procesando:"#eab308",respondiendo:"#60a5fa",error:"#ef4444"};
  const VOZ_ICON: Record<string,string>={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};

  // ── Estilos nuevos ──
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const lotesPrincipales = (() => {
    const vistos: string[]=[];
    return lotes.filter(l=>!l.es_segundo_cultivo).filter(l=>{
      const k=l.nombre.toLowerCase().trim();
      if(vistos.includes(k))return false;vistos.push(k);return true;
    });
  })();
  const totalHa = lotesPrincipales.reduce((a,l)=>a+(l.hectareas||0),0);
  const laboresLote = loteActivo?labores.filter(l=>l.lote_id===loteActivo.id):[];
  const margenLote = loteActivo?margenes.find(m=>m.lote_id===loteActivo.id):null;
  const cultivoActivoInfo = loteActivo?getCultivoInfo(loteActivo.cultivo||"",loteActivo.cultivo_orden||""):null;
  const usaHibrido = (cultivoActivoInfo as any)?.usaHibrido??false;
  const admite2do = (cultivoActivoInfo as any)?.admite2do??false;
  const segundosCultivos = loteActivo?lotes.filter(l=>l.lote_id_primer_cultivo===loteActivo.id):[];
  const datosGrafico = (() => {
    const mapa: Record<string,{ha:number;color:string}>={};
    const vistos: string[]=[];
    lotesPrincipales.filter(l=>l.cultivo&&l.cultivo!=="null").forEach(l=>{
      const k=l.nombre.toLowerCase().trim(); if(vistos.includes(k))return; vistos.push(k);
      const info=getCultivoInfo(l.cultivo,l.cultivo_orden);
      const key=info.label||l.cultivo;
      if(!mapa[key])mapa[key]={ha:0,color:info.color};
      mapa[key].ha+=l.hectareas||0;
    });
    return Object.entries(mapa).filter(([,v])=>v.ha>0).map(([name,v])=>({name,value:Math.round(v.ha*10)/10,color:v.color})).sort((a,b)=>b.value-a.value);
  })();

  const campanasSinDup=campanas.filter((c,i,arr)=>arr.findIndex(x=>x.año_inicio===c.año_inicio)===i);

  const renderPieLabel=({cx,cy,midAngle,innerRadius,outerRadius,percent}:any)=>{
    if(percent<0.05)return null;
    const R=Math.PI/180;const r=innerRadius+(outerRadius-innerRadius)*0.55;
    const x=cx+r*Math.cos(-midAngle*R);const y=cy+r*Math.sin(-midAngle*R);
    return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">{Math.round(percent*100)+"%"}</text>;
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"url('/FON.png') center/cover fixed",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando lotes...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes shine{0%{left:-50%}100%{left:120%}}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}

        .sel-new{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;font-family:'DM Sans',system-ui;}
        .sel-new option{background:white;color:#1a2a4a;}

        .card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.15),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);border-radius:18px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.48) 0%,transparent 100%);border-radius:18px 18px 0 0;pointer-events:none;z-index:1;}
        .card>*{position:relative;z-index:2;}

        .lote-card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:18px;box-shadow:0 5px 18px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s ease;position:relative;overflow:hidden;}
        .lote-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);border-radius:18px;pointer-events:none;z-index:0;}
        .lote-card>*{position:relative;z-index:2;}
        .lote-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(20,80,160,0.20);}

        .topbar-l{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-l::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-l>*{position:relative;z-index:1;}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 14px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}

        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;display:inline-flex;align-items:center;gap:5px;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        .tag-c{display:inline-flex;align-items:center;border-radius:8px;font-size:11px;font-weight:700;padding:2px 8px;}

        .kpi-s{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:13px;box-shadow:0 3px 10px rgba(20,80,160,0.10);padding:10px 12px;text-align:center;position:relative;overflow:hidden;}
        .kpi-s::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);border-radius:13px;pointer-events:none;}
        .kpi-s>*{position:relative;}

        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}

        .row-l:hover{background:rgba(255,255,255,0.80)!important;}
      `}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar-l" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
            ← {loteActivo?"Volver a lotes":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Mis Lotes</div>
            <div style={{fontSize:11,color:"#d97706",fontWeight:600}}>📋 Cuaderno de campo</div>
          </div>
          <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);await fetchLotes(empresaId,e.target.value);}}
            className="sel-new" style={{fontSize:12,fontWeight:700,color:"#1565c0",padding:"6px 10px"}}>
            {campanasSinDup.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
          </select>
          <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",background:VOZ_COLOR[vozEstado]+"18",border:`1.5px solid ${VOZ_COLOR[vozEstado]}50`,color:VOZ_COLOR[vozEstado]}}>
            {VOZ_ICON[vozEstado]}
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"14px 14px 100px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msgExito&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msgExito.startsWith("✅")?"#16a34a":"#dc2626",background:msgExito.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msgExito}<button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* ══ PANEL DESCUENTO INSUMOS ══ */}
        {showDescuento&&(
          <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:16,background:"rgba(10,20,40,0.70)"}}>
            <div className="card" style={{width:"100%",maxWidth:640,padding:0,overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(0,60,140,0.10)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#16a34a"}}>🧪 Descontar Insumos del Stock</div>
                  <div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>Labor: {laborPendiente?.tipo} — {laborPendiente?.descripcion?.substring(0,40)}</div>
                </div>
                <button onClick={()=>{setShowDescuento(false);setLaborPendiente(null);setDescuentoItems([]);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:20}}>✕</button>
              </div>
              <div style={{padding:14,maxHeight:280,overflowY:"auto"}}>
                {descuentoItems.length===0
                  ?<p style={{textAlign:"center",color:"#6b8aaa",fontSize:13,padding:"24px 0"}}>Sin insumos en stock</p>
                  :<table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["✓","Insumo","Cantidad","Unidad","PPP","Costo"].map(h=><th key={h} style={{textAlign:h==="Cantidad"||h==="PPP"||h==="Costo"?"right":"left",padding:"6px 10px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{descuentoItems.map((item,i)=>(
                      <tr key={item.insumo_id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",opacity:item.seleccionado?1:0.5}}>
                        <td style={{padding:"7px 10px"}}>
                          <button onClick={()=>{const u=[...descuentoItems];u[i]={...u[i],seleccionado:!u[i].seleccionado};setDescuentoItems(u);}}
                            style={{width:18,height:18,borderRadius:5,border:item.seleccionado?"none":"1px solid #aab8c8",background:item.seleccionado?"#22c55e":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"white",cursor:"pointer",fontWeight:800}}>
                            {item.seleccionado?"✓":""}
                          </button>
                        </td>
                        <td style={{padding:"7px 10px",fontWeight:700,color:"#0d2137"}}>{item.nombre}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>
                          <input type="number" value={item.cantidad_ajustada||""} onChange={e=>{const c=parseFloat(e.target.value)||0;const u=[...descuentoItems];u[i]={...u[i],cantidad_ajustada:c,costo_total:c*u[i].precio_ppp,seleccionado:c>0};setDescuentoItems(u);}}
                            style={{width:70,background:"rgba(255,255,255,0.80)",border:"1px solid rgba(25,118,210,0.25)",borderRadius:7,padding:"4px 8px",fontSize:12,color:"#0d2137",textAlign:"right",outline:"none"}}/>
                        </td>
                        <td style={{padding:"7px 10px",color:"#6b8aaa"}}>{item.unidad}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:"#d97706"}}>{item.precio_ppp>0?`$${item.precio_ppp.toFixed(2)}`:"—"}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:item.costo_total>0?"#16a34a":"#aab8c8"}}>{item.costo_total>0?`$${Math.round(item.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                }
              </div>
              <div style={{padding:"12px 16px",borderTop:"1px solid rgba(0,60,140,0.08)"}}>
                {insumosNoEncontrados.length>0&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(220,38,38,0.07)",border:"1px solid rgba(220,38,38,0.18)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#dc2626",marginBottom:4}}>⚠️ No encontrados — se crean en negativo (ajustar precio después):</div>
                    {insumosNoEncontrados.map((n,i)=>(
                      <div key={i} style={{fontSize:11,color:"#dc2626",fontWeight:600}}>• {n.nombre}: -{n.cantidad} {n.unidad}</div>
                    ))}
                  </div>
                )}
                {descuentoItems.filter(d=>d.seleccionado&&d.cantidad_ajustada>0).length>0&&(()=>{
                  const agro=descuentoItems.filter(d=>d.seleccionado&&d.cantidad_ajustada>0).reduce((a,d)=>{const ins=insumosStock.find(i=>i.id===d.insumo_id);return ins?.categoria==="fertilizante"?a:a+d.costo_total;},0);
                  const ferti=descuentoItems.filter(d=>d.seleccionado&&d.cantidad_ajustada>0).reduce((a,d)=>{const ins=insumosStock.find(i=>i.id===d.insumo_id);return ins?.categoria==="fertilizante"?a+d.costo_total:a;},0);
                  const agroIva=agro*1.21; const fertiIva=ferti*1.105;
                  const costoAplic=laborPendiente?._costo_aplicador_total||0;
                  return(
                    <div style={{marginBottom:10,padding:"10px 12px",borderRadius:10,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.20)"}}>
                      {agro>0&&<div style={{fontSize:11,color:"#1565c0",marginBottom:3}}>🧪 Agroquímicos sin IVA: U$S {agro.toFixed(2)} → <strong>+21% = U$S {agroIva.toFixed(2)}</strong></div>}
                      {ferti>0&&<div style={{fontSize:11,color:"#7c3aed",marginBottom:3}}>💊 Fertilizantes sin IVA: U$S {ferti.toFixed(2)} → <strong>+10.5% = U$S {fertiIva.toFixed(2)}</strong></div>}
                      {costoAplic>0&&<div style={{fontSize:11,color:"#d97706",marginBottom:3}}>🚜 Aplicador: <strong>U$S {costoAplic.toFixed(2)}</strong></div>}
                      <div style={{borderTop:"1px solid rgba(22,163,74,0.20)",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>Total a imputar al MB</span>
                        <span style={{fontSize:15,fontWeight:800,color:"#16a34a"}}>U$S {(agroIva+fertiIva+costoAplic).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={confirmarDescuento} className="bbtn" style={{flex:1,padding:"10px"}}>✓ Confirmar y descontar</button>
                  <button onClick={()=>{setShowDescuento(false);setLaborPendiente(null);setDescuentoItems([]);setInsumosNoEncontrados([]);}} className="abtn" style={{padding:"10px 16px"}}>Omitir</button>
                </div>
                <p style={{fontSize:11,color:"#aab8c8",textAlign:"center",marginTop:6}}>Agroquímicos +21% · Fertilizantes +10.5% · Se imputa al Margen Bruto</p>
              </div>
            </div>
          </div>
        )}

        {/* ══ DETALLE LOTE ══ */}
        {loteActivo&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Header lote */}
            <div className="card" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:5,alignSelf:"stretch",borderRadius:4,background:cultivoActivoInfo?.color,flexShrink:0}}/>
                  <span style={{fontSize:24}}>{(cultivoActivoInfo as any)?.icon}</span>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{loteActivo.nombre}</h2>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      <span style={{fontWeight:800,fontSize:13,color:"#d97706"}}>{loteActivo.hectareas} ha</span>
                      <span className="tag-c" style={{background:(cultivoActivoInfo?.color??"#6b7280")+"20",color:cultivoActivoInfo?.color??"#6b7280"}}>{cultivoActivoInfo?.label||"Sin cultivo"}</span>
                      {(()=>{const e=ESTADOS.find(x=>x.v===loteActivo.estado);return e?<span className="tag-c" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null;})()}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>{const ci3=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);setEditandoLote(loteActivo.id);setForm({nombre:loteActivo.nombre,hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",cultivo_key:ci3?ci3.cultivo+"|"+ci3.orden:"soja|1ra",fecha_siembra:loteActivo.fecha_siembra||"",fecha_cosecha:loteActivo.fecha_cosecha||"",variedad:loteActivo.variedad||loteActivo.hibrido||"",rendimiento_esperado:String(loteActivo.rendimiento_esperado||""),estado:loteActivo.estado||"planificado",observaciones:loteActivo.observaciones||""});setShowFormLote(true);}} className="abtn">✏️ Editar</button>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:"",superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="bbtn">+ Labor</button>
                  <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);const labsTotal=labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(Math.max(mg.costo_labores,labsTotal)),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});else setForm({mg_labores:String(labsTotal)});setShowFormMargen(true);}} className="abtn">📊 Margen</button>
                  {(loteActivo.estado==="cosechado"||!!loteActivo.fecha_cosecha||loteActivo.rendimiento_real>0)&&admite2do&&segundosCultivos.length===0&&(
                    <button onClick={()=>{setForm({es_segundo_cultivo:"true",lote_base_id:loteActivo.id,nombre:loteActivo.nombre+" 2DO",hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",estado:"planificado",cultivo_key:"soja|2da"});setEditandoLote(null);setShowFormLote(true);}} className="abtn">🔄 2º Cultivo</button>
                  )}
                  <button onClick={()=>eliminarLote(loteActivo.id)} style={{padding:"8px 10px",borderRadius:10,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.20)",color:"#dc2626",cursor:"pointer",fontSize:13}}>🗑</button>
                </div>
              </div>
            </div>

            {/* Stats del lote */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
              {[
                {l:"Tenencia",v:loteActivo.tipo_tenencia||"—",c:"#d97706"},
                {l:"Partido",v:loteActivo.partido||"—",c:"#6b8aaa"},
                {l:usaHibrido?"Híbrido":"Variedad",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#22c55e"},
                {l:"F. Siembra",v:loteActivo.fecha_siembra||"—",c:"#60a5fa"},
                {l:"F. Cosecha",v:loteActivo.fecha_cosecha||"—",c:"#a78bfa"},
                {l:"Rend. Esp.",v:loteActivo.rendimiento_esperado?(loteActivo.rendimiento_esperado+" tn/ha"):"—",c:"#d97706"},
                {l:"Margen Bruto",v:margenLote?"$"+Math.round(margenLote.margen_bruto).toLocaleString("es-AR"):"—",c:margenLote&&margenLote.margen_bruto>=0?"#22c55e":"#ef4444"},
                {l:"MB/ha",v:margenLote?"$"+Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")+"/ha":"—",c:"#d97706"},
              ].map(s=>(
                <div key={s.l} className="kpi-s">
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>{s.l}</div>
                  <div style={{fontSize:12,fontWeight:800,marginTop:3,color:s.c,textTransform:"uppercase"}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Form editar lote */}
            {showFormLote&&editandoLote&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>✏️ Editar Lote</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Hectáreas</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className="sel-new" style={{width:"100%"}}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className="sel-new" style={{width:"100%"}}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{usaHibrido?"Híbrido":"Variedad"}</label><input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="DM4612, NK..."/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel-new" style={{width:"100%"}}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>F. Cosecha</label><input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Rend. Esp. tn/ha</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                {/* Estado rápido */}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Estado rápido:</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ESTADOS.map(e=><button key={e.v} onClick={()=>setForm({...form,estado:e.v})} style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",borderColor:form.estado===e.v?e.c:e.c+"40",background:form.estado===e.v?e.c+"20":"transparent",color:e.c,border:"1px solid"}}>{e.l}</button>)}</div>
                </div>
                {/* Adjuntos */}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Adjuntos:</div>
                  <input ref={adjuntoRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(f)await subirAdjunto(f,form.adjunto_tipo||"suelo");}}/>
                  <div style={{display:"flex",gap:6}}>{[["suelo","🌍 Suelo"],["agua","💧 Agua"],["otro","📎 Otro"]].map(([tipo,label])=><button key={tipo} onClick={()=>{setForm({...form,adjunto_tipo:tipo});adjuntoRef.current?.click();}} className="abtn" style={{fontSize:11}}>{label}</button>)}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLote} className="bbtn" style={{padding:"10px 18px"}}>Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="abtn" style={{padding:"10px 16px"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Form margen */}
            {showFormMargen&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1565c0",marginBottom:4}}>📊 Margen Bruto — {loteActivo.nombre}</div>
                <div style={{fontSize:11,color:"#6b8aaa",marginBottom:12}}>{cultivoActivoInfo?.label} · {loteActivo.hectareas} ha · USD ${usdUsado} · Labores cargadas: ${labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                  {[["mg_rend_esp","Rend. Esperado tn/ha"],["mg_rend_real","Rend. Real tn/ha"],["mg_precio","Precio $/tn"],["mg_semilla","Semillas"],["mg_fertilizante","Fertilizantes"],["mg_agroquimicos","Agroquímicos"],["mg_labores","Labores (auto)"],["mg_alquiler","Alquiler"],["mg_flete","Flete"],["mg_comercializacion","Comercialización"],["mg_otros","Otros"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="0"/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMargen} className="bbtn" style={{padding:"10px 18px"}}>Guardar</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="abtn" style={{padding:"10px 16px"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Form labor */}
            {showFormLabor&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:12}}>{editandoLabor?"✏️ Editar Labor":"+ Nueva Labor"} — {loteActivo.nombre}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_lab??"Aplicación"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className="sel-new" style={{width:"100%"}}>{TIPOS_LABOR.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Superficie ha</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Operario</label><input type="text" value={form.operario??""} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Producto / Dosis</label><input type="text" value={form.producto_dosis??""} onChange={e=>setForm({...form,producto_dosis:e.target.value,descripcion_lab:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: Glifosato 4L/ha + Flumioxazine 60g/ha"/></div>
                  <div><label className={lCls}>Aplicador</label><select value={form.aplicador??""} onChange={e=>setForm({...form,aplicador:e.target.value})} className="sel-new" style={{width:"100%"}}>{APLICADORES.map(a=><option key={a}>{APLIC_ICON[a]||""} {a}</option>)}</select></div>
                  <div><label className={lCls}>💲 Aplicador U$S/ha</label><input type="number" step="0.5" value={form.costo_aplicador_ha??""} onChange={e=>setForm({...form,costo_aplicador_ha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: 8"/></div>
                  <div><label className={lCls}>Costo aplicación $/ha</label><input type="number" value={form.costo_aplicacion_ha??""} onChange={e=>{const ha=Number(form.superficie_ha||loteActivo.hectareas||0);setForm({...form,costo_aplicacion_ha:e.target.value,costo_total_lab:String(Number(e.target.value)*ha)});}} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Costo total $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Comentario</label><input type="text" value={form.comentario??""} onChange={e=>setForm({...form,comentario:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Observaciones del campo..."/></div>
                </div>
                {/* Costo preview */}
                {Number(form.costo_total_lab||0)>0&&(
                  <div style={{marginBottom:12,padding:"8px 12px",borderRadius:10,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.20)",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                    <span>💰</span>
                    <span style={{color:"#4a6a8a"}}>Costo total: <strong style={{color:"#d97706"}}>${Number(form.costo_total_lab||0).toLocaleString("es-AR")}</strong></span>
                    {margenLote&&<span style={{fontSize:11,color:"#aab8c8"}}>· Se sumará al margen bruto</span>}
                  </div>
                )}
                {/* Tipo rápido */}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Tipo rápido:</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {TIPOS_LABOR.map(t=><button key={t} onClick={()=>setForm({...form,tipo_lab:t})} style={{padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",borderColor:form.tipo_lab===t?laborColor(t):laborColor(t)+"40",background:form.tipo_lab===t?laborColor(t)+"20":"transparent",color:form.tipo_lab===t?laborColor(t):laborColor(t)+"80"}}>{t}</button>)}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLabor} className="bbtn" style={{padding:"10px 18px"}}>Guardar Labor</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="abtn" style={{padding:"10px 16px"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Cuaderno de campo */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📋 Cuaderno de Campo</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>{laboresLote.length} registros</span>
                  {laboresLote.length>0&&<span style={{fontSize:11,color:"#d97706",fontWeight:700}}>Total: ${laboresLote.reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={exportarCuaderno} className="abtn" style={{fontSize:11}}>📤 Exportar</button>
                  <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");}} className="abtn" style={{fontSize:11}}>📥 Importar</button>
                </div>
              </div>

              {showImportCuaderno&&(
                <div style={{padding:12,borderBottom:"1px solid rgba(0,60,140,0.08)",background:"rgba(255,255,255,0.40)"}}>
                  <div style={{fontSize:11,color:"#6b8aaa",marginBottom:8}}>Columnas: <span style={{color:"#d97706",fontWeight:700}}>LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</span></div>
                  <input ref={importCuadernoRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelCuaderno(f);}}/>
                  {cuadernoPreview.length===0
                    ?<button onClick={()=>importCuadernoRef.current?.click()} className="abtn" style={{width:"100%",justifyContent:"center",padding:"10px",border:"2px dashed rgba(25,118,210,0.25)"}}>📁 Seleccionar Excel multi-lote</button>
                    :<div>
                      <div style={{maxHeight:150,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.08)"}}>
                        <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                          <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Lote","Sistema","Fecha","Ha","Tipo","Dosis","$/ha","Total"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                          <tbody>{cuadernoPreview.map((r,i)=>(
                            <tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                              <td style={{padding:"5px 10px",fontWeight:700,color:"#d97706"}}>{r.lote_nombre}</td>
                              <td style={{padding:"5px 10px"}}>{r.lote_match?<span style={{color:"#16a34a",fontWeight:700}}>✓ {r.lote_match}</span>:<span style={{color:"#dc2626"}}>✗</span>}</td>
                              <td style={{padding:"5px 10px",color:"#6b8aaa"}}>{r.fecha||"—"}</td>
                              <td style={{padding:"5px 10px",fontWeight:700,color:"#0d2137"}}>{r.hectareas>0?r.hectareas:"—"}</td>
                              <td style={{padding:"5px 10px"}}><span style={{fontSize:10,padding:"1px 6px",borderRadius:5,fontWeight:700,background:laborColor(r.tipo)+"20",color:laborColor(r.tipo)}}>{r.tipo}</span></td>
                              <td style={{padding:"5px 10px",color:"#4a6a8a",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.producto_dosis||"—"}</td>
                              <td style={{padding:"5px 10px",color:"#d97706"}}>{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                              <td style={{padding:"5px 10px",fontWeight:700,color:"#d97706"}}>{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={confirmarImportCuaderno} className="bbtn">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                        <button onClick={()=>setCuadernoPreview([])} className="abtn" style={{padding:"8px 14px",fontSize:12}}>Cancelar</button>
                      </div>
                    </div>
                  }
                  {cuadernoMsg&&<p style={{marginTop:8,fontSize:11,fontWeight:600,color:cuadernoMsg.startsWith("✅")?"#16a34a":cuadernoMsg.startsWith("❌")?"#dc2626":"#d97706"}}>{cuadernoMsg}</p>}
                </div>
              )}

              {laboresLote.length===0
                ?<div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:36,opacity:0.12,marginBottom:10}}>📋</div>
                  <p style={{color:"#6b8aaa",fontSize:13,marginBottom:10}}>Sin labores registradas</p>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:"",superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="bbtn">+ Agregar primera labor</button>
                </div>
                :<div>
                  {laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>{
                    const color=laborColor(l.tipo);
                    const aplic=(l as any).aplicador;
                    const prod=(l as any).producto_dosis;
                    const coment=(l as any).comentario;
                    const costoHa=(l as any).costo_aplicacion_ha;
                    return(
                      <div key={l.id} className="row-l" style={{borderBottom:"1px solid rgba(0,60,140,0.06)",padding:"12px 14px",transition:"background 0.15s"}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                          <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:color,flexShrink:0,marginTop:2}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                              <span className="tag-c" style={{background:color+"20",color}}>{l.tipo}</span>
                              <span style={{fontSize:11,color:"#6b8aaa"}}>{l.fecha}</span>
                              {aplic&&aplic!=="—"&&<span style={{fontSize:11,color:"#4a6a8a"}}>{APLIC_ICON[aplic]||""} {aplic}</span>}
                              {(l as any).superficie_ha>0&&<span style={{fontSize:11,color:"#6b8aaa"}}>{(l as any).superficie_ha} ha</span>}
                            </div>
                            {(prod||l.descripcion)&&<div style={{fontSize:13,fontWeight:600,color:"#0d2137",marginBottom:coment?4:0}}>{prod||l.descripcion}</div>}
                            {coment&&<div style={{fontSize:11,color:"#d97706",display:"flex",gap:5}}><span>💬</span><span>{coment}</span></div>}
                            {(l as any).operario&&<div style={{fontSize:11,color:"#aab8c8",marginTop:2}}>👤 {(l as any).operario}</div>}
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {l.costo_total>0&&<div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>${Number(l.costo_total).toLocaleString("es-AR")}</div>}
                            {costoHa>0&&<div style={{fontSize:11,color:"#eab308"}}>${costoHa}/ha</div>}
                            <div style={{display:"flex",gap:6,marginTop:5,justifyContent:"flex-end"}}>
                              <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,producto_dosis:(l as any).producto_dosis||l.descripcion||"",aplicador:(l as any).aplicador||"",superficie_ha:String((l as any).superficie_ha),operario:(l as any).operario||"",costo_aplicacion_ha:String((l as any).costo_aplicacion_ha||""),costo_total_lab:String(l.costo_total||""),comentario:(l as any).comentario||""});setShowFormLabor(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                              <button onClick={()=>eliminarLabor(l.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          </div>
        )}

        {/* ══ VISTA PRINCIPAL LOTES ══ */}
        {!loteActivo&&(
          <div>
            {/* Tabs + acciones */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[{k:"lotes",l:"📋 Lotes"},{k:"margen",l:"📊 Margen"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as "lotes"|"margen")}
                  style={{padding:"7px 16px",borderRadius:11,fontSize:12,fontWeight:700,cursor:"pointer",border:"1px solid",borderColor:tab===t.k?"#1976d2":"rgba(180,210,240,0.50)",background:tab===t.k?"rgba(25,118,210,0.10)":"rgba(255,255,255,0.70)",color:tab===t.k?"#1565c0":"#4a6a8a"}}>
                  {t.l}
                </button>
              ))}
              <div style={{flex:1}}/>
              <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");setLoteActivo(null);}} className="abtn" style={{fontSize:11}}>📥 Cuaderno multi-lote</button>
              <button onClick={()=>setShowImport(!showImport)} className="abtn" style={{fontSize:11}}>📥 Importar lotes</button>
              <button onClick={exportarLotes} className="abtn" style={{fontSize:11}}>📤 Exportar</button>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}} className="bbtn">+ Nuevo lote</button>
            </div>

            {/* Import cuaderno multi */}
            {showImportCuaderno&&!loteActivo&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>📥 Importar Cuaderno Multi-Lote</div>
                    <div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>Cargá labores de varios lotes en un solo Excel</div>
                  </div>
                  <button onClick={()=>{setShowImportCuaderno(false);setCuadernoPreview([]);setCuadernoMsg("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(217,119,6,0.06)",border:"1px solid rgba(217,119,6,0.18)",marginBottom:10,fontSize:11}}>
                  <div style={{fontWeight:700,color:"#0d2137",marginBottom:3}}>Formato esperado:</div>
                  <div style={{color:"#d97706",fontWeight:700}}>LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</div>
                  <div style={{color:"#aab8c8",marginTop:3}}>Tipos: Siembra / Aplicación / Fertilización / Cosecha / Labranza / Control malezas / Recorrida</div>
                </div>
                <input ref={importCuadernoMultiRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f){setCuadernoPreview([]);setCuadernoMsg("");leerExcelCuaderno(f);}}}/>
                {cuadernoPreview.length===0
                  ?<button onClick={()=>importCuadernoMultiRef.current?.click()} className="abtn" style={{width:"100%",justifyContent:"center",padding:"12px",border:"2px dashed rgba(25,118,210,0.25)"}}>📁 Seleccionar archivo Excel</button>
                  :<div>
                    <div style={{maxHeight:200,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.08)"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Lote","Sistema","Fecha","Ha","Tipo","Dosis","$/ha","Total"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                        <tbody>{cuadernoPreview.map((r,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",opacity:r.lote_id?1:0.5}}>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#d97706"}}>{r.lote_nombre}</td>
                            <td style={{padding:"6px 10px"}}>{r.lote_match?<span style={{color:"#16a34a",fontWeight:700}}>✓ {r.lote_match}</span>:<span style={{color:"#dc2626"}}>✗</span>}</td>
                            <td style={{padding:"6px 10px",color:"#6b8aaa"}}>{r.fecha||"—"}</td>
                            <td style={{padding:"6px 10px",fontWeight:700}}>{r.hectareas>0?r.hectareas:"—"}</td>
                            <td style={{padding:"6px 10px"}}><span style={{fontSize:10,padding:"1px 6px",borderRadius:5,fontWeight:700,background:laborColor(r.tipo)+"20",color:laborColor(r.tipo)}}>{r.tipo}</span></td>
                            <td style={{padding:"6px 10px",color:"#4a6a8a",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.producto_dosis||"—"}</td>
                            <td style={{padding:"6px 10px",color:"#d97706"}}>{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#d97706"}}>{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <button onClick={confirmarImportCuaderno} className="bbtn">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                      <button onClick={()=>{setCuadernoPreview([]);setCuadernoMsg("");importCuadernoMultiRef.current?.click();}} className="abtn" style={{fontSize:11}}>Cambiar archivo</button>
                      {cuadernoPreview.filter(r=>!r.lote_id).length>0&&<span style={{fontSize:11,color:"#d97706"}}>⚠ {cuadernoPreview.filter(r=>!r.lote_id).length} sin match</span>}
                    </div>
                  </div>
                }
                {cuadernoMsg&&<p style={{marginTop:8,fontSize:11,fontWeight:600,color:cuadernoMsg.startsWith("✅")?"#16a34a":cuadernoMsg.startsWith("❌")?"#dc2626":"#d97706"}}>{cuadernoMsg}</p>}
              </div>
            )}

            {/* Import lotes */}
            {showImport&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>📥 Importar Lotes</div>
                  <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
                </div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelLotes(f);}}/>
                {importPreview.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="abtn" style={{width:"100%",justifyContent:"center",padding:"12px",border:"2px dashed rgba(25,118,210,0.25)"}}>📁 Seleccionar Excel</button>
                  :<div>
                    <div style={{maxHeight:160,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.08)"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Lote","Ha","Cultivo","Variedad","Acción"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}><td style={{padding:"6px 10px",fontWeight:700,color:"#0d2137"}}>{r.nombre}</td><td style={{padding:"6px 10px",color:"#d97706"}}>{r.hectareas||"—"}</td><td style={{padding:"6px 10px",color:"#16a34a"}}>{r.cultivo_completo||"—"}</td><td style={{padding:"6px 10px",color:"#1565c0"}}>{r.variedad||"—"}</td><td style={{padding:"6px 10px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:5,fontWeight:700,background:r.accion==="crear"?"rgba(22,163,74,0.12)":"rgba(25,118,210,0.12)",color:r.accion==="crear"?"#16a34a":"#1565c0"}}>{r.accion==="crear"?"+ Crear":"✎ Actualizar"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={confirmarImportLotes} className="bbtn">▶ Confirmar {importPreview.length} lotes</button>
                      <button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="abtn" style={{fontSize:11}}>Cambiar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p style={{marginTop:8,fontSize:11,fontWeight:600,color:importMsg.startsWith("✅")?"#16a34a":"#dc2626"}}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote&&!editandoLote&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:12}}>+ Nuevo Lote</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="El Norte..."/></div>
                  <div><label className={lCls}>Hectáreas *</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className="sel-new" style={{width:"100%"}}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className="sel-new" style={{width:"100%"}}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel-new" style={{width:"100%"}}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLote} className="bbtn" style={{padding:"10px 18px"}}>Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setForm({});}} className="abtn" style={{padding:"10px 16px"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* KPIs + filtros + gráfico */}
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}}>
                {[{l:"Lotes",v:String(lotesPrincipales.length),c:"#0d2137"},{l:"Ha",v:totalHa.toLocaleString("es-AR"),c:"#d97706"},{l:"MB Est.",v:"$"+Math.round(margenes.filter(m=>m.estado==="estimado").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#22c55e"},{l:"MB Real",v:"$"+Math.round(margenes.filter(m=>m.estado==="real").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#1565c0"}].map(s=>(
                  <div key={s.l} className="kpi-s" style={{minWidth:62}}>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:s.c,marginTop:2}}>{s.v}</div>
                  </div>
                ))}
              </div>
              {/* Filtros cultivo */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flex:1}}>
                <button onClick={()=>setFilterCultivo("todos")} style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",borderColor:filterCultivo==="todos"?"#22c55e":"rgba(180,210,240,0.50)",background:filterCultivo==="todos"?"rgba(34,197,94,0.12)":"rgba(255,255,255,0.70)",color:filterCultivo==="todos"?"#16a34a":"#6b8aaa"}}>Todos ({lotesPrincipales.length})</button>
                {datosGrafico.map(d=>(
                  <button key={d.name} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)} style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",borderColor:filterCultivo===d.name?d.color:d.color+"50",background:filterCultivo===d.name?d.color+"20":"rgba(255,255,255,0.70)",color:filterCultivo===d.name?d.color:d.color+"90"}}>{d.name} · {d.value}ha</button>
                ))}
              </div>
              {/* Gráfico */}
              {datosGrafico.length>0&&(
                <div className="kpi-s" style={{padding:12,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                  <div style={{width:80,height:80}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={36} innerRadius={16} dataKey="value" labelLine={false} label={renderPieLabel} paddingAngle={2}>
                        {datosGrafico.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(255,255,255,0.5)" strokeWidth={2}/>)}
                      </Pie><Tooltip formatter={(v: any,n: string)=>[String(v)+" ha",n]} contentStyle={{background:"rgba(255,255,255,0.95)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px",color:"#0d2137"}}/></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:100}}>
                    {datosGrafico.map((d,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:d.color,maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                        <span style={{fontSize:10,color:"#6b8aaa",marginLeft:"auto"}}>{d.value}ha</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lista lotes */}
            {tab==="lotes"&&(
              lotesPrincipales.length===0?(
                <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                  <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🌾</div>
                  <p style={{color:"#6b8aaa",marginBottom:12,fontSize:14}}>Sin lotes — agregá el primero</p>
                  <button onClick={()=>setShowFormLote(true)} className="bbtn">+ Agregar primer lote</button>
                </div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                  {lotesPrincipales.filter(lote=>filterCultivo==="todos"||(getCultivoInfo(lote.cultivo,lote.cultivo_orden).label)===filterCultivo).map(lote=>{
                    const ci=getCultivoInfo(lote.cultivo||"",lote.cultivo_orden||"");
                    const mg=margenes.find(m=>m.lote_id===lote.id);
                    const labsCount=labores.filter(l=>l.lote_id===lote.id).length;
                    const labsCosto=labores.filter(l=>l.lote_id===lote.id).reduce((a,l)=>a+(l.costo_total||0),0);
                    const est=ESTADOS.find(e=>e.v===lote.estado);
                    const ultimaLabor=labores.filter(l=>l.lote_id===lote.id).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
                    return(
                      <div key={lote.id} className="lote-card" onClick={()=>setLoteActivo(lote)}>
                        {/* Franja color cultivo */}
                        <div style={{height:4,background:ci.color,borderRadius:"18px 18px 0 0"}}/>
                        <div style={{padding:"12px 14px 10px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <span style={{fontSize:18}}>{(ci as any).icon}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:14,fontWeight:800,color:"#0d2137",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lote.nombre}</div>
                              <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,fontWeight:700,color:ci.color}}>{ci.label}</span>
                                {est&&<span className="tag-c" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                              </div>
                            </div>
                            <button onClick={e=>{e.stopPropagation();eliminarLote(lote.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:16,flexShrink:0}}>✕</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
                            {[{l:"Ha",v:lote.hectareas,c:"#d97706"},{l:"Labores",v:labsCount,c:"#4a6a8a"},{l:"MB/ha",v:mg?"$"+Math.round(mg.margen_bruto_ha).toLocaleString("es-AR"):"—",c:mg?(mg.margen_bruto_ha>=0?"#22c55e":"#ef4444"):"#aab8c8"}].map(s=>(
                              <div key={s.l} className="kpi-s" style={{padding:"6px 8px"}}>
                                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                                <div style={{fontSize:12,fontWeight:800,color:s.c,marginTop:1}}>{s.v}</div>
                              </div>
                            ))}
                          </div>
                          {ultimaLabor&&(
                            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                              <span className="tag-c" style={{background:laborColor(ultimaLabor.tipo)+"20",color:laborColor(ultimaLabor.tipo),fontSize:10}}>{ultimaLabor.tipo}</span>
                              <span style={{color:"#aab8c8"}}>{ultimaLabor.fecha}</span>
                              {labsCosto>0&&<span style={{marginLeft:"auto",color:"#d97706",fontWeight:700}}>${labsCosto.toLocaleString("es-AR")}</span>}
                            </div>
                          )}
                          {!ultimaLabor&&(lote.fecha_siembra||(lote.variedad||lote.hibrido))&&(
                            <div style={{display:"flex",gap:8,fontSize:11,color:"#aab8c8"}}>
                              {lote.fecha_siembra&&<span>🗓 {lote.fecha_siembra}</span>}
                              {(lote.variedad||lote.hibrido)&&<span>🌱 {lote.variedad||lote.hibrido}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Margen general */}
            {tab==="margen"&&(
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Margen Bruto por Lote</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>USD ${usdUsado}</span>
                </div>
                {margenes.length===0
                  ?<div style={{textAlign:"center",padding:"40px 20px",color:"#6b8aaa",fontSize:13}}>Sin márgenes — entrá a un lote y cargá el margen</div>
                  :<div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:700}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Lote","Cultivo","Ha","Rend.","Ingreso","Costo","Margen","MB/ha","Estado"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {margenes.map((m: any)=>{
                          const lote=lotes.find(l=>l.id===m.lote_id);
                          const ci=getCultivoInfo(m.cultivo||"",m.cultivo_orden||"");
                          return(
                            <tr key={m.id} className="row-l" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",cursor:"pointer",transition:"background 0.15s"}} onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                              <td style={{padding:"10px 12px",fontWeight:800,color:"#0d2137"}}>{lote?.nombre||"—"}</td>
                              <td style={{padding:"10px 12px"}}><span className="tag-c" style={{background:ci.color+"20",color:ci.color}}>{(ci as any).icon} {ci.label}</span></td>
                              <td style={{padding:"10px 12px",color:"#6b8aaa"}}>{m.hectareas}</td>
                              <td style={{padding:"10px 12px",color:"#d97706",fontWeight:600}}>{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                              <td style={{padding:"10px 12px",fontWeight:600,color:"#0d2137"}}>${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 12px",color:"#dc2626",fontWeight:600}}>${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 12px",fontWeight:800,color:m.margen_bruto>=0?"#16a34a":"#dc2626"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 12px",color:"#d97706",fontWeight:700}}>${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 12px"}}><span className="tag-c" style={{background:m.estado==="real"?"rgba(22,163,74,0.12)":"rgba(217,119,6,0.12)",color:m.estado==="real"?"#16a34a":"#d97706"}}>{m.estado==="real"?"✅ Real":"📋 Est."}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel voz */}
      {vozPanel&&(
        <div style={{position:"fixed",bottom:80,right:16,zIndex:50,width:288,borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,0.92)",backdropFilter:"blur(16px)",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:VOZ_COLOR[vozEstado]}}/><span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>🎤 Asistente de Campo</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:"10px 12px",minHeight:72}}>
            {vozEstado==="escuchando"&&<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{display:"flex",gap:3,alignItems:"flex-end",height:20}}>{[1,2,3,4,5].map(i=><div key={i} style={{width:4,borderRadius:2,background:"#dc2626",height:(6+i*3)+"px",animation:`float 0.6s ${i*0.1}s ease-in-out infinite`}}/>)}</div><span style={{fontSize:12,color:"#dc2626",fontWeight:700}}>Escuchando...</span></div>}
            {vozEstado==="procesando"&&<p style={{fontSize:12,color:"#d97706",fontWeight:700}}>⚙️ Procesando...</p>}
            {vozRespuesta&&<div style={{background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.20)",borderRadius:10,padding:"8px 12px",marginBottom:8}}><p style={{fontSize:12,color:"#0d2137",margin:0,lineHeight:1.5}}>{vozRespuesta}</p></div>}
            {vozEstado==="idle"&&!vozRespuesta&&!vozTranscripcion&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {["Hoy siembra lote Grande N","Aplicación glifosato lote Sur","Cosecha lote 3 rendimiento 35 qq"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} style={{textAlign:"left",fontSize:11,color:"#4a6a8a",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"6px 10px 10px",display:"flex",gap:6,borderTop:"1px solid rgba(0,60,140,0.07)"}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribí o hablá..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} style={{padding:"7px 11px",borderRadius:10,fontSize:14,background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}40`,color:VOZ_COLOR[vozEstado],cursor:"pointer"}}>{VOZ_ICON[vozEstado]}</button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="bbtn" style={{padding:"7px 11px",fontSize:12}}>→</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",color:"white",border:"2px solid rgba(180,220,255,0.70)",boxShadow:"0 4px 22px rgba(33,150,243,0.55)",animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",transition:"all 0.2s ease",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

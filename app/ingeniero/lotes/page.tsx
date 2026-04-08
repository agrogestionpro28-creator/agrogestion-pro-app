"use client";
// @ts-nocheck
// app/ingeniero/lotes/page.tsx

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
  // Columnas reales de lote_labores
  productos?: string; dosis?: string;
  hectareas_trabajadas?: number; tipo_aplicacion?: string;
  precio_aplicacion_ha?: number; costo_total_usd?: number;
  metodo_carga?: string; metodo_entrada?: string;
  estado_carga?: string; cargado_por_rol?: string;
  // Aliases normalizados en fetchLotes
  producto_dosis?: string; aplicador?: string;
  costo_aplicacion_ha?: number; costo_total?: number;
  superficie_ha?: number; comentario?: string; observaciones?: string;
  operario?: string; maquinaria?: string;
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

const TIPOS_LABOR = [
  "Siembra","Aplicación","Fertilización","Cosecha",
  "Labranza","Riego","Control malezas","Recorrida","Otro"
];
const APLICADORES = ["Mosquito","Drone","Avión","Tractor","Manual","—"];
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

// ── Icono de aplicador ──
const APLIC_ICON: Record<string,string> = {
  "Mosquito":"🚜","Drone":"🚁","Avión":"✈️","Tractor":"🚜","Manual":"👤","—":"—"
};

// ── Color de tipo labor ──
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
  const [ingenieroId, setIngenieroId] = useState("");
  const [ingenieroNombre, setIngenieroNombre] = useState("");
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
  const importCuadernoRef = useRef<HTMLInputElement>(null);       // dentro del lote
  const importCuadernoMultiRef = useRef<HTMLInputElement>(null);  // vista principal multi-lote
  const adjuntoRef = useRef<HTMLInputElement>(null);
  const [usdUsado, setUsdUsado] = useState(1);
  // Voz
  const [vozEstado, setVozEstado] = useState<"idle"|"escuchando"|"procesando"|"respondiendo"|"error">("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozTranscripcion, setVozTranscripcion] = useState("");
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,nombre,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
    setIngenieroId(u.id); setIngenieroNombre(u.nombre);
    const eid = localStorage.getItem("ing_empresa_id") ?? "";
    const pnombre = localStorage.getItem("ing_empresa_nombre") ?? "Productor";
    const compartido = localStorage.getItem("ing_modo_compartido") === "true";
    if (!eid) { window.location.href = "/ingeniero"; return; }
    setEmpresaId(eid); setProductorNombre(pnombre); setModoCompartido(compartido);
    await setupEmpresaYCampanas(eid, u.id, compartido, pnombre);
    setLoading(false);
  };

  const setupEmpresaYCampanas = async (eid: string, iid: string, compartido: boolean, pnombre: string) => {
    const sb = await getSB();
    if (!compartido) {
      const { data: emp } = await sb.from("empresas").select("id").eq("id", eid).single();
      if (!emp) await sb.from("empresas").insert({ id: eid, nombre: pnombre + " (Ing)", propietario_id: iid }).select().single();
    }
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", eid).order("año_inicio", { ascending: false });
    const { data: cot } = await sb.from("finanzas_cotizaciones").select("usd_usado").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(1);
    setCampanas(camps ?? []);
    if (cot?.[0]) setUsdUsado(cot[0].usd_usado || 1);
    let activa = (camps ?? []).find(c => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    // Verificar si hay una campaña guardada en localStorage
    const campGuardada = localStorage.getItem("ing_campana_id");
    if (campGuardada && (camps ?? []).find(c => c.id === campGuardada)) activa = campGuardada;
    if (!activa) {
      const anio = new Date().getFullYear();
      const { data: nueva } = await sb.from("campanas").insert({ empresa_id: eid, nombre: anio+"/"+(anio+1), año_inicio: anio, año_fin: anio+1, activa: true }).select().single();
      if (nueva) { activa = nueva.id; setCampanas([nueva]); }
    }
    setCampanaActiva(activa);
    if (activa) await fetchLotes(eid, activa);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const [ls, lbs, mgs] = await Promise.all([
      sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("lote_labores").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("margen_bruto_detalle").select("*").eq("empresa_id", eid),
    ]);
    const sorted = (ls.data ?? []).sort((a: any, b: any) => naturalSort(a.nombre ?? "", b.nombre ?? ""));
    // Normalizar campos de lote_labores al formato que usa el UI
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

  // ── CRUD LOTES ──
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

  // ── CRUD LABORES (cuaderno mejorado) ──
  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = Number(form.superficie_ha ?? loteActivo.hectareas ?? 0);
    const costoTotal = form.costo_total_lab
      ? Number(form.costo_total_lab)
      : form.costo_aplicacion_ha
        ? Number(form.costo_aplicacion_ha) * ha
        : 0;
    const payload: Record<string,any> = {
      empresa_id:           empresaId,
      lote_id:              loteActivo.id,
      tipo:                 form.tipo_lab ?? "Aplicación",
      descripcion:          form.producto_dosis || form.descripcion_lab || "",
      productos:            form.producto_dosis || "",
      dosis:                form.producto_dosis || "",
      fecha:                form.fecha_lab ?? new Date().toISOString().split("T")[0],
      metodo_carga:         "ingeniero",
      metodo_entrada:       "manual",
      hectareas_trabajadas: ha,
      tipo_aplicacion:      form.aplicador ?? "",
      precio_aplicacion_ha: Number(form.costo_aplicacion_ha ?? 0),
      costo_total_usd:      costoTotal,
      estado_carga:         "confirmado",
      cargado_por_rol:      "ingeniero",
    };
    if (editandoLabor) { await sb.from("lote_labores").update(payload).eq("id", editandoLabor); setEditandoLabor(null); }
    else { await sb.from("lote_labores").insert(payload); }
    if (costoTotal > 0) { await actualizarCostoLaboresEnMB(loteActivo.id, costoTotal); }
    msg("✅ Labor guardada");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
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

  // ── MARGEN ──
  const guardarMargen = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = loteActivo.hectareas || 0;
    const rend = Number(form.mg_rend_real || form.mg_rend_esp || 0);
    const precio = Number(form.mg_precio || 0);
    const ing2 = ha * rend * precio;
    // Sumar costos de labores ya cargadas
    const labsLote = labores.filter(l => l.lote_id === loteActivo.id);
    const costoLaboresCargadas = labsLote.reduce((a,l)=>a+(l.costo_total||0),0);
    const costoLaboresForm = Number(form.mg_labores||0);
    const costoLaboresFinal = Math.max(costoLaboresForm, costoLaboresCargadas);
    const costos = [form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,String(costoLaboresFinal),form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros];
    const cd = costos.reduce((a,v) => a+Number(v||0), 0);
    const mb = ing2 - cd;
    const existing = margenes.find(m => m.lote_id === loteActivo.id);
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo.id,
      cultivo: loteActivo.cultivo, cultivo_orden: loteActivo.cultivo_orden,
      hectareas: ha, rendimiento_esperado: Number(form.mg_rend_esp||0),
      rendimiento_real: Number(form.mg_rend_real||0), precio_tn: precio,
      ingreso_bruto: ing2, costo_semilla: Number(form.mg_semilla||0),
      costo_fertilizante: Number(form.mg_fertilizante||0), costo_agroquimicos: Number(form.mg_agroquimicos||0),
      costo_labores: costoLaboresFinal, costo_alquiler: Number(form.mg_alquiler||0),
      costo_flete: Number(form.mg_flete||0), costo_comercializacion: Number(form.mg_comercializacion||0),
      otros_costos: Number(form.mg_otros||0), costo_directo_total: cd,
      margen_bruto: mb, margen_bruto_ha: ha>0?mb/ha:0,
      margen_bruto_usd: mb/usdUsado, cotizacion_usd: usdUsado,
      estado: form.mg_rend_real ? "real" : "estimado",
    };
    if (existing) await sb.from("margen_bruto_detalle").update(payload).eq("id", existing.id);
    else await sb.from("margen_bruto_detalle").insert(payload);
    msg("✅ Margen guardado");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormMargen(false); setForm({});
  };

  // ── ADJUNTO ──
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

  // ── EXPORT ──
  const exportarLotes = async () => {
    const XLSX = await import("xlsx");
    const data = lotesPrincipales.map(l => {
      const mg = margenes.find(m => m.lote_id === l.id);
      return { LOTE:l.nombre, HECTAREAS:l.hectareas, CULTIVO:l.cultivo_completo||l.cultivo, VARIEDAD:l.variedad||l.hibrido||"", ESTADO:l.estado, FECHA_SIEMBRA:l.fecha_siembra||"", TENENCIA:l.tipo_tenencia||"", PARTIDO:l.partido||"", REND_ESP:l.rendimiento_esperado||0, MARGEN_BRUTO:mg?Math.round(mg.margen_bruto):"", MB_HA:mg?Math.round(mg.margen_bruto_ha):"" };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, "lotes_"+productorNombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const exportarCuaderno = async () => {
    if (!loteActivo) return;
    const XLSX = await import("xlsx");
    const data = laboresLote.map(l => ({
      LOTE: loteActivo.nombre, FECHA: l.fecha, TIPO: l.tipo,
      PRODUCTO_DOSIS: (l as any).producto_dosis||l.descripcion||"",
      APLICADOR: (l as any).aplicador||"",
      HA: (l as any).superficie_ha||l.hectareas_trabajadas||0, OPERARIO: (l as any).operario||"",
      COSTO_HA: (l as any).costo_aplicacion_ha||"",
      COSTO_TOTAL: l.costo_total||0,
      COMENTARIO: (l as any).comentario||l.observaciones||""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Cuaderno");
    XLSX.writeFile(wb, "cuaderno_"+loteActivo.nombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  // ── IMPORT LOTES ──
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

  // ── IMPORT CUADERNO MULTI-LOTE ──
  // Formato: FECHA | LOTE | HAS | CULTIVO | DOSIS (+ opcionales)
  const leerExcelCuaderno = async (file: File) => {
    setCuadernoMsg("Leyendo...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (rows.length < 2) { setCuadernoMsg("Sin datos"); return; }

      // Normalizar: minúsculas, sin tildes, sin caracteres raros
      const norm = (s: any) => String(s ?? "").toLowerCase().trim()
        .replace(/[áà]/g,"a").replace(/[éè]/g,"e").replace(/[íì]/g,"i")
        .replace(/[óò]/g,"o").replace(/[úù]/g,"u").replace(/[ñ]/g,"n")
        .replace(/º|°/g,"").replace(/[^a-z0-9]/g,"_")
        .replace(/_+/g,"_").replace(/^_|_$/g,"");

      const hdrs = rows[0].map((h: any) => norm(h));

      // Buscar columna — solo coincidencia EXACTA con la lista de nombres posibles
      const col = (nombres: string[]): number => {
        for (const n of nombres) {
          const i = hdrs.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };

      // Columnas con sus posibles nombres normalizados
      const cFecha   = col(["fecha","date","dia","fec"]);
      const cLote    = col(["lote","campo","parcela","lot","n_lote","nro","numero","num"]);
      const cHas     = col(["has","hectareas","superficie","ha_lote","hect"]);
      const cCultivo = col(["cultivo","especie","crop","cult"]);
      const cDosis   = col(["dosis","producto","producto_dosis","descripcion","desc","detalle"]);
      const cAplic   = col(["aplicador","equipo","maquina","aplic","mosquito","drone"]);
      const cCostoHa = col(["costo_ha","precio_ha","valor_ha","costo_por_ha","cosha"]);
      const cCostoT  = col(["costo_total","total","importe","monto","costo_tot"]);
      const cTipo    = col(["tipo","tipo_labor","labor","accion","tarea"]);
      const cComent  = col(["comentario","observacion","obs","nota","coment"]);

      if (cFecha === -1) {
        setCuadernoMsg("❌ No encontré columna FECHA. Headers detectados: " + hdrs.join(", "));
        return;
      }
      if (cLote === -1) {
        setCuadernoMsg("❌ No encontré columna LOTE. Headers detectados: " + hdrs.join(", "));
        return;
      }

      // Buscar lote: "7" → "7- GRANDE N"
      const buscarLote = (val: any) => {
        const v = String(val ?? "").trim();
        if (!v || v === "0") return undefined;
        const vl = v.toLowerCase();
        // 1. Exacto
        let f = lotes.find(l => l.nombre.toLowerCase().trim() === vl);
        if (f) return f;
        // 2. Número solo → lote que empieza con ese número
        if (/^\d+$/.test(v)) {
          f = lotes.find(l => {
            const n = l.nombre.trim();
            return n === v
              || n.startsWith(v + "-")
              || n.startsWith(v + " -")
              || n.startsWith(v + " ")
              || new RegExp("^" + v + "\\b").test(n);
          });
          if (f) return f;
        }
        // 3. Contiene (mínimo 3 chars)
        if (vl.length >= 3) {
          f = lotes.find(l => l.nombre.toLowerCase().includes(vl));
          if (f) return f;
        }
        return undefined;
      };

      const preview = rows.slice(1)
        .filter((r: any) => String(r[cFecha] ?? "").trim() && String(r[cLote] ?? "").trim())
        .map((r: any) => {
          const loteVal  = String(r[cLote]).trim();
          const loteObj  = buscarLote(loteVal);
          const fechaStr = parseFecha(r[cFecha]);
          const haExcel  = cHas >= 0 && r[cHas] !== "" ? Number(r[cHas]) || 0 : 0;
          const ha       = haExcel > 0 ? haExcel : (loteObj?.hectareas ?? 0);
          const cultivo  = cCultivo >= 0 ? String(r[cCultivo] ?? "").trim() : "";
          const dosis    = cDosis   >= 0 ? String(r[cDosis]   ?? "").trim() : "";
          const tipoRaw  = cTipo    >= 0 ? String(r[cTipo]    ?? "").trim() : "";
          const txt      = (tipoRaw + dosis + cultivo).toLowerCase();
          const tipo     = tipoRaw || (
            txt.includes("siem")                    ? "Siembra"       :
            txt.includes("cosech")                  ? "Cosecha"       :
            txt.includes("fertil")                  ? "Fertilización" :
            txt.includes("labr")                    ? "Labranza"      :
            txt.includes("recorr")                  ? "Recorrida"     :
                                                      "Aplicación"
          );
          // Costos — solo si la celda tiene valor real (no vacío)
          const costoHaRaw = cCostoHa >= 0 ? r[cCostoHa] : "";
          const costoHa    = costoHaRaw !== "" && costoHaRaw !== null ? Number(costoHaRaw) || 0 : 0;
          const costoTRaw  = cCostoT  >= 0 ? r[cCostoT]  : "";
          const costoT     = costoTRaw  !== "" && costoTRaw  !== null ? Number(costoTRaw)  || 0 : 0;
          const costoFinal = costoT > 0 ? costoT : (costoHa > 0 && ha > 0 ? costoHa * ha : 0);
          return {
            lote_nombre:         loteVal,
            lote_id:             loteObj?.id    ?? null,
            lote_match:          loteObj?.nombre ?? null,
            hectareas:           ha,
            fecha:               fechaStr,
            tipo,
            cultivo_excel:       cultivo,
            producto_dosis:      dosis || cultivo,
            descripcion:         dosis || cultivo,
            aplicador:           cAplic  >= 0 ? String(r[cAplic]  ?? "").trim() : "",
            costo_aplicacion_ha: costoHa,
            costo_total:         costoFinal,
            comentario:          cComent >= 0 ? String(r[cComent] ?? "").trim() : "",
          };
        });

      setCuadernoPreview(preview);
      const con = preview.filter(p => p.lote_id).length;
      const sin = preview.filter(p => !p.lote_id).length;
      setCuadernoMsg(`✅ ${preview.length} labores · ${con} lotes encontrados${sin > 0 ? ` · ⚠ ${sin} sin match` : ""}`);
    } catch(e: any) { setCuadernoMsg("❌ " + e.message); }
  };

  const confirmarImportCuaderno = async () => {
    if (!empresaId || !cuadernoPreview.length) return;
    const sb = await getSB();
    let ok = 0; let err = 0; let errMsg = "";
    for (const l of cuadernoPreview) {
      if (!l.lote_id) { err++; continue; }
      // Columnas EXACTAS de lote_labores según la BD
      const payload: Record<string,any> = {
        empresa_id:           empresaId,
        lote_id:              l.lote_id,
        tipo:                 l.tipo || "Aplicación",
        descripcion:          l.producto_dosis || l.descripcion || "",
        productos:            l.producto_dosis || "",
        dosis:                l.producto_dosis || "",
        fecha:                l.fecha || new Date().toISOString().split("T")[0],
        metodo_carga:         "excel_multi",
        metodo_entrada:       "excel",
        hectareas_trabajadas: l.hectareas || 0,
        tipo_aplicacion:      l.aplicador || "",
        precio_aplicacion_ha: l.costo_aplicacion_ha || 0,
        costo_total_usd:      l.costo_total || 0,
        estado_carga:         "confirmado",
        cargado_por_rol:      "ingeniero",
      };
      const { error } = await sb.from("lote_labores").insert(payload);
      if (error) { errMsg = error.message; err++; continue; }
      ok++;
    }
    if (ok > 0) msg(`✅ ${ok} labores importadas${err > 0 ? ` · ${err} errores` : ""}`);
    else msg(`❌ Error: ${errMsg || "sin lotes encontrados"}`);
    await fetchLotes(empresaId, campanaActiva);
    setCuadernoPreview([]); setCuadernoMsg(""); setShowImportCuaderno(false);
  };

  // ── VOZ ──
  const hablar = useCallback((texto: string) => {
    if (typeof window==="undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang="es-AR"; utt.rate=1.05;
    const v = window.speechSynthesis.getVoices().find(x => x.lang.startsWith("es"));
    if (v) utt.voice=v;
    utt.onstart=()=>setVozEstado("respondiendo"); utt.onend=()=>setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const resumen = lotes.slice(0,10).map(l => l.nombre+":"+l.hectareas+"ha "+( l.cultivo_completo||l.cultivo)+"("+l.estado+")").join(";");
    const hoy = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/api/scanner", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500, messages:[{ role:"user", content:`Asistente cuaderno de campo agropecuario Argentina. Productor: ${productorNombre}. Lotes: ${resumen}. Fecha hoy: ${hoy}. Voz del ingeniero: "${texto}". 
Respondé SOLO JSON sin markdown: {"texto":"respuesta breve","accion":"consulta|nueva_labor|crear_lote","datos":{}}
Para nueva_labor incluir: lote_nombre, fecha (YYYY-MM-DD), tipo (Siembra/Aplicación/Fertilización/Cosecha/etc), producto_dosis, aplicador (Mosquito/Drone/Avión/Tractor/Manual), costo_total, comentario.
Para crear_lote incluir: nombre, hectareas, cultivo.` }] })
      });
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??""); hablar(parsed.texto??"");
      if (parsed.accion==="nueva_labor" && parsed.datos) {
        const d = parsed.datos;
        // Buscar el lote
        const loteTarget = lotes.find(l => l.nombre.toLowerCase().includes((d.lote_nombre??"").toLowerCase()) || (d.lote_nombre??"").toLowerCase().includes(l.nombre.toLowerCase()));
        if (loteTarget) {
          setLoteActivo(loteTarget);
          setForm({
            tipo_lab: d.tipo||"Aplicación", fecha_lab: d.fecha||hoy,
            descripcion_lab: d.producto_dosis||"", producto_dosis: d.producto_dosis||"",
            aplicador: d.aplicador||"", costo_total_lab: String(d.costo_total||""),
            comentario: d.comentario||"", operario: ingenieroNombre,
            superficie_ha: String(loteTarget.hectareas)
          });
          setShowFormLabor(true);
        } else {
          setVozRespuesta((parsed.texto||"")+" — No encontré el lote \""+d.lote_nombre+"\"");
        }
      }
      if (parsed.accion==="crear_lote" && parsed.datos) {
        const ci2 = CULTIVOS_LISTA.find(c=>(parsed.datos.cultivo??"").toLowerCase().includes(c.cultivo));
        setForm({ nombre:parsed.datos.nombre??"", hectareas:String(parsed.datos.hectareas??""), cultivo_key:ci2?ci2.cultivo+"|"+ci2.orden:"soja|1ra" });
        setShowFormLote(true);
      }
      setVozEstado("respondiendo");
    } catch { const e="No pude interpretar el audio."; setVozRespuesta(e); hablar(e); setVozEstado("error"); setTimeout(()=>setVozEstado("idle"),2000); }
  }, [lotes, hablar, productorNombre, ingenieroNombre]);

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

  // Estilos inputs
  const iCls="w-full bg-[#0f1923] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-green-500 transition-all placeholder:text-gray-600";
  const lCls="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide";

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
    return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="monospace" fontWeight="bold">{Math.round(percent*100)+"%"}</text>;
  };

  if (loading) return (
    <div className="min-h-screen bg-[#080f17] flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-gray-300">Cargando lotes...</span>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#080f17] text-gray-100" style={{fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.18s ease}
        .lote-card{cursor:pointer;transition:all 0.15s ease;background:#0f1923;border:1px solid #1e2d3d}
        .lote-card:hover{border-color:#2d5a3d;transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.4)}
        .card{background:#0f1923;border:1px solid #1e2d3d;border-radius:16px}
        .btn-green{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;transition:all 0.15s}
        .btn-green:hover{background:rgba(34,197,94,0.25)}
        .btn-amber{background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);color:#eab308;transition:all 0.15s}
        .btn-amber:hover{background:rgba(234,179,8,0.22)}
        .btn-blue{background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;transition:all 0.15s}
        .btn-blue:hover{background:rgba(96,165,250,0.22)}
        .btn-solid-green{background:#16a34a;color:white;transition:all 0.15s}
        .btn-solid-green:hover{background:#15803d}
        .tag{display:inline-flex;align-items:center;border-radius:8px;font-size:11px;font-weight:600;padding:2px 8px}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#080f17}::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:4px}
      `}</style>

      {/* ── HEADER ── */}
      <div className="bg-[#0c1520] border-b border-[#1e2d3d] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/ingeniero"} className="text-gray-500 hover:text-green-400 text-sm font-medium transition-colors flex items-center gap-1.5">
          ← {loteActivo?"Volver a lotes":"Mi Panel"}
        </button>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-sm font-bold text-gray-100">{productorNombre}</div>
          <div className="text-xs font-medium" style={{color:modoCompartido?"#22c55e":"#eab308"}}>
            {modoCompartido?"🔗 Datos compartidos con productor":"📋 Datos propios del ingeniero"}
          </div>
        </div>
        <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);await fetchLotes(empresaId,e.target.value);}}
          className="bg-[#0f1923] border border-[#1e2d3d] rounded-lg px-3 py-1.5 text-green-400 text-xs font-bold focus:outline-none focus:border-green-600 flex-shrink-0">
          {campanasSinDup.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
        </select>
        <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-sm flex-shrink-0"
          style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
          {VOZ_ICON[vozEstado]} <span className="hidden sm:inline">VOZ</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* Toast */}
        {msgExito&&<div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between fade-in ${msgExito.startsWith("✅")?"bg-green-500/10 text-green-400 border border-green-500/20":"bg-red-500/10 text-red-400 border border-red-500/20"}`}>{msgExito}<button onClick={()=>setMsgExito("")} className="ml-3 opacity-60 hover:opacity-100">✕</button></div>}

        {/* ══════════════════════════════════
            DETALLE LOTE — CUADERNO DE CAMPO
        ══════════════════════════════════ */}
        {loteActivo&&(
          <div className="space-y-4 fade-in">
            {/* Header lote */}
            <div className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{background:cultivoActivoInfo?.color}}/>
                  <span className="text-2xl">{(cultivoActivoInfo as any)?.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">{loteActivo.nombre}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-bold text-sm" style={{color:"#eab308"}}>{loteActivo.hectareas} ha</span>
                      <span className="tag" style={{background:(cultivoActivoInfo?.color??"#6b7280")+"20",color:cultivoActivoInfo?.color??"#6b7280"}}>{cultivoActivoInfo?.label||"Sin cultivo"}</span>
                      {(()=>{const e=ESTADOS.find(x=>x.v===loteActivo.estado);return e?<span className="tag" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null;})()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={()=>{const ci3=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);setEditandoLote(loteActivo.id);setForm({nombre:loteActivo.nombre,hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",cultivo_key:ci3?ci3.cultivo+"|"+ci3.orden:"soja|1ra",fecha_siembra:loteActivo.fecha_siembra||"",fecha_cosecha:loteActivo.fecha_cosecha||"",variedad:loteActivo.variedad||loteActivo.hibrido||"",rendimiento_esperado:String(loteActivo.rendimiento_esperado||""),estado:loteActivo.estado||"planificado",observaciones:loteActivo.observaciones||""});setShowFormLote(true);}} className="btn-amber px-3 py-2 rounded-xl text-xs font-bold">✏️ Editar</button>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="btn-green px-3 py-2 rounded-xl text-xs font-bold">+ Labor</button>
                  <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);const labsTotal=labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(Math.max(mg.costo_labores,labsTotal)),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});else setForm({mg_labores:String(labsTotal)});setShowFormMargen(true);}} className="btn-blue px-3 py-2 rounded-xl text-xs font-bold">📊 Margen</button>
                  {loteActivo.estado==="cosechado"&&admite2do&&segundosCultivos.length===0&&(
                    <button onClick={()=>{setForm({es_segundo_cultivo:"true",lote_base_id:loteActivo.id,nombre:loteActivo.nombre+" 2DO",hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",estado:"planificado",cultivo_key:"soja|2da"});setEditandoLote(null);setShowFormLote(true);}} className="btn-green px-3 py-2 rounded-xl text-xs font-bold">🔄 2º Cultivo</button>
                  )}
                  <button onClick={()=>eliminarLote(loteActivo.id)} className="px-3 py-2 rounded-xl border border-red-500/20 text-red-400 text-xs hover:bg-red-500/10 transition-colors">🗑</button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:"Tenencia",v:loteActivo.tipo_tenencia||"—",c:"#eab308"},
                {l:"Partido",v:loteActivo.partido||"—",c:"#9ca3af"},
                {l:usaHibrido?"Híbrido":"Variedad",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#22c55e"},
                {l:"F. Siembra",v:loteActivo.fecha_siembra||"Sin fecha",c:"#60a5fa"},
                {l:"F. Cosecha",v:loteActivo.fecha_cosecha||"—",c:"#a78bfa"},
                {l:"Rend. Esp.",v:loteActivo.rendimiento_esperado?loteActivo.rendimiento_esperado+" tn/ha":"—",c:"#eab308"},
                {l:"Margen Bruto",v:margenLote?"$"+Math.round(margenLote.margen_bruto).toLocaleString("es-AR"):"—",c:margenLote&&margenLote.margen_bruto>=0?"#22c55e":"#ef4444"},
                {l:"MB/ha",v:margenLote?"$"+Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")+"/ha":"—",c:"#eab308"},
              ].map(s=>(
                <div key={s.l} className="card p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">{s.l}</div>
                  <div className="text-sm font-bold mt-1 uppercase" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Form editar lote */}
            {showFormLote&&editandoLote&&(
              <div className="card p-5 fade-in">
                <h3 className="text-amber-400 font-bold text-sm mb-4 uppercase">✏️ Editar Lote</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Hectáreas</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{usaHibrido?"Híbrido":"Variedad"}</label><input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className={iCls} placeholder="DM4612, NK..."/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>F. Cosecha</label><input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Rend. Esp. tn/ha</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#1e2d3d]">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Estado rápido:</span>
                  <div className="flex gap-2 mt-2 flex-wrap">{ESTADOS.map(e=><button key={e.v} onClick={()=>setForm({...form,estado:e.v})} className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all" style={{borderColor:form.estado===e.v?e.c:e.c+"30",background:form.estado===e.v?e.c+"20":"transparent",color:e.c}}>{e.l}</button>)}</div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#1e2d3d]">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Adjuntos:</span>
                  <input ref={adjuntoRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await subirAdjunto(f,form.adjunto_tipo||"suelo");}}/>
                  <div className="flex gap-2 mt-2">{[["suelo","🌍 Suelo"],["agua","💧 Agua"],["otro","📎 Otro"]].map(([tipo,label])=><button key={tipo} onClick={()=>{setForm({...form,adjunto_tipo:tipo});adjuntoRef.current?.click();}} className="btn-amber px-3 py-2 rounded-lg text-xs font-bold">{label}</button>)}</div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={guardarLote} className="btn-solid-green px-5 py-2.5 rounded-xl text-sm font-bold">Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-5 py-2.5 rounded-xl text-sm hover:bg-[#253447] transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form margen */}
            {showFormMargen&&(
              <div className="card p-5 fade-in">
                <h3 className="text-blue-400 font-bold text-sm mb-1 uppercase">📊 Margen Bruto — {loteActivo.nombre}</h3>
                <p className="text-xs text-gray-500 mb-4">{cultivoActivoInfo?.label} · {loteActivo.hectareas} ha · USD ${usdUsado} · Costos de labores cargados: ${labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div><label className={lCls}>Rend. Esperado tn/ha</label><input type="number" value={form.mg_rend_esp??""} onChange={e=>setForm({...form,mg_rend_esp:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Rend. Real tn/ha</label><input type="number" value={form.mg_rend_real??""} onChange={e=>setForm({...form,mg_rend_real:e.target.value})} className={iCls} placeholder="Al cosechar"/></div>
                  <div><label className={lCls}>Precio $/tn</label><input type="number" value={form.mg_precio??""} onChange={e=>setForm({...form,mg_precio:e.target.value})} className={iCls}/></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[["mg_semilla","Semillas"],["mg_fertilizante","Fertilizantes"],["mg_agroquimicos","Agroquímicos"],["mg_labores","Labores (auto)"],["mg_alquiler","Alquiler"],["mg_flete","Flete"],["mg_comercializacion","Comercialización"],["mg_otros","Otros"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} placeholder="0"/></div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={guardarMargen} className="btn-solid-green px-5 py-2.5 rounded-xl text-sm font-bold">Guardar</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-5 py-2.5 rounded-xl text-sm hover:bg-[#253447] transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* ══ FORM LABOR — CUADERNO MEJORADO ══ */}
            {showFormLabor&&(
              <div className="card p-5 fade-in">
                <h3 className="text-green-400 font-bold text-sm mb-4 uppercase">{editandoLabor?"✏️ Editar Labor":"+ Nueva Labor"} — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Fila 1 */}
                  <div>
                    <label className={lCls}>Tipo</label>
                    <select value={form.tipo_lab??"Aplicación"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className={iCls}>
                      {TIPOS_LABOR.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>Fecha</label>
                    <input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls}/>
                  </div>
                  <div>
                    <label className={lCls}>Superficie ha</label>
                    <input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls}/>
                  </div>
                  <div>
                    <label className={lCls}>Operario</label>
                    <input type="text" value={form.operario??ingenieroNombre} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls}/>
                  </div>
                  {/* Fila 2 */}
                  <div className="md:col-span-2">
                    <label className={lCls}>Producto / Dosis</label>
                    <input type="text" value={form.producto_dosis??""} onChange={e=>setForm({...form,producto_dosis:e.target.value,descripcion_lab:e.target.value})} className={iCls} placeholder="Ej: Glifosato 4L/ha + Flumioxazine 60g/ha"/>
                  </div>
                  <div>
                    <label className={lCls}>Aplicador</label>
                    <select value={form.aplicador??""} onChange={e=>setForm({...form,aplicador:e.target.value})} className={iCls}>
                      {APLICADORES.map(a=><option key={a} value={a}>{APLIC_ICON[a]||""} {a}</option>)}
                    </select>
                  </div>
                  <div/>
                  {/* Fila 3 - Costos */}
                  <div>
                    <label className={lCls}>Costo aplicación $/ha</label>
                    <input type="number" value={form.costo_aplicacion_ha??""} onChange={e=>{const ha=Number(form.superficie_ha||loteActivo.hectareas||0);setForm({...form,costo_aplicacion_ha:e.target.value,costo_total_lab:String(Number(e.target.value)*ha)});}} className={iCls} placeholder="0"/>
                  </div>
                  <div>
                    <label className={lCls}>Costo total $</label>
                    <input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls} placeholder="0"/>
                  </div>
                  <div className="md:col-span-2">
                    <label className={lCls}>Comentario libre</label>
                    <input type="text" value={form.comentario??""} onChange={e=>setForm({...form,comentario:e.target.value})} className={iCls} placeholder="Ej: Faltan plantas en sector norte, lote con presión de malezas..."/>
                  </div>
                </div>
                {/* Preview costo */}
                {(form.costo_total_lab||form.costo_aplicacion_ha)&&(
                  <div className="mt-3 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center gap-3 text-sm">
                    <span className="text-amber-400">💰</span>
                    <span className="text-gray-300">Costo total: <strong className="text-amber-400">${Number(form.costo_total_lab||0).toLocaleString("es-AR")}</strong></span>
                    {margenLote&&<span className="text-gray-500 text-xs">· Se sumará automáticamente al margen bruto</span>}
                  </div>
                )}
                {/* Selección rápida tipo */}
                <div className="mt-3 pt-3 border-t border-[#1e2d3d]">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Tipo rápido:</span>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {TIPOS_LABOR.map(t=><button key={t} onClick={()=>setForm({...form,tipo_lab:t})} className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all" style={{borderColor:form.tipo_lab===t?laborColor(t):laborColor(t)+"30",background:form.tipo_lab===t?laborColor(t)+"20":"transparent",color:form.tipo_lab===t?laborColor(t):laborColor(t)+"80"}}>{t}</button>)}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={guardarLabor} className="btn-solid-green px-5 py-2.5 rounded-xl text-sm font-bold">Guardar Labor</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-5 py-2.5 rounded-xl text-sm hover:bg-[#253447] transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* ══ HISTORIAL LABORES / CUADERNO ══ */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1e2d3d] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-100 text-sm">📋 Cuaderno de Campo</span>
                  <span className="text-xs text-gray-500">{laboresLote.length} registros</span>
                  {laboresLote.length>0&&<span className="text-xs text-amber-400">Total costos: ${laboresLote.reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={exportarCuaderno} className="btn-green px-3 py-1.5 rounded-lg text-xs font-bold">📤 Exportar</button>
                  <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");}} className="btn-amber px-3 py-1.5 rounded-lg text-xs font-bold">📥 Importar multi-lote</button>
                </div>
              </div>

              {/* Import cuaderno */}
              {showImportCuaderno&&(
                <div className="border-b border-[#1e2d3d] bg-[#0a1628]/50 p-4 fade-in">
                  <div className="text-xs text-gray-500 mb-2">Columnas Excel: <span className="text-amber-400 font-mono">LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</span></div>
                  <input ref={importCuadernoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelCuaderno(f);}}/>
                  {cuadernoPreview.length===0
                    ?<button onClick={()=>importCuadernoRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-[#1e2d3d] rounded-xl text-gray-500 text-sm w-full justify-center hover:border-green-600/50 hover:text-green-400 transition-colors">📁 Seleccionar Excel multi-lote</button>
                    :<div>
                      <div className="max-h-40 overflow-y-auto mb-3 rounded-xl border border-[#1e2d3d]">
                        <table className="w-full text-xs">
                          <thead className="bg-[#1a2535]"><tr>{["Lote","En sistema","Fecha","Ha","Tipo","Dosis / Producto","Aplic.","$/ha","Total"].map(h=><th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>)}</tr></thead>
                          <tbody>{cuadernoPreview.map((r,i)=>(
                            <tr key={i} className="border-t border-[#1a2535]">
                              <td className="px-3 py-2 font-bold text-amber-400 text-xs">{r.lote_nombre}</td>
                              <td className="px-3 py-2 text-xs">{r.lote_match?<span className="text-green-400 font-medium">✓ {r.lote_match}</span>:<span className="text-red-400">✗ No match</span>}</td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{r.fecha||"—"}</td>
                              <td className="px-3 py-2 text-gray-200 font-bold text-xs">{r.hectareas>0?r.hectareas:"—"}</td>
                              <td className="px-3 py-2 text-xs"><span className="px-1.5 py-0.5 rounded font-bold" style={{background:laborColor(r.tipo)+"20",color:laborColor(r.tipo)}}>{r.tipo}</span></td>
                              <td className="px-3 py-2 text-gray-200 max-w-[160px] truncate text-xs">{r.producto_dosis||"—"}</td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{r.aplicador||"—"}</td>
                              <td className="px-3 py-2 text-amber-400 text-xs">{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                              <td className="px-3 py-2 text-amber-300 font-bold text-xs">{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={confirmarImportCuaderno} className="btn-solid-green px-4 py-2 rounded-xl text-sm font-bold">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                        <button onClick={()=>setCuadernoPreview([])} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button>
                      </div>
                    </div>
                  }
                  {cuadernoMsg&&<p className={`mt-2 text-xs font-medium ${cuadernoMsg.startsWith("✅")?"text-green-400":"cuadernoMsg".startsWith("❌")?"text-red-400":"text-amber-400"}`}>{cuadernoMsg}</p>}
                </div>
              )}

              {/* Lista labores */}
              {laboresLote.length===0
                ?<div className="text-center py-12 text-gray-600">
                  <div className="text-4xl mb-3 opacity-30">📋</div>
                  <p className="text-sm">Sin labores registradas</p>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="mt-3 btn-green px-4 py-2 rounded-xl text-sm font-bold">+ Agregar primera labor</button>
                </div>
                :<div>
                  {laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>{
                    const color = laborColor(l.tipo);
                    const aplic = (l as any).aplicador;
                    const prod = (l as any).producto_dosis;
                    const coment = (l as any).comentario;
                    const costoHa = (l as any).costo_aplicacion_ha;
                    return(
                      <div key={l.id} className="border-b border-[#1a2535] px-4 py-3.5 hover:bg-[#0f1923]/70 transition-colors">
                        <div className="flex items-start gap-3">
                          {/* Indicador color tipo */}
                          <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-1" style={{background:color}}/>
                          <div className="flex-1 min-w-0">
                            {/* Fila principal */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="tag" style={{background:color+"20",color}}>{l.tipo}</span>
                              <span className="text-xs text-gray-500">{l.fecha}</span>
                              {aplic&&aplic!=="—"&&<span className="text-xs text-gray-400">{APLIC_ICON[aplic]||""} {aplic}</span>}
                              {l.superficie_ha&&<span className="text-xs text-gray-500">{l.superficie_ha} ha</span>}
                            </div>
                            {/* Producto/Dosis */}
                            {(prod||l.descripcion)&&<div className="text-sm text-gray-200 mt-1.5 font-medium">{prod||l.descripcion}</div>}
                            {/* Comentario */}
                            {coment&&<div className="text-xs text-amber-300/80 mt-1 flex items-start gap-1.5"><span className="flex-shrink-0 mt-0.5">💬</span><span>{coment}</span></div>}
                            {/* Operario */}
                            {(l as any).operario&&(l as any).operario!==ingenieroNombre&&<div className="text-xs text-gray-600 mt-0.5">👤 {(l as any).operario}</div>}
                          </div>
                          {/* Costos */}
                          <div className="text-right flex-shrink-0">
                            {l.costo_total>0&&<div className="text-sm font-bold text-amber-400">${Number(l.costo_total).toLocaleString("es-AR")}</div>}
                            {costoHa>0&&<div className="text-xs text-amber-600">${costoHa}/ha</div>}
                            <div className="flex gap-1.5 mt-1.5 justify-end">
                              <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,producto_dosis:(l as any).producto_dosis||l.descripcion||"",aplicador:(l as any).aplicador||"",superficie_ha:String(l.superficie_ha),operario:l.operario,costo_aplicacion_ha:String((l as any).costo_aplicacion_ha||""),costo_total_lab:String(l.costo_total||""),comentario:(l as any).comentario||""});setShowFormLabor(true);}} className="text-amber-400 hover:text-amber-300 text-xs transition-colors">✏️</button>
                              <button onClick={()=>eliminarLabor(l.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
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

        {/* ══════════════════════════════════
            VISTA PRINCIPAL — LISTA LOTES
        ══════════════════════════════════ */}
        {!loteActivo&&(
          <div>
            {/* Tabs + acciones */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[{k:"lotes",l:"📋 Lotes"},{k:"margen",l:"📊 Margen"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as "lotes"|"margen")} className="px-4 py-2 rounded-xl text-xs font-bold border transition-all" style={{borderColor:tab===t.k?"#22c55e":"#1e2d3d",color:tab===t.k?"#22c55e":"#6b7280",background:tab===t.k?"rgba(34,197,94,0.1)":"transparent"}}>{t.l}</button>
              ))}
              <div className="flex-1"/>
              {/* Import multi-lote cuaderno desde vista principal */}
              <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");setLoteActivo(null);}} className="btn-amber px-3 py-2 rounded-xl text-xs font-bold">📥 Cuaderno multi-lote</button>
              <button onClick={()=>setShowImport(!showImport)} className="btn-amber px-3 py-2 rounded-xl text-xs font-bold">📥 Importar lotes</button>
              <button onClick={exportarLotes} className="btn-green px-3 py-2 rounded-xl text-xs font-bold">📤 Exportar</button>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}} className="btn-green px-4 py-2 rounded-xl text-xs font-bold">+ Nuevo lote</button>
            </div>

            {/* Import cuaderno multi-lote desde vista principal */}
            {showImportCuaderno&&!loteActivo&&(
              <div className="card p-4 mb-4 fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-amber-400 text-sm">📥 Importar Cuaderno Multi-Lote</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Cargá labores de varios lotes en un solo Excel</p>
                  </div>
                  <button onClick={()=>{setShowImportCuaderno(false);setCuadernoPreview([]);setCuadernoMsg("");}} className="text-gray-500 hover:text-gray-300">✕</button>
                </div>
                <div className="bg-[#1a2535] rounded-xl p-3 mb-3 text-xs text-gray-400">
                  <div className="font-bold text-gray-300 mb-1">Formato esperado:</div>
                  <div className="font-mono text-amber-400/80">LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</div>
                  <div className="mt-1 text-gray-600">Tipos: Siembra / Aplicación / Fertilización / Cosecha / Labranza / Control malezas / Recorrida</div>
                  <div className="text-gray-600">Aplicadores: Mosquito / Drone / Avión / Tractor / Manual</div>
                </div>
                {/* Ref SEPARADO para vista principal — no comparte con el del detalle de lote */}
                <input ref={importCuadernoMultiRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){setCuadernoPreview([]);setCuadernoMsg("");leerExcelCuaderno(f);}}}/>
                {cuadernoPreview.length===0
                  ?<button onClick={()=>importCuadernoMultiRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-[#1e2d3d] rounded-xl text-gray-500 text-sm w-full justify-center hover:border-amber-600/50 hover:text-amber-400 transition-colors">📁 Seleccionar archivo Excel</button>
                  :<div>
                    <div className="max-h-48 overflow-y-auto mb-3 rounded-xl border border-[#1e2d3d]">
                      <table className="w-full text-xs">
                        <thead className="bg-[#1a2535]"><tr>{["Lote","En sistema","Fecha","Ha","Tipo","Dosis / Producto","Aplic.","$/ha","Total"].map(h=><th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{cuadernoPreview.map((r,i)=>(
                          <tr key={i} className={`border-t border-[#1a2535] ${!r.lote_id?"opacity-40":""}`}>
                            <td className="px-3 py-2 font-bold text-amber-400 text-xs">{r.lote_nombre}</td>
                            <td className="px-3 py-2 text-xs">{r.lote_match?<span className="text-green-400 font-medium">✓ {r.lote_match}</span>:<span className="text-red-400">✗ No match</span>}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{r.fecha||"—"}</td>
                            <td className="px-3 py-2 text-gray-200 font-bold text-xs">{r.hectareas>0?r.hectareas:"—"}</td>
                            <td className="px-3 py-2 text-xs"><span className="px-1.5 py-0.5 rounded font-bold" style={{background:laborColor(r.tipo)+"20",color:laborColor(r.tipo)}}>{r.tipo}</span></td>
                            <td className="px-3 py-2 text-gray-200 max-w-[120px] truncate text-xs">{r.producto_dosis||"—"}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{r.aplicador||"—"}</td>
                            <td className="px-3 py-2 text-amber-400 text-xs">{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                            <td className="px-3 py-2 text-amber-300 font-bold text-xs">{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={confirmarImportCuaderno} className="btn-solid-green px-5 py-2.5 rounded-xl text-sm font-bold">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                      <button onClick={()=>{setCuadernoPreview([]);setCuadernoMsg("");importCuadernoMultiRef.current?.click();}} className="bg-[#1e2a3a] text-gray-400 px-4 py-2.5 rounded-xl text-sm transition-colors">Cambiar archivo</button>
                      {cuadernoPreview.filter(r=>!r.lote_id).length>0&&<span className="text-xs text-amber-500">⚠ {cuadernoPreview.filter(r=>!r.lote_id).length} sin match</span>}
                    </div>
                  </div>
                }
                {cuadernoMsg&&<p className={`mt-2 text-xs font-medium ${cuadernoMsg.startsWith("✅")?"text-green-400":cuadernoMsg.startsWith("❌")?"text-red-400":"text-amber-400"}`}>{cuadernoMsg}</p>}
              </div>
            )}

            {/* Import lotes */}
            {showImport&&(
              <div className="card p-4 mb-4 fade-in">
                <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-amber-400 text-sm">📥 Importar Lotes</h3><button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-gray-500 hover:text-gray-300">✕</button></div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelLotes(f);}}/>
                {importPreview.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-[#1e2d3d] rounded-xl text-gray-500 text-sm w-full justify-center hover:border-amber-600/50 hover:text-amber-400 transition-colors">📁 Seleccionar Excel</button>
                  :<div>
                    <div className="max-h-40 overflow-y-auto mb-3 rounded-xl border border-[#1e2d3d]">
                      <table className="w-full text-xs"><thead className="bg-[#1a2535]"><tr>{["Lote","Ha","Cultivo","Variedad","Acción"].map(h=><th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=><tr key={i} className="border-t border-[#1a2535]"><td className="px-3 py-2 text-gray-200 font-bold">{r.nombre}</td><td className="px-3 py-2 text-amber-400">{r.hectareas||"—"}</td><td className="px-3 py-2 text-green-400">{r.cultivo_completo||"—"}</td><td className="px-3 py-2 text-blue-400">{r.variedad||"—"}</td><td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${r.accion==="crear"?"bg-green-500/15 text-green-400":"bg-blue-500/15 text-blue-400"}`}>{r.accion==="crear"?"+ Crear":"✎ Actualizar"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={confirmarImportLotes} className="btn-solid-green px-4 py-2 rounded-xl text-sm font-bold">▶ Confirmar {importPreview.length} lotes</button>
                      <button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cambiar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p className={`mt-2 text-xs font-medium ${importMsg.startsWith("✅")?"text-green-400":"text-red-400"}`}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote&&!editandoLote&&(
              <div className="card p-4 mb-4 fade-in">
                <h3 className="font-bold text-green-400 text-sm mb-4">+ Nuevo Lote</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="El Norte..."/></div>
                  <div><label className={lCls}>Hectáreas *</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={guardarLote} className="btn-solid-green px-5 py-2.5 rounded-xl text-sm font-bold">Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-5 py-2.5 rounded-xl text-sm transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* KPIs + filtros + gráfico */}
            <div className="flex items-start gap-3 mb-4 flex-wrap">
              <div className="flex gap-2 flex-shrink-0">
                {[{l:"Lotes",v:String(lotesPrincipales.length),c:"#e5e7eb"},{l:"Ha",v:totalHa.toLocaleString("es-AR"),c:"#eab308"},{l:"MB Est.",v:"$"+Math.round(margenes.filter(m=>m.estado==="estimado").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#22c55e"},{l:"MB Real",v:"$"+Math.round(margenes.filter(m=>m.estado==="real").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#60a5fa"}].map(s=>(
                  <div key={s.l} className="card px-3 py-2.5 text-center" style={{minWidth:66}}><div className="text-xs text-gray-500">{s.l}</div><div className="text-sm font-bold mt-0.5" style={{color:s.c}}>{s.v}</div></div>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center flex-1">
                <button onClick={()=>setFilterCultivo("todos")} className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all" style={{borderColor:filterCultivo==="todos"?"#22c55e":"#1e2d3d",color:filterCultivo==="todos"?"#22c55e":"#6b7280",background:filterCultivo==="todos"?"rgba(34,197,94,0.1)":"transparent"}}>Todos ({lotesPrincipales.length})</button>
                {datosGrafico.map(d=>(
                  <button key={d.name} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)} className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all" style={{borderColor:filterCultivo===d.name?d.color:d.color+"40",background:filterCultivo===d.name?d.color+"20":"transparent",color:filterCultivo===d.name?d.color:d.color+"70"}}>{d.name} · {d.value}ha</button>
                ))}
              </div>
              {datosGrafico.length>0&&(
                <div className="card p-3 flex items-center gap-3 flex-shrink-0">
                  <div style={{width:80,height:80}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={36} innerRadius={16} dataKey="value" labelLine={false} label={renderPieLabel} paddingAngle={2}>
                        {datosGrafico.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(8,15,23,0.5)" strokeWidth={2}/>)}
                      </Pie><Tooltip formatter={(v: any,n: string)=>[String(v)+" ha",n]} contentStyle={{background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:"8px",fontFamily:"sans-serif",fontSize:"11px",color:"#e5e7eb"}}/></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5" style={{minWidth:110}}>
                    {datosGrafico.map((d,i)=>(
                      <div key={i} className="flex items-center gap-1.5 cursor-pointer" onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)}>
                        <div className="w-2 h-2 rounded-full" style={{background:d.color}}/>
                        <span className="text-xs flex-1 truncate" style={{color:d.color,maxWidth:72}}>{d.name}</span>
                        <span className="text-xs text-gray-500">{d.value}ha</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lista lotes */}
            {tab==="lotes"&&(
              lotesPrincipales.length===0?(
                <div className="text-center py-20 card">
                  <div className="text-5xl mb-4 opacity-20">🌾</div>
                  <p className="text-gray-600 mb-4">Sin lotes — agregá el primero</p>
                  <button onClick={()=>setShowFormLote(true)} className="btn-green px-4 py-2 rounded-xl text-sm font-bold">+ Agregar primer lote</button>
                </div>
              ):(
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {lotesPrincipales.filter(lote=>filterCultivo==="todos"||(getCultivoInfo(lote.cultivo,lote.cultivo_orden).label)===filterCultivo).map(lote=>{
                    const ci=getCultivoInfo(lote.cultivo||"",lote.cultivo_orden||"");
                    const mg=margenes.find(m=>m.lote_id===lote.id);
                    const labsCount=labores.filter(l=>l.lote_id===lote.id).length;
                    const labsCosto=labores.filter(l=>l.lote_id===lote.id).reduce((a,l)=>a+(l.costo_total||0),0);
                    const est=ESTADOS.find(e=>e.v===lote.estado);
                    const ultimaLabor=labores.filter(l=>l.lote_id===lote.id).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
                    return(
                      <div key={lote.id} className="lote-card rounded-2xl overflow-hidden" onClick={()=>setLoteActivo(lote)}>
                        <div className="flex items-center gap-3 p-4 border-b border-[#1a2535]">
                          <div className="w-1 self-stretch rounded-full" style={{background:ci.color}}/>
                          <span className="text-xl">{(ci as any).icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-100 uppercase truncate">{lote.nombre}</div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs font-bold" style={{color:ci.color}}>{ci.label}</span>
                              {est&&<span className="tag" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                            </div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminarLote(lote.id);}} className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0">✕</button>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center"><div className="text-gray-500">Ha</div><div className="font-bold text-amber-400 mt-0.5">{lote.hectareas}</div></div>
                          <div className="text-center"><div className="text-gray-500">Labores</div><div className="font-bold text-gray-200 mt-0.5">{labsCount}</div></div>
                          <div className="text-center"><div className="text-gray-500">MB/ha</div><div className="font-bold mt-0.5" style={{color:mg?(mg.margen_bruto_ha>=0?"#22c55e":"#ef4444"):"#4b5563"}}>{mg?"$"+Math.round(mg.margen_bruto_ha).toLocaleString("es-AR"):"—"}</div></div>
                        </div>
                        {/* Última labor */}
                        {ultimaLabor&&(
                          <div className="px-4 pb-3 flex items-center gap-2 text-xs">
                            <span className="tag" style={{background:laborColor(ultimaLabor.tipo)+"20",color:laborColor(ultimaLabor.tipo)}}>{ultimaLabor.tipo}</span>
                            <span className="text-gray-600">{ultimaLabor.fecha}</span>
                            {labsCosto>0&&<span className="ml-auto text-amber-600/80">${labsCosto.toLocaleString("es-AR")}</span>}
                          </div>
                        )}
                        {(lote.fecha_siembra||(lote.variedad||lote.hibrido))&&!ultimaLabor&&(
                          <div className="px-4 pb-3 flex gap-3 text-xs text-gray-600">
                            {lote.fecha_siembra&&<span>🗓 {lote.fecha_siembra}</span>}
                            {(lote.variedad||lote.hibrido)&&<span>🌱 {lote.variedad||lote.hibrido}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Margen general */}
            {tab==="margen"&&(
              <div className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1e2d3d] flex items-center justify-between">
                  <span className="font-bold text-gray-100">Margen Bruto por Lote</span>
                  <span className="text-xs text-gray-500">USD ${usdUsado}</span>
                </div>
                {margenes.length===0?<div className="text-center py-12 text-gray-600">Sin márgenes — entrá a un lote y cargá el margen</div>:(
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead><tr className="border-b border-[#1e2d3d]">{["Lote","Cultivo","Ha","Rend.","Ingreso","Costo","Margen","MB/ha","Estado"].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-[#1a2535]">
                        {margenes.map((m: any)=>{
                          const lote=lotes.find(l=>l.id===m.lote_id);
                          const ci=getCultivoInfo(m.cultivo||"",m.cultivo_orden||"");
                          return(<tr key={m.id} className="hover:bg-[#0f1923]/60 cursor-pointer transition-colors" onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                            <td className="px-4 py-3 font-bold text-gray-100">{lote?.nombre||"—"}</td>
                            <td className="px-4 py-3"><span className="tag" style={{background:ci.color+"20",color:ci.color}}>{(ci as any).icon} {ci.label}</span></td>
                            <td className="px-4 py-3 text-gray-400">{m.hectareas}</td>
                            <td className="px-4 py-3 text-amber-400">{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                            <td className="px-4 py-3 text-gray-200">${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-red-400">${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 font-bold" style={{color:m.margen_bruto>=0?"#22c55e":"#ef4444"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-amber-400">${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><span className="tag" style={{background:m.estado==="real"?"rgba(34,197,94,0.15)":"rgba(234,179,8,0.15)",color:m.estado==="real"?"#22c55e":"#eab308"}}>{m.estado==="real"?"✅ Real":"📋 Est."}</span></td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ PANEL VOZ ══ */}
      {vozPanel&&(
        <div className="fixed bottom-24 right-4 z-50 w-80 bg-[#0c1520] border border-[#1e2d3d] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d3d]">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-green-400 text-xs font-bold">🎤 ASISTENTE DE CAMPO</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-gray-500 hover:text-gray-300 transition-colors">✕</button>
          </div>
          <div className="px-4 pt-3 pb-2 min-h-20">
            {vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-6">{[1,2,3,4,5].map(i=><div key={i} className="w-1 rounded-full bg-red-400 animate-bounce" style={{height:(6+i*4)+"px",animationDelay:i*0.1+"s"}}/>)}</div><span className="text-red-400 text-sm">Escuchando...</span></div>}
            {vozEstado==="procesando"&&<p className="text-amber-400 text-sm animate-pulse">⚙️ Procesando...</p>}
            {vozRespuesta&&<div className="bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2.5 mb-2"><p className="text-gray-100 text-sm leading-relaxed">{vozRespuesta}</p></div>}
            {vozTranscripcion&&!vozRespuesta&&<p className="text-gray-500 text-xs italic">"{vozTranscripcion}"</p>}
            {vozEstado==="idle"&&!vozRespuesta&&!vozTranscripcion&&(
              <div className="space-y-1.5 py-1">
                {["Hoy siembra lote Grande N Coggiola","Aplicación glifosato lote Casa Sur","Cosecha lote 3 rendimiento 35 quintales"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-gray-600 hover:text-green-400 border border-[#1e2d3d] hover:border-green-800/50 px-3 py-2 rounded-lg transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#1e2d3d] pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribí o hablá..." className={`${iCls} flex-1 text-xs py-2`}/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} className="px-3 py-2 rounded-xl text-sm" style={{background:VOZ_COLOR[vozEstado]+"18",border:"1px solid "+VOZ_COLOR[vozEstado]+"50",color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-xl bg-green-600/15 border border-green-600/30 text-green-400 text-xs font-bold">→</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl transition-all"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado]+"80",color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",boxShadow:"0 4px 24px "+VOZ_COLOR[vozEstado]+"35"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="text-center text-[#0a2a1a] text-xs pb-4 pt-2">AgroGestión PRO · {productorNombre.toUpperCase()} · {modoCompartido?"Compartido":"Ingeniero"}</p>
      {ingenieroId&&<EscanerIA empresaId={ingenieroId}/>}
    </div>
  );
}

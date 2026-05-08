"use client";
// @ts-nocheck
// app/ingeniero/lotes/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// Singleton Supabase
let _sbLotes: any = null;
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

const TIPOS_LABOR = [
  "Siembra","Aplicación","Fertilización","Cosecha",
  "Labranza","Riego","Control malezas","Recorrida","Otro"
];
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


// ── ÍCONOS SVG MODERNOS POR CULTIVO ──
function CultivoIcon({cultivo, size=32}:{cultivo:string, size?:number}) {
  const l = cultivo.toLowerCase();
  const s = size;
  
  if(l.includes("girasol")) return (
    <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(24,20)">
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(0) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(45) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(90) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(135) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(180) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(225) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(270) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(315) translate(0,-13)"/>
      </g>
      <circle cx="24" cy="20" r="7.5" fill="#4E342E"/>
      <circle cx="24" cy="20" r="5" fill="#3E2723"/>
      <circle cx="22" cy="18" r="1.1" fill="#795548"/><circle cx="25.5" cy="18" r="1.1" fill="#795548"/>
      <circle cx="22" cy="21" r="1.1" fill="#795548"/><circle cx="25.5" cy="21" r="1.1" fill="#795548"/>
      <line x1="24" y1="27" x2="24" y2="46" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 38 Q17 34 15 28" fill="none" stroke="#4CAF50" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
  
  if(l.includes("trigo")||l.includes("cebada")||l.includes("arveja")||l.includes("carin")||l.includes("camel")) {
    const col = l.includes("cebada")?"#9C27B0":l.includes("arveja")?"#00796B":l.includes("carin")||l.includes("camel")?"#37474F":"#C8860A";
    const col2 = l.includes("cebada")?"#AB47BC":l.includes("arveja")?"#4DB6AC":l.includes("carin")||l.includes("camel")?"#607D8B":"#E4A829";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <line x1="24" y1="46" x2="24" y2="8" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <ellipse cx="24" cy="9" rx="3.5" ry="5.5" fill={col2}/>
        <line x1="24" y1="4" x2="24" y2="8" stroke={col2} strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="18" cy="14" rx="3" ry="5" fill={col2} transform="rotate(-22 18 14)"/>
        <ellipse cx="30" cy="14" rx="3" ry="5" fill={col2} transform="rotate(22 30 14)"/>
        <line x1="18" y1="10" x2="15" y2="5" stroke={col} strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="30" y1="10" x2="33" y2="5" stroke={col} strokeWidth="1.2" strokeLinecap="round"/>
        <ellipse cx="17" cy="20" rx="3" ry="5" fill={col} transform="rotate(-18 17 20)"/>
        <ellipse cx="31" cy="20" rx="3" ry="5" fill={col} transform="rotate(18 31 20)"/>
        <ellipse cx="18" cy="26" rx="2.8" ry="4.5" fill={col2} transform="rotate(-12 18 26)"/>
        <ellipse cx="30" cy="26" rx="2.8" ry="4.5" fill={col2} transform="rotate(12 30 26)"/>
      </svg>
    );
  }
  
  if(l.includes("sorgo")) {
    const col = l.includes("2")?"#A1887F":"#6D4C41";
    const col2 = l.includes("2")?"#D7CCC8":"#8D6E63";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <line x1="24" y1="46" x2="24" y2="20" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M24 36 Q15 32 13 24" fill="none" stroke="#66BB6A" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M24 36 Q33 32 35 24" fill="none" stroke="#81C784" strokeWidth="2.2" strokeLinecap="round"/>
        <ellipse cx="24" cy="13" rx="7" ry="9" fill={col2}/>
        <circle cx="20" cy="9" r="2.5" fill="#ECEFF1"/><circle cx="28" cy="9" r="2.5" fill="#ECEFF1"/>
        <circle cx="17" cy="13.5" r="2.5" fill={col2}/><circle cx="31" cy="13.5" r="2.5" fill={col2}/>
        <circle cx="20" cy="18" r="2.5" fill={col}/><circle cx="28" cy="18" r="2.5" fill={col}/>
        <circle cx="24" cy="7" r="2.8" fill="#ECEFF1"/>
      </svg>
    );
  }
  
  if(l.includes("maíz")||l.includes("maiz")) {
    const col = l.includes("2")?"#FFB300":"#FBC02D";
    const col2 = l.includes("2")?"#FF8F00":"#F57F17";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 12 Q31 8 35 14 Q29 16 24 27" fill="#66BB6A"/>
        <path d="M24 12 Q17 7 13 13 Q19 16 24 27" fill="#81C784"/>
        <ellipse cx="24" cy="28" rx="9" ry="13" fill={col}/>
        <circle cx="21" cy="21" r="2" fill={col2}/><circle cx="27" cy="21" r="2" fill={col2}/>
        <circle cx="21" cy="26" r="2" fill={col2}/><circle cx="27" cy="26" r="2" fill={col2}/>
        <circle cx="21" cy="31" r="2" fill={col2}/><circle cx="27" cy="31" r="2" fill={col2}/>
        <circle cx="24" cy="18.5" r="2" fill={col}/><circle cx="24" cy="23.5" r="2" fill={col}/>
        <circle cx="24" cy="28.5" r="2" fill={col}/><circle cx="24" cy="33.5" r="2" fill={col}/>
        <line x1="24" y1="41" x2="24" y2="47" stroke="#E65100" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  
  // Soja (1ra verde, 2da celeste, default verde)
  const esSoja2 = l.includes("2");
  const colSoja = esSoja2?"#0288d1":"#4CAF50";
  const colSoja2 = esSoja2?"#29b6f6":"#66BB6A";
  const colSoja3 = esSoja2?"#0277bd":"#43A047";
  const colSojaH = esSoja2?"#01579b":"#2E7D32";
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="29" r="11" fill={colSoja} opacity="0.92"/>
      <circle cx="16" cy="21" r="9" fill={colSoja2}/>
      <circle cx="32" cy="21" r="9" fill={colSoja3}/>
      <circle cx="24" cy="17" r="6" fill={colSoja2} opacity="0.8"/>
      <line x1="24" y1="40" x2="24" y2="46" stroke={colSojaH} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="44" x2="19" y2="47" stroke={colSojaH} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
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
  // ── Estado descuento de insumos ──
  const [showDescuento, setShowDescuento] = useState(false);
  const [insumosStock, setInsumosStock] = useState<InsumoStock[]>([]);
  const [descuentoItems, setDescuentoItems] = useState<DescuentoItem[]>([]);
  const [laborPendiente, setLaborPendiente] = useState<any>(null);

  const getSB = () => {
    if (!_sbLotes) {
      _sbLotes = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    return _sbLotes;
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = getSB();
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
    const sb = getSB();
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
    const sb = getSB();
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
    const sb = getSB();
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
    const sb = getSB();
    await sb.from("lotes").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
    setLoteActivo(null);
  };


  // Mapear aplicador al valor que acepta el constraint de lote_labores
  const mapAplicador = (v: string): string|null => {
    const s = (v||"").toLowerCase().trim();
    if (s.includes("avion")||s.includes("avión")) return "avion";
    if (s.includes("drone")||s.includes("dron"))  return "drone";
    if (s.includes("alquil"))                     return "alquilado";
    if (s.includes("propio")||s.includes("tractor")||s.includes("mosquito")||s.includes("manual")) return "propio";
    return null;
  };

  // ── CRUD LABORES (cuaderno mejorado) ──

  // Parsear descripción → pares (insumo del stock, cantidad total)
  // Soporta todos los formatos reales:
  //   "GLIFOSATO 2 LITROS + 1,5 LT 2,4D EHE + 10 GR METSULFURON"
  //   "2 LT GLIFO + 1,5 LT 2,4D + 300 CC HALOXIFOP"
  //   "Glifosato 4L/ha + Metsulfuron 10gr/ha"
  const parsearInsumosDeDescripcion = (desc: string, ha: number): DescuentoItem[] => {
    if (!desc || !insumosStock.length) return [];

    // Regex: captura cantidad+unidad en todos los formatos (con/sin espacio, con/sin /ha)
    const CANT_RE = /([0-9]+[,.]?[0-9]*)\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)(?=[\s\/+\-,]|$)/gi;

    // Dividir por "+" → un segmento por insumo
    const segmentos = desc.split(/\s*\+\s*/);
    const segsParseados: Array<{palabras: string[]; cantHa: number}> = [];

    for (const seg of segmentos) {
      const s = seg.trim();
      if (!s) continue;
      CANT_RE.lastIndex = 0;
      const m = CANT_RE.exec(s);
      if (!m) continue;
      const cantHa = parseFloat(m[1].replace(',', '.'));
      // Nombre = todo lo que queda al quitar la cantidad+unidad+/ha
      const nombreSeg = s.replace(/[0-9]+[,.]?[0-9]*\s*(litros?|lts?|lt|cc|ml|kg|grs?|gr|g|l)\s*(\/ha)?/gi, '').trim();
      const palabras = nombreSeg.toLowerCase().split(/[\s,]+/).filter((p: string) => p.length >= 2);
      segsParseados.push({ palabras, cantHa });
    }

    // Para cada insumo del stock, buscar el segmento que mejor matchea por nombre
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
        for (const ip of insPals)
          if (seg.palabras.some((sp: string) => sp.includes(ip) || ip.includes(sp))) score++;
        for (const sp of seg.palabras)
          if (sp.length >= 3 && insNorm.includes(sp)) score++;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      if (bestIdx < 0 || bestScore === 0) continue;

      usados.add(bestIdx);
      const cantTotal = Math.round(segsParseados[bestIdx].cantHa * ha * 100) / 100;
      const ppp = ins.precio_ppp || ins.precio_unitario || 0;
      items.push({
        insumo_id: ins.id,
        nombre: ins.nombre,
        unidad: ins.unidad,
        cantidad_sugerida: cantTotal,
        cantidad_ajustada: cantTotal,
        precio_ppp: ppp,
        costo_total: Math.round(cantTotal * ppp),
        seleccionado: true,
      });
    }
    return items;
  };

  const abrirPanelDescuento = async (laborPayload: any, ha: number, desc: string) => {
    const sb = getSB();
    const [{ data: prods }, { data: fifo }] = await Promise.all([
      sb.from("insumos_productos").select("id,nombre,unidad,categoria").eq("empresa_id", empresaId).eq("activo", true).order("nombre"),
      sb.from("insumos_lotes_fifo").select("*").eq("empresa_id", empresaId).order("fecha_compra", { ascending: true }),
    ]);
    const prodsList = (prods ?? []) as any[];
    const fifoList  = (fifo  ?? []) as any[];
    setInsumosStock(prodsList.map((p: any) => ({
      id: p.id, nombre: p.nombre, unidad: p.unidad, categoria: p.categoria,
      cantidad: fifoList.filter((l: any) => l.producto_id === p.id).reduce((a: number, l: any) => a + Number(l.cantidad_restante), 0),
      precio_ppp: (() => {
        const ls = fifoList.filter((l: any) => l.producto_id === p.id && l.cantidad_restante > 0 && l.precio_usd > 0);
        const tot = ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante), 0);
        return tot > 0 ? ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante) * Number(l.precio_usd), 0) / tot : 0;
      })(),
      precio_unitario: 0,
    })));
    const sugeridos = parsearInsumosDeDescripcion(desc, ha);
    if (sugeridos.length === 0) {
      setDescuentoItems(prodsList.map((p: any) => {
        const ls = fifoList.filter((l: any) => l.producto_id === p.id && l.cantidad_restante > 0 && l.precio_usd > 0);
        const tot = ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante), 0);
        const ppp = tot > 0 ? ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante) * Number(l.precio_usd), 0) / tot : 0;
        return { insumo_id: p.id, nombre: p.nombre, unidad: p.unidad, cantidad_sugerida: 0, cantidad_ajustada: 0, precio_ppp: ppp, costo_total: 0, seleccionado: false };
      }));
    } else {
      setDescuentoItems(sugeridos.map((item: any) => {
        const ls = fifoList.filter((l: any) => l.producto_id === item.insumo_id && l.cantidad_restante > 0 && l.precio_usd > 0);
        const tot = ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante), 0);
        const ppp = tot > 0 ? ls.reduce((a: number, l: any) => a + Number(l.cantidad_restante) * Number(l.precio_usd), 0) / tot : 0;
        return { ...item, precio_ppp: ppp, costo_total: item.cantidad_ajustada * ppp };
      }));
    }
    setLaborPendiente({ ...laborPayload, _fifo_list: fifoList });
    setShowDescuento(true);
  };
      

 const confirmarDescuento = async () => {
    if (!laborPendiente || !empresaId) return;
    const sb = getSB();
    const fifoList = laborPendiente._fifo_list || [];
    const itemsSeleccionados = descuentoItems.filter(d => d.seleccionado && d.cantidad_ajustada > 0);
    let costoInsumosTotal = 0;
    console.log("FIFO descuento - items:", JSON.stringify(itemsSeleccionados.map(i=>({id:i.insumo_id,nombre:i.nombre,cant:i.cantidad_ajustada}))));
    console.log("FIFO list productos:", JSON.stringify([...new Set(fifoList.map((l:any)=>l.producto_id))]));
    for (const item of itemsSeleccionados) {
     const lotesProd = fifoList
        .filter((l: any) => l.producto_id === item.insumo_id && Number(l.cantidad_restante) > 0)
        .sort((a: any, b: any) => a.fecha_compra.localeCompare(b.fecha_compra));
      let restante = item.cantidad_ajustada;
      let costoItem = 0;
      const fifoDetalle: any[] = [];
      for (const lote of lotesProd) {
        if (restante <= 0) break;
        const usar = Math.min(restante, Number(lote.cantidad_restante));
        const pUsd = Number(lote.precio_usd || 0);
        costoItem += usar * pUsd;
        fifoDetalle.push({ lote_id: lote.id, cantidad: usar, precio_usd: pUsd });
        await sb.from("insumos_lotes_fifo").update({
          cantidad_restante: Number(lote.cantidad_restante) - usar
        }).eq("id", lote.id);
        restante -= usar;
      }
      if (restante > 0) {
        await sb.from("insumos_lotes_fifo").insert({
          empresa_id: empresaId, producto_id: item.insumo_id,
          fecha_compra: laborPendiente.fecha || new Date().toISOString().split("T")[0],
          cantidad_original: -restante, cantidad_restante: -restante,
          precio_unitario: 0, moneda: "ARS", tc_usado: 1, precio_usd: 0,
          observaciones: "Stock negativo — uso sin compra registrada",
        });
      }
      costoInsumosTotal += costoItem;
      await sb.from("insumos_movimientos").insert({
        empresa_id: empresaId,
        producto_id: item.insumo_id,
        fecha: laborPendiente.fecha || new Date().toISOString().split("T")[0],
        tipo: "uso", cantidad: item.cantidad_ajustada,
        precio_usd: item.cantidad_ajustada > 0 ? costoItem / item.cantidad_ajustada : 0,
        costo_total_usd: costoItem,
        lote_ids: [laborPendiente.lote_id],
        fifo_detalle: JSON.stringify(fifoDetalle),
        observaciones: `Labor: ${laborPendiente.tipo} — ${laborPendiente.descripcion || ""}`,
        origen: "ingeniero",
      });
    }
    if (costoInsumosTotal > 0 && laborPendiente._labor_id) {
      await sb.from("lote_labores").update({
        costo_insumos_usd: costoInsumosTotal,
        costo_total_usd: (laborPendiente.costo_total_usd || 0) + costoInsumosTotal,
      }).eq("id", laborPendiente._labor_id);
    }
    if (costoInsumosTotal > 0 && laborPendiente.lote_id) {
      const loteObj = lotes.find((l: any) => l.id === laborPendiente.lote_id);
      await sb.from("mb_carga_items").insert({
        empresa_id: empresaId, campana_id: campanaActiva,
        lote_ids: [laborPendiente.lote_id],
        grupo: "insumos", subgrupo: "INSUMOS", concepto: "INSUMOS",
        articulo: itemsSeleccionados.map((i: any) => i.nombre).join(", "),
        descripcion: `${laborPendiente.tipo}: ${laborPendiente.descripcion || ""}`,
        fecha: laborPendiente.fecha || new Date().toISOString().split("T")[0],
        moneda: "USD", monto_original: costoInsumosTotal,
        tc_usado: 1, monto_usd: costoInsumosTotal,
        unidad: loteObj && loteObj.hectareas > 0 ? "ha" : "total",
        origen: "insumo_fifo",
      });
      if ((laborPendiente.costo_total_usd || 0) > 0) {
        await sb.from("mb_carga_items").insert({
          empresa_id: empresaId, campana_id: campanaActiva,
          lote_ids: [laborPendiente.lote_id],
          grupo: "labranzas", subgrupo: laborPendiente.tipo || "APLICACIÓN",
          concepto: laborPendiente.tipo || "APLICACIÓN",
          articulo: laborPendiente.tipo_aplicacion || "",
          descripcion: laborPendiente.descripcion || "",
          fecha: laborPendiente.fecha || new Date().toISOString().split("T")[0],
          moneda: "USD", monto_original: laborPendiente.costo_total_usd,
          tc_usado: 1, monto_usd: laborPendiente.costo_total_usd,
          unidad: loteObj && loteObj.hectareas > 0 ? "ha" : "total",
          origen: "labor",
        });
      }
    }
    msg(`✅ Stock descontado FIFO — ${itemsSeleccionados.length} insumos · U$S ${costoInsumosTotal.toFixed(2)}`);
    setShowDescuento(false);
    setLaborPendiente(null);
    setDescuentoItems([]);
    await fetchLotes(empresaId, campanaActiva);
  };
      

  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = getSB();
    const ha = Number(form.superficie_ha ?? loteActivo.hectareas ?? 0);
    const costoTotal = form.costo_total_lab
      ? Number(form.costo_total_lab)
      : form.costo_aplicacion_ha
        ? Number(form.costo_aplicacion_ha) * ha
        : 0;
    const desc = form.producto_dosis || form.descripcion_lab || "";
    const payload: Record<string,any> = {
      empresa_id:           empresaId,
      lote_id:              loteActivo.id,
      tipo:                 form.tipo_lab ?? "Aplicación",
      descripcion:          desc,
      productos:            form.producto_dosis || "",
      dosis:                form.producto_dosis || "",
      fecha:                form.fecha_lab ?? new Date().toISOString().split("T")[0],
      metodo_carga:         "manual",
      metodo_entrada:       "manual",
      hectareas_trabajadas: ha,
      tipo_aplicacion:      mapAplicador(form.aplicador || "") || null,
      precio_aplicacion_ha: Number(form.costo_aplicacion_ha ?? 0),
      costo_total_usd:      costoTotal,
      estado_carga:         "confirmado",
      cargado_por_rol:      "ingeniero",
    };
    let laborId: string | null = null;
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id", editandoLabor);
      laborId = editandoLabor;
      setEditandoLabor(null);
    } else {
      const { data: nueva } = await sb.from("lote_labores").insert(payload).select("id").single();
      laborId = nueva?.id ?? null;
    }
    if (costoTotal > 0) await actualizarCostoLaboresEnMB(loteActivo.id, costoTotal);
    msg("✅ Labor guardada");
    await fetchLotes(empresaId, campanaActiva);
    // Notificar al productor si es Aplicación, Fertilización o Siembra
    if (["Aplicación","Fertilización","Siembra"].includes(form.tipo_lab ?? "")) {
      try {
        const sb2 = getSB();
        const tipoEmoji = form.tipo_lab==="Siembra"?"🌱":form.tipo_lab==="Fertilización"?"💊":"🌿";
        await sb2.from("notificaciones").insert({
          empresa_id: empresaId,
          tipo: "labor",
          titulo: `${tipoEmoji} ${form.tipo_lab} registrada — ${loteActivo?.nombre}`,
          mensaje: `${ingenieroNombre} registró una ${form.tipo_lab?.toLowerCase()} en ${loteActivo?.nombre} (${ha} ha).${form.producto_dosis ? " Producto: "+form.producto_dosis+"." : ""}${costoTotal>0 ? " Costo: $"+Number(costoTotal).toLocaleString("es-AR")+"." : ""}`,
          url_destino: "/productor/lotes",
          leida: false,
        });
      } catch {}
    }

    setShowFormLabor(false); setForm({});
    // Abrir panel de descuento de insumos (si es Aplicación o Fertilización)
    const tipoLabor = form.tipo_lab ?? "Aplicación";
    if (["Aplicación","Fertilización","Siembra"].includes(tipoLabor) && laborId) {
      await abrirPanelDescuento({ ...payload, _labor_id: laborId }, ha, desc);
    }
  };

  const actualizarCostoLaboresEnMB = async (loteId: string, costoNuevo: number) => {
    const sb = getSB();
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
    const sb = getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
  };

  // ── MARGEN ──
  const guardarMargen = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = getSB();
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
      const sb = getSB();
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
    const sb = getSB();
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
    const sb = getSB();
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
        metodo_carga:         "excel",
        metodo_entrada:       "excel",
        hectareas_trabajadas: l.hectareas || 0,
        tipo_aplicacion:      mapAplicador(l.aplicador || "") || null,
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
  const iCls="inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls="block text-[10px] font-bold uppercase tracking-wider text-[#4a6a8a] mb-1.5";

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
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,
        background:"rgba(255,255,255,0.70)",backdropFilter:"blur(16px)",borderRadius:20,padding:"28px 36px",
        border:"1.5px solid rgba(255,255,255,0.90)",boxShadow:"0 8px 32px rgba(20,80,160,0.15)"}}>
        <div style={{width:36,height:36,border:"3px solid #1565c0",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1e3a5f",fontWeight:700,fontSize:14}}>Cargando lotes...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",
      backgroundAttachment:"scroll",position:"relative"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes shine{0%{left:-60%}100%{left:130%}}

        /* ── CARD ── */
        .card{
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);
          border-radius:18px;
          box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.95);
          position:relative;overflow:hidden;
        }
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);border-radius:18px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);border-radius:18px 18px 0 0;pointer-events:none;z-index:1;}
        .card>*{position:relative;z-index:2;}

        /* ── HEADER ── */
        .page-header{
          background-image:url('/FON.png');background-size:cover;background-position:top center;
          border-bottom:1.5px solid rgba(255,255,255,0.75);
          box-shadow:0 2px 16px rgba(20,80,160,0.12);
          position:sticky;top:0;z-index:20;
          position:relative;
        }
        .page-header::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.70);pointer-events:none;z-index:0;}
        .page-header>*{position:relative;z-index:1;}

        /* ── LOTE CARD ── */
        .lote-card{
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.88);border-top:2px solid rgba(255,255,255,1);
          border-radius:18px;cursor:pointer;
          box-shadow:0 4px 18px rgba(20,80,160,0.10);
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          position:relative;overflow:hidden;
        }
        .lote-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);border-radius:18px;pointer-events:none;z-index:0;}
        .lote-card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.38) 0%,transparent 100%);border-radius:18px 18px 0 0;pointer-events:none;z-index:1;}
        .lote-card>*{position:relative;z-index:2;}
        .lote-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(20,80,160,0.18);}

        /* ── INPUTS ── */
        .inp{
          width:100%;background:rgba(255,255,255,0.72);
          border:1.5px solid rgba(180,210,240,0.55);border-top:1.5px solid rgba(255,255,255,0.90);
          border-radius:11px;padding:9px 12px;
          font-size:13px;font-family:'DM Sans',system-ui;color:#1a2a4a;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.05);transition:all 0.18s;
        }
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.95);border-color:rgba(25,118,210,0.42);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}

        /* ── BOTONES ── */
        .btn-g{
          background:rgba(255,255,255,0.75);border:1.5px solid rgba(255,255,255,0.95);
          border-radius:12px;color:#166534;font-weight:700;font-size:12px;
          padding:7px 14px;cursor:pointer;
          box-shadow:0 2px 8px rgba(22,101,52,0.10);transition:all 0.18s ease;
        }
        .btn-g:hover{background:rgba(255,255,255,0.95);transform:translateY(-1px);}

        .btn-a{
          background:rgba(255,255,255,0.75);border:1.5px solid rgba(255,255,255,0.95);
          border-radius:12px;color:#92400e;font-weight:700;font-size:12px;
          padding:7px 14px;cursor:pointer;
          box-shadow:0 2px 8px rgba(146,64,14,0.08);transition:all 0.18s ease;
        }
        .btn-a:hover{background:rgba(255,255,255,0.95);transform:translateY(-1px);}

        .btn-b{
          background:rgba(255,255,255,0.75);border:1.5px solid rgba(255,255,255,0.95);
          border-radius:12px;color:#1e3a8a;font-weight:700;font-size:12px;
          padding:7px 14px;cursor:pointer;
          box-shadow:0 2px 8px rgba(30,58,138,0.08);transition:all 0.18s ease;
        }
        .btn-b:hover{background:rgba(255,255,255,0.95);transform:translateY(-1px);}

        .btn-solid{
          background-image:url('/AZUL.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(100,180,255,0.45);border-top:2px solid rgba(180,220,255,0.65);
          border-radius:12px;color:white;font-weight:800;font-size:13px;
          padding:9px 18px;cursor:pointer;
          box-shadow:0 4px 14px rgba(25,118,210,0.38);transition:all 0.18s ease;
          text-shadow:0 1px 3px rgba(0,40,120,0.35);position:relative;overflow:hidden;
        }
        .btn-solid::before{content:"";position:absolute;top:0;left:0;right:0;height:45%;background:linear-gradient(180deg,rgba(255,255,255,0.20) 0%,transparent 100%);border-radius:12px 12px 0 0;pointer-events:none;}
        .btn-solid>*{position:relative;}
        .btn-solid:hover{transform:translateY(-2px);box-shadow:0 7px 20px rgba(25,118,210,0.50);filter:brightness(1.08);}

        .btn-cancel{
          background:rgba(255,255,255,0.65);border:1.5px solid rgba(255,255,255,0.88);
          border-radius:12px;color:#4a6a8a;font-weight:600;font-size:13px;
          padding:9px 16px;cursor:pointer;transition:all 0.18s ease;
        }
        .btn-cancel:hover{background:rgba(255,255,255,0.92);}

        /* ── TABS ── */
        .tab-btn{
          padding:8px 18px;border-radius:12px;font-size:13px;font-weight:700;
          cursor:pointer;transition:all 0.18s ease;
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.88);
          position:relative;overflow:hidden;
        }
        .tab-btn::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);border-radius:12px;pointer-events:none;transition:background 0.18s;}
        .tab-btn>*,.tab-btn span{position:relative;z-index:1;}
        .tab-btn-text{position:relative;z-index:1;color:#1e3a5f;}
        .tab-btn:hover::before{background:rgba(255,255,255,0.82);}
        .tab-active{border:1.5px solid rgba(100,180,255,0.42)!important;}
        .tab-active::before{background:rgba(25,118,210,0.12)!important;}
        .tab-active .tab-btn-text{color:#0d47a1!important;font-weight:800!important;}

        /* ── VOZ BTN ── */
        .voz-btn{
          display:flex;align-items:center;gap:6px;
          padding:8px 14px;border-radius:12px;font-weight:700;font-size:13px;
          cursor:pointer;transition:all 0.18s ease;
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.88);
          position:relative;overflow:hidden;
        }
        .voz-btn::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.55);border-radius:12px;pointer-events:none;}
        .voz-btn>*{position:relative;z-index:1;}

        /* ── TAG ── */
        .tag{display:inline-flex;align-items:center;border-radius:8px;font-size:11px;font-weight:700;padding:3px 9px;}

        /* ── DESCUENTO PANEL ── */
        .descuento-panel{
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border-radius:22px;overflow:hidden;
          box-shadow:0 20px 60px rgba(20,80,160,0.25);
          border:1.5px solid rgba(255,255,255,0.90);
          position:relative;
        }
        .descuento-panel::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.88);pointer-events:none;z-index:0;}
        .descuento-panel>*{position:relative;z-index:1;}

        /* ── MISC ── */
        .fade-in{animation:fadeIn 0.2s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.22);border-radius:3px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.5}
        select option{background:white;color:#1a2a4a;}
      `}</style>

      {/* ══ HEADER ══ */}
      <div className="page-header">
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/ingeniero?s=productores"}
            style={{color:"#1565c0",fontSize:13,fontWeight:700,background:"none",border:"none",cursor:"pointer",
              display:"flex",alignItems:"center",gap:4}}>
            ← {loteActivo?"Lotes":"Mis Productores"}
          </button>
          <div style={{flex:1}}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{productorNombre}</div>
            <div style={{fontSize:11,fontWeight:700,color:modoCompartido?"#16a34a":"#b45309",marginTop:1}}>
              {modoCompartido?"🔗 Datos compartidos":"📋 Datos del ingeniero"}
            </div>
          </div>
          <select value={campanaActiva}
            onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);await fetchLotes(empresaId,e.target.value);}}
            className="inp" style={{width:"auto",padding:"6px 10px",fontSize:12,fontWeight:700,color:"#1565c0",flexShrink:0}}>
            {campanasSinDup.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
          </select>
          <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
            className="voz-btn" style={{flexShrink:0,color:VOZ_COLOR[vozEstado]}}>
            <span>{VOZ_ICON[vozEstado]}</span>
            <span className="hidden sm:inline" style={{fontSize:12}}>VOZ</span>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 14px 80px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msgExito&&(
          <div className="fade-in card" style={{marginBottom:12,padding:"10px 14px",fontSize:13,fontWeight:700,
            display:"flex",justifyContent:"space-between",alignItems:"center",
            color:msgExito.startsWith("✅")?"#166534":"#dc2626",
            background:msgExito.startsWith("✅")?"rgba(220,252,231,0.85)":"rgba(254,226,226,0.85)",
            borderColor:msgExito.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}}>
            {msgExito}
            <button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
          </div>
        )}

        {/* ══ PANEL DESCUENTO ══ */}
        {showDescuento&&(
          <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:16,background:"rgba(180,210,240,0.40)",backdropFilter:"blur(8px)"}}>
            <div className="descuento-panel" style={{width:"100%",maxWidth:640}}>
              <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(25,118,210,0.12)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <h3 style={{fontSize:13,fontWeight:800,color:"#1565c0",margin:0}}>🧪 DESCONTAR INSUMOS DEL STOCK</h3>
                  <p style={{fontSize:11,color:"#4a6a8a",marginTop:2}}>Labor: {laborPendiente?.tipo} — {laborPendiente?.descripcion?.substring(0,40)}</p>
                </div>
                <button onClick={()=>{setShowDescuento(false);setLaborPendiente(null);setDescuentoItems([]);}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:20}}>✕</button>
              </div>
              <div style={{padding:16,maxHeight:300,overflowY:"auto"}}>
                {descuentoItems.length===0?(
                  <p style={{textAlign:"center",color:"#6b8aaa",fontSize:13,padding:"24px 0"}}>Sin insumos en stock para este productor</p>
                ):(
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(25,118,210,0.10)"}}>
                      {["✓","INSUMO","CANTIDAD","UNIDAD","PPP","COSTO"].map(h=>(
                        <th key={h} style={{textAlign:h==="CANTIDAD"||h==="PPP"||h==="COSTO"?"right":"left",padding:"6px 10px",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{descuentoItems.map((item,i)=>(
                      <tr key={item.insumo_id} style={{borderBottom:"1px solid rgba(25,118,210,0.07)",opacity:item.seleccionado?1:0.5}}>
                        <td style={{padding:"8px 10px"}}>
                          <button onClick={()=>{const u=[...descuentoItems];u[i]={...u[i],seleccionado:!u[i].seleccionado};setDescuentoItems(u);}}
                            style={{width:18,height:18,borderRadius:5,border:`1.5px solid ${item.seleccionado?"#1565c0":"#aab8c8"}`,
                              background:item.seleccionado?"#1565c0":"transparent",color:"white",fontSize:11,
                              display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                            {item.seleccionado?"✓":""}
                          </button>
                        </td>
                        <td style={{padding:"8px 10px",fontWeight:700,color:"#0d2137"}}>{item.nombre}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>
                          <input type="number" value={item.cantidad_ajustada||""}
                            onChange={e=>{const c=parseFloat(e.target.value)||0;const u=[...descuentoItems];u[i]={...u[i],cantidad_ajustada:c,costo_total:c*u[i].precio_ppp,seleccionado:c>0};setDescuentoItems(u);}}
                            className="inp" style={{width:80,padding:"5px 8px",textAlign:"right",fontSize:12}} placeholder="0"/>
                        </td>
                        <td style={{padding:"8px 10px",color:"#6b8aaa"}}>{item.unidad}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#b45309"}}>{item.precio_ppp>0?`$${item.precio_ppp.toFixed(2)}`:"—"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:item.costo_total>0?"#0D47A1":"#aab8c8"}}>
                          {item.costo_total>0?`$${Math.round(item.costo_total).toLocaleString("es-AR")}`:"—"}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
              <div style={{padding:"12px 18px",borderTop:"1px solid rgba(25,118,210,0.10)",background:"rgba(240,248,255,0.50)"}}>
                {descuentoItems.filter(d=>d.seleccionado&&d.cantidad_ajustada>0).length>0&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    marginBottom:12,padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.08)",
                    border:"1px solid rgba(25,118,210,0.15)"}}>
                    <span style={{fontSize:12,color:"#4a6a8a",fontWeight:600}}>{descuentoItems.filter(d=>d.seleccionado).length} insumos seleccionados</span>
                    <span style={{fontSize:13,fontWeight:800,color:"#0D47A1"}}>Total: ${Math.round(descuentoItems.filter(d=>d.seleccionado).reduce((a,d)=>a+d.costo_total,0)).toLocaleString("es-AR")}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={confirmarDescuento} className="btn-solid" style={{flex:1,padding:"11px 16px"}}>✓ Confirmar y descontar</button>
                  <button onClick={()=>{setShowDescuento(false);setLaborPendiente(null);setDescuentoItems([]);}} className="btn-cancel" style={{padding:"11px 18px"}}>Omitir</button>
                </div>
                <p style={{fontSize:11,color:"#6b8aaa",textAlign:"center",marginTop:8}}>El costo PPP se sumará al Margen Bruto del lote</p>
              </div>
            </div>
          </div>
        )}

        {/* ══ DETALLE LOTE ══ */}
        {loteActivo&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Header lote */}
            <div className="card" style={{padding:16}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:4,alignSelf:"stretch",borderRadius:4,background:cultivoActivoInfo?.color,flexShrink:0}}/>
                  <CultivoIcon cultivo={loteActivo?.cultivo||""} size={28}/>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{loteActivo.nombre}</h2>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      <span style={{fontWeight:800,fontSize:14,color:"#b45309"}}>{loteActivo.hectareas} ha</span>
                      <span className="tag" style={{background:(cultivoActivoInfo?.color??"#6b7280")+"18",color:cultivoActivoInfo?.color??"#6b7280",border:`1px solid ${cultivoActivoInfo?.color??"#6b7280"}30`}}>{(cultivoActivoInfo?.label||"Sin cultivo").toUpperCase()}</span>
                      {(()=>{const e=ESTADOS.find(x=>x.v===loteActivo.estado);return e?<span className="tag" style={{background:e.c+"18",color:e.c,border:`1px solid ${e.c}30`}}>{e.l}</span>:null;})()}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>{const ci3=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);setEditandoLote(loteActivo.id);setForm({nombre:loteActivo.nombre,hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",cultivo_key:ci3?ci3.cultivo+"|"+ci3.orden:"soja|1ra",fecha_siembra:loteActivo.fecha_siembra||"",fecha_cosecha:loteActivo.fecha_cosecha||"",variedad:loteActivo.variedad||loteActivo.hibrido||"",rendimiento_esperado:String(loteActivo.rendimiento_esperado||""),estado:loteActivo.estado||"planificado",observaciones:loteActivo.observaciones||""});setShowFormLote(true);}} className="btn-a">✏️ Editar</button>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="btn-g">+ Labor</button>
                  <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);const labsTotal=labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(Math.max(mg.costo_labores,labsTotal)),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});else setForm({mg_labores:String(labsTotal)});setShowFormMargen(true);}} className="btn-b">📊 Margen</button>
                  {(loteActivo.estado==="cosechado"||!!loteActivo.fecha_cosecha||loteActivo.rendimiento_real>0)&&admite2do&&segundosCultivos.length===0&&(
                    <button onClick={()=>{setForm({es_segundo_cultivo:"true",lote_base_id:loteActivo.id,nombre:loteActivo.nombre+" 2DO",hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",estado:"planificado",cultivo_key:"soja|2da"});setEditandoLote(null);setShowFormLote(true);}} className="btn-g">🔄 2º Cultivo</button>
                  )}
                  <button onClick={()=>eliminarLote(loteActivo.id)} style={{background:"none",border:"1px solid rgba(220,38,38,0.22)",borderRadius:10,color:"#dc2626",fontSize:13,padding:"7px 12px",cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            </div>

            {/* Stats 2x4 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {[
                {l:"Tenencia",v:loteActivo.tipo_tenencia||"—",c:"#b45309"},
                {l:"Partido",v:loteActivo.partido||"—",c:"#4a6a8a"},
                {l:usaHibrido?"Híbrido":"Variedad",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#166534"},
                {l:"F. Siembra",v:loteActivo.fecha_siembra||"Sin fecha",c:"#1565c0"},
                {l:"F. Cosecha",v:loteActivo.fecha_cosecha||"—",c:"#7c3aed"},
                {l:"Rend. Esp.",v:loteActivo.rendimiento_esperado?loteActivo.rendimiento_esperado+" tn/ha":"—",c:"#b45309"},
                {l:"Margen Bruto",v:margenLote?"$"+Math.round(margenLote.margen_bruto).toLocaleString("es-AR"):"—",c:margenLote&&margenLote.margen_bruto>=0?"#166534":"#dc2626"},
                {l:"MB/ha",v:margenLote?"$"+Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")+"/ha":"—",c:"#b45309"},
              ].map(s=>(
                <div key={s.l} className="card" style={{padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,letterSpacing:0.8}}>{s.l}</div>
                  <div style={{fontSize:13,fontWeight:800,marginTop:3,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Form editar lote */}
            {showFormLote&&editandoLote&&(
              <div className="card fade-in" style={{padding:16}}>
                <h3 style={{fontSize:13,fontWeight:800,color:"#b45309",marginBottom:14,textTransform:"uppercase"}}>✏️ Editar Lote</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Hectáreas</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className="inp" style={{padding:"8px 12px"}}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{usaHibrido?"Híbrido":"Variedad"}</label><input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="DM4612, NK..."/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className="inp" style={{padding:"8px 12px"}}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>F. Cosecha</label><input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Rend. Esp.</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                </div>
                {/* Estado rápido */}
                <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:12,marginBottom:12}}>
                  <span style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,letterSpacing:0.8}}>Estado rápido:</span>
                  <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                    {ESTADOS.map(e=><button key={e.v} onClick={()=>setForm({...form,estado:e.v})}
                      style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
                        borderColor:form.estado===e.v?e.c:e.c+"30",border:`1.5px solid`,
                        background:form.estado===e.v?e.c+"18":"transparent",color:e.c,transition:"all 0.15s"}}>{e.l}</button>)}
                  </div>
                </div>
                {/* Adjuntos */}
                <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:12,marginBottom:12}}>
                  <span style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,letterSpacing:0.8}}>Adjuntos:</span>
                  <input ref={adjuntoRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(f)await subirAdjunto(f,form.adjunto_tipo||"suelo");}}/>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    {[["suelo","🌍 Suelo"],["agua","💧 Agua"],["otro","📎 Otro"]].map(([tipo,label])=>(
                      <button key={tipo} onClick={()=>{setForm({...form,adjunto_tipo:tipo});adjuntoRef.current?.click();}} className="btn-a" style={{fontSize:12}}>{label}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLote} className="btn-solid">Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="btn-cancel">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form margen */}
            {showFormMargen&&(
              <div className="card fade-in" style={{padding:16}}>
                <h3 style={{fontSize:13,fontWeight:800,color:"#1565c0",marginBottom:4,textTransform:"uppercase"}}>📊 Margen Bruto — {loteActivo.nombre}</h3>
                <p style={{fontSize:12,color:"#6b8aaa",marginBottom:14}}>{cultivoActivoInfo?.label} · {loteActivo.hectareas} ha · Labores: ${labores.filter(l=>l.lote_id===loteActivo.id).reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <div><label className={lCls}>Rend. Esp. tn/ha</label><input type="number" value={form.mg_rend_esp??""} onChange={e=>setForm({...form,mg_rend_esp:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Rend. Real tn/ha</label><input type="number" value={form.mg_rend_real??""} onChange={e=>setForm({...form,mg_rend_real:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Al cosechar"/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Precio $/tn</label><input type="number" value={form.mg_precio??""} onChange={e=>setForm({...form,mg_precio:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  {[["mg_semilla","Semillas"],["mg_fertilizante","Fertilizantes"],["mg_agroquimicos","Agroquímicos"],["mg_labores","Labores (auto)"],["mg_alquiler","Alquiler"],["mg_flete","Flete"],["mg_comercializacion","Comercialización"],["mg_otros","Otros"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMargen} className="btn-solid">Guardar</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="btn-cancel">Cancelar</button>
                </div>
              </div>
            )}

            {/* ══ FORM LABOR ══ */}
            {showFormLabor&&(
              <div className="card fade-in" style={{padding:16}}>
                <h3 style={{fontSize:13,fontWeight:800,color:"#166534",marginBottom:14,textTransform:"uppercase"}}>{editandoLabor?"✏️ Editar Labor":"+ Nueva Labor"} — {loteActivo.nombre}</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label>
                    <select value={form.tipo_lab??"Aplicación"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      {TIPOS_LABOR.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Superficie ha</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Operario</label><input type="text" value={form.operario??ingenieroNombre} onChange={e=>setForm({...form,operario:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Producto / Dosis</label><input type="text" value={form.producto_dosis??""} onChange={e=>setForm({...form,producto_dosis:e.target.value,descripcion_lab:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: Glifosato 4L/ha + Flumioxazine 60g/ha"/></div>
                  <div><label className={lCls}>Aplicador</label>
                    <select value={form.aplicador??""} onChange={e=>setForm({...form,aplicador:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      {APLICADORES.map(a=><option key={a} value={a}>{APLIC_ICON[a]||""} {a}</option>)}
                    </select>
                  </div>
                  <div/>
                  <div><label className={lCls}>Costo aplic. $/ha</label><input type="number" value={form.costo_aplicacion_ha??""} onChange={e=>{const ha=Number(form.superficie_ha||loteActivo.hectareas||0);setForm({...form,costo_aplicacion_ha:e.target.value,costo_total_lab:String(Number(e.target.value)*ha)});}} className="inp" style={{padding:"8px 12px"}} placeholder="0"/></div>
                  <div><label className={lCls}>Costo total $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Comentario</label><input type="text" value={form.comentario??""} onChange={e=>setForm({...form,comentario:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Observaciones, presión de malezas..."/></div>
                </div>
                {/* Preview costo */}
                {(form.costo_total_lab||form.costo_aplicacion_ha)&&Number(form.costo_total_lab||0)>0&&(
                  <div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,background:"rgba(180,140,0,0.08)",border:"1px solid rgba(180,140,0,0.18)",display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                    <span>💰</span>
                    <span style={{color:"#4a6a8a"}}>Costo total: <strong style={{color:"#b45309"}}>${Number(form.costo_total_lab||0).toLocaleString("es-AR")}</strong></span>
                    {margenLote&&<span style={{fontSize:11,color:"#6b8aaa"}}>· Se sumará al margen bruto</span>}
                  </div>
                )}
                {/* Tipo rápido */}
                <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:12,marginBottom:12}}>
                  <span style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,letterSpacing:0.8}}>Tipo rápido:</span>
                  <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                    {TIPOS_LABOR.map(t=>(
                      <button key={t} onClick={()=>setForm({...form,tipo_lab:t})}
                        style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
                          border:`1.5px solid ${form.tipo_lab===t?laborColor(t):laborColor(t)+"35"}`,
                          background:form.tipo_lab===t?laborColor(t)+"18":"transparent",
                          color:form.tipo_lab===t?laborColor(t):laborColor(t)+"80",transition:"all 0.15s"}}>{t}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLabor} className="btn-solid">Guardar Labor</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="btn-cancel">Cancelar</button>
                </div>
              </div>
            )}

            {/* ══ CUADERNO DE CAMPO ══ */}
            <div className="card" style={{padding:0}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>📋 Cuaderno de Campo</span>
                  <span style={{fontSize:12,color:"#6b8aaa"}}>{laboresLote.length} registros</span>
                  {laboresLote.length>0&&<span style={{fontSize:12,fontWeight:700,color:"#b45309"}}>Total: ${laboresLote.reduce((a,l)=>a+(l.costo_total||0),0).toLocaleString("es-AR")}</span>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={exportarCuaderno} className="btn-g">📤 Exportar</button>
                  <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");}} className="btn-a">📥 Multi-lote</button>
                </div>
              </div>

              {/* Import cuaderno */}
              {showImportCuaderno&&(
                <div style={{borderBottom:"1px solid rgba(0,60,140,0.08)",background:"rgba(240,248,255,0.50)",padding:14}} className="fade-in">
                  <div style={{fontSize:11,color:"#6b8aaa",marginBottom:8}}>Columnas: <span style={{color:"#b45309",fontWeight:700}}>LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</span></div>
                  <input ref={importCuadernoRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelCuaderno(f);}}/>
                  {cuadernoPreview.length===0
                    ?<button onClick={()=>importCuadernoRef.current?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",border:"2px dashed rgba(25,118,210,0.25)",borderRadius:12,color:"#1565c0",fontSize:13,fontWeight:600,background:"none",cursor:"pointer",width:"100%",justifyContent:"center"}}>📁 Seleccionar Excel</button>
                    :<div>
                      <div style={{maxHeight:160,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.10)"}}>
                        <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                          <thead style={{background:"rgba(240,248,255,0.80)"}}><tr>{["Lote","Match","Fecha","Ha","Tipo","Producto","$/ha","Total"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                          <tbody>{cuadernoPreview.map((r,i)=>(
                            <tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                              <td style={{padding:"6px 10px",fontWeight:700,color:"#b45309"}}>{r.lote_nombre}</td>
                              <td style={{padding:"6px 10px"}}>{r.lote_match?<span style={{color:"#166534",fontWeight:700}}>✓ {r.lote_match}</span>:<span style={{color:"#dc2626"}}>✗</span>}</td>
                              <td style={{padding:"6px 10px",color:"#6b8aaa"}}>{r.fecha||"—"}</td>
                              <td style={{padding:"6px 10px",fontWeight:700,color:"#0d2137"}}>{r.hectareas>0?r.hectareas:"—"}</td>
                              <td style={{padding:"6px 10px"}}><span className="tag" style={{background:laborColor(r.tipo)+"18",color:laborColor(r.tipo),border:`1px solid ${laborColor(r.tipo)}30`}}>{r.tipo}</span></td>
                              <td style={{padding:"6px 10px",color:"#1e3a5f",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.producto_dosis||"—"}</td>
                              <td style={{padding:"6px 10px",color:"#b45309",fontWeight:700}}>{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                              <td style={{padding:"6px 10px",fontWeight:800,color:"#0D47A1"}}>{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={confirmarImportCuaderno} className="btn-solid">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                        <button onClick={()=>setCuadernoPreview([])} className="btn-cancel">Cancelar</button>
                      </div>
                    </div>
                  }
                  {cuadernoMsg&&<p style={{marginTop:8,fontSize:12,fontWeight:700,color:cuadernoMsg.startsWith("✅")?"#166534":"#dc2626"}}>{cuadernoMsg}</p>}
                </div>
              )}

              {/* Lista labores */}
              {laboresLote.length===0?(
                <div style={{textAlign:"center",padding:"48px 20px"}}>
                  <div style={{fontSize:40,opacity:0.15,marginBottom:12}}>📋</div>
                  <p style={{color:"#6b8aaa",fontSize:14}}>Sin labores registradas</p>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}} className="btn-g" style={{marginTop:12}}>+ Primera labor</button>
                </div>
              ):(
                <div>
                  {laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>{
                    const color=laborColor(l.tipo);
                    const aplic=(l as any).aplicador;
                    const prod=(l as any).producto_dosis;
                    const coment=(l as any).comentario;
                    const costoHa=(l as any).costo_aplicacion_ha;
                    return(
                      <div key={l.id} style={{borderBottom:"1px solid rgba(0,60,140,0.07)",padding:"12px 16px",transition:"background 0.15s"}}
                        onMouseOver={e=>(e.currentTarget.style.background="rgba(240,248,255,0.50)")}
                        onMouseOut={e=>(e.currentTarget.style.background="transparent")}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                          <div style={{width:3,alignSelf:"stretch",borderRadius:3,background:color,flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                              <span className="tag" style={{background:color+"18",color,border:`1px solid ${color}28`}}>{l.tipo}</span>
                              <span style={{fontSize:12,color:"#6b8aaa"}}>{l.fecha}</span>
                              {aplic&&aplic!=="—"&&<span style={{fontSize:12,color:"#4a6a8a"}}>{APLIC_ICON[aplic]||""} {aplic}</span>}
                              {l.superficie_ha&&<span style={{fontSize:12,color:"#6b8aaa"}}>{l.superficie_ha} ha</span>}
                            </div>
                            {(prod||l.descripcion)&&<div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginTop:5}}>{prod||l.descripcion}</div>}
                            {coment&&<div style={{fontSize:12,color:"#b45309",marginTop:4,display:"flex",alignItems:"flex-start",gap:5}}><span>💬</span><span>{coment}</span></div>}
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {l.costo_total>0&&<div style={{fontSize:13,fontWeight:800,color:"#0D47A1"}}>${Number(l.costo_total).toLocaleString("es-AR")}</div>}
                            {costoHa>0&&<div style={{fontSize:11,color:"#b45309",fontWeight:600}}>${costoHa}/ha</div>}
                            <div style={{display:"flex",gap:8,marginTop:6,justifyContent:"flex-end"}}>
                              <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,producto_dosis:(l as any).producto_dosis||l.descripcion||"",aplicador:(l as any).aplicador||"",superficie_ha:String(l.superficie_ha),operario:l.operario,costo_aplicacion_ha:String((l as any).costo_aplicacion_ha||""),costo_total_lab:String(l.costo_total||""),comentario:(l as any).comentario||""});setShowFormLabor(true);}} style={{fontSize:13,color:"#b45309",background:"none",border:"none",cursor:"pointer"}}>✏️</button>
                              <button onClick={()=>eliminarLabor(l.id)} style={{fontSize:13,color:"#aab8c8",background:"none",border:"none",cursor:"pointer"}}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ VISTA PRINCIPAL ══ */}
        {!loteActivo&&(
          <div>
            {/* Tabs + acciones */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {[{k:"lotes",l:"📋 Lotes"},{k:"margen",l:"📊 Margen"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as "lotes"|"margen")}
                  className={`tab-btn${tab===t.k?" tab-active":""}`}>
                  <span className="tab-btn-text">{t.l}</span>
                </button>
              ))}
              <div style={{flex:1}}/>
              <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");setLoteActivo(null);}} className="btn-a">📥 Cuaderno multi-lote</button>
              <button onClick={()=>setShowImport(!showImport)} className="btn-a">📥 Importar lotes</button>
              <button onClick={exportarLotes} className="btn-g">📤 Exportar</button>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}} className="btn-solid">+ Nuevo lote</button>
            </div>

            {/* Import cuaderno multi-lote */}
            {showImportCuaderno&&!loteActivo&&(
              <div className="card fade-in" style={{padding:16,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <h3 style={{fontSize:13,fontWeight:800,color:"#b45309",margin:0}}>📥 Cuaderno Multi-Lote</h3>
                    <p style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>Cargá labores de varios lotes en un solo Excel</p>
                  </div>
                  <button onClick={()=>{setShowImportCuaderno(false);setCuadernoPreview([]);setCuadernoMsg("");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
                </div>
                <div style={{background:"rgba(240,248,255,0.60)",borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:11,color:"#4a6a8a"}}>
                  <div style={{fontWeight:700,marginBottom:4}}>Formato Excel:</div>
                  <div style={{color:"#b45309",fontWeight:700}}>LOTE | FECHA | TIPO | PRODUCTO/DOSIS | APLICADOR | COSTO_HA | COSTO_TOTAL | COMENTARIO</div>
                </div>
                <input ref={importCuadernoMultiRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f){setCuadernoPreview([]);setCuadernoMsg("");leerExcelCuaderno(f);}}}/>
                {cuadernoPreview.length===0
                  ?<button onClick={()=>importCuadernoMultiRef.current?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",border:"2px dashed rgba(25,118,210,0.25)",borderRadius:12,color:"#1565c0",fontSize:13,fontWeight:700,background:"none",cursor:"pointer",width:"100%",justifyContent:"center"}}>📁 Seleccionar Excel</button>
                  :<div>
                    <div style={{maxHeight:200,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.10)"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                        <thead style={{background:"rgba(240,248,255,0.80)"}}><tr>{["Lote","Match","Fecha","Ha","Tipo","Producto","$/ha","Total"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                        <tbody>{cuadernoPreview.map((r,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",opacity:r.lote_id?1:0.45}}>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#b45309"}}>{r.lote_nombre}</td>
                            <td style={{padding:"6px 10px"}}>{r.lote_match?<span style={{color:"#166534",fontWeight:700}}>✓ {r.lote_match}</span>:<span style={{color:"#dc2626"}}>✗</span>}</td>
                            <td style={{padding:"6px 10px",color:"#6b8aaa"}}>{r.fecha||"—"}</td>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#0d2137"}}>{r.hectareas>0?r.hectareas:"—"}</td>
                            <td style={{padding:"6px 10px"}}><span className="tag" style={{background:laborColor(r.tipo)+"18",color:laborColor(r.tipo)}}>{r.tipo}</span></td>
                            <td style={{padding:"6px 10px",color:"#1e3a5f",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.producto_dosis||"—"}</td>
                            <td style={{padding:"6px 10px",color:"#b45309",fontWeight:700}}>{r.costo_aplicacion_ha>0?`$${r.costo_aplicacion_ha}`:"—"}</td>
                            <td style={{padding:"6px 10px",fontWeight:800,color:"#0D47A1"}}>{r.costo_total>0?`$${Number(r.costo_total).toLocaleString("es-AR")}`:"—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={confirmarImportCuaderno} className="btn-solid">▶ Importar {cuadernoPreview.filter(r=>r.lote_id).length} labores</button>
                      <button onClick={()=>{setCuadernoPreview([]);setCuadernoMsg("");importCuadernoMultiRef.current?.click();}} className="btn-cancel">Cambiar</button>
                      {cuadernoPreview.filter(r=>!r.lote_id).length>0&&<span style={{fontSize:11,color:"#b45309",fontWeight:700}}>⚠ {cuadernoPreview.filter(r=>!r.lote_id).length} sin match</span>}
                    </div>
                  </div>
                }
                {cuadernoMsg&&<p style={{marginTop:8,fontSize:12,fontWeight:700,color:cuadernoMsg.startsWith("✅")?"#166634":cuadernoMsg.startsWith("❌")?"#dc2626":"#b45309"}}>{cuadernoMsg}</p>}
              </div>
            )}

            {/* Import lotes */}
            {showImport&&(
              <div className="card fade-in" style={{padding:16,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <h3 style={{fontSize:13,fontWeight:800,color:"#b45309",margin:0}}>📥 Importar Lotes</h3>
                  <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
                </div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelLotes(f);}}/>
                {importPreview.length===0
                  ?<button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",border:"2px dashed rgba(25,118,210,0.25)",borderRadius:12,color:"#1565c0",fontSize:13,fontWeight:700,background:"none",cursor:"pointer",width:"100%",justifyContent:"center"}}>📁 Seleccionar Excel</button>
                  :<div>
                    <div style={{maxHeight:160,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.10)"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                        <thead style={{background:"rgba(240,248,255,0.80)"}}><tr>{["Lote","Ha","Cultivo","Variedad","Acción"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#0d2137"}}>{r.nombre}</td>
                            <td style={{padding:"6px 10px",fontWeight:700,color:"#b45309"}}>{r.hectareas||"—"}</td>
                            <td style={{padding:"6px 10px",color:"#166534",fontWeight:600}}>{r.cultivo_completo||"—"}</td>
                            <td style={{padding:"6px 10px",color:"#1565c0"}}>{r.variedad||"—"}</td>
                            <td style={{padding:"6px 10px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:r.accion==="crear"?"rgba(22,163,74,0.10)":"rgba(25,118,210,0.10)",color:r.accion==="crear"?"#166534":"#1565c0"}}>{r.accion==="crear"?"+ Crear":"✎ Actualizar"}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={confirmarImportLotes} className="btn-solid">▶ Confirmar {importPreview.length} lotes</button>
                      <button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="btn-cancel">Cambiar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p style={{marginTop:8,fontSize:12,fontWeight:700,color:importMsg.startsWith("✅")?"#166634":"#dc2626"}}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote&&!editandoLote&&(
              <div className="card fade-in" style={{padding:16,marginBottom:12}}>
                <h3 style={{fontSize:13,fontWeight:800,color:"#166534",marginBottom:14,textTransform:"uppercase"}}>+ Nuevo Lote</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="El Norte..."/></div>
                  <div><label className={lCls}>Hectáreas *</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <optgroup label="Verano"><option value="soja|1ra">🌱 Soja 1º</option><option value="soja|2da">🌿 Soja 2º</option><option value="maiz|1ro_temprano">🌽 Maíz 1º</option><option value="maiz|1ro_tardio">🌽 Maíz 1º Tardío</option><option value="maiz|2do">🌽 Maíz 2º</option><option value="girasol|1ro">🌻 Girasol</option><option value="sorgo|1ro">🌿 Sorgo 1º</option><option value="sorgo|2do">🌿 Sorgo 2º</option></optgroup>
                      <optgroup label="Invierno"><option value="trigo|1ro">🌾 Trigo</option><option value="cebada|1ra">🍃 Cebada</option><option value="arveja|1ra">🫛 Arveja</option><option value="carinata|1ra">🌱 Carinata</option><option value="camelina|1ra">🌱 Camelina</option></optgroup>
                      <optgroup label="Otros"><option value="pastura|libre">🌾 Pastura</option><option value="otros|libre">🌱 Otros</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>F. Siembra</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tenencia</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className="inp" style={{padding:"8px 12px"}}>{["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className="inp" style={{padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className="inp" style={{padding:"8px 12px"}}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLote} className="btn-solid">Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setForm({});}} className="btn-cancel">Cancelar</button>
                </div>
              </div>
            )}

            {/* KPIs + filtros + gráfico */}
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                {[
                  {l:"Lotes",v:String(lotesPrincipales.length),c:"#0d2137"},
                  {l:"Ha",v:totalHa.toLocaleString("es-AR"),c:"#b45309"},
                  {l:"MB Est.",v:"$"+Math.round(margenes.filter((m:any)=>m.estado==="estimado").reduce((a:number,m:any)=>a+m.margen_bruto,0)/1000)+"K",c:"#166534"},
                  {l:"MB Real",v:"$"+Math.round(margenes.filter((m:any)=>m.estado==="real").reduce((a:number,m:any)=>a+m.margen_bruto,0)/1000)+"K",c:"#1565c0"},
                ].map(s=>(
                  <div key={s.l} className="card" style={{padding:"10px 14px",textAlign:"center",minWidth:60}}>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                    <div style={{fontSize:15,fontWeight:800,marginTop:3,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Filtros cultivo */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flex:1}}>
                <button onClick={()=>setFilterCultivo("todos")}
                  style={{padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${filterCultivo==="todos"?"rgba(25,118,210,0.40)":"rgba(255,255,255,0.70)"}`,background:filterCultivo==="todos"?"rgba(25,118,210,0.10)":"rgba(255,255,255,0.60)",color:filterCultivo==="todos"?"#0d47a1":"#4a6a8a",transition:"all 0.15s"}}>
                  Todos ({lotesPrincipales.length})
                </button>
                {datosGrafico.map(d=>(
                  <button key={d.name} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)}
                    style={{padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
                      border:`1.5px solid ${filterCultivo===d.name?d.color:d.color+"45"}`,
                      background:filterCultivo===d.name?d.color+"18":"rgba(255,255,255,0.60)",
                      color:filterCultivo===d.name?d.color:d.color+"90",transition:"all 0.15s"}}>
                    {d.name} · {d.value}ha
                  </button>
                ))}
              </div>

              {/* Gráfico torta */}
              {datosGrafico.length>0&&(
                <div className="card" style={{padding:12,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                  <div style={{width:80,height:80}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={36} innerRadius={16} dataKey="value" labelLine={false} label={renderPieLabel} paddingAngle={2}>
                        {datosGrafico.map((e,i)=><Cell key={i} fill={e.color} strokeWidth={2}/>)}
                      </Pie>
                      <Tooltip formatter={(v:any,n:string)=>[String(v)+" ha",n]} contentStyle={{background:"rgba(255,255,255,0.95)",border:"1px solid rgba(25,118,210,0.20)",borderRadius:10,fontSize:11}}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:100}}>
                    {datosGrafico.map((d,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:d.color,fontWeight:700,flex:1,maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                        <span style={{fontSize:11,color:"#6b8aaa"}}>{d.value}ha</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Grid lotes */}
            {tab==="lotes"&&(
              lotesPrincipales.length===0?(
                <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                  <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🌾</div>
                  <p style={{color:"#6b8aaa",fontSize:14,marginBottom:12}}>Sin lotes — agregá el primero</p>
                  <button onClick={()=>setShowFormLote(true)} className="btn-g">+ Agregar primer lote</button>
                </div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                  {lotesPrincipales
                    .filter(lote=>filterCultivo==="todos"||(getCultivoInfo(lote.cultivo,lote.cultivo_orden).label)===filterCultivo)
                    .map(lote=>{
                    const ci=getCultivoInfo(lote.cultivo||"",lote.cultivo_orden||"");
                    const mg=margenes.find((m:any)=>m.lote_id===lote.id);
                    const labsCount=labores.filter(l=>l.lote_id===lote.id).length;
                    const labsCosto=labores.filter(l=>l.lote_id===lote.id).reduce((a,l)=>a+(l.costo_total||0),0);
                    const est=ESTADOS.find(e=>e.v===lote.estado);
                    const ultimaLabor=labores.filter(l=>l.lote_id===lote.id).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
                    return(
                      <div key={lote.id} className="lote-card" onClick={()=>setLoteActivo(lote)}>
                        {/* Header */}
                        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                          <div style={{width:3,alignSelf:"stretch",borderRadius:3,background:ci.color,flexShrink:0}}/>
                          <CultivoIcon cultivo={lote.cultivo||""} size={24}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:800,color:"#0d2137",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:14}}>{lote.nombre}</div>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                              <span style={{fontSize:11,fontWeight:800,color:ci.color,textTransform:"uppercase",letterSpacing:0.2}}>{ci.label}</span>
                              {est&&<span className="tag" style={{background:est.c+"15",color:est.c,border:`1px solid ${est.c}28`}}>{est.l}</span>}
                            </div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminarLote(lote.id);}} style={{background:"none",border:"none",color:"#aab8c8",cursor:"pointer",fontSize:14,padding:4}}>✕</button>
                        </div>
                        {/* Stats */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"10px 14px",gap:4}}>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>Ha</div>
                            <div style={{fontSize:15,fontWeight:800,color:"#b45309",marginTop:2}}>{lote.hectareas}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>Labores</div>
                            <div style={{fontSize:15,fontWeight:800,color:"#0d2137",marginTop:2}}>{labsCount}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>MB/ha</div>
                            <div style={{fontSize:14,fontWeight:800,marginTop:2,color:mg?(mg.margen_bruto_ha>=0?"#166534":"#dc2626"):"#aab8c8"}}>{mg?"$"+Math.round(mg.margen_bruto_ha).toLocaleString("es-AR"):"—"}</div>
                          </div>
                        </div>
                        {/* Última labor */}
                        {ultimaLabor&&(
                          <div style={{padding:"0 14px 10px",display:"flex",alignItems:"center",gap:8}}>
                            <span className="tag" style={{background:laborColor(ultimaLabor.tipo)+"18",color:laborColor(ultimaLabor.tipo),border:`1px solid ${laborColor(ultimaLabor.tipo)}28`}}>{ultimaLabor.tipo}</span>
                            <span style={{fontSize:11,color:"#6b8aaa"}}>{ultimaLabor.fecha}</span>
                            {labsCosto>0&&<span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:"#b45309"}}>${labsCosto.toLocaleString("es-AR")}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Tab Margen */}
            {tab==="margen"&&(
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>Margen Bruto por Lote</span>
                  <span style={{fontSize:12,color:"#6b8aaa"}}>USD ${usdUsado}</span>
                </div>
                {margenes.length===0?(
                  <div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>Sin márgenes — entrá a un lote y cargá los datos</div>
                ):(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",fontSize:12,minWidth:700,borderCollapse:"collapse"}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)",background:"rgba(240,248,255,0.50)"}}>
                        {["Lote","Cultivo","Ha","Rend.","Ingreso","Costo","Margen","MB/ha","Estado"].map(h=>(
                          <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {margenes.map((m:any)=>{
                          const lote=lotes.find(l=>l.id===m.lote_id);
                          const ci=getCultivoInfo(m.cultivo||"",m.cultivo_orden||"");
                          return(
                            <tr key={m.id} style={{borderBottom:"1px solid rgba(0,60,140,0.06)",cursor:"pointer",transition:"background 0.15s"}}
                              onMouseOver={e=>(e.currentTarget.style.background="rgba(240,248,255,0.50)")}
                              onMouseOut={e=>(e.currentTarget.style.background="transparent")}
                              onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                              <td style={{padding:"10px 14px",fontWeight:800,color:"#0d2137"}}>{lote?.nombre||"—"}</td>
                              <td style={{padding:"10px 14px"}}><span className="tag" style={{background:ci.color+"18",color:ci.color,border:`1px solid ${ci.color}28`}}>{ci.label}</span></td>
                              <td style={{padding:"10px 14px",color:"#4a6a8a"}}>{m.hectareas}</td>
                              <td style={{padding:"10px 14px",color:"#b45309",fontWeight:700}}>{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                              <td style={{padding:"10px 14px",color:"#0d2137",fontWeight:600}}>${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 14px",color:"#dc2626",fontWeight:600}}>${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 14px",fontWeight:800,color:m.margen_bruto>=0?"#166534":"#dc2626"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 14px",fontWeight:700,color:"#b45309"}}>${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                              <td style={{padding:"10px 14px"}}><span className="tag" style={{background:m.estado==="real"?"rgba(22,163,74,0.10)":"rgba(180,130,0,0.10)",color:m.estado==="real"?"#166534":"#b45309",border:`1px solid ${m.estado==="real"?"rgba(22,163,74,0.20)":"rgba(180,130,0,0.18)"}`}}>{m.estado==="real"?"✅ Real":"📋 Est."}</span></td>
                            </tr>
                          );
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
        <div style={{position:"fixed",bottom:88,right:16,zIndex:50,width:300,
          background:"rgba(255,255,255,0.88)",backdropFilter:"blur(16px)",
          border:"1.5px solid rgba(255,255,255,0.92)",borderRadius:20,
          boxShadow:"0 12px 36px rgba(20,80,160,0.18)",overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:VOZ_COLOR[vozEstado]}}/>
              <span style={{color:"#0d2137",fontSize:12,fontWeight:800}}>🎤 ASISTENTE</span>
            </div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:12,minHeight:60}}>
            {vozEstado==="escuchando"&&<p style={{color:"#dc2626",fontSize:13,fontWeight:700,margin:0}}>🔴 Escuchando...</p>}
            {vozEstado==="procesando"&&<p style={{color:"#b45309",fontSize:13,fontWeight:700,margin:0}}>⚙️ Procesando...</p>}
            {vozRespuesta&&<div style={{background:"rgba(22,163,74,0.07)",border:"1px solid rgba(22,163,74,0.18)",borderRadius:12,padding:"10px 12px",marginBottom:8}}>
              <p style={{color:"#0d2137",fontSize:13,margin:0,lineHeight:1.5}}>{vozRespuesta}</p>
            </div>}
            {vozTranscripcion&&!vozRespuesta&&<p style={{color:"#6b8aaa",fontSize:12,fontStyle:"italic",margin:0}}>"{vozTranscripcion}"</p>}
            {vozEstado==="idle"&&!vozRespuesta&&!vozTranscripcion&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {["Hoy siembra lote Grande N Coggiola","Aplicación glifosato lote Casa Sur","Cosecha lote 3 rendimiento 35 quintales"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}}
                    style={{textAlign:"left",fontSize:11,color:"#4a6a8a",padding:"7px 11px",borderRadius:10,
                      background:"rgba(240,248,255,0.60)",border:"1px solid rgba(25,118,210,0.12)",cursor:"pointer"}}>
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"0 12px 12px",display:"flex",gap:8,borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:10}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}}
              placeholder="Escribí..." className="inp" style={{flex:1,padding:"8px 12px",fontSize:12}}/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}}
              style={{padding:"8px 12px",borderRadius:11,fontSize:14,cursor:"pointer",
                background:VOZ_COLOR[vozEstado]+"18",border:`1px solid ${VOZ_COLOR[vozEstado]}45`,color:VOZ_COLOR[vozEstado]}}>
              {VOZ_ICON[vozEstado]}
            </button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="btn-solid" style={{padding:"8px 12px",fontSize:13}}>→</button>}
          </div>
        </div>
      )}

      {/* Botón flotante VOZ */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:54,height:54,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
          color:"white",border:"2px solid rgba(180,220,255,0.70)",
          boxShadow:"0 4px 20px rgba(33,150,243,0.45)",
          animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",
          textShadow:"0 1px 3px rgba(0,40,120,0.40)",
          transition:"all 0.2s ease"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p style={{textAlign:"center",color:"rgba(30,58,90,0.45)",fontSize:11,paddingBottom:12,paddingTop:8}}>
        AgroGestión PRO · {productorNombre.toUpperCase()}
      </p>
      {ingenieroId&&<EscanerIA empresaId={ingenieroId}/>}
    </div>
  );
}

"use client";
// app/ingeniero/lotes/page.tsx
// Modo A: productor SIN cuenta → ingeniero tiene su propio espacio de lotes
// Modo B: productor CON cuenta (vinculados por admin) → datos compartidos, misma empresa_id

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
  superficie_ha: number; maquinaria: string; operario: string;
  costo_total: number; observaciones: string; metodo_carga: string;
};

const CULTIVOS_LISTA = [
  { cultivo:"soja", orden:"1ra", label:"SOJA 1RA", color:"#4ADE80", icon:"🌱", admite2do:false, usaHibrido:false },
  { cultivo:"soja", orden:"2da", label:"SOJA 2DA", color:"#86EFAC", icon:"🌿", admite2do:false, usaHibrido:false },
  { cultivo:"maiz", orden:"1ro_temprano", label:"MAIZ 1RO", color:"#C9A227", icon:"🌽", admite2do:false, usaHibrido:true },
  { cultivo:"maiz", orden:"1ro_tardio", label:"MAIZ 1RO TARDIO", color:"#D97706", icon:"🌽", admite2do:false, usaHibrido:true },
  { cultivo:"maiz", orden:"2do", label:"MAIZ 2DO", color:"#FCD34D", icon:"🌽", admite2do:false, usaHibrido:true },
  { cultivo:"trigo", orden:"1ro", label:"TRIGO 1RO", color:"#F59E0B", icon:"🌾", admite2do:true, usaHibrido:false },
  { cultivo:"girasol", orden:"1ro", label:"GIRASOL 1RO", color:"#FBBF24", icon:"🌻", admite2do:false, usaHibrido:true },
  { cultivo:"girasol", orden:"2do", label:"GIRASOL 2DO", color:"#FDE68A", icon:"🌻", admite2do:false, usaHibrido:true },
  { cultivo:"sorgo", orden:"1ro", label:"SORGO 1RO", color:"#F87171", icon:"🌿", admite2do:false, usaHibrido:true },
  { cultivo:"sorgo", orden:"2do", label:"SORGO 2DO", color:"#FCA5A5", icon:"🌿", admite2do:false, usaHibrido:true },
  { cultivo:"cebada", orden:"1ra", label:"CEBADA 1RA", color:"#A78BFA", icon:"🍃", admite2do:true, usaHibrido:false },
  { cultivo:"arveja", orden:"1ra", label:"ARVEJA 1RA", color:"#34D399", icon:"🫛", admite2do:true, usaHibrido:false },
  { cultivo:"vicia", orden:"cobertura", label:"VICIA COBERTURA", color:"#6EE7B7", icon:"🌱", admite2do:true, usaHibrido:false },
  { cultivo:"verdeo", orden:"invierno", label:"VERDEO INVIERNO", color:"#60A5FA", icon:"🌾", admite2do:true, usaHibrido:false },
  { cultivo:"verdeo", orden:"verano", label:"VERDEO VERANO", color:"#93C5FD", icon:"🌾", admite2do:true, usaHibrido:false },
];
const TIPOS_LABOR = ["Siembra","Aplicacion","Fertilizacion","Cosecha","Labranza","Riego","Control malezas","Recorrida","Otro"];
const ESTADOS = [
  {v:"planificado",l:"PLANIFICADO",c:"#6B7280"},
  {v:"sembrado",l:"SEMBRADO",c:"#4ADE80"},
  {v:"en_desarrollo",l:"EN DESARROLLO",c:"#C9A227"},
  {v:"cosechado",l:"COSECHADO",c:"#60A5FA"},
  {v:"barbecho",l:"BARBECHO",c:"#A78BFA"},
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
  if (!cultivo) return { label:"SIN CULTIVO", color:"#4B5563", icon:"🌾", admite2do:false, usaHibrido:false };
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { label:cultivo.toUpperCase(), color:"#6B7280", icon:"🌱", admite2do:false, usaHibrido:false };
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

export default function IngenieroLotesPage() {
  // Contexto del productor
  const [empresaId, setEmpresaId] = useState<string>("");
  const [productorNombre, setProductorNombre] = useState<string>("");
  const [modoCompartido, setModoCompartido] = useState(false); // true = vinculado con productor
  const [ingenieroId, setIngenieroId] = useState<string>("");
  const [ingenieroNombre, setIngenieroNombre] = useState<string>("");
  // Datos
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [margenes, setMargenes] = useState<any[]>([]);
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [loading, setLoading] = useState(true);
  // Forms
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

    // Leer contexto del productor desde localStorage
    const eid = localStorage.getItem("ing_empresa_id") ?? "";
    const pnombre = localStorage.getItem("ing_empresa_nombre") ?? "Productor";
    const compartido = localStorage.getItem("ing_modo_compartido") === "true";

    if (!eid) { window.location.href = "/ingeniero"; return; }
    setEmpresaId(eid);
    setProductorNombre(pnombre);
    setModoCompartido(compartido);

    // Si modo compartido: empresa_id es la del productor real
    // Si modo propio: empresa_id es un namespace creado para este productor del ingeniero
    await setupEmpresaYCampanas(eid, u.id, compartido);
    setLoading(false);
  };

  const setupEmpresaYCampanas = async (eid: string, iid: string, compartido: boolean) => {
    const sb = await getSB();

    // Si no compartido y la "empresa" del ingeniero no existe, crearla
    if (!compartido) {
      const { data: emp } = await sb.from("empresas").select("id").eq("id", eid).single();
      if (!emp) {
        // Crear empresa virtual para este productor del ingeniero
        const { data: nueva } = await sb.from("empresas").insert({
          id: eid, nombre: productorNombre + " (Ing)", propietario_id: iid
        }).select().single();
      }
    }

    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", eid).order("año_inicio", { ascending: false });
    const { data: cot } = await sb.from("finanzas_cotizaciones").select("usd_usado").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(1);
    setCampanas(camps ?? []);
    if (cot?.[0]) setUsdUsado(cot[0].usd_usado || 1);

    // Si no hay campaña, crear una
    let activa = (camps ?? []).find(c => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    if (!activa) {
      const anio = new Date().getFullYear();
      const { data: nueva } = await sb.from("campanas").insert({
        empresa_id: eid, nombre: anio+"/"+(anio+1), año_inicio: anio, año_fin: anio+1, activa: true
      }).select().single();
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
    setLotes(sorted); setLabores(lbs.data ?? []); setMargenes(mgs.data ?? []);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const getCampanaId = async (sb: any): Promise<string> => {
    if (campanaActiva) return campanaActiva;
    const anio = new Date().getFullYear();
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id: empresaId, nombre: anio+"/"+(anio+1), año_inicio: anio, año_fin: anio+1, activa: true }).select().single();
    if (nueva) { setCampanaActiva(nueva.id); setCampanas(p => [nueva,...p]); return nueva.id; }
    return "";
  };

  // ===== CRUD LOTES =====
  const guardarLote = async () => {
    if (!empresaId || !form.nombre?.trim()) { msg("❌ INGRESA EL NOMBRE DEL LOTE"); return; }
    const sb = await getSB();
    const cid = await getCampanaId(sb);
    if (!cid) { msg("❌ SIN CAMPANA"); return; }
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
        const { error } = await sb.from("lotes").update(payload).eq("id", editandoLote);
        if (error) { msg("❌ "+error.message); return; }
        const { data: updated } = await sb.from("lotes").select("*").eq("id", editandoLote).single();
        if (updated) setLoteActivo(updated);
        setEditandoLote(null);
      } else {
        const { error } = await sb.from("lotes").insert(payload);
        if (error) { msg("❌ "+error.message); return; }
      }
      msg("✅ LOTE GUARDADO");
      await fetchLotes(empresaId, campanaActiva);
      setShowFormLote(false); setForm({});
    } catch(e: any) { msg("❌ "+e.message); }
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("Eliminar lote?")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
    setLoteActivo(null);
  };

  // ===== CRUD LABORES =====
  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo.id, campana_id: campanaActiva,
      fecha: form.fecha_lab ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_lab ?? "Aplicacion", descripcion: form.descripcion_lab ?? "",
      superficie_ha: Number(form.superficie_ha ?? loteActivo.hectareas ?? 0),
      maquinaria: form.maquinaria ?? "", operario: form.operario ?? ingenieroNombre,
      costo_total: Number(form.costo_total_lab ?? 0), observaciones: form.obs_lab ?? "",
      metodo_carga: "ingeniero",
    };
    if (editandoLabor) { await sb.from("lote_labores").update(payload).eq("id", editandoLabor); setEditandoLabor(null); }
    else { await sb.from("lote_labores").insert(payload); }
    msg("✅ LABOR GUARDADA");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    await fetchLotes(empresaId, campanaActiva);
  };

  // ===== MARGEN =====
  const guardarMargen = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = loteActivo.hectareas || 0;
    const rend = Number(form.mg_rend_real || form.mg_rend_esp || 0);
    const precio = Number(form.mg_precio || 0);
    const ing2 = ha * rend * precio;
    const costos = [form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,form.mg_labores,form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros];
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
      costo_labores: Number(form.mg_labores||0), costo_alquiler: Number(form.mg_alquiler||0),
      costo_flete: Number(form.mg_flete||0), costo_comercializacion: Number(form.mg_comercializacion||0),
      otros_costos: Number(form.mg_otros||0), costo_directo_total: cd,
      margen_bruto: mb, margen_bruto_ha: ha>0?mb/ha:0,
      margen_bruto_usd: mb/usdUsado, cotizacion_usd: usdUsado,
      estado: form.mg_rend_real ? "real" : "estimado",
    };
    if (existing) await sb.from("margen_bruto_detalle").update(payload).eq("id", existing.id);
    else await sb.from("margen_bruto_detalle").insert(payload);
    msg("✅ MARGEN GUARDADO");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormMargen(false); setForm({});
  };

  // ===== ADJUNTO =====
  const subirAdjunto = async (file: File, tipo: string) => {
    if (!empresaId || !loteActivo) return;
    try {
      const sb = await getSB();
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = empresaId+"/"+loteActivo.id+"/"+tipo+"_"+Date.now()+"."+ext;
      const { error } = await sb.storage.from("lotes-adjuntos").upload(path, file, { upsert:true });
      if (error) { msg("❌ "+error.message); return; }
      try { await sb.from("lote_adjuntos").insert({ empresa_id:empresaId, lote_id:loteActivo.id, tipo, nombre:file.name, path }); } catch {}
      msg("✅ ADJUNTO GUARDADO");
    } catch(e: any) { msg("❌ "+e.message); }
  };

  // ===== EXPORT =====
  const exportarLotes = async () => {
    const XLSX = await import("xlsx");
    const data = lotesPrincipales.map(l => {
      const mg = margenes.find(m => m.lote_id === l.id);
      return { LOTE:l.nombre, HECTAREAS:l.hectareas, CULTIVO:l.cultivo_completo||l.cultivo, VARIEDAD:l.variedad||l.hibrido||"", ESTADO:l.estado, FECHA_SIEMBRA:l.fecha_siembra||"", FECHA_COSECHA:l.fecha_cosecha||"", TENENCIA:l.tipo_tenencia||"", PARTIDO:l.partido||"", REND_ESPERADO:l.rendimiento_esperado||0, REND_REAL:l.rendimiento_real||0, MARGEN_BRUTO:mg?Math.round(mg.margen_bruto):"", MB_HA:mg?Math.round(mg.margen_bruto_ha):"" };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Array(13).fill({ wch:16 });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, "lotes_"+productorNombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const exportarCuaderno = async () => {
    if (!loteActivo) return;
    const XLSX = await import("xlsx");
    const data = laboresLote.map(l => ({ LOTE:loteActivo.nombre, FECHA:l.fecha, TIPO:l.tipo, DESCRIPCION:l.descripcion, HA:l.superficie_ha, MAQUINARIA:l.maquinaria||"", OPERARIO:l.operario||"", COSTO:l.costo_total||0 }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Labores");
    XLSX.writeFile(wb, "cuaderno_"+loteActivo.nombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  // ===== IMPORT =====
  const leerExcelLotes = async (file: File) => {
    setImportMsg("LEYENDO...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const wsData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (wsData.length < 2) { setImportMsg("SIN DATOS"); return; }
      const headers = wsData[0].map((h: any) => String(h).toLowerCase().trim().split(" ").join("_"));
      const ci = headers.findIndex((h: string) => h.includes("lote")||h.includes("nombre")||h.includes("campo"));
      const ch = headers.findIndex((h: string) => h.includes("ha")||h.includes("hect"));
      const cc = headers.findIndex((h: string) => h.includes("cultivo")||h.includes("especie"));
      const cv = headers.findIndex((h: string) => h.includes("varie")||h.includes("hibri"));
      const cf = headers.findIndex((h: string) => h.includes("siem")||(h.includes("fecha")&&h.includes("siem")));
      const cp = headers.findIndex((h: string) => h.includes("partido")||h.includes("localidad"));
      const colN = ci >= 0 ? ci : 0;
      const preview = wsData.slice(1).filter((r: any) => r[colN]&&String(r[colN]).trim()).map((r: any) => {
        const nombre = String(r[colN]).trim();
        const cultTexto = cc >= 0 ? String(r[cc]).toLowerCase().trim() : "";
        let cultivo = ""; let orden = "1ra";
        if (cultTexto) {
          if (cultTexto.includes("maiz")||cultTexto.includes("maíz")) { cultivo="maiz"; orden=cultTexto.includes("2do")?"2do":cultTexto.includes("tard")?"1ro_tardio":"1ro_temprano"; }
          else if (cultTexto.includes("trigo")) { cultivo="trigo"; orden="1ro"; }
          else if (cultTexto.includes("girasol")) { cultivo="girasol"; orden=cultTexto.includes("2")?"2do":"1ro"; }
          else if (cultTexto.includes("sorgo")) { cultivo="sorgo"; orden=cultTexto.includes("2")?"2do":"1ro"; }
          else if (cultTexto.includes("cebada")) { cultivo="cebada"; orden="1ra"; }
          else if (cultTexto.includes("arveja")) { cultivo="arveja"; orden="1ra"; }
          else if (cultTexto.includes("vicia")) { cultivo="vicia"; orden="cobertura"; }
          else if (cultTexto.includes("soja")||cultTexto.includes("soy")) { cultivo="soja"; orden=cultTexto.includes("2")?"2da":"1ra"; }
        }
        const existe = lotes.find(l => l.nombre.toLowerCase().trim()===nombre.toLowerCase());
        return { nombre, hectareas: ch>=0?(Number(r[ch])||0):0, cultivo:cultivo||null, cultivo_orden:orden, cultivo_completo:cultivo?getCultivoInfo(cultivo,orden).label:"", partido:cp>=0?String(r[cp]).trim():"", fecha_siembra:cf>=0?parseFecha(r[cf]):null, variedad:cv>=0?String(r[cv]).trim():"", accion:existe?"actualizar":"crear", id_existente:existe?.id??null };
      });
      setImportPreview(preview);
      setImportMsg("✅ "+preview.length+" LOTES DETECTADOS");
    } catch(e: any) { setImportMsg("❌ "+e.message); }
  };

  const confirmarImportLotes = async () => {
    if (!empresaId||!importPreview.length) return;
    const sb = await getSB();
    const cid = await getCampanaId(sb);
    if (!cid) { msg("❌ SIN CAMPANA"); return; }
    let creados=0; let actualizados=0; const errores: string[]=[];
    const procesados: string[] = [];
    for (let i=0; i<importPreview.length; i++) {
      const l = importPreview[i];
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
      msg("✅ "+creados+" CREADOS · "+actualizados+" ACTUALIZADOS"+(errores.length?" · "+errores.length+" ERRORES":""));
      await fetchLotes(empresaId, cid);
      setImportPreview([]); setImportMsg(""); setShowImport(false);
    } else { msg("❌ "+errores.slice(0,2).join(" | ")); }
  };

  const leerExcelCuaderno = async (file: File) => {
    if (!loteActivo) return; setCuadernoMsg("LEYENDO...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (rows.length<2) { setCuadernoMsg("SIN DATOS"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const cf = headers.findIndex((h: string) => h.includes("fecha"));
      const ct = headers.findIndex((h: string) => h.includes("tipo"));
      const cd = headers.findIndex((h: string) => h.includes("desc")||h.includes("obs")||h.includes("aplic"));
      if (cf===-1) { setCuadernoMsg("❌ SIN COLUMNA FECHA"); return; }
      const preview = rows.slice(1).filter((r: any) => r[cf]).map((r: any) => {
        const desc = cd>=0?String(r[cd]).trim():"";
        const tipoRaw = ct>=0?String(r[ct]).trim():"";
        const dl = desc.toLowerCase();
        const tipo = tipoRaw||(dl.includes("siem")?"Siembra":dl.includes("cosech")?"Cosecha":dl.includes("fertil")?"Fertilizacion":"Aplicacion");
        return { fecha:parseFecha(r[cf]), tipo, descripcion:desc };
      });
      setCuadernoPreview(preview); setCuadernoMsg("✅ "+preview.length+" LABORES");
    } catch(e: any) { setCuadernoMsg("❌ "+e.message); }
  };

  const confirmarImportCuaderno = async () => {
    if (!empresaId||!loteActivo||!cuadernoPreview.length) return;
    const sb = await getSB();
    for (let i=0; i<cuadernoPreview.length; i++) {
      const l = cuadernoPreview[i];
      await sb.from("lote_labores").insert({ empresa_id:empresaId, lote_id:loteActivo.id, campana_id:campanaActiva, fecha:l.fecha, tipo:l.tipo, descripcion:l.descripcion, superficie_ha:loteActivo.hectareas, metodo_carga:"excel" });
    }
    msg("✅ "+cuadernoPreview.length+" LABORES IMPORTADAS");
    await fetchLotes(empresaId, campanaActiva);
    setCuadernoPreview([]); setCuadernoMsg(""); setShowImportCuaderno(false);
  };

  // ===== VOZ =====
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
    const resumen = lotes.slice(0,8).map(l => l.nombre+": "+l.hectareas+"ha "+( l.cultivo_completo||l.cultivo)+" ("+l.estado+")").join("; ");
    try {
      const res = await fetch("/api/scanner", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:400, messages:[{ role:"user", content:"Asistente lotes agropecuarios. Lotes: "+resumen+". Usuario: \""+texto+"\". Responde SOLO JSON sin markdown: {\"texto\":\"respuesta breve\",\"accion\":\"consulta|crear_lote\",\"datos\":{}}" }] })
      });
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??""); hablar(parsed.texto??"");
      if (parsed.accion==="crear_lote"&&parsed.datos) {
        const ci2 = CULTIVOS_LISTA.find(c=>(parsed.datos.cultivo??"").toLowerCase().includes(c.cultivo));
        setForm({ nombre:parsed.datos.nombre??"", hectareas:String(parsed.datos.hectareas??""), cultivo_key:ci2?ci2.cultivo+"|"+ci2.orden:"soja|1ra" });
        setShowFormLote(true);
      }
      setVozEstado("respondiendo");
    } catch { const e="No pude interpretar."; setVozRespuesta(e); hablar(e); setVozEstado("error"); setTimeout(()=>setVozEstado("idle"),2000); }
  }, [lotes, hablar]);

  const escucharVoz = () => {
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    if (!hasSR) { alert("Usa Chrome"); return; }
    const SR = (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang="es-AR"; rec.continuous=false;
    recRef.current=rec; setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult=(e: any)=>{const t=e.results[0][0].transcript;setVozTranscripcion(t);interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  const VOZ_COLOR: Record<string,string>={idle:"#00FF80",escuchando:"#F87171",procesando:"#C9A227",respondiendo:"#60A5FA",error:"#F87171"};
  const VOZ_ICON: Record<string,string>={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};
  const iCls="w-full bg-[#020810]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

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
  const usaHibrido = cultivoActivoInfo?.usaHibrido??false;
  const admite2do = cultivoActivoInfo?.admite2do??false;
  const segundosCultivos = loteActivo?lotes.filter(l=>l.lote_id_primer_cultivo===loteActivo.id):[];
  const datosGrafico = (() => {
    const mapa: Record<string,{ha:number;color:string}>={};
    const vistos: string[]=[];
    lotesPrincipales.filter(l=>l.cultivo&&l.cultivo!=="null").forEach(l=>{
      const k=l.nombre.toLowerCase().trim(); if(vistos.includes(k))return; vistos.push(k);
      const key=l.cultivo_completo||l.cultivo||"SIN CULTIVO";
      const info=getCultivoInfo(l.cultivo,l.cultivo_orden);
      if(!mapa[key])mapa[key]={ha:0,color:info.color};
      mapa[key].ha+=l.hectareas||0;
    });
    return Object.entries(mapa).filter(([,v])=>v.ha>0).map(([name,v])=>({name,value:Math.round(v.ha*10)/10,color:v.color})).sort((a,b)=>b.value-a.value);
  })();
  const cultivosUnicos=[...new Set(lotesPrincipales.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  const renderLabel=({cx,cy,midAngle,innerRadius,outerRadius,percent}:any)=>{
    if(percent<0.05)return null;
    const R=Math.PI/180;const r=innerRadius+(outerRadius-innerRadius)*0.55;
    const x=cx+r*Math.cos(-midAngle*R);const y=cy+r*Math.sin(-midAngle*R);
    return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="monospace" fontWeight="bold">{Math.round(percent*100)+"%"}</text>;
  };

  const campanasSinDup=campanas.filter((c,i,arr)=>arr.findIndex(x=>x.año_inicio===c.año_inicio)===i);

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">CARGANDO LOTES...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        .card-l{background:rgba(10,22,40,0.85);border:1px solid rgba(201,162,39,0.18);border-radius:12px;transition:all 0.2s}
        .card-l:hover{border-color:rgba(201,162,39,0.4)}
        .lote-card:hover{border-color:rgba(0,255,128,0.5)!important;transform:translateY(-2px)}
        .lote-card{cursor:pointer;transition:all 0.2s}
      `}</style>
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10 bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-3">
        <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/ingeniero"} className="text-[#4B5563] hover:text-[#00FF80] font-mono text-sm">
          ← {loteActivo?"VOLVER A LOTES":"MI PANEL"}
        </button>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold uppercase">{productorNombre}</div>
          <div className="flex items-center gap-2 justify-end">
            <div className="text-xs font-mono" style={{color:modoCompartido?"#4ADE80":"#C9A227"}}>
              {modoCompartido?"🔗 DATOS COMPARTIDOS CON PRODUCTOR":"📋 DATOS PROPIOS DEL INGENIERO"}
            </div>
          </div>
        </div>
        <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);await fetchLotes(empresaId,e.target.value);}}
          className="bg-[#0a1628]/80 border border-[#00FF80]/25 rounded-lg px-3 py-1.5 text-[#00FF80] text-xs font-mono focus:outline-none">
          {campanasSinDup.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
        </select>
        <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-sm font-bold"
          style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
          {VOZ_ICON[vozEstado]} VOZ
        </button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-5">
        {msgExito&&<div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* DETALLE LOTE */}
        {loteActivo&&(
          <div className="space-y-4">
            <div className="card-l p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-1.5 self-stretch rounded-full" style={{background:cultivoActivoInfo?.color}}/>
                <span className="text-3xl">{cultivoActivoInfo?.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold text-white font-mono uppercase">{loteActivo.nombre}</h2>
                  <div className="flex items-center gap-3 text-xs font-mono mt-1 flex-wrap">
                    <span className="text-[#C9A227] font-bold">{loteActivo.hectareas} HA</span>
                    <span className="px-2 py-0.5 rounded-full font-bold" style={{background:(cultivoActivoInfo?.color??"#6B7280")+"20",color:cultivoActivoInfo?.color??"#6B7280"}}>{loteActivo.cultivo_completo||loteActivo.cultivo||"SIN CULTIVO"}</span>
                    {(()=>{const e=ESTADOS.find(x=>x.v===loteActivo.estado);return e?<span className="px-2 py-0.5 rounded-full font-bold" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null;})()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={()=>{const ci3=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);setEditandoLote(loteActivo.id);setForm({nombre:loteActivo.nombre,hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",cultivo_key:ci3?ci3.cultivo+"|"+ci3.orden:"soja|1ra",fecha_siembra:loteActivo.fecha_siembra||"",fecha_cosecha:loteActivo.fecha_cosecha||"",variedad:loteActivo.variedad||loteActivo.hibrido||"",rendimiento_esperado:String(loteActivo.rendimiento_esperado||""),estado:loteActivo.estado||"planificado",observaciones:loteActivo.observaciones||""});setShowFormLote(true);}} className="px-3 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/25">✏️ EDITAR</button>
                <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0]});}} className="px-3 py-2 rounded-xl bg-[#4ADE80]/15 border border-[#4ADE80]/40 text-[#4ADE80] font-mono text-xs font-bold hover:bg-[#4ADE80]/25">+ LABOR</button>
                <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(mg.costo_labores),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});setShowFormMargen(true);}} className="px-3 py-2 rounded-xl bg-[#60A5FA]/15 border border-[#60A5FA]/40 text-[#60A5FA] font-mono text-xs font-bold hover:bg-[#60A5FA]/25">📊 MARGEN</button>
                {loteActivo.estado==="cosechado"&&admite2do&&segundosCultivos.length===0&&(
                  <button onClick={()=>{setForm({es_segundo_cultivo:"true",lote_base_id:loteActivo.id,nombre:loteActivo.nombre+" 2DO",hectareas:String(loteActivo.hectareas),tipo_tenencia:loteActivo.tipo_tenencia||"Propio",partido:loteActivo.partido||"",estado:"planificado",cultivo_key:"soja|2da"});setEditandoLote(null);setShowFormLote(true);}} className="px-3 py-2 rounded-xl bg-[#00FF80]/15 border border-[#00FF80]/40 text-[#00FF80] font-mono text-xs font-bold hover:bg-[#00FF80]/25">🔄 2DO CULTIVO</button>
                )}
                <button onClick={()=>eliminarLote(loteActivo.id)} className="px-3 py-2 rounded-xl border border-red-400/30 text-red-400 font-mono text-xs hover:bg-red-400/10">🗑</button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[{l:"TENENCIA",v:loteActivo.tipo_tenencia||"—",c:"#C9A227"},{l:"PARTIDO",v:loteActivo.partido||"—",c:"#9CA3AF"},{l:usaHibrido?"HIBRIDO":"VARIEDAD",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#4ADE80"},{l:"F. SIEMBRA",v:loteActivo.fecha_siembra||"SIN FECHA",c:"#60A5FA"},{l:"F. COSECHA",v:loteActivo.fecha_cosecha||"—",c:"#A78BFA"},{l:"REND. ESP.",v:loteActivo.rendimiento_esperado?loteActivo.rendimiento_esperado+" TN/HA":"—",c:"#C9A227"},{l:"MARGEN BRUTO",v:margenLote?"$"+Math.round(margenLote.margen_bruto).toLocaleString("es-AR"):"—",c:margenLote&&margenLote.margen_bruto>=0?"#4ADE80":"#F87171"},{l:"MB/HA",v:margenLote?"$"+Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")+"/HA":"—",c:"#C9A227"}].map(s=>(
                <div key={s.l} className="card-l p-3"><div className="text-xs text-[#4B5563] font-mono uppercase">{s.l}</div><div className="text-sm font-bold font-mono mt-1 uppercase" style={{color:s.c}}>{s.v}</div></div>
              ))}
            </div>

            {/* Form editar lote */}
            {showFormLote&&editandoLote&&(
              <div className="card-l p-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">✏️ EDITAR LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>HECTAREAS</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TENENCIA</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>{["Propio","Arrendado","Contrato accidental","Aparceria","Otro"].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                  <div><label className={lCls}>PARTIDO</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>CULTIVO</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="SOJA"><option value="soja|1ra">🌱 SOJA 1RA</option><option value="soja|2da">🌿 SOJA 2DA</option></optgroup>
                      <optgroup label="MAIZ"><option value="maiz|1ro_temprano">🌽 MAIZ 1RO</option><option value="maiz|1ro_tardio">🌽 MAIZ 1RO TARDIO</option><option value="maiz|2do">🌽 MAIZ 2DO</option></optgroup>
                      <optgroup label="INVIERNO"><option value="trigo|1ro">🌾 TRIGO 1RO</option><option value="cebada|1ra">🍃 CEBADA 1RA</option><option value="arveja|1ra">🫛 ARVEJA 1RA</option></optgroup>
                      <optgroup label="OTROS"><option value="girasol|1ro">🌻 GIRASOL 1RO</option><option value="girasol|2do">🌻 GIRASOL 2DO</option><option value="sorgo|1ro">🌿 SORGO 1RO</option><option value="sorgo|2do">🌿 SORGO 2DO</option><option value="vicia|cobertura">🌱 VICIA</option><option value="verdeo|invierno">🌾 VERDEO INV.</option><option value="verdeo|verano">🌾 VERDEO VER.</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{(()=>{const ci4=CULTIVOS_LISTA.find(c=>c.cultivo+"|"+c.orden===form.cultivo_key);return ci4?.usaHibrido?"HIBRIDO":"VARIEDAD";})()}</label><input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className={iCls} placeholder="DM4612, ALFORJA..."/></div>
                  <div><label className={lCls}>ESTADO</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                  <div><label className={lCls}>FECHA SIEMBRA</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>FECHA COSECHA</label><input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>REND. ESPERADO TN/HA</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#C9A227]/15">
                  <span className="text-xs text-[#4B5563] font-mono uppercase">ESTADO RAPIDO:</span>
                  <div className="flex gap-2 mt-2 flex-wrap">{ESTADOS.map(e=><button key={e.v} onClick={()=>setForm({...form,estado:e.v})} className="px-3 py-1.5 rounded-lg text-xs font-mono border font-bold" style={{borderColor:form.estado===e.v?e.c:e.c+"30",background:form.estado===e.v?e.c+"20":"transparent",color:e.c}}>{e.l}</button>)}</div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#C9A227]/15">
                  <span className="text-xs text-[#4B5563] font-mono uppercase">ADJUNTAR ANALISIS:</span>
                  <input ref={adjuntoRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await subirAdjunto(f,form.adjunto_tipo||"suelo");}}/>
                  <div className="flex gap-3 mt-2 flex-wrap">{[["suelo","🌍 SUELO"],["agua","💧 AGUA"],["otro","📎 OTRO"]].map(([tipo,label])=><button key={tipo} onClick={()=>{setForm({...form,adjunto_tipo:tipo});adjuntoRef.current?.click();}} className="px-3 py-2 rounded-lg border border-[#C9A227]/25 text-[#C9A227] text-xs font-mono hover:bg-[#C9A227]/10 font-bold">{label}</button>)}</div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Form margen */}
            {showFormMargen&&(
              <div className="card-l p-5">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-1">📊 MARGEN BRUTO — {loteActivo.nombre}</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">{loteActivo.cultivo_completo} · {loteActivo.hectareas} HA · USD ${usdUsado}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div><label className={lCls}>REND. ESPERADO TN/HA</label><input type="number" value={form.mg_rend_esp??""} onChange={e=>setForm({...form,mg_rend_esp:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>REND. REAL TN/HA</label><input type="number" value={form.mg_rend_real??""} onChange={e=>setForm({...form,mg_rend_real:e.target.value})} className={iCls} placeholder="AL COSECHAR"/></div>
                  <div><label className={lCls}>PRECIO $/TN</label><input type="number" value={form.mg_precio??""} onChange={e=>setForm({...form,mg_precio:e.target.value})} className={iCls}/></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[["mg_semilla","SEMILLAS"],["mg_fertilizante","FERTILIZANTES"],["mg_agroquimicos","AGROQUIMICOS"],["mg_labores","LABORES"],["mg_alquiler","ALQUILER"],["mg_flete","FLETE"],["mg_comercializacion","COMERCIALIZACION"],["mg_otros","OTROS"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} placeholder="0"/></div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={guardarMargen} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Form labor */}
            {showFormLabor&&(
              <div className="card-l p-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">{editandoLabor?"✏️ EDITAR":"+"} LABOR — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>TIPO</label><select value={form.tipo_lab??"Aplicacion"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className={iCls}>{TIPOS_LABOR.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion_lab??""} onChange={e=>setForm({...form,descripcion_lab:e.target.value})} className={iCls} placeholder="EJ: GLIFOSATO 4L/HA"/></div>
                  <div><label className={lCls}>SUPERFICIE HA</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>MAQUINARIA</label><input type="text" value={form.maquinaria??""} onChange={e=>setForm({...form,maquinaria:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>OPERARIO</label><input type="text" value={form.operario??ingenieroNombre} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>COSTO TOTAL $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Historial labores */}
            <div className="card-l overflow-hidden">
              <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3"><span className="text-[#C9A227] font-mono text-sm font-bold">📋 HISTORIAL DE LABORES</span><span className="text-xs text-[#4B5563] font-mono">{laboresLote.length} REGISTROS</span></div>
                <div className="flex gap-2">
                  <button onClick={exportarCuaderno} className="text-xs text-[#4ADE80] font-mono border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg hover:bg-[#4ADE80]/10 font-bold">📤 EXPORTAR</button>
                  <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");}} className="text-xs text-[#C9A227] font-mono border border-[#C9A227]/20 px-3 py-1.5 rounded-lg hover:bg-[#C9A227]/10 font-bold">📥 IMPORTAR</button>
                </div>
              </div>
              {showImportCuaderno&&(
                <div className="border-b border-[#C9A227]/15 bg-[#020810]/40 p-4">
                  <input ref={importCuadernoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelCuaderno(f);}}/>
                  {cuadernoPreview.length===0?<button onClick={()=>importCuadernoRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/30 rounded-xl text-[#C9A227] font-mono text-xs w-full justify-center">📁 SELECCIONAR ARCHIVO</button>:(
                    <div><div className="max-h-32 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15"><table className="w-full text-xs"><thead><tr className="border-b border-[#C9A227]/10">{["FECHA","TIPO","DESCRIPCION"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead><tbody>{cuadernoPreview.map((r,i)=><tr key={i} className="border-b border-[#C9A227]/5"><td className="px-3 py-2 text-[#E5E7EB] font-mono">{r.fecha}</td><td className="px-3 py-2 text-[#C9A227] font-mono">{r.tipo}</td><td className="px-3 py-2 text-[#9CA3AF] font-mono truncate max-w-xs">{r.descripcion}</td></tr>)}</tbody></table></div>
                    <div className="flex gap-3"><button onClick={confirmarImportCuaderno} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono">▶ IMPORTAR {cuadernoPreview.length}</button><button onClick={()=>setCuadernoPreview([])} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">CANCELAR</button></div></div>
                  )}
                  {cuadernoMsg&&<p className={"mt-2 text-xs font-mono "+(cuadernoMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]")}>{cuadernoMsg}</p>}
                </div>
              )}
              {laboresLote.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN LABORES</div>:(
                <table className="w-full"><thead><tr className="border-b border-[#C9A227]/10">{["FECHA","TIPO","DESCRIPCION","HA","OPERARIO","COSTO",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>(
                    <tr key={l.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                      <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{l.fecha}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono font-bold">{l.tipo}</span></td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{l.descripcion}</td>
                      <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{l.superficie_ha}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{l.operario||"—"}</td>
                      <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{l.costo_total?"$"+Number(l.costo_total).toLocaleString("es-AR"):"-"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,superficie_ha:String(l.superficie_ha),maquinaria:l.maquinaria,operario:l.operario,costo_total_lab:String(l.costo_total)});setShowFormLabor(true);}} className="text-[#C9A227] text-xs">✏️</button>
                        <button onClick={()=>eliminarLabor(l.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* VISTA PRINCIPAL */}
        {!loteActivo&&(
          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[{k:"lotes",l:"📋 LOTES"},{k:"margen",l:"📊 MARGEN"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as "lotes"|"margen")} className={"px-4 py-2 rounded-xl text-xs font-mono border transition-all font-bold "+(tab===t.k?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10":"border-[#C9A227]/15 text-[#4B5563] hover:text-[#9CA3AF]")}>{t.l}</button>
              ))}
              <div className="flex-1"/>
              <button onClick={()=>setShowImport(!showImport)} className="px-3 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/10">📥 IMPORTAR</button>
              <button onClick={exportarLotes} className="px-3 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-xs font-bold hover:bg-[#4ADE80]/10">📤 EXPORTAR</button>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/20">+ NUEVO LOTE</button>
            </div>

            {/* Import lotes */}
            {showImport&&(
              <div className="card-l p-5 mb-4">
                <div className="flex items-center justify-between mb-3"><h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR LOTES</h3><button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button></div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelLotes(f);}}/>
                {importPreview.length===0?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/40 rounded-xl text-[#C9A227] font-mono text-sm w-full justify-center hover:border-[#C9A227]/70">📁 SELECCIONAR ARCHIVO EXCEL</button>:(
                  <div><div className="max-h-40 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15"><table className="w-full text-xs"><thead><tr className="border-b border-[#C9A227]/10">{["LOTE","HA","CULTIVO","VAR/HIB","ACCION"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead><tbody>{importPreview.map((r,i)=><tr key={i} className="border-b border-[#C9A227]/5"><td className="px-3 py-2 text-[#E5E7EB] font-mono font-bold">{r.nombre}</td><td className="px-3 py-2 text-[#C9A227] font-mono">{r.hectareas||"—"}</td><td className="px-3 py-2 text-[#4ADE80] font-mono">{r.cultivo_completo||"—"}</td><td className="px-3 py-2 text-[#60A5FA] font-mono">{r.variedad||"—"}</td><td className="px-3 py-2"><span className={"text-xs px-2 py-0.5 rounded font-mono font-bold "+(r.accion==="crear"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#60A5FA]/10 text-[#60A5FA]")}>{r.accion==="crear"?"+ CREAR":"✎ ACTUALIZAR"}</span></td></tr>)}</tbody></table></div>
                  <div className="flex gap-3"><button onClick={confirmarImportLotes} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono hover:bg-[#C9A227]/20">▶ CONFIRMAR {importPreview.length} LOTES</button><button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">CAMBIAR</button></div></div>
                )}
                {importMsg&&<p className={"mt-2 text-xs font-mono "+(importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]")}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote&&!editandoLote&&(
              <div className="card-l p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ NUEVO LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="EL NORTE..."/></div>
                  <div><label className={lCls}>HECTAREAS *</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>CULTIVO</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="SOJA"><option value="soja|1ra">🌱 SOJA 1RA</option><option value="soja|2da">🌿 SOJA 2DA</option></optgroup>
                      <optgroup label="MAIZ"><option value="maiz|1ro_temprano">🌽 MAIZ 1RO</option><option value="maiz|1ro_tardio">🌽 MAIZ 1RO TARDIO</option><option value="maiz|2do">🌽 MAIZ 2DO</option></optgroup>
                      <optgroup label="INVIERNO"><option value="trigo|1ro">🌾 TRIGO 1RO</option><option value="cebada|1ra">🍃 CEBADA 1RA</option><option value="arveja|1ra">🫛 ARVEJA 1RA</option></optgroup>
                      <optgroup label="OTROS"><option value="girasol|1ro">🌻 GIRASOL 1RO</option><option value="girasol|2do">🌻 GIRASOL 2DO</option><option value="sorgo|1ro">🌿 SORGO 1RO</option><option value="sorgo|2do">🌿 SORGO 2DO</option><option value="vicia|cobertura">🌱 VICIA</option><option value="verdeo|invierno">🌾 VERDEO INV.</option><option value="verdeo|verano">🌾 VERDEO VER.</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA SIEMBRA</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TENENCIA</label><select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>{["Propio","Arrendado","Contrato accidental","Aparceria","Otro"].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                  <div><label className={lCls}>PARTIDO</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>ESTADO</label><select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>{ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}</select></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLote(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* KPIs + filtros + grafico */}
            <div className="flex items-start gap-3 mb-4 flex-wrap">
              <div className="flex gap-2 flex-shrink-0">
                {[{l:"LOTES",v:String(lotesPrincipales.length),c:"#E5E7EB"},{l:"HA",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"MB EST.",v:"$"+Math.round(margenes.filter(m=>m.estado==="estimado").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#4ADE80"},{l:"MB REAL",v:"$"+Math.round(margenes.filter(m=>m.estado==="real").reduce((a: number,m: any)=>a+m.margen_bruto,0)/1000)+"K",c:"#60A5FA"}].map(s=>(
                  <div key={s.l} className="card-l px-3 py-2 text-center" style={{minWidth:68}}><div className="text-xs text-[#4B5563] font-mono">{s.l}</div><div className="text-sm font-bold font-mono mt-0.5" style={{color:s.c}}>{s.v}</div></div>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center flex-1">
                <button onClick={()=>setFilterCultivo("todos")} className={"px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold "+(filterCultivo==="todos"?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/15":"border-[#C9A227]/20 text-[#4B5563] hover:text-[#9CA3AF]")}>TODOS ({lotesPrincipales.length})</button>
                {datosGrafico.map(d=>(
                  <button key={d.name} onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)} className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold" style={{borderColor:filterCultivo===d.name?d.color:d.color+"50",background:filterCultivo===d.name?d.color+"20":"transparent",color:filterCultivo===d.name?d.color:d.color+"80"}}>{d.name} · {d.value}HA</button>
                ))}
              </div>
              {datosGrafico.length>0&&(
                <div className="card-l p-3 flex items-center gap-3 flex-shrink-0">
                  <div style={{width:80,height:80}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={38} innerRadius={16} dataKey="value" labelLine={false} label={renderLabel} paddingAngle={2}>
                        {datosGrafico.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(2,8,16,0.5)" strokeWidth={2}/>)}
                      </Pie><Tooltip formatter={(v: any,n: string)=>[String(v)+" HA",n]} contentStyle={{background:"#0a1628",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"8px",fontFamily:"monospace",fontSize:"11px"}}/></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1" style={{minWidth:110}}>
                    {datosGrafico.map((d,i)=>(
                      <div key={i} className="flex items-center gap-1.5 cursor-pointer" onClick={()=>setFilterCultivo(filterCultivo===d.name?"todos":d.name)}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{background:d.color}}/>
                        <span className="text-xs font-mono flex-1 truncate" style={{color:d.color,maxWidth:75}}>{d.name}</span>
                        <span className="text-xs text-[#4B5563] font-mono">{d.value}HA</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lista lotes */}
            {tab==="lotes"&&(
              lotesPrincipales.length===0?(
                <div className="text-center py-20 card-l"><div className="text-5xl mb-4 opacity-20">🌾</div><p className="text-[#4B5563] font-mono mb-4">SIN LOTES — AGREGA EL PRIMERO</p><button onClick={()=>setShowFormLote(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold">+ AGREGAR PRIMER LOTE</button></div>
              ):(
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {lotesPrincipales.filter(lote=>{if(filterCultivo==="todos")return true;return(lote.cultivo_completo||lote.cultivo)===filterCultivo;}).map(lote=>{
                    const ci=getCultivoInfo(lote.cultivo||"",lote.cultivo_orden||"");
                    const mg=margenes.find(m=>m.lote_id===lote.id);
                    const labsCount=labores.filter(l=>l.lote_id===lote.id).length;
                    const est=ESTADOS.find(e=>e.v===lote.estado);
                    return(
                      <div key={lote.id} className="lote-card card-l overflow-hidden" onClick={()=>setLoteActivo(lote)}>
                        <div className="flex items-center gap-3 p-4 border-b border-[#C9A227]/10">
                          <div className="w-1 self-stretch rounded-full" style={{background:ci.color}}/>
                          <span className="text-xl">{ci.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white font-mono uppercase truncate">{lote.nombre}</div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs font-bold font-mono" style={{color:ci.color}}>{ci.label}</span>
                              {est&&<span className="text-xs px-1.5 py-0.5 rounded font-mono font-bold" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                            </div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminarLote(lote.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs font-mono">
                          <div className="text-center"><div className="text-[#4B5563]">HA</div><div className="font-bold text-[#C9A227] mt-0.5">{lote.hectareas}</div></div>
                          <div className="text-center"><div className="text-[#4B5563]">LABORES</div><div className="font-bold text-[#E5E7EB] mt-0.5">{labsCount}</div></div>
                          <div className="text-center"><div className="text-[#4B5563]">MB/HA</div><div className="font-bold mt-0.5" style={{color:mg?(mg.margen_bruto_ha>=0?"#4ADE80":"#F87171"):"#4B5563"}}>{mg?"$"+Math.round(mg.margen_bruto_ha).toLocaleString("es-AR"):"—"}</div></div>
                        </div>
                        {(lote.fecha_siembra||lote.variedad||lote.hibrido)&&<div className="px-4 pb-3 flex gap-3 text-xs font-mono text-[#6B7280]">{lote.fecha_siembra&&<span>🗓 {lote.fecha_siembra}</span>}{(lote.variedad||lote.hibrido)&&<span>🌱 {lote.variedad||lote.hibrido}</span>}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Margen general */}
            {tab==="margen"&&(
              <div className="card-l overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between"><span className="font-bold text-[#E5E7EB] font-mono">MARGEN BRUTO POR LOTE</span><span className="text-xs text-[#4B5563] font-mono">USD ${usdUsado}</span></div>
                {margenes.length===0?<div className="text-center py-12 text-[#4B5563] font-mono text-sm">SIN MARGENES — ENTRA A UN LOTE Y CARGA EL MARGEN</div>:(
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">{["LOTE","CULTIVO","HA","REND.","INGRESO","COSTO","MARGEN","MB/HA","ESTADO"].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {margenes.map((m: any)=>{
                        const lote=lotes.find(l=>l.id===m.lote_id);
                        const ci=getCultivoInfo(m.cultivo||"",m.cultivo_orden||"");
                        return(<tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 cursor-pointer" onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                          <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono text-sm">{lote?.nombre||"—"}</td>
                          <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold" style={{background:ci.color+"20",color:ci.color}}>{ci.icon} {ci.label}</span></td>
                          <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{m.hectareas}</td>
                          <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{m.rendimiento_real||m.rendimiento_esperado} TN/HA</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 text-sm text-[#F87171] font-mono">${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 font-bold font-mono text-sm" style={{color:m.margen_bruto>=0?"#4ADE80":"#F87171"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold" style={{background:m.estado==="real"?"rgba(74,222,128,0.15)":"rgba(201,162,39,0.15)",color:m.estado==="real"?"#4ADE80":"#C9A227"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel voz */}
      {vozPanel&&(
        <div className="fixed bottom-44 right-6 z-50 w-80 bg-[#0a1628]/97 border border-[#00FF80]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF80]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-[#00FF80] text-xs font-mono font-bold">🎤 ASISTENTE DE LOTES</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="px-4 pt-3 pb-2 min-h-20">
            {vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-8">{[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:(10+i*5)+"px"}}/>)}</div><span className="text-[#F87171] text-sm font-mono">ESCUCHANDO...</span></div>}
            {vozRespuesta&&<div className="bg-[#00FF80]/8 border border-[#00FF80]/20 rounded-lg px-3 py-2 mb-2"><p className="text-[#E5E7EB] text-sm font-mono">{vozRespuesta}</p></div>}
            {!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&(
              <div className="space-y-1 py-1">{["CUANTOS LOTES TENGO","NUEVO LOTE EL NORTE 150 HA SOJA","QUE LOTES ESTAN SEMBRADOS"].map(q=><button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>)}</div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribi o habla..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#00FF80]"/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"20",border:"1px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono">▶</button>}
          </div>
        </div>
      )}

      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 font-mono mt-6">AGROGESTION PRO · {productorNombre.toUpperCase()} · {modoCompartido?"COMPARTIDO":"INGENIERO"}</p>
      {ingenieroId&&<EscanerIA empresaId={ingenieroId}/>}
    </div>
  );
}

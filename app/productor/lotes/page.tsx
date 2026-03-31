"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import EscanerIA from "@/components/EscanerIA";

type Lote = {
  id: string; nombre: string; hectareas: number;
  tipo_tenencia: string; partido: string; provincia: string;
  cultivo: string; cultivo_orden: string; cultivo_completo: string;
  campana_id: string; fecha_siembra: string; fecha_cosecha?: string;
  variedad: string; hibrido: string;
  rendimiento_esperado: number; rendimiento_real: number;
  estado: string; es_segundo_cultivo: boolean;
  lote_id_primer_cultivo: string | null;
  observaciones: string;
};
type Campana = { id: string; nombre: string; año_inicio: number; año_fin: number; activa: boolean; };
type Labor = {
  id: string; lote_id: string; fecha: string; tipo: string; descripcion: string;
  superficie_ha: number; maquinaria: string; operario: string;
  costo_total: number; observaciones: string; metodo_carga: string;
};
type MargenDetalle = {
  id: string; lote_id: string; cultivo: string; cultivo_orden: string;
  hectareas: number; rendimiento_esperado: number; rendimiento_real: number;
  precio_tn: number; ingreso_bruto: number;
  costo_semilla: number; costo_fertilizante: number; costo_agroquimicos: number;
  costo_labores: number; costo_alquiler: number; costo_flete: number;
  costo_comercializacion: number; otros_costos: number;
  costo_directo_total: number; margen_bruto: number; margen_bruto_ha: number;
  margen_bruto_usd: number; cotizacion_usd: number; estado: string;
};

const CULTIVOS_LISTA = [
  { cultivo:"soja", orden:"1ra", label:"SOJA 1RA", color:"#4ADE80", icon:"🌱", admite2do:false, usaHibrido:false },
  { cultivo:"soja", orden:"2da", label:"SOJA 2DA", color:"#86EFAC", icon:"🌿", admite2do:false, usaHibrido:false },
  { cultivo:"maiz", orden:"1ro_temprano", label:"MAÍZ 1RO TEMPRANO", color:"#C9A227", icon:"🌽", admite2do:false, usaHibrido:true },
  { cultivo:"maiz", orden:"1ro_tardio", label:"MAÍZ 1RO TARDÍO", color:"#D97706", icon:"🌽", admite2do:false, usaHibrido:true },
  { cultivo:"maiz", orden:"2do", label:"MAÍZ 2DO", color:"#FCD34D", icon:"🌽", admite2do:false, usaHibrido:true },
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
const TIPOS_LABOR = ["Siembra","Aplicación","Fertilización","Cosecha","Labranza","Riego","Control malezas","Mantenimiento","Otro"];
const ESTADOS = [
  {v:"planificado",l:"PLANIFICADO",c:"#6B7280"},
  {v:"sembrado",l:"SEMBRADO",c:"#4ADE80"},
  {v:"en_desarrollo",l:"EN DESARROLLO",c:"#C9A227"},
  {v:"cosechado",l:"COSECHADO",c:"#60A5FA"},
  {v:"barbecho",l:"BARBECHO",c:"#A78BFA"},
];
const ORDEN_ESTACIONAL: Record<string,number> = {
  "arveja|1ra":1,"vicia|cobertura":2,"verdeo|invierno":3,"trigo|1ro":4,"cebada|1ra":5,
  "verdeo|verano":6,"soja|1ra":7,"maiz|1ro_temprano":8,"girasol|1ro":9,
  "maiz|1ro_tardio":10,"sorgo|1ro":11,"girasol|2do":12,"sorgo|2do":13,"soja|2da":14,"maiz|2do":15,
};

function getCultivoInfo(cultivo: string, orden: string) {
  if (!cultivo) return { cultivo:"", orden:"", label:"SIN CULTIVO", color:"#4B5563", icon:"🌾", admite2do:false, usaHibrido:false };
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { cultivo, orden, label:(cultivo||"").toUpperCase(), color:"#6B7280", icon:"🌱", admite2do:false, usaHibrido:false };
}

export default function LotesPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [margenes, setMargenes] = useState<MargenDetalle[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [usdUsado, setUsdUsado] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [tab, setTab] = useState<"lotes"|"margen">("lotes");
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
    const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
    if (!u) return;
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id);
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
    const { data: cot } = await sb.from("finanzas_cotizaciones").select("usd_usado").eq("empresa_id", emp.id).order("fecha", { ascending: false }).limit(1);
    setCampanas(camps ?? []);
    if (cot?.[0]) setUsdUsado(cot[0].usd_usado || 1);
    const activa = camps?.find(c => c.activa)?.id ?? camps?.[0]?.id ?? "";
    setCampanaActiva(activa);
    if (activa) await fetchLotes(emp.id, activa);
    setLoading(false);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const [ls, lbs, mgs] = await Promise.all([
      sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("nombre"),
      sb.from("lote_labores").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("margen_bruto_detalle").select("*").eq("empresa_id", eid),
    ]);
    setLotes(ls.data ?? []);
    setLabores(lbs.data ?? []);
    setMargenes(mgs.data ?? []);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(()=>setMsgExito(""), 4000); };

  // Gráfico: cultivo activo por fecha
  const getCultivoActivoDelLote = (lote: Lote): Lote => {
    if (!lote.cultivo) return lote;
    const segundos = lotes.filter(l => l.lote_id_primer_cultivo === lote.id);
    if (!segundos.length) return lote;
    const hoy = new Date();
    const fp = lote.fecha_siembra ? new Date(lote.fecha_siembra) : null;
    if (fp && fp <= hoy) {
      const seg = segundos.find(s => s.fecha_siembra && new Date(s.fecha_siembra) <= hoy);
      return seg ?? lote;
    }
    return [lote, ...segundos].sort((a,b) =>
      (ORDEN_ESTACIONAL[`${a.cultivo}|${a.cultivo_orden}`]??99) - (ORDEN_ESTACIONAL[`${b.cultivo}|${b.cultivo_orden}`]??99)
    )[0];
  };

  const datosGrafico = (() => {
    const mapa: Record<string,{ha:number;color:string}> = {};
    lotes.filter(l => !l.es_segundo_cultivo && l.cultivo && l.cultivo !== "null").forEach(lote => {
      const lv = getCultivoActivoDelLote(lote);
      const key = lv.cultivo_completo || lv.cultivo || "sin cultivo";
      const info = getCultivoInfo(lv.cultivo, lv.cultivo_orden);
      if (!mapa[key]) mapa[key] = { ha:0, color:info.color };
      mapa[key].ha += lote.hectareas || 0;
    });
    return Object.entries(mapa).filter(([,v])=>v.ha>0)
      .map(([name,v])=>({name,value:Math.round(v.ha*10)/10,color:v.color}))
      .sort((a,b)=>b.value-a.value);
  })();
  const totalHa = lotes.filter(l=>!l.es_segundo_cultivo).reduce((a,l)=>a+l.hectareas,0);

  // ===== CRUD LOTES =====
  const getCampanaId = async (sb: any): Promise<string> => {
    if (campanaActiva) return campanaActiva;
    const { data } = await sb.from("campanas").select("id,activa").eq("empresa_id", empresaId).order("año_inicio",{ascending:false});
    const c = data?.find((x:any)=>x.activa) ?? data?.[0];
    if (c) { setCampanaActiva(c.id); return c.id; }
    const anio = new Date().getFullYear();
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id:empresaId, nombre:`${anio}/${anio+1}`, año_inicio:anio, año_fin:anio+1, activa:true }).select().single();
    if (nueva) { setCampanaActiva(nueva.id); setCampanas(p=>[nueva,...p]); return nueva.id; }
    return "";
  };

  const guardarLote = async () => {
    if (!empresaId || !form.nombre?.trim()) { msg("❌ Ingresá el nombre del lote"); return; }
    const sb = await getSB();
    const cid = await getCampanaId(sb);
    if (!cid) { msg("❌ No se pudo obtener la campaña"); return; }
    const ci = CULTIVOS_LISTA.find(c => c.cultivo+"|"+c.orden === form.cultivo_key) || CULTIVOS_LISTA[0];
    const payload: Record<string,any> = {
      empresa_id: empresaId, campana_id: cid,
      nombre: form.nombre.trim(),
      hectareas: Number(form.hectareas??0),
      estado: form.estado??"planificado",
      es_segundo_cultivo: false,
    };
    if (form.cultivo_key) { payload.cultivo=ci.cultivo; payload.cultivo_orden=ci.orden; payload.cultivo_completo=ci.label; }
    if (form.tipo_tenencia) payload.tipo_tenencia=form.tipo_tenencia;
    if (form.partido?.trim()) payload.partido=form.partido.trim();
    if (form.provincia?.trim()) payload.provincia=form.provincia.trim();
    if (form.fecha_siembra) payload.fecha_siembra=form.fecha_siembra;
    if (form.fecha_cosecha) payload.fecha_cosecha=form.fecha_cosecha;
    if (form.variedad?.trim()) payload.variedad=form.variedad.trim();
    if (form.hibrido?.trim()) payload.hibrido=form.hibrido.trim();
    if (form.rendimiento_esperado) payload.rendimiento_esperado=Number(form.rendimiento_esperado);
    if (form.observaciones?.trim()) payload.observaciones=form.observaciones.trim();
    try {
      if (editandoLote) {
        const {error} = await sb.from("lotes").update(payload).eq("id",editandoLote);
        if (error) { msg("❌ "+error.message); return; }
        setEditandoLote(null);
        // Actualizar lote activo con los nuevos datos
        if (loteActivo?.id === editandoLote) {
          const {data:updated} = await sb.from("lotes").select("*").eq("id",editandoLote).single();
          if (updated) setLoteActivo(updated);
        }
      } else {
        const {error} = await sb.from("lotes").insert(payload);
        if (error) { msg("❌ "+error.message); return; }
      }
      msg("✅ LOTE GUARDADO");
      await fetchLotes(empresaId, cid);
      setShowFormLote(false); setForm({});
    } catch(e:any) { msg("❌ "+e.message); }
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("¿Eliminar lote?")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id",id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
    setLoteActivo(null);
  };

  const cambiarEstado = async (id: string, estado: string) => {
    const sb = await getSB();
    await sb.from("lotes").update({estado}).eq("id",id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
    if (loteActivo?.id===id) setLoteActivo({...loteActivo,estado});
  };

  // ===== CRUD LABORES =====
  const guardarLabor = async () => {
    if (!empresaId || !loteActivo) return;
    const sb = await getSB();
    const payload = {
      empresa_id:empresaId, lote_id:loteActivo.id, campana_id:campanaActiva,
      fecha:form.fecha_lab??new Date().toISOString().split("T")[0],
      tipo:form.tipo_lab??"Siembra", descripcion:form.descripcion_lab??"",
      superficie_ha:Number(form.superficie_ha??loteActivo.hectareas??0),
      maquinaria:form.maquinaria??"", operario:form.operario??"",
      costo_total:Number(form.costo_total_lab??0), observaciones:form.obs_lab??"",
      metodo_carga:"manual",
    };
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id",editandoLabor);
      setEditandoLabor(null);
    } else {
      await sb.from("lote_labores").insert(payload);
    }
    msg("✅ LABOR GUARDADA");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("¿Eliminar labor?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id",id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
  };

  // ===== MARGEN =====
  const guardarMargen = async () => {
    if (!empresaId || !loteActivo) return;
    const sb = await getSB();
    const ha = loteActivo.hectareas||0;
    const rend = Number(form.mg_rend_real||form.mg_rend_esp||0);
    const precio = Number(form.mg_precio||0);
    const ingBruto = ha*rend*precio;
    const cd = [form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,form.mg_labores,form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros].reduce((a,v)=>a+Number(v||0),0);
    const mb = ingBruto-cd;
    const existing = margenes.find(m=>m.lote_id===loteActivo.id);
    const payload = {
      empresa_id:empresaId, lote_id:loteActivo.id,
      cultivo:loteActivo.cultivo, cultivo_orden:loteActivo.cultivo_orden,
      hectareas:ha, rendimiento_esperado:Number(form.mg_rend_esp||0),
      rendimiento_real:Number(form.mg_rend_real||0), precio_tn:precio,
      ingreso_bruto:ingBruto,
      costo_semilla:Number(form.mg_semilla||0), costo_fertilizante:Number(form.mg_fertilizante||0),
      costo_agroquimicos:Number(form.mg_agroquimicos||0), costo_labores:Number(form.mg_labores||0),
      costo_alquiler:Number(form.mg_alquiler||0), costo_flete:Number(form.mg_flete||0),
      costo_comercializacion:Number(form.mg_comercializacion||0), otros_costos:Number(form.mg_otros||0),
      costo_directo_total:cd, margen_bruto:mb, margen_bruto_ha:ha>0?mb/ha:0,
      margen_bruto_usd:mb/usdUsado, cotizacion_usd:usdUsado,
      estado:form.mg_rend_real?"real":"estimado",
    };
    if (existing) await sb.from("margen_bruto_detalle").update(payload).eq("id",existing.id);
    else await sb.from("margen_bruto_detalle").insert(payload);
    msg("✅ MARGEN GUARDADO");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormMargen(false); setForm({});
  };

  // ===== ADJUNTAR ANÁLISIS =====
  const subirAdjunto = async (file: File, tipo: string) => {
    if (!empresaId || !loteActivo) return;
    try {
      const sb = await getSB();
      const ext = file.name.split(".").pop();
      const path = `${empresaId}/${loteActivo.id}/${tipo}_${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("lotes-adjuntos").upload(path, file, { upsert:true });
      if (error) { msg("❌ Error al subir: "+error.message); return; }
      try { await sb.from("lote_adjuntos").insert({ empresa_id:empresaId, lote_id:loteActivo.id, tipo, nombre:file.name, path }); } catch {}
      msg("✅ ARCHIVO ADJUNTADO");
    } catch(e:any) { msg("❌ "+e.message); }
  };

  // ===== IMPORT/EXPORT =====
  const exportarLotes = async () => {
    const XLSX = await import("xlsx");
    const data = lotes.filter(l=>!l.es_segundo_cultivo).map(l=>{
      const mg=margenes.find(m=>m.lote_id===l.id);
      return { LOTE:l.nombre, HECTAREAS:l.hectareas, CULTIVO:l.cultivo_completo||l.cultivo,
        VARIEDAD_HIBRIDO:l.variedad||l.hibrido||"", ESTADO:l.estado,
        FECHA_SIEMBRA:l.fecha_siembra||"", FECHA_COSECHA:l?.fecha_cosecha||"",
        TENENCIA:l.tipo_tenencia||"", PARTIDO:l.partido||"",
        REND_ESPERADO:l.rendimiento_esperado||0, REND_REAL:l.rendimiento_real||0,
        MARGEN_BRUTO:mg?Math.round(mg.margen_bruto):"", MB_HA:mg?Math.round(mg.margen_bruto_ha):"" };
    });
    const ws=XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:18},{wch:10},{wch:22},{wch:16},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:10},{wch:14},{wch:10}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Lotes");
    XLSX.writeFile(wb,`lotes_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarCuaderno = async () => {
    if (!loteActivo) return;
    const XLSX = await import("xlsx");
    const data = labores.filter(l=>l.lote_id===loteActivo.id).map(l=>({
      LOTE:loteActivo.nombre, FECHA:l.fecha, TIPO:l.tipo, DESCRIPCION:l.descripcion,
      SUPERFICIE_HA:l.superficie_ha, MAQUINARIA:l.maquinaria||"",
      OPERARIO:l.operario||"", COSTO_TOTAL:l.costo_total||0,
    }));
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Labores");
    XLSX.writeFile(wb,`cuaderno_${loteActivo.nombre}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const parseFecha = (v: any) => {
    const s=String(v).trim(); if(!s||s==="0") return null;
    if(!isNaN(Number(s))&&Number(s)>1000){const d=new Date((Number(s)-25569)*86400*1000);return d.toISOString().split("T")[0];}
    const p=s.split(/[\/\-]/);
    if(p.length===3){const y=p[2].length===2?"20"+p[2]:p[2];return `${y}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;}
    return s||null;
  };

  const leerExcelLotes = async (file: File) => {
    setImportMsg("LEYENDO ARCHIVO...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if (rows.length<2){setImportMsg("SIN DATOS");return;}
      const headers=rows[0].map((h:any)=>String(h).toLowerCase().trim());
      const ci=headers.findIndex((h:string)=>h.includes("lote")||h.includes("nombre")||h.includes("campo"));
      const ch=headers.findIndex((h:string)=>h.includes("ha")||h.includes("hect"));
      const cc=headers.findIndex((h:string)=>h.includes("cultivo"));
      const cp=headers.findIndex((h:string)=>h.includes("partido")||h.includes("localidad"));
      const cf=headers.findIndex((h:string)=>h.includes("fecha")&&h.includes("siem"));
      const cv=headers.findIndex((h:string)=>h.includes("varie")||h.includes("hibri"));
      const colNombre = ci>=0?ci:0;
      const preview = rows.slice(1).filter((r:any)=>r[colNombre]&&String(r[colNombre]).trim()).map((r:any)=>{
        const nombre=String(r[colNombre]).trim();
        const cultTexto=cc>=0?String(r[cc]).toLowerCase().trim():"";
        let cultivo=""; let orden="1ra";
        if(cultTexto){
          if(cultTexto.includes("maiz")||cultTexto.includes("maíz")){cultivo="maiz";orden=cultTexto.includes("2")?"2do":cultTexto.includes("tard")?"1ro_tardio":"1ro_temprano";}
          else if(cultTexto.includes("trigo")){cultivo="trigo";orden="1ro";}
          else if(cultTexto.includes("girasol")){cultivo="girasol";orden=cultTexto.includes("2")?"2do":"1ro";}
          else if(cultTexto.includes("sorgo")){cultivo="sorgo";orden=cultTexto.includes("2")?"2do":"1ro";}
          else if(cultTexto.includes("cebada")){cultivo="cebada";orden="1ra";}
          else if(cultTexto.includes("arveja")){cultivo="arveja";orden="1ra";}
          else if(cultTexto.includes("vicia")){cultivo="vicia";orden="cobertura";}
          else if(cultTexto.includes("soja")||cultTexto.includes("so")){cultivo="soja";orden=cultTexto.includes("2")?"2da":"1ra";}
          else{cultivo="otro";orden="1ro";}
        }
        const existe=lotes.find(l=>l.nombre.toLowerCase().trim()===nombre.toLowerCase());
        return {
          nombre, hectareas:ch>=0?(Number(r[ch])||0):0,
          cultivo:cultivo||null, cultivo_orden:orden,
          cultivo_completo:cultivo?getCultivoInfo(cultivo,orden).label:"",
          partido:cp>=0?String(r[cp]).trim():"",
          fecha_siembra:cf>=0?parseFecha(r[cf]):null,
          variedad:cv>=0?String(r[cv]).trim():"",
          accion:existe?"actualizar":"crear", id_existente:existe?.id??null,
        };
      });
      setImportPreview(preview);
      setImportMsg(`✅ ${preview.length} LOTES DETECTADOS — CONFIRMÁ PARA IMPORTAR`);
    } catch(e:any){setImportMsg("❌ "+e.message);}
  };

  const confirmarImportLotes = async () => {
    if (!empresaId||!importPreview.length) return;
    const sb=await getSB();
    const cid=await getCampanaId(sb);
    if(!cid){msg("❌ SIN CAMPAÑA ACTIVA");return;}
    let creados=0; let actualizados=0; const errores:string[]=[];
    for(const l of importPreview){
      try{
        if(l.accion==="actualizar"&&l.id_existente){
          const upd:Record<string,any>={hectareas:l.hectareas};
          if(l.cultivo){upd.cultivo=l.cultivo;upd.cultivo_orden=l.cultivo_orden;upd.cultivo_completo=l.cultivo_completo;}
          if(l.partido)upd.partido=l.partido;
          if(l.fecha_siembra)upd.fecha_siembra=l.fecha_siembra;
          if(l.variedad)upd.variedad=l.variedad;
          const{error}=await sb.from("lotes").update(upd).eq("id",l.id_existente);
          if(error)errores.push(l.nombre+": "+error.message);else actualizados++;
        }else{
          const ins:Record<string,any>={empresa_id:empresaId,campana_id:cid,nombre:l.nombre,hectareas:l.hectareas||0,estado:"planificado",es_segundo_cultivo:false};
          if(l.cultivo){ins.cultivo=l.cultivo;ins.cultivo_orden=l.cultivo_orden;ins.cultivo_completo=l.cultivo_completo;}
          if(l.partido)ins.partido=l.partido;
          if(l.fecha_siembra)ins.fecha_siembra=l.fecha_siembra;
          if(l.variedad)ins.variedad=l.variedad;
          const{error}=await sb.from("lotes").insert(ins);
          if(error)errores.push(l.nombre+": "+error.message);else creados++;
        }
      }catch(e:any){errores.push(l.nombre+": "+e.message);}
    }
    const total=creados+actualizados;
    if(total>0){
      msg(`✅ ${creados} CREADOS · ${actualizados} ACTUALIZADOS${errores.length?" · "+errores.length+" ERRORES":""}`);
      await fetchLotes(empresaId,cid);
      setImportPreview([]);setImportMsg("");setShowImport(false);
    }else{
      msg("❌ ERRORES: "+errores.slice(0,2).join(" | "));
      console.error("Import errors:",errores);
    }
  };

  const leerExcelCuaderno = async (file:File) => {
    if(!loteActivo)return;
    setCuadernoMsg("LEYENDO...");
    try{
      const XLSX=await import("xlsx");
      const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if(rows.length<2){setCuadernoMsg("SIN DATOS");return;}
      const headers=rows[0].map((h:any)=>String(h).toLowerCase().trim());
      const cf=headers.findIndex((h:string)=>h.includes("fecha"));
      const ct=headers.findIndex((h:string)=>h.includes("tipo"));
      const cd=headers.findIndex((h:string)=>h.includes("desc")||h.includes("product")||h.includes("obs")||h.includes("aplic"));
      if(cf===-1){setCuadernoMsg("❌ SIN COLUMNA FECHA");return;}
      const preview=rows.slice(1).filter((r:any)=>r[cf]).map((r:any)=>{
        const desc=cd>=0?String(r[cd]).trim():"";
        const tipo=ct>=0?String(r[ct]).trim():desc.toLowerCase().includes("siem")?"Siembra":desc.toLowerCase().includes("cosech")?"Cosecha":desc.toLowerCase().includes("fertil")?"Fertilización":"Aplicación";
        return{fecha:parseFecha(r[cf]),tipo,descripcion:desc};
      });
      setCuadernoPreview(preview);
      setCuadernoMsg(`✅ ${preview.length} LABORES DETECTADAS`);
    }catch(e:any){setCuadernoMsg("❌ "+e.message);}
  };

  const confirmarImportCuaderno = async () => {
    if(!empresaId||!loteActivo||!cuadernoPreview.length)return;
    const sb=await getSB();
    for(const l of cuadernoPreview){
      await sb.from("lote_labores").insert({empresa_id:empresaId,lote_id:loteActivo.id,campana_id:campanaActiva,fecha:l.fecha,tipo:l.tipo,descripcion:l.descripcion,superficie_ha:loteActivo.hectareas,metodo_carga:"excel"});
    }
    msg(`✅ ${cuadernoPreview.length} LABORES IMPORTADAS`);
    await fetchLotes(empresaId,campanaActiva);
    setCuadernoPreview([]);setCuadernoMsg("");setShowImportCuaderno(false);
  };

  // ===== VOZ =====
  const hablar = useCallback((texto:string)=>{
    if(typeof window==="undefined")return;
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(texto);
    utt.lang="es-AR";utt.rate=1.05;
    const v=window.speechSynthesis.getVoices().find(x=>x.lang.startsWith("es"));
    if(v)utt.voice=v;
    utt.onstart=()=>setVozEstado("respondiendo");
    utt.onend=()=>setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  },[]);

  const interpretarVoz = useCallback(async(texto:string)=>{
    setVozEstado("procesando");
    const resumen=lotes.slice(0,8).map(l=>`${l.nombre}: ${l.hectareas}ha ${l.cultivo_completo||l.cultivo} (${l.estado})`).join("; ");
    try{
      const res=await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,
          messages:[{role:"user",content:`Asistente de lotes agropecuarios. Lotes: ${resumen}. Usuario dijo: "${texto}". Respondé SOLO en JSON sin markdown: {"texto":"respuesta breve español argentino","accion":"consulta|crear_lote|registrar_labor","datos":{campos o null}}`}]})});
      const data=await res.json();
      const parsed=JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??"");hablar(parsed.texto??"");
      if(parsed.accion==="crear_lote"&&parsed.datos){
        const ci2=CULTIVOS_LISTA.find(c=>parsed.datos.cultivo?.toLowerCase().includes(c.cultivo));
        setForm({nombre:parsed.datos.nombre??"",hectareas:String(parsed.datos.hectareas??""),cultivo_key:ci2?`${ci2.cultivo}|${ci2.orden}`:"soja|1ra"});
        setShowFormLote(true);
      }
      setVozEstado("respondiendo");
    }catch{const e="No pude interpretar.";setVozRespuesta(e);hablar(e);setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);}
  },[lotes,hablar]);

  const escucharVoz=()=>{
    if(!("webkitSpeechRecognition"in window)&&!("SpeechRecognition"in window)){alert("Usá Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";rec.continuous=false;
    recRef.current=rec;setVozEstado("escuchando");setVozRespuesta("");setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setVozTranscripcion(t);interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  const VOZ_COLOR:{[k:string]:string}={idle:"#00FF80",escuchando:"#F87171",procesando:"#C9A227",respondiendo:"#60A5FA",error:"#F87171"};
  const VOZ_ICON:{[k:string]:string}={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};
  const iCls="w-full bg-[#020810]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all uppercase";
  const lCls="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const laboresLote = loteActivo ? labores.filter(l=>l.lote_id===loteActivo.id) : [];
  const margenLote = loteActivo ? margenes.find(m=>m.lote_id===loteActivo.id) : null;
  const segundosCultivos = loteActivo ? lotes.filter(l=>l.lote_id_primer_cultivo===loteActivo.id) : [];
  const cultivoActivoInfo = loteActivo ? getCultivoInfo(loteActivo.cultivo||"otro",loteActivo.cultivo_orden||"1ro") : null;
  const admite2do = cultivoActivoInfo?.admite2do ?? false;
  const usaHibrido = cultivoActivoInfo?.usaHibrido ?? false;

  const renderLabel=({cx,cy,midAngle,innerRadius,outerRadius,percent}:any)=>{
    if(percent<0.05)return null;
    const R=Math.PI/180;const r=innerRadius+(outerRadius-innerRadius)*0.55;
    const x=cx+r*Math.cos(-midAngle*R);const y=cy+r*Math.sin(-midAngle*R);
    return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="monospace" fontWeight="bold">{`${(percent*100).toFixed(0)}%`}</text>;
  };

  if(loading)return<div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">CARGANDO LOTES...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes wave{0%{transform:scaleY(0.5)}100%{transform:scaleY(1.5)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .card-l{background:rgba(10,22,40,0.85);border:1px solid rgba(201,162,39,0.18);border-radius:12px;transition:all 0.2s}
        .card-l:hover{border-color:rgba(201,162,39,0.4)}
        .lote-card:hover{border-color:rgba(0,255,128,0.5)!important;transform:translateY(-2px)}
        .lote-card{cursor:pointer;transition:all 0.2s}
        .logo-b{cursor:pointer;transition:all 0.2s}
        .logo-b:hover{filter:drop-shadow(0 0 12px rgba(0,255,128,0.8))}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:`linear-gradient(rgba(0,255,128,1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,1) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#00FF80,#C9A227,#00FF80,transparent)",backgroundSize:"200% 100%",animation:"gf 4s ease infinite"}}/>
        <div className="absolute inset-0 bg-[#020810]/95"/>
        <div className="relative px-6 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
            ← {loteActivo?"VOLVER":"DASHBOARD"}
          </button>
          <div className="flex-1"/>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4B5563] font-mono">📅 AÑO:</span>
            <span className="text-xs text-[#C9A227] font-mono border border-[#C9A227]/25 px-3 py-1.5 rounded-lg">
              {campanas.find(c=>c.id===campanaActiva)?.nombre || "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4B5563] font-mono">🌾 CAMPAÑA:</span>
            <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);if(empresaId)await fetchLotes(empresaId,e.target.value);}}
              className="bg-[#0a1628]/80 border border-[#00FF80]/25 rounded-lg px-3 py-1.5 text-[#00FF80] text-xs font-mono focus:outline-none uppercase">
              {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
            </select>
          </div>
          <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all uppercase font-bold"
            style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
            {VOZ_ICON[vozEstado]} VOZ
          </button>
          <div className="logo-b" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="" width={100} height={36} className="object-contain"/></div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-5">
        {msgExito&&<div className="mb-4 px-4 py-2 rounded-lg border border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5 text-sm font-mono font-bold flex items-center justify-between uppercase">{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* ===== DETALLE LOTE ===== */}
        {loteActivo && (
          <div className="space-y-4">
            {/* Banner lote */}
            <div className="card-l overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{background:cultivoActivoInfo?.color}}/>
                  <span className="text-3xl">{cultivoActivoInfo?.icon}</span>
                  <div>
                    <h2 className="text-2xl font-bold text-white font-mono uppercase">{loteActivo.nombre}</h2>
                    <div className="flex items-center gap-3 text-xs font-mono mt-1 flex-wrap">
                      <span className="text-[#C9A227] font-bold">{loteActivo.hectareas} HA</span>
                      <span className="px-2 py-0.5 rounded-full font-bold uppercase" style={{background:cultivoActivoInfo?.color+"20",color:cultivoActivoInfo?.color}}>{loteActivo.cultivo_completo||loteActivo.cultivo}</span>
                      {(() => { const e=ESTADOS.find(x=>x.v===loteActivo.estado); return e?<span className="px-2 py-0.5 rounded-full uppercase font-bold" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null; })()}
                      {loteActivo.variedad&&<span className="text-[#9CA3AF] uppercase">{usaHibrido?"HÍB":"VAR"}: {loteActivo.variedad||loteActivo.hibrido}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={()=>{
                    const ci3=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);
                    setEditandoLote(loteActivo.id);
                    setForm({
                      nombre:loteActivo.nombre, hectareas:String(loteActivo.hectareas),
                      tipo_tenencia:loteActivo.tipo_tenencia||"Propio",
                      partido:loteActivo.partido||"", provincia:loteActivo.provincia||"",
                      cultivo_key:ci3?`${ci3.cultivo}|${ci3.orden}`:"soja|1ra",
                      fecha_siembra:loteActivo.fecha_siembra||"",
                      fecha_cosecha:loteActivo.fecha_cosecha||"",
                      variedad:loteActivo.variedad||loteActivo.hibrido||"",
                      rendimiento_esperado:String(loteActivo.rendimiento_esperado||""),
                      estado:loteActivo.estado||"planificado",
                      observaciones:loteActivo.observaciones||"",
                    });
                    setShowFormLote(true);
                  }} className="px-3 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/25 uppercase">✏️ EDITAR</button>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({});}} className="px-3 py-2 rounded-xl bg-[#4ADE80]/15 border border-[#4ADE80]/40 text-[#4ADE80] font-mono text-xs font-bold hover:bg-[#4ADE80]/25 uppercase">+ LABOR</button>
                  <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(mg.costo_labores),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});setShowFormMargen(true);}} className="px-3 py-2 rounded-xl bg-[#60A5FA]/15 border border-[#60A5FA]/40 text-[#60A5FA] font-mono text-xs font-bold hover:bg-[#60A5FA]/25 uppercase">📊 MARGEN</button>
                  <button onClick={()=>eliminarLote(loteActivo.id)} className="px-3 py-2 rounded-xl border border-red-400/30 text-red-400 font-mono text-xs hover:bg-red-400/10 uppercase">🗑</button>
                </div>
              </div>
            </div>

            {/* Info rápida */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:"TENENCIA",v:loteActivo.tipo_tenencia||"—",c:"#C9A227"},
                {l:"PARTIDO",v:loteActivo.partido||"—",c:"#9CA3AF"},
                {l:usaHibrido?"HÍBRIDO":"VARIEDAD",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#4ADE80"},
                {l:"F. SIEMBRA",v:loteActivo.fecha_siembra||"SIN FECHA",c:"#60A5FA"},
                {l:"F. COSECHA",v:loteActivo?.fecha_cosecha||"—",c:"#A78BFA"},
                {l:"REND. ESPERADO",v:loteActivo.rendimiento_esperado?`${loteActivo.rendimiento_esperado} TN/HA`:"—",c:"#C9A227"},
                {l:"MARGEN BRUTO",v:margenLote?`$${Math.round(margenLote.margen_bruto).toLocaleString("es-AR")}`:"—",c:margenLote&&margenLote.margen_bruto>=0?"#4ADE80":"#F87171"},
                {l:"MB/HA",v:margenLote?`$${Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")}/HA`:"—",c:"#C9A227"},
              ].map(s=>(
                <div key={s.l} className="card-l p-3">
                  <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">{s.l}</div>
                  <div className="text-sm font-bold font-mono mt-1 uppercase" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* FORM EDITAR LOTE (dentro del detalle) */}
            {showFormLote && editandoLote && (
              <div className="card-l p-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4 uppercase">✏️ EDITAR LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>HECTÁREAS</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TENENCIA</label>
                    <select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>
                      {["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>PARTIDO</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>CULTIVO</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="── SOJA ──"><option value="soja|1ra">🌱 SOJA 1RA</option><option value="soja|2da">🌿 SOJA 2DA</option></optgroup>
                      <optgroup label="── MAÍZ ──"><option value="maiz|1ro_temprano">🌽 MAÍZ 1RO TEMPRANO</option><option value="maiz|1ro_tardio">🌽 MAÍZ 1RO TARDÍO</option><option value="maiz|2do">🌽 MAÍZ 2DO</option></optgroup>
                      <optgroup label="── INVIERNO ──"><option value="trigo|1ro">🌾 TRIGO 1RO</option><option value="cebada|1ra">🍃 CEBADA 1RA</option><option value="arveja|1ra">🫛 ARVEJA 1RA</option></optgroup>
                      <optgroup label="── OTROS ──"><option value="girasol|1ro">🌻 GIRASOL 1RO</option><option value="girasol|2do">🌻 GIRASOL 2DO</option><option value="sorgo|1ro">🌿 SORGO 1RO</option><option value="sorgo|2do">🌿 SORGO 2DO</option><option value="vicia|cobertura">🌱 VICIA COBERTURA</option><option value="verdeo|invierno">🌾 VERDEO INVIERNO</option><option value="verdeo|verano">🌾 VERDEO VERANO</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{(() => { const ci4=CULTIVOS_LISTA.find(c=>c.cultivo+"|"+c.orden===form.cultivo_key); return ci4?.usaHibrido?"HÍBRIDO":"VARIEDAD"; })()}</label>
                    <input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className={iCls} placeholder="EJ: DM4612, ALFORJA..."/>
                  </div>
                  <div><label className={lCls}>ESTADO</label>
                    <select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      {ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA SIEMBRA <span className="normal-case text-[#4B5563]">(opcional)</span></label>
                    <input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/>
                  </div>
                  <div><label className={lCls}>FECHA COSECHA <span className="normal-case text-[#4B5563]">(opcional)</span></label>
                    <input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className={iCls}/>
                  </div>
                  <div><label className={lCls}>REND. ESPERADO (TN/HA)</label>
                    <input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls} placeholder="0"/>
                  </div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label>
                    <input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/>
                  </div>
                </div>
                {/* Cambiar estado rápido */}
                <div className="mt-4 pt-4 border-t border-[#C9A227]/15">
                  <span className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">ESTADO RÁPIDO:</span>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {ESTADOS.map(e=>(
                      <button key={e.v} onClick={()=>setForm({...form,estado:e.v})}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all uppercase font-bold"
                        style={{borderColor:form.estado===e.v?e.c:e.c+"30",background:form.estado===e.v?e.c+"20":"transparent",color:e.c}}>
                        {e.l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Análisis suelo/agua */}
                <div className="mt-4 pt-4 border-t border-[#C9A227]/15">
                  <span className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">ADJUNTAR ANÁLISIS:</span>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    <input ref={adjuntoRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="hidden"
                      onChange={async e=>{const f=e.target.files?.[0];if(f){const tipo=form.adjunto_tipo||"suelo";await subirAdjunto(f,tipo);}}}/>
                    {[["suelo","🌍 ANÁLISIS SUELO"],["agua","💧 ANÁLISIS AGUA"],["otro","📎 OTRO ADJUNTO"]].map(([tipo,label])=>(
                      <button key={tipo} onClick={()=>{setForm({...form,adjunto_tipo:tipo});adjuntoRef.current?.click();}}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#C9A227]/25 text-[#C9A227] text-xs font-mono hover:bg-[#C9A227]/10 transition-all uppercase font-bold">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono uppercase hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono uppercase">CANCELAR</button>
                </div>
              </div>
            )}

            {/* FORM MARGEN */}
            {showFormMargen && (
              <div className="card-l p-5">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-1 uppercase">📊 MARGEN BRUTO — {loteActivo.nombre}</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4 uppercase">{loteActivo.cultivo_completo} · {loteActivo.hectareas} HA · USD ${usdUsado}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div><label className={lCls}>REND. ESPERADO (TN/HA)</label><input type="number" value={form.mg_rend_esp??""} onChange={e=>setForm({...form,mg_rend_esp:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>REND. REAL (TN/HA)</label><input type="number" value={form.mg_rend_real??""} onChange={e=>setForm({...form,mg_rend_real:e.target.value})} className={iCls} placeholder="AL COSECHAR"/></div>
                  <div><label className={lCls}>PRECIO $/TN</label><input type="number" value={form.mg_precio??""} onChange={e=>setForm({...form,mg_precio:e.target.value})} className={iCls}/></div>
                </div>
                <div className="text-xs text-[#C9A227] font-mono font-bold mb-2 uppercase tracking-wider">COSTOS DIRECTOS (TOTAL EN $)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[["mg_semilla","SEMILLAS"],["mg_fertilizante","FERTILIZANTES"],["mg_agroquimicos","AGROQUÍMICOS"],["mg_labores","LABORES"],["mg_alquiler","ALQUILER CAMPO"],["mg_flete","FLETE"],["mg_comercializacion","COMERCIALIZACIÓN"],["mg_otros","OTROS"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} placeholder="0"/></div>
                  ))}
                </div>
                {form.mg_precio&&form.mg_rend_esp&&(()=>{
                  const ha=loteActivo.hectareas||0;const rend=Number(form.mg_rend_real||form.mg_rend_esp||0);
                  const precio=Number(form.mg_precio||0);const ing=ha*rend*precio;
                  const cd=[form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,form.mg_labores,form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros].reduce((a,v)=>a+Number(v||0),0);
                  const mb=ing-cd;
                  return(<div className="p-3 bg-[#020810]/60 rounded-xl grid grid-cols-3 gap-3 text-xs font-mono mb-4">
                    {[{l:"INGRESO BRUTO",v:`$${Math.round(ing).toLocaleString("es-AR")}`,c:"#E5E7EB"},{l:"COSTO DIRECTO",v:`$${Math.round(cd).toLocaleString("es-AR")}`,c:"#F87171"},{l:"MARGEN BRUTO",v:`$${Math.round(mb).toLocaleString("es-AR")}`,c:mb>=0?"#4ADE80":"#F87171"},{l:"MB/HA",v:`$${ha>0?Math.round(mb/ha).toLocaleString("es-AR"):0}/HA`,c:"#C9A227"},{l:"MB USD",v:`USD ${Math.round(mb/usdUsado).toLocaleString("es-AR")}`,c:"#60A5FA"},{l:"ESTADO",v:form.mg_rend_real?"✅ REAL":"📋 ESTIMADO",c:form.mg_rend_real?"#4ADE80":"#C9A227"}].map(s=>(
                      <div key={s.l} className="text-center bg-[#0a1628]/60 rounded-lg p-2">
                        <div className="text-[#4B5563] mb-1 text-xs">{s.l}</div>
                        <div className="font-bold" style={{color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>);
                })()}
                <div className="flex gap-3">
                  <button onClick={guardarMargen} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono uppercase">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono uppercase">CANCELAR</button>
                </div>
              </div>
            )}

            {/* FORM LABOR */}
            {showFormLabor && (
              <div className="card-l p-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4 uppercase">{editandoLabor?"✏️ EDITAR":"+"} LABOR — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>TIPO</label>
                    <select value={form.tipo_lab??"Siembra"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className={iCls}>
                      {TIPOS_LABOR.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>DESCRIPCIÓN</label><input type="text" value={form.descripcion_lab??""} onChange={e=>setForm({...form,descripcion_lab:e.target.value})} className={iCls} placeholder="EJ: GLIFOSATO 4L/HA + 2,4D 0.5L/HA"/></div>
                  <div><label className={lCls}>SUPERFICIE (HA)</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>MAQUINARIA</label><input type="text" value={form.maquinaria??""} onChange={e=>setForm({...form,maquinaria:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>OPERARIO</label><input type="text" value={form.operario??""} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>COSTO TOTAL $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono uppercase">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono uppercase">CANCELAR</button>
                </div>
              </div>
            )}

            {/* HISTORIAL LABORES */}
            <div className="card-l overflow-hidden">
              <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#C9A227] font-mono text-sm font-bold uppercase">📋 HISTORIAL DE LABORES</span>
                  <span className="text-xs text-[#4B5563] font-mono">{laboresLote.length} REGISTROS</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={exportarCuaderno} className="text-xs text-[#4ADE80] font-mono border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg hover:bg-[#4ADE80]/10 uppercase font-bold">📤 EXPORTAR</button>
                  <button onClick={()=>{setShowImportCuaderno(!showImportCuaderno);setCuadernoPreview([]);setCuadernoMsg("");}} className="text-xs text-[#C9A227] font-mono border border-[#C9A227]/20 px-3 py-1.5 rounded-lg hover:bg-[#C9A227]/10 uppercase font-bold">📥 IMPORTAR</button>
                </div>
              </div>
              {showImportCuaderno&&(
                <div className="border-b border-[#C9A227]/15 bg-[#020810]/40 p-4">
                  <p className="text-xs text-[#4B5563] font-mono mb-3 uppercase">COLUMNAS: <span className="text-[#C9A227]">FECHA · TIPO · DESCRIPCION</span></p>
                  <input ref={importCuadernoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelCuaderno(f);}}/>
                  {cuadernoPreview.length===0?(
                    <button onClick={()=>importCuadernoRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/30 rounded-xl text-[#C9A227] font-mono text-xs w-full justify-center uppercase">📁 SELECCIONAR ARCHIVO</button>
                  ):(
                    <div>
                      <div className="max-h-36 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-[#C9A227]/10">{["FECHA","TIPO","DESCRIPCIÓN"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                          <tbody>{cuadernoPreview.map((r,i)=>(
                            <tr key={i} className="border-b border-[#C9A227]/5">
                              <td className="px-3 py-2 text-[#E5E7EB] font-mono">{r.fecha}</td>
                              <td className="px-3 py-2"><span className="bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono uppercase">{r.tipo}</span></td>
                              <td className="px-3 py-2 text-[#9CA3AF] font-mono truncate max-w-xs">{r.descripcion}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={confirmarImportCuaderno} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono uppercase">▶ IMPORTAR {cuadernoPreview.length} LABORES</button>
                        <button onClick={()=>setCuadernoPreview([])} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono uppercase">CANCELAR</button>
                      </div>
                    </div>
                  )}
                  {cuadernoMsg&&<p className={`mt-2 text-xs font-mono uppercase ${cuadernoMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]"}`}>{cuadernoMsg}</p>}
                </div>
              )}
              {laboresLote.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm uppercase">SIN LABORES REGISTRADAS</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["FECHA","TIPO","DESCRIPCIÓN","HA","MAQUINARIA","COSTO",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono uppercase">{h}</th>)}</tr></thead>
                  <tbody>{laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>(
                    <tr key={l.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                      <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{l.fecha}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono uppercase font-bold">{l.tipo}</span></td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{l.descripcion}</td>
                      <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{l.superficie_ha}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono uppercase">{l.maquinaria||"—"}</td>
                      <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{l.costo_total?`$${Number(l.costo_total).toLocaleString("es-AR")}`:"-"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,superficie_ha:String(l.superficie_ha),maquinaria:l.maquinaria,operario:l.operario,costo_total_lab:String(l.costo_total),obs_lab:l.observaciones});setShowFormLabor(true);}} className="text-[#C9A227] text-xs hover:underline">✏️</button>
                        <button onClick={()=>eliminarLabor(l.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VISTA PRINCIPAL ===== */}
        {!loteActivo && (
          <div>
            {/* Tabs + acciones */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[{k:"lotes",l:"📋 LOTES"},{k:"margen",l:"📊 MARGEN GENERAL"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono border transition-all font-bold uppercase ${tab===t.k?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10":"border-[#C9A227]/15 text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                  {t.l}
                </button>
              ))}
              <div className="flex-1"/>
              <button onClick={()=>setShowImport(!showImport)} className="px-3 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-xs transition-all uppercase font-bold">📥 IMPORTAR</button>
              <button onClick={exportarLotes} className="px-3 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-xs transition-all uppercase font-bold">📤 EXPORTAR</button>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/20 uppercase">
                + NUEVO LOTE
              </button>
            </div>

            {/* Import panel */}
            {showImport&&(
              <div className="card-l p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[#C9A227] font-mono text-sm font-bold uppercase">📥 IMPORTAR LOTES DESDE EXCEL</h3>
                  <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button>
                </div>
                <p className="text-xs text-[#4B5563] font-mono mb-3 uppercase">COLUMNAS DETECTADAS AUTOMÁTICAMENTE: <span className="text-[#C9A227]">LOTE · HECTAREAS · CULTIVO · FECHA_SIEMBRA · PARTIDO · VARIEDAD/HIBRIDO</span> — SOLO LOTE ES OBLIGATORIO</p>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelLotes(f);}}/>
                {importPreview.length===0?(
                  <button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/40 rounded-xl text-[#C9A227] font-mono text-sm w-full justify-center hover:border-[#C9A227]/70 transition-all uppercase">📁 SELECCIONAR ARCHIVO EXCEL</button>
                ):(
                  <div>
                    <div className="max-h-40 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-[#C9A227]/10">{["LOTE","HA","CULTIVO","F.SIEMBRA","PARTIDO","ACCIÓN"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=>(
                          <tr key={i} className="border-b border-[#C9A227]/5">
                            <td className="px-3 py-2 text-[#E5E7EB] font-mono font-bold uppercase">{r.nombre}</td>
                            <td className="px-3 py-2 text-[#C9A227] font-mono">{r.hectareas||"—"}</td>
                            <td className="px-3 py-2 text-[#4ADE80] font-mono uppercase">{r.cultivo_completo||"—"}</td>
                            <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.fecha_siembra||"—"}</td>
                            <td className="px-3 py-2 text-[#9CA3AF] font-mono uppercase">{r.partido||"—"}</td>
                            <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded font-mono uppercase font-bold ${r.accion==="crear"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#60A5FA]/10 text-[#60A5FA]"}`}>{r.accion==="crear"?"✚ CREAR":"✎ ACTUALIZAR"}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={confirmarImportLotes} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono uppercase hover:bg-[#C9A227]/20">▶ CONFIRMAR {importPreview.length} LOTES</button>
                      <button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono uppercase">CAMBIAR ARCHIVO</button>
                    </div>
                  </div>
                )}
                {importMsg&&<p className={`mt-2 text-xs font-mono uppercase ${importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]"}`}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo lote (vista principal) */}
            {showFormLote && !editandoLote && (
              <div className="card-l p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4 uppercase">+ NUEVO LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="EL NORTE, LA CAÑADA..."/></div>
                  <div><label className={lCls}>HECTÁREAS *</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>CULTIVO <span className="normal-case text-[#4B5563]">(opcional)</span></label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="── SOJA ──"><option value="soja|1ra">🌱 SOJA 1RA</option><option value="soja|2da">🌿 SOJA 2DA</option></optgroup>
                      <optgroup label="── MAÍZ ──"><option value="maiz|1ro_temprano">🌽 MAÍZ 1RO TEMPRANO</option><option value="maiz|1ro_tardio">🌽 MAÍZ 1RO TARDÍO</option><option value="maiz|2do">🌽 MAÍZ 2DO</option></optgroup>
                      <optgroup label="── INVIERNO ──"><option value="trigo|1ro">🌾 TRIGO 1RO</option><option value="cebada|1ra">🍃 CEBADA 1RA</option><option value="arveja|1ra">🫛 ARVEJA 1RA</option></optgroup>
                      <optgroup label="── OTROS ──"><option value="girasol|1ro">🌻 GIRASOL 1RO</option><option value="girasol|2do">🌻 GIRASOL 2DO</option><option value="sorgo|1ro">🌿 SORGO 1RO</option><option value="sorgo|2do">🌿 SORGO 2DO</option><option value="vicia|cobertura">🌱 VICIA COBERTURA</option><option value="verdeo|invierno">🌾 VERDEO INVIERNO</option><option value="verdeo|verano">🌾 VERDEO VERANO</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA SIEMBRA <span className="normal-case text-[#4B5563]">(opcional)</span></label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TENENCIA</label>
                    <select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>
                      {["Propio","Arrendado","Contrato accidental","Aparcería","Otro"].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>PARTIDO</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>ESTADO</label>
                    <select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      {ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono uppercase hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLote(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono uppercase">CANCELAR</button>
                </div>
              </div>
            )}

            {/* KPIs + Gráfico */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              {/* KPIs izquierda */}
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {l:"TOTAL LOTES",v:lotes.filter(l=>!l.es_segundo_cultivo).length+" LOTES",c:"#E5E7EB"},
                  {l:"HECTÁREAS",v:`${totalHa.toLocaleString("es-AR")} HA`,c:"#C9A227"},
                  {l:"MB ESTIMADO",v:`$${margenes.filter(m=>m.estado==="estimado").reduce((a,m)=>a+m.margen_bruto,0).toLocaleString("es-AR",{maximumFractionDigits:0})}`,c:"#4ADE80"},
                  {l:"MB REAL",v:`$${margenes.filter(m=>m.estado==="real").reduce((a,m)=>a+m.margen_bruto,0).toLocaleString("es-AR",{maximumFractionDigits:0})}`,c:"#60A5FA"},
                ].map(s=>(
                  <div key={s.l} className="card-l p-4 text-center">
                    <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">{s.l}</div>
                    <div className="text-lg font-bold font-mono mt-1 uppercase" style={{color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Gráfico derecha */}
              {datosGrafico.length>0&&(
                <div className="card-l p-4">
                  <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider mb-2">SUPERFICIE POR CULTIVO</div>
                  <div className="flex items-center gap-3">
                    <div style={{width:110,height:110,flexShrink:0}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={50} innerRadius={22} dataKey="value" labelLine={false} label={renderLabel} paddingAngle={2}>
                            {datosGrafico.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(2,8,16,0.5)" strokeWidth={2}/>)}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>[`${v} HA`,n]} contentStyle={{background:"#0a1628",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"8px",fontFamily:"monospace",fontSize:"11px"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {datosGrafico.map((d,i)=>{
                        const pct=totalHa>0?(d.value/totalHa*100).toFixed(0):"0";
                        return(
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:d.color}}/>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-mono uppercase truncate" style={{color:d.color}}>{d.name}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="flex-1 h-1 bg-[#1a2535] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{width:`${pct}%`,background:d.color}}/>
                                </div>
                                <span className="text-xs text-[#4B5563] font-mono">{d.value}HA</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lista lotes — grilla 3 columnas */}
            {tab==="lotes"&&(
              <div>
                {lotes.length===0?(
                  <div className="text-center py-20 card-l">
                    <div className="text-5xl mb-4 opacity-20">🌾</div>
                    <p className="text-[#4B5563] font-mono uppercase mb-4">SIN LOTES EN ESTA CAMPAÑA</p>
                    <button onClick={()=>setShowFormLote(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm uppercase font-bold">+ AGREGAR PRIMER LOTE</button>
                  </div>
                ):(
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {lotes.filter(l=>!l.es_segundo_cultivo).map(lote=>{
                      const ci=getCultivoInfo(lote.cultivo||"",lote.cultivo_orden||"");
                      const mg=margenes.find(m=>m.lote_id===lote.id);
                      const labsCount=labores.filter(l=>l.lote_id===lote.id).length;
                      const est=ESTADOS.find(e=>e.v===lote.estado);
                      const segundos=lotes.filter(l=>l.lote_id_primer_cultivo===lote.id);
                      return(
                        <div key={lote.id} className="lote-card card-l overflow-hidden" onClick={()=>setLoteActivo(lote)}>
                          <div className="flex items-center gap-3 p-4 border-b border-[#C9A227]/10">
                            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{background:ci.color}}/>
                            <span className="text-xl flex-shrink-0">{ci.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-white font-mono uppercase truncate">{lote.nombre}</div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs font-bold uppercase font-mono" style={{color:ci.color}}>{ci.label}</span>
                                {est&&<span className="text-xs px-1.5 py-0.5 rounded font-mono uppercase font-bold" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                                {segundos.length>0&&<span className="text-xs text-[#4ADE80] font-mono uppercase">+{segundos.length} 2DO</span>}
                              </div>
                            </div>
                            <button onClick={e=>{e.stopPropagation();eliminarLote(lote.id);}} className="text-[#4B5563] hover:text-red-400 text-xs flex-shrink-0 transition-colors">✕</button>
                          </div>
                          <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs font-mono">
                            <div className="text-center">
                              <div className="text-[#4B5563] uppercase">HA</div>
                              <div className="font-bold text-[#C9A227] mt-0.5">{lote.hectareas}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[#4B5563] uppercase">LABORES</div>
                              <div className="font-bold text-[#E5E7EB] mt-0.5">{labsCount}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[#4B5563] uppercase">MB/HA</div>
                              <div className="font-bold mt-0.5" style={{color:mg?mg.margen_bruto_ha>=0?"#4ADE80":"#F87171":"#4B5563"}}>
                                {mg?`$${Math.round(mg.margen_bruto_ha).toLocaleString("es-AR")}`:"—"}
                              </div>
                            </div>
                          </div>
                          {(lote.fecha_siembra||lote.variedad||lote.hibrido)&&(
                            <div className="px-4 pb-3 flex gap-3 text-xs font-mono text-[#6B7280] uppercase">
                              {lote.fecha_siembra&&<span>🗓 {lote.fecha_siembra}</span>}
                              {(lote.variedad||lote.hibrido)&&<span>🌱 {lote.variedad||lote.hibrido}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab margen general */}
            {tab==="margen"&&(
              <div className="card-l overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                  <span className="font-bold text-[#E5E7EB] font-mono uppercase">MARGEN BRUTO POR LOTE Y CULTIVO</span>
                  <span className="text-xs text-[#4B5563] font-mono uppercase">USD: ${usdUsado}</span>
                </div>
                {margenes.length===0?<div className="text-center py-12 text-[#4B5563] font-mono text-sm uppercase">SIN MÁRGENES CARGADOS — ENTRÁ A UN LOTE Y CARGÁ EL MARGEN</div>:(
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">{["LOTE","CULTIVO","HA","REND.","INGRESO","C.DIRECTO","MARGEN","MB/HA","MB USD","ESTADO"].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {margenes.map(m=>{
                        const lote=lotes.find(l=>l.id===m.lote_id);
                        const ci=getCultivoInfo(m.cultivo||"",m.cultivo_orden||"");
                        return(
                          <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 cursor-pointer" onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                            <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono text-sm uppercase">{lote?.nombre||"—"}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono uppercase font-bold" style={{background:ci.color+"20",color:ci.color}}>{ci.icon} {ci.label}</span></td>
                            <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{m.hectareas}</td>
                            <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{m.rendimiento_real||m.rendimiento_esperado} TN/HA</td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-sm text-[#F87171] font-mono">${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 font-bold font-mono text-sm" style={{color:m.margen_bruto>=0?"#4ADE80":"#F87171"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-sm text-[#60A5FA] font-mono">USD {Math.round(m.margen_bruto_usd).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono uppercase font-bold" style={{background:m.estado==="real"?"rgba(74,222,128,0.15)":"rgba(201,162,39,0.15)",color:m.estado==="real"?"#4ADE80":"#C9A227"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-[#C9A227]/30 bg-[#C9A227]/5">
                        <td colSpan={4} className="px-4 py-3 font-bold text-[#C9A227] font-mono text-sm uppercase">TOTALES</td>
                        <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono">${Math.round(margenes.reduce((a,m)=>a+m.ingreso_bruto,0)).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 font-bold text-[#F87171] font-mono">${Math.round(margenes.reduce((a,m)=>a+m.costo_directo_total,0)).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{color:margenes.reduce((a,m)=>a+m.margen_bruto,0)>=0?"#4ADE80":"#F87171"}}>${Math.round(margenes.reduce((a,m)=>a+m.margen_bruto,0)).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{totalHa>0?`$${Math.round(margenes.reduce((a,m)=>a+m.margen_bruto,0)/totalHa).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 font-bold text-[#60A5FA] font-mono">USD {Math.round(margenes.reduce((a,m)=>a+m.margen_bruto_usd,0)).toLocaleString("es-AR")}</td>
                        <td/>
                      </tr>
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
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-[#00FF80] text-xs font-mono font-bold uppercase">🎤 ASISTENTE DE LOTES</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="px-4 pt-3 pb-2 min-h-20">
            {vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-8">{[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:`${10+i*5}px`,animation:`wave ${0.3+i*0.1}s ease-in-out infinite alternate`}}/>)}</div><span className="text-[#F87171] text-sm font-mono uppercase">ESCUCHANDO...</span></div>}
            {vozRespuesta&&<div className="bg-[#00FF80]/8 border border-[#00FF80]/20 rounded-lg px-3 py-2 mb-2"><p className="text-[#E5E7EB] text-sm font-mono leading-relaxed">{vozRespuesta}</p></div>}
            {!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&(
              <div className="space-y-1 py-1">
                {["¿CUÁNTAS HECTÁREAS TENGO?","¿QUÉ LOTES ESTÁN SEMBRADOS?","NUEVO LOTE EL NORTE 150 HA SOJA"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-2 rounded-lg font-mono transition-all uppercase">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="ESCRIBÍ O HABLÁ..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#00FF80] uppercase"/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}}
              className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado]}}>
              {VOZ_ICON[vozEstado]}
            </button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono uppercase font-bold">▶</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:`2px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono mt-6 uppercase">© AGROGESTION PRO · LOTES Y CULTIVOS</p>
      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

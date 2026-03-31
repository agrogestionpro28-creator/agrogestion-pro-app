"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import EscanerIA from "@/components/EscanerIA";

// ===== TIPOS =====
type Lote = {
  id: string; nombre: string; hectareas: number; propietario: string;
  tipo_tenencia: string; partido: string; provincia: string;
  cultivo: string; cultivo_orden: string; cultivo_completo: string;
  campana_id: string; fecha_siembra: string; fecha_fin_ciclo: string;
  rendimiento_esperado: number; rendimiento_real: number;
  precio_venta_real: number; estado: string;
  es_segundo_cultivo: boolean; lote_id_primer_cultivo: string | null;
  lat: number; lng: number; poligono: any;
};
type Campana = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean; };
type Labor = {
  id: string; lote_id: string; fecha: string; tipo: string; descripcion: string;
  superficie_ha: number; maquinaria: string; operario: string;
  costo_total: number; observaciones: string; metodo_carga: string;
};
type AnioAgricola = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean; };
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

// ===== CULTIVOS CON ORDEN =====
const CULTIVOS_LISTA = [
  { cultivo:"soja", orden:"1ra", label:"Soja 1ra", color:"#4ADE80", icon:"🌱", esPrincipal:true },
  { cultivo:"soja", orden:"2da", label:"Soja 2da", color:"#86EFAC", icon:"🌿", esPrincipal:false },
  { cultivo:"maiz", orden:"1ro_temprano", label:"Maíz 1ro Temprano", color:"#C9A227", icon:"🌽", esPrincipal:true },
  { cultivo:"maiz", orden:"1ro_tardio", label:"Maíz 1ro Tardío", color:"#D97706", icon:"🌽", esPrincipal:true },
  { cultivo:"maiz", orden:"2do", label:"Maíz 2do", color:"#FCD34D", icon:"🌽", esPrincipal:false },
  { cultivo:"trigo", orden:"1ro", label:"Trigo 1ro", color:"#F59E0B", icon:"🌾", esPrincipal:true },
  { cultivo:"girasol", orden:"1ro", label:"Girasol 1ro", color:"#FBBF24", icon:"🌻", esPrincipal:true },
  { cultivo:"girasol", orden:"2do", label:"Girasol 2do", color:"#FDE68A", icon:"🌻", esPrincipal:false },
  { cultivo:"sorgo", orden:"1ro", label:"Sorgo 1ro", color:"#F87171", icon:"🌿", esPrincipal:true },
  { cultivo:"sorgo", orden:"2do", label:"Sorgo 2do", color:"#FCA5A5", icon:"🌿", esPrincipal:false },
  { cultivo:"cebada", orden:"1ra", label:"Cebada 1ra", color:"#A78BFA", icon:"🍃", esPrincipal:true },
  { cultivo:"arveja", orden:"1ra", label:"Arveja 1ra", color:"#34D399", icon:"🫛", esPrincipal:true },
  { cultivo:"vicia", orden:"cobertura", label:"Vicia (cobertura)", color:"#6EE7B7", icon:"🌱", esPrincipal:false },
  { cultivo:"verdeo", orden:"invierno", label:"Verdeo Invierno", color:"#60A5FA", icon:"🌾", esPrincipal:false },
  { cultivo:"verdeo", orden:"verano", label:"Verdeo Verano", color:"#93C5FD", icon:"🌾", esPrincipal:false },
];

// Cultivos que van PRIMERO en el lote (habilitan un 2do cultivo)
const CULTIVOS_QUE_HABILITAN_2DO = ["trigo","cebada","arveja","vicia","verdeo"];
// Cultivos de 2da que van DESPUÉS de otro
const CULTIVOS_SEGUNDA = ["soja_2da","maiz_2do","girasol_2do","sorgo_2do"];

const TIPOS_LABOR = ["Siembra","Aplicación","Fertilización","Cosecha","Labranza","Riego","Control malezas","Mantenimiento","Otro"];
const TIPOS_TENENCIA = ["Propio","Arrendado","Contrato accidental","Aparcería","Otro"];

function getCultivoInfo(cultivo: string, orden: string) {
  return CULTIVOS_LISTA.find(c => c.cultivo === cultivo && c.orden === orden) || 
         CULTIVOS_LISTA.find(c => c.cultivo === cultivo) ||
         { cultivo, orden, label: `${cultivo} ${orden}`, color:"#6B7280", icon:"🌱", esPrincipal:true };
}

// ===== COMPONENTE PRINCIPAL =====
export default function LotesPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [aniosAgricolas, setAniosAgricolas] = useState<AnioAgricola[]>([]);
  const [margenes, setMargenes] = useState<MargenDetalle[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [anioActivo, setAnioActivo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [tab, setTab] = useState<"mapa"|"lista"|"margen">("lista");
  const [showFormLote, setShowFormLote] = useState(false);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [showFormMargen, setShowFormMargen] = useState(false);
  const [showFormAnio, setShowFormAnio] = useState(false);
  const [editandoLote, setEditandoLote] = useState<string|null>(null);
  const [editandoLabor, setEditandoLabor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [usdUsado, setUsdUsado] = useState(1);

  // VOZ
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
    // Campañas existentes
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("fecha_inicio", { ascending: false });
    const { data: anios } = await sb.from("anio_agricola").select("*").eq("empresa_id", emp.id).order("fecha_inicio", { ascending: false });
    const { data: cot } = await sb.from("finanzas_cotizaciones").select("usd_usado").eq("empresa_id", emp.id).order("fecha", { ascending: false }).limit(1);
    setCampanas(camps ?? []);
    setAniosAgricolas(anios ?? []);
    if (cot?.[0]) setUsdUsado(cot[0].usd_usado || 1);
    const activa = camps?.find(c => c.activo)?.id ?? camps?.[0]?.id ?? "";
    const anioAct = anios?.find(a => a.activo)?.id ?? anios?.[0]?.id ?? "";
    setCampanaActiva(activa);
    setAnioActivo(anioAct);
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

  const msg = (t: string) => { setMsgExito(t); setTimeout(()=>setMsgExito(""),3000); };

  // ===== DATOS GRÁFICO — muestra cultivo activo/próximo por fecha, sin duplicar ha =====
  const ORDEN_ESTACIONAL: Record<string,number> = {
    "arveja|1ra":1,"vicia|cobertura":2,"verdeo|invierno":3,
    "trigo|1ro":4,"cebada|1ra":5,"verdeo|verano":6,
    "soja|1ra":7,"maiz|1ro_temprano":8,"girasol|1ro":9,
    "maiz|1ro_tardio":10,"sorgo|1ro":11,"girasol|2do":12,
    "sorgo|2do":13,"soja|2da":14,"maiz|2do":15,
  };

  const getCultivoActivoDelLote = (lote: Lote): Lote => {
    const segundos = lotes.filter(l => l.lote_id_primer_cultivo === lote.id);
    if (segundos.length === 0) return lote;
    const hoy = new Date();
    const fechaPrincipal = lote.fecha_siembra ? new Date(lote.fecha_siembra) : null;
    // Si el principal ya fue sembrado, ver si el 2do también
    if (fechaPrincipal && fechaPrincipal <= hoy) {
      const seg2Sembrado = segundos.find(s => s.fecha_siembra && new Date(s.fecha_siembra) <= hoy);
      return seg2Sembrado ?? lote;
    }
    // Sin fecha o fecha futura: mostrar el más próximo estacionalmente
    const todos = [lote, ...segundos];
    todos.sort((a,b) => {
      const oa = ORDEN_ESTACIONAL[`${a.cultivo}|${a.cultivo_orden}`] ?? 99;
      const ob = ORDEN_ESTACIONAL[`${b.cultivo}|${b.cultivo_orden}`] ?? 99;
      return oa - ob;
    });
    return todos[0];
  };

  const datosGrafico = (() => {
    const mapa: Record<string, { ha: number; color: string; icon: string }> = {};
    lotes.filter(l => !l.es_segundo_cultivo && l.cultivo).forEach(lote => {
      const loteVis = getCultivoActivoDelLote(lote);
      const key = loteVis.cultivo_completo || `${loteVis.cultivo} ${loteVis.cultivo_orden}`.trim();
      const info = getCultivoInfo(loteVis.cultivo, loteVis.cultivo_orden);
      if (!mapa[key]) mapa[key] = { ha: 0, color: info.color, icon: info.icon };
      mapa[key].ha += lote.hectareas || 0; // siempre ha del lote BASE
    });
    return Object.entries(mapa)
      .filter(([,v]) => v.ha > 0)
      .map(([name, v]) => ({ name, value: Math.round(v.ha*10)/10, color: v.color, icon: v.icon }))
      .sort((a,b) => b.value - a.value);
  })();

  const totalHaUnicas = lotes.filter(l => !l.es_segundo_cultivo).reduce((a,l) => a+l.hectareas,0);

  // ===== CRUD LOTES =====
  const guardarLote = async () => {
    if (!empresaId || !form.nombre) return;
    const sb = await getSB();
    const cultivoInfo = CULTIVOS_LISTA.find(c => c.cultivo+"|"+c.orden === form.cultivo_key) || CULTIVOS_LISTA[0];
    const esSeg = form.es_segundo_cultivo === "true";
    const payload = {
      empresa_id: empresaId,
      campana_id: campanaActiva,
      nombre: form.nombre,
      hectareas: Number(form.hectareas ?? 0),
      propietario: form.propietario ?? "",
      tipo_tenencia: form.tipo_tenencia ?? "Propio",
      partido: form.partido ?? "",
      provincia: form.provincia ?? "",
      cultivo: cultivoInfo.cultivo,
      cultivo_orden: cultivoInfo.orden,
      cultivo_completo: cultivoInfo.label,
      fecha_siembra: form.fecha_siembra || null,
      fecha_fin_ciclo: form.fecha_fin_ciclo || null,
      rendimiento_esperado: Number(form.rendimiento_esperado ?? 0),
      rendimiento_real: Number(form.rendimiento_real ?? 0),
      precio_venta_real: Number(form.precio_venta_real ?? 0),
      estado: form.estado ?? "planificado",
      es_segundo_cultivo: esSeg,
      lote_id_primer_cultivo: esSeg && form.lote_base_id ? form.lote_base_id : null,
    };
    if (editandoLote) {
      await sb.from("lotes").update(payload).eq("id", editandoLote);
      setEditandoLote(null);
    } else {
      await sb.from("lotes").insert(payload);
    }
    msg("✅ Lote guardado");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLote(false); setForm({});
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("¿Eliminar lote? Se eliminan también sus labores.")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id", id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
    setLoteActivo(null);
  };

  const cambiarEstado = async (id: string, estado: string) => {
    const sb = await getSB();
    await sb.from("lotes").update({ estado }).eq("id", id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
  };

  // ===== CRUD LABORES =====
  const guardarLabor = async () => {
    if (!empresaId || !loteActivo) return;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId,
      lote_id: loteActivo.id,
      campana_id: campanaActiva,
      fecha: form.fecha_lab ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_lab ?? "Siembra",
      descripcion: form.descripcion_lab ?? "",
      superficie_ha: Number(form.superficie_ha ?? loteActivo.hectareas ?? 0),
      maquinaria: form.maquinaria ?? "",
      operario: form.operario ?? "",
      costo_total: Number(form.costo_total_lab ?? 0),
      observaciones: form.obs_lab ?? "",
      metodo_carga: "manual",
    };
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id", editandoLabor);
      setEditandoLabor(null);
    } else {
      await sb.from("lote_labores").insert(payload);
    }
    // Descontar insumos automáticamente si es aplicación o fertilización
    if ((form.tipo_lab === "Aplicación" || form.tipo_lab === "Fertilización") && form.insumo_id && form.insumo_cantidad) {
      const insumo = await sb.from("stock_insumos").select("cantidad").eq("id", form.insumo_id).single();
      if (insumo.data) {
        const nueva = Math.max(0, insumo.data.cantidad - Number(form.insumo_cantidad));
        await sb.from("stock_insumos").update({ cantidad: nueva }).eq("id", form.insumo_id);
        msg("✅ Labor guardada + insumo descontado");
      }
    } else {
      msg("✅ Labor guardada");
    }
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("¿Eliminar labor?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
  };

  // ===== CRUD MARGEN =====
  const guardarMargen = async () => {
    if (!empresaId || !loteActivo) return;
    const sb = await getSB();
    const ha = loteActivo.hectareas || Number(form.mg_ha || 0);
    const rend = Number(form.mg_rend_real || form.mg_rend_esp || 0);
    const precio = Number(form.mg_precio || 0);
    const ingBruto = ha * rend * precio;
    const cd = Number(form.mg_semilla||0)+Number(form.mg_fertilizante||0)+Number(form.mg_agroquimicos||0)+Number(form.mg_labores||0)+Number(form.mg_alquiler||0)+Number(form.mg_flete||0)+Number(form.mg_comercializacion||0)+Number(form.mg_otros||0);
    const mb = ingBruto - cd;
    const mbHa = ha > 0 ? mb/ha : 0;
    const cultivoInfo = getCultivoInfo(loteActivo.cultivo, loteActivo.cultivo_orden);
    const existing = margenes.find(m => m.lote_id === loteActivo.id);
    const payload = {
      empresa_id: empresaId,
      anio_agricola_id: anioActivo || null,
      lote_id: loteActivo.id,
      cultivo: loteActivo.cultivo,
      cultivo_orden: loteActivo.cultivo_orden,
      hectareas: ha,
      rendimiento_esperado: Number(form.mg_rend_esp || 0),
      rendimiento_real: Number(form.mg_rend_real || 0),
      precio_tn: precio,
      ingreso_bruto: ingBruto,
      costo_semilla: Number(form.mg_semilla||0),
      costo_fertilizante: Number(form.mg_fertilizante||0),
      costo_agroquimicos: Number(form.mg_agroquimicos||0),
      costo_labores: Number(form.mg_labores||0),
      costo_alquiler: Number(form.mg_alquiler||0),
      costo_flete: Number(form.mg_flete||0),
      costo_comercializacion: Number(form.mg_comercializacion||0),
      otros_costos: Number(form.mg_otros||0),
      costo_directo_total: cd,
      margen_bruto: mb,
      margen_bruto_ha: mbHa,
      margen_bruto_usd: mb / usdUsado,
      cotizacion_usd: usdUsado,
      estado: form.mg_rend_real ? "real" : "estimado",
      updated_at: new Date().toISOString(),
    };
    if (existing) await sb.from("margen_bruto_detalle").update(payload).eq("id", existing.id);
    else await sb.from("margen_bruto_detalle").insert(payload);
    // Actualizar rendimiento real en lote
    if (form.mg_rend_real) await sb.from("lotes").update({ rendimiento_real: Number(form.mg_rend_real), precio_venta_real: precio }).eq("id", loteActivo.id);
    msg("✅ Margen guardado");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormMargen(false); setForm({});
  };

  // Guardar año agrícola
  const guardarAnioAgricola = async () => {
    if (!empresaId || !form.anio_nombre) return;
    const sb = await getSB();
    if (form.anio_activo === "true") await sb.from("anio_agricola").update({ activo: false }).eq("empresa_id", empresaId);
    await sb.from("anio_agricola").insert({
      empresa_id: empresaId, nombre: form.anio_nombre,
      fecha_inicio: form.anio_inicio || `${new Date().getFullYear()}-05-20`,
      fecha_fin: form.anio_fin || `${new Date().getFullYear()+1}-05-19`,
      activo: form.anio_activo === "true",
    });
    const { data: anios } = await sb.from("anio_agricola").select("*").eq("empresa_id", empresaId).order("fecha_inicio", { ascending: false });
    setAniosAgricolas(anios ?? []);
    msg("✅ Año agrícola guardado"); setShowFormAnio(false); setForm({});
  };

  // ===== VOZ =====
  const hablar = useCallback((texto: string) => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "es-AR"; utt.rate = 1.05;
    const voces = window.speechSynthesis.getVoices();
    const voz = voces.find(v => v.lang.startsWith("es")) || voces[0];
    if (voz) utt.voice = voz;
    utt.onstart = () => setVozEstado("respondiendo");
    utt.onend = () => setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const resumen = lotes.slice(0,8).map(l => `${l.nombre}: ${l.hectareas}ha ${l.cultivo_completo||l.cultivo} (${l.estado})`).join("; ");
    try {
      const res = await fetch("/api/scanner", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:500,
          messages:[{role:"user",content:`Asistente de lotes agropecuarios. Lotes actuales: ${resumen}. El productor dijo: "${texto}". Respondé SOLO en JSON sin markdown: {"texto":"respuesta breve español argentino","accion":"consulta|crear_lote|registrar_labor|otro","datos":{campos o null}}`}]
        })
      });
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??"");
      hablar(parsed.texto??"");
      if (parsed.accion === "crear_lote" && parsed.datos) {
        const ci = CULTIVOS_LISTA.find(c => parsed.datos.cultivo?.toLowerCase().includes(c.cultivo));
        setForm({ nombre: parsed.datos.nombre??"", hectareas: String(parsed.datos.hectareas??""), cultivo_key: ci?`${ci.cultivo}|${ci.orden}`:"soja|1ra" });
        setShowFormLote(true);
      } else if (parsed.accion === "registrar_labor" && parsed.datos && loteActivo) {
        setForm({ tipo_lab: parsed.datos.tipo??"Aplicación", descripcion_lab: parsed.datos.descripcion??"", fecha_lab: new Date().toISOString().split("T")[0] });
        setShowFormLabor(true);
      }
      setVozEstado("respondiendo");
    } catch {
      const err = "No pude interpretar. Intentá de nuevo.";
      setVozRespuesta(err); hablar(err); setVozEstado("error");
      setTimeout(()=>setVozEstado("idle"),2000);
    }
  }, [lotes, loteActivo, hablar]);

  const escucharVoz = () => {
    if (!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)){alert("Usá Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR(); rec.lang="es-AR"; rec.continuous=false;
    recRef.current=rec; setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setVozTranscripcion(t);interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  const VOZ_COLOR:{[k:string]:string}={idle:"#00FF80",escuchando:"#F87171",procesando:"#C9A227",respondiendo:"#60A5FA",error:"#F87171"};
  const VOZ_ICON:{[k:string]:string}={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};

  const iCls="w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const ESTADOS=[{v:"planificado",l:"📋 Planificado",c:"#6B7280"},{v:"sembrado",l:"🌱 Sembrado",c:"#4ADE80"},{v:"en_desarrollo",l:"📈 En desarrollo",c:"#C9A227"},{v:"cosechado",l:"🌾 Cosechado",c:"#60A5FA"},{v:"barbecho",l:"🟤 Barbecho",c:"#A78BFA"}];

  if(loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">Cargando lotes...</div>;

  // Margen del lote activo
  const margenLote = loteActivo ? margenes.find(m => m.lote_id === loteActivo.id) : null;
  const laboresLote = loteActivo ? labores.filter(l => l.lote_id === loteActivo.id) : [];
  const segundosCultivos = loteActivo ? lotes.filter(l => l.lote_id_primer_cultivo === loteActivo.id) : [];

  // CUSTOM LABEL para el gráfico
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="monospace" fontWeight="bold">{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes wave{0%{transform:scaleY(0.5)}100%{transform:scaleY(1.5)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .card-l{background:rgba(10,22,40,0.8);border:1px solid rgba(201,162,39,0.15);border-radius:14px;transition:all 0.2s}
        .card-l:hover{border-color:rgba(201,162,39,0.4);transform:translateY(-2px)}
        .logo-b{cursor:pointer;transition:all 0.2s}
        .logo-b:hover{filter:drop-shadow(0 0 12px rgba(0,255,128,0.8))}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:`linear-gradient(rgba(0,255,128,1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,1) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#00FF80,#C9A227,#00FF80,transparent)",backgroundSize:"200% 100%",animation:"gf 4s ease infinite"}}/>
        <div className="absolute inset-0" style={{background:"rgba(2,8,16,0.95)"}}/>
        <div className="relative px-6 py-4 flex items-center gap-4 flex-wrap">
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
            ← {loteActivo?"Volver a lotes":"Dashboard"}
          </button>
          <div className="flex-1"/>

          {/* Selector año agrícola */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4B5563] font-mono">📅 Año:</span>
            <select value={anioActivo} onChange={e=>setAnioActivo(e.target.value)}
              className="bg-[#0a1628]/80 border border-[#C9A227]/25 rounded-lg px-3 py-1.5 text-[#C9A227] text-xs font-mono focus:outline-none">
              <option value="">Sin año agrícola</option>
              {aniosAgricolas.map(a=><option key={a.id} value={a.id}>{a.nombre}{a.activo?" ★":""}</option>)}
            </select>
            <button onClick={()=>setShowFormAnio(true)} className="text-[#C9A227] text-xs font-mono border border-[#C9A227]/25 px-2 py-1.5 rounded-lg hover:bg-[#C9A227]/10">+</button>
          </div>

          {/* Selector campaña */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4B5563] font-mono">🌾 Campaña:</span>
            <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);if(empresaId)await fetchLotes(empresaId,e.target.value);}}
              className="bg-[#0a1628]/80 border border-[#00FF80]/25 rounded-lg px-3 py-1.5 text-[#00FF80] text-xs font-mono focus:outline-none">
              {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activo?" ★":""}</option>)}
            </select>
          </div>

          {/* Botón voz */}
          <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all"
            style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
            {VOZ_ICON[vozEstado]} Voz
          </button>
          <div className="logo-b" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      {/* Form año agrícola */}
      {showFormAnio && (
        <div className="relative z-10 bg-[#0a1628]/95 border-b border-[#C9A227]/20 px-6 py-4">
          <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-3">+ NUEVO AÑO AGRÍCOLA</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div><label className={lCls}>Nombre</label><input type="text" value={form.anio_nombre??""} onChange={e=>setForm({...form,anio_nombre:e.target.value})} className={iCls+" w-40"} placeholder="Ej: 2025/2026"/></div>
            <div><label className={lCls}>Inicio (20 Mayo)</label><input type="date" value={form.anio_inicio||`${new Date().getFullYear()}-05-20`} onChange={e=>setForm({...form,anio_inicio:e.target.value})} className={iCls+" w-40"}/></div>
            <div><label className={lCls}>Fin (19 Mayo sig.)</label><input type="date" value={form.anio_fin||`${new Date().getFullYear()+1}-05-19`} onChange={e=>setForm({...form,anio_fin:e.target.value})} className={iCls+" w-40"}/></div>
            <div><label className={lCls}>Activo</label>
              <select value={form.anio_activo??"true"} onChange={e=>setForm({...form,anio_activo:e.target.value})} className={iCls+" w-28"}>
                <option value="true">Sí</option><option value="false">No</option>
              </select>
            </div>
            <button onClick={guardarAnioAgricola} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
            <button onClick={()=>{setShowFormAnio(false);setForm({});}} className="text-[#4B5563] text-sm font-mono px-2">✕</button>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {msgExito&&<div className="mb-4 px-4 py-2 rounded-lg border border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5 text-sm font-mono flex items-center justify-between">{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* ===== DETALLE LOTE ===== */}
        {loteActivo && (
          <div className="space-y-5">
            {/* Header lote */}
            <div className="card-l overflow-hidden">
              <div className="relative h-32">
                <Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/>
                <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/60 to-transparent"/>
                <div className="absolute bottom-3 left-5 flex items-center gap-3">
                  <span className="text-3xl">{getCultivoInfo(loteActivo.cultivo,loteActivo.cultivo_orden).icon}</span>
                  <div>
                    <h2 className="text-2xl font-bold text-white font-mono">{loteActivo.nombre}</h2>
                    <div className="flex items-center gap-3 text-xs font-mono mt-1">
                      <span className="text-[#C9A227] font-bold">{loteActivo.hectareas} ha</span>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{background:getCultivoInfo(loteActivo.cultivo,loteActivo.cultivo_orden).color+"20",color:getCultivoInfo(loteActivo.cultivo,loteActivo.cultivo_orden).color}}>{loteActivo.cultivo_completo||loteActivo.cultivo}</span>
                      {ESTADOS.find(e=>e.v===loteActivo.estado)&&<span className="px-2 py-0.5 rounded-full text-xs" style={{background:ESTADOS.find(e=>e.v===loteActivo.estado)!.c+"20",color:ESTADOS.find(e=>e.v===loteActivo.estado)!.c}}>{ESTADOS.find(e=>e.v===loteActivo.estado)!.l}</span>}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-3 right-5 flex gap-2">
                  <button onClick={()=>{setEditandoLote(loteActivo.id);const ci=CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);setForm({nombre:loteActivo.nombre,hectareas:String(loteActivo.hectareas),propietario:loteActivo.propietario,tipo_tenencia:loteActivo.tipo_tenencia,partido:loteActivo.partido,provincia:loteActivo.provincia,cultivo_key:ci?`${ci.cultivo}|${ci.orden}`:"soja|1ra",fecha_siembra:loteActivo.fecha_siembra??"",estado:loteActivo.estado,rendimiento_esperado:String(loteActivo.rendimiento_esperado),es_segundo_cultivo:String(loteActivo.es_segundo_cultivo)});setShowFormLote(true);}} className="px-3 py-2 rounded-xl bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs hover:bg-[#C9A227]/30">✏️ Editar</button>
                  <button onClick={()=>setShowFormLabor(true)} className="px-3 py-2 rounded-xl bg-[#4ADE80]/20 border border-[#4ADE80]/40 text-[#4ADE80] font-mono text-xs hover:bg-[#4ADE80]/30">+ Labor</button>
                  <button onClick={()=>{const mg=margenes.find(m=>m.lote_id===loteActivo.id);if(mg)setForm({mg_rend_esp:String(mg.rendimiento_esperado),mg_rend_real:String(mg.rendimiento_real),mg_precio:String(mg.precio_tn),mg_semilla:String(mg.costo_semilla),mg_fertilizante:String(mg.costo_fertilizante),mg_agroquimicos:String(mg.costo_agroquimicos),mg_labores:String(mg.costo_labores),mg_alquiler:String(mg.costo_alquiler),mg_flete:String(mg.costo_flete),mg_comercializacion:String(mg.costo_comercializacion),mg_otros:String(mg.otros_costos)});setShowFormMargen(true);}} className="px-3 py-2 rounded-xl bg-[#60A5FA]/20 border border-[#60A5FA]/40 text-[#60A5FA] font-mono text-xs hover:bg-[#60A5FA]/30">📊 Margen</button>
                </div>
              </div>
            </div>

            {/* Info lote + 2dos cultivos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:"PROPIETARIO",v:loteActivo.propietario||"—",c:"#E5E7EB"},
                {l:"TENENCIA",v:loteActivo.tipo_tenencia||"—",c:"#C9A227"},
                {l:"PARTIDO",v:loteActivo.partido||"—",c:"#9CA3AF"},
                {l:"SIEMBRA",v:loteActivo.fecha_siembra||"Sin fecha",c:"#4ADE80"},
                {l:"REND. ESPERADO",v:loteActivo.rendimiento_esperado?`${loteActivo.rendimiento_esperado} tn/ha`:"—",c:"#C9A227"},
                {l:"REND. REAL",v:loteActivo.rendimiento_real?`${loteActivo.rendimiento_real} tn/ha`:"—",c:loteActivo.rendimiento_real?"#4ADE80":"#4B5563"},
                {l:"MARGEN BRUTO",v:margenLote?`$${margenLote.margen_bruto.toLocaleString("es-AR")}`:"—",c:margenLote&&margenLote.margen_bruto>=0?"#4ADE80":"#F87171"},
                {l:"MB/Ha",v:margenLote?`$${Math.round(margenLote.margen_bruto_ha).toLocaleString("es-AR")}/ha`:"—",c:"#C9A227"},
              ].map(s=>(
                <div key={s.l} className="card-l p-3">
                  <div className="text-xs text-[#4B5563] font-mono uppercase">{s.l}</div>
                  <div className="text-sm font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Segundo cultivo */}
            {!loteActivo.es_segundo_cultivo && (
              <div className="card-l p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[#4ADE80] font-mono text-sm font-bold">🔄 DOBLE CULTIVO</span>
                  <button onClick={()=>{setForm({es_segundo_cultivo:"true",lote_base_id:loteActivo.id,nombre:loteActivo.nombre+" (2do cultivo)",hectareas:String(loteActivo.hectareas),propietario:loteActivo.propietario,tipo_tenencia:loteActivo.tipo_tenencia,partido:loteActivo.partido,provincia:loteActivo.provincia,estado:"planificado"});setShowFormLote(true);}} className="text-xs text-[#4ADE80] border border-[#4ADE80]/30 px-3 py-1.5 rounded-lg font-mono hover:bg-[#4ADE80]/10">+ Agregar 2do cultivo</button>
                </div>
                {segundosCultivos.length===0?(
                  <p className="text-xs text-[#4B5563] font-mono">Sin segundo cultivo asignado a este lote</p>
                ):(
                  <div className="flex gap-3 flex-wrap">
                    {segundosCultivos.map(s=>{
                      const ci=getCultivoInfo(s.cultivo,s.cultivo_orden);
                      const mg=margenes.find(m=>m.lote_id===s.id);
                      return(
                        <div key={s.id} className="flex items-center gap-3 bg-[#020810]/60 rounded-xl px-4 py-3 cursor-pointer border border-[#4ADE80]/15 hover:border-[#4ADE80]/40 transition-all" onClick={()=>setLoteActivo(s)}>
                          <span className="text-xl">{ci.icon}</span>
                          <div>
                            <div className="text-sm font-bold font-mono" style={{color:ci.color}}>{ci.label}</div>
                            {mg&&<div className="text-xs text-[#4ADE80] font-mono">MB: ${Math.round(mg.margen_bruto).toLocaleString("es-AR")}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Form margen */}
            {showFormMargen && (
              <div className="card-l p-5">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-1">📊 MARGEN BRUTO — {loteActivo.nombre.toUpperCase()}</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">{loteActivo.cultivo_completo||loteActivo.cultivo} · {loteActivo.hectareas} ha · USD: ${usdUsado}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div><label className={lCls}>Rend. esperado (tn/ha)</label><input type="number" value={form.mg_rend_esp??""} onChange={e=>setForm({...form,mg_rend_esp:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>Rend. real (tn/ha)</label><input type="number" value={form.mg_rend_real??""} onChange={e=>setForm({...form,mg_rend_real:e.target.value})} className={iCls} placeholder="Al cosechar"/></div>
                  <div><label className={lCls}>Precio $/tn</label><input type="number" value={form.mg_precio??""} onChange={e=>setForm({...form,mg_precio:e.target.value})} className={iCls} placeholder="0"/></div>
                </div>
                <div className="text-xs text-[#C9A227] font-mono font-bold mb-2 uppercase tracking-wider">Costos directos (total en $)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[["mg_semilla","Semillas"],["mg_fertilizante","Fertilizantes"],["mg_agroquimicos","Agroquímicos"],["mg_labores","Labores"],["mg_alquiler","Alquiler campo"],["mg_flete","Flete"],["mg_comercializacion","Comercialización"],["mg_otros","Otros costos"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} placeholder="0"/></div>
                  ))}
                </div>
                {/* Preview margen */}
                {form.mg_precio && form.mg_rend_esp && (()=>{
                  const ha=loteActivo.hectareas||0;
                  const rend=Number(form.mg_rend_real||form.mg_rend_esp||0);
                  const precio=Number(form.mg_precio||0);
                  const ing=ha*rend*precio;
                  const cd=[form.mg_semilla,form.mg_fertilizante,form.mg_agroquimicos,form.mg_labores,form.mg_alquiler,form.mg_flete,form.mg_comercializacion,form.mg_otros].reduce((a,v)=>a+Number(v||0),0);
                  const mb=ing-cd;
                  return(
                    <div className="p-3 bg-[#020810]/60 rounded-xl grid grid-cols-3 gap-3 text-xs font-mono mb-4">
                      {[{l:"INGRESO BRUTO",v:ing,c:"#E5E7EB"},{l:"COSTO DIRECTO",v:cd,c:"#F87171"},{l:"MARGEN BRUTO",v:mb,c:mb>=0?"#4ADE80":"#F87171"},{l:"MB/ha",v:ha>0?mb/ha:0,c:"#C9A227"},{l:"MB USD",v:mb/usdUsado,c:"#60A5FA"},{l:"ESTADO",v:form.mg_rend_real?"✅ REAL":"📋 ESTIMADO",c:form.mg_rend_real?"#4ADE80":"#C9A227"}].map(s=>(
                        <div key={s.l} className="text-center bg-[#0a1628]/60 rounded-lg p-2">
                          <div className="text-[#4B5563] mb-1">{s.l}</div>
                          <div className="font-bold" style={{color:s.c}}>{typeof s.v==="number"?`$${Math.round(s.v).toLocaleString("es-AR")}`:s.v}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex gap-3">
                  <button onClick={guardarMargen} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormMargen(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form labor */}
            {showFormLabor && (
              <div className="card-l p-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">{editandoLabor?"✏️ EDITAR":"+"} LABOR — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Tipo</label>
                    <select value={form.tipo_lab??"Siembra"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className={iCls}>
                      {TIPOS_LABOR.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>Descripción</label><input type="text" value={form.descripcion_lab??""} onChange={e=>setForm({...form,descripcion_lab:e.target.value})} className={iCls} placeholder="Ej: Siembra soja, glifosato 4L/ha..."/></div>
                  <div><label className={lCls}>Superficie (ha)</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Maquinaria</label><input type="text" value={form.maquinaria??""} onChange={e=>setForm({...form,maquinaria:e.target.value})} className={iCls} placeholder="John Deere 8400..."/></div>
                  <div><label className={lCls}>Operario</label><input type="text" value={form.operario??""} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Costo total $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>Observaciones</label><input type="text" value={form.obs_lab??""} onChange={e=>setForm({...form,obs_lab:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Historial labores */}
            <div className="card-l overflow-hidden">
              <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                <span className="text-[#C9A227] font-mono text-sm font-bold">📋 HISTORIAL DE LABORES</span>
                <span className="text-xs text-[#4B5563] font-mono">{laboresLote.length} registros</span>
              </div>
              {laboresLote.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin labores registradas</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["Fecha","Tipo","Descripción","Ha","Maquinaria","Costo",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono uppercase">{h}</th>)}</tr></thead>
                  <tbody>{laboresLote.map(l=>(
                    <tr key={l.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                      <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{l.fecha}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{l.tipo}</span></td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{l.descripcion}</td>
                      <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{l.superficie_ha}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{l.maquinaria||"—"}</td>
                      <td className="px-4 py-3 font-bold text-[#C9A227] font-mono text-sm">{l.costo_total?`$${Number(l.costo_total).toLocaleString("es-AR")}`:"-"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,superficie_ha:String(l.superficie_ha),maquinaria:l.maquinaria,operario:l.operario,costo_total_lab:String(l.costo_total),obs_lab:l.observaciones});setShowFormLabor(true);}} className="text-[#C9A227] hover:underline text-xs">✏️</button>
                        <button onClick={()=>eliminarLabor(l.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>

            {/* Cambiar estado */}
            <div className="card-l p-4">
              <span className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">Cambiar estado:</span>
              <div className="flex gap-2 mt-2 flex-wrap">
                {ESTADOS.map(e=>(
                  <button key={e.v} onClick={()=>cambiarEstado(loteActivo.id,e.v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all"
                    style={{borderColor:loteActivo.estado===e.v?e.c:e.c+"30",background:loteActivo.estado===e.v?e.c+"20":"transparent",color:e.c}}>
                    {e.l}
                  </button>
                ))}
                <button onClick={()=>eliminarLote(loteActivo.id)} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-red-400/30 text-red-400 hover:bg-red-400/10 ml-auto">🗑 Eliminar lote</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== VISTA PRINCIPAL LOTES ===== */}
        {!loteActivo && (
          <div>
            {/* Tabs */}
            <div className="flex gap-2 mb-5">
              {[{k:"lista",l:"📋 Lotes",},{k:"margen",l:"📊 Margen general"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k as any)}
                  className={`px-4 py-2 rounded-xl text-sm font-mono border transition-all ${tab===t.k?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10":"border-[#C9A227]/15 text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                  {t.l}
                </button>
              ))}
              <div className="flex-1"/>
              <button onClick={()=>{setEditandoLote(null);setForm({estado:"planificado",tipo_tenencia:"Propio",cultivo_key:"soja|1ra"});setShowFormLote(!showFormLote);}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">
                + Nuevo Lote
              </button>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                {l:"TOTAL LOTES",v:lotes.filter(l=>!l.es_segundo_cultivo).length+" lotes",c:"#E5E7EB"},
                {l:"HECTÁREAS",v:`${totalHaUnicas.toLocaleString("es-AR")} ha`,c:"#C9A227"},
                {l:"MB TOTAL ESTIMADO",v:`$${margenes.filter(m=>m.estado==="estimado").reduce((a,m)=>a+m.margen_bruto,0).toLocaleString("es-AR",{maximumFractionDigits:0})}`,c:"#4ADE80"},
                {l:"MB TOTAL REAL",v:`$${margenes.filter(m=>m.estado==="real").reduce((a,m)=>a+m.margen_bruto,0).toLocaleString("es-AR",{maximumFractionDigits:0})}`,c:"#60A5FA"},
              ].map(s=>(
                <div key={s.l} className="card-l p-4 text-center">
                  <div className="text-xs text-[#4B5563] font-mono uppercase">{s.l}</div>
                  <div className="text-xl font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Gráfico circular */}
            {datosGrafico.length > 0 && (
              <div className="card-l p-5 mb-5">
                <h3 className="font-bold text-[#E5E7EB] font-mono mb-1">Distribución de Superficie por Cultivo</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">
                  {totalHaUnicas} ha totales · Doble cultivo respeta hectáreas del lote base
                </p>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-full md:w-72 flex-shrink-0" style={{height:260}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={datosGrafico} cx="50%" cy="50%" outerRadius={110} innerRadius={50}
                          dataKey="value" labelLine={false} label={renderLabel} paddingAngle={2}>
                          {datosGrafico.map((entry,i)=><Cell key={i} fill={entry.color} stroke="rgba(2,8,16,0.5)" strokeWidth={2}/>)}
                        </Pie>
                        <Tooltip formatter={(v:any,n:string)=>[`${v} ha`,n]} contentStyle={{background:"#0a1628",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"10px",fontFamily:"monospace",fontSize:"12px"}}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Leyenda profesional */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {datosGrafico.map((d,i)=>{
                      const pct = totalHaUnicas > 0 ? (d.value/totalHaUnicas*100).toFixed(1) : "0";
                      return(
                        <div key={i} className="flex items-center gap-3 bg-[#020810]/40 rounded-xl px-4 py-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:d.color}}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-[#E5E7EB] font-mono truncate">{d.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex-1 h-1.5 bg-[#1a2535] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:d.color}}/>
                              </div>
                              <span className="text-xs text-[#4B5563] font-mono w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold font-mono text-sm" style={{color:d.color}}>{d.value} ha</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote && (
              <div className="card-l p-5 mb-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">{editandoLote?"✏️ EDITAR":"+"} LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Nombre del lote</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="El Norte, La Cañada..."/></div>
                  <div><label className={lCls}>Hectáreas</label><input type="number" value={form.hectareas??""} onChange={e=>setForm({...form,hectareas:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>Propietario</label><input type="text" value={form.propietario??""} onChange={e=>setForm({...form,propietario:e.target.value})} className={iCls} placeholder="Nombre del dueño"/></div>
                  <div><label className={lCls}>Tenencia</label>
                    <select value={form.tipo_tenencia??"Propio"} onChange={e=>setForm({...form,tipo_tenencia:e.target.value})} className={iCls}>
                      {TIPOS_TENENCIA.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Partido</label><input type="text" value={form.partido??""} onChange={e=>setForm({...form,partido:e.target.value})} className={iCls} placeholder="Ej: Rosario"/></div>
                  <div><label className={lCls}>Provincia</label><input type="text" value={form.provincia??"Santa Fe"} onChange={e=>setForm({...form,provincia:e.target.value})} className={iCls}/></div>

                  {/* Cultivo con selector completo */}
                  <div className="md:col-span-2">
                    <label className={lCls}>Cultivo</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="─── Soja ───">
                        <option value="soja|1ra">🌱 Soja 1ra</option>
                        <option value="soja|2da">🌿 Soja 2da</option>
                      </optgroup>
                      <optgroup label="─── Maíz ───">
                        <option value="maiz|1ro_temprano">🌽 Maíz 1ro Temprano</option>
                        <option value="maiz|1ro_tardio">🌽 Maíz 1ro Tardío</option>
                        <option value="maiz|2do">🌽 Maíz 2do</option>
                      </optgroup>
                      <optgroup label="─── Cereales invierno ───">
                        <option value="trigo|1ro">🌾 Trigo 1ro</option>
                        <option value="cebada|1ra">🍃 Cebada 1ra</option>
                      </optgroup>
                      <optgroup label="─── Otras ───">
                        <option value="girasol|1ro">🌻 Girasol 1ro</option>
                        <option value="girasol|2do">🌻 Girasol 2do</option>
                        <option value="sorgo|1ro">🌿 Sorgo 1ro</option>
                        <option value="sorgo|2do">🌿 Sorgo 2do</option>
                        <option value="arveja|1ra">🫛 Arveja 1ra</option>
                        <option value="vicia|cobertura">🌱 Vicia (cobertura)</option>
                        <option value="verdeo|invierno">🌾 Verdeo Invierno</option>
                        <option value="verdeo|verano">🌾 Verdeo Verano</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Fecha siembra — OPCIONAL */}
                  <div>
                    <label className={lCls}>Fecha siembra <span className="text-[#4B5563] normal-case">(opcional)</span></label>
                    <input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/>
                  </div>

                  <div><label className={lCls}>Estado</label>
                    <select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      {ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                  </div>

                  <div><label className={lCls}>Rend. esperado (tn/ha)</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls} placeholder="Estimado"/></div>

                  {/* Doble cultivo */}
                  <div className="md:col-span-2">
                    <label className={lCls}>¿Es 2do cultivo sobre otro lote?</label>
                    <div className="flex gap-3 items-center">
                      <select value={form.es_segundo_cultivo??"false"} onChange={e=>setForm({...form,es_segundo_cultivo:e.target.value})} className={iCls+" flex-1"}>
                        <option value="false">No — cultivo principal</option>
                        <option value="true">Sí — va sobre otro cultivo</option>
                      </select>
                      {form.es_segundo_cultivo==="true" && (
                        <select value={form.lote_base_id??""} onChange={e=>setForm({...form,lote_base_id:e.target.value})} className={iCls+" flex-1"}>
                          <option value="">Seleccionar lote base</option>
                          {lotes.filter(l=>!l.es_segundo_cultivo).map(l=><option key={l.id} value={l.id}>{l.nombre} ({l.hectareas}ha)</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ Guardar</button>
                  <button onClick={()=>{setShowFormLote(false);setEditandoLote(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista lotes */}
            {tab==="lista" && (
              <div className="space-y-2">
                {lotes.length===0?(
                  <div className="text-center py-20 card-l">
                    <div className="text-5xl mb-4 opacity-20">🌾</div>
                    <p className="text-[#4B5563] font-mono mb-4">Sin lotes en esta campaña</p>
                    <button onClick={()=>setShowFormLote(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm">+ Agregar primer lote</button>
                  </div>
                ):(
                  <>
                    {/* Lotes principales */}
                    {lotes.filter(l=>!l.es_segundo_cultivo).map(lote=>{
                      const ci=getCultivoInfo(lote.cultivo,lote.cultivo_orden);
                      const segundos=lotes.filter(l=>l.lote_id_primer_cultivo===lote.id);
                      const mg=margenes.find(m=>m.lote_id===lote.id);
                      const labsLote=labores.filter(l=>l.lote_id===lote.id);
                      const est=ESTADOS.find(e=>e.v===lote.estado);
                      return(
                        <div key={lote.id} className="card-l overflow-hidden cursor-pointer" onClick={()=>setLoteActivo(lote)}>
                          <div className="flex items-center gap-4 p-4">
                            {/* Color barra izquierda */}
                            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{background:ci.color}}/>
                            <div className="text-2xl flex-shrink-0">{ci.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-[#E5E7EB] font-mono">{lote.nombre}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{background:ci.color+"20",color:ci.color}}>{ci.label}</span>
                                {est&&<span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                                {segundos.length>0&&<span className="text-xs px-2 py-0.5 rounded-full bg-[#4ADE80]/10 text-[#4ADE80] font-mono">🔄 +{segundos.length} 2do cultivo</span>}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs font-mono text-[#6B7280]">
                                <span>{lote.hectareas} ha</span>
                                {lote.propietario&&<span>👤 {lote.propietario}</span>}
                                {lote.partido&&<span>📍 {lote.partido}</span>}
                                {lote.fecha_siembra&&<span>🗓 {lote.fecha_siembra}</span>}
                                <span>{labsLote.length} labores</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {mg?(
                                <div>
                                  <div className="font-bold font-mono text-sm" style={{color:mg.margen_bruto>=0?"#4ADE80":"#F87171"}}>${Math.round(mg.margen_bruto).toLocaleString("es-AR")}</div>
                                  <div className="text-xs text-[#6B7280] font-mono">${Math.round(mg.margen_bruto_ha).toLocaleString("es-AR")}/ha</div>
                                  <div className="text-xs font-mono" style={{color:mg.estado==="real"?"#4ADE80":"#C9A227"}}>{mg.estado==="real"?"✅ Real":"📋 Est."}</div>
                                </div>
                              ):(
                                <div className="text-xs text-[#4B5563] font-mono">Sin margen</div>
                              )}
                            </div>
                          </div>
                          {/* 2dos cultivos inline */}
                          {segundos.length>0&&(
                            <div className="border-t border-[#C9A227]/10 px-4 py-2 flex gap-3 flex-wrap bg-[#020810]/30">
                              {segundos.map(s=>{const sci=getCultivoInfo(s.cultivo,s.cultivo_orden);const smg=margenes.find(m=>m.lote_id===s.id);return(
                                <div key={s.id} className="flex items-center gap-2 text-xs font-mono" onClick={e=>{e.stopPropagation();setLoteActivo(s);}}>
                                  <span>{sci.icon}</span><span style={{color:sci.color}}>{sci.label}</span>
                                  {smg&&<span className="font-bold" style={{color:smg.margen_bruto>=0?"#4ADE80":"#F87171"}}>${Math.round(smg.margen_bruto).toLocaleString("es-AR")}</span>}
                                </div>
                              );})}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* Tab margen general */}
            {tab==="margen" && (
              <div className="space-y-3">
                <div className="card-l overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                    <span className="font-bold text-[#E5E7EB] font-mono">MARGEN BRUTO POR LOTE Y CULTIVO</span>
                    <span className="text-xs text-[#4B5563] font-mono">USD: ${usdUsado}</span>
                  </div>
                  {margenes.length===0?<div className="text-center py-12 text-[#4B5563] font-mono text-sm">Sin márgenes cargados. Entrá a un lote y cargá el margen.</div>:(
                    <table className="w-full">
                      <thead><tr className="border-b border-[#C9A227]/10">{["Lote","Cultivo","Ha","Rend.","Ingreso","C.Directo","Margen Bruto","MB/ha","MB USD","Estado"].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>
                        {margenes.map(m=>{
                          const lote=lotes.find(l=>l.id===m.lote_id);
                          const ci=getCultivoInfo(m.cultivo,m.cultivo_orden);
                          return(
                            <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 cursor-pointer" onClick={()=>{const l=lotes.find(x=>x.id===m.lote_id);if(l)setLoteActivo(l);}}>
                              <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono text-sm">{lote?.nombre??m.lote_id}</td>
                              <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{background:ci.color+"20",color:ci.color}}>{ci.icon} {ci.label}</span></td>
                              <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{m.hectareas}</td>
                              <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                              <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">${Math.round(m.ingreso_bruto).toLocaleString("es-AR")}</td>
                              <td className="px-4 py-3 text-sm text-[#F87171] font-mono">${Math.round(m.costo_directo_total).toLocaleString("es-AR")}</td>
                              <td className="px-4 py-3 font-bold font-mono text-sm" style={{color:m.margen_bruto>=0?"#4ADE80":"#F87171"}}>${Math.round(m.margen_bruto).toLocaleString("es-AR")}</td>
                              <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${Math.round(m.margen_bruto_ha).toLocaleString("es-AR")}</td>
                              <td className="px-4 py-3 text-sm text-[#60A5FA] font-mono">USD {Math.round(m.margen_bruto_usd).toLocaleString("es-AR")}</td>
                              <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{background:m.estado==="real"?"rgba(74,222,128,0.15)":"rgba(201,162,39,0.15)",color:m.estado==="real"?"#4ADE80":"#C9A227"}}>{m.estado==="real"?"✅ Real":"📋 Est."}</span></td>
                            </tr>
                          );
                        })}
                        {/* Totales */}
                        <tr className="border-t-2 border-[#C9A227]/30 bg-[#C9A227]/5">
                          <td colSpan={4} className="px-4 py-3 font-bold text-[#C9A227] font-mono text-sm">TOTALES</td>
                          <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono">${Math.round(margenes.reduce((a,m)=>a+m.ingreso_bruto,0)).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 font-bold text-[#F87171] font-mono">${Math.round(margenes.reduce((a,m)=>a+m.costo_directo_total,0)).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 font-bold font-mono" style={{color:margenes.reduce((a,m)=>a+m.margen_bruto,0)>=0?"#4ADE80":"#F87171"}}>${Math.round(margenes.reduce((a,m)=>a+m.margen_bruto,0)).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{totalHaUnicas>0?`$${Math.round(margenes.reduce((a,m)=>a+m.margen_bruto,0)/totalHaUnicas).toLocaleString("es-AR")}`:"-"}</td>
                          <td className="px-4 py-3 font-bold text-[#60A5FA] font-mono">USD {Math.round(margenes.reduce((a,m)=>a+m.margen_bruto_usd,0)).toLocaleString("es-AR")}</td>
                          <td/>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel voz flotante */}
      {vozPanel && (
        <div className="fixed bottom-44 right-6 z-50 w-80 bg-[#0a1628]/97 border border-[#00FF80]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF80]/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/>
              <span className="text-[#00FF80] text-xs font-mono font-bold">🎤 ASISTENTE DE LOTES</span>
            </div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="px-4 pt-3 pb-2 min-h-20">
            {vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-8">{[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:`${10+i*5}px`,animation:`wave ${0.3+i*0.1}s ease-in-out infinite alternate`}}/>)}</div><span className="text-[#F87171] text-sm font-mono">Escuchando...</span></div>}
            {vozEstado==="procesando"&&<div className="flex items-center gap-3 py-2"><div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full" style={{animation:"spin 0.8s linear infinite"}}/><span className="text-[#C9A227] text-xs font-mono">"{vozTranscripcion}"</span></div>}
            {vozRespuesta&&<div className="bg-[#00FF80]/8 border border-[#00FF80]/20 rounded-lg px-3 py-2 mb-2"><p className="text-[#E5E7EB] text-sm font-mono leading-relaxed">{vozRespuesta}</p></div>}
            {!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&(
              <div className="space-y-1 py-1">
                {["¿Cuántas hectáreas tengo sembradas?","¿Qué lotes están cosechados?","¿Cuál es el margen total?","Nuevo lote El Norte 150 hectáreas soja"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Preguntá sobre lotes..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#00FF80]"/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}}
              className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado]}}>
              {VOZ_ICON[vozEstado]}
            </button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono">▶</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:`2px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono mt-6">© AGROGESTION PRO · LOTES Y CULTIVOS</p>
      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

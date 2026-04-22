"use client";
// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import Image from "next/image";

// ── TIPOS ──────────────────────────────────────────────────────────────────
type Campana = { id: string; nombre: string; año_inicio: number; activa: boolean; };
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_orden: string; cultivo_completo: string; };
type MbCabecera = {
  id: string; lote_id: string; campana_id: string; cultivo: string; hectareas: number;
  rinde_esp: number; rinde_real: number; precio_promedio_usd: number; ajuste_calidad_pct: number;
  ingreso_bruto_usd: number; estado: string; cerrado: boolean; fecha_cierre: string | null;
};
type MbMovimiento = {
  id: string; cabecera_id: string; fecha: string; grupo: number;
  concepto: string; descripcion: string; moneda: string;
  monto_original: number; tc_usado: number; monto_usd: number; unidad: string;
  origen?: string;
};
type MbVenta = {
  id: string; cabecera_id: string; fecha: string;
  tn_vendidas: number; precio_usd: number; destino: string; estado: string;
};

// ── CONSTANTES ─────────────────────────────────────────────────────────────
const GRUPOS: Record<number, { label: string; icon: string; color: string; unidad_default: string; tipo: string }> = {
  1:  { label: "Implantación",      icon: "🌱", color: "#16a34a", unidad_default: "ha", tipo: "variable" },
  2:  { label: "Fertilización",     icon: "💊", color: "#d97706", unidad_default: "ha", tipo: "variable" },
  3:  { label: "Protección",        icon: "🧪", color: "#1565c0", unidad_default: "ha", tipo: "variable" },
  4:  { label: "Cosecha",           icon: "🌾", color: "#f59e0b", unidad_default: "ha", tipo: "cosecha"  },
  5:  { label: "Flete y Logística", icon: "🚛", color: "#6366f1", unidad_default: "tn", tipo: "logistica" },
  6:  { label: "Comercialización",  icon: "🏢", color: "#0891b2", unidad_default: "pct", tipo: "comercial" },
  7:  { label: "Impuestos",         icon: "📋", color: "#dc2626", unidad_default: "pct", tipo: "fijo" },
  8:  { label: "Financieros",       icon: "🏦", color: "#7c3aed", unidad_default: "pct", tipo: "fijo" },
  9:  { label: "Seguros",           icon: "🛡️", color: "#059669", unidad_default: "ha", tipo: "fijo" },
  10: { label: "Alquiler",          icon: "🤝", color: "#ea580c", unidad_default: "ha", tipo: "fijo" },
  11: { label: "Administración",    icon: "💼", color: "#6b7280", unidad_default: "total", tipo: "empresa" },
  12: { label: "Estructura",        icon: "🏗️", color: "#9ca3af", unidad_default: "total", tipo: "empresa" },
};

const CONCEPTOS: Record<number, string[]> = {
  1:  ["semilla","tratamiento_semilla","inoculante","siembra_servicio","combustible","otros"],
  2:  ["fertilizante","aplicacion_fertilizante","flete_fertilizante","otros"],
  3:  ["herbicidas","insecticidas","fungicidas","coadyuvantes","servicio_aplicacion","combustible","otros"],
  4:  ["cosecha_servicio","combustible_cosecha","embolsado","otros"],
  5:  ["flete_corto","flete_largo","espera_camion","carga_campo","otros"],
  6:  ["comision_acopio","secado","zarandeo","almacenaje","perdidas_almacenaje","diferencias_calidad","otros"],
  7:  ["ingresos_brutos","tasa_vial","carta_de_porte","inmobiliario_rural","otros"],
  8:  ["intereses_insumos","intereses_bancarios","costo_plazo","otros"],
  9:  ["seguro_agricola","cobertura_precio","otros"],
  10: ["alquiler","otros"],
  11: ["honorarios","administracion_general","software","otros"],
  12: ["sueldos_estructura","vehiculos","energia","otros"],
};

const CULTIVO_BG: Record<string,string> = {
  soja:"/stock-granos.png", maiz:"/stock-granos.png", trigo:"/stock-granos.png",
  girasol:"/stock-granos.png", sorgo:"/stock-granos.png", default:"/FON.png"
};
const CULTIVO_COLORS: Record<string,string> = {
  soja:"#22c55e",maiz:"#d97706",trigo:"#f59e0b",girasol:"#fbbf24",
  sorgo:"#ef4444",cebada:"#a78bfa",otro:"#60a5fa",
};
const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐",
};

function fmt(n: number, dec = 0) {
  if (!n || isNaN(n)) return dec > 0 ? "0.00" : "0";
  return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString("es-AR");
}

// ── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function MargenPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [cabeceras, setCabeceras] = useState<MbCabecera[]>([]);
  const [movimientos, setMovimientos] = useState<MbMovimiento[]>([]);
  const [ventas, setVentas] = useState<MbVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loteActivo, setLoteActivo] = useState<string|null>(null);
  const [grupoAbierto, setGrupoAbierto] = useState<number|null>(null);
  const [msgExito, setMsgExito] = useState("");
  const [tcVenta, setTcVenta] = useState<number>(1400);
  const [tcFecha, setTcFecha] = useState<string>("");
  const [showFormMov, setShowFormMov] = useState(false);
  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showFormRinde, setShowFormRinde] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [editandoMov, setEditandoMov] = useState<string|null>(null);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };
  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const fetchTC = useCallback(async (eid: string) => {
    try {
      const res = await fetch("/api/cotizacion");
      const data = await res.json();
      if (data.venta) {
        setTcVenta(data.venta); setTcFecha(data.fecha);
        const sb = await getSB();
        const hoy = new Date().toISOString().split("T")[0];
        const { data: ex } = await sb.from("finanzas_cotizaciones").select("id").eq("empresa_id", eid).eq("fecha", hoy).single();
        if (!ex) await sb.from("finanzas_cotizaciones").insert({ empresa_id: eid, fecha: hoy, usd_oficial: data.venta, usd_mep: 0, usd_blue: 0, usd_usado: data.venta });
        else await sb.from("finanzas_cotizaciones").update({ usd_oficial: data.venta, usd_usado: data.venta }).eq("id", ex.id);
      }
    } catch {}
  }, []);

  const getTCFecha = async (fecha: string): Promise<number> => {
    if (!empresaId) return tcVenta;
    const sb = await getSB();
    const { data } = await sb.from("finanzas_cotizaciones")
      .select("usd_usado").eq("empresa_id", empresaId)
      .lte("fecha", fecha).order("fecha", { ascending: false }).limit(1);
    return data?.[0]?.usd_usado || tcVenta || 1;
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
    setCampanas(camps ?? []);
    const cid = (camps ?? []).find((c: any) => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    setCampanaActiva(cid);
    await Promise.all([fetchTC(emp.id), fetchAll(emp.id, cid)]);
    setLoading(false);
  };

  const fetchAll = async (eid: string, cid: string) => {
    const sb = await getSB();
    const { data: lotesData } = await sb.from("lotes")
      .select("id,nombre,hectareas,cultivo,cultivo_orden,cultivo_completo")
      .eq("empresa_id", eid).eq("campana_id", cid).eq("es_segundo_cultivo", false).order("nombre");
    const loteIds = (lotesData ?? []).map((l: any) => l.id);
    setLotes(lotesData ?? []);
    if (loteIds.length === 0) { setCabeceras([]); setMovimientos([]); setVentas([]); return; }
    const [cab, mov, ven] = await Promise.all([
      sb.from("mb_cabecera").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("mb_movimientos").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false }),
      sb.from("mb_ventas").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false }),
    ]);
    setCabeceras(cab.data ?? []);
    setMovimientos(mov.data ?? []);
    setVentas(ven.data ?? []);
  };

  const asegurarCabecera = async (loteId: string): Promise<string> => {
    const existing = cabeceras.find(c => c.lote_id === loteId);
    if (existing) return existing.id;
    const sb = await getSB();
    const lote = lotes.find(l => l.id === loteId);
    if (!lote || !empresaId) return "";
    const { data } = await sb.from("mb_cabecera").insert({
      empresa_id: empresaId, lote_id: loteId, campana_id: campanaActiva,
      cultivo: lote.cultivo, cultivo_orden: lote.cultivo_orden, hectareas: lote.hectareas,
      rinde_esp: 0, rinde_real: 0, precio_promedio_usd: 0,
    }).select().single();
    if (data) { setCabeceras(prev => [...prev, data]); return data.id; }
    return "";
  };

  const calcularLote = (cabeceraId: string, hectareas: number) => {
    const movs = movimientos.filter(m => m.cabecera_id === cabeceraId);
    const vents = ventas.filter(v => v.cabecera_id === cabeceraId);
    const cab = cabeceras.find(c => c.id === cabeceraId);
    if (!cab) return null;
    const rindeUsado = cab.rinde_real > 0 ? cab.rinde_real : cab.rinde_esp;
    const totalTn = vents.reduce((a, v) => a + v.tn_vendidas, 0);
    const precioPromedio = totalTn > 0
      ? vents.reduce((a, v) => a + v.tn_vendidas * v.precio_usd, 0) / totalTn
      : cab.precio_promedio_usd || 0;
    const ajuste = 1 + (cab.ajuste_calidad_pct || 0) / 100;
    const ingresoBrutoHa = rindeUsado * precioPromedio * ajuste;
    const costosPorGrupo: Record<number, number> = {};
    for (let g = 1; g <= 12; g++) costosPorGrupo[g] = 0;
    for (const m of movs) {
      let cUsdHa = 0;
      if (m.unidad === "ha") cUsdHa = m.monto_usd;
      else if (m.unidad === "tn") cUsdHa = m.monto_usd * rindeUsado;
      else if (m.unidad === "pct") cUsdHa = ingresoBrutoHa * m.monto_usd / 100;
      else if (m.unidad === "total") cUsdHa = m.monto_usd / hectareas;
      costosPorGrupo[m.grupo] = (costosPorGrupo[m.grupo] || 0) + cUsdHa;
    }
    const costoVariableHa = [1,2,3].reduce((a,g) => a + (costosPorGrupo[g]||0), 0);
    const costoCosechaHa = costosPorGrupo[4] || 0;
    const costoLogisticaHa = [5,6].reduce((a,g) => a + (costosPorGrupo[g]||0), 0);
    const costoFijoHa = [7,8,9,10].reduce((a,g) => a + (costosPorGrupo[g]||0), 0);
    const costoEmpresaHa = [11,12].reduce((a,g) => a + (costosPorGrupo[g]||0), 0);
    const costo1a10Ha = [1,2,3,4,5,6,7,8,9,10].reduce((a,g) => a + (costosPorGrupo[g]||0), 0);
    const costoTotalHa = costo1a10Ha + costoEmpresaHa;
    const mbHa = ingresoBrutoHa - costoTotalHa;
    const rindeEq = precioPromedio > 0 ? costoTotalHa / precioPromedio : 0;
    const cobertura = ingresoBrutoHa > 0 ? (costoTotalHa / ingresoBrutoHa * 100) : 0;
    return {
      rindeUsado, precioPromedio, ingresoBrutoHa, costosPorGrupo,
      costoVariableHa, costoCosechaHa, costoLogisticaHa, costoFijoHa, costoEmpresaHa,
      costo1a10Ha, costoTotalHa, mbHa, rindeEq, cobertura, totalTn,
      estado: cab.rinde_real > 0 ? "real" : "estimado",
    };
  };

  const guardarRinde = async () => {
    if (!loteActivo || !empresaId) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    await sb.from("mb_cabecera").update({
      rinde_esp: Number(form.rinde_esp || 0),
      rinde_real: Number(form.rinde_real || 0),
      ajuste_calidad_pct: Number(form.ajuste_calidad_pct || 0),
    }).eq("id", cabId);
    msg("✅ Rinde guardado");
    await fetchAll(empresaId, campanaActiva);
    setShowFormRinde(false); setForm({});
  };

  const guardarVenta = async () => {
    if (!loteActivo || !empresaId || !form.v_fecha || !form.v_tn || !form.v_precio) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    await sb.from("mb_ventas").insert({
      empresa_id: empresaId, lote_id: loteActivo, campana_id: campanaActiva,
      cabecera_id: cabId, fecha: form.v_fecha,
      tn_vendidas: Number(form.v_tn), precio_usd: Number(form.v_precio),
      destino: form.v_destino || "", estado: form.v_estado || "pactada",
    });
    msg("✅ Venta guardada");
    await fetchAll(empresaId, campanaActiva);
    setShowFormVenta(false); setForm({});
  };

  const guardarMovimiento = async () => {
    if (!loteActivo || !empresaId || !form.m_fecha || !form.m_grupo || !form.m_concepto || !form.m_monto) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const moneda = form.m_moneda || "ARS";
    const montoOriginal = Number(form.m_monto);
    const tc = moneda === "ARS" ? await getTCFecha(form.m_fecha) : 1;
    const montoUsd = moneda === "ARS" ? montoOriginal / tc : montoOriginal;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo, campana_id: campanaActiva,
      cabecera_id: cabId, fecha: form.m_fecha, grupo: Number(form.m_grupo),
      concepto: form.m_concepto, descripcion: form.m_descripcion || "",
      moneda, monto_original: montoOriginal, tc_usado: tc, monto_usd: montoUsd,
      unidad: form.m_unidad || GRUPOS[Number(form.m_grupo)]?.unidad_default || "ha",
      origen: "manual",
    };
    if (editandoMov) {
      await sb.from("mb_movimientos").update(payload).eq("id", editandoMov);
      setEditandoMov(null);
    } else {
      await sb.from("mb_movimientos").insert(payload);
    }
    msg(`✅ Costo guardado → U$S ${montoUsd.toFixed(2)}`);
    await fetchAll(empresaId, campanaActiva);
    setShowFormMov(false); setForm({});
  };

  const eliminarMov = async (id: string) => {
    if (!confirm("¿Eliminar?") || !empresaId) return;
    const sb = await getSB();
    await sb.from("mb_movimientos").delete().eq("id", id);
    await fetchAll(empresaId, campanaActiva);
  };

  const cerrarMB = async () => {
    if (!loteActivo || !empresaId || !confirm("¿Cerrar MB de este lote?")) return;
    const cab = cabeceras.find(c => c.lote_id === loteActivo);
    if (!cab) return;
    const sb = await getSB();
    await sb.from("mb_cabecera").update({ cerrado: true, fecha_cierre: new Date().toISOString().split("T")[0], estado: "real" }).eq("id", cab.id);
    msg("✅ MB cerrado — REAL");
    await fetchAll(empresaId, campanaActiva);
  };

  // ── DATOS DEL LOTE ACTIVO ──
  const loteData = loteActivo ? lotes.find(l => l.id === loteActivo) : null;
  const cabActiva = loteActivo ? cabeceras.find(c => c.lote_id === loteActivo) : null;
  const calc = cabActiva ? calcularLote(cabActiva.id, loteData?.hectareas || 0) : null;
  const movsActivos = cabActiva ? movimientos.filter(m => m.cabecera_id === cabActiva.id) : [];
  const ventasActivas = cabActiva ? ventas.filter(v => v.cabecera_id === cabActiva.id) : [];

  const cultivoColor = CULTIVO_COLORS[loteData?.cultivo || ""] || "#22c55e";
  const cultivoIcon = CULTIVO_ICONS[loteData?.cultivo || ""] || "🌾";

  // Torta: agrupar costos en 4 categorías visuales
  const tortaData = calc ? [
    { name: "Variables", value: Math.round(calc.costoVariableHa * 10) / 10, color: "#16a34a" },
    { name: "Cosecha", value: Math.round(calc.costoCosechaHa * 10) / 10, color: "#f59e0b" },
    { name: "Logística y Comerc.", value: Math.round(calc.costoLogisticaHa * 10) / 10, color: "#6366f1" },
    { name: "Fijos", value: Math.round(calc.costoFijoHa * 10) / 10, color: "#dc2626" },
  ].filter(d => d.value > 0) : [];

  // Barras: costo por grupo
  const barrasData = calc ? Object.entries(calc.costosPorGrupo)
    .filter(([,v]) => v > 0 && Number(Object.keys(calc.costosPorGrupo)[0]) <= 10)
    .map(([g, v]) => ({ name: GRUPOS[Number(g)]?.label?.split(" ")[0] || g, value: Math.round(v), color: GRUPOS[Number(g)]?.color || "#6b7280" }))
    .filter(d => d.value > 0)
    .sort((a,b) => b.value - a.value)
    : [];

  // Resumen general
  const resumen = lotes.map(l => {
    const cab = cabeceras.find(c => c.lote_id === l.id);
    const c = cab ? calcularLote(cab.id, l.hectareas) : null;
    return { lote: l, cab, calc: c };
  });

  const iCls = "inp w-full px-3 py-2 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1";
  const sCls = "sel w-full px-3 py-2 text-[#1a2a4a] text-sm";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando Margen Bruto...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes countUp{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}

        .inp{background:rgba(255,255,255,0.80);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;font-family:'DM Sans',system-ui;transition:all 0.18s;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.80);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .sel option{background:white;color:#1a2a4a;}

        .card-glass{background:rgba(255,255,255,0.72);backdrop-filter:blur(12px);border:1.5px solid rgba(255,255,255,0.90);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.12);}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 14px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.75);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;display:inline-flex;align-items:center;gap:5px;}
        .abtn:hover{background:rgba(255,255,255,0.98);}

        .topbar{background-image:url('/FON.png');background-size:cover;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.28);pointer-events:none;}
        .topbar>*{position:relative;z-index:1;}

        /* LOTE CARD en resumen */
        .lote-card{background:rgba(255,255,255,0.72);backdrop-filter:blur(8px);border:1.5px solid rgba(255,255,255,0.88);border-radius:18px;cursor:pointer;transition:all 0.22s;overflow:hidden;box-shadow:0 4px 16px rgba(20,80,160,0.10);}
        .lote-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(20,80,160,0.20);}

        /* GRUPO CARD */
        .grupo-card{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.88);border-radius:16px;overflow:hidden;transition:all 0.18s;box-shadow:0 2px 8px rgba(20,80,160,0.08);}
        .grupo-card:hover{box-shadow:0 4px 16px rgba(20,80,160,0.14);}

        .row-mb:hover{background:rgba(255,255,255,0.85)!important;}
        .fade-in{animation:fadeIn 0.25s ease both;}
        .slide-up{animation:slideUp 0.30s ease both;}
        .count-up{animation:countUp 0.40s ease both;}

        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",flexWrap:"wrap"}}>
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {loteActivo?"Volver":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:10,border:"1px solid rgba(217,119,6,0.30)",background:"rgba(217,119,6,0.07)"}}>
            <span style={{fontSize:10,color:"#6b8aaa",fontWeight:700}}>TC BNA</span>
            <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>${Math.round(tcVenta).toLocaleString("es-AR")}</span>
            {tcFecha&&<span style={{fontSize:10,color:"#aab8c8"}}>{tcFecha}</span>}
            <button onClick={()=>empresaId&&fetchTC(empresaId)} style={{background:"none",border:"none",cursor:"pointer",color:"#d97706",fontSize:12}}>↺</button>
          </div>
          <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);if(empresaId)await fetchAll(empresaId,e.target.value);}} className="sel" style={{fontSize:12,fontWeight:700,color:"#1565c0",padding:"6px 10px",minWidth:110}}>
            {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
          </select>
          <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📊 Margen Bruto</span>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 100px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msgExito&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msgExito.startsWith("✅")?"#16a34a":"#dc2626",background:msgExito.startsWith("✅")?"rgba(220,252,231,0.92)":"rgba(254,226,226,0.92)",border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msgExito}<button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* ══════════════════════════════
            VISTA PRINCIPAL — LISTA LOTES
        ══════════════════════════════ */}
        {!loteActivo&&(
          <div className="fade-in">
            {/* KPIs campaña */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:16}}>
              {(()=>{
                const totalHa = lotes.reduce((a,l)=>a+l.hectareas,0);
                const totalMB = resumen.reduce((a,r)=>a+(r.calc?r.calc.mbHa*r.lote.hectareas:0),0);
                const totalIngreso = resumen.reduce((a,r)=>a+(r.calc?r.calc.ingresoBrutoHa*r.lote.hectareas:0),0);
                const totalCosto = resumen.reduce((a,r)=>a+(r.calc?r.calc.costoTotalHa*r.lote.hectareas:0),0);
                return [
                  {l:"Ha Totales",v:fmt(totalHa)+" ha",c:"#d97706",icon:"🌍"},
                  {l:"Ingreso Total",v:"U$S "+fmt(totalIngreso),c:"#16a34a",icon:"💰"},
                  {l:"Costo Total",v:"U$S "+fmt(totalCosto),c:"#dc2626",icon:"📉"},
                  {l:"MB Total",v:"U$S "+fmt(totalMB),c:totalMB>=0?"#16a34a":"#dc2626",icon:"📊"},
                  {l:"MB / Ha",v:"U$S "+fmt(totalHa>0?totalMB/totalHa:0),c:"#1565c0",icon:"📐"},
                ].map(s=>(
                  <div key={s.l} className="card-glass count-up" style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:14}}>{s.icon}</span>
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</div>
                    </div>
                    <div style={{fontSize:17,fontWeight:800,color:s.c}}>{s.v}</div>
                  </div>
                ));
              })()}
            </div>

            {/* Grid lotes */}
            {lotes.length===0
              ?<div className="card-glass" style={{padding:"60px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.15,marginBottom:12}}>📊</div>
                <p style={{color:"#6b8aaa",fontSize:14,marginBottom:4}}>Sin lotes en esta campaña</p>
                <p style={{color:"#aab8c8",fontSize:12}}>Creá lotes desde el módulo de Lotes y Cultivos</p>
              </div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                {resumen.map(({lote,cab,calc:c},idx)=>{
                  const color = CULTIVO_COLORS[lote.cultivo] || "#22c55e";
                  const icon = CULTIVO_ICONS[lote.cultivo] || "🌾";
                  const hasDatos = !!c && (c.ingresoBrutoHa>0||c.costoTotalHa>0);
                  return(
                    <div key={lote.id} className="lote-card slide-up" style={{animationDelay:`${idx*0.05}s`}} onClick={()=>setLoteActivo(lote.id)}>
                      {/* Franja color cultivo */}
                      <div style={{height:5,background:`linear-gradient(90deg,${color},${color}88)`}}/>
                      {/* Header */}
                      <div style={{padding:"12px 14px 10px",background:`linear-gradient(135deg,${color}12 0%,transparent 60%)`}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:22}}>{icon}</span>
                            <div>
                              <div style={{fontSize:15,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{lote.nombre}</div>
                              <div style={{fontSize:11,color,fontWeight:600}}>{lote.cultivo_completo||lote.cultivo} · {lote.hectareas} ha</div>
                            </div>
                          </div>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                            {cab&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:cab.cerrado?"rgba(22,163,74,0.15)":"rgba(217,119,6,0.12)",color:cab.cerrado?"#16a34a":"#d97706"}}>{cab.cerrado?"✅ REAL":"📋 EST."}</span>}
                            {!cab&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(107,114,128,0.10)",color:"#6b8aaa"}}>Sin datos</span>}
                          </div>
                        </div>

                        {hasDatos?(
                          <>
                            {/* Banda Ingreso/Costo/MB */}
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                              {[
                                {l:"INGRESO/HA",v:"U$S "+fmt(c!.ingresoBrutoHa,0),c:"#16a34a",bg:"rgba(22,163,74,0.08)"},
                                {l:"COSTO/HA",v:"U$S "+fmt(c!.costoTotalHa,0),c:"#dc2626",bg:"rgba(220,38,38,0.07)"},
                                {l:"MB/HA",v:"U$S "+fmt(c!.mbHa,0),c:c!.mbHa>=0?"#1565c0":"#dc2626",bg:c!.mbHa>=0?"rgba(25,118,210,0.08)":"rgba(220,38,38,0.07)"},
                              ].map(s=>(
                                <div key={s.l} style={{textAlign:"center",padding:"7px 6px",borderRadius:10,background:s.bg,border:`1px solid ${s.c}20`}}>
                                  <div style={{fontSize:8,color:"#6b8aaa",fontWeight:700,marginBottom:2}}>{s.l}</div>
                                  <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
                                </div>
                              ))}
                            </div>
                            {/* Mini barrita MB */}
                            {c!.ingresoBrutoHa>0&&(
                              <div style={{marginBottom:8}}>
                                <div style={{height:6,background:"rgba(220,38,38,0.20)",borderRadius:4,overflow:"hidden"}}>
                                  <div style={{height:"100%",background:c!.mbHa>=0?"#16a34a":"#dc2626",borderRadius:4,width:`${Math.min(100,Math.max(0,(c!.mbHa/c!.ingresoBrutoHa*100)))}%`,transition:"width 0.8s ease"}}/>
                                </div>
                                <div style={{display:"flex",justifyContent:"space-between",marginTop:2,fontSize:9,color:"#aab8c8"}}>
                                  <span>Margen: {c!.ingresoBrutoHa>0?(c!.mbHa/c!.ingresoBrutoHa*100).toFixed(0):0}%</span>
                                  <span>Eq: {c!.rindeEq.toFixed(2)} tn/ha</span>
                                </div>
                              </div>
                            )}
                            {/* Ventas */}
                            {c!.totalTn>0&&(
                              <div style={{fontSize:10,color:"#6b8aaa",background:"rgba(255,255,255,0.55)",borderRadius:8,padding:"4px 8px",display:"flex",justifyContent:"space-between"}}>
                                <span>💰 {c!.totalTn.toFixed(1)} tn vendidas</span>
                                <span>Prom. U$S {c!.precioPromedio.toFixed(0)}/tn</span>
                              </div>
                            )}
                          </>
                        ):(
                          <div style={{textAlign:"center",padding:"16px 0",color:"#aab8c8",fontSize:12}}>
                            <span style={{fontSize:28,display:"block",marginBottom:4,opacity:0.4}}>📊</span>
                            Tocá para cargar datos
                          </div>
                        )}
                      </div>
                      {/* Footer */}
                      <div style={{padding:"8px 14px",background:"rgba(255,255,255,0.40)",borderTop:"1px solid rgba(0,60,140,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:10,color:"#6b8aaa"}}>{movsActivos.filter(m=>m.cabecera_id===cab?.id).length} movimientos</span>
                        <span style={{fontSize:11,fontWeight:700,color:"#1565c0"}}>Ver detalle →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}

        {/* ══════════════════════════════
            DETALLE LOTE — VISUAL INFOGRAFÍA
        ══════════════════════════════ */}
        {loteActivo&&loteData&&(
          <div className="fade-in">

            {/* ── HERO HEADER ── */}
            <div style={{borderRadius:22,overflow:"hidden",marginBottom:14,position:"relative",minHeight:180,boxShadow:"0 8px 32px rgba(20,80,160,0.20)"}}>
              {/* Fondo imagen cultivo */}
              <div style={{position:"absolute",inset:0}}>
                <Image src={CULTIVO_BG[loteData.cultivo]||"/FON.png"} alt="" fill style={{objectFit:"cover"}}/>
                <div style={{position:"absolute",inset:0,background:`linear-gradient(135deg,rgba(0,20,60,0.82) 0%,rgba(0,40,80,0.70) 40%,${cultivoColor}40 100%)`}}/>
              </div>
              {/* Contenido */}
              <div style={{position:"relative",zIndex:2,padding:"20px 24px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <span style={{fontSize:36}}>{cultivoIcon}</span>
                      <div>
                        <h2 style={{fontSize:26,fontWeight:900,color:"white",margin:0,textTransform:"uppercase",letterSpacing:1,textShadow:"0 2px 8px rgba(0,0,0,0.40)"}}>{loteData.nombre}</h2>
                        <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap"}}>
                          <span style={{fontSize:12,color:"rgba(255,255,255,0.80)",fontWeight:600}}>{loteData.cultivo_completo||loteData.cultivo}</span>
                          <span style={{fontSize:12,color:cultivoColor,fontWeight:700,background:"rgba(255,255,255,0.15)",borderRadius:6,padding:"1px 8px"}}>{loteData.hectareas} ha</span>
                          <span style={{fontSize:12,color:"rgba(255,255,255,0.70)"}}>{campanas.find(c=>c.id===campanaActiva)?.nombre}</span>
                          {cabActiva&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,background:cabActiva.cerrado?"rgba(22,163,74,0.30)":"rgba(217,119,6,0.25)",color:cabActiva.cerrado?"#86efac":"#fde68a"}}>{cabActiva.cerrado?"✅ REAL":"📋 ESTIMADO"}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={()=>{setShowFormRinde(!showFormRinde);setForm({rinde_esp:String(cabActiva?.rinde_esp||""),rinde_real:String(cabActiva?.rinde_real||""),ajuste_calidad_pct:String(cabActiva?.ajuste_calidad_pct||"")});}}
                      style={{padding:"7px 13px",borderRadius:10,background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.35)",color:"white",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                      🌾 Rinde/Precio
                    </button>
                    <button onClick={()=>{setShowFormVenta(true);setForm({v_fecha:new Date().toISOString().split("T")[0],v_estado:"pactada"});}}
                      style={{padding:"7px 13px",borderRadius:10,background:"rgba(22,163,74,0.30)",border:"1px solid rgba(22,163,74,0.50)",color:"white",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                      💰 + Venta
                    </button>
                    <button onClick={()=>{setShowFormMov(true);setForm({m_fecha:new Date().toISOString().split("T")[0],m_moneda:"ARS",m_grupo:"1"});}}
                      className="bbtn" style={{fontSize:11}}>
                      + Costo
                    </button>
                    {cabActiva&&!cabActiva.cerrado&&(
                      <button onClick={cerrarMB} style={{padding:"7px 13px",borderRadius:10,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",color:"rgba(255,255,255,0.80)",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                        🔒 Cerrar MB
                      </button>
                    )}
                  </div>
                </div>

                {/* BANDA 3 NÚMEROS GRANDES */}
                {calc&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16}}>
                    {[
                      {l:"INGRESO / HA",v:`U$S ${fmt(calc.ingresoBrutoHa,0)}`,sub:`Total: U$S ${fmt(calc.ingresoBrutoHa*loteData.hectareas,0)}`,c:"#86efac",bc:"rgba(22,163,74,0.25)"},
                      {l:"COSTO / HA",v:`U$S ${fmt(calc.costoTotalHa,0)}`,sub:`Total: U$S ${fmt(calc.costoTotalHa*loteData.hectareas,0)}`,c:"#fca5a5",bc:"rgba(220,38,38,0.22)"},
                      {l:"MARGEN BRUTO / HA",v:`U$S ${fmt(calc.mbHa,0)}`,sub:`Total: U$S ${fmt(calc.mbHa*loteData.hectareas,0)}`,c:calc.mbHa>=0?"#93c5fd":"#fca5a5",bc:calc.mbHa>=0?"rgba(25,118,210,0.25)":"rgba(220,38,38,0.22)"},
                    ].map(s=>(
                      <div key={s.l} style={{padding:"12px 16px",borderRadius:14,background:s.bc,border:`1px solid ${s.c}40`,backdropFilter:"blur(8px)"}}>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{s.l}</div>
                        <div style={{fontSize:24,fontWeight:900,color:s.c,lineHeight:1,marginBottom:3}}>{s.v}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)"}}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!calc&&(
                  <div style={{marginTop:16,padding:"14px 18px",borderRadius:14,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.20)",textAlign:"center",color:"rgba(255,255,255,0.70)",fontSize:13}}>
                    Sin datos — Cargá rinde, precio y costos para ver el margen
                  </div>
                )}
              </div>
            </div>

            {/* ── FORM RINDE/PRECIO ── */}
            {showFormRinde&&(
              <div className="card-glass fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>🌾 Producción y Precio</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Rinde esperado (tn/ha)</label><input type="number" step="0.1" value={form.rinde_esp||""} onChange={e=>setForm({...form,rinde_esp:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Ej: 3.2"/></div>
                  <div><label className={lCls}>Rinde real (tn/ha)</label><input type="number" step="0.1" value={form.rinde_real||""} onChange={e=>setForm({...form,rinde_real:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Al cosechar"/></div>
                  <div><label className={lCls}>Ajuste calidad (%)</label><input type="number" step="0.1" value={form.ajuste_calidad_pct||""} onChange={e=>setForm({...form,ajuste_calidad_pct:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                </div>
                <p style={{fontSize:11,color:"#6b8aaa",marginBottom:10}}>💡 El precio se calcula automáticamente del promedio ponderado de tus ventas registradas.</p>
                <div style={{display:"flex",gap:8}}><button onClick={guardarRinde} className="bbtn">✓ Guardar</button><button onClick={()=>{setShowFormRinde(false);setForm({});}} className="abtn">Cancelar</button></div>
              </div>
            )}

            {/* ── FORM VENTA ── */}
            {showFormVenta&&(
              <div className="card-glass fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#16a34a",marginBottom:10}}>💰 Registrar Venta</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.v_fecha||""} onChange={e=>setForm({...form,v_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}}/></div>
                  <div><label className={lCls}>Toneladas</label><input type="number" step="0.1" value={form.v_tn||""} onChange={e=>setForm({...form,v_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                  <div><label className={lCls}>Precio U$S/tn</label><input type="number" step="0.5" value={form.v_precio||""} onChange={e=>setForm({...form,v_precio:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                  <div><label className={lCls}>Destino</label><input type="text" value={form.v_destino||""} onChange={e=>setForm({...form,v_destino:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Acopio..."/></div>
                  <div><label className={lCls}>Estado</label>
                    <select value={form.v_estado||"pactada"} onChange={e=>setForm({...form,v_estado:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      <option value="pactada">Pactada</option><option value="entregada">Entregada</option><option value="cobrada">Cobrada</option>
                    </select>
                  </div>
                </div>
                {form.v_tn&&form.v_precio&&(
                  <div style={{fontSize:11,color:"#16a34a",fontWeight:700,marginBottom:8,padding:"6px 10px",borderRadius:8,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.18)"}}>
                    Total venta: U$S {(Number(form.v_tn)*Number(form.v_precio)).toFixed(2)}
                  </div>
                )}
                <div style={{display:"flex",gap:8}}><button onClick={guardarVenta} className="bbtn">✓ Guardar Venta</button><button onClick={()=>{setShowFormVenta(false);setForm({});}} className="abtn">Cancelar</button></div>
              </div>
            )}

            {/* Ventas registradas */}
            {ventasActivas.length>0&&(
              <div className="card-glass" style={{padding:0,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#16a34a"}}>💰 Ventas Registradas</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>
                    {ventasActivas.reduce((a,v)=>a+v.tn_vendidas,0).toFixed(1)} tn · 
                    Prom. U$S {ventasActivas.length>0?(ventasActivas.reduce((a,v)=>a+v.tn_vendidas*v.precio_usd,0)/ventasActivas.reduce((a,v)=>a+v.tn_vendidas,0)).toFixed(0):0}/tn
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {ventasActivas.map(v=>(
                    <div key={v.id} className="row-mb" style={{padding:"8px 14px",borderBottom:"1px solid rgba(0,60,140,0.05)",display:"flex",alignItems:"center",gap:12,transition:"background 0.15s"}}>
                      <span style={{fontSize:11,color:"#6b8aaa",minWidth:80}}>{v.fecha}</span>
                      <span style={{fontWeight:800,color:"#0d2137"}}>{v.tn_vendidas} tn</span>
                      <span style={{color:"#d97706",fontWeight:700}}>U$S {v.precio_usd.toFixed(0)}/tn</span>
                      <span style={{fontWeight:800,color:"#16a34a"}}>= U$S {(v.tn_vendidas*v.precio_usd).toFixed(0)}</span>
                      {v.destino&&<span style={{fontSize:11,color:"#6b8aaa"}}>{v.destino}</span>}
                      <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:v.estado==="cobrada"?"rgba(22,163,74,0.12)":v.estado==="entregada"?"rgba(25,118,210,0.12)":"rgba(217,119,6,0.12)",color:v.estado==="cobrada"?"#16a34a":v.estado==="entregada"?"#1565c0":"#d97706",marginLeft:"auto"}}>{v.estado}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── GRÁFICOS ── */}
            {calc&&calc.costoTotalHa>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                {/* TORTA */}
                <div className="card-glass" style={{padding:16}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>Distribución de Costos</div>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <div style={{width:140,height:140,flexShrink:0}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={tortaData} cx="50%" cy="50%" outerRadius={62} innerRadius={28} dataKey="value" paddingAngle={3} labelLine={false}
                            label={({cx,cy,midAngle,innerRadius,outerRadius,percent})=>{
                              if(percent<0.06)return null;
                              const R=Math.PI/180;const r=innerRadius+(outerRadius-innerRadius)*0.6;
                              const x=cx+r*Math.cos(-midAngle*R);const y=cy+r*Math.sin(-midAngle*R);
                              return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">{Math.round(percent*100)}%</text>;
                            }}>
                            {tortaData.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(255,255,255,0.6)" strokeWidth={2}/>)}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>["U$S "+Number(v).toFixed(0)+"/ha",n]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:7}}>
                      {tortaData.map((d,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:10,height:10,borderRadius:3,background:d.color,flexShrink:0}}/>
                          <span style={{fontSize:11,color:"#4a6a8a",flex:1}}>{d.name}</span>
                          <span style={{fontSize:11,fontWeight:800,color:d.color}}>U$S {d.value.toFixed(0)}</span>
                          <span style={{fontSize:10,color:"#aab8c8",minWidth:32,textAlign:"right"}}>{calc.costoTotalHa>0?(d.value/calc.costoTotalHa*100).toFixed(0):0}%</span>
                        </div>
                      ))}
                      <div style={{borderTop:"1px solid rgba(0,60,140,0.10)",paddingTop:6,marginTop:2,display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:800,color:"#0d2137"}}>
                        <span>Total</span>
                        <span>U$S {calc.costoTotalHa.toFixed(0)}/ha</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BARRAS por grupo */}
                <div className="card-glass" style={{padding:16}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>Costo por Grupo (U$S/ha)</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={barrasData} margin={{top:0,right:0,bottom:30,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,60,140,0.07)"/>
                      <XAxis dataKey="name" tick={{fill:"#6b8aaa",fontSize:9}} angle={-35} textAnchor="end" interval={0}/>
                      <YAxis tick={{fill:"#6b8aaa",fontSize:9}} tickFormatter={v=>"U$S "+v} width={55}/>
                      <Tooltip formatter={(v:any)=>["U$S "+fmt(Number(v),0)+"/ha"]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                      <Bar dataKey="value" radius={[5,5,0,0]} name="Costo U$S/ha">
                        {barrasData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── FORM AGREGAR COSTO ── */}
            {showFormMov&&(
              <div className="card-glass fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#1565c0",marginBottom:10}}>+ Registrar Costo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Fecha pago</label><input type="date" value={form.m_fecha||""} onChange={e=>setForm({...form,m_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}}/></div>
                  <div><label className={lCls}>Grupo</label>
                    <select value={form.m_grupo||"1"} onChange={e=>setForm({...form,m_grupo:e.target.value,m_concepto:"",m_unidad:GRUPOS[Number(e.target.value)]?.unidad_default||"ha"})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      {Object.entries(GRUPOS).filter(([g])=>Number(g)<=10).map(([g,info])=>(
                        <option key={g} value={g}>{info.icon} {info.label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lCls}>Concepto</label>
                    <select value={form.m_concepto||""} onChange={e=>setForm({...form,m_concepto:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      <option value="">Seleccionar</option>
                      {(CONCEPTOS[Number(form.m_grupo||1)]||[]).map(c=><option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Moneda</label>
                    <select value={form.m_moneda||"ARS"} onChange={e=>setForm({...form,m_moneda:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.m_monto||""} onChange={e=>setForm({...form,m_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                  <div><label className={lCls}>Unidad</label>
                    <select value={form.m_unidad||GRUPOS[Number(form.m_grupo||1)]?.unidad_default||"ha"} onChange={e=>setForm({...form,m_unidad:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      <option value="ha">U$S por ha</option>
                      <option value="tn">U$S por tn</option>
                      <option value="pct">% sobre ingreso</option>
                      <option value="total">Total campo</option>
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Descripción</label><input type="text" value={form.m_descripcion||""} onChange={e=>setForm({...form,m_descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Detalle..."/></div>
                </div>
                {/* Preview conversión */}
                {form.m_monto&&form.m_moneda==="ARS"&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",fontSize:11,display:"flex",alignItems:"center",gap:8}}>
                    <span>💱</span>
                    <span style={{color:"#4a6a8a"}}>${Number(form.m_monto).toLocaleString("es-AR")} ARS ÷ TC ${Math.round(tcVenta).toLocaleString("es-AR")} =</span>
                    <strong style={{color:"#1565c0"}}>U$S {(Number(form.m_monto)/tcVenta).toFixed(2)}</strong>
                    <span style={{color:"#aab8c8",marginLeft:4}}>· TC del día {form.m_fecha}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMovimiento} className="bbtn" style={{padding:"8px 16px"}}>✓ Guardar Costo</button>
                  <button onClick={()=>{setShowFormMov(false);setEditandoMov(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* ── GRUPOS DE COSTOS ACORDEÓN ── */}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>◆ Desglose de Costos por Grupo</div>
              {Object.entries(GRUPOS).filter(([g])=>Number(g)<=10).map(([gNum,gInfo])=>{
                const g = Number(gNum);
                const movsGrupo = movsActivos.filter(m=>m.grupo===g);
                const costoHa = calc?.costosPorGrupo[g] || 0;
                const pct = calc&&calc.costoTotalHa>0 ? (costoHa/calc.costoTotalHa*100) : 0;
                const isOpen = grupoAbierto===g;
                return(
                  <div key={g} className="grupo-card">
                    {/* Header grupo */}
                    <div style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:isOpen?`${gInfo.color}08`:"transparent",borderBottom:isOpen?`1px solid ${gInfo.color}20`:"none",transition:"background 0.18s"}}
                      onClick={()=>setGrupoAbierto(isOpen?null:g)}>
                      {/* Icono + nombre */}
                      <span style={{fontSize:18,width:28,textAlign:"center"}}>{gInfo.icon}</span>
                      <span style={{fontSize:12,fontWeight:800,color:"#0d2137",flex:1}}>{gInfo.label}</span>
                      {/* Barra de progreso mini */}
                      {costoHa>0&&(
                        <div style={{width:80,height:5,background:"rgba(0,0,0,0.08)",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",background:gInfo.color,borderRadius:4,width:`${Math.min(100,pct)}%`,transition:"width 0.6s ease"}}/>
                        </div>
                      )}
                      {costoHa>0?(
                        <>
                          <span style={{fontSize:12,fontWeight:800,color:gInfo.color,minWidth:90,textAlign:"right"}}>U$S {costoHa.toFixed(0)}/ha</span>
                          <span style={{fontSize:10,color:"#aab8c8",background:"rgba(0,0,0,0.06)",borderRadius:6,padding:"1px 6px",minWidth:36,textAlign:"center"}}>{pct.toFixed(0)}%</span>
                        </>
                      ):(
                        <span style={{fontSize:11,color:"#aab8c8",fontStyle:"italic"}}>Sin datos</span>
                      )}
                      {movsGrupo.length>0&&<span style={{fontSize:10,color:"#6b8aaa"}}>{movsGrupo.length} mov.</span>}
                      <span style={{color:"#aab8c8",fontSize:11,marginLeft:4}}>{isOpen?"▲":"▼"}</span>
                    </div>

                    {/* Detalle expandido */}
                    {isOpen&&(
                      <div className="fade-in">
                        {movsGrupo.length>0&&(
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:540}}>
                              <thead><tr style={{borderBottom:`1px solid ${gInfo.color}20`,background:`${gInfo.color}06`}}>
                                {["Fecha","Concepto","Descripción","Moneda","Monto","TC","U$S","Unidad","U$S/ha",""].map(h=>(
                                  <th key={h} style={{textAlign:"left",padding:"6px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {movsGrupo.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(m=>{
                                  const usdHa = m.unidad==="ha"?m.monto_usd:m.unidad==="tn"?m.monto_usd*(calc?.rindeUsado||0):m.unidad==="pct"?m.monto_usd*(calc?.ingresoBrutoHa||0)/100:m.monto_usd/(loteData?.hectareas||1);
                                  const isManual = !m.origen || m.origen === "manual";
                                  return(
                                    <tr key={m.id} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",whiteSpace:"nowrap"}}>{m.fecha}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#0d2137"}}>{m.concepto.replace(/_/g," ")}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.descripcion||"—"}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa"}}>{m.moneda}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#d97706"}}>{m.moneda==="ARS"?"$":""}{fmt(m.monto_original)}</td>
                                      <td style={{padding:"6px 12px",color:"#aab8c8",fontSize:10}}>${fmt(m.tc_usado)}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#1565c0"}}>U$S {m.monto_usd.toFixed(2)}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",fontSize:10}}>{m.unidad}</td>
                                      <td style={{padding:"6px 12px",fontWeight:800,color:gInfo.color}}>U$S {usdHa.toFixed(2)}</td>
                                      <td style={{padding:"6px 12px"}}>
                                        {isManual&&<button onClick={()=>eliminarMov(m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:12,padding:"0 4px"}}>✕</button>}
                                        {!isManual&&<span style={{fontSize:9,color:"#aab8c8",fontStyle:"italic"}}>{m.origen}</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                                <tr style={{borderTop:`1px solid ${gInfo.color}25`,background:`${gInfo.color}06`}}>
                                  <td colSpan={8} style={{padding:"6px 12px",fontWeight:800,color:gInfo.color,fontSize:11}}>TOTAL {gInfo.label.toUpperCase()}</td>
                                  <td style={{padding:"6px 12px",fontWeight:800,color:gInfo.color}}>U$S {costoHa.toFixed(2)}/ha</td>
                                  <td/>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div style={{padding:"8px 14px",background:`${gInfo.color}05`}}>
                          <button onClick={()=>{setShowFormMov(true);setForm({m_fecha:new Date().toISOString().split("T")[0],m_moneda:"ARS",m_grupo:String(g),m_unidad:gInfo.unidad_default});setGrupoAbierto(g);}}
                            className="abtn" style={{fontSize:11,padding:"5px 10px",border:`1px solid ${gInfo.color}30`,color:gInfo.color}}>
                            {gInfo.icon} + Agregar en {gInfo.label}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── INDICADORES CLAVE ── */}
            {calc&&calc.ingresoBrutoHa>0&&(
              <div className="card-glass" style={{padding:16,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:12}}>📐 Indicadores Clave</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                  {[
                    {l:"Costo/tn",v:`U$S ${calc.rindeUsado>0?(calc.costoTotalHa/calc.rindeUsado).toFixed(0):"—"}`,c:"#dc2626",icon:"💰"},
                    {l:"Rinde equilibrio",v:`${calc.rindeEq.toFixed(2)} tn/ha`,c:"#d97706",icon:"⚖️"},
                    {l:"Cobertura costos",v:`${calc.cobertura.toFixed(0)}%`,c:calc.cobertura<100?"#16a34a":"#dc2626",icon:"🛡️"},
                    {l:"MB por tn",v:`U$S ${calc.rindeUsado>0?(calc.mbHa/calc.rindeUsado).toFixed(0):"—"}`,c:calc.mbHa>=0?"#1565c0":"#dc2626",icon:"📊"},
                    {l:"Rentabilidad",v:`${calc.costoTotalHa>0?((calc.mbHa/calc.costoTotalHa)*100).toFixed(0):0}%`,c:calc.mbHa>=0?"#16a34a":"#dc2626",icon:"📈"},
                    {l:"MB total campo",v:`U$S ${fmt(calc.mbHa*loteData.hectareas,0)}`,c:calc.mbHa>=0?"#16a34a":"#dc2626",icon:"🌍"},
                  ].map(s=>(
                    <div key={s.l} style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.55)",border:"1px solid rgba(255,255,255,0.80)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                        <span style={{fontSize:12}}>{s.icon}</span>
                        <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.6}}>{s.l}</div>
                      </div>
                      <div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SENSIBILIDAD ── */}
            {calc&&calc.precioPromedio>0&&calc.rindeUsado>0&&(
              <div className="card-glass" style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14}}>🔬</span>
                  <span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>Análisis de Sensibilidad</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>Impacto de cambios en precio y rinde</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:500}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                      {["Escenario","Rinde","Precio U$S/tn","MB/ha","MB Total","Equilibrio"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {[
                        {e:"Base ◀",r:calc.rindeUsado,p:calc.precioPromedio,base:true},
                        {e:"−10% Rinde",r:calc.rindeUsado*0.9,p:calc.precioPromedio,base:false},
                        {e:"+10% Rinde",r:calc.rindeUsado*1.1,p:calc.precioPromedio,base:false},
                        {e:"−10% Precio",r:calc.rindeUsado,p:calc.precioPromedio*0.9,base:false},
                        {e:"+10% Precio",r:calc.rindeUsado,p:calc.precioPromedio*1.1,base:false},
                      ].map((s,i)=>{
                        const ing=s.r*s.p*(1+(cabActiva?.ajuste_calidad_pct||0)/100);
                        const mb=ing-calc.costoTotalHa;
                        const eq=s.p>0?calc.costoTotalHa/s.p:0;
                        return(
                          <tr key={i} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",background:s.base?"rgba(25,118,210,0.05)":"transparent",transition:"background 0.15s"}}>
                            <td style={{padding:"8px 12px",fontWeight:s.base?800:600,color:"#0d2137"}}>{s.e}</td>
                            <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{s.r.toFixed(2)} tn/ha</td>
                            <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>U$S {s.p.toFixed(0)}</td>
                            <td style={{padding:"8px 12px",fontWeight:800,color:mb>=0?"#16a34a":"#dc2626"}}>U$S {mb.toFixed(0)}</td>
                            <td style={{padding:"8px 12px",fontWeight:700,color:mb>=0?"#16a34a":"#dc2626"}}>U$S {fmt(mb*loteData.hectareas,0)}</td>
                            <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{eq.toFixed(2)} tn/ha</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

"use client";
// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import Image from "next/image";

// ── TIPOS ──────────────────────────────────────────────────────────────────
type Campana = { id: string; nombre: string; año_inicio: number; activa: boolean; };
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_orden: string; cultivo_completo: string; };
type MbCabecera = {
  id: string; lote_id: string; campana_id: string; cultivo: string; hectareas: number;
  rinde_esp: number; rinde_real: number; precio_promedio_usd: number; ajuste_calidad_pct: number;
  ingreso_bruto_usd: number; costo_total_usd_ha: number; costo_grupos_1_10_usd_ha: number;
  costo_grupos_11_12_usd_ha: number; margen_bruto_usd_ha: number; resultado_neto_usd_ha: number;
  rinde_equilibrio: number; relacion_insumo_producto: number;
  estado: string; cerrado: boolean; fecha_cierre: string | null;
};
type MbMovimiento = {
  id: string; cabecera_id: string; fecha: string; grupo: number;
  concepto: string; descripcion: string; moneda: string;
  monto_original: number; tc_usado: number; monto_usd: number; unidad: string;
};
type MbVenta = {
  id: string; cabecera_id: string; fecha: string;
  tn_vendidas: number; precio_usd: number; destino: string; estado: string;
};
type MbEmpresaCosto = {
  id: string; campana_id: string; fecha: string; grupo: number;
  concepto: string; descripcion: string; moneda: string;
  monto_original: number; tc_usado: number; monto_usd: number;
  distribucion: string; lotes_ids: string[];
};

// ── CONSTANTES ─────────────────────────────────────────────────────────────
const GRUPOS: Record<number, { label: string; icon: string; color: string; unidad_default: string }> = {
  1:  { label: "Implantación",      icon: "🌱", color: "#22c55e", unidad_default: "ha" },
  2:  { label: "Fertilización",     icon: "💊", color: "#d97706", unidad_default: "ha" },
  3:  { label: "Protección",        icon: "🧪", color: "#1565c0", unidad_default: "ha" },
  4:  { label: "Cosecha",           icon: "🌾", color: "#f59e0b", unidad_default: "ha" },
  5:  { label: "Flete y Logística", icon: "🚛", color: "#6366f1", unidad_default: "tn" },
  6:  { label: "Comercialización",  icon: "🏢", color: "#0891b2", unidad_default: "pct" },
  7:  { label: "Impuestos",         icon: "📋", color: "#dc2626", unidad_default: "pct" },
  8:  { label: "Financieros",       icon: "🏦", color: "#7c3aed", unidad_default: "pct" },
  9:  { label: "Seguros",           icon: "🛡️", color: "#059669", unidad_default: "ha" },
  10: { label: "Alquiler",          icon: "🤝", color: "#ea580c", unidad_default: "ha" },
  11: { label: "Administración",    icon: "💼", color: "#6b7280", unidad_default: "total" },
  12: { label: "Estructura",        icon: "🏗️", color: "#9ca3af", unidad_default: "total" },
};

const CONCEPTOS: Record<number, string[]> = {
  1:  ["semilla","tratamiento_semilla","inoculante","siembra_servicio","otros"],
  2:  ["fertilizante","aplicacion_fertilizante","otros"],
  3:  ["herbicidas","insecticidas","fungicidas","coadyuvantes","servicio_aplicacion","otros"],
  4:  ["cosecha_servicio","otros"],
  5:  ["flete_corto","flete_largo","otros"],
  6:  ["comision_acopio","secado","zarandeo","almacenaje","perdidas_almacenaje","diferencias_calidad","otros"],
  7:  ["ingresos_brutos","tasa_vial","carta_de_porte","inmobiliario_rural","otros"],
  8:  ["intereses_insumos","intereses_bancarios","costo_plazo","otros"],
  9:  ["seguro_agricola","cobertura_precio","otros"],
  10: ["alquiler","otros"],
  11: ["honorarios","administracion_general","otros"],
  12: ["sueldos_estructura","vehiculos","energia","otros"],
};

const CULTIVO_COLORS: Record<string,string> = {
  soja:"#22c55e",maiz:"#d97706",trigo:"#f59e0b",girasol:"#fbbf24",
  sorgo:"#ef4444",cebada:"#a78bfa",otro:"#60a5fa",
};
const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐",
};

function fmt(n: number, dec = 0) {
  if (!n || isNaN(n)) return "0";
  return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString("es-AR");
}
function fmtUsd(n: number) { return "U$S " + fmt(n, 2); }

// ── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function MargenPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [cabeceras, setCabeceras] = useState<MbCabecera[]>([]);
  const [movimientos, setMovimientos] = useState<MbMovimiento[]>([]);
  const [ventas, setVentas] = useState<MbVenta[]>([]);
  const [empresaCostos, setEmpresaCostos] = useState<MbEmpresaCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loteActivo, setLoteActivo] = useState<string|null>(null); // lote_id
  const [grupoActivo, setGrupoActivo] = useState<number|null>(null);
  const [msgExito, setMsgExito] = useState("");
  const [tcVenta, setTcVenta] = useState<number>(1400);
  const [tcFecha, setTcFecha] = useState<string>("");
  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showFormMov, setShowFormMov] = useState(false);
  const [showFormEmpresa, setShowFormEmpresa] = useState(false);
  const [editandoMov, setEditandoMov] = useState<string|null>(null);
  const [editandoVenta, setEditandoVenta] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [lotesSelEmpresa, setLotesSelEmpresa] = useState<string[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  // ── FETCH TC ──
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
    } catch { /* sin TC online, usar el guardado */ }
  }, []);

  const getTCFecha = async (fecha: string): Promise<number> => {
    if (!empresaId) return tcVenta;
    const sb = await getSB();
    const { data } = await sb.from("finanzas_cotizaciones")
      .select("usd_usado").eq("empresa_id", empresaId)
      .lte("fecha", fecha).order("fecha", { ascending: false }).limit(1);
    return data?.[0]?.usd_usado || tcVenta || 1;
  };

  // ── INIT ──
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
      .eq("empresa_id", eid).eq("campana_id", cid).eq("es_segundo_cultivo", false)
      .order("nombre");
    const loteIds = (lotesData ?? []).map((l: any) => l.id);
    setLotes(lotesData ?? []);

    if (loteIds.length === 0) {
      setCabeceras([]); setMovimientos([]); setVentas([]); setEmpresaCostos([]); return;
    }

    const [cab, mov, ven, emp] = await Promise.all([
      sb.from("mb_cabecera").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("mb_movimientos").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false }),
      sb.from("mb_ventas").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false }),
      sb.from("mb_empresa_costos").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false }),
    ]);
    setCabeceras(cab.data ?? []);
    setMovimientos(mov.data ?? []);
    setVentas(ven.data ?? []);
    setEmpresaCostos(emp.data ?? []);
  };

  // ── CALCULAR TOTALES POR LOTE ──
  const calcularLote = (cabeceraId: string, hectareas: number) => {
    const movs = movimientos.filter(m => m.cabecera_id === cabeceraId);
    const vents = ventas.filter(v => v.cabecera_id === cabeceraId);
    const cab = cabeceras.find(c => c.id === cabeceraId);
    if (!cab) return null;

    const rindeUsado = cab.rinde_real > 0 ? cab.rinde_real : cab.rinde_esp;
    // Precio promedio ponderado
    const totalTn = vents.reduce((a, v) => a + v.tn_vendidas, 0);
    const precioPromedio = totalTn > 0
      ? vents.reduce((a, v) => a + v.tn_vendidas * v.precio_usd, 0) / totalTn
      : cab.precio_promedio_usd || 0;

    const ajuste = 1 + (cab.ajuste_calidad_pct || 0) / 100;
    const ingresoBrutoHa = rindeUsado * precioPromedio * ajuste;
    const ingresoBrutoTotal = ingresoBrutoHa * hectareas;

    // Calcular costo por grupo
    const costosPorGrupo: Record<number, number> = {};
    for (let g = 1; g <= 12; g++) costosPorGrupo[g] = 0;

    for (const m of movs) {
      let costoUsdHa = 0;
      if (m.unidad === "ha") costoUsdHa = m.monto_usd;
      else if (m.unidad === "tn") costoUsdHa = m.monto_usd * rindeUsado;
      else if (m.unidad === "pct") costoUsdHa = ingresoBrutoHa * m.monto_usd / 100;
      else if (m.unidad === "total") costoUsdHa = m.monto_usd / hectareas;
      costosPorGrupo[m.grupo] = (costosPorGrupo[m.grupo] || 0) + costoUsdHa;
    }

    const costo1a10Ha = Object.entries(costosPorGrupo)
      .filter(([g]) => Number(g) <= 10).reduce((a, [, v]) => a + v, 0);
    const costo11a12Ha = Object.entries(costosPorGrupo)
      .filter(([g]) => Number(g) > 10).reduce((a, [, v]) => a + v, 0);
    const costoTotalHa = costo1a10Ha + costo11a12Ha;

    const mbHa = ingresoBrutoHa - costoTotalHa;
    const rnHa = ingresoBrutoHa - costoTotalHa; // mismo por ahora
    const rindeEq = precioPromedio > 0 ? costoTotalHa / precioPromedio : 0;
    const relIP = ingresoBrutoHa > 0 ? costoTotalHa / ingresoBrutoHa : 0;

    return {
      rindeUsado, precioPromedio, ajuste, ingresoBrutoHa, ingresoBrutoTotal,
      costosPorGrupo, costo1a10Ha, costo11a12Ha, costoTotalHa,
      mbHa, rnHa, rindeEq, relIP, totalTn,
      estado: cab.rinde_real > 0 ? "real" : "estimado",
    };
  };

  // ── GUARDAR / CREAR CABECERA ──
  const asegurarCabecera = async (loteId: string): Promise<string> => {
    const existing = cabeceras.find(c => c.lote_id === loteId);
    if (existing) return existing.id;
    const sb = await getSB();
    const lote = lotes.find(l => l.id === loteId);
    if (!lote || !empresaId) return "";
    const { data } = await sb.from("mb_cabecera").insert({
      empresa_id: empresaId, lote_id: loteId, campana_id: campanaActiva,
      cultivo: lote.cultivo, cultivo_orden: lote.cultivo_orden,
      hectareas: lote.hectareas,
      rinde_esp: 0, rinde_real: 0, precio_promedio_usd: 0,
    }).select().single();
    if (data) {
      setCabeceras(prev => [...prev, data]);
      return data.id;
    }
    return "";
  };

  // ── GUARDAR RINDE/PRECIO ──
  const guardarCabecera = async () => {
    if (!loteActivo || !empresaId) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    const upd: Record<string, any> = {};
    if (form.rinde_esp !== undefined) upd.rinde_esp = Number(form.rinde_esp || 0);
    if (form.rinde_real !== undefined) upd.rinde_real = Number(form.rinde_real || 0);
    if (form.precio_promedio_usd !== undefined) upd.precio_promedio_usd = Number(form.precio_promedio_usd || 0);
    if (form.ajuste_calidad_pct !== undefined) upd.ajuste_calidad_pct = Number(form.ajuste_calidad_pct || 0);
    if (form.cerrado === "true") { upd.cerrado = true; upd.fecha_cierre = new Date().toISOString().split("T")[0]; upd.estado = "real"; }
    await sb.from("mb_cabecera").update(upd).eq("id", cabId);
    msg("✅ Datos guardados");
    await fetchAll(empresaId, campanaActiva);
    setForm({});
  };

  // ── GUARDAR VENTA ──
  const guardarVenta = async () => {
    if (!loteActivo || !empresaId || !form.v_fecha || !form.v_tn || !form.v_precio) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo, campana_id: campanaActiva,
      cabecera_id: cabId, fecha: form.v_fecha,
      tn_vendidas: Number(form.v_tn), precio_usd: Number(form.v_precio),
      destino: form.v_destino || "", estado: form.v_estado || "pactada",
    };
    if (editandoVenta) {
      await sb.from("mb_ventas").update(payload).eq("id", editandoVenta);
      setEditandoVenta(null);
    } else {
      await sb.from("mb_ventas").insert(payload);
    }
    msg("✅ Venta guardada");
    await fetchAll(empresaId, campanaActiva);
    setShowFormVenta(false); setForm({});
  };

  // ── GUARDAR MOVIMIENTO ──
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
      cabecera_id: cabId, fecha: form.m_fecha,
      grupo: Number(form.m_grupo), concepto: form.m_concepto,
      descripcion: form.m_descripcion || "",
      moneda, monto_original: montoOriginal, tc_usado: tc,
      monto_usd: montoUsd, unidad: form.m_unidad || GRUPOS[Number(form.m_grupo)]?.unidad_default || "ha",
    };
    if (editandoMov) {
      await sb.from("mb_movimientos").update(payload).eq("id", editandoMov);
      setEditandoMov(null);
    } else {
      await sb.from("mb_movimientos").insert(payload);
    }
    msg(`✅ Movimiento guardado — TC: $${fmt(tc)} → U$S ${montoUsd.toFixed(2)}`);
    await fetchAll(empresaId, campanaActiva);
    setShowFormMov(false); setForm({});
  };

  // ── GUARDAR COSTO EMPRESA ──
  const guardarCostoEmpresa = async () => {
    if (!empresaId || !form.e_fecha || !form.e_grupo || !form.e_concepto || !form.e_monto) return;
    const moneda = form.e_moneda || "ARS";
    const montoOriginal = Number(form.e_monto);
    const tc = moneda === "ARS" ? await getTCFecha(form.e_fecha) : 1;
    const montoUsd = moneda === "ARS" ? montoOriginal / tc : montoOriginal;
    const sb = await getSB();
    await sb.from("mb_empresa_costos").insert({
      empresa_id: empresaId, campana_id: campanaActiva, fecha: form.e_fecha,
      grupo: Number(form.e_grupo), concepto: form.e_concepto,
      descripcion: form.e_descripcion || "",
      moneda, monto_original: montoOriginal, tc_usado: tc, monto_usd: montoUsd,
      distribucion: form.e_distribucion || "todos",
      lotes_ids: lotesSelEmpresa,
    });
    msg(`✅ Costo empresa guardado — U$S ${montoUsd.toFixed(2)}`);
    await fetchAll(empresaId, campanaActiva);
    setShowFormEmpresa(false); setForm({}); setLotesSelEmpresa([]);
  };

  const eliminarMov = async (id: string) => {
    if (!confirm("¿Eliminar movimiento?") || !empresaId) return;
    const sb = await getSB();
    await sb.from("mb_movimientos").delete().eq("id", id);
    await fetchAll(empresaId, campanaActiva);
  };

  const eliminarVenta = async (id: string) => {
    if (!confirm("¿Eliminar venta?") || !empresaId) return;
    const sb = await getSB();
    await sb.from("mb_ventas").delete().eq("id", id);
    await fetchAll(empresaId, campanaActiva);
  };

  const cerrarMB = async () => {
    if (!loteActivo || !empresaId || !confirm("¿Cerrar el MB de este lote? No se podrán agregar más movimientos.")) return;
    const cab = cabeceras.find(c => c.lote_id === loteActivo);
    if (!cab) return;
    const sb = await getSB();
    await sb.from("mb_cabecera").update({ cerrado: true, fecha_cierre: new Date().toISOString().split("T")[0], estado: "real" }).eq("id", cab.id);
    msg("✅ MB cerrado — estado: REAL");
    await fetchAll(empresaId, campanaActiva);
  };

  // ── LOTE ACTIVO DATA ──
  const loteData = loteActivo ? lotes.find(l => l.id === loteActivo) : null;
  const cabActiva = loteActivo ? cabeceras.find(c => c.lote_id === loteActivo) : null;
  const calcActivo = cabActiva ? calcularLote(cabActiva.id, loteData?.hectareas || 0) : null;
  const movsActivos = cabActiva ? movimientos.filter(m => m.cabecera_id === cabActiva.id) : [];
  const ventasActivas = cabActiva ? ventas.filter(v => v.cabecera_id === cabActiva.id) : [];

  // ── RESUMEN GENERAL ──
  const resumenGeneral = lotes.map(lote => {
    const cab = cabeceras.find(c => c.lote_id === lote.id);
    const calc = cab ? calcularLote(cab.id, lote.hectareas) : null;
    return { lote, cab, calc };
  });
  const totalHaGeneral = lotes.reduce((a, l) => a + l.hectareas, 0);
  const totalMBGeneral = resumenGeneral.reduce((a, r) => a + (r.calc ? r.calc.mbHa * r.lote.hectareas : 0), 0);

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
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .sel option{background:white;color:#1a2a4a;}
        .card{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid white;border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.15);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card>*{position:relative;z-index:1;}
        .kpi{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.88);border-radius:13px;padding:10px 12px;text-align:center;position:relative;overflow:hidden;}
        .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);pointer-events:none;}
        .kpi>*{position:relative;}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 14px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;display:inline-flex;align-items:center;gap:5px;}
        .abtn:hover{background:rgba(255,255,255,0.95);}
        .topbar{background-image:url('/FON.png');background-size:cover;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar>*{position:relative;z-index:1;}
        .lote-btn{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.88);border-radius:14px;cursor:pointer;transition:all 0.18s;position:relative;overflow:hidden;}
        .lote-btn::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .lote-btn>*{position:relative;}
        .lote-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(20,80,160,0.18);}
        .row-mb:hover{background:rgba(255,255,255,0.80)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        .tag{display:inline-flex;align-items:center;border-radius:8px;font-size:11px;font-weight:700;padding:2px 8px;}
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
          {/* TC */}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:10,border:"1px solid rgba(217,119,6,0.30)",background:"rgba(217,119,6,0.07)"}}>
            <span style={{fontSize:10,color:"#6b8aaa",fontWeight:700}}>TC BNA</span>
            <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>${fmt(tcVenta)}</span>
            {tcFecha&&<span style={{fontSize:10,color:"#aab8c8"}}>{tcFecha}</span>}
            <button onClick={()=>empresaId&&fetchTC(empresaId)} style={{background:"none",border:"none",cursor:"pointer",color:"#d97706",fontSize:12}}>↺</button>
          </div>
          {/* Campaña */}
          <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);if(empresaId)await fetchAll(empresaId,e.target.value);}} className="sel" style={{fontSize:12,fontWeight:700,color:"#1565c0",padding:"6px 10px",minWidth:110}}>
            {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
          </select>
          {/* Costo empresa */}
          <button onClick={()=>setShowFormEmpresa(!showFormEmpresa)} className="abtn" style={{fontSize:11}}>💼 Admin/Estructura</button>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📊 Margen Bruto</div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msgExito&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msgExito.startsWith("✅")?"#16a34a":"#dc2626",background:msgExito.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msgExito}<button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* ── FORM COSTO EMPRESA ── */}
        {showFormEmpresa&&(
          <div className="card fade-in" style={{padding:14,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginBottom:10}}>💼 Costo de Empresa (Admin/Estructura)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
              <div><label className={lCls}>Fecha</label><input type="date" value={form.e_fecha||new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,e_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}}/></div>
              <div><label className={lCls}>Grupo</label><select value={form.e_grupo||"11"} onChange={e=>setForm({...form,e_grupo:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                <option value="11">💼 Administración</option><option value="12">🏗️ Estructura</option>
              </select></div>
              <div><label className={lCls}>Concepto</label><select value={form.e_concepto||""} onChange={e=>setForm({...form,e_concepto:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                <option value="">Seleccionar</option>
                {(CONCEPTOS[Number(form.e_grupo||11)]||[]).map(c=><option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
              </select></div>
              <div><label className={lCls}>Moneda</label><select value={form.e_moneda||"ARS"} onChange={e=>setForm({...form,e_moneda:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}><option value="ARS">$ ARS</option><option value="USD">U$S USD</option></select></div>
              <div><label className={lCls}>Monto</label><input type="number" value={form.e_monto||""} onChange={e=>setForm({...form,e_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
              <div><label className={lCls}>Descripción</label><input type="text" value={form.e_descripcion||""} onChange={e=>setForm({...form,e_descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Detalle..."/></div>
            </div>
            <div style={{marginBottom:10}}>
              <label className={lCls}>Distribuir entre:</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                {[{v:"todos",l:"📋 Todos los lotes"},{v:"grupo",l:"📌 Grupo"},{v:"lotes",l:"🎯 Lote individual"}].map(op=>(
                  <button key={op.v} onClick={()=>{setForm({...form,e_distribucion:op.v});setLotesSelEmpresa([]);}}
                    style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                      borderColor:(form.e_distribucion||"todos")===op.v?"#7c3aed":"rgba(180,210,240,0.50)",
                      background:(form.e_distribucion||"todos")===op.v?"rgba(124,58,237,0.10)":"rgba(255,255,255,0.70)",
                      color:(form.e_distribucion||"todos")===op.v?"#7c3aed":"#6b8aaa"}}>{op.l}</button>
                ))}
              </div>
              {(form.e_distribucion==="grupo"||form.e_distribucion==="lotes")&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {lotes.map(l=>(
                    <button key={l.id} onClick={()=>{
                      if(form.e_distribucion==="lotes") setLotesSelEmpresa([l.id]);
                      else setLotesSelEmpresa(p=>p.includes(l.id)?p.filter(x=>x!==l.id):[...p,l.id]);
                    }} style={{padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                      borderColor:lotesSelEmpresa.includes(l.id)?"#7c3aed":"rgba(180,210,240,0.40)",
                      background:lotesSelEmpresa.includes(l.id)?"rgba(124,58,237,0.12)":"rgba(255,255,255,0.70)",
                      color:lotesSelEmpresa.includes(l.id)?"#7c3aed":"#4a6a8a"}}>
                      {l.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={guardarCostoEmpresa} className="bbtn">✓ Guardar</button>
              <button onClick={()=>{setShowFormEmpresa(false);setForm({});setLotesSelEmpresa([]);}} className="abtn">Cancelar</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            VISTA PRINCIPAL — LISTA LOTES
        ══════════════════════════════ */}
        {!loteActivo&&(
          <div className="fade-in">
            {/* KPIs generales */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
              {[
                {l:"Ha Totales",v:fmt(totalHaGeneral)+" ha",c:"#d97706"},
                {l:"Lotes",v:String(lotes.length),c:"#0d2137"},
                {l:"MB Total",v:"U$S "+fmt(totalMBGeneral,0),c:totalMBGeneral>=0?"#16a34a":"#dc2626"},
                {l:"MB/Ha Prom.",v:"U$S "+fmt(totalHaGeneral>0?totalMBGeneral/totalHaGeneral:0,0)+"/ha",c:"#1565c0"},
              ].map(s=>(
                <div key={s.l} className="kpi">
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Gráfico de barras resumen */}
            {resumenGeneral.filter(r=>r.calc).length>0&&(
              <div className="card" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>MB por Lote (U$S/ha)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={resumenGeneral.filter(r=>r.calc).map(r=>({
                    name:r.lote.nombre,
                    ingreso:Math.round(r.calc!.ingresoBrutoHa),
                    costo:Math.round(r.calc!.costoTotalHa),
                    mb:Math.round(r.calc!.mbHa),
                  }))} margin={{top:0,right:0,bottom:20,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,60,140,0.07)"/>
                    <XAxis dataKey="name" tick={{fill:"#6b8aaa",fontSize:10}} angle={-20} textAnchor="end"/>
                    <YAxis tick={{fill:"#6b8aaa",fontSize:9}} tickFormatter={v=>"U$S "+v}/>
                    <Tooltip formatter={(v:any,n:string)=>["U$S "+fmt(Number(v)),n]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                    <Legend wrapperStyle={{fontSize:11,color:"#6b8aaa"}}/>
                    <Bar dataKey="ingreso" name="Ingreso" fill="rgba(22,163,74,0.35)" radius={[4,4,0,0]}/>
                    <Bar dataKey="costo" name="Costo" fill="rgba(220,38,38,0.35)" radius={[4,4,0,0]}/>
                    <Bar dataKey="mb" name="Margen" radius={[4,4,0,0]}>
                      {resumenGeneral.filter(r=>r.calc).map((r,i)=><Cell key={i} fill={r.calc!.mbHa>=0?"#16a34a":"#dc2626"}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabla resumen lotes */}
            <div className="card" style={{padding:0,overflow:"hidden",marginBottom:14}}>
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",fontSize:13,fontWeight:800,color:"#0d2137"}}>
                📋 Lotes — Campaña {campanas.find(c=>c.id===campanaActiva)?.nombre}
              </div>
              {lotes.length===0
                ?<div style={{textAlign:"center",padding:"40px 20px",color:"#6b8aaa",fontSize:13}}>
                    <div style={{fontSize:36,opacity:0.12,marginBottom:8}}>📊</div>
                    Sin lotes en esta campaña
                  </div>
                :<div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:700}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                      {["Lote","Cultivo","Ha","Rinde","Precio","Ingreso/ha","Costo/ha","MB/ha","Estado",""].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {resumenGeneral.map(({lote,cab,calc})=>{
                        const color=CULTIVO_COLORS[lote.cultivo]??"#6b7280";
                        const icon=CULTIVO_ICONS[lote.cultivo]??"🌾";
                        return(
                          <tr key={lote.id} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",cursor:"pointer",transition:"background 0.15s"}}
                            onClick={()=>setLoteActivo(lote.id)}>
                            <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{lote.nombre}</td>
                            <td style={{padding:"9px 12px"}}><span className="tag" style={{background:color+"20",color}}>{icon} {lote.cultivo_completo||lote.cultivo||"—"}</span></td>
                            <td style={{padding:"9px 12px",color:"#d97706",fontWeight:700}}>{lote.hectareas}</td>
                            <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{calc?`${calc.rindeUsado} tn/ha`:"—"}</td>
                            <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{calc&&calc.precioPromedio>0?`U$S ${calc.precioPromedio.toFixed(0)}/tn`:"—"}</td>
                            <td style={{padding:"9px 12px",fontWeight:600,color:"#0d2137"}}>{calc?fmtUsd(calc.ingresoBrutoHa):"—"}</td>
                            <td style={{padding:"9px 12px",color:"#dc2626",fontWeight:600}}>{calc?fmtUsd(calc.costoTotalHa):"—"}</td>
                            <td style={{padding:"9px 12px",fontWeight:800,color:calc&&calc.mbHa>=0?"#16a34a":"#dc2626"}}>{calc?fmtUsd(calc.mbHa):"—"}</td>
                            <td style={{padding:"9px 12px"}}>
                              {cab
                                ?<span className="tag" style={{background:cab.cerrado?"rgba(22,163,74,0.12)":"rgba(217,119,6,0.12)",color:cab.cerrado?"#16a34a":"#d97706"}}>
                                  {cab.cerrado?"✅ REAL":"📋 EST."}
                                </span>
                                :<span className="tag" style={{background:"rgba(107,114,128,0.10)",color:"#6b8aaa"}}>Sin datos</span>
                              }
                            </td>
                            <td style={{padding:"9px 12px"}}>
                              <button onClick={e=>{e.stopPropagation();setLoteActivo(lote.id);}} className="bbtn" style={{padding:"5px 10px",fontSize:11}}>Abrir →</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              }
            </div>

            {/* Costos empresa */}
            {empresaCostos.length>0&&(
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#7c3aed"}}>💼 Costos de Empresa</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>U$S {fmt(empresaCostos.reduce((a,e)=>a+e.monto_usd,0),2)} total</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                      {["Fecha","Grupo","Concepto","Moneda","Monto","TC","U$S","Distribución"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {empresaCostos.map(ec=>(
                        <tr key={ec.id} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                          <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{ec.fecha}</td>
                          <td style={{padding:"7px 12px"}}><span className="tag" style={{background:GRUPOS[ec.grupo]?.color+"20",color:GRUPOS[ec.grupo]?.color}}>{GRUPOS[ec.grupo]?.icon} {GRUPOS[ec.grupo]?.label}</span></td>
                          <td style={{padding:"7px 12px",color:"#0d2137",fontWeight:600}}>{ec.concepto.replace(/_/g," ")}</td>
                          <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{ec.moneda}</td>
                          <td style={{padding:"7px 12px",fontWeight:700,color:"#d97706"}}>{ec.moneda==="ARS"?"$":""}{fmt(ec.monto_original)}</td>
                          <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:11}}>${fmt(ec.tc_usado)}</td>
                          <td style={{padding:"7px 12px",fontWeight:800,color:"#1565c0"}}>{fmtUsd(ec.monto_usd)}</td>
                          <td style={{padding:"7px 12px",fontSize:11,color:"#6b8aaa"}}>{ec.distribucion==="todos"?"Todos los lotes":ec.distribucion==="grupo"?`${ec.lotes_ids?.length} lotes`:"Lote específico"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            DETALLE LOTE
        ══════════════════════════════ */}
        {loteActivo&&loteData&&(
          <div className="fade-in">
            {/* Header lote */}
            <div className="card" style={{padding:14,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:5,alignSelf:"stretch",borderRadius:4,background:CULTIVO_COLORS[loteData.cultivo]??"#6b7280",flexShrink:0}}/>
                  <span style={{fontSize:24}}>{CULTIVO_ICONS[loteData.cultivo]??"🌾"}</span>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{loteData.nombre}</h2>
                    <div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap",fontSize:11}}>
                      <span style={{fontWeight:700,color:"#d97706"}}>{loteData.hectareas} ha</span>
                      <span style={{color:CULTIVO_COLORS[loteData.cultivo]??"#6b7280",fontWeight:700}}>{loteData.cultivo_completo||loteData.cultivo}</span>
                      {cabActiva&&<span className="tag" style={{background:cabActiva.cerrado?"rgba(22,163,74,0.12)":"rgba(217,119,6,0.12)",color:cabActiva.cerrado?"#16a34a":"#d97706"}}>{cabActiva.cerrado?"✅ REAL":"📋 ESTIMADO"}</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>{setShowFormVenta(true);setEditandoVenta(null);setForm({v_fecha:new Date().toISOString().split("T")[0],v_estado:"pactada"});}} className="abtn" style={{fontSize:11}}>+ Venta</button>
                  <button onClick={()=>{setShowFormMov(true);setEditandoMov(null);setForm({m_fecha:new Date().toISOString().split("T")[0],m_moneda:"ARS",m_grupo:"1"});}} className="bbtn" style={{fontSize:11}}>+ Costo</button>
                  {cabActiva&&!cabActiva.cerrado&&<button onClick={cerrarMB} style={{padding:"7px 12px",borderRadius:10,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.25)",color:"#16a34a",cursor:"pointer",fontWeight:700,fontSize:11}}>🔒 Cerrar MB</button>}
                </div>
              </div>
            </div>

            {/* KPIs del lote */}
            {calcActivo&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:12}}>
                {[
                  {l:"Rinde",v:(calcActivo.rindeUsado||0)+" tn/ha",c:"#d97706",sub:calcActivo.estado==="real"?"real":"esperado"},
                  {l:"Precio prom.",v:calcActivo.precioPromedio>0?`U$S ${calcActivo.precioPromedio.toFixed(0)}/tn`:"—",c:"#0d2137"},
                  {l:"Ingreso/ha",v:fmtUsd(calcActivo.ingresoBrutoHa),c:"#16a34a"},
                  {l:"Costo/ha",v:fmtUsd(calcActivo.costoTotalHa),c:"#dc2626"},
                  {l:"MB/ha",v:fmtUsd(calcActivo.mbHa),c:calcActivo.mbHa>=0?"#16a34a":"#dc2626"},
                  {l:"MB Total",v:fmtUsd(calcActivo.mbHa*loteData.hectareas),c:calcActivo.mbHa>=0?"#16a34a":"#dc2626"},
                  {l:"Rinde equilibrio",v:calcActivo.rindeEq>0?`${calcActivo.rindeEq.toFixed(2)} tn/ha`:"—",c:"#6b8aaa"},
                  {l:"Costo/tn",v:calcActivo.rindeUsado>0?fmtUsd(calcActivo.costoTotalHa/calcActivo.rindeUsado):"—",c:"#d97706"},
                ].map(s=>(
                  <div key={s.l} className="kpi">
                    <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:3}}>{s.l}</div>
                    <div style={{fontSize:13,fontWeight:800,color:s.c}}>{s.v}</div>
                    {s.sub&&<div style={{fontSize:9,color:"#aab8c8",marginTop:1}}>{s.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Form rinde/precio */}
            <div className="card" style={{padding:14,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>📈 Ingresos — Rinde y Precio</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
                <div><label className={lCls}>Rinde esperado (tn/ha)</label><input type="number" step="0.1" defaultValue={cabActiva?.rinde_esp||""} onChange={e=>setForm(f=>({...f,rinde_esp:e.target.value}))} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                <div><label className={lCls}>Rinde real (tn/ha)</label><input type="number" step="0.1" defaultValue={cabActiva?.rinde_real||""} onChange={e=>setForm(f=>({...f,rinde_real:e.target.value}))} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                <div><label className={lCls}>Ajuste calidad (%)</label><input type="number" step="0.1" defaultValue={cabActiva?.ajuste_calidad_pct||""} onChange={e=>setForm(f=>({...f,ajuste_calidad_pct:e.target.value}))} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
              </div>
              <button onClick={guardarCabecera} className="bbtn" style={{padding:"8px 16px",fontSize:11}}>✓ Guardar Rinde</button>
            </div>

            {/* VENTAS */}
            <div className="card" style={{padding:0,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:800,color:"#16a34a"}}>💰 Ventas</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {ventasActivas.length>0&&<span style={{fontSize:11,color:"#6b8aaa"}}>{ventasActivas.reduce((a,v)=>a+v.tn_vendidas,0).toFixed(1)} tn · prom U$S {calcActivo?.precioPromedio.toFixed(0)||"—"}/tn</span>}
                  <button onClick={()=>{setShowFormVenta(true);setEditandoVenta(null);setForm({v_fecha:new Date().toISOString().split("T")[0],v_estado:"pactada"});}} className="abtn" style={{fontSize:11,padding:"5px 10px"}}>+ Venta</button>
                </div>
              </div>
              {showFormVenta&&(
                <div style={{padding:12,borderBottom:"1px solid rgba(0,60,140,0.08)",background:"rgba(255,255,255,0.45)"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                    <div><label className={lCls}>Fecha</label><input type="date" value={form.v_fecha||""} onChange={e=>setForm({...form,v_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}}/></div>
                    <div><label className={lCls}>Toneladas</label><input type="number" step="0.1" value={form.v_tn||""} onChange={e=>setForm({...form,v_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                    <div><label className={lCls}>Precio U$S/tn</label><input type="number" step="0.5" value={form.v_precio||""} onChange={e=>setForm({...form,v_precio:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                    <div><label className={lCls}>Destino</label><input type="text" value={form.v_destino||""} onChange={e=>setForm({...form,v_destino:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Acopio, exportador..."/></div>
                    <div><label className={lCls}>Estado</label><select value={form.v_estado||"pactada"} onChange={e=>setForm({...form,v_estado:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}><option value="pactada">Pactada</option><option value="entregada">Entregada</option><option value="cobrada">Cobrada</option></select></div>
                  </div>
                  {form.v_tn&&form.v_precio&&<div style={{fontSize:11,color:"#16a34a",fontWeight:700,marginBottom:8}}>Total: U$S {(Number(form.v_tn)*Number(form.v_precio)).toFixed(2)}</div>}
                  <div style={{display:"flex",gap:8}}><button onClick={guardarVenta} className="bbtn" style={{padding:"7px 14px",fontSize:11}}>✓ Guardar</button><button onClick={()=>{setShowFormVenta(false);setForm({});}} className="abtn" style={{padding:"7px 12px",fontSize:11}}>Cancelar</button></div>
                </div>
              )}
              {ventasActivas.length===0&&!showFormVenta
                ?<div style={{padding:"20px",textAlign:"center",color:"#6b8aaa",fontSize:12}}>Sin ventas registradas</div>
                :<table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Fecha","Toneladas","Precio U$S/tn","Total U$S","Destino","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700}}>{h}</th>)}</tr></thead>
                  <tbody>{ventasActivas.map(v=>(
                    <tr key={v.id} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                      <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{v.fecha}</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:"#0d2137"}}>{v.tn_vendidas} tn</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:"#d97706"}}>U$S {v.precio_usd.toFixed(2)}</td>
                      <td style={{padding:"7px 12px",fontWeight:800,color:"#16a34a"}}>U$S {(v.tn_vendidas*v.precio_usd).toFixed(2)}</td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{v.destino||"—"}</td>
                      <td style={{padding:"7px 12px"}}><span className="tag" style={{background:v.estado==="cobrada"?"rgba(22,163,74,0.12)":v.estado==="entregada"?"rgba(25,118,210,0.12)":"rgba(217,119,6,0.12)",color:v.estado==="cobrada"?"#16a34a":v.estado==="entregada"?"#1565c0":"#d97706"}}>{v.estado}</span></td>
                      <td style={{padding:"7px 12px"}}><button onClick={()=>eliminarVenta(v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:13}}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              }
            </div>

            {/* FORM AGREGAR MOVIMIENTO */}
            {showFormMov&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
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
                      <option value="ARS">$ ARS</option><option value="USD">U$S USD</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.m_monto||""} onChange={e=>setForm({...form,m_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="0"/></div>
                  <div><label className={lCls}>Unidad costo</label>
                    <select value={form.m_unidad||GRUPOS[Number(form.m_grupo||1)]?.unidad_default||"ha"} onChange={e=>setForm({...form,m_unidad:e.target.value})} className={sCls} style={{width:"100%",padding:"7px 10px"}}>
                      <option value="ha">por ha (U$S/ha)</option>
                      <option value="tn">por tn (U$S/tn)</option>
                      <option value="pct">% sobre ingreso</option>
                      <option value="total">total campo</option>
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Descripción (opcional)</label><input type="text" value={form.m_descripcion||""} onChange={e=>setForm({...form,m_descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 10px"}} placeholder="Detalle del pago..."/></div>
                </div>
                {/* Preview conversión */}
                {form.m_monto&&form.m_moneda==="ARS"&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",fontSize:11}}>
                    💱 ${Number(form.m_monto).toLocaleString("es-AR")} ARS ÷ TC ${fmt(tcVenta)} = <strong style={{color:"#1565c0"}}>U$S {(Number(form.m_monto)/tcVenta).toFixed(2)}</strong>
                    <span style={{color:"#aab8c8",marginLeft:6}}>(TC del día {form.m_fecha})</span>
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMovimiento} className="bbtn" style={{padding:"8px 16px",fontSize:11}}>✓ Guardar Costo</button>
                  <button onClick={()=>{setShowFormMov(false);setEditandoMov(null);setForm({});}} className="abtn" style={{padding:"8px 14px",fontSize:11}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* GRUPOS DE COSTOS */}
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              {Object.entries(GRUPOS).filter(([g])=>Number(g)<=10).map(([gNum,gInfo])=>{
                const g = Number(gNum);
                const movsGrupo = movsActivos.filter(m=>m.grupo===g);
                const costoHa = calcActivo?.costosPorGrupo[g]||0;
                const pctDeCostoTotal = calcActivo&&calcActivo.costoTotalHa>0 ? (costoHa/calcActivo.costoTotalHa*100) : 0;
                const isOpen = grupoActivo===g;
                return(
                  <div key={g} className="card" style={{padding:0,overflow:"hidden"}}>
                    <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderBottom:isOpen?"1px solid rgba(0,60,140,0.08)":"none"}}
                      onClick={()=>setGrupoActivo(isOpen?null:g)}>
                      <span style={{fontSize:16}}>{gInfo.icon}</span>
                      <span style={{fontSize:12,fontWeight:800,color:"#0d2137",flex:1}}>{gInfo.label}</span>
                      {movsGrupo.length>0&&<span style={{fontSize:11,color:"#6b8aaa"}}>{movsGrupo.length} movs.</span>}
                      {costoHa>0&&(
                        <>
                          <span style={{fontSize:12,fontWeight:800,color:gInfo.color}}>{fmtUsd(costoHa)}/ha</span>
                          <span style={{fontSize:10,color:"#aab8c8",background:"rgba(0,0,0,0.05)",borderRadius:6,padding:"1px 6px"}}>{pctDeCostoTotal.toFixed(1)}%</span>
                        </>
                      )}
                      {movsGrupo.length===0&&<span style={{fontSize:11,color:"#aab8c8"}}>Sin datos</span>}
                      <span style={{color:"#aab8c8",fontSize:12}}>{isOpen?"▲":"▼"}</span>
                    </div>
                    {isOpen&&(
                      <div>
                        {movsGrupo.length>0&&(
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:600}}>
                              <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                                {["Fecha","Concepto","Detalle","Moneda","Monto","TC","U$S","Unidad","U$S/ha",""].map(h=>(
                                  <th key={h} style={{textAlign:"left",padding:"6px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {movsGrupo.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(m=>{
                                  const usdHa = m.unidad==="ha"?m.monto_usd:m.unidad==="tn"?m.monto_usd*(calcActivo?.rindeUsado||0):m.unidad==="pct"?m.monto_usd*(calcActivo?.ingresoBrutoHa||0)/100:m.monto_usd/(loteData?.hectareas||1);
                                  return(
                                    <tr key={m.id} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.04)"}}>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",whiteSpace:"nowrap"}}>{m.fecha}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#0d2137"}}>{m.concepto.replace(/_/g," ")}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.descripcion||"—"}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa"}}>{m.moneda}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#d97706"}}>{m.moneda==="ARS"?"$":""}{fmt(m.monto_original)}</td>
                                      <td style={{padding:"6px 12px",color:"#aab8c8",fontSize:10}}>${fmt(m.tc_usado)}</td>
                                      <td style={{padding:"6px 12px",fontWeight:700,color:"#1565c0"}}>U$S {m.monto_usd.toFixed(2)}</td>
                                      <td style={{padding:"6px 12px",color:"#6b8aaa",fontSize:10}}>{m.unidad}</td>
                                      <td style={{padding:"6px 12px",fontWeight:800,color:gInfo.color}}>U$S {usdHa.toFixed(2)}</td>
                                      <td style={{padding:"6px 12px"}}>
                                        <button onClick={()=>eliminarMov(m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:12}}>✕</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                                <tr style={{borderTop:"1px solid rgba(0,60,140,0.08)",background:"rgba(217,119,6,0.04)"}}>
                                  <td colSpan={8} style={{padding:"6px 12px",fontWeight:800,color:"#d97706",fontSize:11}}>TOTAL {gInfo.label}</td>
                                  <td style={{padding:"6px 12px",fontWeight:800,color:gInfo.color}}>U$S {costoHa.toFixed(2)}/ha</td>
                                  <td/>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div style={{padding:"8px 12px"}}>
                          <button onClick={()=>{setShowFormMov(true);setForm({m_fecha:new Date().toISOString().split("T")[0],m_moneda:"ARS",m_grupo:String(g),m_unidad:gInfo.unidad_default});}} className="abtn" style={{fontSize:11,padding:"5px 10px"}}>+ Agregar en {gInfo.label}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* GRÁFICOS */}
            {calcActivo&&calcActivo.costoTotalHa>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                {/* Torta costos */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>Distribución de Costos</div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:130,height:130,flexShrink:0}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).map(([g,v])=>({name:GRUPOS[Number(g)]?.label||g,value:Math.round(v*100)/100,color:GRUPOS[Number(g)]?.color||"#6b7280"}))}
                            cx="50%" cy="50%" outerRadius={58} innerRadius={26} dataKey="value" paddingAngle={2}>
                            {Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).map(([g],i)=>(
                              <Cell key={i} fill={GRUPOS[Number(g)]?.color||"#6b7280"} stroke="rgba(255,255,255,0.5)" strokeWidth={2}/>
                            ))}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>["U$S "+Number(v).toFixed(2)+"/ha",n]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                      {Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([g,v])=>(
                        <div key={g} style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:GRUPOS[Number(g)]?.color||"#6b7280",flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#6b8aaa",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{GRUPOS[Number(g)]?.label}</span>
                          <span style={{fontSize:10,fontWeight:700,color:GRUPOS[Number(g)]?.color||"#6b7280",whiteSpace:"nowrap"}}>U$S {v.toFixed(0)}</span>
                          <span style={{fontSize:9,color:"#aab8c8"}}>{(v/calcActivo.costoTotalHa*100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Barras ingreso/costo/mb */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>Resultado (U$S/ha)</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={[{name:"Ingreso",v:Math.round(calcActivo.ingresoBrutoHa),c:"#16a34a"},{name:"Costo",v:Math.round(calcActivo.costoTotalHa),c:"#dc2626"},{name:"Margen",v:Math.round(calcActivo.mbHa),c:calcActivo.mbHa>=0?"#1565c0":"#dc2626"}]}
                      margin={{top:0,right:0,bottom:5,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,60,140,0.07)"/>
                      <XAxis dataKey="name" tick={{fill:"#6b8aaa",fontSize:11}}/>
                      <YAxis tick={{fill:"#6b8aaa",fontSize:9}} tickFormatter={v=>"U$S "+v}/>
                      <Tooltip formatter={(v:any)=>["U$S "+fmt(Number(v))]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                      <Bar dataKey="v" radius={[6,6,0,0]}>
                        {[{c:"#16a34a"},{c:"#dc2626"},{c:calcActivo.mbHa>=0?"#1565c0":"#dc2626"}].map((e,i)=><Cell key={i} fill={e.c}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
                    <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(22,163,74,0.07)",border:"1px solid rgba(22,163,74,0.18)"}}>
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700}}>RINDE EQUILIBRIO</div>
                      <div style={{fontSize:13,fontWeight:800,color:"#6b8aaa"}}>{calcActivo.rindeEq>0?calcActivo.rindeEq.toFixed(2)+" tn/ha":"—"}</div>
                    </div>
                    <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)"}}>
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700}}>RELACIÓN I/P</div>
                      <div style={{fontSize:13,fontWeight:800,color:"#1565c0"}}>{calcActivo.ingresoBrutoHa>0?(calcActivo.costoTotalHa/calcActivo.ingresoBrutoHa*100).toFixed(0)+"%":"—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sensibilidad */}
            {calcActivo&&calcActivo.precioPromedio>0&&calcActivo.rindeUsado>0&&(
              <div className="card" style={{padding:0,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>🔬 Análisis de Sensibilidad</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:500}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Escenario","Rinde","Precio","MB/ha","Equilibrio"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[
                        {e:"Base ◀",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio,base:true},
                        {e:"-10% Rinde",r:calcActivo.rindeUsado*0.9,p:calcActivo.precioPromedio,base:false},
                        {e:"+10% Rinde",r:calcActivo.rindeUsado*1.1,p:calcActivo.precioPromedio,base:false},
                        {e:"-10% Precio",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio*0.9,base:false},
                        {e:"+10% Precio",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio*1.1,base:false},
                      ].map((s,i)=>{
                        const ing=s.r*s.p*(1+(cabActiva?.ajuste_calidad_pct||0)/100);
                        const mb=ing-calcActivo.costoTotalHa;
                        const eq=s.p>0?calcActivo.costoTotalHa/s.p:0;
                        return(
                          <tr key={i} className="row-mb" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",background:s.base?"rgba(25,118,210,0.06)":"transparent"}}>
                            <td style={{padding:"7px 12px",fontWeight:s.base?800:600,color:"#0d2137"}}>{s.e}</td>
                            <td style={{padding:"7px 12px",color:"#d97706",fontWeight:700}}>{s.r.toFixed(2)} tn/ha</td>
                            <td style={{padding:"7px 12px",color:"#0d2137",fontWeight:600}}>U$S {s.p.toFixed(0)}/tn</td>
                            <td style={{padding:"7px 12px",fontWeight:800,color:mb>=0?"#16a34a":"#dc2626"}}>{fmtUsd(mb)}</td>
                            <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{eq.toFixed(2)} tn/ha</td>
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

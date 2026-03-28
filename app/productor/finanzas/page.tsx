"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import EscanerIA from "@/components/EscanerIA";

type Tab = "general" | "movimientos" | "cuentas_ctes" | "bancos" | "cheques" | "margen" | "impuestos";

type Movimiento = {
  id: string; fecha: string; tipo: string; categoria: string;
  descripcion: string; moneda: string; monto: number;
  monto_ars: number; monto_usd: number; cuenta: string;
  proveedor_cliente: string; comprobante: string;
  iva_pct: number; monto_iva: number; retencion_pct: number;
};
type CuentaCorriente = {
  id: string; tipo: string; nombre: string; cuit: string;
  telefono: string; saldo_ars: number; saldo_usd: number; limite_credito: number;
};
type CCMovimiento = {
  id: string; cuenta_corriente_id: string; fecha: string; tipo: string;
  descripcion: string; moneda: string; monto: number; saldo_nuevo: number;
  vencimiento: string; estado: string; comprobante: string;
};
type Banco = { id: string; nombre: string; banco: string; tipo: string; moneda: string; saldo: number; };
type Cheque = {
  id: string; tipo: string; subtipo: string; numero: string; banco: string;
  monto: number; fecha_emision: string; fecha_cobro: string; estado: string; tercero: string;
};
type Impuesto = {
  id: string; tipo: string; descripcion: string; periodo: string; monto: number;
  credito_fiscal: number; debito_fiscal: number; fecha_vencimiento: string; estado: string;
};
type MargenLote = {
  id: string; lote_id: string; cultivo: string; hectareas: number;
  ingreso_ars: number; costo_directo_ars: number; costo_indirecto_ars: number;
  margen_bruto_ars: number; margen_neto_ars: number; margen_neto_usd: number;
};
type Cotizacion = { usd_oficial: number; usd_mep: number; usd_blue: number; usd_usado: number; };
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; };

const CATS_INGRESO = ["Venta de granos","Venta de hacienda","Servicio de maquinaria","Alquiler cobrado","Subsidio","Otro ingreso"];
const CATS_EGRESO = ["Semillas","Fertilizantes","Agroquímicos","Combustible","Maquinaria / Reparación","Mano de obra","Sueldos","Alquiler de campo","Honorarios profesionales","Fletes","Seguros","Impuestos","Servicios","Otro gasto"];
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key:"general", label:"General", icon:"📊" },
  { key:"movimientos", label:"Movimientos", icon:"💸" },
  { key:"cuentas_ctes", label:"Ctas. Ctes.", icon:"🤝" },
  { key:"bancos", label:"Bancos", icon:"🏦" },
  { key:"cheques", label:"Cheques", icon:"🏷️" },
  { key:"margen", label:"Margen x Lote", icon:"🌾" },
  { key:"impuestos", label:"Impuestos", icon:"📋" },
];
const COLORES_GRAFICO = ["#00FF80","#C9A227","#60A5FA","#F87171","#A78BFA","#FB923C","#4ADE80"];
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export default function FinanzasPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cuentasCtes, setCuentasCtes] = useState<CuentaCorriente[]>([]);
  const [ccMovimientos, setCCMovimientos] = useState<CCMovimiento[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [margenes, setMargenes] = useState<MargenLote[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [cotizacion, setCotizacion] = useState<Cotizacion>({ usd_oficial:0, usd_mep:0, usd_blue:0, usd_usado:1 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [ccActiva, setCCActiva] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [filterTipo, setFilterTipo] = useState<"todos"|"ingreso"|"egreso">("todos");
  const [filterMes, setFilterMes] = useState(new Date().toISOString().slice(0,7));
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [aiInput, setAiInput] = useState("");

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
    const { data: emp } = await sb.from("empresas").select("id, nombre").eq("propietario_id", u.id).single();
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id); setNombreEmpresa(emp.nombre);
    await fetchAll(emp.id);
    setLoading(false);
  };

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id") ?? "";
    const [mov, cc, ccmov, ban, chq, imp, mar, lot, cot] = await Promise.all([
      sb.from("finanzas_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(300),
      sb.from("finanzas_cuentas_corrientes").select("*").eq("empresa_id", eid).eq("activo", true).order("nombre"),
      sb.from("finanzas_cc_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("finanzas_bancos").select("*").eq("empresa_id", eid).eq("activo", true),
      sb.from("finanzas_cheques").select("*").eq("empresa_id", eid).order("fecha_cobro"),
      sb.from("finanzas_impuestos").select("*").eq("empresa_id", eid).order("fecha_vencimiento"),
      sb.from("finanzas_margen_lote").select("*").eq("empresa_id", eid).eq("campana_id", campanaId),
      sb.from("lotes").select("id, nombre, hectareas, cultivo").eq("empresa_id", eid).eq("campana_id", campanaId),
      sb.from("finanzas_cotizaciones").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(1),
    ]);
    setMovimientos(mov.data ?? []);
    setCuentasCtes(cc.data ?? []);
    setCCMovimientos(ccmov.data ?? []);
    setBancos(ban.data ?? []);
    setCheques(chq.data ?? []);
    setImpuestos(imp.data ?? []);
    setMargenes(mar.data ?? []);
    setLotes(lot.data ?? []);
    if (cot.data?.[0]) setCotizacion(cot.data[0]);
  };

  const usdUsado = cotizacion.usd_usado || 1;
  const now = new Date();

  // Stats generales
  const totalBancos = bancos.reduce((a,b) => a + b.saldo, 0);
  const movsMes = movimientos.filter(m => m.fecha?.slice(0,7) === filterMes);
  const ingresosMes = movsMes.filter(m => m.tipo==="ingreso").reduce((a,m) => a + m.monto_ars, 0);
  const egresosMes = movsMes.filter(m => m.tipo==="egreso").reduce((a,m) => a + m.monto_ars, 0);
  const flujoNeto = ingresosMes - egresosMes;
  const chequesCartera = cheques.filter(c => c.estado==="cartera" && c.tipo==="recibido").reduce((a,c) => a + c.monto, 0);
  const deudaProveedores = cuentasCtes.filter(c => c.tipo==="proveedor").reduce((a,c) => a + c.saldo_ars, 0);
  const cobrosClientes = cuentasCtes.filter(c => c.tipo==="cliente").reduce((a,c) => a + c.saldo_ars, 0);
  const impPendientes = impuestos.filter(i => i.estado==="pendiente").reduce((a,i) => a + i.monto, 0);
  const margenBrutoTotal = margenes.reduce((a,m) => a + m.margen_bruto_ars, 0);
  const margenNetoTotal = margenes.reduce((a,m) => a + m.margen_neto_ars, 0);
  const hectareasTotal = margenes.reduce((a,m) => a + m.hectareas, 0);
  const rentabilidadPct = margenBrutoTotal > 0 && movimientos.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0) > 0
    ? (margenNetoTotal / movimientos.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0)) * 100
    : 0;

  // Datos para gráfico mensual (últimos 8 meses)
  const datosGrafico = Array.from({length: 8}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 7 + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const ing = movimientos.filter(m => m.tipo==="ingreso" && m.fecha?.slice(0,7)===mes).reduce((a,m) => a+m.monto_ars, 0);
    const egr = movimientos.filter(m => m.tipo==="egreso" && m.fecha?.slice(0,7)===mes).reduce((a,m) => a+m.monto_ars, 0);
    return { mes: MESES[d.getMonth()], Ingresos: Math.round(ing/1000), Egresos: Math.round(egr/1000), Margen: Math.round((ing-egr)/1000) };
  });

  // Datos para torta de costos por categoría
  const costosPorCat = CATS_EGRESO.map(cat => ({
    name: cat, value: movimientos.filter(m => m.tipo==="egreso" && m.categoria===cat).reduce((a,m) => a+m.monto_ars, 0)
  })).filter(x => x.value > 0).sort((a,b) => b.value - a.value).slice(0, 6);

  // Próximos vencimientos (impuestos + contratos)
  const proximosVenc = impuestos
    .filter(i => i.estado==="pendiente" && i.fecha_vencimiento)
    .map(i => ({ label: i.tipo, desc: i.descripcion || i.periodo, monto: i.monto, fecha: i.fecha_vencimiento,
      dias: Math.round((new Date(i.fecha_vencimiento).getTime() - Date.now()) / (1000*60*60*24)) }))
    .filter(v => v.dias >= 0 && v.dias <= 60)
    .sort((a,b) => a.dias - b.dias);

  // Guardar movimiento
  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const monto = Number(form.monto ?? 0);
    const iva = Number(form.iva_pct ?? 0);
    const montoARS = form.moneda==="ARS" ? monto : monto * usdUsado;
    const montoUSD = form.moneda==="USD" ? monto : monto / usdUsado;
    await sb.from("finanzas_movimientos").insert({
      empresa_id: empresaId, fecha: form.fecha ?? now.toISOString().split("T")[0],
      tipo: form.tipo ?? "egreso", categoria: form.categoria ?? "",
      descripcion: form.descripcion ?? "",
      moneda: form.moneda ?? "ARS", monto, cotizacion_usd: usdUsado,
      monto_ars: montoARS, monto_usd: montoUSD,
      cuenta: form.cuenta ?? "caja",
      lote_id: form.lote_id || null,
      proveedor_cliente: form.proveedor_cliente ?? "",
      comprobante: form.comprobante ?? "",
      iva_pct: iva, monto_iva: montoARS * iva / 100,
      retencion_pct: Number(form.retencion_pct ?? 0),
    });
    if (form.cuenta && form.cuenta !== "caja") {
      const banco = bancos.find(b => b.id === form.cuenta);
      if (banco) {
        const delta = form.tipo==="ingreso" ? montoARS : -montoARS;
        await sb.from("finanzas_bancos").update({ saldo: banco.saldo + delta }).eq("id", banco.id);
      }
    }
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarCuentaCte = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_cuentas_corrientes").insert({
      empresa_id: empresaId, tipo: form.tipo_cte ?? "proveedor",
      nombre: form.nombre ?? "", cuit: form.cuit ?? "",
      telefono: form.telefono ?? "",
      saldo_ars: Number(form.saldo_ars ?? 0),
      saldo_usd: Number(form.saldo_usd ?? 0),
      limite_credito: Number(form.limite_credito ?? 0), activo: true,
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const registrarMovCCte = async (ccId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const cc = cuentasCtes.find(c => c.id === ccId);
    if (!cc) return;
    const monto = Number(form.monto_cc ?? 0);
    const esDeuda = form.tipo_mov_cc === "factura";
    const nuevoSaldo = (form.moneda_cc==="USD" ? cc.saldo_usd : cc.saldo_ars) + (esDeuda ? monto : -monto);
    await sb.from("finanzas_cc_movimientos").insert({
      empresa_id: empresaId, cuenta_corriente_id: ccId,
      fecha: form.fecha_cc ?? now.toISOString().split("T")[0],
      tipo: form.tipo_mov_cc ?? "factura",
      descripcion: form.descripcion_cc ?? "",
      moneda: form.moneda_cc ?? "ARS", monto, saldo_nuevo: nuevoSaldo,
      comprobante: form.comprobante_cc ?? "",
      vencimiento: form.vencimiento_cc || null, estado: "pendiente",
    });
    if (form.moneda_cc === "USD") await sb.from("finanzas_cuentas_corrientes").update({ saldo_usd: nuevoSaldo }).eq("id", ccId);
    else await sb.from("finanzas_cuentas_corrientes").update({ saldo_ars: nuevoSaldo }).eq("id", ccId);
    await fetchAll(empresaId); setForm({});
  };

  const guardarBanco = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_bancos").insert({
      empresa_id: empresaId, nombre: form.nombre ?? "", banco: form.banco ?? "",
      tipo: form.tipo_banco ?? "cuenta_corriente",
      moneda: form.moneda_banco ?? "ARS",
      saldo: Number(form.saldo ?? 0), activo: true,
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarCheque = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_cheques").insert({
      empresa_id: empresaId, tipo: form.tipo_cheque ?? "recibido",
      subtipo: form.subtipo ?? "fisico", numero: form.numero ?? "",
      banco: form.banco_cheque ?? "", monto: Number(form.monto ?? 0),
      fecha_emision: form.fecha_emision || null,
      fecha_cobro: form.fecha_cobro || null,
      estado: "cartera", tercero: form.tercero ?? "",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarImpuesto = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_impuestos").insert({
      empresa_id: empresaId, tipo: form.tipo_imp ?? "",
      descripcion: form.descripcion ?? "", periodo: form.periodo ?? "",
      monto: Number(form.monto ?? 0),
      credito_fiscal: Number(form.credito_fiscal ?? 0),
      debito_fiscal: Number(form.debito_fiscal ?? 0),
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: "pendiente",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarMargen = async () => {
    if (!empresaId || !form.lote_id) return;
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id") ?? "";
    const lote = lotes.find(l => l.id === form.lote_id);
    const ing = Number(form.ingreso_ars ?? 0);
    const cd = Number(form.costo_directo_ars ?? 0);
    const ci = Number(form.costo_indirecto_ars ?? 0);
    const mbARS = ing - cd;
    const mnARS = mbARS - ci;
    const existing = margenes.find(m => m.lote_id === form.lote_id);
    const payload = {
      ingreso_ars: ing, ingreso_usd: ing/usdUsado,
      costo_directo_ars: cd, costo_directo_usd: cd/usdUsado,
      costo_indirecto_ars: ci, costo_indirecto_usd: ci/usdUsado,
      margen_bruto_ars: mbARS, margen_bruto_usd: mbARS/usdUsado,
      margen_neto_ars: mnARS, margen_neto_usd: mnARS/usdUsado,
      cultivo: lote?.cultivo ?? "", hectareas: lote?.hectareas ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (existing) await sb.from("finanzas_margen_lote").update(payload).eq("id", existing.id);
    else await sb.from("finanzas_margen_lote").insert({ empresa_id: empresaId, campana_id: campanaId, lote_id: form.lote_id, ...payload });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarCotizacion = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_cotizaciones").upsert({
      empresa_id: empresaId, fecha: now.toISOString().split("T")[0],
      usd_oficial: Number(form.usd_oficial ?? 0),
      usd_mep: Number(form.usd_mep ?? 0),
      usd_blue: Number(form.usd_blue ?? 0),
      usd_usado: Number(form.usd_usado ?? 0),
    }, { onConflict: "empresa_id,fecha" });
    await fetchAll(empresaId); setShowCotizacion(false); setForm({});
  };

  const pagarImpuesto = async (id: string) => {
    const sb = await getSB();
    await sb.from("finanzas_impuestos").update({ estado:"pagado", fecha_pago: now.toISOString().split("T")[0] }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const data = movimientos.map(m => ({
      Fecha: m.fecha, Tipo: m.tipo, Categoría: m.categoria,
      Descripción: m.descripcion, Moneda: m.moneda, Monto: m.monto,
      "Monto ARS": m.monto_ars, "IVA%": m.iva_pct,
      "Proveedor/Cliente": m.proveedor_cliente, Comprobante: m.comprobante,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Array(10).fill({ wch: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `finanzas_${nombreEmpresa}.xlsx`);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 800,
          messages: [{ role: "user", content: `Asesor financiero agropecuario. Datos: Liquidez $${totalBancos.toLocaleString("es-AR")} ARS, Flujo neto mes $${flujoNeto.toLocaleString("es-AR")}, Deuda proveedores $${deudaProveedores.toLocaleString("es-AR")}, Margen bruto $${margenBrutoTotal.toLocaleString("es-AR")}, USD: $${usdUsado}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error IA"); }
    setAiLoading(false);
  };

  const movsFiltrados = movimientos.filter(m => {
    const matchTipo = filterTipo==="todos" || m.tipo===filterTipo;
    const matchMes = m.fecha?.slice(0,7)===filterMes;
    return matchTipo && matchMes;
  });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;
  const fmtK = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  const inputClass = "w-full bg-[#0f1923] border border-[#C9A227]/25 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#C9A227] font-mono transition-all";
  const labelClass = "block text-xs text-[#6B7280] uppercase tracking-widest mb-1 font-mono";

  if (loading) return <div className="min-h-screen bg-[#070C12] flex items-center justify-center text-[#C9A227] font-mono animate-pulse">▶ Cargando Finanzas PRO...</div>;

  return (
    <div className="min-h-screen bg-[#070C12] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .btn-float{animation:float 3s ease-in-out infinite}
        .card{background:#0f1923;border:1px solid rgba(201,162,39,0.15);border-radius:14px;transition:all 0.2s}
        .card:hover{border-color:rgba(201,162,39,0.3)}
        .tab-active{border-color:#C9A227!important;color:#C9A227!important;background:rgba(201,162,39,0.1)!important}
        .tooltip-custom{background:#0f1923!important;border:1px solid rgba(201,162,39,0.3)!important;border-radius:8px!important;font-family:monospace!important}
        .kpi-green{background:linear-gradient(135deg,rgba(0,255,128,0.08) 0%,rgba(74,222,128,0.04) 100%);border-color:rgba(74,222,128,0.2)!important}
        .kpi-gold{background:linear-gradient(135deg,rgba(201,162,39,0.08) 0%,rgba(201,162,39,0.04) 100%);border-color:rgba(201,162,39,0.2)!important}
        .kpi-red{background:linear-gradient(135deg,rgba(248,113,113,0.08) 0%,rgba(248,113,113,0.04) 100%);border-color:rgba(248,113,113,0.2)!important}
        .kpi-blue{background:linear-gradient(135deg,rgba(96,165,250,0.08) 0%,rgba(96,165,250,0.04) 100%);border-color:rgba(96,165,250,0.2)!important}
      `}</style>

      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-[#070C12]/95 backdrop-blur-sm border-b border-[#C9A227]/15">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#C9A227,#00FF80,#C9A227,transparent)",backgroundSize:"200% 100%",animation:"gradient-flow 4s ease infinite"}}/>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={()=>window.location.href="/productor/dashboard"} className="text-[#6B7280] hover:text-[#C9A227] transition-colors font-mono text-sm">← Dashboard</button>
          <div className="flex-1"/>
          <button onClick={()=>{setShowCotizacion(!showCotizacion);setForm({usd_oficial:String(cotizacion.usd_oficial),usd_mep:String(cotizacion.usd_mep),usd_blue:String(cotizacion.usd_blue),usd_usado:String(cotizacion.usd_usado)});}}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/10 transition-all">
            💵 USD <span className="font-bold">${usdUsado.toLocaleString("es-AR")}</span>
          </button>
          <div className="cursor-pointer" onClick={()=>window.location.href="/productor/dashboard"}>
            <Image src="/logo.png" alt="Logo" width={100} height={36} className="object-contain hover:drop-shadow-[0_0_10px_rgba(201,162,39,0.7)] transition-all"/>
          </div>
        </div>
      </div>

      {/* Form cotización inline */}
      {showCotizacion && (
        <div className="max-w-7xl mx-auto px-6 py-3 bg-[#0f1923] border-b border-[#C9A227]/20">
          <div className="flex flex-wrap items-end gap-4">
            {[["USD Oficial","usd_oficial"],["USD MEP","usd_mep"],["USD Blue","usd_blue"],["Usar este","usd_usado"]].map(([label,key])=>(
              <div key={key}><label className={labelClass}>{label}</label><input type="number" value={form[key]??""} onChange={e=>setForm({...form,[key]:e.target.value})} className={inputClass+" w-28"}/></div>
            ))}
            <button onClick={guardarCotizacion} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
            <button onClick={()=>setShowCotizacion(false)} className="text-[#6B7280] text-sm font-mono px-2">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        {/* Title */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-mono text-[#E5E7EB]">📊 FINANZAS <span className="text-[#C9A227]">DE LA EMPRESA</span></h1>
            <p className="text-[#6B7280] text-sm font-mono mt-0.5">{nombreEmpresa.toUpperCase()}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input type="month" value={filterMes} onChange={e=>setFilterMes(e.target.value)} className="bg-[#0f1923] border border-[#C9A227]/25 rounded-xl px-3 py-2 text-[#E5E7EB] text-sm font-mono focus:outline-none focus:border-[#C9A227]"/>
            <button onClick={exportarExcel} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm">📊 Excel</button>
            <button onClick={()=>{setShowForm(true);setTab("movimientos");setForm({tipo:"egreso",moneda:"ARS",fecha:now.toISOString().split("T")[0]});}}
              className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/25 transition-all">
              + Nuevo Movimiento
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>{setTab(t.key);setShowForm(false);setForm({});setCCActiva(null);}}
              className={`px-4 py-2 rounded-xl border text-sm font-mono whitespace-nowrap transition-all ${tab===t.key?"tab-active":"border-[#C9A227]/15 text-[#6B7280] hover:text-[#9CA3AF] hover:border-[#C9A227]/25"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ===== GENERAL ===== */}
        {tab==="general" && (
          <div className="space-y-5">
            {/* KPIs row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card kpi-green p-5">
                <div className="text-xs text-[#6B7280] font-mono mb-1">SALDO TOTAL</div>
                <div className="text-3xl font-bold text-[#4ADE80] font-mono">{fmtK(totalBancos)}</div>
                <div className="text-xs text-[#6B7280] font-mono mt-1">USD {(totalBancos/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
              </div>
              <div className="card kpi-gold p-5">
                <div className="text-xs text-[#6B7280] font-mono mb-1">MARGEN BRUTO</div>
                <div className="text-3xl font-bold font-mono" style={{color:margenBrutoTotal>=0?"#C9A227":"#F87171"}}>{fmtK(margenBrutoTotal)}</div>
                <div className="text-xs text-[#6B7280] font-mono mt-1">MN: {fmtK(margenNetoTotal)}</div>
              </div>
              <div className="card p-5" style={{background:"linear-gradient(135deg,rgba(74,222,128,0.06) 0%,transparent 100%)",borderColor:"rgba(74,222,128,0.15)"}}>
                <div className="text-xs text-[#6B7280] font-mono mb-1">INGRESOS DEL MES</div>
                <div className="text-3xl font-bold text-[#4ADE80] font-mono">{fmtK(ingresosMes)}</div>
                <div className="text-xs text-[#6B7280] font-mono mt-1">{filterMes}</div>
              </div>
              <div className="card p-5" style={{background:"linear-gradient(135deg,rgba(248,113,113,0.06) 0%,transparent 100%)",borderColor:"rgba(248,113,113,0.15)"}}>
                <div className="text-xs text-[#6B7280] font-mono mb-1">EGRESOS DEL MES</div>
                <div className="text-3xl font-bold text-[#F87171] font-mono">{fmtK(egresosMes)}</div>
                <div className="text-xs text-[#6B7280] font-mono mt-1">Neto: <span style={{color:flujoNeto>=0?"#4ADE80":"#F87171"}}>{fmtK(flujoNeto)}</span></div>
              </div>
            </div>

            {/* KPIs row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4 flex items-center gap-3">
                <div className="text-2xl">📊</div>
                <div><div className="text-xs text-[#6B7280] font-mono">RENTABILIDAD</div><div className="text-xl font-bold text-[#C9A227] font-mono">{rentabilidadPct.toFixed(1)}%</div>{hectareasTotal>0&&<div className="text-xs text-[#6B7280] font-mono">MB/ha: {fmtK(margenBrutoTotal/hectareasTotal)}</div>}</div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <div className="text-2xl">⚠️</div>
                <div><div className="text-xs text-[#6B7280] font-mono">DEUDA PROVEED.</div><div className="text-xl font-bold text-[#F87171] font-mono">{fmtK(deudaProveedores)}</div><div className="text-xs text-[#6B7280] font-mono">USD {(deudaProveedores/usdUsado).toFixed(0)}</div></div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <div className="text-2xl">💵</div>
                <div><div className="text-xs text-[#6B7280] font-mono">CUENTAS X COBRAR</div><div className="text-xl font-bold text-[#60A5FA] font-mono">{fmtK(cobrosClientes)}</div><div className="text-xs text-[#6B7280] font-mono">Cheques: {fmtK(chequesCartera)}</div></div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <div className="text-2xl">📋</div>
                <div><div className="text-xs text-[#6B7280] font-mono">IMPUESTOS PEND.</div><div className="text-xl font-bold text-[#A78BFA] font-mono">{fmtK(impPendientes)}</div><div className="text-xs text-[#6B7280] font-mono">{impuestos.filter(i=>i.estado==="pendiente").length} vencimientos</div></div>
              </div>
            </div>

            {/* Gráficos + Panel derecho */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Gráfico principal */}
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#E5E7EB] font-mono">Resumen Financiero — Últimos 8 meses</h3>
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#4ADE80]"/>Ingresos</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#F87171]"/>Egresos</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-1 rounded-full inline-block bg-[#C9A227]"/>Margen</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datosGrafico} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                    <XAxis dataKey="mes" tick={{fill:"#6B7280",fontSize:11,fontFamily:"monospace"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#6B7280",fontSize:11,fontFamily:"monospace"}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}K`}/>
                    <Tooltip contentStyle={{background:"#0f1923",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"8px",fontFamily:"monospace",fontSize:"11px"}} formatter={(v:any)=>[`$${Number(v).toLocaleString("es-AR")}K`,""]}/>
                    <Bar dataKey="Ingresos" fill="#4ADE80" radius={[4,4,0,0]}/>
                    <Bar dataKey="Egresos" fill="#F87171" radius={[4,4,0,0]}/>
                    <Line type="monotone" dataKey="Margen" stroke="#C9A227" strokeWidth={2} dot={{fill:"#C9A227",r:4}}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Panel derecho */}
              <div className="space-y-4">
                {/* Próximos vencimientos */}
                <div className="card p-4">
                  <h3 className="font-bold text-[#E5E7EB] font-mono text-sm mb-3">📅 Próximos Vencimientos</h3>
                  {proximosVenc.length===0?(
                    <p className="text-[#6B7280] font-mono text-xs text-center py-3">Sin vencimientos próximos ✅</p>
                  ):(
                    <div className="space-y-2">
                      {proximosVenc.slice(0,4).map((v,i)=>(
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#C9A227]/10 last:border-0">
                          <div>
                            <div className="text-sm text-[#E5E7EB] font-mono">{v.label}</div>
                            <div className="text-xs text-[#6B7280] font-mono">{v.dias}d · {v.fecha}</div>
                          </div>
                          <span className="font-bold font-mono text-sm" style={{color:v.dias<=7?"#F87171":"#C9A227"}}>{fmt(v.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Cuentas por cobrar */}
                <div className="card p-4">
                  <h3 className="font-bold text-[#E5E7EB] font-mono text-sm mb-3">💵 Cuentas por Cobrar</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between py-1 border-b border-[#C9A227]/10">
                      <span className="text-sm text-[#6B7280] font-mono">Clientes</span>
                      <span className="font-bold text-[#60A5FA] font-mono">{fmt(cobrosClientes)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-[#6B7280] font-mono">Cheques cartera</span>
                      <span className="font-bold text-[#4ADE80] font-mono">{fmt(chequesCartera)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fila inferior */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span>🌾</span><span className="text-xs text-[#6B7280] font-mono">COSECHA VENDIDA</span></div>
                <div className="text-lg font-bold text-[#C9A227] font-mono">{movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de granos").length} ops.</div>
                <div className="text-sm text-[#6B7280] font-mono">{fmt(movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de granos").reduce((a,m)=>a+m.monto_ars,0))}</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span>🐄</span><span className="text-xs text-[#6B7280] font-mono">VENTA HACIENDA</span></div>
                <div className="text-lg font-bold text-[#4ADE80] font-mono">{movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de hacienda").length} ops.</div>
                <div className="text-sm text-[#6B7280] font-mono">{fmt(movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de hacienda").reduce((a,m)=>a+m.monto_ars,0))}</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span>🏦</span><span className="text-xs text-[#6B7280] font-mono">BANCOS / CAJA</span></div>
                <div className="text-lg font-bold text-[#00FF80] font-mono">{bancos.length} cuentas</div>
                <div className="text-sm text-[#6B7280] font-mono">{fmt(totalBancos)}</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span>💰</span><span className="text-xs text-[#6B7280] font-mono">GASTOS IMPOSITIVOS</span></div>
                <div className="text-lg font-bold text-[#A78BFA] font-mono">{fmt(impPendientes)}</div>
                <div className="text-sm text-[#6B7280] font-mono">{impuestos.length} registros</div>
              </div>
            </div>

            {/* Movimientos recientes + Costos por rubro */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Movimientos recientes */}
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                  <span className="font-bold text-[#E5E7EB] font-mono text-sm">Movimientos Recientes</span>
                  <button onClick={()=>setTab("movimientos")} className="text-xs text-[#6B7280] hover:text-[#C9A227] font-mono">Ver todos →</button>
                </div>
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Fecha","Descripción","Tipo","Monto"].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#6B7280] font-mono">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {movimientos.slice(0,6).map(m=>(
                      <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-[#6B7280] font-mono">{m.fecha}</td>
                        <td className="px-4 py-2.5 text-sm text-[#E5E7EB] font-mono font-medium">{m.descripcion}</td>
                        <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:m.tipo==="ingreso"?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)",color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>{m.tipo==="ingreso"?"Ingreso":"Gasto"}</span></td>
                        <td className="px-4 py-2.5 font-bold font-mono text-sm" style={{color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>{m.tipo==="ingreso"?"+":"-"}{fmt(m.monto_ars)}</td>
                      </tr>
                    ))}
                    {movimientos.length===0&&<tr><td colSpan={4} className="text-center py-8 text-[#6B7280] font-mono text-sm">Sin movimientos</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Análisis costos por rubro */}
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15">
                  <span className="font-bold text-[#E5E7EB] font-mono text-sm">Análisis de Costos por Rubro</span>
                </div>
                {costosPorCat.length===0?(
                  <div className="text-center py-12 text-[#6B7280] font-mono text-sm">Sin egresos categorizados</div>
                ):(
                  <div>
                    <table className="w-full">
                      <thead><tr className="border-b border-[#C9A227]/10">
                        {["Rubro","% del Total","Monto"].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#6B7280] font-mono">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {costosPorCat.map((c,i)=>{
                          const total=costosPorCat.reduce((a,x)=>a+x.value,0);
                          const pct=total>0?(c.value/total*100).toFixed(0):0;
                          return (
                            <tr key={c.name} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{background:COLORES_GRAFICO[i%COLORES_GRAFICO.length]}}/>
                                  <span className="text-sm text-[#E5E7EB] font-mono">{c.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-[#1a2535] rounded-full overflow-hidden w-16">
                                    <div className="h-full rounded-full" style={{width:`${pct}%`,background:COLORES_GRAFICO[i%COLORES_GRAFICO.length]}}/>
                                  </div>
                                  <span className="text-xs text-[#C9A227] font-mono">{pct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-[#F87171] font-mono text-sm">{fmt(c.value)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== MOVIMIENTOS ===== */}
        {tab==="movimientos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2">
                {(["todos","ingreso","egreso"] as const).map(f=>(
                  <button key={f} onClick={()=>setFilterTipo(f)} className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterTipo===f?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10":"border-[#C9A227]/15 text-[#6B7280] hover:text-[#9CA3AF]"}`}>{f.toUpperCase()}</button>
                ))}
              </div>
              <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/25 transition-all">+ Nuevo</button>
            </div>

            {/* Resumen mes */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {label:"INGRESOS",v:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0),c:"#4ADE80"},
                {label:"EGRESOS",v:movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),c:"#F87171"},
                {label:"NETO",v:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0)-movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),c:"#C9A227"},
              ].map(s=>(
                <div key={s.label} className="card p-4 text-center">
                  <div className="text-xs text-[#6B7280] font-mono">{s.label}</div>
                  <div className="text-2xl font-bold font-mono mt-1" style={{color:s.v>=0?s.c:"#F87171"}}>{fmtK(s.v)}</div>
                  <div className="text-xs text-[#6B7280] font-mono">USD {(s.v/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                </div>
              ))}
            </div>

            {showForm && (
              <div className="card p-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR MOVIMIENTO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo??"egreso"} onChange={e=>setForm({...form,tipo:e.target.value,categoria:""})} className={inputClass}>
                      <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {(form.tipo==="ingreso"?CATS_INGRESO:CATS_EGRESO).map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={inputClass} placeholder="Detalle"/>
                  </div>
                  <div><label className={labelClass}>Moneda</label>
                    <select value={form.moneda??"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className={inputClass}>
                      <option value="ARS">$ ARS</option><option value="USD">U$S USD</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
                  {form.moneda==="ARS"&&(
                    <div><label className={labelClass}>IVA %</label>
                      <select value={form.iva_pct??"0"} onChange={e=>setForm({...form,iva_pct:e.target.value})} className={inputClass}>
                        <option value="0">Sin IVA</option><option value="10.5">10.5%</option><option value="21">21%</option>
                      </select>
                    </div>
                  )}
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={inputClass}/>
                  </div>
                  <div><label className={labelClass}>Cuenta bancaria</label>
                    <select value={form.cuenta??"caja"} onChange={e=>setForm({...form,cuenta:e.target.value})} className={inputClass}>
                      <option value="caja">Caja</option>
                      {bancos.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Lote (opcional)</label>
                    <select value={form.lote_id??""} onChange={e=>setForm({...form,lote_id:e.target.value})} className={inputClass}>
                      <option value="">Sin lote</option>
                      {lotes.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Proveedor / Cliente</label>
                    <input type="text" value={form.proveedor_cliente??""} onChange={e=>setForm({...form,proveedor_cliente:e.target.value})} className={inputClass} placeholder="Nombre"/>
                  </div>
                  <div><label className={labelClass}>Comprobante</label>
                    <input type="text" value={form.comprobante??""} onChange={e=>setForm({...form,comprobante:e.target.value})} className={inputClass} placeholder="Factura / Nro."/>
                  </div>
                </div>
                {form.monto&&Number(form.iva_pct)>0&&(
                  <div className="mt-3 p-3 bg-[#C9A227]/8 border border-[#C9A227]/20 rounded-xl text-xs font-mono text-[#C9A227]">
                    Neto: ${Number(form.monto).toLocaleString("es-AR")} · IVA {form.iva_pct}%: ${(Number(form.monto)*Number(form.iva_pct)/100).toLocaleString("es-AR")} · Total: ${(Number(form.monto)*(1+Number(form.iva_pct)/100)).toLocaleString("es-AR")}
                  </div>
                )}
                {form.moneda==="USD"&&form.monto&&(
                  <div className="mt-3 p-3 bg-[#60A5FA]/8 border border-[#60A5FA]/20 rounded-xl text-xs font-mono text-[#60A5FA]">
                    Equivalente ARS: ${(Number(form.monto)*usdUsado).toLocaleString("es-AR")} (USD ${usdUsado})
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMovimiento} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              {movsFiltrados.length===0?<div className="text-center py-16 text-[#6B7280] font-mono">Sin movimientos en este período</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">
                      {["Fecha","Tipo","Categoría","Descripción","Moneda","Monto","ARS","IVA","Prov/Cli",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#6B7280] font-mono whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody>{movsFiltrados.map(m=>(
                      <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{m.fecha}</td>
                        <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:m.tipo==="ingreso"?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)",color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>{m.tipo==="ingreso"?"Ingreso":"Gasto"}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.categoria}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-medium">{m.descripcion}</td>
                        <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{m.moneda}</td>
                        <td className="px-4 py-3 text-sm font-bold text-[#C9A227] font-mono">{Number(m.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 font-bold font-mono text-sm" style={{color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>{m.tipo==="ingreso"?"+":"-"}${Number(m.monto_ars).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{m.iva_pct>0?`${m.iva_pct}%`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.proveedor_cliente||"—"}</td>
                        <td className="px-4 py-3"><button onClick={()=>eliminar("finanzas_movimientos",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== CUENTAS CORRIENTES ===== */}
        {tab==="cuentas_ctes" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_cte:"proveedor"});setCCActiva(null);}} className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/25 transition-all">+ Nueva Cta. Corriente</button>
            </div>
            {showForm && !ccActiva && (
              <div className="card p-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ CUENTA CORRIENTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cte??"proveedor"} onChange={e=>setForm({...form,tipo_cte:e.target.value})} className={inputClass}>
                      <option value="proveedor">Proveedor</option><option value="cliente">Cliente</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>CUIT</label><input type="text" value={form.cuit??""} onChange={e=>setForm({...form,cuit:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Saldo inicial ARS</label><input type="number" value={form.saldo_ars??""} onChange={e=>setForm({...form,saldo_ars:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Saldo inicial USD</label><input type="number" value={form.saldo_usd??""} onChange={e=>setForm({...form,saldo_usd:e.target.value})} className={inputClass} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCuentaCte} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {!ccActiva && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cuentasCtes.map(cc=>{
                  const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===cc.id);
                  return (
                    <div key={cc.id} className="card p-5 cursor-pointer hover:border-[#C9A227]/35" onClick={()=>{setCCActiva(cc.id);setForm({});}}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-[#E5E7EB] font-mono">{cc.nombre}</div>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:cc.tipo==="proveedor"?"rgba(248,113,113,0.12)":"rgba(74,222,128,0.12)",color:cc.tipo==="proveedor"?"#F87171":"#4ADE80"}}>{cc.tipo}</span>
                            {cc.cuit&&<span className="text-xs text-[#6B7280] font-mono">{cc.cuit}</span>}
                          </div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();eliminar("finanzas_cuentas_corrientes",cc.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </div>
                      <div className="text-2xl font-bold font-mono" style={{color:cc.saldo_ars>=0?"#4ADE80":"#F87171"}}>${Number(cc.saldo_ars).toLocaleString("es-AR")}</div>
                      {cc.saldo_usd!==0&&<div className="text-sm text-[#C9A227] font-mono">USD {cc.saldo_usd}</div>}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#C9A227]/10 text-xs font-mono text-[#6B7280]">
                        <span>{movs.length} movimientos</span>
                        {cc.telefono&&<a href={`https://wa.me/54${cc.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-[#25D366]">💬 WA</a>}
                      </div>
                    </div>
                  );
                })}
                {cuentasCtes.length===0&&<div className="col-span-3 text-center py-16 text-[#6B7280] font-mono card">Sin cuentas corrientes</div>}
              </div>
            )}
            {ccActiva && (()=>{
              const cc=cuentasCtes.find(c=>c.id===ccActiva);
              if(!cc) return null;
              const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===ccActiva);
              return (
                <div className="space-y-4">
                  <button onClick={()=>setCCActiva(null)} className="text-[#6B7280] hover:text-[#C9A227] font-mono text-sm">← Volver</button>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-[#E5E7EB] font-mono">{cc.nombre}</h2>
                        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:cc.tipo==="proveedor"?"rgba(248,113,113,0.12)":"rgba(74,222,128,0.12)",color:cc.tipo==="proveedor"?"#F87171":"#4ADE80"}}>{cc.tipo}</span>
                      </div>
                      <div className="text-3xl font-bold font-mono" style={{color:cc.saldo_ars>=0?"#4ADE80":"#F87171"}}>${Number(cc.saldo_ars).toLocaleString("es-AR")}</div>
                    </div>
                    <div className="border-t border-[#C9A227]/15 pt-4 mt-3">
                      <h3 className="text-xs text-[#C9A227] font-mono font-bold mb-3">+ REGISTRAR MOVIMIENTO</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><label className={labelClass}>Tipo</label>
                          <select value={form.tipo_mov_cc??"factura"} onChange={e=>setForm({...form,tipo_mov_cc:e.target.value})} className={inputClass}>
                            <option value="factura">Factura / Deuda</option><option value="pago">Pago / Cobro</option><option value="nota_credito">Nota crédito</option>
                          </select>
                        </div>
                        <div><label className={labelClass}>Moneda</label>
                          <select value={form.moneda_cc??"ARS"} onChange={e=>setForm({...form,moneda_cc:e.target.value})} className={inputClass}>
                            <option value="ARS">ARS</option><option value="USD">USD</option>
                          </select>
                        </div>
                        <div><label className={labelClass}>Monto</label><input type="number" value={form.monto_cc??""} onChange={e=>setForm({...form,monto_cc:e.target.value})} className={inputClass}/></div>
                        <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha_cc??now.toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_cc:e.target.value})} className={inputClass}/></div>
                        <div className="md:col-span-2"><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion_cc??""} onChange={e=>setForm({...form,descripcion_cc:e.target.value})} className={inputClass}/></div>
                        <div><label className={labelClass}>Comprobante</label><input type="text" value={form.comprobante_cc??""} onChange={e=>setForm({...form,comprobante_cc:e.target.value})} className={inputClass}/></div>
                        <div><label className={labelClass}>Vencimiento</label><input type="date" value={form.vencimiento_cc??""} onChange={e=>setForm({...form,vencimiento_cc:e.target.value})} className={inputClass}/></div>
                      </div>
                      <button onClick={()=>registrarMovCCte(ccActiva)} className="mt-3 bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Registrar</button>
                    </div>
                  </div>
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#C9A227]/15"><span className="text-[#C9A227] text-xs font-mono font-bold">HISTORIAL</span></div>
                    {movs.length===0?<div className="text-center py-8 text-[#6B7280] font-mono text-sm">Sin movimientos</div>:(
                      <table className="w-full">
                        <thead><tr className="border-b border-[#C9A227]/10">{["Fecha","Tipo","Descripción","Moneda","Monto","Saldo","Estado",""].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#6B7280] font-mono">{h}</th>)}</tr></thead>
                        <tbody>{movs.map(m=>(
                          <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                            <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{m.fecha}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:m.tipo==="factura"?"rgba(248,113,113,0.12)":m.tipo==="pago"?"rgba(74,222,128,0.12)":"rgba(96,165,250,0.12)",color:m.tipo==="factura"?"#F87171":m.tipo==="pago"?"#4ADE80":"#60A5FA"}}>{m.tipo}</span></td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{m.descripcion}</td>
                            <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{m.moneda}</td>
                            <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{Number(m.monto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-xs font-mono" style={{color:m.saldo_nuevo>=0?"#4ADE80":"#F87171"}}>{Number(m.saldo_nuevo).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:m.estado==="pagado"?"rgba(74,222,128,0.12)":"rgba(201,162,39,0.12)",color:m.estado==="pagado"?"#4ADE80":"#C9A227"}}>{m.estado}</span></td>
                            <td className="px-4 py-3"><button onClick={()=>eliminar("finanzas_cc_movimientos",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== BANCOS ===== */}
        {tab==="bancos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[#C9A227] font-mono text-sm">Total bancos: <strong>${totalBancos.toLocaleString("es-AR")}</strong></span>
              <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/25 transition-all">+ Nueva Cuenta</button>
            </div>
            {showForm && (
              <div className="card p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass} placeholder="Ej: Banco Nación CC"/></div>
                  <div><label className={labelClass}>Banco / Entidad</label><input type="text" value={form.banco??""} onChange={e=>setForm({...form,banco:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_banco??"cuenta_corriente"} onChange={e=>setForm({...form,tipo_banco:e.target.value})} className={inputClass}>
                      <option value="caja">Caja</option><option value="cuenta_corriente">Cuenta Corriente</option>
                      <option value="caja_ahorro">Caja Ahorro</option><option value="inversion">Inversión</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Moneda</label>
                    <select value={form.moneda_banco??"ARS"} onChange={e=>setForm({...form,moneda_banco:e.target.value})} className={inputClass}>
                      <option value="ARS">ARS</option><option value="USD">USD</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Saldo inicial</label><input type="number" value={form.saldo??""} onChange={e=>setForm({...form,saldo:e.target.value})} className={inputClass} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarBanco} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bancos.map(b=>(
                <div key={b.id} className="card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div><div className="font-bold text-[#E5E7EB] font-mono">{b.nombre}</div><div className="text-xs text-[#6B7280] font-mono">{b.banco} · {b.tipo?.replace("_"," ")} · {b.moneda}</div></div>
                    <button onClick={()=>eliminar("finanzas_bancos",b.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{color:b.saldo>=0?"#4ADE80":"#F87171"}}>${Number(b.saldo).toLocaleString("es-AR")}</div>
                  {b.moneda==="ARS"&&<div className="text-xs text-[#6B7280] font-mono mt-1">≈ USD {(b.saldo/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>}
                </div>
              ))}
              {bancos.length===0&&<div className="col-span-3 text-center py-16 text-[#6B7280] font-mono card">Sin cuentas registradas</div>}
            </div>
          </div>
        )}

        {/* ===== CHEQUES ===== */}
        {tab==="cheques" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-[#60A5FA]">Cartera: <strong>${chequesCartera.toLocaleString("es-AR")}</strong></span>
                <span className="text-[#F87171]">Emitidos: <strong>${cheques.filter(c=>c.tipo==="emitido"&&c.estado==="cartera").reduce((a,c)=>a+c.monto,0).toLocaleString("es-AR")}</strong></span>
              </div>
              <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold">+ Nuevo Cheque</button>
            </div>
            {showForm && (
              <div className="card p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cheque??"recibido"} onChange={e=>setForm({...form,tipo_cheque:e.target.value})} className={inputClass}>
                      <option value="recibido">Recibido</option><option value="emitido">Emitido</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Subtipo</label>
                    <select value={form.subtipo??"fisico"} onChange={e=>setForm({...form,subtipo:e.target.value})} className={inputClass}>
                      <option value="fisico">Físico</option><option value="echeq">ECheq</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Número</label><input type="text" value={form.numero??""} onChange={e=>setForm({...form,numero:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Banco</label><input type="text" value={form.banco_cheque??""} onChange={e=>setForm({...form,banco_cheque:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Fecha emisión</label><input type="date" value={form.fecha_emision??""} onChange={e=>setForm({...form,fecha_emision:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Fecha cobro</label><input type="date" value={form.fecha_cobro??""} onChange={e=>setForm({...form,fecha_cobro:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Tercero</label><input type="text" value={form.tercero??""} onChange={e=>setForm({...form,tercero:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCheque} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="card overflow-hidden">
              {cheques.length===0?<div className="text-center py-16 text-[#6B7280] font-mono">Sin cheques</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">{["Tipo","Nro.","Banco","Monto","F.Cobro","Tercero","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#6B7280] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{cheques.map(c=>{
                      const dias=c.fecha_cobro?Math.round((new Date(c.fecha_cobro).getTime()-Date.now())/(1000*60*60*24)):null;
                      return (
                        <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                          <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:c.tipo==="recibido"?"rgba(96,165,250,0.12)":"rgba(248,113,113,0.12)",color:c.tipo==="recibido"?"#60A5FA":"#F87171"}}>{c.tipo}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.numero}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.banco}</td>
                          <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{color:dias!==null&&dias<=7?"#F87171":"#9CA3AF"}}>{c.fecha_cobro}{dias!==null&&dias<=7&&` ⚠️`}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.tercero||"—"}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">{c.estado}</span></td>
                          <td className="px-4 py-3"><button onClick={()=>eliminar("finanzas_cheques",c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== MARGEN POR LOTE ===== */}
        {tab==="margen" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-[#00FF80]/15 border border-[#00FF80]/40 text-[#00FF80] font-mono text-sm font-bold hover:bg-[#00FF80]/25 transition-all">+ Cargar / Editar Margen</button>
            </div>
            {/* Totales */}
            {margenes.length>0&&(
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:"MARGEN BRUTO TOTAL",v:margenBrutoTotal,c:"#4ADE80"},
                  {label:"MARGEN NETO TOTAL",v:margenNetoTotal,c:"#C9A227"},
                  {label:"RENTABILIDAD",v:rentabilidadPct,c:"#60A5FA",pct:true},
                ].map(s=>(
                  <div key={s.label} className="card p-4 text-center">
                    <div className="text-xs text-[#6B7280] font-mono">{s.label}</div>
                    <div className="text-2xl font-bold font-mono mt-1" style={{color:s.v>=0?s.c:"#F87171"}}>{s.pct?`${s.v.toFixed(1)}%`:fmtK(s.v)}</div>
                    {!s.pct&&<div className="text-xs text-[#6B7280] font-mono">USD {(s.v/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>}
                  </div>
                ))}
              </div>
            )}
            {showForm && (
              <div className="card p-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">MARGEN POR LOTE <span className="text-[#C9A227] text-xs">USD: ${usdUsado}</span></h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="md:col-span-3"><label className={labelClass}>Lote</label>
                    <select value={form.lote_id??""} onChange={e=>setForm({...form,lote_id:e.target.value})} className={inputClass}>
                      <option value="">Seleccionar lote</option>
                      {lotes.map(l=><option key={l.id} value={l.id}>{l.nombre} · {l.cultivo} · {l.hectareas}ha</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Ingreso total ARS</label><input type="number" value={form.ingreso_ars??""} onChange={e=>setForm({...form,ingreso_ars:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Costos directos ARS</label><input type="number" value={form.costo_directo_ars??""} onChange={e=>setForm({...form,costo_directo_ars:e.target.value})} className={inputClass} placeholder="Semillas, fertilizantes..."/></div>
                  <div><label className={labelClass}>Costos indirectos ARS</label><input type="number" value={form.costo_indirecto_ars??""} onChange={e=>setForm({...form,costo_indirecto_ars:e.target.value})} className={inputClass} placeholder="Maquinaria, estructura..."/></div>
                </div>
                {form.ingreso_ars&&(
                  <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/15 rounded-xl grid grid-cols-3 gap-3 text-xs font-mono">
                    {[
                      {l:"MB ARS",v:Number(form.ingreso_ars)-Number(form.costo_directo_ars??0),c:"#4ADE80"},
                      {l:"MN ARS",v:Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0),c:"#C9A227"},
                      {l:"MN USD",v:(Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0))/usdUsado,c:"#60A5FA"},
                    ].map(s=><div key={s.l} className="text-center"><div className="text-[#6B7280]">{s.l}</div><div className="font-bold text-lg mt-1" style={{color:s.v>=0?s.c:"#F87171"}}>${s.v.toLocaleString("es-AR",{maximumFractionDigits:0})}</div></div>)}
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMargen} className="bg-[#00FF80]/15 border border-[#00FF80]/40 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {margenes.length===0&&!showForm?(
              <div className="text-center py-16 text-[#6B7280] font-mono card">Sin márgenes cargados</div>
            ):(
              <div className="space-y-3">
                {margenes.map(m=>{
                  const lote=lotes.find(l=>l.id===m.lote_id);
                  const mbHa=m.hectareas>0?m.margen_bruto_ars/m.hectareas:0;
                  const mnHa=m.hectareas>0?m.margen_neto_ars/m.hectareas:0;
                  return (
                    <div key={m.id} className="card p-5">
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                          <div className="text-lg font-bold text-[#E5E7EB] font-mono">{lote?.nombre??m.lote_id}</div>
                          <div className="text-xs text-[#6B7280] font-mono">{m.cultivo?.toUpperCase()} · {m.hectareas} Ha</div>
                        </div>
                        <button onClick={()=>eliminar("finanzas_margen_lote",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs font-mono">✕</button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                        {[
                          {l:"INGRESO",v:m.ingreso_ars,c:"#E5E7EB"},
                          {l:"COSTO DIRECTO",v:m.costo_directo_ars,c:"#F87171"},
                          {l:"COSTO INDIRECTO",v:m.costo_indirecto_ars,c:"#F87171"},
                          {l:"MARGEN BRUTO",v:m.margen_bruto_ars,c:m.margen_bruto_ars>=0?"#4ADE80":"#F87171"},
                          {l:"MARGEN NETO",v:m.margen_neto_ars,c:m.margen_neto_ars>=0?"#C9A227":"#F87171"},
                          {l:"MN USD",v:m.margen_neto_usd,c:m.margen_neto_usd>=0?"#60A5FA":"#F87171"},
                          {l:"MB/Ha",v:mbHa,c:"#4ADE80"},
                          {l:"MN/Ha",v:mnHa,c:"#C9A227"},
                        ].map(s=>(
                          <div key={s.l} className="bg-[#070C12] rounded-xl p-3 text-center">
                            <div className="text-[#6B7280] mb-1">{s.l}</div>
                            <div className="font-bold text-sm" style={{color:s.c}}>${Number(s.v).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== IMPUESTOS ===== */}
        {tab==="impuestos" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/25 transition-all">+ Nuevo Impuesto</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {l:"CRÉDITO FISCAL",v:impuestos.reduce((a,i)=>a+i.credito_fiscal,0),c:"#4ADE80"},
                {l:"DÉBITO FISCAL",v:impuestos.reduce((a,i)=>a+i.debito_fiscal,0),c:"#F87171"},
                {l:"POSICIÓN IVA",v:impuestos.reduce((a,i)=>a+i.debito_fiscal,0)-impuestos.reduce((a,i)=>a+i.credito_fiscal,0),c:"#C9A227"},
              ].map(s=>(
                <div key={s.l} className="card p-4 text-center">
                  <div className="text-xs text-[#6B7280] font-mono">{s.l}</div>
                  <div className="text-2xl font-bold font-mono mt-1" style={{color:s.c}}>${s.v.toLocaleString("es-AR")}</div>
                </div>
              ))}
            </div>
            {showForm && (
              <div className="card p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_imp??""} onChange={e=>setForm({...form,tipo_imp:e.target.value})} className={inputClass}>
                      <option value="IVA 10.5%">IVA 10.5%</option><option value="IVA 21%">IVA 21%</option>
                      <option value="Ganancias">Ganancias</option><option value="Bienes Personales">Bienes Personales</option>
                      <option value="Ingresos Brutos">Ingresos Brutos</option><option value="Retención AFIP">Retención AFIP</option>
                      <option value="Monotributo">Monotributo</option><option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Período</label><input type="text" value={form.periodo??""} onChange={e=>setForm({...form,periodo:e.target.value})} className={inputClass} placeholder="Ej: 03/2026"/></div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Monto a pagar</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Crédito fiscal</label><input type="number" value={form.credito_fiscal??""} onChange={e=>setForm({...form,credito_fiscal:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Débito fiscal</label><input type="number" value={form.debito_fiscal??""} onChange={e=>setForm({...form,debito_fiscal:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Vencimiento</label><input type="date" value={form.fecha_vencimiento??""} onChange={e=>setForm({...form,fecha_vencimiento:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarImpuesto} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1a2535] text-[#6B7280] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="card overflow-hidden">
              {impuestos.length===0?<div className="text-center py-16 text-[#6B7280] font-mono">Sin impuestos</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["Tipo","Período","Descripción","Monto","Crédito","Débito","Vencimiento","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#6B7280] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{impuestos.map(i=>{
                    const dias=i.fecha_vencimiento?Math.round((new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)):null;
                    const urgente=dias!==null&&dias<=7&&i.estado==="pendiente";
                    return (
                      <tr key={i.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                        <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/12 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{i.tipo}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{i.periodo}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{i.descripcion}</td>
                        <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${Number(i.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-xs text-[#4ADE80] font-mono">{i.credito_fiscal>0?`$${Number(i.credito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#F87171] font-mono">{i.debito_fiscal>0?`$${Number(i.debito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{color:urgente?"#F87171":"#9CA3AF"}}>{i.fecha_vencimiento}{urgente&&" ⚠️"}</td>
                        <td className="px-4 py-3">
                          {i.estado==="pendiente"?(
                            <button onClick={()=>pagarImpuesto(i.id)} className="text-xs bg-[#C9A227]/12 text-[#C9A227] border border-[#C9A227]/20 px-2 py-1 rounded font-mono hover:bg-[#C9A227]/25">Pagar</button>
                          ):(
                            <span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">✓ Pagado</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><button onClick={()=>eliminar("finanzas_impuestos",i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[#1a2535] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · FINANZAS PRO</p>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} className="btn-float fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-xl shadow-[#C9A227]/20" title="Asesor Financiero IA">
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0f1923]/98 border border-[#C9A227]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A227]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#C9A227] animate-pulse"/><span className="text-[#C9A227] text-xs font-mono font-bold">ASESOR FINANCIERO IA</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} className="text-[#6B7280] hover:text-white text-sm">✕</button>
          </div>
          <div className="p-3 max-h-52 overflow-y-auto">
            {!aiMsg&&!aiLoading&&(
              <div className="space-y-1">
                {["Analizá mi situación financiera","Liquidez próximos 30 días","Optimización de gastos","Posición IVA del mes"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-[#6B7280] hover:text-[#C9A227] border border-[#C9A227]/12 hover:border-[#C9A227]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p className="text-[#C9A227] text-xs font-mono animate-pulse px-2">Analizando finanzas...</p>}
            {aiMsg&&<p className="text-[#9CA3AF] text-xs font-mono leading-relaxed whitespace-pre-wrap px-2">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre finanzas..." className="flex-1 bg-[#070C12] border border-[#C9A227]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#C9A227]"/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="px-3 py-2 rounded-lg bg-[#C9A227]/15 border border-[#C9A227]/30 text-[#C9A227] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import EscanerIA from "@/components/EscanerIA";

type Tab = "general" | "movimientos" | "cuentas_ctes" | "bancos" | "cheques" | "margen" | "impuestos";
type Movimiento = {
  id: string; fecha: string; tipo: string; categoria: string;
  descripcion: string; moneda: string; monto: number;
  monto_ars: number; monto_usd: number; cuenta: string;
  proveedor_cliente: string; comprobante: string;
  iva_pct: number; monto_iva: number;
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
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const PIE_COLORS = ["#d97706","#16a34a","#1976d2","#dc2626","#7c3aed","#ea580c","#22c55e","#e91e63"];

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key:"general", label:"General", icon:"📊" },
  { key:"movimientos", label:"Movimientos", icon:"💸" },
  { key:"cuentas_ctes", label:"Ctas. Ctes.", icon:"🤝" },
  { key:"bancos", label:"Bancos", icon:"🏦" },
  { key:"cheques", label:"Cheques", icon:"🏷️" },
  { key:"margen", label:"Margen x Lote", icon:"🌾" },
  { key:"impuestos", label:"Impuestos", icon:"📋" },
];

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
  const [showIA, setShowIA] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
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

  // ── KPIs (lógica idéntica) ──
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
  const ingresosTotal = movimientos.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0);
  const rentabilidadPct = ingresosTotal > 0 ? (margenNetoTotal / ingresosTotal) * 100 : 0;

  const datosGrafico = Array.from({length: 8}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 7 + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const ing = movimientos.filter(m => m.tipo==="ingreso" && m.fecha?.slice(0,7)===mes).reduce((a,m) => a+m.monto_ars, 0);
    const egr = movimientos.filter(m => m.tipo==="egreso" && m.fecha?.slice(0,7)===mes).reduce((a,m) => a+m.monto_ars, 0);
    return { mes: MESES[d.getMonth()], Ingresos: Math.round(ing/1000), Egresos: Math.round(egr/1000), Margen: Math.round((ing-egr)/1000) };
  });

  const costosPorCat = CATS_EGRESO.map(cat => ({
    name: cat.length > 15 ? cat.slice(0,15)+"..." : cat, fullName: cat,
    value: movimientos.filter(m => m.tipo==="egreso" && m.categoria===cat).reduce((a,m) => a+m.monto_ars, 0)
  })).filter(x => x.value > 0).sort((a,b) => b.value-a.value).slice(0,6);
  const totalCostos = costosPorCat.reduce((a,c) => a+c.value, 0);

  const proximosVenc = impuestos
    .filter(i => i.estado==="pendiente" && i.fecha_vencimiento)
    .map(i => ({
      label: i.tipo, desc: i.descripcion || i.periodo, monto: i.monto, fecha: i.fecha_vencimiento,
      dias: Math.round((new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24))
    }))
    .filter(v => v.dias >= 0 && v.dias <= 60)
    .sort((a,b) => a.dias-b.dias);

  // ── CRUD (lógica idéntica al original) ──
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
      descripcion: form.descripcion ?? "", moneda: form.moneda ?? "ARS",
      monto, cotizacion_usd: usdUsado, monto_ars: montoARS, monto_usd: montoUSD,
      cuenta: form.cuenta ?? "caja", lote_id: form.lote_id || null,
      proveedor_cliente: form.proveedor_cliente ?? "", comprobante: form.comprobante ?? "",
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
    const saldoBase = form.moneda_cc==="USD" ? cc.saldo_usd : cc.saldo_ars;
    const nuevoSaldo = saldoBase + (esDeuda ? monto : -monto);
    await sb.from("finanzas_cc_movimientos").insert({
      empresa_id: empresaId, cuenta_corriente_id: ccId,
      fecha: form.fecha_cc ?? now.toISOString().split("T")[0],
      tipo: form.tipo_mov_cc ?? "factura",
      descripcion: form.descripcion_cc ?? "", moneda: form.moneda_cc ?? "ARS",
      monto, saldo_nuevo: nuevoSaldo, comprobante: form.comprobante_cc ?? "",
      vencimiento: form.vencimiento_cc || null, estado: "pendiente",
    });
    if (form.moneda_cc==="USD") await sb.from("finanzas_cuentas_corrientes").update({ saldo_usd: nuevoSaldo }).eq("id", ccId);
    else await sb.from("finanzas_cuentas_corrientes").update({ saldo_ars: nuevoSaldo }).eq("id", ccId);
    await fetchAll(empresaId); setForm({});
  };

  const guardarBanco = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_bancos").insert({
      empresa_id: empresaId, nombre: form.nombre ?? "", banco: form.banco ?? "",
      tipo: form.tipo_banco ?? "cuenta_corriente", moneda: form.moneda_banco ?? "ARS",
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
      fecha_emision: form.fecha_emision || null, fecha_cobro: form.fecha_cobro || null,
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
      fecha_vencimiento: form.fecha_vencimiento || null, estado: "pendiente",
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
    const mbARS = ing - cd; const mnARS = mbARS - ci;
    const existing = margenes.find(m => m.lote_id === form.lote_id);
    const payload = {
      ingreso_ars: ing, ingreso_usd: ing/usdUsado,
      costo_directo_ars: cd, costo_directo_usd: cd/usdUsado,
      costo_indirecto_ars: ci, costo_indirecto_usd: ci/usdUsado,
      margen_bruto_ars: mbARS, margen_bruto_usd: mbARS/usdUsado,
      margen_neto_ars: mnARS, margen_neto_usd: mnARS/usdUsado,
      cultivo: lote?.cultivo ?? "", hectareas: lote?.hectareas ?? 0,
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
      usd_oficial: Number(form.usd_oficial ?? 0), usd_mep: Number(form.usd_mep ?? 0),
      usd_blue: Number(form.usd_blue ?? 0), usd_usado: Number(form.usd_usado ?? 0),
    }, { onConflict: "empresa_id,fecha" });
    await fetchAll(empresaId); setShowCotizacion(false); setForm({});
  };

  const pagarImpuesto = async (id: string) => {
    const sb = await getSB();
    await sb.from("finanzas_impuestos").update({ estado:"pagado" }).eq("id", id);
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
          messages: [{ role: "user", content: `Asesor financiero agropecuario. Datos: Saldo $${totalBancos.toLocaleString("es-AR")}, Flujo neto $${flujoNeto.toLocaleString("es-AR")}, Deuda $${deudaProveedores.toLocaleString("es-AR")}, MB $${margenBrutoTotal.toLocaleString("es-AR")}, USD $${usdUsado}. ${prompt}` }]
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
  const fmtM = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toLocaleString("es-AR")}`;

  // ── Estilos nuevos ──
  const iCls = "w-full inp px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando Finanzas PRO...</span>
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

        /* Inputs */
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}

        /* Topbar */
        .topbar-f{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-f::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-f>*{position:relative;z-index:1;}

        /* Card base glassmorphism */
        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}

        /* Sección blanca (tablas y contenidos) */
        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}

        /* KPI card */
        .kpi-f{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:16px;box-shadow:0 3px 12px rgba(20,80,160,0.10);padding:16px;transition:all 0.18s;}
        .kpi-f:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(20,80,160,0.16);}

        /* Botones */
        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        /* Tab botones */
        .tab-f{padding:8px 14px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;border:1.5px solid rgba(255,255,255,0.88);background:rgba(255,255,255,0.65);color:#4a6a8a;}
        .tab-f:hover{background:rgba(255,255,255,0.88);}
        .tab-f.on{background-image:url('/AZUL.png');background-size:cover;background-position:center;color:white;border:1.5px solid rgba(100,180,255,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);}

        /* Badges */
        .bg-gr{background:rgba(22,163,74,0.12);color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}
        .bg-rd{background:rgba(220,38,38,0.10);color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}
        .bg-gd{background:rgba(217,119,6,0.12);color:#d97706;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}
        .bg-bl{background:rgba(25,118,210,0.10);color:#1565c0;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}

        .row-h:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR sticky */}
      <div className="topbar-f" style={{position:"sticky",top:0,zIndex:30}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"11px 16px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>← Dashboard</button>
          <div style={{flex:1}}/>
          {/* USD */}
          <button onClick={()=>{setShowCotizacion(!showCotizacion);setForm({usd_oficial:String(cotizacion.usd_oficial),usd_mep:String(cotizacion.usd_mep),usd_blue:String(cotizacion.usd_blue),usd_usado:String(cotizacion.usd_usado)});}}
            style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,border:"1.5px solid rgba(217,119,6,0.35)",background:"rgba(217,119,6,0.08)",color:"#d97706",fontSize:13,fontWeight:800,cursor:"pointer"}}>
            💵 USD <span>${usdUsado.toLocaleString("es-AR")}</span>
          </button>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="Logo" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
        {/* Form cotización */}
        {showCotizacion&&(
          <div style={{borderTop:"1px solid rgba(255,255,255,0.40)",padding:"10px 16px",display:"flex",flexWrap:"wrap",alignItems:"flex-end",gap:12,background:"rgba(255,255,255,0.25)"}}>
            {[["USD Oficial","usd_oficial"],["USD MEP","usd_mep"],["USD Blue","usd_blue"],["Usar este","usd_usado"]].map(([label,key])=>(
              <div key={key}>
                <label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>{label}</label>
                <input type="number" value={form[key]??""} onChange={e=>setForm({...form,[key]:e.target.value})} className="inp" style={{width:110,padding:"6px 10px"}}/>
              </div>
            ))}
            <button onClick={guardarCotizacion} className="bbtn">▶ Guardar</button>
            <button onClick={()=>setShowCotizacion(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:16}}>✕</button>
          </div>
        )}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Título */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📊 Finanzas <span style={{color:"#1565c0"}}>de la Empresa</span></h1>
            <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600,textTransform:"uppercase"}}>{nombreEmpresa}</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input type="month" value={filterMes} onChange={e=>setFilterMes(e.target.value)} className="inp" style={{padding:"7px 10px",fontSize:12,width:"auto"}}/>
            <button onClick={exportarExcel} className="abtn" style={{fontSize:11}}>📊 Excel</button>
            <button onClick={()=>{setTab("movimientos");setShowForm(true);setForm({tipo:"egreso",moneda:"ARS",fecha:now.toISOString().split("T")[0]});}} className="bbtn">+ Movimiento</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{display:"flex",gap:7,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>{setTab(t.key);setShowForm(false);setForm({});setCCActiva(null);}}
              className={`tab-f${tab===t.key?" on":""}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════
            GENERAL
        ══════════════════════════════ */}
        {tab==="general"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* KPIs fila 1 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                { label:"Saldo Total", value:fmtM(totalBancos), sub:`USD ${(totalBancos/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}`, color:"#16a34a", icon:"🏦" },
                { label:"Margen Bruto", value:fmtM(margenBrutoTotal), sub:`MN: ${fmtM(margenNetoTotal)}`, color:margenBrutoTotal>=0?"#16a34a":"#dc2626", icon:"📈" },
                { label:"Ingresos del Mes", value:fmtM(ingresosMes), sub:filterMes, color:"#16a34a", icon:"💰" },
                { label:"Egresos del Mes", value:fmtM(egresosMes), sub:`Neto: ${fmtM(flujoNeto)}`, color:"#dc2626", icon:"💸" },
              ].map(s=>(
                <div key={s.label} className="kpi-f">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <span style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.label}</span>
                    <span style={{fontSize:18}}>{s.icon}</span>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:11,color:"#6b8aaa",marginTop:3,fontWeight:600}}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* KPIs fila 2 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                { label:"Rentabilidad", value:`${rentabilidadPct.toFixed(1)}%`, sub:hectareasTotal>0?`MB/ha: ${fmtM(margenBrutoTotal/hectareasTotal)}`:"Sin lotes", color:"#d97706", icon:"📊" },
                { label:"Deuda Proveedores", value:fmtM(deudaProveedores), sub:`USD ${(deudaProveedores/usdUsado).toFixed(0)}`, color:"#dc2626", icon:"⚠️" },
                { label:"Cuentas x Cobrar", value:fmtM(cobrosClientes), sub:`Cheques: ${fmtM(chequesCartera)}`, color:"#1565c0", icon:"💵" },
                { label:"Impuestos Pend.", value:fmtM(impPendientes), sub:`${impuestos.filter(i=>i.estado==="pendiente").length} vencimientos`, color:"#7c3aed", icon:"📋" },
              ].map(s=>(
                <div key={s.label} className="kpi-f" style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:24}}>{s.icon}</span>
                  <div>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.label}</div>
                    <div style={{fontSize:18,fontWeight:800,color:s.color,marginTop:2}}>{s.value}</div>
                    <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Gráfico + Panel */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:14}}>
              <div className="sec-w" style={{padding:16}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:3}}>Resumen Financiero</div>
                <p style={{fontSize:11,color:"#6b8aaa",marginBottom:12}}>Ingresos vs Egresos — últimos 8 meses (en miles $)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={datosGrafico} barSize={16} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,60,140,0.06)"/>
                    <XAxis dataKey="mes" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}K`}/>
                    <Tooltip contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"12px",fontSize:"12px",boxShadow:"0 4px 16px rgba(20,80,160,0.12)"}} formatter={(v:any,n:string)=>[`$${Number(v).toLocaleString("es-AR")}K`,n]}/>
                    <Legend wrapperStyle={{fontSize:"12px"}}/>
                    <Bar dataKey="Ingresos" fill="#4ade80" radius={[6,6,0,0]}/>
                    <Bar dataKey="Egresos" fill="#f87171" radius={[6,6,0,0]}/>
                    <Line type="monotone" dataKey="Margen" stroke="#d97706" strokeWidth={2.5} dot={{fill:"#d97706",r:4,strokeWidth:0}}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* Vencimientos */}
                <div className="sec-w" style={{padding:14}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>📅 Próximos Vencimientos</div>
                  {proximosVenc.length===0?(
                    <div style={{textAlign:"center",padding:"16px 0"}}>
                      <div style={{fontSize:24,marginBottom:4}}>✅</div>
                      <p style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>Sin vencimientos próximos</p>
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {proximosVenc.slice(0,4).map((v,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:7,borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                          <div>
                            <div style={{fontSize:12,color:"#0d2137",fontWeight:700}}>{v.label}</div>
                            <div style={{fontSize:10,color:"#6b8aaa"}}>{v.dias}d · {v.fecha}</div>
                          </div>
                          <span style={{fontWeight:800,fontSize:12,color:v.dias<=7?"#dc2626":"#d97706"}}>{fmt(v.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Cobrar */}
                <div className="sec-w" style={{padding:14}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:10}}>💵 Cuentas por Cobrar</div>
                  {[{l:"Clientes",v:cobrosClientes,c:"#1565c0"},{l:"Cheques cartera",v:chequesCartera,c:"#16a34a"}].map(s=>(
                    <div key={s.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                      <span style={{fontSize:12,color:"#6b8aaa",fontWeight:600}}>{s.l}</span>
                      <span style={{fontWeight:800,fontSize:12,color:s.c}}>{fmt(s.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Movimientos recientes + Costos */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="sec-w">
                <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Movimientos Recientes</span>
                  <button onClick={()=>setTab("movimientos")} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Ver todos →</button>
                </div>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Descripción","Tipo","Monto"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {movimientos.slice(0,6).map(m=>(
                      <tr key={m.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",fontSize:10,color:"#6b8aaa"}}>{m.fecha}</td>
                        <td style={{padding:"8px 12px",fontSize:12,color:"#0d2137",fontWeight:600}}>{m.descripcion}</td>
                        <td style={{padding:"8px 12px"}}><span className={m.tipo==="ingreso"?"bg-gr":"bg-rd"}>{m.tipo==="ingreso"?"Ingreso":"Gasto"}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:800,fontSize:12,color:m.tipo==="ingreso"?"#16a34a":"#dc2626"}}>{m.tipo==="ingreso"?"+":"-"}{fmt(m.monto_ars)}</td>
                      </tr>
                    ))}
                    {movimientos.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:32,color:"#6b8aaa",fontSize:13}}>Sin movimientos registrados</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Costos */}
              <div className="sec-w">
                <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)"}}><span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Análisis de Costos por Rubro</span></div>
                {costosPorCat.length===0?(
                  <div style={{textAlign:"center",padding:32,color:"#6b8aaa",fontSize:13}}>Sin egresos categorizados</div>
                ):(
                  <div style={{display:"flex"}}>
                    <div style={{width:130,flexShrink:0,padding:"8px 0"}}>
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie data={costosPorCat} cx="50%" cy="50%" innerRadius={28} outerRadius={52} paddingAngle={2} dataKey="value">
                            {costosPorCat.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                          </Pie>
                          <Tooltip formatter={(v:any)=>[`$${Number(v).toLocaleString("es-AR")}`,""]} contentStyle={{fontSize:"11px",borderRadius:"8px"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <table style={{flex:1,fontSize:11,borderCollapse:"collapse"}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Rubro","% del Total","Monto"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {costosPorCat.map((c,i)=>{
                          const pct = totalCostos>0 ? (c.value/totalCostos*100).toFixed(0) : 0;
                          return (
                            <tr key={c.name} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                              <td style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:6}}>
                                <div style={{width:8,height:8,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                                <span style={{color:"#0d2137",fontWeight:600}}>{c.name}</span>
                              </td>
                              <td style={{padding:"7px 10px"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <div style={{width:50,height:5,background:"rgba(0,60,140,0.08)",borderRadius:3,overflow:"hidden"}}>
                                    <div style={{height:"100%",background:PIE_COLORS[i%PIE_COLORS.length],width:`${pct}%`,borderRadius:3}}/>
                                  </div>
                                  <span style={{color:"#6b8aaa"}}>{pct}%</span>
                                </div>
                              </td>
                              <td style={{padding:"7px 10px",fontWeight:800,color:"#dc2626"}}>{fmt(c.value)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Fila inferior */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                { icon:"🌾", label:"Cosecha Vendida", value:`${movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de granos").length} ops.`, sub:fmt(movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de granos").reduce((a,m)=>a+m.monto_ars,0)), color:"#d97706" },
                { icon:"🐄", label:"Venta Hacienda", value:`${movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de hacienda").length} ops.`, sub:fmt(movimientos.filter(m=>m.tipo==="ingreso"&&m.categoria==="Venta de hacienda").reduce((a,m)=>a+m.monto_ars,0)), color:"#16a34a" },
                { icon:"🏦", label:"Bancos / Caja", value:`${bancos.length} cuentas`, sub:fmt(totalBancos), color:"#1565c0" },
                { icon:"💰", label:"Gastos Impositivos", value:fmt(impPendientes), sub:`${impuestos.length} registros`, color:"#7c3aed" },
              ].map(s=>(
                <div key={s.label} className="kpi-f" style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:24}}>{s.icon}</span>
                  <div>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.label}</div>
                    <div style={{fontWeight:800,fontSize:14,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            MOVIMIENTOS
        ══════════════════════════════ */}
        {tab==="movimientos"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:6}}>
                {(["todos","ingreso","egreso"] as const).map(f=>(
                  <button key={f} onClick={()=>setFilterTipo(f)} className={`tab-f${filterTipo===f?" on":""}`} style={{padding:"6px 14px",fontSize:11}}>{f.toUpperCase()}</button>
                ))}
              </div>
              <button onClick={()=>setShowForm(!showForm)} className="bbtn">+ Nuevo</button>
            </div>

            {/* Resumen */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                {l:"INGRESOS",v:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0),c:"#16a34a"},
                {l:"EGRESOS",v:movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),c:"#dc2626"},
                {l:"NETO",v:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0)-movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),c:"#d97706"},
              ].map(s=>(
                <div key={s.l} className="kpi-f" style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:s.v>=0?s.c:"#dc2626",marginTop:4}}>{fmtM(s.v)}</div>
                  <div style={{fontSize:10,color:"#6b8aaa",marginTop:2}}>USD {(s.v/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                </div>
              ))}
            </div>

            {showForm&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Registrar Movimiento</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo??"egreso"} onChange={e=>setForm({...form,tipo:e.target.value,categoria:""})} className="sel"><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel"><option value="">Seleccionar</option>{(form.tipo==="ingreso"?CATS_INGRESO:CATS_EGRESO).map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Detalle del movimiento"/></div>
                  <div><label className={lCls}>Moneda</label><select value={form.moneda??"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="sel"><option value="ARS">$ ARS</option><option value="USD">U$S USD</option></select></div>
                  <div><label className={lCls}>Monto ({form.moneda??"ARS"})</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  {form.moneda==="ARS"&&<div><label className={lCls}>IVA %</label><select value={form.iva_pct??"0"} onChange={e=>setForm({...form,iva_pct:e.target.value})} className="sel"><option value="0">Sin IVA</option><option value="10.5">10.5%</option><option value="21">21%</option></select></div>}
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Cuenta bancaria</label><select value={form.cuenta??"caja"} onChange={e=>setForm({...form,cuenta:e.target.value})} className="sel"><option value="caja">Caja</option>{bancos.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Lote (opcional)</label><select value={form.lote_id??""} onChange={e=>setForm({...form,lote_id:e.target.value})} className="sel"><option value="">Sin lote</option>{lotes.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Proveedor / Cliente</label><input type="text" value={form.proveedor_cliente??""} onChange={e=>setForm({...form,proveedor_cliente:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Comprobante</label><input type="text" value={form.comprobante??""} onChange={e=>setForm({...form,comprobante:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                {form.monto&&Number(form.iva_pct??0)>0&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.20)",fontSize:11,color:"#d97706",fontWeight:600}}>
                    Neto: ${Number(form.monto).toLocaleString("es-AR")} · IVA {form.iva_pct}%: ${(Number(form.monto)*Number(form.iva_pct)/100).toLocaleString("es-AR")} · Total: ${(Number(form.monto)*(1+Number(form.iva_pct)/100)).toLocaleString("es-AR")}
                  </div>
                )}
                {form.moneda==="USD"&&form.monto&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.20)",fontSize:11,color:"#1565c0",fontWeight:600}}>
                    Equivalente ARS: ${(Number(form.monto)*usdUsado).toLocaleString("es-AR")} (cotización USD ${usdUsado})
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMovimiento} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            <div className="sec-w">
              {movsFiltrados.length===0
                ?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin movimientos en este período</div>
                :<div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:800}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Categoría","Descripción","Moneda","Monto","ARS","IVA","Prov/Cli",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{movsFiltrados.map(m=>(
                      <tr key={m.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span className={m.tipo==="ingreso"?"bg-gr":"bg-rd"}>{m.tipo==="ingreso"?"Ingreso":"Gasto"}</span></td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{m.categoria}</td>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{m.descripcion}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.moneda}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>{Number(m.monto).toLocaleString("es-AR")}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:m.tipo==="ingreso"?"#16a34a":"#dc2626"}}>{m.tipo==="ingreso"?"+":"-"}${Number(m.monto_ars).toLocaleString("es-AR")}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.iva_pct>0?`${m.iva_pct}%`:"-"}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.proveedor_cliente||"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("finanzas_movimientos",m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            CUENTAS CORRIENTES
        ══════════════════════════════ */}
        {tab==="cuentas_ctes"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_cte:"proveedor"});setCCActiva(null);}} className="bbtn">+ Nueva Cta. Corriente</button>
            </div>
            {showForm&&!ccActiva&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Cuenta Corriente</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_cte??"proveedor"} onChange={e=>setForm({...form,tipo_cte:e.target.value})} className="sel"><option value="proveedor">Proveedor</option><option value="cliente">Cliente</option></select></div>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Empresa / Persona"/></div>
                  <div><label className={lCls}>CUIT</label><input type="text" value={form.cuit??""} onChange={e=>setForm({...form,cuit:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Saldo inicial ARS</label><input type="number" value={form.saldo_ars??""} onChange={e=>setForm({...form,saldo_ars:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Saldo inicial USD</label><input type="number" value={form.saldo_usd??""} onChange={e=>setForm({...form,saldo_usd:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCuentaCte} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {!ccActiva&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                {cuentasCtes.map(cc=>{
                  const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===cc.id);
                  const pendiente=movs.filter(m=>m.estado==="pendiente").reduce((a,m)=>a+m.monto,0);
                  return(
                    <div key={cc.id} className="kpi-f" style={{cursor:"pointer"}} onClick={()=>{setCCActiva(cc.id);setForm({});}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{cc.nombre}</div>
                          <div style={{display:"flex",gap:6,marginTop:4}}>
                            <span className={cc.tipo==="proveedor"?"bg-rd":"bg-gr"}>{cc.tipo}</span>
                            {cc.cuit&&<span style={{fontSize:11,color:"#6b8aaa"}}>{cc.cuit}</span>}
                          </div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();eliminar("finanzas_cuentas_corrientes",cc.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                      </div>
                      <div style={{fontSize:22,fontWeight:800,color:cc.saldo_ars>=0?"#16a34a":"#dc2626"}}>${Number(cc.saldo_ars).toLocaleString("es-AR")}</div>
                      {cc.saldo_usd!==0&&<div style={{fontSize:13,color:"#d97706",fontWeight:700}}>USD {cc.saldo_usd}</div>}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,paddingTop:8,borderTop:"1px solid rgba(0,60,140,0.06)",fontSize:11,color:"#6b8aaa"}}>
                        <span>{movs.length} movimientos · Pend: ${pendiente.toLocaleString("es-AR")}</span>
                        {cc.telefono&&<a href={`https://wa.me/54${cc.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:"#16a34a",fontWeight:700,fontSize:14}}>💬</a>}
                      </div>
                    </div>
                  );
                })}
                {cuentasCtes.length===0&&<div className="kpi-f" style={{gridColumn:"span 3",textAlign:"center",padding:48,color:"#6b8aaa"}}>Sin cuentas corrientes</div>}
              </div>
            )}

            {ccActiva&&(()=>{
              const cc=cuentasCtes.find(c=>c.id===ccActiva);
              if(!cc) return null;
              const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===ccActiva);
              return(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <button onClick={()=>setCCActiva(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700,textAlign:"left"}}>← Volver</button>
                  <div className="card-g" style={{padding:14}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
                      <div>
                        <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>{cc.nombre}</h2>
                        <span className={cc.tipo==="proveedor"?"bg-rd":"bg-gr"} style={{marginTop:4,display:"inline-block"}}>{cc.tipo}</span>
                      </div>
                      <div style={{fontSize:28,fontWeight:800,color:cc.saldo_ars>=0?"#16a34a":"#dc2626"}}>${Number(cc.saldo_ars).toLocaleString("es-AR")}</div>
                    </div>
                    <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:12}}>
                      <div style={{fontSize:11,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>+ Registrar Movimiento</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                        <div><label className={lCls}>Tipo</label><select value={form.tipo_mov_cc??"factura"} onChange={e=>setForm({...form,tipo_mov_cc:e.target.value})} className="sel"><option value="factura">Factura / Deuda</option><option value="pago">Pago / Cobro</option><option value="nota_credito">Nota crédito</option></select></div>
                        <div><label className={lCls}>Moneda</label><select value={form.moneda_cc??"ARS"} onChange={e=>setForm({...form,moneda_cc:e.target.value})} className="sel"><option value="ARS">ARS</option><option value="USD">USD</option></select></div>
                        <div><label className={lCls}>Monto</label><input type="number" value={form.monto_cc??""} onChange={e=>setForm({...form,monto_cc:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                        <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_cc??now.toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_cc:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                        <div style={{gridColumn:"span 2"}}><label className={lCls}>Descripción</label><input type="text" value={form.descripcion_cc??""} onChange={e=>setForm({...form,descripcion_cc:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                        <div><label className={lCls}>Comprobante</label><input type="text" value={form.comprobante_cc??""} onChange={e=>setForm({...form,comprobante_cc:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                        <div><label className={lCls}>Vencimiento</label><input type="date" value={form.vencimiento_cc??""} onChange={e=>setForm({...form,vencimiento_cc:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      </div>
                      <button onClick={()=>registrarMovCCte(ccActiva)} className="bbtn">▶ Registrar</button>
                    </div>
                  </div>
                  <div className="sec-w">
                    <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)"}}><span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>HISTORIAL</span></div>
                    {movs.length===0?<div style={{textAlign:"center",padding:32,color:"#6b8aaa",fontSize:13}}>Sin movimientos</div>:(
                      <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Descripción","Moneda","Monto","Saldo","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                        <tbody>{movs.map(m=>(
                          <tr key={m.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                            <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.fecha}</td>
                            <td style={{padding:"8px 12px"}}><span className={m.tipo==="factura"?"bg-rd":m.tipo==="pago"?"bg-gr":"bg-bl"}>{m.tipo}</span></td>
                            <td style={{padding:"8px 12px",color:"#0d2137",fontWeight:600}}>{m.descripcion}</td>
                            <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{m.moneda}</td>
                            <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>{Number(m.monto).toLocaleString("es-AR")}</td>
                            <td style={{padding:"8px 12px",fontSize:11,fontWeight:700,color:m.saldo_nuevo>=0?"#16a34a":"#dc2626"}}>{Number(m.saldo_nuevo).toLocaleString("es-AR")}</td>
                            <td style={{padding:"8px 12px"}}><span className={m.estado==="pagado"?"bg-gr":"bg-gd"}>{m.estado}</span></td>
                            <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("finanzas_cc_movimientos",m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
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

        {/* ══════════════════════════════
            BANCOS
        ══════════════════════════════ */}
        {tab==="bancos"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>Total: <strong style={{color:"#1565c0"}}>${totalBancos.toLocaleString("es-AR")}</strong></span>
              <button onClick={()=>setShowForm(!showForm)} className="bbtn">+ Nueva Cuenta</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: Banco Nación CC"/></div>
                  <div><label className={lCls}>Banco</label><input type="text" value={form.banco??""} onChange={e=>setForm({...form,banco:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_banco??"cuenta_corriente"} onChange={e=>setForm({...form,tipo_banco:e.target.value})} className="sel"><option value="caja">Caja</option><option value="cuenta_corriente">Cuenta Corriente</option><option value="caja_ahorro">Caja Ahorro</option><option value="inversion">Inversión</option></select></div>
                  <div><label className={lCls}>Moneda</label><select value={form.moneda_banco??"ARS"} onChange={e=>setForm({...form,moneda_banco:e.target.value})} className="sel"><option value="ARS">ARS</option><option value="USD">USD</option></select></div>
                  <div><label className={lCls}>Saldo inicial</label><input type="number" value={form.saldo??""} onChange={e=>setForm({...form,saldo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarBanco} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
              {bancos.map(b=>(
                <div key={b.id} className="kpi-f">
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{b.nombre}</div>
                      <div style={{fontSize:11,color:"#6b8aaa"}}>{b.banco} · {b.tipo?.replace("_"," ")} · {b.moneda}</div>
                    </div>
                    <button onClick={()=>eliminar("finanzas_bancos",b.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:b.saldo>=0?"#16a34a":"#dc2626"}}>${Number(b.saldo).toLocaleString("es-AR")}</div>
                  {b.moneda==="ARS"&&<div style={{fontSize:11,color:"#6b8aaa",marginTop:3}}>≈ USD {(b.saldo/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>}
                </div>
              ))}
              {bancos.length===0&&<div className="kpi-f" style={{gridColumn:"span 3",textAlign:"center",padding:48,color:"#6b8aaa"}}>Sin cuentas registradas</div>}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            CHEQUES
        ══════════════════════════════ */}
        {tab==="cheques"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:14,fontSize:13,fontWeight:700,color:"#0d2137"}}>
                <span>Cartera: <strong style={{color:"#1565c0"}}>${chequesCartera.toLocaleString("es-AR")}</strong></span>
                <span>Emitidos: <strong style={{color:"#dc2626"}}>${cheques.filter(c=>c.tipo==="emitido"&&c.estado==="cartera").reduce((a,c)=>a+c.monto,0).toLocaleString("es-AR")}</strong></span>
              </div>
              <button onClick={()=>setShowForm(!showForm)} className="bbtn">+ Nuevo Cheque</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_cheque??"recibido"} onChange={e=>setForm({...form,tipo_cheque:e.target.value})} className="sel"><option value="recibido">Recibido</option><option value="emitido">Emitido</option></select></div>
                  <div><label className={lCls}>Subtipo</label><select value={form.subtipo??"fisico"} onChange={e=>setForm({...form,subtipo:e.target.value})} className="sel"><option value="fisico">Físico</option><option value="echeq">ECheq</option></select></div>
                  <div><label className={lCls}>Número</label><input type="text" value={form.numero??""} onChange={e=>setForm({...form,numero:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Banco</label><input type="text" value={form.banco_cheque??""} onChange={e=>setForm({...form,banco_cheque:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha emisión</label><input type="date" value={form.fecha_emision??""} onChange={e=>setForm({...form,fecha_emision:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha cobro</label><input type="date" value={form.fecha_cobro??""} onChange={e=>setForm({...form,fecha_cobro:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tercero</label><input type="text" value={form.tercero??""} onChange={e=>setForm({...form,tercero:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCheque} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {cheques.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin cheques</div>:(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Tipo","Nro.","Banco","Monto","F.Cobro","Tercero","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{cheques.map(c=>{
                      const dias=c.fecha_cobro?Math.round((new Date(c.fecha_cobro).getTime()-Date.now())/(1000*60*60*24)):null;
                      return(
                        <tr key={c.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                          <td style={{padding:"8px 12px"}}><span className={c.tipo==="recibido"?"bg-bl":"bg-rd"}>{c.tipo}</span></td>
                          <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{c.numero}</td>
                          <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{c.banco}</td>
                          <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:dias!==null&&dias<=7?"#dc2626":"#6b8aaa"}}>{c.fecha_cobro}{dias!==null&&dias<=7&&" ⚠️"}</td>
                          <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{c.tercero||"—"}</td>
                          <td style={{padding:"8px 12px"}}><span className="bg-gr">{c.estado}</span></td>
                          <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("finanzas_cheques",c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            MARGEN POR LOTE
        ══════════════════════════════ */}
        {tab==="margen"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>setShowForm(!showForm)} className="bbtn">+ Cargar / Editar Margen</button>
            </div>
            {margenes.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {l:"MARGEN BRUTO TOTAL",v:margenBrutoTotal,c:"#16a34a"},
                  {l:"MARGEN NETO TOTAL",v:margenNetoTotal,c:"#d97706"},
                  {l:"RENTABILIDAD",v:rentabilidadPct,c:"#1565c0",pct:true},
                ].map(s=>(
                  <div key={s.l} className="kpi-f" style={{textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</div>
                    <div style={{fontSize:22,fontWeight:800,color:s.v>=0?s.c:"#dc2626",marginTop:6}}>{(s as any).pct?`${s.v.toFixed(1)}%`:fmtM(s.v)}</div>
                    {!(s as any).pct&&<div style={{fontSize:10,color:"#6b8aaa",marginTop:2}}>USD {(s.v/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>}
                  </div>
                ))}
              </div>
            )}
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>Margen por Lote · <span style={{color:"#d97706",fontSize:12}}>USD ${usdUsado}</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:10}}>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Lote</label><select value={form.lote_id??""} onChange={e=>setForm({...form,lote_id:e.target.value})} className="sel"><option value="">Seleccionar lote</option>{lotes.map(l=><option key={l.id} value={l.id}>{l.nombre} · {l.cultivo} · {l.hectareas}ha</option>)}</select></div>
                  <div><label className={lCls}>Ingreso total ARS</label><input type="number" value={form.ingreso_ars??""} onChange={e=>setForm({...form,ingreso_ars:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Costos directos ARS</label><input type="number" value={form.costo_directo_ars??""} onChange={e=>setForm({...form,costo_directo_ars:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Semillas, fertilizantes..."/></div>
                  <div><label className={lCls}>Costos indirectos ARS</label><input type="number" value={form.costo_indirecto_ars??""} onChange={e=>setForm({...form,costo_indirecto_ars:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Maquinaria, estructura..."/></div>
                </div>
                {form.ingreso_ars&&(
                  <div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.20)",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:12}}>
                    {[
                      {l:"MB ARS",v:Number(form.ingreso_ars)-Number(form.costo_directo_ars??0),c:"#16a34a"},
                      {l:"MN ARS",v:Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0),c:"#d97706"},
                      {l:"MN USD",v:(Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0))/usdUsado,c:"#1565c0"},
                    ].map(s=>(
                      <div key={s.l} style={{textAlign:"center"}}>
                        <div style={{color:"#6b8aaa",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                        <div style={{fontWeight:800,fontSize:18,marginTop:3,color:s.v>=0?s.c:"#dc2626"}}>${s.v.toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMargen} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            {margenes.length===0&&!showForm
              ?<div className="kpi-f" style={{textAlign:"center",padding:48,color:"#6b8aaa"}}>Sin márgenes cargados</div>
              :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                {margenes.map(m=>{
                  const lote=lotes.find(l=>l.id===m.lote_id);
                  const mbHa=m.hectareas>0?m.margen_bruto_ars/m.hectareas:0;
                  const mnHa=m.hectareas>0?m.margen_neto_ars/m.hectareas:0;
                  return(
                    <div key={m.id} className="sec-w" style={{padding:14}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                        <div>
                          <div style={{fontSize:16,fontWeight:800,color:"#0d2137"}}>{lote?.nombre??m.lote_id}</div>
                          <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>{m.cultivo?.toUpperCase()} · {m.hectareas} Ha</div>
                        </div>
                        <button onClick={()=>eliminar("finanzas_margen_lote",m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:13}}>✕ Eliminar</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8}}>
                        {[
                          {l:"INGRESO",v:m.ingreso_ars,c:"#0d2137"},
                          {l:"COSTO DIRECTO",v:m.costo_directo_ars,c:"#dc2626"},
                          {l:"COSTO INDIRECTO",v:m.costo_indirecto_ars,c:"#dc2626"},
                          {l:"MARGEN BRUTO",v:m.margen_bruto_ars,c:m.margen_bruto_ars>=0?"#16a34a":"#dc2626"},
                          {l:"MARGEN NETO",v:m.margen_neto_ars,c:m.margen_neto_ars>=0?"#d97706":"#dc2626"},
                          {l:"MN USD",v:m.margen_neto_usd,c:m.margen_neto_usd>=0?"#1565c0":"#dc2626"},
                          {l:"MB/Ha",v:mbHa,c:"#16a34a"},
                          {l:"MN/Ha",v:mnHa,c:"#d97706"},
                        ].map(s=>(
                          <div key={s.l} style={{background:"rgba(0,60,140,0.04)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
                            <div style={{fontWeight:800,fontSize:13,color:s.c}}>${Number(s.v).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}

        {/* ══════════════════════════════
            IMPUESTOS
        ══════════════════════════════ */}
        {tab==="impuestos"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>setShowForm(!showForm)} className="bbtn">+ Nuevo Impuesto</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                {l:"CRÉDITO FISCAL",v:impuestos.reduce((a,i)=>a+i.credito_fiscal,0),c:"#16a34a"},
                {l:"DÉBITO FISCAL",v:impuestos.reduce((a,i)=>a+i.debito_fiscal,0),c:"#dc2626"},
                {l:"POSICIÓN IVA",v:impuestos.reduce((a,i)=>a+i.debito_fiscal,0)-impuestos.reduce((a,i)=>a+i.credito_fiscal,0),c:"#d97706"},
              ].map(s=>(
                <div key={s.l} className="kpi-f" style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:s.c,marginTop:6}}>${s.v.toLocaleString("es-AR")}</div>
                </div>
              ))}
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_imp??""} onChange={e=>setForm({...form,tipo_imp:e.target.value})} className="sel"><option value="IVA 10.5%">IVA 10.5%</option><option value="IVA 21%">IVA 21%</option><option value="Ganancias">Ganancias</option><option value="Bienes Personales">Bienes Personales</option><option value="Ingresos Brutos">Ingresos Brutos</option><option value="Retención AFIP">Retención AFIP</option><option value="Monotributo">Monotributo</option><option value="Otro">Otro</option></select></div>
                  <div><label className={lCls}>Período</label><input type="text" value={form.periodo??""} onChange={e=>setForm({...form,periodo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: 03/2026"/></div>
                  <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Monto a pagar</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Crédito fiscal</label><input type="number" value={form.credito_fiscal??""} onChange={e=>setForm({...form,credito_fiscal:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Débito fiscal</label><input type="number" value={form.debito_fiscal??""} onChange={e=>setForm({...form,debito_fiscal:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Vencimiento</label><input type="date" value={form.fecha_vencimiento??""} onChange={e=>setForm({...form,fecha_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarImpuesto} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {impuestos.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin impuestos</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Tipo","Período","Descripción","Monto","Crédito","Débito","Vencimiento","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{impuestos.map(i=>{
                    const dias=i.fecha_vencimiento?Math.round((new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)):null;
                    const urgente=dias!==null&&dias<=7&&i.estado==="pendiente";
                    return(
                      <tr key={i.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px"}}><span className="bg-gd">{i.tipo}</span></td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{i.periodo}</td>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{i.descripcion}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>${Number(i.monto).toLocaleString("es-AR")}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#16a34a",fontWeight:600}}>{i.credito_fiscal>0?`$${Number(i.credito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#dc2626",fontWeight:600}}>{i.debito_fiscal>0?`$${Number(i.debito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:urgente?"#dc2626":"#6b8aaa"}}>{i.fecha_vencimiento}{urgente&&" ⚠️"}</td>
                        <td style={{padding:"8px 12px"}}>
                          {i.estado==="pendiente"
                            ?<button onClick={()=>pagarImpuesto(i.id)} style={{fontSize:11,padding:"4px 12px",borderRadius:8,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.25)",color:"#d97706",cursor:"pointer",fontWeight:700}}>Pagar</button>
                            :<span className="bg-gr">✓ Pagado</span>
                          }
                        </td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("finanzas_impuestos",i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:20,paddingTop:8}}>© AgroGestión PRO · Finanzas PRO</p>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} style={{position:"fixed",bottom:20,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",overflow:"hidden",border:"none",cursor:"pointer",padding:0,boxShadow:"0 6px 22px rgba(25,118,210,0.40)",animation:"float 3s ease-in-out infinite"}}>
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA&&(
        <div style={{position:"fixed",bottom:80,right:16,zIndex:40,width:300,borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#d97706",animation:"spin 2s linear infinite"}}/>
              <span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>Asesor Financiero IA</span>
            </div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:"10px 12px",maxHeight:200,overflowY:"auto"}}>
            {!aiMsg&&!aiLoading&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {["Analizá mi situación financiera","Liquidez próximos 30 días","Optimización de gastos","Posición IVA del mes"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} style={{textAlign:"left",fontSize:11,color:"#4a6a8a",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p style={{fontSize:12,color:"#d97706",fontWeight:700}}>Analizando finanzas...</p>}
            {aiMsg&&<p style={{fontSize:12,color:"#0d2137",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{aiMsg}</p>}
          </div>
          <div style={{padding:"6px 10px 10px",display:"flex",gap:6,borderTop:"1px solid rgba(0,60,140,0.07)"}}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre finanzas..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="bbtn" style={{padding:"7px 12px",fontSize:12}}>▶</button>
          </div>
        </div>
      )}

      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "general" | "movimientos" | "cuentas_ctes" | "bancos" | "cheques" | "margen" | "impuestos";

type Movimiento = {
  id: string; fecha: string; tipo: string; categoria: string; subcategoria: string;
  descripcion: string; moneda: string; monto: number; cotizacion_usd: number;
  monto_ars: number; monto_usd: number; cuenta: string; lote_id: string;
  proveedor_cliente: string; comprobante: string; iva_pct: number; monto_iva: number;
  retencion_pct: number; monto_retencion: number; observaciones: string;
};
type CuentaCorriente = {
  id: string; tipo: string; nombre: string; cuit: string; telefono: string;
  saldo_ars: number; saldo_usd: number; limite_credito: number; activo: boolean;
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
  ingreso_ars: number; ingreso_usd: number;
  costo_directo_ars: number; costo_directo_usd: number;
  costo_indirecto_ars: number; costo_indirecto_usd: number;
  margen_bruto_ars: number; margen_bruto_usd: number;
  margen_neto_ars: number; margen_neto_usd: number;
};
type Cotizacion = { usd_oficial: number; usd_mep: number; usd_blue: number; usd_usado: number; fecha: string; };
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
  const [cotizacion, setCotizacion] = useState<Cotizacion>({ usd_oficial:0, usd_mep:0, usd_blue:0, usd_usado:0, fecha:"" });
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
  const [listening, setListening] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
      sb.from("finanzas_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(200),
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

  // Stats
  const now = new Date();
  const movsMes = movimientos.filter(m => m.fecha?.slice(0,7) === filterMes);
  const ingresosMes = movsMes.filter(m => m.tipo === "ingreso").reduce((a,m) => a + m.monto_ars, 0);
  const egresosMes = movsMes.filter(m => m.tipo === "egreso").reduce((a,m) => a + m.monto_ars, 0);
  const flujoNeto = ingresosMes - egresosMes;
  const totalBancos = bancos.reduce((a,b) => a + b.saldo, 0);
  const chequesCartera = cheques.filter(c => c.estado === "cartera" && c.tipo === "recibido").reduce((a,c) => a + c.monto, 0);
  const impPendientes = impuestos.filter(i => i.estado === "pendiente").reduce((a,i) => a + i.monto, 0);
  const deudaProveedores = cuentasCtes.filter(c => c.tipo === "proveedor").reduce((a,c) => a + c.saldo_ars, 0);
  const cobrosClientes = cuentasCtes.filter(c => c.tipo === "cliente").reduce((a,c) => a + c.saldo_ars, 0);
  const usdUsado = cotizacion.usd_usado || cotizacion.usd_oficial || 1;

  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const monto = Number(form.monto ?? 0);
    const iva = Number(form.iva_pct ?? 0);
    const ret = Number(form.retencion_pct ?? 0);
    const montoIva = form.moneda === "ARS" ? monto * iva / 100 : 0;
    const montoRet = monto * ret / 100;
    const montoARS = form.moneda === "ARS" ? monto : monto * usdUsado;
    const montoUSD = form.moneda === "USD" ? monto : monto / usdUsado;
    await sb.from("finanzas_movimientos").insert({
      empresa_id: empresaId, fecha: form.fecha ?? now.toISOString().split("T")[0],
      tipo: form.tipo ?? "egreso", categoria: form.categoria ?? "",
      subcategoria: form.subcategoria ?? "", descripcion: form.descripcion ?? "",
      moneda: form.moneda ?? "ARS", monto, cotizacion_usd: usdUsado,
      monto_ars: montoARS, monto_usd: montoUSD,
      cuenta: form.cuenta ?? "caja", lote_id: form.lote_id || null,
      proveedor_cliente: form.proveedor_cliente ?? "",
      comprobante: form.comprobante ?? "",
      iva_pct: iva, monto_iva: montoIva,
      retencion_pct: ret, monto_retencion: montoRet,
      observaciones: form.observaciones ?? "",
    });
    // Actualizar saldo banco si hay cuenta
    if (form.cuenta && form.cuenta !== "caja") {
      const banco = bancos.find(b => b.id === form.cuenta);
      if (banco) {
        const delta = form.tipo === "ingreso" ? montoARS : -montoARS;
        await sb.from("finanzas_bancos").update({ saldo: banco.saldo + delta }).eq("id", banco.id);
      }
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
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
      limite_credito: Number(form.limite_credito ?? 0),
      activo: true,
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const registrarMovimientoCCte = async (ccId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const cc = cuentasCtes.find(c => c.id === ccId);
    if (!cc) return;
    const monto = Number(form.monto_cc ?? 0);
    const esDeuda = form.tipo_mov_cc === "factura";
    const nuevoSaldo = form.moneda_cc === "USD"
      ? cc.saldo_usd + (esDeuda ? monto : -monto)
      : cc.saldo_ars + (esDeuda ? monto : -monto);
    await sb.from("finanzas_cc_movimientos").insert({
      empresa_id: empresaId, cuenta_corriente_id: ccId,
      fecha: form.fecha_cc ?? now.toISOString().split("T")[0],
      tipo: form.tipo_mov_cc ?? "factura",
      descripcion: form.descripcion_cc ?? "",
      moneda: form.moneda_cc ?? "ARS",
      monto, saldo_anterior: form.moneda_cc === "USD" ? cc.saldo_usd : cc.saldo_ars,
      saldo_nuevo: nuevoSaldo,
      comprobante: form.comprobante_cc ?? "",
      vencimiento: form.vencimiento_cc || null,
      estado: "pendiente",
    });
    if (form.moneda_cc === "USD") {
      await sb.from("finanzas_cuentas_corrientes").update({ saldo_usd: nuevoSaldo }).eq("id", ccId);
    } else {
      await sb.from("finanzas_cuentas_corrientes").update({ saldo_ars: nuevoSaldo }).eq("id", ccId);
    }
    await fetchAll(empresaId);
    setForm({});
  };

  const guardarBanco = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_bancos").insert({
      empresa_id: empresaId, nombre: form.nombre ?? "",
      banco: form.banco ?? "", tipo: form.tipo_banco ?? "cuenta_corriente",
      moneda: form.moneda_banco ?? "ARS",
      saldo: Number(form.saldo ?? 0), activo: true,
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
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
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
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
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarMargen = async () => {
    if (!empresaId || !form.lote_id) return;
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id") ?? "";
    const lote = lotes.find(l => l.id === form.lote_id);
    const ingrARS = Number(form.ingreso_ars ?? 0);
    const costDirARS = Number(form.costo_directo_ars ?? 0);
    const costIndARS = Number(form.costo_indirecto_ars ?? 0);
    const mbARS = ingrARS - costDirARS;
    const mnARS = mbARS - costIndARS;
    const existing = margenes.find(m => m.lote_id === form.lote_id);
    const payload = {
      ingreso_ars: ingrARS, ingreso_usd: ingrARS / usdUsado,
      costo_directo_ars: costDirARS, costo_directo_usd: costDirARS / usdUsado,
      costo_indirecto_ars: costIndARS, costo_indirecto_usd: costIndARS / usdUsado,
      margen_bruto_ars: mbARS, margen_bruto_usd: mbARS / usdUsado,
      margen_neto_ars: mnARS, margen_neto_usd: mnARS / usdUsado,
      cultivo: lote?.cultivo ?? "", hectareas: lote?.hectareas ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await sb.from("finanzas_margen_lote").update(payload).eq("id", existing.id);
    } else {
      await sb.from("finanzas_margen_lote").insert({ empresa_id: empresaId, campana_id: campanaId, lote_id: form.lote_id, ...payload });
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarCotizacion = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const usdUsadoNuevo = Number(form.usd_usado ?? form.usd_oficial ?? 0);
    await sb.from("finanzas_cotizaciones").upsert({
      empresa_id: empresaId, fecha: now.toISOString().split("T")[0],
      usd_oficial: Number(form.usd_oficial ?? 0),
      usd_mep: Number(form.usd_mep ?? 0),
      usd_blue: Number(form.usd_blue ?? 0),
      usd_usado: usdUsadoNuevo,
    }, { onConflict: "empresa_id,fecha" });
    await fetchAll(empresaId);
    setShowCotizacion(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const pagarImpuesto = async (id: string) => {
    const sb = await getSB();
    await sb.from("finanzas_impuestos").update({ estado: "pagado", fecha_pago: now.toISOString().split("T")[0] }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const data = movimientos.map(m => ({
      Fecha: m.fecha, Tipo: m.tipo, Categoría: m.categoria, Descripción: m.descripcion,
      Moneda: m.moneda, Monto: m.monto, "Monto ARS": m.monto_ars, "Monto USD": m.monto_usd,
      "IVA%": m.iva_pct, "Monto IVA": m.monto_iva, "Ret%": m.retencion_pct,
      "Proveedor/Cliente": m.proveedor_cliente, Comprobante: m.comprobante,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Array(14).fill({ wch: 16 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `finanzas_${nombreEmpresa}_${filterMes}.xlsx`);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asesor financiero agropecuario experto. Datos: Liquidez: $${totalBancos.toLocaleString("es-AR")} ARS, Flujo neto mes: $${flujoNeto.toLocaleString("es-AR")} ARS, Cheques cartera: $${chequesCartera.toLocaleString("es-AR")}, Deuda proveedores: $${deudaProveedores.toLocaleString("es-AR")}, Impuestos pendientes: $${impPendientes.toLocaleString("es-AR")}, USD usado: $${usdUsado}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error IA"); }
    setAiLoading(false);
  };

  const startVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR";
    setListening(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setListening(false); setAiInput(t); setShowIA(true); askAI(`Voz: "${t}". Interpretá qué movimiento financiero quiere registrar.`); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#C9A227]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#C9A227] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const movsFiltrados = movimientos.filter(m => {
    const matchTipo = filterTipo === "todos" || m.tipo === filterTipo;
    const matchMes = m.fecha?.slice(0,7) === filterMes;
    return matchTipo && matchMes;
  });

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#C9A227] font-mono animate-pulse">▶ Cargando Finanzas PRO...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .card-fin:hover{border-color:rgba(201,162,39,0.4)!important;transform:translateY(-2px)}
        .card-fin{transition:all 0.2s ease}
        .tab-active{border-color:#C9A227!important;color:#C9A227!important;background:rgba(201,162,39,0.08)!important}
        .btn-float{animation:float 3s ease-in-out infinite}
        .logo-btn:hover{filter:drop-shadow(0 0 12px rgba(201,162,39,0.8));transform:scale(1.03)}
        .logo-btn{transition:all 0.2s ease;cursor:pointer}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="bg" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{backgroundImage:`linear-gradient(rgba(201,162,39,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(201,162,39,0.5) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#C9A227,#00FF80,#C9A227,transparent)",backgroundSize:"200% 100%",animation:"gradient-flow 4s ease infinite"}}/>
        <div className="absolute inset-0" style={{background:"linear-gradient(135deg,rgba(2,8,16,0.95) 0%,rgba(10,8,2,0.90) 50%,rgba(2,8,16,0.95) 100%)"}}/>
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={()=>window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#C9A227] transition-colors font-mono text-sm">← Dashboard</button>
          <div className="flex-1"/>
          {/* Cotización USD */}
          <button onClick={()=>{setShowCotizacion(!showCotizacion);setForm({usd_oficial:String(cotizacion.usd_oficial),usd_mep:String(cotizacion.usd_mep),usd_blue:String(cotizacion.usd_blue),usd_usado:String(cotizacion.usd_usado)});}}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#C9A227]/30 text-[#C9A227] font-mono text-xs hover:bg-[#C9A227]/10 transition-all">
            💵 USD ${usdUsado.toLocaleString("es-AR")}
          </button>
          <div className="logo-btn" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      {/* Form cotización */}
      {showCotizacion && (
        <div className="relative z-20 max-w-7xl mx-auto px-6 pt-2">
          <div className="bg-[#0a1628]/95 border border-[#C9A227]/30 rounded-xl p-4 flex flex-wrap items-end gap-4">
            <div><label className={labelClass}>USD Oficial</label><input type="number" value={form.usd_oficial??""} onChange={e=>setForm({...form,usd_oficial:e.target.value})} className={inputClass+" w-32"} placeholder="0"/></div>
            <div><label className={labelClass}>USD MEP</label><input type="number" value={form.usd_mep??""} onChange={e=>setForm({...form,usd_mep:e.target.value})} className={inputClass+" w-32"} placeholder="0"/></div>
            <div><label className={labelClass}>USD Blue</label><input type="number" value={form.usd_blue??""} onChange={e=>setForm({...form,usd_blue:e.target.value})} className={inputClass+" w-32"} placeholder="0"/></div>
            <div><label className={labelClass}>USD a usar</label><input type="number" value={form.usd_usado??""} onChange={e=>setForm({...form,usd_usado:e.target.value})} className={inputClass+" w-32"} placeholder="0"/></div>
            <button onClick={guardarCotizacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
            <button onClick={()=>setShowCotizacion(false)} className="text-[#4B5563] text-sm font-mono">✕</button>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* Title */}
        <div className="mb-5">
          <h1 className="text-3xl font-bold font-mono"><span className="text-[#E5E7EB]">Finanzas </span><span className="text-[#C9A227]">PRO</span></h1>
          <p className="text-[#4B5563] text-sm font-mono">{nombreEmpresa.toUpperCase()} · Cotización USD: <span className="text-[#C9A227]">${usdUsado.toLocaleString("es-AR")}</span></p>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>{setTab(t.key);setShowForm(false);setForm({});}}
              className={`px-4 py-2 rounded-xl border border-[#C9A227]/15 text-sm font-mono whitespace-nowrap transition-all ${tab===t.key?"tab-active":"text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Acciones globales */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <button onClick={startVoice} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening?"border-red-400 text-red-400 animate-pulse":"border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10"}`}>
            🎤 {listening?"Escuchando...":"Voz"}
          </button>
          <button onClick={exportarExcel} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm">📊 Exportar Excel</button>
          <input type="month" value={filterMes} onChange={e=>setFilterMes(e.target.value)} className="bg-[#0a1628]/80 border border-[#C9A227]/20 rounded-xl px-3 py-2 text-[#E5E7EB] text-sm font-mono focus:outline-none focus:border-[#C9A227]"/>
        </div>

        {/* ===== GENERAL ===== */}
        {tab==="general" && (
          <div>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              {[
                {label:"LIQUIDEZ",value:`$${totalBancos.toLocaleString("es-AR")}`,sub:`USD ${(totalBancos/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}`,color:"#00FF80",icon:"🏦"},
                {label:"FLUJO NETO MES",value:`$${flujoNeto.toLocaleString("es-AR")}`,sub:`Ing $${ingresosMes.toLocaleString("es-AR")} · Egr $${egresosMes.toLocaleString("es-AR")}`,color:flujoNeto>=0?"#4ADE80":"#F87171",icon:"📈"},
                {label:"DEUDA PROVEEDORES",value:`$${deudaProveedores.toLocaleString("es-AR")}`,sub:`USD ${(deudaProveedores/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}`,color:"#F87171",icon:"⚠️"},
                {label:"COBROS PENDIENTES",value:`$${cobrosClientes.toLocaleString("es-AR")}`,sub:`Cheques: $${chequesCartera.toLocaleString("es-AR")}`,color:"#60A5FA",icon:"💵"},
              ].map(s=>(
                <div key={s.label} className="card-fin bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2"><span className="text-[#4B5563] text-xs font-mono">{s.label}</span><span>{s.icon}</span></div>
                  <div className="text-2xl font-bold font-mono" style={{color:s.color}}>{s.value}</div>
                  <div className="text-xs text-[#4B5563] font-mono mt-1">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Stats secundarios */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
              {[
                {label:"INGRESOS MES",value:ingresosMes,color:"#4ADE80"},
                {label:"EGRESOS MES",value:egresosMes,color:"#F87171"},
                {label:"IMP. PENDIENTES",value:impPendientes,color:"#A78BFA"},
              ].map(s=>(
                <div key={s.label} className="card-fin bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                  <div className="text-xs text-[#4B5563] font-mono mb-2">{s.label}</div>
                  <div className="text-xl font-bold font-mono" style={{color:s.color}}>${s.value.toLocaleString("es-AR")}</div>
                  <div className="text-xs text-[#4B5563] font-mono">USD {(s.value/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                </div>
              ))}
            </div>

            {/* Últimos movimientos */}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#C9A227]/10 flex items-center justify-between">
                <span className="text-[#C9A227] text-sm font-mono font-bold">📋 ÚLTIMOS MOVIMIENTOS</span>
                <button onClick={()=>setTab("movimientos")} className="text-xs text-[#4B5563] hover:text-[#C9A227] font-mono">Ver todos →</button>
              </div>
              {movimientos.slice(0,6).map(m=>(
                <div key={m.id} className="px-5 py-3 border-b border-[#C9A227]/5 flex items-center justify-between hover:bg-[#C9A227]/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo==="ingreso"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]"}`}>{m.tipo}</span>
                    <div>
                      <div className="text-sm text-[#E5E7EB] font-mono">{m.descripcion}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{m.categoria} · {m.fecha} · {m.moneda}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-mono text-sm" style={{color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>
                      {m.tipo==="ingreso"?"+":"-"}${Number(m.monto_ars).toLocaleString("es-AR")}
                    </div>
                    {m.moneda==="USD"&&<div className="text-xs text-[#4B5563] font-mono">USD {m.monto}</div>}
                  </div>
                </div>
              ))}
              {movimientos.length===0&&<div className="text-center py-8 text-[#4B5563] font-mono text-sm">Sin movimientos</div>}
            </div>

            {/* Alertas */}
            {impuestos.filter(i=>i.estado==="pendiente"&&i.fecha_vencimiento&&(new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)<=30).length>0 && (
              <div className="bg-[#A78BFA]/5 border border-[#A78BFA]/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse"/><span className="text-[#A78BFA] text-xs font-mono font-bold">⚠️ IMPUESTOS POR VENCER</span></div>
                <div className="flex flex-wrap gap-2">
                  {impuestos.filter(i=>i.estado==="pendiente"&&i.fecha_vencimiento&&(new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)<=30).map(i=>{
                    const dias=Math.round((new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24));
                    return <div key={i.id} className="text-xs text-[#A78BFA] border border-[#A78BFA]/20 px-3 py-1 rounded-lg font-mono">{i.tipo} · {dias}d · ${Number(i.monto).toLocaleString("es-AR")}</div>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== MOVIMIENTOS ===== */}
        {tab==="movimientos" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-2">
                {(["todos","ingreso","egreso"] as const).map(f=>(
                  <button key={f} onClick={()=>setFilterTipo(f)} className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterTipo===f?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10":"border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>{f.toUpperCase()}</button>
                ))}
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo:"egreso",moneda:"ARS",fecha:now.toISOString().split("T")[0],iva_pct:"0",retencion_pct:"0"});}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">
                + Nuevo Movimiento
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-5">
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
                    <input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={inputClass} placeholder="Detalle del movimiento"/>
                  </div>
                  <div><label className={labelClass}>Moneda</label>
                    <select value={form.moneda??"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className={inputClass}>
                      <option value="ARS">ARS $</option><option value="USD">USD U$S</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Monto ({form.moneda??"ARS"})</label>
                    <input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
                  {form.moneda==="ARS" && (
                    <div><label className={labelClass}>IVA %</label>
                      <select value={form.iva_pct??"0"} onChange={e=>setForm({...form,iva_pct:e.target.value})} className={inputClass}>
                        <option value="0">Sin IVA</option><option value="10.5">10.5%</option><option value="21">21%</option>
                      </select>
                    </div>
                  )}
                  <div><label className={labelClass}>Retención %</label>
                    <input type="number" value={form.retencion_pct??"0"} onChange={e=>setForm({...form,retencion_pct:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
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
                  <div><label className={labelClass}>Nro. Comprobante</label>
                    <input type="text" value={form.comprobante??""} onChange={e=>setForm({...form,comprobante:e.target.value})} className={inputClass} placeholder="Factura / Remito"/>
                  </div>
                  <div><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/>
                  </div>
                </div>
                {/* Preview IVA */}
                {form.monto && Number(form.iva_pct)>0 && (
                  <div className="mt-3 p-3 bg-[#C9A227]/5 border border-[#C9A227]/20 rounded-lg text-xs font-mono text-[#C9A227]">
                    Neto: ${Number(form.monto).toLocaleString("es-AR")} · IVA {form.iva_pct}%: ${(Number(form.monto)*Number(form.iva_pct)/100).toLocaleString("es-AR")} · Total: ${(Number(form.monto)*(1+Number(form.iva_pct)/100)).toLocaleString("es-AR")}
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMovimiento} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Resumen mes */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {label:"INGRESOS",value:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0),color:"#4ADE80"},
                {label:"EGRESOS",value:movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),color:"#F87171"},
                {label:"NETO",value:movsFiltrados.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto_ars,0)-movsFiltrados.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto_ars,0),color:"#C9A227"},
              ].map(s=>(
                <div key={s.label} className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-3 text-center">
                  <div className="text-xs text-[#4B5563] font-mono">{s.label}</div>
                  <div className="text-xl font-bold font-mono mt-1" style={{color:s.color}}>${s.value.toLocaleString("es-AR")}</div>
                  <div className="text-xs text-[#4B5563] font-mono">USD {(s.value/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                </div>
              ))}
            </div>

            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {movsFiltrados.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin movimientos en este período</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">
                      {["Fecha","Tipo","Categoría","Descripción","Moneda","Monto","ARS","IVA","Proveedor/Cliente",""].map(h=><th key={h} className="text-left px-3 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody>{movsFiltrados.map(m=>(
                      <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                        <td className="px-3 py-3 text-xs text-[#9CA3AF] font-mono whitespace-nowrap">{m.fecha}</td>
                        <td className="px-3 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo==="ingreso"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]"}`}>{m.tipo}</span></td>
                        <td className="px-3 py-3 text-xs text-[#9CA3AF] font-mono">{m.categoria}</td>
                        <td className="px-3 py-3 text-sm text-[#E5E7EB] font-mono">{m.descripcion}</td>
                        <td className="px-3 py-3 text-xs text-[#9CA3AF] font-mono">{m.moneda}</td>
                        <td className="px-3 py-3 text-sm font-bold font-mono text-[#C9A227]">{m.monto.toLocaleString("es-AR")}</td>
                        <td className="px-3 py-3 font-bold font-mono text-sm" style={{color:m.tipo==="ingreso"?"#4ADE80":"#F87171"}}>${Number(m.monto_ars).toLocaleString("es-AR")}</td>
                        <td className="px-3 py-3 text-xs text-[#9CA3AF] font-mono">{m.iva_pct>0?`${m.iva_pct}%`:"-"}</td>
                        <td className="px-3 py-3 text-xs text-[#9CA3AF] font-mono">{m.proveedor_cliente}</td>
                        <td className="px-3 py-3"><button onClick={()=>eliminar("finanzas_movimientos",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
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
          <div>
            <div className="flex justify-end mb-4 gap-3">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_cte:"proveedor"});setCCActiva(null);}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">
                + Nueva Cuenta Cte
              </button>
            </div>
            {showForm && !ccActiva && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ CUENTA CORRIENTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cte??"proveedor"} onChange={e=>setForm({...form,tipo_cte:e.target.value})} className={inputClass}>
                      <option value="proveedor">Proveedor</option><option value="cliente">Cliente</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass} placeholder="Empresa / Persona"/></div>
                  <div><label className={labelClass}>CUIT</label><input type="text" value={form.cuit??""} onChange={e=>setForm({...form,cuit:e.target.value})} className={inputClass} placeholder="20-12345678-0"/></div>
                  <div><label className={labelClass}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Saldo inicial ARS</label><input type="number" value={form.saldo_ars??""} onChange={e=>setForm({...form,saldo_ars:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Saldo inicial USD</label><input type="number" value={form.saldo_usd??""} onChange={e=>setForm({...form,saldo_usd:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Límite crédito ARS</label><input type="number" value={form.limite_credito??""} onChange={e=>setForm({...form,limite_credito:e.target.value})} className={inputClass} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCuentaCte} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista cuentas corrientes */}
            {!ccActiva && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cuentasCtes.map(cc=>{
                  const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===cc.id);
                  const pendiente=movs.filter(m=>m.estado==="pendiente").reduce((a,m)=>a+m.monto,0);
                  return (
                    <div key={cc.id} className="card-fin bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5 cursor-pointer"
                      onClick={()=>{setCCActiva(cc.id);setForm({});}}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-[#E5E7EB] font-mono">{cc.nombre}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${cc.tipo==="proveedor"?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]"}`}>{cc.tipo}</span>
                            {cc.cuit&&<span className="text-xs text-[#4B5563] font-mono">{cc.cuit}</span>}
                          </div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();eliminar("finanzas_cuentas_corrientes",cc.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div><span className="text-[#4B5563]">Saldo ARS: </span><span style={{color:cc.saldo_ars>=0?"#4ADE80":"#F87171"}} className="font-bold">${Number(cc.saldo_ars).toLocaleString("es-AR")}</span></div>
                        {cc.saldo_usd!==0&&<div><span className="text-[#4B5563]">USD: </span><span className="text-[#C9A227] font-bold">{cc.saldo_usd}</span></div>}
                        <div><span className="text-[#4B5563]">Pendiente: </span><span className="text-[#F87171] font-bold">${pendiente.toLocaleString("es-AR")}</span></div>
                        <div><span className="text-[#4B5563]">Movs: </span><span className="text-[#9CA3AF]">{movs.length}</span></div>
                      </div>
                      {cc.telefono&&<a href={`https://wa.me/54${cc.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-xs text-[#25D366] font-mono mt-2 block">💬 {cc.telefono}</a>}
                    </div>
                  );
                })}
                {cuentasCtes.length===0&&<div className="col-span-3 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl">Sin cuentas corrientes</div>}
              </div>
            )}

            {/* Detalle cuenta corriente */}
            {ccActiva && (()=>{
              const cc=cuentasCtes.find(c=>c.id===ccActiva);
              if(!cc) return null;
              const movs=ccMovimientos.filter(m=>m.cuenta_corriente_id===ccActiva);
              return (
                <div>
                  <button onClick={()=>setCCActiva(null)} className="text-[#4B5563] hover:text-[#C9A227] font-mono text-sm mb-4">← Volver</button>
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/20 rounded-xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-lg font-bold text-[#E5E7EB] font-mono">{cc.nombre}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded font-mono ${cc.tipo==="proveedor"?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]"}`}>{cc.tipo}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono" style={{color:cc.saldo_ars>=0?"#4ADE80":"#F87171"}}>${Number(cc.saldo_ars).toLocaleString("es-AR")}</div>
                        {cc.saldo_usd!==0&&<div className="text-sm text-[#C9A227] font-mono">USD {cc.saldo_usd}</div>}
                      </div>
                    </div>
                    {/* Form movimiento CC */}
                    <div className="border-t border-[#C9A227]/10 pt-4 mt-3">
                      <h3 className="text-xs text-[#C9A227] font-mono font-bold mb-3">+ REGISTRAR MOVIMIENTO</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><label className={labelClass}>Tipo</label>
                          <select value={form.tipo_mov_cc??"factura"} onChange={e=>setForm({...form,tipo_mov_cc:e.target.value})} className={inputClass}>
                            <option value="factura">Factura / Deuda</option>
                            <option value="pago">Pago / Cobro</option>
                            <option value="nota_credito">Nota de crédito</option>
                          </select>
                        </div>
                        <div><label className={labelClass}>Moneda</label>
                          <select value={form.moneda_cc??"ARS"} onChange={e=>setForm({...form,moneda_cc:e.target.value})} className={inputClass}>
                            <option value="ARS">ARS</option><option value="USD">USD</option>
                          </select>
                        </div>
                        <div><label className={labelClass}>Monto</label><input type="number" value={form.monto_cc??""} onChange={e=>setForm({...form,monto_cc:e.target.value})} className={inputClass} placeholder="0"/></div>
                        <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha_cc??now.toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_cc:e.target.value})} className={inputClass}/></div>
                        <div className="md:col-span-2"><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion_cc??""} onChange={e=>setForm({...form,descripcion_cc:e.target.value})} className={inputClass} placeholder="Detalle"/></div>
                        <div><label className={labelClass}>Comprobante</label><input type="text" value={form.comprobante_cc??""} onChange={e=>setForm({...form,comprobante_cc:e.target.value})} className={inputClass} placeholder="Nro. factura"/></div>
                        <div><label className={labelClass}>Vencimiento</label><input type="date" value={form.vencimiento_cc??""} onChange={e=>setForm({...form,vencimiento_cc:e.target.value})} className={inputClass}/></div>
                      </div>
                      <button onClick={()=>registrarMovimientoCCte(ccActiva)} className="mt-3 bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Registrar</button>
                    </div>
                  </div>
                  {/* Historial */}
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#C9A227]/10"><span className="text-[#C9A227] text-xs font-mono font-bold">HISTORIAL DE MOVIMIENTOS</span></div>
                    {movs.length===0?<div className="text-center py-8 text-[#4B5563] font-mono text-sm">Sin movimientos</div>:(
                      <table className="w-full">
                        <thead><tr className="border-b border-[#C9A227]/10">{["Fecha","Tipo","Descripción","Moneda","Monto","Saldo","Estado",""].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                        <tbody>{movs.map(m=>(
                          <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.fecha}</td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo==="factura"?"bg-[#F87171]/10 text-[#F87171]":m.tipo==="pago"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#60A5FA]/10 text-[#60A5FA]"}`}>{m.tipo}</span></td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{m.descripcion}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.moneda}</td>
                            <td className="px-4 py-3 text-sm font-bold text-[#C9A227] font-mono">{Number(m.monto).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3 text-xs font-mono" style={{color:m.saldo_nuevo>=0?"#4ADE80":"#F87171"}}>{Number(m.saldo_nuevo).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${m.estado==="pagado"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#C9A227]/10 text-[#C9A227]"}`}>{m.estado}</span></td>
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
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#C9A227] font-mono text-sm">Total: <strong>${totalBancos.toLocaleString("es-AR")}</strong> ARS</span>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_banco:"cuenta_corriente",moneda_banco:"ARS"});}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">
                + Nueva Cuenta
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass} placeholder="Ej: Banco Nación CC"/></div>
                  <div><label className={labelClass}>Banco / Entidad</label><input type="text" value={form.banco??""} onChange={e=>setForm({...form,banco:e.target.value})} className={inputClass} placeholder="Ej: Banco Nación"/></div>
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_banco??"cuenta_corriente"} onChange={e=>setForm({...form,tipo_banco:e.target.value})} className={inputClass}>
                      <option value="caja">Caja</option><option value="cuenta_corriente">Cuenta Corriente</option>
                      <option value="caja_ahorro">Caja de Ahorro</option><option value="inversion">Inversión</option>
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
                  <button onClick={guardarBanco} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bancos.map(b=>(
                <div key={b.id} className="card-fin bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div><div className="font-bold text-[#E5E7EB] font-mono">{b.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{b.banco} · {b.tipo?.replace("_"," ")} · {b.moneda}</div></div>
                    <button onClick={()=>eliminar("finanzas_bancos",b.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{color:b.saldo>=0?"#4ADE80":"#F87171"}}>${Number(b.saldo).toLocaleString("es-AR")}</div>
                  {b.moneda==="ARS"&&<div className="text-xs text-[#4B5563] font-mono mt-1">≈ USD {(b.saldo/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>}
                </div>
              ))}
              {bancos.length===0&&<div className="col-span-3 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl">Sin cuentas registradas</div>}
            </div>
          </div>
        )}

        {/* ===== CHEQUES ===== */}
        {tab==="cheques" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-[#60A5FA]">Cartera: <strong>${chequesCartera.toLocaleString("es-AR")}</strong></span>
                <span className="text-[#F87171]">Emitidos: <strong>${cheques.filter(c=>c.tipo==="emitido"&&c.estado==="cartera").reduce((a,c)=>a+c.monto,0).toLocaleString("es-AR")}</strong></span>
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_cheque:"recibido",subtipo:"fisico"});}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">
                + Nuevo Cheque
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
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
                  <div><label className={labelClass}>Tercero</label><input type="text" value={form.tercero??""} onChange={e=>setForm({...form,tercero:e.target.value})} className={inputClass} placeholder="Empresa / Persona"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCheque} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {cheques.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin cheques</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">{["Tipo","Subtipo","Número","Banco","Monto","F.Cobro","Tercero","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{cheques.map(c=>{
                      const dias=c.fecha_cobro?Math.round((new Date(c.fecha_cobro).getTime()-Date.now())/(1000*60*60*24)):null;
                      return (
                        <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${c.tipo==="recibido"?"bg-[#60A5FA]/10 text-[#60A5FA]":"bg-[#F87171]/10 text-[#F87171]"}`}>{c.tipo}</span></td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.subtipo}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.numero}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.banco}</td>
                          <td className="px-4 py-3 text-sm font-bold text-[#C9A227] font-mono">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{color:dias!==null&&dias<=7?"#F87171":"#9CA3AF"}}>{c.fecha_cobro}{dias!==null&&dias<=7&&` ⚠️${dias}d`}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.tercero}</td>
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
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({lote_id:""});}}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm hover:bg-[#00FF80]/20 transition-all">
                + Cargar / Editar Margen
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">MARGEN POR LOTE — <span className="text-[#C9A227]">USD usado: ${usdUsado}</span></h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="md:col-span-3"><label className={labelClass}>Lote</label>
                    <select value={form.lote_id??""} onChange={e=>setForm({...form,lote_id:e.target.value})} className={inputClass}>
                      <option value="">Seleccionar lote</option>
                      {lotes.map(l=><option key={l.id} value={l.id}>{l.nombre} · {l.cultivo} · {l.hectareas}ha</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Ingreso total ARS</label><input type="number" value={form.ingreso_ars??""} onChange={e=>setForm({...form,ingreso_ars:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Costos directos ARS</label><input type="number" value={form.costo_directo_ars??""} onChange={e=>setForm({...form,costo_directo_ars:e.target.value})} className={inputClass} placeholder="Semillas, fertilizantes, fitosanitarios"/></div>
                  <div><label className={labelClass}>Costos indirectos ARS</label><input type="number" value={form.costo_indirecto_ars??""} onChange={e=>setForm({...form,costo_indirecto_ars:e.target.value})} className={inputClass} placeholder="Maquinaria, mano de obra, estructura"/></div>
                </div>
                {/* Preview margen */}
                {form.ingreso_ars && (
                  <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-xl grid grid-cols-3 gap-3 text-xs font-mono">
                    {[
                      {label:"MB ARS",value:(Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)).toLocaleString("es-AR"),color:"#4ADE80"},
                      {label:"MN ARS",value:(Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0)).toLocaleString("es-AR"),color:"#C9A227"},
                      {label:"MN USD",value:((Number(form.ingreso_ars)-Number(form.costo_directo_ars??0)-Number(form.costo_indirecto_ars??0))/usdUsado).toLocaleString("es-AR",{maximumFractionDigits:0}),color:"#60A5FA"},
                    ].map(s=><div key={s.label} className="text-center"><div className="text-[#4B5563]">{s.label}</div><div className="font-bold text-lg" style={{color:s.color}}>${s.value}</div></div>)}
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMargen} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {margenes.length===0?(
              <div className="text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl">Sin márgenes cargados</div>
            ):(
              <div className="space-y-3">
                {/* Totales */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    {label:"MB TOTAL ARS",value:margenes.reduce((a,m)=>a+m.margen_bruto_ars,0),color:"#4ADE80"},
                    {label:"MN TOTAL ARS",value:margenes.reduce((a,m)=>a+m.margen_neto_ars,0),color:"#C9A227"},
                    {label:"MN TOTAL USD",value:margenes.reduce((a,m)=>a+m.margen_neto_usd,0),color:"#60A5FA"},
                  ].map(s=>(
                    <div key={s.label} className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4 text-center">
                      <div className="text-xs text-[#4B5563] font-mono">{s.label}</div>
                      <div className="text-2xl font-bold font-mono mt-1" style={{color:s.value>=0?s.color:"#F87171"}}>${s.value.toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
                    </div>
                  ))}
                </div>
                {margenes.map(m=>{
                  const lote=lotes.find(l=>l.id===m.lote_id);
                  const mbPorHa=m.hectareas>0?m.margen_bruto_ars/m.hectareas:0;
                  const mnPorHa=m.hectareas>0?m.margen_neto_ars/m.hectareas:0;
                  return (
                    <div key={m.id} className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                          <div className="font-bold text-[#E5E7EB] font-mono text-lg">{lote?.nombre??m.lote_id}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{m.cultivo?.toUpperCase()} · {m.hectareas} Ha</div>
                        </div>
                        <button onClick={()=>eliminar("finanzas_margen_lote",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs font-mono">✕</button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                        {[
                          {label:"INGRESO",value:m.ingreso_ars,color:"#E5E7EB"},
                          {label:"COSTO DIRECTO",value:m.costo_directo_ars,color:"#F87171"},
                          {label:"COSTO INDIRECTO",value:m.costo_indirecto_ars,color:"#F87171"},
                          {label:"MB ARS",value:m.margen_bruto_ars,color:m.margen_bruto_ars>=0?"#4ADE80":"#F87171"},
                          {label:"MN ARS",value:m.margen_neto_ars,color:m.margen_neto_ars>=0?"#C9A227":"#F87171"},
                          {label:"MN USD",value:m.margen_neto_usd,color:m.margen_neto_usd>=0?"#60A5FA":"#F87171"},
                          {label:"MB/Ha ARS",value:mbPorHa,color:"#4ADE80"},
                          {label:"MN/Ha ARS",value:mnPorHa,color:"#C9A227"},
                        ].map(s=>(
                          <div key={s.label} className="bg-[#020810]/40 rounded-lg p-2 text-center">
                            <div className="text-[#4B5563] mb-1">{s.label}</div>
                            <div className="font-bold" style={{color:s.color}}>${Number(s.value).toLocaleString("es-AR",{maximumFractionDigits:0})}</div>
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
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_imp:"IVA"});}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">
                + Nuevo Impuesto
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
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
                  <button onClick={guardarImpuesto} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {/* Resumen IVA */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {label:"CRÉDITO FISCAL",value:impuestos.reduce((a,i)=>a+i.credito_fiscal,0),color:"#4ADE80"},
                {label:"DÉBITO FISCAL",value:impuestos.reduce((a,i)=>a+i.debito_fiscal,0),color:"#F87171"},
                {label:"POSICIÓN IVA",value:impuestos.reduce((a,i)=>a+i.debito_fiscal,0)-impuestos.reduce((a,i)=>a+i.credito_fiscal,0),color:"#C9A227"},
              ].map(s=>(
                <div key={s.label} className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-3 text-center">
                  <div className="text-xs text-[#4B5563] font-mono">{s.label}</div>
                  <div className="text-xl font-bold font-mono mt-1" style={{color:s.color}}>${s.value.toLocaleString("es-AR")}</div>
                </div>
              ))}
            </div>
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {impuestos.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin impuestos registrados</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["Tipo","Período","Descripción","Monto","Crédito","Débito","Vencimiento","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{impuestos.map(i=>{
                    const dias=i.fecha_vencimiento?Math.round((new Date(i.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)):null;
                    const urgente=dias!==null&&dias<=7&&i.estado==="pendiente";
                    return (
                      <tr key={i.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                        <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{i.tipo}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{i.periodo}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{i.descripcion}</td>
                        <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${Number(i.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-xs text-[#4ADE80] font-mono">{i.credito_fiscal>0?`$${Number(i.credito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#F87171] font-mono">{i.debito_fiscal>0?`$${Number(i.debito_fiscal).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{color:urgente?"#F87171":"#9CA3AF"}}>{i.fecha_vencimiento}{urgente&&` ⚠️`}</td>
                        <td className="px-4 py-3">
                          {i.estado==="pendiente"?(
                            <button onClick={()=>pagarImpuesto(i.id)} className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/20 px-2 py-1 rounded font-mono hover:bg-[#C9A227]/20">Marcar pagado</button>
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

      <p className="relative z-10 text-center text-[#0a1a08] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · FINANZAS PRO</p>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} className="btn-float fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#C9A227]/30" title="Asesor Financiero IA">
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#C9A227]/30 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A227]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#C9A227] animate-pulse"/><span className="text-[#C9A227] text-xs font-mono font-bold">ASESOR FINANCIERO IA</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} className="text-[#4B5563] text-sm">✕</button>
          </div>
          <div className="p-3 max-h-52 overflow-y-auto">
            {!aiMsg&&!aiLoading&&(
              <div className="space-y-1">
                {["Analizá mi situación financiera","Liquidez para próximos 30 días","Optimización de gastos","Posición IVA del mes"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#C9A227] border border-[#C9A227]/10 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p className="text-[#C9A227] text-xs font-mono animate-pulse">Analizando finanzas...</p>}
            {aiMsg&&<p className="text-[#9CA3AF] text-xs font-mono leading-relaxed whitespace-pre-wrap">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre finanzas..." className="flex-1 bg-[#020810]/80 border border-[#C9A227]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#C9A227]"/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="px-3 py-2 rounded-lg bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

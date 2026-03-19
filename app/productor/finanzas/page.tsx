"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "general" | "bancos" | "cheques" | "cuentas_ctes" | "movimientos" | "impuestos";

type Banco = { id: string; nombre: string; banco: string; tipo: string; saldo: number; moneda: string; };
type Movimiento = { id: string; tipo: string; categoria: string; descripcion: string; monto: number; fecha: string; comprobante: string; metodo_carga: string; cuenta_id: string; };
type Cheque = { id: string; tipo: string; subtipo: string; numero: string; banco: string; monto: number; fecha_emision: string; fecha_cobro: string; estado: string; tercero: string; observaciones: string; };
type CuentaCte = { id: string; tipo: string; nombre: string; saldo: number; limite_credito: number; };
type Impuesto = { id: string; tipo: string; descripcion: string; monto: number; fecha_vencimiento: string; estado: string; };

const CATEGORIAS_INGRESO = ["Venta de granos","Venta de hacienda","Servicios","Alquileres cobrados","Subsidios","Otros ingresos"];
const CATEGORIAS_EGRESO = ["Insumos","Semillas","Fertilizantes","Agroquímicos","Combustible","Maquinaria","Mano de obra","Sueldos","Alquiler campo","Honorarios","Impuestos","Fletes","Seguros","Mantenimiento","Servicios","Otros gastos"];

export default function FinanzasPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [cuentasCtes, setCuentasCtes] = useState<CuentaCte[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [filterTipo, setFilterTipo] = useState<"todos"|"ingreso"|"egreso">("todos");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id, nombre").eq("auth_id", user.id).single();
    if (!u) return;
    setNombreUsuario(u.nombre);
    const { data: emp } = await sb.from("empresas").select("id, nombre").eq("propietario_id", u.id).single();
    if (!emp) return;
    setEmpresaId(emp.id);
    setNombreEmpresa(emp.nombre);
    await fetchAll(emp.id);
    setLoading(false);
  };

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const [b, m, ch, cc, imp] = await Promise.all([
      sb.from("finanzas_bancos").select("*").eq("empresa_id", eid).order("nombre"),
      sb.from("finanzas_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(100),
      sb.from("finanzas_cheques").select("*").eq("empresa_id", eid).order("fecha_cobro"),
      sb.from("finanzas_cuentas_ctes").select("*").eq("empresa_id", eid).order("nombre"),
      sb.from("finanzas_impuestos").select("*").eq("empresa_id", eid).order("fecha_vencimiento"),
    ]);
    setBancos(b.data ?? []);
    setMovimientos(m.data ?? []);
    setCheques(ch.data ?? []);
    setCuentasCtes(cc.data ?? []);
    setImpuestos(imp.data ?? []);
  };

  // Stats calculados
  const totalBancos = bancos.reduce((a, b) => a + (b.saldo ?? 0), 0);
  const ingresosMes = movimientos.filter(m => {
    const d = new Date(m.fecha);
    const now = new Date();
    return m.tipo === "ingreso" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((a, m) => a + (m.monto ?? 0), 0);
  const egresosMes = movimientos.filter(m => {
    const d = new Date(m.fecha);
    const now = new Date();
    return m.tipo === "egreso" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((a, m) => a + (m.monto ?? 0), 0);
  const flujoNeto = ingresosMes - egresosMes;
  const chequesCartera = cheques.filter(c => c.estado === "cartera" && c.tipo === "recibido").reduce((a, c) => a + (c.monto ?? 0), 0);
  const pagosPendientes = cheques.filter(c => c.estado === "cartera" && c.tipo === "emitido").reduce((a, c) => a + (c.monto ?? 0), 0);
  const cobrosARecibir = cuentasCtes.filter(c => c.tipo === "cliente" && c.saldo > 0).reduce((a, c) => a + (c.saldo ?? 0), 0);
  const impuestosVencen30 = impuestos.filter(i => {
    const d = new Date(i.fecha_vencimiento);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return i.estado === "pendiente" && diff >= 0 && diff <= 30;
  }).reduce((a, i) => a + (i.monto ?? 0), 0);

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asesor financiero agropecuario experto para AgroGestión Pro. Respondé en español, de forma práctica y concisa. Datos actuales: Liquidez bancaria $${totalBancos.toLocaleString("es-AR")}, Flujo neto del mes $${flujoNeto.toLocaleString("es-AR")}, Cheques en cartera $${chequesCartera.toLocaleString("es-AR")}, Cobros a recibir $${cobrosARecibir.toLocaleString("es-AR")}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const startVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Sin soporte de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      askAI(`El usuario dijo por voz: "${text}". Interpretá qué movimiento financiero quiere registrar (ingreso o egreso, monto, categoría, descripción) y respondé con los datos estructurados listos para cargar.`);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_movimientos").insert({
      empresa_id: empresaId,
      tipo: form.tipo ?? "egreso",
      categoria: form.categoria ?? "",
      descripcion: form.descripcion ?? "",
      monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      comprobante: form.comprobante ?? "",
      metodo_carga: "manual",
      cuenta_id: form.cuenta_id ?? null,
    });
    // Actualizar saldo de cuenta si hay cuenta seleccionada
    if (form.cuenta_id) {
      const banco = bancos.find(b => b.id === form.cuenta_id);
      if (banco) {
        const nuevoSaldo = form.tipo === "ingreso" ? banco.saldo + Number(form.monto) : banco.saldo - Number(form.monto);
        await sb.from("finanzas_bancos").update({ saldo: nuevoSaldo }).eq("id", form.cuenta_id);
      }
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarBanco = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_bancos").insert({
      empresa_id: empresaId, nombre: form.nombre, banco: form.banco ?? "",
      tipo: form.tipo_cuenta ?? "cuenta_corriente", saldo: Number(form.saldo ?? 0), moneda: "ARS",
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
      fecha_emision: form.fecha_emision ?? null, fecha_cobro: form.fecha_cobro ?? null,
      estado: "cartera", tercero: form.tercero ?? "", observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarCuentaCte = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_cuentas_ctes").insert({
      empresa_id: empresaId, tipo: form.tipo_cte ?? "proveedor",
      nombre: form.nombre ?? "", saldo: Number(form.saldo ?? 0),
      limite_credito: Number(form.limite_credito ?? 0),
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarImpuesto = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("finanzas_impuestos").insert({
      empresa_id: empresaId, tipo: form.tipo_imp ?? "",
      descripcion: form.descripcion ?? "", monto: Number(form.monto ?? 0),
      fecha_vencimiento: form.fecha_vencimiento ?? null, estado: "pendiente",
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const exportarCSV = () => {
    const headers = ["Fecha","Tipo","Categoría","Descripción","Monto","Comprobante"];
    const rows = movimientos.map(m => [m.fecha, m.tipo, m.categoria, m.descripcion, m.monto, m.comprobante]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "movimientos.csv"; a.click();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: "GENERAL" },
    { key: "bancos", label: "BANCOS" },
    { key: "cheques", label: "CHEQUES" },
    { key: "cuentas_ctes", label: "CTAS CTE" },
    { key: "movimientos", label: "MOVIMIENTOS" },
    { key: "impuestos", label: "IMPUESTOS" },
  ];

  const movsFiltrados = movimientos.filter(m => filterTipo === "todos" ? true : m.tipo === filterTipo);

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Finanzas PRO...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .tab-fin-active { border-color: #C9A227 !important; color: #C9A227 !important; background: rgba(201,162,39,0.08) !important; }
        .card-stat { transition: all 0.2s; }
        .card-stat:hover { border-color: rgba(201,162,39,0.4) !important; transform: translateY(-2px); }
      `}</style>

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/85" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <button onClick={() => window.location.href = "/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">← Dashboard</button>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono">{nombreUsuario}</div>
          <div className="text-xs text-[#4B5563] font-mono">PRODUCTOR</div>
        </div>
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-mono">
            <span className="text-[#E5E7EB]">Finanzas </span>
            <span className="text-[#C9A227]">PRO</span>
          </h1>
          <p className="text-[#4B5563] text-sm font-mono">Tesorería de <span className="text-[#E5E7EB] font-bold">{nombreEmpresa.toUpperCase()}</span></p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); setForm({}); }}
              className={`px-5 py-2 rounded-xl border border-[#C9A227]/15 text-sm font-mono whitespace-nowrap transition-all ${tab === t.key ? "tab-fin-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* IA Panel */}
        <div className="bg-[#0a1628]/60 border border-[#C9A227]/15 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#C9A227] animate-pulse" />
              <span className="text-[#C9A227] text-xs font-mono tracking-widest">◆ ASESOR FINANCIERO IA</span>
            </div>
            <div className="flex gap-2">
              <button onClick={startVoice}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10"}`}>
                🎤 {listening ? "Escuchando..." : "Cargar por Voz"}
              </button>
              <button onClick={exportarCSV} className="px-3 py-1.5 rounded-lg border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-xs transition-all">
                📊 Exportar
              </button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Analizá mi situación financiera actual","¿Cuál es mi liquidez para los próximos 30 días?","¿Qué gastos puedo optimizar?","Resumen de ingresos y egresos del mes"].map(q => (
              <button key={q} onClick={() => askAI(q)}
                className="text-xs text-[#4B6B5B] hover:text-[#C9A227] border border-[#C9A227]/10 hover:border-[#C9A227]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                {q}
              </button>
            ))}
          </div>
          {aiLoading && <p className="text-[#C9A227] text-xs font-mono mt-3 animate-pulse">▶ Analizando finanzas...</p>}
          {aiMsg && <div className="mt-3 p-3 bg-[#C9A227]/5 border border-[#C9A227]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
        </div>

        {/* ===== GENERAL ===== */}
        {tab === "general" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {[
                { label: "LIQUIDEZ INMEDIATA", value: totalBancos, color: "#00FF80", icon: "🏦", desc: "Saldo total en bancos y caja" },
                { label: "FLUJO NETO DEL MES", value: flujoNeto, color: flujoNeto >= 0 ? "#4ADE80" : "#F87171", icon: "📈", desc: `Ing. $${ingresosMes.toLocaleString("es-AR")} · Egr. $${egresosMes.toLocaleString("es-AR")}` },
                { label: "PATRIMONIO LÍQUIDO OPERATIVO", value: totalBancos + chequesCartera + cobrosARecibir, color: "#C9A227", icon: "💰", desc: "Bancos + cheques + cobros" },
              ].map(s => (
                <div key={s.label} className="card-stat bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5">
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-3">{s.label}</div>
                  <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>
                    ${s.value.toLocaleString("es-AR")}
                  </div>
                  <div className="text-xs text-[#4B5563] font-mono mt-2">{s.desc}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "CHEQUES CARTERA", value: chequesCartera, color: "#60A5FA", icon: "🏷️" },
                { label: "PAGOS PENDIENTES", value: pagosPendientes, color: "#F87171", icon: "⚠️" },
                { label: "COBROS A RECIBIR", value: cobrosARecibir, color: "#4ADE80", icon: "💵" },
                { label: "IMPUESTOS 30 DÍAS", value: impuestosVencen30, color: "#A78BFA", icon: "🗓️" },
              ].map(s => (
                <div key={s.label} className="card-stat bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono">{s.label}</div>
                    <span>{s.icon}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{ color: s.color }}>
                    ${s.value.toLocaleString("es-AR")}
                  </div>
                </div>
              ))}
            </div>
            {/* Últimos movimientos */}
            <div className="mt-6 bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#C9A227]/10 flex items-center justify-between">
                <span className="text-[#C9A227] text-sm font-mono font-bold">📋 ÚLTIMOS MOVIMIENTOS</span>
                <button onClick={() => setTab("movimientos")} className="text-xs text-[#4B5563] hover:text-[#C9A227] font-mono transition-colors">Ver todos →</button>
              </div>
              {movimientos.slice(0, 5).map(m => (
                <div key={m.id} className="px-5 py-3 border-b border-[#C9A227]/5 flex items-center justify-between hover:bg-[#C9A227]/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo === "ingreso" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{m.tipo}</span>
                    <div>
                      <div className="text-sm text-[#E5E7EB] font-mono">{m.descripcion}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{m.categoria} · {m.fecha}</div>
                    </div>
                  </div>
                  <div className="font-bold font-mono" style={{ color: m.tipo === "ingreso" ? "#4ADE80" : "#F87171" }}>
                    {m.tipo === "ingreso" ? "+" : "-"}${Number(m.monto).toLocaleString("es-AR")}
                  </div>
                </div>
              ))}
              {movimientos.length === 0 && <div className="text-center py-8 text-[#4B5563] font-mono text-sm">Sin movimientos registrados</div>}
            </div>
          </div>
        )}

        {/* ===== BANCOS ===== */}
        {tab === "bancos" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#C9A227] font-mono text-sm">Total: <strong>${totalBancos.toLocaleString("es-AR")}</strong></span>
              <button onClick={() => { setShowForm(!showForm); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nueva Cuenta
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ NUEVA CUENTA / CAJA</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} placeholder="Ej: Banco Nación CC" /></div>
                  <div><label className={labelClass}>Banco/Entidad</label><input type="text" value={form.banco ?? ""} onChange={e => setForm({...form, banco: e.target.value})} className={inputClass} placeholder="Ej: Banco Nación" /></div>
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cuenta ?? "cuenta_corriente"} onChange={e => setForm({...form, tipo_cuenta: e.target.value})} className={inputClass}>
                      <option value="caja">Caja</option>
                      <option value="cuenta_corriente">Cuenta Corriente</option>
                      <option value="caja_ahorro">Caja de Ahorro</option>
                      <option value="inversión">Inversión</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Saldo inicial</label><input type="number" value={form.saldo ?? ""} onChange={e => setForm({...form, saldo: e.target.value})} className={inputClass} placeholder="0" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarBanco} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bancos.map(b => (
                <div key={b.id} className="card-stat bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-[#E5E7EB] font-mono">{b.nombre}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{b.banco} · {b.tipo?.replace("_", " ")}</div>
                    </div>
                    <button onClick={() => eliminar("finanzas_bancos", b.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{ color: b.saldo >= 0 ? "#4ADE80" : "#F87171" }}>
                    ${Number(b.saldo).toLocaleString("es-AR")}
                  </div>
                  <div className="text-xs text-[#4B5563] font-mono mt-1">{b.moneda}</div>
                </div>
              ))}
              {bancos.length === 0 && <div className="col-span-3 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl">Sin cuentas registradas</div>}
            </div>
          </div>
        )}

        {/* ===== CHEQUES ===== */}
        {tab === "cheques" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-[#60A5FA]">En cartera: <strong>${chequesCartera.toLocaleString("es-AR")}</strong></span>
                <span className="text-[#F87171]">Emitidos: <strong>${pagosPendientes.toLocaleString("es-AR")}</strong></span>
              </div>
              <button onClick={() => { setShowForm(!showForm); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Cheque
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ NUEVO CHEQUE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cheque ?? "recibido"} onChange={e => setForm({...form, tipo_cheque: e.target.value})} className={inputClass}>
                      <option value="recibido">Recibido</option>
                      <option value="emitido">Emitido</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Subtipo</label>
                    <select value={form.subtipo ?? "fisico"} onChange={e => setForm({...form, subtipo: e.target.value})} className={inputClass}>
                      <option value="fisico">Físico</option>
                      <option value="electronico">Electrónico (ECheq)</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Número</label><input type="text" value={form.numero ?? ""} onChange={e => setForm({...form, numero: e.target.value})} className={inputClass} placeholder="Nro. cheque" /></div>
                  <div><label className={labelClass}>Banco</label><input type="text" value={form.banco_cheque ?? ""} onChange={e => setForm({...form, banco_cheque: e.target.value})} className={inputClass} placeholder="Ej: BBVA" /></div>
                  <div><label className={labelClass}>Monto</label><input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Fecha emisión</label><input type="date" value={form.fecha_emision ?? ""} onChange={e => setForm({...form, fecha_emision: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Fecha cobro</label><input type="date" value={form.fecha_cobro ?? ""} onChange={e => setForm({...form, fecha_cobro: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Tercero</label><input type="text" value={form.tercero ?? ""} onChange={e => setForm({...form, tercero: e.target.value})} className={inputClass} placeholder="Nombre empresa/persona" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCheque} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {cheques.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin cheques registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Tipo","Subtipo","Número","Banco","Monto","F.Cobro","Tercero","Estado",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {cheques.map(c => (
                      <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${c.tipo === "recibido" ? "bg-[#60A5FA]/10 text-[#60A5FA]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{c.tipo}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.subtipo}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.numero}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.banco}</td>
                        <td className="px-4 py-3 text-sm font-bold font-mono text-[#C9A227]">${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha_cobro}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.tercero}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">{c.estado}</span></td>
                        <td className="px-4 py-3"><button onClick={() => eliminar("finanzas_cheques", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== CUENTAS CORRIENTES ===== */}
        {tab === "cuentas_ctes" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(!showForm); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nueva Cuenta Cte
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ CUENTA CORRIENTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_cte ?? "proveedor"} onChange={e => setForm({...form, tipo_cte: e.target.value})} className={inputClass}>
                      <option value="proveedor">Proveedor</option>
                      <option value="cliente">Cliente</option>
                      <option value="empleado">Empleado</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} placeholder="Nombre/Empresa" /></div>
                  <div><label className={labelClass}>Saldo inicial</label><input type="number" value={form.saldo ?? ""} onChange={e => setForm({...form, saldo: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Límite crédito</label><input type="number" value={form.limite_credito ?? ""} onChange={e => setForm({...form, limite_credito: e.target.value})} className={inputClass} placeholder="0" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCuentaCte} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cuentasCtes.map(c => (
                <div key={c.id} className="card-stat bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-[#E5E7EB] font-mono">{c.nombre}</div>
                      <span className={`text-xs px-2 py-0.5 rounded font-mono mt-1 inline-block ${c.tipo === "proveedor" ? "bg-[#F87171]/10 text-[#F87171]" : c.tipo === "cliente" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#60A5FA]/10 text-[#60A5FA]"}`}>{c.tipo}</span>
                    </div>
                    <button onClick={() => eliminar("finanzas_cuentas_ctes", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                  </div>
                  <div className="text-2xl font-bold font-mono mt-3" style={{ color: c.saldo >= 0 ? "#4ADE80" : "#F87171" }}>
                    ${Number(c.saldo).toLocaleString("es-AR")}
                  </div>
                  {c.limite_credito > 0 && <div className="text-xs text-[#4B5563] font-mono mt-1">Límite: ${Number(c.limite_credito).toLocaleString("es-AR")}</div>}
                </div>
              ))}
              {cuentasCtes.length === 0 && <div className="col-span-3 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl">Sin cuentas corrientes</div>}
            </div>
          </div>
        )}

        {/* ===== MOVIMIENTOS ===== */}
        {tab === "movimientos" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-2">
                {(["todos","ingreso","egreso"] as const).map(f => (
                  <button key={f} onClick={() => setFilterTipo(f)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterTipo === f ? "border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowForm(!showForm); setForm({ tipo: "egreso", fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Movimiento
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR MOVIMIENTO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo ?? "egreso"} onChange={e => setForm({...form, tipo: e.target.value, categoria: ""})} className={inputClass}>
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria ?? ""} onChange={e => setForm({...form, categoria: e.target.value})} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {(form.tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({...form, descripcion: e.target.value})} className={inputClass} placeholder="Detalle del movimiento" /></div>
                  <div><label className={labelClass}>Monto</label><input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha ?? ""} onChange={e => setForm({...form, fecha: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Cuenta</label>
                    <select value={form.cuenta_id ?? ""} onChange={e => setForm({...form, cuenta_id: e.target.value})} className={inputClass}>
                      <option value="">Sin cuenta</option>
                      {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Comprobante / Factura</label><input type="text" value={form.comprobante ?? ""} onChange={e => setForm({...form, comprobante: e.target.value})} className={inputClass} placeholder="Nro. factura o comprobante" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMovimiento} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {movsFiltrados.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin movimientos</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Fecha","Tipo","Categoría","Descripción","Comprobante","Monto",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {movsFiltrados.map(m => (
                      <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.fecha}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo === "ingreso" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{m.tipo}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.categoria}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{m.descripcion}</td>
                        <td className="px-4 py-3 text-xs text-[#4B5563] font-mono">{m.comprobante}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{ color: m.tipo === "ingreso" ? "#4ADE80" : "#F87171" }}>
                          {m.tipo === "ingreso" ? "+" : "-"}${Number(m.monto).toLocaleString("es-AR")}
                        </td>
                        <td className="px-4 py-3"><button onClick={() => eliminar("finanzas_movimientos", m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== IMPUESTOS ===== */}
        {tab === "impuestos" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(!showForm); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Impuesto / Vencimiento
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ IMPUESTO / RETENCIÓN</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_imp ?? ""} onChange={e => setForm({...form, tipo_imp: e.target.value})} className={inputClass}>
                      <option value="">Seleccionar</option>
                      <option value="IVA">IVA</option>
                      <option value="Ganancias">Ganancias</option>
                      <option value="Bienes Personales">Bienes Personales</option>
                      <option value="Ingresos Brutos">Ingresos Brutos</option>
                      <option value="Retención AFIP">Retención AFIP</option>
                      <option value="Monotributo">Monotributo</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({...form, descripcion: e.target.value})} className={inputClass} placeholder="Detalle" /></div>
                  <div><label className={labelClass}>Monto</label><input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Fecha vencimiento</label><input type="date" value={form.fecha_vencimiento ?? ""} onChange={e => setForm({...form, fecha_vencimiento: e.target.value})} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarImpuesto} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {impuestos.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin impuestos registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Tipo","Descripción","Monto","Vencimiento","Estado",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {impuestos.map(i => {
                      const vence = new Date(i.fecha_vencimiento);
                      const diff = (vence.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                      const urgente = diff >= 0 && diff <= 7;
                      return (
                        <tr key={i.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                          <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{i.tipo}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{i.descripcion}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">${Number(i.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: urgente ? "#F87171" : "#9CA3AF" }}>
                            {i.fecha_vencimiento} {urgente && "⚠️"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${i.estado === "pagado" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : i.estado === "vencido" ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#C9A227]/10 text-[#C9A227]"}`}>{i.estado}</span>
                          </td>
                          <td className="px-4 py-3"><button onClick={() => eliminar("finanzas_impuestos", i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono">
        © AGROGESTION PRO · SISTEMA UNIFICADO DE CONTROL AGROPECUARIO
      </p>

      {empresaId && <EscanerIA empresaId={empresaId} />}

    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Maquina = {
  id: string; nombre: string; tipo: string; marca: string; modelo: string;
  año: number; estado: string; horas_uso: number; proximo_service: number;
  seguro_vencimiento: string; seguro_compania: string; vtv_vencimiento: string;
  patente: string; valor_compra: number; observaciones: string;
};
type Reparacion = {
  id: string; tipo: string; descripcion: string; costo: number;
  taller: string; fecha: string; horas_en_reparacion: number;
};
type Alerta = { tipo: string; mensaje: string; urgencia: "alta"|"media"|"baja"; maquina: string; };

const TIPOS = ["tractor","cosechadora","pulverizadora","sembradora","implemento","vehiculo","otro"];
const TIPO_ICONS: Record<string,string> = {
  tractor:"🚜", cosechadora:"🌾", pulverizadora:"💧", sembradora:"🌱",
  implemento:"🔧", vehiculo:"🚗", otro:"⚙️"
};
const ESTADO_COLORS: Record<string,string> = {
  activo:"#4ADE80", taller:"#F87171", baja:"#4B5563"
};

export default function MaquinariaPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [seleccionada, setSeleccionada] = useState<Maquina|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFormRep, setShowFormRep] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<string>("todos");

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
    if (!emp) return;
    setEmpresaId(emp.id);
    await fetchMaquinas(emp.id);
    setLoading(false);
  };

  const fetchMaquinas = async (eid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria").select("*").eq("empresa_id", eid).order("nombre");
    setMaquinas(data ?? []);
    calcularAlertas(data ?? []);
  };

  const fetchReparaciones = async (mid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria_reparaciones").select("*").eq("maquina_id", mid).order("fecha", { ascending: false });
    setReparaciones(data ?? []);
  };

  const calcularAlertas = (lista: Maquina[]) => {
    const hoy = new Date();
    const alerts: Alerta[] = [];
    lista.forEach(m => {
      // Seguro
      if (m.seguro_vencimiento) {
        const d = new Date(m.seguro_vencimiento);
        const diff = (d.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ tipo: "seguro", mensaje: `Seguro VENCIDO`, urgencia: "alta", maquina: m.nombre });
        else if (diff <= 30) alerts.push({ tipo: "seguro", mensaje: `Seguro vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media", maquina: m.nombre });
      }
      // VTV
      if (m.vtv_vencimiento) {
        const d = new Date(m.vtv_vencimiento);
        const diff = (d.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ tipo: "vtv", mensaje: `VTV VENCIDA`, urgencia: "alta", maquina: m.nombre });
        else if (diff <= 30) alerts.push({ tipo: "vtv", mensaje: `VTV vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media", maquina: m.nombre });
      }
      // Service por horas
      if (m.proximo_service > 0 && m.horas_uso > 0) {
        const restantes = m.proximo_service - m.horas_uso;
        if (restantes <= 0) alerts.push({ tipo: "service", mensaje: `Service VENCIDO por horas`, urgencia: "alta", maquina: m.nombre });
        else if (restantes <= 50) alerts.push({ tipo: "service", mensaje: `Service en ${Math.round(restantes)} hs`, urgencia: restantes <= 20 ? "alta" : "media", maquina: m.nombre });
      }
      // Estado taller
      if (m.estado === "taller") alerts.push({ tipo: "taller", mensaje: `En taller`, urgencia: "media", maquina: m.nombre });
    });
    setAlertas(alerts);
  };

  const guardarMaquina = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const data = {
      empresa_id: empresaId,
      nombre: form.nombre, tipo: form.tipo ?? "tractor",
      marca: form.marca ?? "", modelo: form.modelo ?? "",
      año: Number(form.año ?? 0), estado: form.estado ?? "activo",
      horas_uso: Number(form.horas_uso ?? 0),
      proximo_service: Number(form.proximo_service ?? 0),
      seguro_vencimiento: form.seguro_vencimiento || null,
      seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null,
      patente: form.patente ?? "",
      valor_compra: Number(form.valor_compra ?? 0),
      observaciones: form.observaciones ?? "",
    };
    if (seleccionada && showForm) {
      await sb.from("maquinaria").update(data).eq("id", seleccionada.id);
    } else {
      await sb.from("maquinaria").insert(data);
    }
    await fetchMaquinas(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarReparacion = async () => {
    if (!seleccionada || !empresaId) return;
    const sb = await getSB();
    await sb.from("maquinaria_reparaciones").insert({
      maquina_id: seleccionada.id, empresa_id: empresaId,
      tipo: form.tipo_rep ?? "reparacion",
      descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0),
      taller: form.taller ?? "",
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      horas_en_reparacion: Number(form.horas_en_reparacion ?? 0),
    });
    await fetchReparaciones(seleccionada.id);
    setShowFormRep(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (tabla === "maquinaria") {
      if (empresaId) await fetchMaquinas(empresaId);
      setSeleccionada(null);
    } else {
      if (seleccionada) await fetchReparaciones(seleccionada.id);
    }
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un experto en gestión de maquinaria agrícola para AgroGestión Pro. Respondé en español, de forma práctica. Parque de máquinas: ${maquinas.map(m => `${m.nombre} (${m.tipo}, ${m.horas_uso}hs, estado: ${m.estado})`).join(", ")}. Alertas activas: ${alertas.length}. ${prompt}` }]
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
      askAI(`El usuario dijo por voz: "${text}". Interpretá qué quiere registrar o consultar sobre maquinaria y respondé apropiadamente.`);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const maquinasFiltradas = maquinas.filter(m => filterEstado === "todos" ? true : m.estado === filterEstado);
  const costoTotal = reparaciones.reduce((a, r) => a + (r.costo ?? 0), 0);

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Maquinaria...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .maq-card:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .maq-card { transition: all 0.2s ease; }
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
        <button onClick={() => seleccionada ? setSeleccionada(null) : window.location.href = "/productor/dashboard"}
          className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
          ← {seleccionada ? "Volver" : "Dashboard"}
        </button>
        <div className="flex-1" />
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* ===== DETALLE MÁQUINA ===== */}
        {seleccionada ? (
          <div>
            <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{TIPO_ICONS[seleccionada.tipo] ?? "⚙️"}</span>
                <div>
                  <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">{seleccionada.nombre}</h1>
                  <p className="text-[#00FF80] text-xs font-mono tracking-widest">
                    {seleccionada.marca} {seleccionada.modelo} · {seleccionada.año} · {seleccionada.patente}
                  </p>
                  <span className="text-xs px-3 py-1 rounded-full font-mono border mt-1 inline-block"
                    style={{ color: ESTADO_COLORS[seleccionada.estado], borderColor: ESTADO_COLORS[seleccionada.estado], background: ESTADO_COLORS[seleccionada.estado] + "15" }}>
                    {seleccionada.estado.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={startVoice}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                  🎤 {listening ? "Escuchando..." : "Voz"}
                </button>
                <button onClick={() => { setShowFormRep(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                  + Reparación / Service
                </button>
                <button onClick={() => { setShowForm(true); setForm(Object.fromEntries(Object.entries(seleccionada).map(([k,v])=>[k,String(v??"")]))); }}
                  className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-sm transition-all">
                  ✏️ Editar
                </button>
                <button onClick={() => eliminar("maquinaria", seleccionada.id)}
                  className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 font-mono text-sm transition-all">
                  🗑️ Eliminar
                </button>
              </div>
            </div>

            {/* Stats máquina */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Horas de uso", value: `${seleccionada.horas_uso} hs`, color: "#00FF80" },
                { label: "Próximo service", value: seleccionada.proximo_service ? `${seleccionada.proximo_service} hs` : "—", color: "#C9A227" },
                { label: "Seguro", value: seleccionada.seguro_vencimiento || "—", color: seleccionada.seguro_vencimiento && new Date(seleccionada.seguro_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                { label: "VTV", value: seleccionada.vtv_vencimiento || "—", color: seleccionada.vtv_vencimiento && new Date(seleccionada.vtv_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                { label: "Valor de compra", value: seleccionada.valor_compra ? `$${Number(seleccionada.valor_compra).toLocaleString("es-AR")}` : "—", color: "#60A5FA" },
                { label: "Costo reparaciones", value: `$${costoTotal.toLocaleString("es-AR")}`, color: "#F87171" },
                { label: "Seguro / Compañía", value: seleccionada.seguro_compania || "—", color: "#9CA3AF" },
                { label: "Observaciones", value: seleccionada.observaciones || "—", color: "#9CA3AF" },
              ].map(d => (
                <div key={d.label} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-xl p-4">
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-1">{d.label}</div>
                  <div className="text-sm font-mono font-bold" style={{ color: d.color }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* IA */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
                <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ ASISTENTE IA — MAQUINARIA</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  `¿Cuándo debería hacerle el próximo service a ${seleccionada.nombre}?`,
                  "¿Cuál es el costo operativo estimado por hora?",
                  "¿Qué mantenimiento preventivo recomendás?",
                ].map(q => (
                  <button key={q} onClick={() => askAI(q)}
                    className="text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                    {q}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-[#00FF80] text-xs font-mono mt-3 animate-pulse">▶ Analizando...</p>}
              {aiMsg && <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
            </div>

            {/* Form reparación */}
            {showFormRep && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR REPARACIÓN / SERVICE</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_rep ?? "reparacion"} onChange={e => setForm({...form, tipo_rep: e.target.value})} className={inputClass}>
                      <option value="service">Service</option>
                      <option value="reparacion">Reparación</option>
                      <option value="preventivo">Mantenimiento preventivo</option>
                      <option value="accidente">Accidente</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion ?? ""} onChange={e => setForm({...form, descripcion: e.target.value})} className={inputClass} placeholder="Ej: Cambio de aceite y filtros" />
                  </div>
                  <div><label className={labelClass}>Taller / Proveedor</label>
                    <input type="text" value={form.taller ?? ""} onChange={e => setForm({...form, taller: e.target.value})} className={inputClass} placeholder="Nombre del taller" />
                  </div>
                  <div><label className={labelClass}>Costo</label>
                    <input type="number" value={form.costo ?? ""} onChange={e => setForm({...form, costo: e.target.value})} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({...form, fecha: e.target.value})} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Horas en reparación</label>
                    <input type="number" value={form.horas_en_reparacion ?? ""} onChange={e => setForm({...form, horas_en_reparacion: e.target.value})} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarReparacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => setShowFormRep(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Historial reparaciones */}
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between">
                <span className="text-[#00FF80] text-sm font-mono font-bold">🔧 HISTORIAL DE REPARACIONES</span>
                <span className="text-xs text-[#C9A227] font-mono">Total: ${costoTotal.toLocaleString("es-AR")}</span>
              </div>
              {reparaciones.length === 0 ? (
                <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin reparaciones registradas</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#00FF80]/10">
                    {["Fecha","Tipo","Descripción","Taller","Horas","Costo",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {reparaciones.map(r => (
                      <tr key={r.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.fecha}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{r.tipo}</span></td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{r.descripcion}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.taller}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.horas_en_reparacion} hs</td>
                        <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(r.costo).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3"><button onClick={() => eliminar("maquinaria_reparaciones", r.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        ) : (
          /* ===== LISTA DE MÁQUINAS ===== */
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">⚙️ MAQUINARIA</h1>
                <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ GESTIÓN DE EQUIPOS Y FLOTA</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={startVoice}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                  🎤 {listening ? "Escuchando..." : "Consultar por Voz"}
                </button>
                <button onClick={() => { setShowForm(true); setForm({}); setSeleccionada(null); }}
                  className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                  + Nueva Máquina
                </button>
              </div>
            </div>

            {/* Alertas */}
            {alertas.length > 0 && (
              <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
                  <span className="text-[#F87171] text-xs font-mono tracking-widest font-bold">⚠️ ALERTAS DE MAQUINARIA ({alertas.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {alertas.map((a, i) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${a.urgencia === "alta" ? "border-[#F87171]/30 bg-[#F87171]/5" : "border-[#C9A227]/30 bg-[#C9A227]/5"}`}>
                      <span className="text-sm">{a.urgencia === "alta" ? "🔴" : "🟡"}</span>
                      <div>
                        <div className="text-xs font-bold font-mono" style={{ color: a.urgencia === "alta" ? "#F87171" : "#C9A227" }}>{a.maquina}</div>
                        <div className="text-xs text-[#9CA3AF] font-mono">{a.mensaje}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats generales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Equipos", value: String(maquinas.length), color: "#00FF80" },
                { label: "Activos", value: String(maquinas.filter(m => m.estado === "activo").length), color: "#4ADE80" },
                { label: "En Taller", value: String(maquinas.filter(m => m.estado === "taller").length), color: "#F87171" },
                { label: "Alertas", value: String(alertas.length), color: alertas.length > 0 ? "#F87171" : "#4ADE80" },
              ].map(s => (
                <div key={s.label} className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* IA */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
                <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ ASISTENTE IA — FLOTA</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {["Estado general de la flota","¿Qué equipos necesitan atención urgente?","Plan de mantenimiento preventivo","Costos operativos del mes"].map(q => (
                  <button key={q} onClick={() => askAI(q)}
                    className="text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                    {q}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-[#00FF80] text-xs font-mono mt-3 animate-pulse">▶ Analizando flota...</p>}
              {aiMsg && <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-4">
              {["todos","activo","taller","baja"].map(f => (
                <button key={f} onClick={() => setFilterEstado(f)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterEstado === f ? "border-[#00FF80] text-[#00FF80] bg-[#00FF80]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Form nueva máquina */}
            {showForm && !seleccionada && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVA MÁQUINA / VEHÍCULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} placeholder="Ej: John Deere 6110J" /></div>
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo ?? "tractor"} onChange={e => setForm({...form, tipo: e.target.value})} className={inputClass}>
                      {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Marca</label><input type="text" value={form.marca ?? ""} onChange={e => setForm({...form, marca: e.target.value})} className={inputClass} placeholder="Ej: John Deere" /></div>
                  <div><label className={labelClass}>Modelo</label><input type="text" value={form.modelo ?? ""} onChange={e => setForm({...form, modelo: e.target.value})} className={inputClass} placeholder="Ej: 6110J" /></div>
                  <div><label className={labelClass}>Año</label><input type="number" value={form.año ?? ""} onChange={e => setForm({...form, año: e.target.value})} className={inputClass} placeholder="2020" /></div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "activo"} onChange={e => setForm({...form, estado: e.target.value})} className={inputClass}>
                      <option value="activo">Activo</option>
                      <option value="taller">En Taller</option>
                      <option value="baja">Baja</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Horas de uso</label><input type="number" value={form.horas_uso ?? ""} onChange={e => setForm({...form, horas_uso: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Próximo service (hs)</label><input type="number" value={form.proximo_service ?? ""} onChange={e => setForm({...form, proximo_service: e.target.value})} className={inputClass} placeholder="Ej: 500" /></div>
                  <div><label className={labelClass}>Venc. seguro</label><input type="date" value={form.seguro_vencimiento ?? ""} onChange={e => setForm({...form, seguro_vencimiento: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Compañía seguro</label><input type="text" value={form.seguro_compania ?? ""} onChange={e => setForm({...form, seguro_compania: e.target.value})} className={inputClass} placeholder="Ej: Federación Patronal" /></div>
                  <div><label className={labelClass}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento ?? ""} onChange={e => setForm({...form, vtv_vencimiento: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Patente</label><input type="text" value={form.patente ?? ""} onChange={e => setForm({...form, patente: e.target.value})} className={inputClass} placeholder="Ej: AB123CD" /></div>
                  <div><label className={labelClass}>Valor de compra</label><input type="number" value={form.valor_compra ?? ""} onChange={e => setForm({...form, valor_compra: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} placeholder="Notas adicionales" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMaquina} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Grid máquinas */}
            {maquinasFiltradas.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">⚙️</div>
                <p className="text-[#4B5563] font-mono">No hay equipos registrados</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {maquinasFiltradas.map(m => {
                  const alertasMaq = alertas.filter(a => a.maquina === m.nombre);
                  return (
                    <div key={m.id} className="maq-card bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 cursor-pointer"
                      onClick={() => { setSeleccionada(m); fetchReparaciones(m.id); }}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{TIPO_ICONS[m.tipo] ?? "⚙️"}</span>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono">{m.nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{m.marca} {m.modelo} · {m.año}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-mono border"
                            style={{ color: ESTADO_COLORS[m.estado], borderColor: ESTADO_COLORS[m.estado], background: ESTADO_COLORS[m.estado] + "15" }}>
                            {m.estado}
                          </span>
                          {alertasMaq.length > 0 && (
                            <span className="text-xs bg-[#F87171]/10 text-[#F87171] px-2 py-0.5 rounded font-mono">
                              ⚠️ {alertasMaq.length} alerta{alertasMaq.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#020810]/60 rounded-lg p-3">
                          <div className="text-xs text-[#4B5563] font-mono">Horas</div>
                          <div className="text-lg font-bold text-[#00FF80] font-mono">{m.horas_uso} hs</div>
                        </div>
                        <div className="bg-[#020810]/60 rounded-lg p-3">
                          <div className="text-xs text-[#4B5563] font-mono">Próx. service</div>
                          <div className="text-lg font-bold text-[#C9A227] font-mono">{m.proximo_service ? `${m.proximo_service} hs` : "—"}</div>
                        </div>
                      </div>
                      {m.patente && <div className="text-xs text-[#4B5563] font-mono mt-3">🔖 {m.patente}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

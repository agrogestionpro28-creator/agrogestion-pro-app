"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Seccion = "productores" | "cobranza" | "vehiculo" | "ia_campo";

type Productor = {
  empresa_id: string;
  empresa_nombre: string;
  propietario_nombre: string;
  propietario_email: string;
  vinculacion_id: string;
  honorario_tipo: string;
  honorario_monto: number;
  activa: boolean;
};
type Cobranza = {
  id: string;
  empresa_id: string;
  empresa_nombre?: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: string;
  metodo_pago: string;
  observaciones: string;
};
type Vehiculo = {
  id: string;
  nombre: string;
  marca: string;
  modelo: string;
  año: number;
  patente: string;
  seguro_vencimiento: string;
  seguro_compania: string;
  vtv_vencimiento: string;
  km_actuales: number;
  proximo_service_km: number;
  observaciones: string;
};
type ServiceVehiculo = {
  id: string;
  tipo: string;
  descripcion: string;
  costo: number;
  km: number;
  fecha: string;
  taller: string;
};
type MensajeIA = { rol: "user" | "assistant"; texto: string };

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [ingenieroId, setIngenieroId] = useState<string | null>(null);
  const [ingenieroNombre, setIngenieroNombre] = useState("");
  const [productores, setProductores] = useState<Productor[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aiChat, setAiChat] = useState<MensajeIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [alertas, setAlertas] = useState<{ msg: string; urgencia: string }[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id, nombre, rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
    setIngenieroId(u.id);
    setIngenieroNombre(u.nombre);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (iid: string) => {
    const sb = await getSB();
    // Productores vinculados
    const { data: vincs } = await sb.from("vinculaciones").select("*, empresas(id, nombre, propietario_id)").eq("ingeniero_id", iid).eq("activa", true);
    if (vincs && vincs.length > 0) {
      const prods: Productor[] = [];
      for (const v of vincs) {
        const emp = (v as any).empresas;
        if (!emp) continue;
        const { data: propietario } = await sb.from("usuarios").select("nombre, email").eq("id", emp.propietario_id).single();
        prods.push({
          empresa_id: emp.id,
          empresa_nombre: emp.nombre,
          propietario_nombre: propietario?.nombre ?? "—",
          propietario_email: propietario?.email ?? "—",
          vinculacion_id: v.id,
          honorario_tipo: v.honorario_tipo ?? "mensual",
          honorario_monto: v.honorario_monto ?? 0,
          activa: v.activa,
        });
      }
      setProductores(prods);
    } else {
      setProductores([]);
    }
    // Cobranzas
    const { data: cobs } = await sb.from("ing_cobranzas").select("*").eq("ingeniero_id", iid).order("fecha", { ascending: false });
    setCobranzas(cobs ?? []);
    // Vehículos
    const { data: vehs } = await sb.from("ing_vehiculos").select("*").eq("ingeniero_id", iid);
    setVehiculos(vehs ?? []);
    // Calcular alertas
    calcularAlertas(vehs ?? [], cobs ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[], cobs: Cobranza[]) => {
    const alerts: { msg: string; urgencia: string }[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const diff = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: Seguro VENCIDO`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: Seguro vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.vtv_vencimiento) {
        const diff = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: VTV VENCIDA`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: VTV vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.proximo_service_km > 0 && v.km_actuales >= v.proximo_service_km - 500) {
        alerts.push({ msg: `${v.nombre}: Service próximo (${v.km_actuales}/${v.proximo_service_km} km)`, urgencia: "media" });
      }
    });
    cobs.filter(c => c.estado === "pendiente").forEach(c => {
      const diff = (hoy.getTime() - new Date(c.fecha).getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 30) alerts.push({ msg: `Cobro pendiente hace +30 días: $${c.monto.toLocaleString("es-AR")}`, urgencia: "media" });
    });
    setAlertas(alerts);
  };

  const vincularProductor = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    // Buscar empresa por email del productor
    const { data: u } = await sb.from("usuarios").select("id").eq("email", form.email_productor).single();
    if (!u) { alert("Productor no encontrado con ese email"); return; }
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { alert("El productor no tiene empresa registrada"); return; }
    // Verificar si ya existe vinculación
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", ingenieroId).eq("empresa_id", emp.id).single();
    if (existe) { alert("Ya estás vinculado con este productor"); return; }
    await sb.from("vinculaciones").insert({
      ingeniero_id: ingenieroId, empresa_id: emp.id, activa: true,
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
    });
    await fetchAll(ingenieroId);
    setShowForm(false); setForm({});
  };

  const desvincular = async (vinculacion_id: string) => {
    if (!confirm("¿Desvincular este productor?")) return;
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: false }).eq("id", vinculacion_id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  const guardarCobranza = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_cobranzas").insert({
      ingeniero_id: ingenieroId,
      empresa_id: form.empresa_id ?? null,
      concepto: form.concepto ?? "",
      monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      estado: form.estado ?? "pendiente",
      metodo_pago: form.metodo_pago ?? "",
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(ingenieroId);
    setShowForm(false); setForm({});
  };

  const marcarCobrado = async (id: string) => {
    const sb = await getSB();
    await sb.from("ing_cobranzas").update({ estado: "cobrado" }).eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  const guardarVehiculo = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculos").insert({
      ingeniero_id: ingenieroId,
      nombre: form.nombre, marca: form.marca ?? "", modelo: form.modelo ?? "",
      año: Number(form.año ?? 0), patente: form.patente ?? "",
      seguro_vencimiento: form.seguro_vencimiento || null,
      seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null,
      km_actuales: Number(form.km_actuales ?? 0),
      proximo_service_km: Number(form.proximo_service_km ?? 0),
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(ingenieroId);
    setShowForm(false); setForm({});
  };

  const guardarService = async () => {
    if (!vehiculoSel || !ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculo_service").insert({
      vehiculo_id: vehiculoSel.id, ingeniero_id: ingenieroId,
      tipo: form.tipo_service ?? "service",
      descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0),
      km: Number(form.km ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      taller: form.taller ?? "",
    });
    await fetchServicios(vehiculoSel.id);
    setShowForm(false); setForm({});
  };

  const fetchServicios = async (vid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id", vid).order("fecha", { ascending: false });
    setServicios(data ?? []);
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  const askAI = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiChat(prev => [...prev, { rol: "user", texto: userMsg }]);
    setAiLoading(true);
    try {
      const historial = aiChat.map(m => ({ role: m.rol === "user" ? "user" : "assistant", content: m.texto }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: `Sos un asistente agronómico experto para ingenieros agrónomos en Argentina. Respondé en español, de forma técnica y práctica. Podés ayudar con: dosis de herbicidas, fungicidas e insecticidas, diagnóstico de enfermedades y plagas, recomendaciones de cultivo, manejo agronómico, mercados y precios, normativas SENASA, y cualquier consulta del campo. Ingeniero: ${ingenieroNombre}. Productores asesorados: ${productores.length}.`,
          messages: [...historial, { role: "user", content: userMsg }]
        })
      });
      const data = await res.json();
      const respuesta = data.content?.[0]?.text ?? "Sin respuesta";
      setAiChat(prev => [...prev, { rol: "assistant", texto: respuesta }]);
    } catch { setAiChat(prev => [...prev, { rol: "assistant", texto: "Error al conectar con IA" }]); }
    setAiLoading(false);
  };

  const startVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Sin soporte de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => { setAiInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const totalPendiente = cobranzas.filter(c => c.estado === "pendiente").reduce((a, c) => a + c.monto, 0);
  const totalCobrado = cobranzas.filter(c => c.estado === "cobrado").reduce((a, c) => a + c.monto, 0);

  const secciones = [
    { key: "productores" as Seccion, label: "MIS PRODUCTORES", icon: "👨‍🌾" },
    { key: "cobranza" as Seccion, label: "COBRANZA", icon: "💰" },
    { key: "vehiculo" as Seccion, label: "MI VEHÍCULO", icon: "🚗" },
    { key: "ia_campo" as Seccion, label: "IA CAMPO", icon: "🤖" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Panel Ingeniero...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-ing:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .card-ing { transition: all 0.2s ease; }
        .sec-active { border-color: #00FF80 !important; color: #00FF80 !important; background: rgba(0,255,128,0.08) !important; }
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
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono">{ingenieroNombre}</div>
          <div className="text-xs text-[#00FF80] font-mono">INGENIERO AGRÓNOMO</div>
        </div>
        {alertas.length > 0 && (
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center">
              <span className="text-[#F87171] text-xs font-bold">{alertas.length}</span>
            </div>
          </div>
        )}
        <button onClick={async () => {
          const sb = await getSB();
          await sb.auth.signOut();
          window.location.href = "/login";
        }} className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL INGENIERO AGRÓNOMO</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTOR{productores.length !== 1 ? "ES" : ""} ASESORADO{productores.length !== 1 ? "S" : ""} · IA AGRONÓMICA ACTIVA</p>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono font-bold">⚠️ ALERTAS ({alertas.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertas.map((a, i) => (
                <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${a.urgencia === "alta" ? "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5" : "border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5"}`}>
                  {a.urgencia === "alta" ? "🔴" : "🟡"} {a.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navegación secciones */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {secciones.map(s => (
            <button key={s.key} onClick={() => { setSeccion(s.key); setShowForm(false); setForm({}); setVehiculoSel(null); }}
              className={`px-5 py-2.5 rounded-xl border border-[#00FF80]/15 text-sm font-mono transition-all ${seccion === s.key ? "sec-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ===== MIS PRODUCTORES ===== */}
        {seccion === "productores" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">👨‍🌾 MIS PRODUCTORES</h2>
                <p className="text-xs text-[#4B5563] font-mono">Clickeá un productor para ir a sus lotes y cultivos</p>
              </div>
              <button onClick={() => { setShowForm(true); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                + Vincular Productor
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ VINCULAR PRODUCTOR</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">El productor debe estar registrado en AgroGestión PRO. Ingresá su email para vincularte.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Email del productor</label>
                    <input type="email" value={form.email_productor ?? ""} onChange={e => setForm({ ...form, email_productor: e.target.value })} className={inputClass} placeholder="email@productor.com" />
                  </div>
                  <div>
                    <label className={labelClass}>Tipo de honorario</label>
                    <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                      <option value="mensual">Mensual</option>
                      <option value="por_ha">Por hectárea</option>
                      <option value="por_campaña">Por campaña</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Monto</label>
                    <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={vincularProductor} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Vincular</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {productores.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">👨‍🌾</div>
                <p className="text-[#4B5563] font-mono text-sm">No tenés productores vinculados todavía</p>
                <p className="text-[#4B5563] font-mono text-xs mt-1">Podés vincular productores o trabajar en modo independiente</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {productores.map(p => (
                  <div key={p.empresa_id} className="card-ing bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                    <div className="p-5 cursor-pointer" onClick={() => {
                      localStorage.setItem("ing_empresa_id", p.empresa_id);
                      localStorage.setItem("ing_empresa_nombre", p.empresa_nombre);
                      window.location.href = "/ingeniero/lotes";
                    }}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#00FF80]/10 border border-[#00FF80]/30 flex items-center justify-center text-lg">
                            👨‍🌾
                          </div>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono">{p.propietario_nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{p.empresa_nombre}</div>
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" title="Vinculado" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-[#4B5563] font-mono">Honorario</div>
                          <div className="text-sm font-bold font-mono text-[#C9A227]">
                            ${p.honorario_monto.toLocaleString("es-AR")} / {p.honorario_tipo.replace("_", " ")}
                          </div>
                        </div>
                        <div className="text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-3 py-1.5 rounded-lg hover:bg-[#00FF80]/10 transition-colors">
                          Ver lotes →
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-[#00FF80]/10 px-5 py-2 flex items-center justify-between">
                      <span className="text-xs text-[#4B5563] font-mono">{p.propietario_email}</span>
                      <button onClick={() => desvincular(p.vinculacion_id)} className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">Desvincular</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== COBRANZA ===== */}
        {seccion === "cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <button onClick={() => { setShowForm(true); setForm({ estado: "pendiente", fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Cobro
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className={inputClass}>
                      <option value="">Sin productor</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Concepto</label>
                    <input type="text" value={form.concepto ?? ""} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputClass} placeholder="Ej: Honorario enero" />
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.monto ?? ""} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "pendiente"} onChange={e => setForm({ ...form, estado: e.target.value })} className={inputClass}>
                      <option value="pendiente">Pendiente</option>
                      <option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Método de pago</label>
                    <select value={form.metodo_pago ?? ""} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className={inputClass}>
                      <option value="">—</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Resumen por productor */}
            {productores.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {productores.map(p => {
                  const cobsProd = cobranzas.filter(c => c.empresa_id === p.empresa_id);
                  const pendProd = cobsProd.filter(c => c.estado === "pendiente").reduce((a, c) => a + c.monto, 0);
                  return (
                    <div key={p.empresa_id} className="card-ing bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                      <div className="font-bold text-[#E5E7EB] font-mono text-sm mb-2">{p.propietario_nombre}</div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-[#4B5563]">Honorario</span>
                        <span className="text-[#C9A227]">${p.honorario_monto.toLocaleString("es-AR")}/{p.honorario_tipo.replace("_"," ")}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono mt-1">
                        <span className="text-[#4B5563]">Pendiente</span>
                        <span className="text-[#F87171] font-bold">${pendProd.toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {cobranzas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin cobros registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Fecha","Productor","Concepto","Monto","Estado","Método",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {cobranzas.map(c => {
                      const prod = productores.find(p => p.empresa_id === c.empresa_id);
                      return (
                        <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${c.estado === "cobrado" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{c.estado}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago || "—"}</td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            {c.estado === "pendiente" && (
                              <button onClick={() => marcarCobrado(c.id)} className="text-xs text-[#4ADE80] hover:text-[#4ADE80]/70 font-mono transition-colors">✓ Cobrar</button>
                            )}
                            <button onClick={() => eliminar("ing_cobranzas", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VEHÍCULO ===== */}
        {seccion === "vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHÍCULO</h2>
              {!vehiculoSel && (
                <button onClick={() => { setShowForm(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                  + Agregar Vehículo
                </button>
              )}
              {vehiculoSel && (
                <div className="flex gap-3">
                  <button onClick={() => { setShowForm(true); setForm({}); }}
                    className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                    + Service / Reparación
                  </button>
                  <button onClick={() => { setVehiculoSel(null); setServicios([]); }}
                    className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF] font-mono text-sm transition-all">
                    ← Volver
                  </button>
                </div>
              )}
            </div>

            {showForm && !vehiculoSel && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVO VEHÍCULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Toyota Hilux" /></div>
                  <div><label className={labelClass}>Marca</label><input type="text" value={form.marca ?? ""} onChange={e => setForm({ ...form, marca: e.target.value })} className={inputClass} placeholder="Ej: Toyota" /></div>
                  <div><label className={labelClass}>Modelo</label><input type="text" value={form.modelo ?? ""} onChange={e => setForm({ ...form, modelo: e.target.value })} className={inputClass} placeholder="Ej: Hilux SRX" /></div>
                  <div><label className={labelClass}>Año</label><input type="number" value={form.año ?? ""} onChange={e => setForm({ ...form, año: e.target.value })} className={inputClass} placeholder="2020" /></div>
                  <div><label className={labelClass}>Patente</label><input type="text" value={form.patente ?? ""} onChange={e => setForm({ ...form, patente: e.target.value })} className={inputClass} placeholder="AB123CD" /></div>
                  <div><label className={labelClass}>Venc. Seguro</label><input type="date" value={form.seguro_vencimiento ?? ""} onChange={e => setForm({ ...form, seguro_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Compañía Seguro</label><input type="text" value={form.seguro_compania ?? ""} onChange={e => setForm({ ...form, seguro_compania: e.target.value })} className={inputClass} placeholder="Ej: San Cristóbal" /></div>
                  <div><label className={labelClass}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento ?? ""} onChange={e => setForm({ ...form, vtv_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Km actuales</label><input type="number" value={form.km_actuales ?? ""} onChange={e => setForm({ ...form, km_actuales: e.target.value })} className={inputClass} placeholder="0" /></div>
                  <div><label className={labelClass}>Próx. service (km)</label><input type="number" value={form.proximo_service_km ?? ""} onChange={e => setForm({ ...form, proximo_service_km: e.target.value })} className={inputClass} placeholder="Ej: 10000" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {!vehiculoSel ? (
              vehiculos.length === 0 ? (
                <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                  <div className="text-5xl mb-4 opacity-20">🚗</div>
                  <p className="text-[#4B5563] font-mono">Sin vehículos registrados</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v => {
                    const seguroVencido = v.seguro_vencimiento && new Date(v.seguro_vencimiento) < new Date();
                    const vtvVencida = v.vtv_vencimiento && new Date(v.vtv_vencimiento) < new Date();
                    return (
                      <div key={v.id} className="card-ing bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 cursor-pointer"
                        onClick={() => { setVehiculoSel(v); fetchServicios(v.id); }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🚗</span>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.año} · {v.patente}</div>
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); eliminar("ing_vehiculos", v.id); }} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Km actuales</div>
                            <div className="text-lg font-bold font-mono text-[#00FF80]">{v.km_actuales.toLocaleString()} km</div>
                          </div>
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Próx. service</div>
                            <div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km ? `${v.proximo_service_km.toLocaleString()} km` : "—"}</div>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-3">
                          <span className={`text-xs px-2 py-1 rounded font-mono ${seguroVencido ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            🛡️ Seguro {seguroVencido ? "VENCIDO" : v.seguro_vencimiento || "—"}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-mono ${vtvVencida ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            📋 VTV {vtvVencida ? "VENCIDA" : v.vtv_vencimiento || "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 mb-6">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl">🚗</span>
                    <div>
                      <div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.año} · {vehiculoSel.patente}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Km actuales", value: `${vehiculoSel.km_actuales.toLocaleString()} km`, color: "#00FF80" },
                      { label: "Próx. service", value: vehiculoSel.proximo_service_km ? `${vehiculoSel.proximo_service_km.toLocaleString()} km` : "—", color: "#C9A227" },
                      { label: "Seguro", value: vehiculoSel.seguro_vencimiento || "—", color: vehiculoSel.seguro_vencimiento && new Date(vehiculoSel.seguro_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                      { label: "VTV", value: vehiculoSel.vtv_vencimiento || "—", color: vehiculoSel.vtv_vencimiento && new Date(vehiculoSel.vtv_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                    ].map(d => (
                      <div key={d.label} className="bg-[#020810]/60 rounded-lg p-3">
                        <div className="text-xs text-[#4B5563] font-mono">{d.label}</div>
                        <div className="text-sm font-bold font-mono mt-1" style={{ color: d.color }}>{d.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {showForm && vehiculoSel && (
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE / REPARACIÓN</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={labelClass}>Tipo</label>
                        <select value={form.tipo_service ?? "service"} onChange={e => setForm({ ...form, tipo_service: e.target.value })} className={inputClass}>
                          <option value="service">Service</option>
                          <option value="reparacion">Reparación</option>
                          <option value="preventivo">Preventivo</option>
                          <option value="vtv">VTV</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} placeholder="Ej: Cambio aceite" /></div>
                      <div><label className={labelClass}>Taller</label><input type="text" value={form.taller ?? ""} onChange={e => setForm({ ...form, taller: e.target.value })} className={inputClass} placeholder="Nombre taller" /></div>
                      <div><label className={labelClass}>Km</label><input type="number" value={form.km ?? ""} onChange={e => setForm({ ...form, km: e.target.value })} className={inputClass} placeholder="0" /></div>
                      <div><label className={labelClass}>Costo</label><input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} placeholder="0" /></div>
                      <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} /></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                      <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}

                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#00FF80]/10">
                    <span className="text-[#00FF80] text-sm font-mono font-bold">🔧 HISTORIAL</span>
                  </div>
                  {servicios.length === 0 ? (
                    <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin historial</div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="border-b border-[#00FF80]/10">
                        {["Fecha","Tipo","Descripción","Taller","Km","Costo",""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {servicios.map(s => (
                          <tr key={s.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                            <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.taller}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km ? `${s.km.toLocaleString()} km` : "—"}</td>
                            <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><button onClick={() => eliminar("ing_vehiculo_service", s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== IA CAMPO ===== */}
        {seccion === "ia_campo" && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🤖 IA CAMPO — ASISTENTE AGRONÓMICO</h2>
              <p className="text-xs text-[#4B5563] font-mono mt-1">Consultá sobre dosis, plagas, enfermedades, cultivos, mercados y todo lo del campo</p>
            </div>

            {/* Sugerencias rápidas */}
            {aiChat.length === 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {[
                  "¿Cuál es la dosis de glifosato para soja en post-emergencia?",
                  "¿Cómo identificar roya asiática en soja?",
                  "¿Qué fungicida uso para manchas foliares en maíz?",
                  "Recomendaciones para siembra de trigo en zona pampeana",
                  "¿Cuándo aplicar insecticida en soja según MIP?",
                  "Precio estimado de soja en el mercado actual",
                ].map(q => (
                  <button key={q} onClick={() => { setAiInput(q); }}
                    className="text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-4 py-3 rounded-xl font-mono transition-all bg-[#0a1628]/60">
                    💬 {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat */}
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
                  <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ IA AGRONÓMICA ACTIVA</span>
                </div>
                {aiChat.length > 0 && (
                  <button onClick={() => setAiChat([])} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono transition-colors">Limpiar chat</button>
                )}
              </div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {aiChat.length === 0 && (
                  <div className="text-center py-10 text-[#4B5563] font-mono text-sm">
                    <div className="text-4xl mb-3 opacity-30">🌾</div>
                    Hacé tu consulta agronómica...
                  </div>
                )}
                {aiChat.map((m, i) => (
                  <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm font-mono ${m.rol === "user" ? "bg-[#00FF80]/10 border border-[#00FF80]/20 text-[#E5E7EB]" : "bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF]"}`}>
                      {m.rol === "assistant" && <div className="text-[#00FF80] text-xs mb-2">◆ IA AGRONÓMICA</div>}
                      <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-xl">
                      <p className="text-[#00FF80] text-xs font-mono animate-pulse">▶ Analizando consulta...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input */}
            <div className="flex gap-3">
              <button onClick={startVoice}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-mono text-sm transition-all flex-shrink-0 ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                🎤 {listening ? "..." : "Voz"}
              </button>
              <input
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && askAI()}
                placeholder="Consultá sobre dosis, plagas, enfermedades, precios..."
                className="flex-1 bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all"
              />
              <button onClick={askAI} disabled={aiLoading || !aiInput.trim()}
                className="px-6 py-3 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all disabled:opacity-40 flex-shrink-0">
                ▶ Enviar
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono">© AGROGESTION PRO · PANEL INGENIERO AGRÓNOMO</p>
    </div>
  );
}

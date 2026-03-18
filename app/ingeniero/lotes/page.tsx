"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Campana = { id: string; nombre: string; año_inicio: number; año_fin: number; activa: boolean; };
type Lote = {
  id: string; nombre: string; hectareas: number; tipo_alquiler: string;
  porcentaje_alquiler: number; cultivo: string; variedad: string;
  fecha_siembra: string; estado: string; observaciones: string;
  fertilizacion: string; herbicida: string; fungicida: string;
  rendimiento_esperado: number; costo_alquiler: number;
  ingeniero_id: string; campana_id: string;
};
type Labor = {
  id: string; tipo: string; descripcion: string; productos: string;
  dosis: string; fecha: string; metodo_carga: string;
};

const CULTIVOS = ["soja","maiz","trigo","girasol","sorgo","cebada","otro"];
const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐"
};
const ESTADOS = ["sin_sembrar","sembrado","emergido","en_desarrollo","floración","llenado","cosechado"];
const ESTADO_COLORS: Record<string,string> = {
  sin_sembrar:"#4B5563",sembrado:"#60A5FA",emergido:"#4ADE80",
  en_desarrollo:"#00FF80",floración:"#C9A227",llenado:"#FB923C",cosechado:"#A78BFA"
};

export default function IngenieroLotesPage() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<Campana | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [usuarioId, setUsuarioId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"lista"|"cultivo">("lista");
  const [loteSeleccionado, setLoteSeleccionado] = useState<Lote|null>(null);
  const [showFormLote, setShowFormLote] = useState(false);
  const [showFormCampana, setShowFormCampana] = useState(false);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ingenieros, setIngenieros] = useState<{id:string;nombre:string}[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id, rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
    setUsuarioId(u.id);
    // Leer empresa del productor seleccionado desde localStorage
    const empId = localStorage.getItem("ing_empresa_id");
    const empNombre = localStorage.getItem("ing_empresa_nombre");
    if (!empId) { window.location.href = "/ingeniero"; return; }
    setEmpresaId(empId);
    setEmpresaNombre(empNombre ?? "Productor");
    await fetchCampanas(empId);
    const { data: ings } = await sb.from("usuarios").select("id, nombre").eq("rol", "ingeniero");
    setIngenieros(ings ?? []);
    setLoading(false);
  };

  const fetchCampanas = async (eid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("campanas").select("*").eq("empresa_id", eid).order("año_inicio", { ascending: false });
    setCampanas(data ?? []);
    const activa = data?.find(c => c.activa) ?? data?.[0] ?? null;
    setCampanaActiva(activa);
    if (activa) await fetchLotes(eid, activa.id);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("nombre");
    setLotes(data ?? []);
  };

  const fetchLabores = async (loteId: string) => {
    const sb = await getSB();
    const { data } = await sb.from("lote_labores").select("*").eq("lote_id", loteId).order("fecha", { ascending: false });
    setLabores(data ?? []);
  };

  const crearCampana = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    // Desactivar campañas anteriores
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", empresaId);
    // Crear nueva campaña
    const { data: nuevaCampana } = await sb.from("campanas").insert({
      empresa_id: empresaId,
      nombre: `${form.año_inicio}/${form.año_fin}`,
      año_inicio: Number(form.año_inicio),
      año_fin: Number(form.año_fin),
      activa: true
    }).select().single();
    // Migrar lotes de campaña anterior
    if (nuevaCampana && lotes.length > 0) {
      const lotesNuevos = lotes.map(l => ({
        empresa_id: empresaId,
        campana_id: nuevaCampana.id,
        nombre: l.nombre,
        hectareas: l.hectareas,
        tipo_alquiler: l.tipo_alquiler,
        porcentaje_alquiler: l.porcentaje_alquiler,
        cultivo: "",
        estado: "sin_sembrar",
        ingeniero_id: l.ingeniero_id,
      }));
      await sb.from("lotes").insert(lotesNuevos);
    }
    await fetchCampanas(empresaId);
    setShowFormCampana(false);
    setForm({});
  };

  const guardarLote = async () => {
    if (!empresaId || !campanaActiva) return;
    const sb = await getSB();
    const data = {
      empresa_id: empresaId,
      campana_id: campanaActiva.id,
      nombre: form.nombre,
      hectareas: Number(form.hectareas ?? 0),
      tipo_alquiler: form.tipo_alquiler ?? "propio",
      porcentaje_alquiler: Number(form.porcentaje_alquiler ?? 0),
      cultivo: form.cultivo ?? "",
      variedad: form.variedad ?? "",
      fecha_siembra: form.fecha_siembra ?? null,
      estado: form.estado ?? "sin_sembrar",
      fertilizacion: form.fertilizacion ?? "",
      herbicida: form.herbicida ?? "",
      fungicida: form.fungicida ?? "",
      rendimiento_esperado: Number(form.rendimiento_esperado ?? 0),
      costo_alquiler: Number(form.costo_alquiler ?? 0),
      ingeniero_id: form.ingeniero_id ?? null,
      observaciones: form.observaciones ?? "",
    };
    if (loteSeleccionado && showFormLote) {
      await sb.from("lotes").update(data).eq("id", loteSeleccionado.id);
    } else {
      await sb.from("lotes").insert(data);
    }
    await fetchLotes(empresaId, campanaActiva.id);
    setShowFormLote(false);
    setForm({});
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("¿Eliminar este lote?")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id", id);
    if (empresaId && campanaActiva) await fetchLotes(empresaId, campanaActiva.id);
    if (loteSeleccionado?.id === id) setLoteSeleccionado(null);
  };

  const guardarLabor = async () => {
    if (!loteSeleccionado || !empresaId || !usuarioId) return;
    const sb = await getSB();
    await sb.from("lote_labores").insert({
      lote_id: loteSeleccionado.id,
      empresa_id: empresaId,
      tipo: form.tipo_labor ?? "aplicacion",
      descripcion: form.descripcion_labor ?? "",
      productos: form.productos_labor ?? "",
      dosis: form.dosis_labor ?? "",
      fecha: form.fecha_labor ?? new Date().toISOString().split("T")[0],
      metodo_carga: "manual",
      cargado_por: usuarioId,
    });
    await fetchLabores(loteSeleccionado.id);
    setShowFormLabor(false);
    setForm({});
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true);
    setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asistente agronómico experto para AgroGestión Pro. Respondé en español, de forma práctica y concisa. Contexto: hay ${lotes.length} lotes con cultivos como ${[...new Set(lotes.map(l=>l.cultivo).filter(Boolean))].join(", ")}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const startVoice = (modo: "labor"|"consulta") => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Tu navegador no soporta reconocimiento de voz"); return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      if (modo === "labor") {
        askAI(`El usuario dijo por voz: "${text}". Interpretá qué labor/aplicación quiere registrar en el lote. Extraé: tipo de labor, productos, dosis y cualquier dato relevante. Respondé con los datos estructurados listos para cargar en el cuaderno de campo.`);
      } else {
        askAI(`Consulta por voz del productor: "${text}". Respondé con información agronómica práctica.`);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const exportarExcel = () => {
    const headers = ["Lote","Hectáreas","Tipo","Cultivo","Variedad/Híbrido","Estado","Fecha Siembra","Fertilización","Herbicida","Fungicida","Rend.Esperado (tn/ha)","Costo Alquiler","Observaciones"];
    const rows = lotes.map(l => [
      l.nombre, l.hectareas, l.tipo_alquiler, l.cultivo, l.variedad,
      l.estado, l.fecha_siembra, l.fertilizacion, l.herbicida, l.fungicida,
      l.rendimiento_esperado, l.costo_alquiler, l.observaciones
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lotes_${campanaActiva?.nombre ?? "campaña"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const lotesPorCultivo = CULTIVOS.reduce((acc, c) => {
    const ls = lotes.filter(l => l.cultivo === c);
    if (ls.length > 0) acc[c] = ls;
    return acc;
  }, {} as Record<string, Lote[]>);

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando módulo de lotes...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes border-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .lote-card:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .lote-card { transition: all 0.2s ease; }
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
        <button onClick={() => loteSeleccionado ? setLoteSeleccionado(null) : window.location.href = "/ingeniero"}
          className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
          ← {loteSeleccionado ? "Volver a lotes" : "Dashboard"}
        </button>
        <div className="flex-1" />
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* ===== VISTA DETALLE DE LOTE ===== */}
        {loteSeleccionado ? (
          <div>
            {/* Header lote */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-4xl">{CULTIVO_ICONS[loteSeleccionado.cultivo] ?? "🌐"}</span>
                  <div>
                    <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">{loteSeleccionado.nombre}</h1>
                    <p className="text-[#00FF80] text-xs font-mono tracking-widest">
                      {loteSeleccionado.cultivo?.toUpperCase()} · {loteSeleccionado.hectareas} Ha · {loteSeleccionado.tipo_alquiler}
                    </p>
                  </div>
                </div>
                <span className="text-xs px-3 py-1 rounded-full font-mono border"
                  style={{ color: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", borderColor: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", background: (ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563") + "15" }}>
                  {loteSeleccionado.estado?.replace("_", " ").toUpperCase()}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => startVoice("labor")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                  🎤 {listening ? "Escuchando..." : "Voz"}
                </button>
                <button onClick={() => { setShowFormLabor(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                  + Labor
                </button>
                <button onClick={() => { setShowFormLote(true); setForm(Object.fromEntries(Object.entries(loteSeleccionado).map(([k,v])=>[k,String(v??"")]))); }}
                  className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-sm transition-all">
                  ✏️ Editar
                </button>
              </div>
            </div>

            {/* Datos del lote */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Variedad/Híbrido", value: loteSeleccionado.variedad || "—", color: "#00FF80" },
                { label: "Fecha Siembra", value: loteSeleccionado.fecha_siembra || "—", color: "#60A5FA" },
                { label: "Fertilización", value: loteSeleccionado.fertilizacion || "—", color: "#C9A227" },
                { label: "Herbicida", value: loteSeleccionado.herbicida || "—", color: "#4ADE80" },
                { label: "Fungicida", value: loteSeleccionado.fungicida || "—", color: "#A78BFA" },
                { label: "Rend. Esperado", value: loteSeleccionado.rendimiento_esperado ? `${loteSeleccionado.rendimiento_esperado} tn/ha` : "—", color: "#FB923C" },
                { label: "Costo Alquiler", value: loteSeleccionado.costo_alquiler ? `$${loteSeleccionado.costo_alquiler}/ha` : "—", color: "#F87171" },
                { label: "Observaciones", value: loteSeleccionado.observaciones || "—", color: "#9CA3AF" },
              ].map(d => (
                <div key={d.label} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-xl p-4">
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-1">{d.label}</div>
                  <div className="text-sm font-mono" style={{ color: d.color }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* IA Agronómica */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
                <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ ASISTENTE IA AGRONÓMICO</span>
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                {[
                  `Analizá el estado del lote ${loteSeleccionado.nombre} con cultivo ${loteSeleccionado.cultivo}`,
                  "¿Qué aplicaciones recomiendas para esta etapa?",
                  `Calculá el margen bruto estimado para ${loteSeleccionado.cultivo} a ${loteSeleccionado.rendimiento_esperado} tn/ha`,
                ].map(q => (
                  <button key={q} onClick={() => askAI(q)}
                    className="text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                    {q}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-[#00FF80] text-xs font-mono animate-pulse">▶ Analizando...</p>}
              {aiMsg && <div className="p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
            </div>

            {/* Form labor */}
            {showFormLabor && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR LABOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Tipo</label>
                    <select value={form.tipo_labor ?? ""} onChange={e => setForm({...form, tipo_labor: e.target.value})} className={inputClass}>
                      <option value="aplicacion">Aplicación</option>
                      <option value="siembra">Siembra</option>
                      <option value="fertilizacion">Fertilización</option>
                      <option value="cosecha">Cosecha</option>
                      <option value="recorrida">Recorrida</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion_labor ?? ""} onChange={e => setForm({...form, descripcion_labor: e.target.value})} className={inputClass} placeholder="Ej: Aplicación herbicida" />
                  </div>
                  <div>
                    <label className={labelClass}>Productos</label>
                    <input type="text" value={form.productos_labor ?? ""} onChange={e => setForm({...form, productos_labor: e.target.value})} className={inputClass} placeholder="Ej: Glifosato + Cletodim" />
                  </div>
                  <div>
                    <label className={labelClass}>Dosis</label>
                    <input type="text" value={form.dosis_labor ?? ""} onChange={e => setForm({...form, dosis_labor: e.target.value})} className={inputClass} placeholder="Ej: 2lt/ha + 1lt/ha" />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha_labor ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({...form, fecha_labor: e.target.value})} className={inputClass} />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => setShowFormLabor(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Cuaderno de campo */}
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between">
                <span className="text-[#00FF80] text-sm font-mono font-bold">📋 CUADERNO DE CAMPO DIGITAL</span>
                <button onClick={() => fetchLabores(loteSeleccionado.id)} className="text-xs text-[#4B5563] hover:text-[#00FF80] font-mono transition-colors">↻ Actualizar</button>
              </div>
              {labores.length === 0 ? (
                <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin labores registradas</div>
              ) : (
                <div className="divide-y divide-[#00FF80]/5">
                  {labores.map(l => (
                    <div key={l.id} className="px-5 py-4 hover:bg-[#00FF80]/5 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-[#00FF80]/10 text-[#00FF80] px-2 py-0.5 rounded font-mono">{l.tipo}</span>
                            <span className="text-xs text-[#4B5563] font-mono">{l.fecha}</span>
                            <span className="text-xs text-[#4B5563] font-mono">· {l.metodo_carga}</span>
                          </div>
                          <p className="text-sm text-[#E5E7EB] font-mono">{l.descripcion}</p>
                          {l.productos && <p className="text-xs text-[#C9A227] font-mono mt-1">🧪 {l.productos} {l.dosis ? `· ${l.dosis}` : ""}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ===== VISTA LISTA DE LOTES ===== */
          <>
            {/* Title + acciones */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◱ LOTES Y CULTIVOS</h1>
                <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ PRODUCTOR: {empresaNombre.toUpperCase()} · CUADERNO DE CAMPO</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => startVoice("consulta")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                  🎤 {listening ? "Escuchando..." : "Consulta por Voz"}
                </button>
                <button onClick={exportarExcel}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm transition-all">
                  📊 Exportar
                </button>
                <button onClick={() => setVista(vista === "lista" ? "cultivo" : "lista")}
                  className="px-4 py-2 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] hover:bg-[#60A5FA]/10 font-mono text-sm transition-all">
                  {vista === "lista" ? "◈ Por Cultivo" : "☰ Lista"}
                </button>
                <button onClick={() => { setShowFormLote(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                  + Nuevo Lote
                </button>
              </div>
            </div>

            {/* Selector de campaña */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-[#4B5563] uppercase tracking-widest font-mono">Campaña:</span>
                  {campanas.map(c => (
                    <button key={c.id}
                      onClick={async () => { setCampanaActiva(c); if (empresaId) await fetchLotes(empresaId, c.id); }}
                      className={`px-4 py-1.5 rounded-xl text-sm font-mono border transition-all ${campanaActiva?.id === c.id ? "border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                      {c.nombre} {c.activa && "✓"}
                    </button>
                  ))}
                  <button onClick={() => { setShowFormCampana(true); setForm({ año_inicio: "2025", año_fin: "2026" }); }}
                    className="px-4 py-1.5 rounded-xl text-sm font-mono border border-[#00FF80]/20 text-[#00FF80] hover:bg-[#00FF80]/10 transition-all">
                    + Nueva Campaña
                  </button>
                </div>
                <div className="text-xs text-[#4B5563] font-mono">
                  {lotes.length} lotes · {lotes.reduce((a, l) => a + (l.hectareas ?? 0), 0)} Ha totales
                </div>
              </div>
            </div>

            {/* Form nueva campaña */}
            {showFormCampana && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ NUEVA CAMPAÑA {lotes.length > 0 && `— Se migrarán ${lotes.length} lotes`}</h3>
                <div className="flex gap-4 items-end flex-wrap">
                  <div>
                    <label className={labelClass}>Año inicio</label>
                    <input type="number" value={form.año_inicio ?? "2025"} onChange={e => setForm({...form, año_inicio: e.target.value})} className={inputClass + " w-32"} />
                  </div>
                  <div>
                    <label className={labelClass}>Año fin</label>
                    <input type="number" value={form.año_fin ?? "2026"} onChange={e => setForm({...form, año_fin: e.target.value})} className={inputClass + " w-32"} />
                  </div>
                  <button onClick={crearCampana} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">
                    ▶ Crear y Migrar Lotes
                  </button>
                  <button onClick={() => setShowFormCampana(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form nuevo/editar lote */}
            {showFormLote && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00FF80]/50 to-transparent" />
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">
                  {loteSeleccionado && showFormLote ? "✏️ EDITAR LOTE" : "+ NUEVO LOTE"}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Nombre / Número</label>
                    <input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} placeholder="Ej: Lote 8" />
                  </div>
                  <div>
                    <label className={labelClass}>Hectáreas</label>
                    <input type="number" value={form.hectareas ?? ""} onChange={e => setForm({...form, hectareas: e.target.value})} className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelClass}>Tipo de tenencia</label>
                    <select value={form.tipo_alquiler ?? "propio"} onChange={e => setForm({...form, tipo_alquiler: e.target.value})} className={inputClass}>
                      <option value="propio">Propio</option>
                      <option value="alquilado">Alquilado</option>
                      <option value="mixto">Mixto</option>
                      <option value="porcentaje">A porcentaje</option>
                    </select>
                  </div>
                  {(form.tipo_alquiler === "porcentaje" || form.tipo_alquiler === "mixto") && (
                    <div>
                      <label className={labelClass}>% Alquiler</label>
                      <input type="number" value={form.porcentaje_alquiler ?? ""} onChange={e => setForm({...form, porcentaje_alquiler: e.target.value})} className={inputClass} placeholder="Ej: 30" />
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Cultivo</label>
                    <select value={form.cultivo ?? ""} onChange={e => setForm({...form, cultivo: e.target.value})} className={inputClass}>
                      <option value="">Sin cultivo</option>
                      {CULTIVOS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Variedad / Híbrido</label>
                    <input type="text" value={form.variedad ?? ""} onChange={e => setForm({...form, variedad: e.target.value})} className={inputClass} placeholder="Ej: DK 7210" />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha de siembra</label>
                    <input type="date" value={form.fecha_siembra ?? ""} onChange={e => setForm({...form, fecha_siembra: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "sin_sembrar"} onChange={e => setForm({...form, estado: e.target.value})} className={inputClass}>
                      {ESTADOS.map(s => <option key={s} value={s}>{s.replace("_"," ").toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Fertilización</label>
                    <input type="text" value={form.fertilizacion ?? ""} onChange={e => setForm({...form, fertilizacion: e.target.value})} className={inputClass} placeholder="Ej: 180kg MAP" />
                  </div>
                  <div>
                    <label className={labelClass}>Herbicida</label>
                    <input type="text" value={form.herbicida ?? ""} onChange={e => setForm({...form, herbicida: e.target.value})} className={inputClass} placeholder="Ej: Glifosato 2lt" />
                  </div>
                  <div>
                    <label className={labelClass}>Fungicida</label>
                    <input type="text" value={form.fungicida ?? ""} onChange={e => setForm({...form, fungicida: e.target.value})} className={inputClass} placeholder="Ej: Opera 0.5lt" />
                  </div>
                  <div>
                    <label className={labelClass}>Rend. esperado (tn/ha)</label>
                    <input type="number" value={form.rendimiento_esperado ?? ""} onChange={e => setForm({...form, rendimiento_esperado: e.target.value})} className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelClass}>Costo alquiler ($/ha)</label>
                    <input type="number" value={form.costo_alquiler ?? ""} onChange={e => setForm({...form, costo_alquiler: e.target.value})} className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelClass}>Ingeniero asignado</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({...form, ingeniero_id: e.target.value})} className={inputClass}>
                      <option value="">Sin asignar</option>
                      {ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} placeholder="Notas adicionales..." />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={guardarLote} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowFormLote(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* IA */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
                <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ ASISTENTE IA AGRONÓMICO</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {["Resumen de todos mis lotes","¿Qué lotes necesitan atención urgente?","Calculá el margen bruto total de la campaña"].map(q => (
                  <button key={q} onClick={() => askAI(q)}
                    className="text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                    {q}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-[#00FF80] text-xs font-mono mt-3 animate-pulse">▶ Analizando...</p>}
              {aiMsg && <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
            </div>

            {/* Lista de lotes */}
            {lotes.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">◱</div>
                <p className="text-[#4B5563] font-mono">No hay lotes en esta campaña</p>
                <p className="text-[#4B5563] font-mono text-xs mt-1">Clickeá en + Nuevo Lote para empezar</p>
              </div>
            ) : vista === "lista" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {lotes.map(l => (
                  <div key={l.id} className="lote-card bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden cursor-pointer"
                    onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{CULTIVO_ICONS[l.cultivo] ?? "🌐"}</span>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono">{l.nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{l.hectareas} Ha · {l.tipo_alquiler}</div>
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); eliminarLote(l.id); }} className="text-[#4B5563] hover:text-red-400 transition-colors text-xs p-1">✕</button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-[#00FF80] font-mono font-bold">{l.cultivo?.toUpperCase() || "Sin cultivo"}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{l.variedad || "—"}</div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full font-mono border"
                          style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563", borderColor: ESTADO_COLORS[l.estado] ?? "#4B5563", background: (ESTADO_COLORS[l.estado] ?? "#4B5563") + "15" }}>
                          {l.estado?.replace("_"," ") ?? "sin sembrar"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Vista por cultivo
              <div className="space-y-6">
                {Object.entries(lotesPorCultivo).map(([cultivo, lotesDelCultivo]) => (
                  <div key={cultivo} className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center gap-3">
                      <span className="text-2xl">{CULTIVO_ICONS[cultivo]}</span>
                      <span className="font-bold text-[#E5E7EB] font-mono uppercase tracking-wider">{cultivo}</span>
                      <span className="text-xs text-[#4B5563] font-mono">
                        {lotesDelCultivo.length} lotes · {lotesDelCultivo.reduce((a,l) => a + (l.hectareas ?? 0), 0)} Ha
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                      {lotesDelCultivo.map(l => (
                        <div key={l.id} className="lote-card bg-[#020810]/60 border border-[#00FF80]/10 rounded-lg p-3 cursor-pointer"
                          onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                          <div className="font-bold text-sm text-[#E5E7EB] font-mono">{l.nombre}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{l.hectareas} Ha</div>
                          <div className="text-xs font-mono mt-1" style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563" }}>
                            {l.estado?.replace("_"," ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(lotesPorCultivo).length === 0 && (
                  <div className="text-center py-10 text-[#4B5563] font-mono">Asigná cultivos a los lotes para ver esta vista</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

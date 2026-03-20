"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

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
const CULTIVO_IMG: Record<string,string> = {
  soja:"/cultivo-soja.png", maiz:"/cultivo-maiz.png", trigo:"/cultivo-trigo.png",
  girasol:"/cultivo-girasol.png", sorgo:"/cultivo-sorgo.png",
  cebada:"/cultivo-cebada.png", otro:"/cultivo-otro.png",
};
const ESTADOS = ["sin_sembrar","sembrado","emergido","en_desarrollo","floración","llenado","cosechado"];
const ESTADO_COLORS: Record<string,string> = {
  sin_sembrar:"#4B5563",sembrado:"#60A5FA",emergido:"#4ADE80",
  en_desarrollo:"#00FF80",floración:"#C9A227",llenado:"#FB923C",cosechado:"#A78BFA"
};

export default function LotesPage() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<Campana | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [usuarioId, setUsuarioId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"lista"|"cultivo">("lista");
  const [loteSeleccionado, setLoteSeleccionado] = useState<Lote|null>(null);
  const [showFormLote, setShowFormLote] = useState(false);
  const [showFormCampana, setShowFormCampana] = useState(false);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
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
    const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
    if (!u) return;
    setUsuarioId(u.id);
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) {
      const { data: newEmp } = await sb.from("empresas").insert({ nombre: "Mi Empresa", propietario_id: u.id }).select().single();
      if (newEmp) { setEmpresaId(newEmp.id); await fetchCampanas(newEmp.id); }
    } else {
      setEmpresaId(emp.id);
      await fetchCampanas(emp.id);
    }
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
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", empresaId);
    const { data: nuevaCampana } = await sb.from("campanas").insert({
      empresa_id: empresaId,
      nombre: `${form.año_inicio}/${form.año_fin}`,
      año_inicio: Number(form.año_inicio),
      año_fin: Number(form.año_fin),
      activa: true
    }).select().single();
    if (nuevaCampana && lotes.length > 0) {
      const lotesNuevos = lotes.map(l => ({
        empresa_id: empresaId, campana_id: nuevaCampana.id,
        nombre: l.nombre, hectareas: l.hectareas,
        tipo_alquiler: l.tipo_alquiler, porcentaje_alquiler: l.porcentaje_alquiler,
        cultivo: "", estado: "sin_sembrar", ingeniero_id: l.ingeniero_id,
      }));
      await sb.from("lotes").insert(lotesNuevos);
    }
    await fetchCampanas(empresaId);
    setShowFormCampana(false); setForm({});
  };

  const guardarLote = async () => {
    if (!empresaId || !campanaActiva) return;
    const sb = await getSB();
    const data = {
      empresa_id: empresaId, campana_id: campanaActiva.id,
      nombre: form.nombre, hectareas: Number(form.hectareas ?? 0),
      tipo_alquiler: form.tipo_alquiler ?? "propio",
      porcentaje_alquiler: Number(form.porcentaje_alquiler ?? 0),
      cultivo: form.cultivo ?? "", variedad: form.variedad ?? "",
      fecha_siembra: form.fecha_siembra ?? null, estado: form.estado ?? "sin_sembrar",
      fertilizacion: form.fertilizacion ?? "", herbicida: form.herbicida ?? "",
      fungicida: form.fungicida ?? "",
      rendimiento_esperado: Number(form.rendimiento_esperado ?? 0),
      costo_alquiler: Number(form.costo_alquiler ?? 0),
      ingeniero_id: form.ingeniero_id ?? null, observaciones: form.observaciones ?? "",
    };
    if (loteSeleccionado && showFormLote) {
      await sb.from("lotes").update(data).eq("id", loteSeleccionado.id);
    } else {
      await sb.from("lotes").insert(data);
    }
    await fetchLotes(empresaId, campanaActiva.id);
    setShowFormLote(false); setForm({});
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
      lote_id: loteSeleccionado.id, empresa_id: empresaId,
      tipo: form.tipo_labor ?? "aplicacion",
      descripcion: form.descripcion_labor ?? "",
      productos: form.productos_labor ?? "", dosis: form.dosis_labor ?? "",
      fecha: form.fecha_labor ?? new Date().toISOString().split("T")[0],
      metodo_carga: "manual", cargado_por: usuarioId,
    });
    await fetchLabores(loteSeleccionado.id);
    setShowFormLabor(false); setForm({});
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asistente agronómico experto para AgroGestión Pro. Respondé en español, de forma práctica y concisa. Contexto: hay ${lotes.length} lotes con cultivos como ${[...new Set(lotes.map(l=>l.cultivo).filter(Boolean))].join(", ")}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const startVoice = (modo: "labor"|"consulta") => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Sin soporte de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      if (modo === "labor") askAI(`El usuario dijo por voz: "${text}". Interpretá qué labor quiere registrar.`);
      else { setAiInput(text); setShowIA(true); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const exportarExcel = () => {
    const headers = ["Lote","Hectáreas","Tipo","Cultivo","Variedad","Estado","Fecha Siembra","Fertilización","Herbicida","Fungicida","Rend.(tn/ha)","Costo Alquiler","Observaciones"];
    const rows = lotes.map(l => [l.nombre, l.hectareas, l.tipo_alquiler, l.cultivo, l.variedad, l.estado, l.fecha_siembra, l.fertilizacion, l.herbicida, l.fungicida, l.rendimiento_esperado, l.costo_alquiler, l.observaciones]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `lotes_${campanaActiva?.nombre ?? "campaña"}.csv`; a.click();
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
        @keyframes gradient-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .lote-card:hover { border-color: rgba(0,255,128,0.5) !important; }
        .lote-card { transition: border-color 0.2s ease; }
        .logo-btn:hover { filter: drop-shadow(0 0 12px rgba(0,255,128,0.8)); transform: scale(1.03); }
        .logo-btn { transition: all 0.2s ease; cursor: pointer; }
        .btn-ia { animation: float 3s ease-in-out infinite; }
        .btn-ia:hover { transform: scale(1.1) !important; box-shadow: 0 0 25px rgba(96,165,250,0.6) !important; }
      `}</style>

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/85" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* ===== HEADER ===== */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]"
          style={{ background: "linear-gradient(90deg, transparent, #00FF80, #00AAFF, #00FF80, transparent)", backgroundSize: "200% 100%", animation: "gradient-flow 4s ease infinite" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(2,8,16,0.95) 0%, rgba(0,20,10,0.90) 50%, rgba(2,8,16,0.95) 100%)" }} />
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={() => loteSeleccionado ? setLoteSeleccionado(null) : window.location.href = "/productor/dashboard"}
            className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm flex-shrink-0">
            ← {loteSeleccionado ? "Volver" : "Dashboard"}
          </button>
          <div className="flex-1" />
          <div className="logo-btn" onClick={() => window.location.href = "/productor/dashboard"}>
            <Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain" />
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* ===== DETALLE LOTE ===== */}
        {loteSeleccionado ? (
          <div>
            {/* Imagen fondo cultivo + header lote */}
            <div className="relative rounded-2xl overflow-hidden mb-6 h-48">
              <Image
                src={CULTIVO_IMG[loteSeleccionado.cultivo] ?? "/cultivo-default.png"}
                alt={loteSeleccionado.cultivo}
                fill style={{ objectFit: "cover" }}
                onError={(e) => { (e.target as any).src = "/dashboard-bg.png"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white font-mono mb-1">{loteSeleccionado.nombre}</h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[#00FF80] text-sm font-mono">{loteSeleccionado.cultivo?.toUpperCase() || "Sin cultivo"} · {loteSeleccionado.hectareas} Ha · {loteSeleccionado.tipo_alquiler}</span>
                    <span className="text-xs px-3 py-1 rounded-full font-mono border"
                      style={{ color: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", borderColor: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", background: (ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563") + "30" }}>
                      {loteSeleccionado.estado?.replace("_"," ").toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startVoice("labor")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/40 text-[#00FF80] bg-[#020810]/60 hover:bg-[#00FF80]/10"}`}>
                    🎤 {listening ? "Escuchando..." : "Voz"}
                  </button>
                  <button onClick={() => { setShowFormLabor(true); setForm({}); }}
                    className="px-4 py-2 rounded-xl bg-[#00FF80]/20 border border-[#00FF80]/40 text-[#00FF80] font-mono text-sm">
                    + Labor
                  </button>
                  <button onClick={() => { setShowFormLote(true); setForm(Object.fromEntries(Object.entries(loteSeleccionado).map(([k,v])=>[k,String(v??"")]))); }}
                    className="px-4 py-2 rounded-xl border border-[#C9A227]/40 text-[#C9A227] bg-[#020810]/60 font-mono text-sm">
                    ✏️ Editar
                  </button>
                </div>
              </div>
            </div>

            {/* Datos */}
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

            {/* Form editar lote */}
            {showFormLote && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">✏️ EDITAR LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Hectáreas</label><input type="number" value={form.hectareas ?? ""} onChange={e => setForm({...form, hectareas: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Tenencia</label>
                    <select value={form.tipo_alquiler ?? "propio"} onChange={e => setForm({...form, tipo_alquiler: e.target.value})} className={inputClass}>
                      <option value="propio">Propio</option>
                      <option value="alquilado">Alquilado</option>
                      <option value="mixto">Mixto</option>
                      <option value="porcentaje">A porcentaje</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Cultivo</label>
                    <select value={form.cultivo ?? ""} onChange={e => setForm({...form, cultivo: e.target.value})} className={inputClass}>
                      <option value="">Sin cultivo</option>
                      {CULTIVOS.map(c => <option key={c} value={c}>{CULTIVO_ICONS[c]} {c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Variedad/Híbrido</label><input type="text" value={form.variedad ?? ""} onChange={e => setForm({...form, variedad: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Fecha siembra</label><input type="date" value={form.fecha_siembra ?? ""} onChange={e => setForm({...form, fecha_siembra: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "sin_sembrar"} onChange={e => setForm({...form, estado: e.target.value})} className={inputClass}>
                      {ESTADOS.map(s => <option key={s} value={s}>{s.replace("_"," ").toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fertilización</label><input type="text" value={form.fertilizacion ?? ""} onChange={e => setForm({...form, fertilizacion: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Herbicida</label><input type="text" value={form.herbicida ?? ""} onChange={e => setForm({...form, herbicida: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Fungicida</label><input type="text" value={form.fungicida ?? ""} onChange={e => setForm({...form, fungicida: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Rend. (tn/ha)</label><input type="number" value={form.rendimiento_esperado ?? ""} onChange={e => setForm({...form, rendimiento_esperado: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Costo alquiler</label><input type="number" value={form.costo_alquiler ?? ""} onChange={e => setForm({...form, costo_alquiler: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Ingeniero</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({...form, ingeniero_id: e.target.value})} className={inputClass}>
                      <option value="">Sin asignar</option>
                      {ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowFormLote(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form labor */}
            {showFormLabor && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR LABOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_labor ?? "aplicacion"} onChange={e => setForm({...form, tipo_labor: e.target.value})} className={inputClass}>
                      <option value="aplicacion">Aplicación</option>
                      <option value="siembra">Siembra</option>
                      <option value="fertilizacion">Fertilización</option>
                      <option value="cosecha">Cosecha</option>
                      <option value="recorrida">Recorrida</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion_labor ?? ""} onChange={e => setForm({...form, descripcion_labor: e.target.value})} className={inputClass} placeholder="Ej: Aplicación herbicida" /></div>
                  <div><label className={labelClass}>Productos</label><input type="text" value={form.productos_labor ?? ""} onChange={e => setForm({...form, productos_labor: e.target.value})} className={inputClass} placeholder="Ej: Glifosato + Cletodim" /></div>
                  <div><label className={labelClass}>Dosis</label><input type="text" value={form.dosis_labor ?? ""} onChange={e => setForm({...form, dosis_labor: e.target.value})} className={inputClass} placeholder="Ej: 2lt/ha" /></div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha_labor ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({...form, fecha_labor: e.target.value})} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-[#00FF80]/10 text-[#00FF80] px-2 py-0.5 rounded font-mono">{l.tipo}</span>
                        <span className="text-xs text-[#4B5563] font-mono">{l.fecha}</span>
                      </div>
                      <p className="text-sm text-[#E5E7EB] font-mono">{l.descripcion}</p>
                      {l.productos && <p className="text-xs text-[#C9A227] font-mono mt-1">🧪 {l.productos} {l.dosis ? `· ${l.dosis}` : ""}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ===== LISTA DE LOTES ===== */
          <>
            {/* Title */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◱ LOTES Y CULTIVOS</h1>
                <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ CUADERNO DE CAMPO DIGITAL</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => startVoice("consulta")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
                  🎤 {listening ? "..." : "Voz"}
                </button>
                <button onClick={exportarExcel} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm transition-all">
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

            {/* Selector campaña */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-[#4B5563] uppercase tracking-widest font-mono">Campaña:</span>
                  {campanas.map(c => (
                    <button key={c.id} onClick={async () => { setCampanaActiva(c); if (empresaId) await fetchLotes(empresaId, c.id); }}
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
                  <div><label className={labelClass}>Año inicio</label><input type="number" value={form.año_inicio ?? "2025"} onChange={e => setForm({...form, año_inicio: e.target.value})} className={inputClass + " w-32"} /></div>
                  <div><label className={labelClass}>Año fin</label><input type="number" value={form.año_fin ?? "2026"} onChange={e => setForm({...form, año_fin: e.target.value})} className={inputClass + " w-32"} /></div>
                  <button onClick={crearCampana} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm font-mono">▶ Crear y Migrar</button>
                  <button onClick={() => setShowFormCampana(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form NUEVO LOTE — simplificado */}
            {showFormLote && !loteSeleccionado && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-2xl p-6 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-5">+ NUEVO LOTE</h3>
                {/* Nombre grande */}
                <div className="mb-5">
                  <input type="text" value={form.nombre ?? ""}
                    onChange={e => setForm({...form, nombre: e.target.value})}
                    placeholder="NOMBRE DEL LOTE"
                    className="w-full bg-transparent border-b-2 border-[#00FF80]/40 text-white text-3xl font-bold font-mono focus:outline-none focus:border-[#00FF80] placeholder-[#1a3a2a] pb-2 tracking-widest uppercase transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Has grande */}
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Hectáreas</label>
                    <input type="number" value={form.hectareas ?? ""}
                      onChange={e => setForm({...form, hectareas: e.target.value})}
                      placeholder="0"
                      className="w-full bg-transparent text-[#00FF80] text-3xl font-bold font-mono focus:outline-none placeholder-[#1a3a2a]"
                    />
                    <span className="text-xs text-[#4B5563] font-mono">Ha</span>
                  </div>
                  {/* Tenencia */}
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Tenencia</label>
                    <div className="flex flex-col gap-1.5">
                      {["propio","alquilado","mixto","porcentaje"].map(t => (
                        <button key={t} onClick={() => setForm({...form, tipo_alquiler: t})}
                          className={`text-left text-sm font-mono px-3 py-1.5 rounded-lg transition-all ${form.tipo_alquiler === t || (!form.tipo_alquiler && t === "propio") ? "bg-[#00FF80]/15 text-[#00FF80] border border-[#00FF80]/30" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                          {t === "propio" ? "✓ Propio" : t === "alquilado" ? "🏘️ Alquilado" : t === "mixto" ? "⚡ Mixto" : "% A porcentaje"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Ingeniero */}
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Ingeniero</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({...form, ingeniero_id: e.target.value})} className="w-full bg-transparent text-[#E5E7EB] text-sm font-mono focus:outline-none">
                      <option value="">Sin asignar</option>
                      {ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                    <p className="text-xs text-[#4B5563] font-mono mt-2">El cultivo y demás datos se cargan al entrar al lote</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={guardarLote} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-8 py-3 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Crear Lote</button>
                  <button onClick={() => { setShowFormLote(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-3 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista lotes */}
            {lotes.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">◱</div>
                <p className="text-[#4B5563] font-mono">No hay lotes en esta campaña</p>
              </div>
            ) : vista === "lista" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {lotes.map(l => (
                  <div key={l.id} className="lote-card border border-[#00FF80]/15 rounded-xl overflow-hidden cursor-pointer"
                    style={{ height: "160px", position: "relative" }}
                    onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                    {/* Imagen cultivo de fondo */}
                    <div className="absolute inset-0">
                      <Image
                        src={CULTIVO_IMG[l.cultivo] ?? "/cultivo-default.png"}
                        alt={l.cultivo || "lote"}
                        fill style={{ objectFit: "cover" }}
                        onError={(e) => { (e.target as any).src = "/dashboard-bg.png"; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#020810]/95 via-[#020810]/40 to-transparent" />
                    </div>
                    {/* Botón eliminar */}
                    <button onClick={e => { e.stopPropagation(); eliminarLote(l.id); }}
                      className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-[#020810]/80 text-[#4B5563] hover:text-red-400 text-xs flex items-center justify-center transition-colors">
                      ✕
                    </button>
                    {/* Estado badge */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                        style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563", background: (ESTADO_COLORS[l.estado] ?? "#4B5563") + "25", border: `1px solid ${ESTADO_COLORS[l.estado] ?? "#4B5563"}40` }}>
                        {l.estado?.replace("_"," ")}
                      </span>
                    </div>
                    {/* Info abajo */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
                      <div className="font-bold text-white font-mono text-lg leading-tight">{l.nombre}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[#00FF80] text-xs font-mono font-bold">{l.hectareas} Ha</span>
                        <span className="text-[#4B5563] text-xs font-mono">{l.cultivo?.toUpperCase() || "Sin cultivo"}</span>
                      </div>
                      {l.variedad && <div className="text-xs text-[#4B5563] font-mono mt-0.5">{l.variedad}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(lotesPorCultivo).map(([cultivo, lotesDelCultivo]) => (
                  <div key={cultivo} className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center gap-3">
                      <span className="text-2xl">{CULTIVO_ICONS[cultivo]}</span>
                      <span className="font-bold text-[#E5E7EB] font-mono uppercase">{cultivo}</span>
                      <span className="text-xs text-[#4B5563] font-mono">{lotesDelCultivo.length} lotes · {lotesDelCultivo.reduce((a,l) => a + (l.hectareas ?? 0), 0)} Ha</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                      {lotesDelCultivo.map(l => (
                        <div key={l.id} className="lote-card bg-[#020810]/60 border border-[#00FF80]/10 rounded-lg p-3 cursor-pointer"
                          onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                          <div className="font-bold text-sm text-[#E5E7EB] font-mono">{l.nombre}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{l.hectareas} Ha</div>
                          <div className="text-xs font-mono mt-1" style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563" }}>{l.estado?.replace("_"," ")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== BOTÓN IA FLOTANTE ===== */}
      <button onClick={() => setShowIA(!showIA)}
        className="btn-ia fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#60A5FA]/30 hover:scale-110 transition-all"
        title="Asistente IA Agronómico">
        <Image src="/btn-ia.png" alt="IA" fill style={{ objectFit: "cover" }} />
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#60A5FA]/30 rounded-2xl shadow-2xl shadow-[#60A5FA]/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#60A5FA]/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
              <span className="text-[#60A5FA] text-xs font-mono font-bold">◆ ASISTENTE IA AGRONÓMICO</span>
            </div>
            <button onClick={() => setShowIA(false)} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
            {!aiMsg && !aiLoading && (
              <div className="space-y-1">
                {["Resumen de todos mis lotes","¿Qué lotes necesitan atención urgente?","Calculá el margen bruto total"].map(q => (
                  <button key={q} onClick={() => { askAI(q); }}
                    className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#60A5FA] border border-[#60A5FA]/10 hover:border-[#60A5FA]/30 px-3 py-2 rounded-lg font-mono transition-all">
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
            {aiLoading && <p className="text-[#60A5FA] text-xs font-mono animate-pulse px-2">▶ Analizando...</p>}
            {aiMsg && <p className="text-[#9CA3AF] text-xs font-mono leading-relaxed px-2">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && aiInput.trim() && (askAI(aiInput), setAiInput(""))}
              placeholder="Preguntá algo..." className="flex-1 bg-[#020810]/80 border border-[#60A5FA]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#60A5FA]" />
            <button onClick={() => { if (aiInput.trim()) { askAI(aiInput); setAiInput(""); } }}
              className="px-3 py-2 rounded-lg bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs font-mono">
              ▶
            </button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId} />}
    </div>
  );
}

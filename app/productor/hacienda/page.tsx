"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Tab = "resumen" | "sanidad" | "movimientos" | "pesadas";
type Categoria = {
  id: string; especie: string; categoria: string; cantidad: number;
  peso_promedio: number; campo: string; observaciones: string;
};
type Movimiento = {
  id: string; categoria_id: string; tipo: string; cantidad: number;
  peso_total: number; precio_cabeza: number; precio_kg: number;
  monto_total: number; fecha: string; procedencia: string; destino: string; observaciones: string;
};
type Sanidad = {
  id: string; categoria_id: string; tipo: string; descripcion: string;
  producto: string; dosis: string; cantidad_animales: number;
  fecha: string; proximo_vencimiento: string; veterinario: string; costo: number;
};
type Pesada = {
  id: string; categoria_id: string; cantidad: number;
  peso_promedio: number; peso_total: number; fecha: string; observaciones: string;
};

const ESPECIES: Record<string, { icon: string; color: string; categorias: string[] }> = {
  bovino: { icon: "🐄", color: "#4ADE80", categorias: ["Vaca", "Toro", "Ternero/a", "Vaquillona", "Novillo", "Novillito", "Toro reproductor"] },
  equino: { icon: "🐎", color: "#60A5FA", categorias: ["Yegua", "Padrillo", "Potro/a", "Castrado"] },
  ovino: { icon: "🐑", color: "#C9A227", categorias: ["Oveja", "Carnero", "Cordero/a", "Capón"] },
  porcino: { icon: "🐷", color: "#F9A8D4", categorias: ["Cerda", "Verraco", "Lechón", "Capón porcino"] },
};

export default function HaciendaPage() {
  const [tab, setTab] = useState<Tab>("resumen");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [sanidad, setSanidad] = useState<Sanidad[]>([]);
  const [pesadas, setPesadas] = useState<Pesada[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [filterEspecie, setFilterEspecie] = useState<string>("todos");

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
    await fetchAll(emp.id);
    setLoading(false);
  };

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const [cat, mov, san, pes] = await Promise.all([
      sb.from("hacienda_categorias").select("*").eq("empresa_id", eid).order("especie"),
      sb.from("hacienda_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }).limit(100),
      sb.from("hacienda_sanidad").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("hacienda_pesadas").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
    ]);
    setCategorias(cat.data ?? []);
    setMovimientos(mov.data ?? []);
    setSanidad(san.data ?? []);
    setPesadas(pes.data ?? []);
  };

  const guardarCategoria = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("hacienda_categorias").insert({
      empresa_id: empresaId, especie: form.especie ?? "bovino",
      categoria: form.categoria ?? "", cantidad: Number(form.cantidad ?? 0),
      peso_promedio: Number(form.peso_promedio ?? 0),
      campo: form.campo ?? "", observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const monto = form.precio_cabeza
      ? Number(form.cantidad) * Number(form.precio_cabeza)
      : Number(form.peso_total) * Number(form.precio_kg ?? 0);
    await sb.from("hacienda_movimientos").insert({
      empresa_id: empresaId, categoria_id: form.categoria_id ?? null,
      tipo: form.tipo_mov ?? "compra", cantidad: Number(form.cantidad ?? 0),
      peso_total: Number(form.peso_total ?? 0),
      precio_cabeza: Number(form.precio_cabeza ?? 0),
      precio_kg: Number(form.precio_kg ?? 0),
      monto_total: monto, fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      procedencia: form.procedencia ?? "", destino: form.destino ?? "",
      observaciones: form.observaciones ?? "",
    });
    // Actualizar cantidad en categoría
    if (form.categoria_id) {
      const cat = categorias.find(c => c.id === form.categoria_id);
      if (cat) {
        const delta = ["compra","nacimiento"].includes(form.tipo_mov ?? "") ? Number(form.cantidad) : -Number(form.cantidad);
        await sb.from("hacienda_categorias").update({ cantidad: Math.max(0, cat.cantidad + delta) }).eq("id", form.categoria_id);
      }
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarSanidad = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("hacienda_sanidad").insert({
      empresa_id: empresaId, categoria_id: form.categoria_id ?? null,
      tipo: form.tipo_san ?? "vacunacion", descripcion: form.descripcion ?? "",
      producto: form.producto ?? "", dosis: form.dosis ?? "",
      cantidad_animales: Number(form.cantidad_animales ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      proximo_vencimiento: form.proximo_vencimiento || null,
      veterinario: form.veterinario ?? "", costo: Number(form.costo ?? 0),
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarPesada = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const total = Number(form.cantidad ?? 0) * Number(form.peso_promedio ?? 0);
    await sb.from("hacienda_pesadas").insert({
      empresa_id: empresaId, categoria_id: form.categoria_id ?? null,
      cantidad: Number(form.cantidad ?? 0),
      peso_promedio: Number(form.peso_promedio ?? 0),
      peso_total: total, fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      observaciones: form.observaciones ?? "",
    });
    // Actualizar peso promedio en categoría
    if (form.categoria_id) {
      await sb.from("hacienda_categorias").update({ peso_promedio: Number(form.peso_promedio) }).eq("id", form.categoria_id);
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    const totalCabezas = categorias.reduce((a, c) => a + c.cantidad, 0);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un veterinario y asesor ganadero experto para AgroGestión Pro Argentina. Respondé en español, de forma práctica. Stock actual: ${totalCabezas} cabezas totales. Categorías: ${categorias.map(c => `${c.cantidad} ${c.categoria} (${c.especie})`).join(", ")}. ${prompt}` }]
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
      askAI(`El productor dijo por voz: "${text}". Interpretá qué quiere registrar o consultar sobre hacienda y respondé apropiadamente.`);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  // Alertas sanidad
  const alertasSanidad = sanidad.filter(s => {
    if (!s.proximo_vencimiento) return false;
    const diff = (new Date(s.proximo_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  });

  // Stats
  const totalCabezas = categorias.reduce((a, c) => a + c.cantidad, 0);
  const totalPorEspecie = Object.keys(ESPECIES).map(e => ({
    especie: e, cantidad: categorias.filter(c => c.especie === e).reduce((a, c) => a + c.cantidad, 0)
  })).filter(e => e.cantidad > 0);
  const ventasMes = movimientos.filter(m => {
    const d = new Date(m.fecha); const now = new Date();
    return m.tipo === "venta" && d.getMonth() === now.getMonth();
  }).reduce((a, m) => a + m.monto_total, 0);
  const comprasMes = movimientos.filter(m => {
    const d = new Date(m.fecha); const now = new Date();
    return m.tipo === "compra" && d.getMonth() === now.getMonth();
  }).reduce((a, m) => a + m.monto_total, 0);

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const categoriasFiltradas = categorias.filter(c => filterEspecie === "todos" ? true : c.especie === filterEspecie);

  const tabs = [
    { key: "resumen" as Tab, label: "RESUMEN", icon: "📊" },
    { key: "sanidad" as Tab, label: "SANIDAD", icon: "💉" },
    { key: "movimientos" as Tab, label: "MOVIMIENTOS", icon: "🔄" },
    { key: "pesadas" as Tab, label: "PESADAS", icon: "⚖️" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Hacienda...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .hac-card:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .hac-card { transition: all 0.2s ease; }
        .tab-hac-active { border-color: #4ADE80 !important; color: #4ADE80 !important; background: rgba(74,222,128,0.08) !important; }
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
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* Title */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">🐄 HACIENDA</h1>
            <p className="text-[#4ADE80] text-xs tracking-widest font-mono mt-1">◆ GESTIÓN GANADERA INTEGRAL</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={startVoice}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10"}`}>
              🎤 {listening ? "Escuchando..." : "Consultar por Voz"}
            </button>
            <button onClick={() => { setShowForm(true); setForm({}); }}
              className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/20 font-mono text-sm transition-all">
              + Nueva Categoría
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); setForm({}); }}
              className={`px-5 py-2 rounded-xl border border-[#4ADE80]/15 text-sm font-mono whitespace-nowrap transition-all ${tab === t.key ? "tab-hac-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Alertas sanidad */}
        {alertasSanidad.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono tracking-widest font-bold">⚠️ ALERTAS SANITARIAS ({alertasSanidad.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {alertasSanidad.map(s => {
                const diff = Math.round((new Date(s.proximo_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${diff <= 7 ? "border-[#F87171]/30 bg-[#F87171]/5" : "border-[#C9A227]/30 bg-[#C9A227]/5"}`}>
                    <span>{diff <= 7 ? "🔴" : "🟡"}</span>
                    <div>
                      <div className="text-xs font-bold font-mono" style={{ color: diff <= 7 ? "#F87171" : "#C9A227" }}>{s.descripcion}</div>
                      <div className="text-xs text-[#9CA3AF] font-mono">{diff <= 0 ? "VENCIDO" : `Vence en ${diff} días`} · {s.producto}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* IA */}
        <div className="bg-[#0a1628]/60 border border-[#4ADE80]/15 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="text-[#4ADE80] text-xs font-mono tracking-widest">◆ ASESOR GANADERO IA</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Estado general del rodeo","¿Qué vacunaciones están próximas?","Análisis de margen ganadero del mes","Recomendaciones para la categoría más débil"].map(q => (
              <button key={q} onClick={() => askAI(q)}
                className="text-xs text-[#4B6B5B] hover:text-[#4ADE80] border border-[#4ADE80]/10 hover:border-[#4ADE80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                {q}
              </button>
            ))}
          </div>
          {aiLoading && <p className="text-[#4ADE80] text-xs font-mono mt-3 animate-pulse">▶ Analizando rodeo...</p>}
          {aiMsg && <div className="mt-3 p-3 bg-[#4ADE80]/5 border border-[#4ADE80]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
        </div>

        {/* Form nueva categoría */}
        {showForm && tab === "resumen" && (
          <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-6">
            <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ NUEVA CATEGORÍA</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className={labelClass}>Especie</label>
                <select value={form.especie ?? "bovino"} onChange={e => setForm({ ...form, especie: e.target.value, categoria: "" })} className={inputClass}>
                  {Object.keys(ESPECIES).map(e => <option key={e} value={e}>{ESPECIES[e].icon} {e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Categoría</label>
                <select value={form.categoria ?? ""} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar</option>
                  {(ESPECIES[form.especie ?? "bovino"]?.categorias ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Cantidad (cabezas)</label>
                <input type="number" value={form.cantidad ?? ""} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputClass} placeholder="0" />
              </div>
              <div><label className={labelClass}>Peso promedio (kg)</label>
                <input type="number" value={form.peso_promedio ?? ""} onChange={e => setForm({ ...form, peso_promedio: e.target.value })} className={inputClass} placeholder="0" />
              </div>
              <div><label className={labelClass}>Campo / Potrero</label>
                <input type="text" value={form.campo ?? ""} onChange={e => setForm({ ...form, campo: e.target.value })} className={inputClass} placeholder="Ej: Potrero norte" />
              </div>
              <div className="md:col-span-3"><label className={labelClass}>Observaciones</label>
                <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={guardarCategoria} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#4ADE80]/20 transition-all font-mono">▶ Guardar</button>
              <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
            </div>
          </div>
        )}

        {/* ===== RESUMEN ===== */}
        {tab === "resumen" && (
          <div>
            {/* Stats generales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold font-mono text-[#4ADE80]">{totalCabezas}</div>
                <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mt-1">Total Cabezas</div>
              </div>
              {totalPorEspecie.map(e => (
                <div key={e.especie} className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{ESPECIES[e.especie]?.icon}</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: ESPECIES[e.especie]?.color }}>{e.cantidad}</div>
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono">{e.especie}</div>
                </div>
              ))}
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl p-4 text-center">
                <div className="text-xl font-bold font-mono text-[#4ADE80]">${ventasMes.toLocaleString("es-AR")}</div>
                <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mt-1">Ventas del mes</div>
              </div>
            </div>

            {/* Filtros especie */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setFilterEspecie("todos")}
                className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterEspecie === "todos" ? "border-[#4ADE80] text-[#4ADE80] bg-[#4ADE80]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                TODOS
              </button>
              {Object.keys(ESPECIES).map(e => (
                <button key={e} onClick={() => setFilterEspecie(e)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-mono border transition-all ${filterEspecie === e ? "border-[#4ADE80] text-[#4ADE80] bg-[#4ADE80]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                  {ESPECIES[e].icon} {e.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Categorías */}
            {categoriasFiltradas.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#4ADE80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">🐄</div>
                <p className="text-[#4B5563] font-mono">No hay categorías registradas</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {categoriasFiltradas.map(c => (
                  <div key={c.id} className="hac-card bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{ESPECIES[c.especie]?.icon ?? "🐄"}</span>
                        <div>
                          <div className="font-bold text-[#E5E7EB] font-mono">{c.categoria}</div>
                          <div className="text-xs font-mono" style={{ color: ESPECIES[c.especie]?.color }}>{c.especie.toUpperCase()}</div>
                        </div>
                      </div>
                      <button onClick={() => eliminar("hacienda_categorias", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#020810]/60 rounded-lg p-3">
                        <div className="text-xs text-[#4B5563] font-mono">Cabezas</div>
                        <div className="text-2xl font-bold font-mono text-[#4ADE80]">{c.cantidad}</div>
                      </div>
                      <div className="bg-[#020810]/60 rounded-lg p-3">
                        <div className="text-xs text-[#4B5563] font-mono">Peso prom.</div>
                        <div className="text-2xl font-bold font-mono text-[#C9A227]">{c.peso_promedio} kg</div>
                      </div>
                    </div>
                    {c.campo && <div className="text-xs text-[#4B5563] font-mono mt-3">📍 {c.campo}</div>}
                    {c.observaciones && <div className="text-xs text-[#4B5563] font-mono mt-1">💬 {c.observaciones}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== SANIDAD ===== */}
        {tab === "sanidad" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(true); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/20 font-mono text-sm transition-all">
                + Registrar Sanidad
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ EVENTO SANITARIO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_san ?? "vacunacion"} onChange={e => setForm({ ...form, tipo_san: e.target.value })} className={inputClass}>
                      <option value="vacunacion">Vacunación</option>
                      <option value="desparasitacion">Desparasitación</option>
                      <option value="tratamiento">Tratamiento</option>
                      <option value="revision">Revisión</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Todas las categorías</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie})</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} placeholder="Ej: Vacuna aftosa" />
                  </div>
                  <div><label className={labelClass}>Producto</label>
                    <input type="text" value={form.producto ?? ""} onChange={e => setForm({ ...form, producto: e.target.value })} className={inputClass} placeholder="Nombre del producto" />
                  </div>
                  <div><label className={labelClass}>Dosis</label>
                    <input type="text" value={form.dosis ?? ""} onChange={e => setForm({ ...form, dosis: e.target.value })} className={inputClass} placeholder="Ej: 2ml/cabeza" />
                  </div>
                  <div><label className={labelClass}>Cantidad animales</label>
                    <input type="number" value={form.cantidad_animales ?? ""} onChange={e => setForm({ ...form, cantidad_animales: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Próximo vencimiento</label>
                    <input type="date" value={form.proximo_vencimiento ?? ""} onChange={e => setForm({ ...form, proximo_vencimiento: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Veterinario</label>
                    <input type="text" value={form.veterinario ?? ""} onChange={e => setForm({ ...form, veterinario: e.target.value })} className={inputClass} placeholder="Nombre del veterinario" />
                  </div>
                  <div><label className={labelClass}>Costo</label>
                    <input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarSanidad} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#4ADE80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
              {sanidad.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin eventos sanitarios registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#4ADE80]/10">
                    {["Fecha","Tipo","Descripción","Producto","Dosis","Animales","Próx.Venc.","Veterinario","Costo",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {sanidad.map(s => {
                      const vencido = s.proximo_vencimiento && new Date(s.proximo_vencimiento) < new Date();
                      return (
                        <tr key={s.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.producto}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.dosis}</td>
                          <td className="px-4 py-3 text-xs text-[#4ADE80] font-mono font-bold">{s.cantidad_animales}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: vencido ? "#F87171" : "#9CA3AF" }}>
                            {s.proximo_vencimiento || "—"} {vencido && "⚠️"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.veterinario}</td>
                          <td className="px-4 py-3 text-sm font-bold font-mono text-[#C9A227]">${Number(s.costo).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><button onClick={() => eliminar("hacienda_sanidad", s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== MOVIMIENTOS ===== */}
        {tab === "movimientos" && (
          <div>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-[#4ADE80]">Ventas mes: <strong>${ventasMes.toLocaleString("es-AR")}</strong></span>
                <span className="text-[#F87171]">Compras mes: <strong>${comprasMes.toLocaleString("es-AR")}</strong></span>
              </div>
              <button onClick={() => { setShowForm(true); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/20 font-mono text-sm transition-all">
                + Registrar Movimiento
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ MOVIMIENTO DE HACIENDA</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_mov ?? "compra"} onChange={e => setForm({ ...form, tipo_mov: e.target.value })} className={inputClass}>
                      <option value="compra">Compra</option>
                      <option value="venta">Venta</option>
                      <option value="nacimiento">Nacimiento</option>
                      <option value="muerte">Muerte</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="castracion">Castración</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Sin categoría</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie})</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Cantidad</label>
                    <input type="number" value={form.cantidad ?? ""} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Peso total (kg)</label>
                    <input type="number" value={form.peso_total ?? ""} onChange={e => setForm({ ...form, peso_total: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Precio por cabeza</label>
                    <input type="number" value={form.precio_cabeza ?? ""} onChange={e => setForm({ ...form, precio_cabeza: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Precio por kg</label>
                    <input type="number" value={form.precio_kg ?? ""} onChange={e => setForm({ ...form, precio_kg: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Procedencia / Destino</label>
                    <input type="text" value={form.procedencia ?? ""} onChange={e => setForm({ ...form, procedencia: e.target.value })} className={inputClass} placeholder="Establecimiento" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMovimiento} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#4ADE80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
              {movimientos.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin movimientos registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#4ADE80]/10">
                    {["Fecha","Tipo","Cantidad","Peso","$/Cab","$/Kg","Total","Procedencia",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {movimientos.map(m => (
                      <tr key={m.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.fecha}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${m.tipo === "venta" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : m.tipo === "compra" ? "bg-[#60A5FA]/10 text-[#60A5FA]" : m.tipo === "muerte" ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#C9A227]/10 text-[#C9A227]"}`}>{m.tipo}</span></td>
                        <td className="px-4 py-3 text-sm font-bold font-mono text-[#E5E7EB]">{m.cantidad}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.peso_total ? `${m.peso_total} kg` : "—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.precio_cabeza ? `$${m.precio_cabeza}` : "—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.precio_kg ? `$${m.precio_kg}` : "—"}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{ color: m.tipo === "venta" ? "#4ADE80" : m.tipo === "compra" ? "#60A5FA" : "#F87171" }}>
                          {m.monto_total ? `$${Number(m.monto_total).toLocaleString("es-AR")}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.procedencia || m.destino || "—"}</td>
                        <td className="px-4 py-3"><button onClick={() => eliminar("hacienda_movimientos", m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== PESADAS ===== */}
        {tab === "pesadas" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(true); setForm({}); }}
                className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/20 font-mono text-sm transition-all">
                + Registrar Pesada
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ PESADA</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie})</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Cantidad pesada</label>
                    <input type="number" value={form.cantidad ?? ""} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Peso promedio (kg)</label>
                    <input type="number" value={form.peso_promedio ?? ""} onChange={e => setForm({ ...form, peso_promedio: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas de la pesada" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarPesada} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#4ADE80]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
              {pesadas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin pesadas registradas</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#4ADE80]/10">
                    {["Fecha","Categoría","Cantidad","Peso Prom.","Peso Total","Observaciones",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pesadas.map(p => {
                      const cat = categorias.find(c => c.id === p.categoria_id);
                      return (
                        <tr key={p.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{p.fecha}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{cat ? `${cat.categoria} (${cat.especie})` : "—"}</td>
                          <td className="px-4 py-3 text-sm font-bold font-mono text-[#E5E7EB]">{p.cantidad}</td>
                          <td className="px-4 py-3 text-sm font-bold font-mono text-[#C9A227]">{p.peso_promedio} kg</td>
                          <td className="px-4 py-3 text-sm font-bold font-mono text-[#4ADE80]">{p.peso_total} kg</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{p.observaciones || "—"}</td>
                          <td className="px-4 py-3"><button onClick={() => eliminar("hacienda_pesadas", p.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
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
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono">© AGROGESTION PRO · SISTEMA GANADERO IA</p>
    </div>
  );
}

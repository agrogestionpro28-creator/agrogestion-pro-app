"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "granos" | "insumos" | "gasoil" | "varios";

type InsumoItem = {
  id: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  unidad: string;
  ubicacion: string;
  tipo_ubicacion: string;
  precio_unitario: number;
};

type GranoItem = {
  id: string;
  cultivo: string;
  stock_fisico: number;
  ventas_pactadas: number;
  precio_venta: number;
};

type GasoilItem = {
  id: string;
  cantidad_litros: number;
  ubicacion: string;
  tipo_ubicacion: string;
  precio_litro: number;
};

type VariosItem = {
  id: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  unidad: string;
  ubicacion: string;
};

const CULTIVOS = ["soja", "maiz", "trigo", "girasol", "sorgo", "cebada"];
const CULTIVO_ICONS: Record<string, string> = {
  soja: "🌱", maiz: "🌽", trigo: "🌾", girasol: "🌻", sorgo: "🌿", cebada: "🍃"
};

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("granos");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [granos, setGranos] = useState<GranoItem[]>([]);
  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [gasoil, setGasoil] = useState<GasoilItem[]>([]);
  const [varios, setVarios] = useState<VariosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);

  // Form states
  const [form, setForm] = useState<Record<string, string>>({});

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => {
    const init = async () => {
      const sb = await getSB();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
      if (!u) return;
      let empId = empresaId;
      if (!empId) {
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
        if (emp) { setEmpresaId(emp.id); empId = emp.id; }
      }
      if (!empId) { setLoading(false); return; }
      await fetchAll(empId);
      setLoading(false);
    };
    init();
  }, []);

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id");
    const [g, ins, gas, var_] = await Promise.all([
      sb.from("stock_granos").select("*").eq("empresa_id", eid).eq("campana_id", campanaId ?? ""),
      sb.from("stock_insumos").select("*").eq("empresa_id", eid).order("categoria"),
      sb.from("stock_gasoil").select("*").eq("empresa_id", eid),
      sb.from("stock_varios").select("*").eq("empresa_id", eid),
    ]);
    setGranos(g.data ?? []);
    setInsumos(ins.data ?? []);
    setGasoil(gas.data ?? []);
    setVarios(var_.data ?? []);
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
          messages: [{ role: "user", content: `Sos un asistente de gestión agropecuaria para AgroGestión Pro. Respondé en español, de forma concisa y práctica. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch {
      setAiMsg("Error al conectar con IA");
    }
    setAiLoading(false);
  };

  const startVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Tu navegador no soporta reconocimiento de voz");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    setListening(true);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setListening(false);
      askAI(`El usuario dijo por voz: "${text}". Interpretá qué quiere cargar en el stock y respondé con los datos estructurados para registrar.`);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const guardarGrano = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id") ?? "";
    const existing = granos.find(g => g.cultivo === form.cultivo);
    if (existing) {
      await sb.from("stock_granos").update({
        stock_fisico: Number(form.stock_fisico ?? existing.stock_fisico),
        ventas_pactadas: Number(form.ventas_pactadas ?? existing.ventas_pactadas),
        precio_venta: Number(form.precio_venta ?? existing.precio_venta),
      }).eq("id", existing.id);
    } else {
      await sb.from("stock_granos").insert({
        empresa_id: empresaId, campana_id: campanaId,
        cultivo: form.cultivo, stock_fisico: Number(form.stock_fisico ?? 0),
        ventas_pactadas: Number(form.ventas_pactadas ?? 0), precio_venta: Number(form.precio_venta ?? 0),
      });
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_insumos").insert({
      empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "otro",
      cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "kg",
      ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio",
      precio_unitario: Number(form.precio_unitario ?? 0),
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarGasoil = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_gasoil").insert({
      empresa_id: empresaId, cantidad_litros: Number(form.cantidad_litros ?? 0),
      ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "tanque_propio",
      precio_litro: Number(form.precio_litro ?? 0),
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_varios").insert({
      empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general",
      cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "",
    });
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const tabs: { key: Tab; label: string; icon: string; color: string }[] = [
    { key: "granos", label: "Libro de Granos", icon: "🌾", color: "#C9A227" },
    { key: "insumos", label: "Insumos", icon: "🧪", color: "#4ADE80" },
    { key: "gasoil", label: "Gasoil", icon: "⛽", color: "#60A5FA" },
    { key: "varios", label: "Stock Varios", icon: "🔧", color: "#A78BFA" },
  ];

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1.5 font-mono";

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 10px rgba(0,255,128,.2)} 50%{box-shadow:0 0 25px rgba(0,255,128,.5)} }
        @keyframes border-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .tab-active { border-color: #00FF80 !important; color: #00FF80 !important; background: rgba(0,255,128,0.08) !important; }
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
        <button onClick={() => window.location.href = "/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
          ← Dashboard
        </button>
        <div className="flex-1" />
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">

        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">▣ STOCK</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ SISTEMA DE INVENTARIO IA</p>
          </div>
          <div className="flex gap-3">
            {/* Botón voz */}
            <button
              onClick={startVoice}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 bg-red-400/10 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}
            >
              🎤 {listening ? "Escuchando..." : "Cargar por Voz"}
            </button>
            <button
              onClick={() => { setShowForm(!showForm); setForm({}); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all"
            >
              + Cargar Stock
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setShowForm(false); }}
              className={`px-4 py-2 rounded-xl border border-[#00FF80]/15 text-sm font-mono transition-all ${tab === t.key ? "tab-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* IA Panel */}
        <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
            <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ ASISTENTE IA — STOCK AGRO</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              "¿Cuánto insumo me queda según las recetas del ingeniero?",
              "¿Cuándo debo reabastecer gasoil?",
              "Análisis del stock actual",
            ].map(q => (
              <button key={q} onClick={() => askAI(q)}
                className="text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                {q}
              </button>
            ))}
          </div>
          {aiLoading && <p className="text-[#00FF80] text-xs font-mono mt-3 animate-pulse">▶ Analizando datos...</p>}
          {aiMsg && (
            <div className="mt-3 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg">
              <p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p>
            </div>
          )}
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="relative bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-6 mb-6">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00FF80]/50 to-transparent rounded-t-xl" />
            <h3 className="text-[#00FF80] font-mono font-bold mb-5 text-sm tracking-widest">+ CARGAR {tab.toUpperCase()}</h3>

            {tab === "granos" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Cultivo</label>
                  <select value={form.cultivo ?? ""} onChange={e => setForm({ ...form, cultivo: e.target.value })} className={inputClass}>
                    <option value="">Seleccionar</option>
                    {CULTIVOS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Stock Físico (tn)</label>
                  <input type="number" value={form.stock_fisico ?? ""} onChange={e => setForm({ ...form, stock_fisico: e.target.value })} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Ventas Pactadas (tn)</label>
                  <input type="number" value={form.ventas_pactadas ?? ""} onChange={e => setForm({ ...form, ventas_pactadas: e.target.value })} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Precio ($/tn)</label>
                  <input type="number" value={form.precio_venta ?? ""} onChange={e => setForm({ ...form, precio_venta: e.target.value })} className={inputClass} placeholder="0" />
                </div>
              </div>
            )}

            {tab === "insumos" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Glifosato" />
                </div>
                <div>
                  <label className={labelClass}>Categoría</label>
                  <select value={form.categoria ?? ""} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputClass}>
                    <option value="">Seleccionar</option>
                    <option value="semilla">Semilla</option>
                    <option value="fertilizante">Fertilizante</option>
                    <option value="agroquimico">Agroquímico</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Cantidad</label>
                  <input type="number" value={form.cantidad ?? ""} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Unidad</label>
                  <select value={form.unidad ?? "kg"} onChange={e => setForm({ ...form, unidad: e.target.value })} className={inputClass}>
                    <option value="kg">kg</option>
                    <option value="litros">Litros</option>
                    <option value="bolsas">Bolsas</option>
                    <option value="unidad">Unidad</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Ubicación</label>
                  <select value={form.tipo_ubicacion ?? ""} onChange={e => setForm({ ...form, tipo_ubicacion: e.target.value })} className={inputClass}>
                    <option value="deposito_propio">Depósito Propio</option>
                    <option value="comercio">Comercio</option>
                    <option value="cooperativa">Cooperativa</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nombre lugar</label>
                  <input type="text" value={form.ubicacion ?? ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className={inputClass} placeholder="Ej: ACA Rafaela" />
                </div>
              </div>
            )}

            {tab === "gasoil" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Litros</label>
                  <input type="number" value={form.cantidad_litros ?? ""} onChange={e => setForm({ ...form, cantidad_litros: e.target.value })} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Ubicación</label>
                  <select value={form.tipo_ubicacion ?? ""} onChange={e => setForm({ ...form, tipo_ubicacion: e.target.value })} className={inputClass}>
                    <option value="tanque_propio">Tanque Propio</option>
                    <option value="proveedor">En Proveedor</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nombre lugar</label>
                  <input type="text" value={form.ubicacion ?? ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className={inputClass} placeholder="Ej: YPF Ruta 34" />
                </div>
                <div>
                  <label className={labelClass}>Precio por litro</label>
                  <input type="number" value={form.precio_litro ?? ""} onChange={e => setForm({ ...form, precio_litro: e.target.value })} className={inputClass} placeholder="0" />
                </div>
              </div>
            )}

            {tab === "varios" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Correa trilladora" />
                </div>
                <div>
                  <label className={labelClass}>Categoría</label>
                  <input type="text" value={form.categoria ?? ""} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputClass} placeholder="Ej: Repuesto" />
                </div>
                <div>
                  <label className={labelClass}>Cantidad</label>
                  <input type="number" value={form.cantidad ?? ""} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Unidad</label>
                  <input type="text" value={form.unidad ?? ""} onChange={e => setForm({ ...form, unidad: e.target.value })} className={inputClass} placeholder="Ej: unidad, kg, m" />
                </div>
                <div>
                  <label className={labelClass}>Ubicación</label>
                  <input type="text" value={form.ubicacion ?? ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className={inputClass} placeholder="Ej: Galpón norte" />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={tab === "granos" ? guardarGrano : tab === "insumos" ? guardarInsumo : tab === "gasoil" ? guardarGasoil : guardarVarios}
                className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono"
              >
                ▶ Guardar
              </button>
              <button onClick={() => { setShowForm(false); setForm({}); }}
                className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm hover:text-[#9CA3AF] transition-all font-mono">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Contenido por tab */}
        {loading ? (
          <div className="text-center py-20 text-[#00FF80] font-mono animate-pulse">▶ Cargando inventario...</div>
        ) : (
          <>
            {/* GRANOS */}
            {tab === "granos" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {CULTIVOS.map(cultivo => {
                  const g = granos.find(x => x.cultivo === cultivo);
                  const balance = (g?.stock_fisico ?? 0) - (g?.ventas_pactadas ?? 0);
                  return (
                    <div key={cultivo} className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden hover:border-[#C9A227]/40 transition-all">
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{CULTIVO_ICONS[cultivo]}</span>
                            <span className="font-bold text-[#E5E7EB] uppercase tracking-wider text-sm font-mono">{cultivo}</span>
                          </div>
                          {g && (
                            <button onClick={() => eliminarItem("stock_granos", g.id)} className="text-[#4B5563] hover:text-red-400 transition-colors text-xs">✕</button>
                          )}
                        </div>
                        <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-1">Posición Comercial</div>
                        <div className="space-y-2 mt-3">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#4B6B5B]">Stock Físico</span>
                            <span className="text-[#E5E7EB]">{g?.stock_fisico ?? 0} tn</span>
                          </div>
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#4B6B5B]">Ventas Pactadas</span>
                            <span className="text-[#60A5FA]">{g?.ventas_pactadas ?? 0} tn</span>
                          </div>
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#4B6B5B]">Precio</span>
                            <span className="text-[#C9A227]">$ {g?.precio_venta ?? 0}/tn</span>
                          </div>
                          <div className="h-px bg-[#00FF80]/10 my-2" />
                          <div className="flex justify-between text-sm font-bold font-mono">
                            <span className="text-[#4B6B5B]">Balance Neto</span>
                            <span style={{ color: balance >= 0 ? "#4ADE80" : "#F87171" }}>{balance} tn</span>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 bg-[#0F1115] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#00FF80] to-[#C9A227] transition-all"
                            style={{ width: `${Math.min(100, g ? (g.stock_fisico / Math.max(g.stock_fisico, 1)) * 100 : 0)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* INSUMOS */}
            {tab === "insumos" && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                {insumos.length === 0 ? (
                  <div className="text-center py-16 text-[#4B5563] font-mono">Sin insumos registrados</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#00FF80]/10">
                        {["Producto", "Categoría", "Cantidad", "Ubicación", "Precio Unit.", ""].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insumos.map(i => (
                        <tr key={i.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5 transition-colors">
                          <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono">{i.nombre}</td>
                          <td className="px-5 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-1 rounded font-mono">{i.categoria}</span></td>
                          <td className="px-5 py-3 text-sm text-[#00FF80] font-mono font-bold">{i.cantidad} {i.unidad}</td>
                          <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{i.tipo_ubicacion?.replace("_", " ")} {i.ubicacion ? `· ${i.ubicacion}` : ""}</td>
                          <td className="px-5 py-3 text-sm text-[#C9A227] font-mono">$ {i.precio_unitario}</td>
                          <td className="px-5 py-3"><button onClick={() => eliminarItem("stock_insumos", i.id)} className="text-[#4B5563] hover:text-red-400 transition-colors text-xs">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* GASOIL */}
            {tab === "gasoil" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gasoil.length === 0 ? (
                  <div className="col-span-2 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl">Sin stock de gasoil registrado</div>
                ) : gasoil.map(g => (
                  <div key={g.id} className="bg-[#0a1628]/80 border border-[#60A5FA]/20 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">⛽</span>
                        <span className="font-bold text-[#60A5FA] font-mono text-sm uppercase tracking-wider">
                          {g.tipo_ubicacion?.replace("_", " ")}
                        </span>
                      </div>
                      <button onClick={() => eliminarItem("stock_gasoil", g.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="text-3xl font-bold text-[#E5E7EB] font-mono">{g.cantidad_litros} L</div>
                    <div className="text-xs text-[#4B5563] font-mono mt-1">{g.ubicacion}</div>
                    <div className="text-sm text-[#C9A227] font-mono mt-2">$ {g.precio_litro}/L</div>
                  </div>
                ))}
              </div>
            )}

            {/* VARIOS */}
            {tab === "varios" && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                {varios.length === 0 ? (
                  <div className="text-center py-16 text-[#4B5563] font-mono">Sin stock registrado</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#00FF80]/10">
                        {["Producto", "Categoría", "Cantidad", "Ubicación", ""].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {varios.map(v => (
                        <tr key={v.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5 transition-colors">
                          <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono">{v.nombre}</td>
                          <td className="px-5 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-1 rounded font-mono">{v.categoria}</span></td>
                          <td className="px-5 py-3 text-sm text-[#00FF80] font-mono font-bold">{v.cantidad} {v.unidad}</td>
                          <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{v.ubicacion}</td>
                          <td className="px-5 py-3"><button onClick={() => eliminarItem("stock_varios", v.id)} className="text-[#4B5563] hover:text-red-400 transition-colors text-xs">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {empresaId && <EscanerIA empresaId={empresaId} />}
    </div>
  );
}

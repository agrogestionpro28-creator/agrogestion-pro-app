"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Categoria = "todos" | "maquinaria" | "servicios" | "campos" | "trabajo" | "insumos_cotizacion" | "granos" | "general";
type Publicacion = {
  id: string; usuario_id: string; empresa_id: string;
  categoria: string; tipo: string; titulo: string; descripcion: string;
  precio: number; precio_tipo: string; moneda: string;
  provincia: string; localidad: string;
  contacto_nombre: string; contacto_telefono: string; contacto_email: string;
  foto_url: string; estado: string; destacada: boolean; vistas: number;
  fecha_vencimiento: string; created_at: string;
};
type Cotizacion = {
  id: string; publicacion_id: string; proveedor_id: string;
  precio: number; descripcion: string; condiciones: string;
  validez_dias: number; estado: string; created_at: string;
};

const CATEGORIAS: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  todos:               { label: "Todo",                 icon: "🏪", color: "#00FF80", desc: "" },
  maquinaria:          { label: "Maquinaria",           icon: "🚜", color: "#C9A227", desc: "Tractores, cosechadoras, implementos" },
  servicios:           { label: "Servicios",            icon: "⚙️", color: "#60A5FA", desc: "Pulverización, siembra, cosecha, fletes" },
  campos:              { label: "Campos",               icon: "🏘️", color: "#4ADE80", desc: "Alquiler y venta de campos" },
  trabajo:             { label: "Trabajo",              icon: "👷", color: "#FB923C", desc: "Empleos y búsqueda laboral agropecuaria" },
  insumos_cotizacion:  { label: "Cotizar Insumos",      icon: "🧪", color: "#A78BFA", desc: "Pedí precios a múltiples proveedores" },
  granos:              { label: "Granos",               icon: "🌾", color: "#C9A227", desc: "Compra y venta entre productores" },
  general:             { label: "General",              icon: "📢", color: "#9CA3AF", desc: "Avisos varios" },
};

const PROVINCIAS = ["Buenos Aires","Córdoba","Santa Fe","Entre Ríos","La Pampa","Mendoza","San Luis","Santiago del Estero","Chaco","Tucumán","Salta","Formosa","Misiones","Corrientes","Jujuy","Río Negro","Neuquén","Chubut","Santa Cruz","Tierra del Fuego","San Juan","La Rioja","Catamarca"];

export default function MarketplacePage() {
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState<Categoria>("todos");
  const [vista, setVista] = useState<"explorar" | "publicar" | "mis_publicaciones" | "detalle">("explorar");
  const [pubSel, setPubSel] = useState<Publicacion | null>(null);
  const [showFormCotizar, setShowFormCotizar] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [filtroProvince, setFiltroProvince] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

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
    setUsuarioId(u.id);
    setNombreUsuario(u.nombre);
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (emp) setEmpresaId(emp.id);
    await fetchPublicaciones();
    setLoading(false);
  };

  const fetchPublicaciones = async () => {
    const sb = await getSB();
    const { data } = await sb.from("marketplace_publicaciones").select("*").eq("estado", "activa").order("destacada", { ascending: false }).order("created_at", { ascending: false });
    setPublicaciones(data ?? []);
  };

  const fetchCotizaciones = async (pubId: string) => {
    const sb = await getSB();
    const { data } = await sb.from("marketplace_cotizaciones").select("*").eq("publicacion_id", pubId).order("created_at", { ascending: false });
    setCotizaciones(data ?? []);
  };

  const publicar = async () => {
    if (!usuarioId || !empresaId) return;
    if (!form.titulo || !form.categoria) { setMsg("Completá título y categoría"); return; }
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("nombre").eq("id", usuarioId).single();
    await sb.from("marketplace_publicaciones").insert({
      usuario_id: usuarioId, empresa_id: empresaId,
      categoria: form.categoria, tipo: form.tipo ?? "venta",
      titulo: form.titulo, descripcion: form.descripcion ?? "",
      precio: Number(form.precio ?? 0), precio_tipo: form.precio_tipo ?? "fijo",
      moneda: "ARS", provincia: form.provincia ?? "", localidad: form.localidad ?? "",
      contacto_nombre: form.contacto_nombre || u?.nombre || nombreUsuario,
      contacto_telefono: form.contacto_telefono ?? "",
      contacto_email: form.contacto_email ?? "",
      foto_url: form.foto_url ?? "", estado: "activa",
      fecha_vencimiento: form.fecha_vencimiento || null,
    });
    setMsg("✅ Publicación creada exitosamente");
    await fetchPublicaciones();
    setVista("mis_publicaciones"); setForm({});
  };

  const enviarCotizacion = async () => {
    if (!usuarioId || !pubSel) return;
    const sb = await getSB();
    await sb.from("marketplace_cotizaciones").insert({
      publicacion_id: pubSel.id, proveedor_id: usuarioId,
      precio: Number(form.cot_precio ?? 0),
      descripcion: form.cot_descripcion ?? "",
      condiciones: form.cot_condiciones ?? "",
      validez_dias: Number(form.cot_validez ?? 7),
      estado: "pendiente",
    });
    setMsg("✅ Cotización enviada");
    await fetchCotizaciones(pubSel.id);
    setShowFormCotizar(false); setForm({});
  };

  const marcarVendida = async (id: string) => {
    const sb = await getSB();
    await sb.from("marketplace_publicaciones").update({ estado: "vendida" }).eq("id", id);
    await fetchPublicaciones();
    setVista("mis_publicaciones");
  };

  const eliminarPub = async (id: string) => {
    if (!confirm("¿Eliminar publicación?")) return;
    const sb = await getSB();
    await sb.from("marketplace_publicaciones").delete().eq("id", id);
    await fetchPublicaciones();
  };

  const sumarVista = async (pub: Publicacion) => {
    const sb = await getSB();
    await sb.from("marketplace_publicaciones").update({ vistas: (pub.vistas ?? 0) + 1 }).eq("id", pub.id);
    setPubSel({ ...pub, vistas: (pub.vistas ?? 0) + 1 });
    await fetchCotizaciones(pub.id);
    setVista("detalle");
  };

  const askAI = async (titulo: string, cat: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          messages: [{ role: "user", content: `Sos un experto en mercado agropecuario argentino. Para una publicación de "${titulo}" en la categoría "${cat}", sugerí un precio de mercado razonable en pesos argentinos para hoy. Respondé en 2-3 líneas con el rango de precio y los factores que lo afectan. Sé conciso y práctico.` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "");
    } catch { setAiMsg(""); }
    setAiLoading(false);
  };

  const formatPrecio = (pub: Publicacion) => {
    if (!pub.precio || pub.precio === 0) return "A convenir";
    const p = Number(pub.precio).toLocaleString("es-AR");
    const sufijos: Record<string, string> = { fijo: "", por_ha: "/ha", por_hora: "/hora", por_tn: "/tn", a_convenir: "" };
    return `$${p}${sufijos[pub.precio_tipo] ?? ""}`;
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const pubsFiltradas = publicaciones.filter(p => {
    const matchCat = categoriaActiva === "todos" ? true : p.categoria === categoriaActiva;
    const matchProv = filtroProvince ? p.provincia === filtroProvince : true;
    const matchBus = busqueda ? p.titulo.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) : true;
    return matchCat && matchProv && matchBus;
  });

  const misPublicaciones = publicaciones.filter(p => p.usuario_id === usuarioId);

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Marketplace...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .pub-card:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .pub-card { transition: all 0.2s ease; }
        .cat-active { border-color: #00FF80 !important; color: #00FF80 !important; background: rgba(0,255,128,0.08) !important; }
        .vista-active { border-color: #C9A227 !important; color: #C9A227 !important; background: rgba(201,162,39,0.08) !important; }
      `}</style>

      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/88" />
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

        {/* Title + acciones */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">🏪 MARKETPLACE</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ MERCADO AGROPECUARIO DIGITAL · {publicaciones.length} PUBLICACIONES ACTIVAS</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "explorar", label: "🔍 Explorar" },
              { key: "publicar", label: "+ Publicar" },
              { key: "mis_publicaciones", label: "📋 Mis Publicaciones" },
            ].map(v => (
              <button key={v.key} onClick={() => { setVista(v.key as any); setMsg(""); setPubSel(null); }}
                className={`px-4 py-2 rounded-xl border font-mono text-sm transition-all ${vista === v.key ? "vista-active" : "border-[#00FF80]/20 text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mensaje */}
        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg} <button onClick={() => setMsg("")} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ===== EXPLORAR ===== */}
        {vista === "explorar" && !pubSel && (
          <div>
            {/* Categorías */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1 flex-wrap">
              {Object.entries(CATEGORIAS).map(([key, config]) => (
                <button key={key} onClick={() => setCategoriaActiva(key as Categoria)}
                  className={`px-4 py-2 rounded-xl border text-sm font-mono whitespace-nowrap transition-all flex items-center gap-1.5 ${categoriaActiva === key ? "cat-active border-[#00FF80]" : "border-[#00FF80]/15 text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                  <span>{config.icon}</span> {config.label}
                  <span className="text-xs opacity-50">({key === "todos" ? publicaciones.length : publicaciones.filter(p => p.categoria === key).length})</span>
                </button>
              ))}
            </div>

            {/* Filtros */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar publicaciones..." className="bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono flex-1 min-w-48" />
              <select value={filtroProvince} onChange={e => setFiltroProvince(e.target.value)}
                className="bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono">
                <option value="">Todas las provincias</option>
                {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Grid publicaciones */}
            {pubsFiltradas.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">🏪</div>
                <p className="text-[#4B5563] font-mono">Sin publicaciones en esta categoría</p>
                <button onClick={() => setVista("publicar")} className="mt-4 text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-4 py-2 rounded-lg hover:bg-[#00FF80]/10 transition-all">
                  + Publicar primero
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pubsFiltradas.map(p => {
                  const config = CATEGORIAS[p.categoria];
                  return (
                    <div key={p.id} className="pub-card bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden cursor-pointer"
                      onClick={() => sumarVista(p)}>
                      {/* Foto o placeholder */}
                      <div className="relative h-36 bg-[#020810]/60 flex items-center justify-center overflow-hidden">
                        {p.foto_url ? (
                          <img src={p.foto_url} alt={p.titulo} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-5xl opacity-30">{config?.icon}</span>
                        )}
                        {p.destacada && (
                          <div className="absolute top-2 left-2 bg-[#C9A227] text-[#020810] text-xs px-2 py-0.5 rounded font-bold font-mono">⭐ DESTACADO</div>
                        )}
                        <div className="absolute top-2 right-2">
                          <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: config?.color + "20", color: config?.color, border: `1px solid ${config?.color}40` }}>
                            {config?.icon} {config?.label}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="font-bold text-[#E5E7EB] font-mono mb-1 line-clamp-2">{p.titulo}</div>
                        {p.descripcion && <div className="text-xs text-[#4B5563] font-mono mb-3 line-clamp-2">{p.descripcion}</div>}
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold font-mono text-[#C9A227]">{formatPrecio(p)}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{p.provincia || "—"}</div>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#00FF80]/5">
                          <div className="text-xs text-[#4B5563] font-mono">👁 {p.vistas} vistas</div>
                          <div className="text-xs text-[#4B5563] font-mono">{p.contacto_nombre}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== DETALLE PUBLICACIÓN ===== */}
        {vista === "detalle" && pubSel && (
          <div>
            <button onClick={() => { setVista("explorar"); setPubSel(null); setCotizaciones([]); }}
              className="text-[#4B5563] hover:text-[#00FF80] font-mono text-sm mb-6 transition-colors">
              ← Volver al Marketplace
            </button>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Info principal */}
              <div className="md:col-span-2">
                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden mb-4">
                  {pubSel.foto_url ? (
                    <img src={pubSel.foto_url} alt={pubSel.titulo} className="w-full h-64 object-cover" />
                  ) : (
                    <div className="h-40 flex items-center justify-center bg-[#020810]/60">
                      <span className="text-6xl opacity-20">{CATEGORIAS[pubSel.categoria]?.icon}</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs px-2 py-0.5 rounded font-mono mb-2 inline-block" style={{ background: CATEGORIAS[pubSel.categoria]?.color + "20", color: CATEGORIAS[pubSel.categoria]?.color }}>
                          {CATEGORIAS[pubSel.categoria]?.icon} {CATEGORIAS[pubSel.categoria]?.label}
                        </span>
                        <h2 className="text-xl font-bold text-[#E5E7EB] font-mono">{pubSel.titulo}</h2>
                      </div>
                      <div className="text-2xl font-bold font-mono text-[#C9A227]">{formatPrecio(pubSel)}</div>
                    </div>
                    {pubSel.descripcion && (
                      <p className="text-sm text-[#9CA3AF] font-mono mb-4 leading-relaxed">{pubSel.descripcion}</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      {pubSel.provincia && <div><span className="text-[#4B5563]">📍 Ubicación: </span><span className="text-[#9CA3AF]">{pubSel.localidad ? `${pubSel.localidad}, ` : ""}{pubSel.provincia}</span></div>}
                      <div><span className="text-[#4B5563]">👁 Vistas: </span><span className="text-[#9CA3AF]">{pubSel.vistas}</span></div>
                      {pubSel.fecha_vencimiento && <div><span className="text-[#4B5563]">📅 Válida hasta: </span><span className="text-[#9CA3AF]">{pubSel.fecha_vencimiento}</span></div>}
                    </div>
                  </div>
                </div>

                {/* Cotizaciones recibidas (si es cotizacion) */}
                {pubSel.categoria === "insumos_cotizacion" && (
                  <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[#A78BFA] font-mono font-bold">🧪 COTIZACIONES RECIBIDAS ({cotizaciones.length})</h3>
                      <button onClick={() => setShowFormCotizar(true)}
                        className="px-3 py-1.5 rounded-lg bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-xs hover:bg-[#A78BFA]/20 transition-all">
                        + Cotizar
                      </button>
                    </div>
                    {showFormCotizar && (
                      <div className="bg-[#020810]/60 border border-[#A78BFA]/20 rounded-xl p-4 mb-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelClass}>Precio</label>
                            <input type="number" value={form.cot_precio ?? ""} onChange={e => setForm({ ...form, cot_precio: e.target.value })} className={inputClass} placeholder="0" />
                          </div>
                          <div><label className={labelClass}>Validez (días)</label>
                            <input type="number" value={form.cot_validez ?? "7"} onChange={e => setForm({ ...form, cot_validez: e.target.value })} className={inputClass} />
                          </div>
                          <div className="col-span-2"><label className={labelClass}>Descripción</label>
                            <input type="text" value={form.cot_descripcion ?? ""} onChange={e => setForm({ ...form, cot_descripcion: e.target.value })} className={inputClass} placeholder="Marca, calidad, incluye flete, etc." />
                          </div>
                          <div className="col-span-2"><label className={labelClass}>Condiciones</label>
                            <input type="text" value={form.cot_condiciones ?? ""} onChange={e => setForm({ ...form, cot_condiciones: e.target.value })} className={inputClass} placeholder="Forma de pago, entrega, etc." />
                          </div>
                        </div>
                        <div className="flex gap-3 mt-3">
                          <button onClick={enviarCotizacion} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-4 py-2 rounded-xl text-sm font-mono">▶ Enviar</button>
                          <button onClick={() => setShowFormCotizar(false)} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                        </div>
                      </div>
                    )}
                    {cotizaciones.length === 0 ? (
                      <p className="text-[#4B5563] font-mono text-sm text-center py-6">Sin cotizaciones aún</p>
                    ) : (
                      <div className="space-y-3">
                        {cotizaciones.map(c => (
                          <div key={c.id} className="bg-[#020810]/60 border border-[#A78BFA]/10 rounded-xl p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-bold text-[#C9A227] font-mono text-lg">${Number(c.precio).toLocaleString("es-AR")}</div>
                              <span className="text-xs text-[#4B5563] font-mono">Válida {c.validez_dias} días</span>
                            </div>
                            {c.descripcion && <p className="text-xs text-[#9CA3AF] font-mono">{c.descripcion}</p>}
                            {c.condiciones && <p className="text-xs text-[#4B5563] font-mono mt-1">📋 {c.condiciones}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Panel contacto */}
              <div>
                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 mb-4">
                  <h3 className="text-[#00FF80] font-mono font-bold mb-4">📞 CONTACTO</h3>
                  <div className="space-y-3 mb-5">
                    <div className="text-sm font-bold text-[#E5E7EB] font-mono">{pubSel.contacto_nombre}</div>
                    {pubSel.contacto_telefono && (
                      <div className="text-xs text-[#9CA3AF] font-mono">📱 {pubSel.contacto_telefono}</div>
                    )}
                    {pubSel.contacto_email && (
                      <div className="text-xs text-[#9CA3AF] font-mono">✉️ {pubSel.contacto_email}</div>
                    )}
                  </div>
                  {pubSel.contacto_telefono && (
                    <a href={`https://wa.me/54${pubSel.contacto_telefono.replace(/\D/g,"")}?text=Hola! Vi tu publicación "${pubSel.titulo}" en AgroGestión Pro y me interesa.`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold font-mono text-sm hover:bg-[#25D366]/20 transition-all">
                      💬 Contactar por WhatsApp
                    </a>
                  )}
                  {pubSel.contacto_email && (
                    <a href={`mailto:${pubSel.contacto_email}?subject=Consulta por ${pubSel.titulo} - AgroGestión Pro`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm hover:bg-[#60A5FA]/10 transition-all mt-2">
                      ✉️ Enviar Email
                    </a>
                  )}
                </div>

                {/* IA precio de mercado */}
                <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-[#C9A227] animate-pulse" />
                    <span className="text-[#C9A227] text-xs font-mono tracking-widest">◆ PRECIO DE MERCADO IA</span>
                  </div>
                  <button onClick={() => askAI(pubSel.titulo, pubSel.categoria)}
                    className="w-full py-2 rounded-lg border border-[#C9A227]/20 text-[#C9A227] text-xs font-mono hover:bg-[#C9A227]/10 transition-all">
                    ¿Es un buen precio? Consultá a la IA
                  </button>
                  {aiLoading && <p className="text-[#C9A227] text-xs font-mono mt-2 animate-pulse">▶ Analizando...</p>}
                  {aiMsg && <p className="text-[#9CA3AF] text-xs font-mono mt-2 leading-relaxed">{aiMsg}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== PUBLICAR ===== */}
        {vista === "publicar" && (
          <div className="max-w-3xl">
            <h2 className="text-lg font-bold font-mono text-[#E5E7EB] mb-6">+ NUEVA PUBLICACIÓN</h2>
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Categoría</label>
                  <select value={form.categoria ?? ""} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputClass}>
                    <option value="">Seleccionar</option>
                    {Object.entries(CATEGORIAS).filter(([k]) => k !== "todos").map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div><label className={labelClass}>Tipo</label>
                  <select value={form.tipo ?? "venta"} onChange={e => setForm({ ...form, tipo: e.target.value })} className={inputClass}>
                    <option value="venta">Vendo</option>
                    <option value="compra">Busco / Compro</option>
                    <option value="alquiler">Alquilo</option>
                    <option value="servicio">Ofrezco servicio</option>
                    <option value="trabajo">Oferta/Búsqueda laboral</option>
                    <option value="cotizacion">Solicito cotización</option>
                  </select>
                </div>
                <div><label className={labelClass}>Precio tipo</label>
                  <select value={form.precio_tipo ?? "fijo"} onChange={e => setForm({ ...form, precio_tipo: e.target.value })} className={inputClass}>
                    <option value="fijo">Precio fijo</option>
                    <option value="a_convenir">A convenir</option>
                    <option value="por_ha">Por hectárea</option>
                    <option value="por_hora">Por hora</option>
                    <option value="por_tn">Por tonelada</option>
                  </select>
                </div>
                <div className="md:col-span-3"><label className={labelClass}>Título</label>
                  <input type="text" value={form.titulo ?? ""} onChange={e => setForm({ ...form, titulo: e.target.value })} className={inputClass} placeholder="Ej: Vendo tractor John Deere 6110J 2018" />
                </div>
                <div className="md:col-span-3"><label className={labelClass}>Descripción</label>
                  <textarea value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })}
                    className={inputClass + " h-24 resize-none"} placeholder="Describí el producto o servicio en detalle..." />
                </div>
                <div><label className={labelClass}>Precio ($)</label>
                  <input type="number" value={form.precio ?? ""} onChange={e => setForm({ ...form, precio: e.target.value })} className={inputClass} placeholder="0 = A convenir" />
                </div>
                <div><label className={labelClass}>Provincia</label>
                  <select value={form.provincia ?? ""} onChange={e => setForm({ ...form, provincia: e.target.value })} className={inputClass}>
                    <option value="">Seleccionar</option>
                    {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Localidad</label>
                  <input type="text" value={form.localidad ?? ""} onChange={e => setForm({ ...form, localidad: e.target.value })} className={inputClass} placeholder="Ej: Venado Tuerto" />
                </div>
                <div><label className={labelClass}>Tu nombre</label>
                  <input type="text" value={form.contacto_nombre ?? nombreUsuario} onChange={e => setForm({ ...form, contacto_nombre: e.target.value })} className={inputClass} />
                </div>
                <div><label className={labelClass}>WhatsApp</label>
                  <input type="text" value={form.contacto_telefono ?? ""} onChange={e => setForm({ ...form, contacto_telefono: e.target.value })} className={inputClass} placeholder="11-1234-5678" />
                </div>
                <div><label className={labelClass}>Email</label>
                  <input type="email" value={form.contacto_email ?? ""} onChange={e => setForm({ ...form, contacto_email: e.target.value })} className={inputClass} placeholder="email@ejemplo.com" />
                </div>
                <div><label className={labelClass}>URL foto (opcional)</label>
                  <input type="text" value={form.foto_url ?? ""} onChange={e => setForm({ ...form, foto_url: e.target.value })} className={inputClass} placeholder="https://..." />
                </div>
                <div><label className={labelClass}>Válida hasta</label>
                  <input type="date" value={form.fecha_vencimiento ?? ""} onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} className={inputClass} />
                </div>
              </div>

              {/* IA precio sugerido */}
              {form.titulo && form.categoria && (
                <div className="mt-4 p-3 bg-[#C9A227]/5 border border-[#C9A227]/20 rounded-xl">
                  <button onClick={() => askAI(form.titulo, form.categoria)}
                    className="text-xs text-[#C9A227] font-mono hover:text-[#C9A227]/80 transition-colors">
                    🤖 ¿Cuánto vale esto en el mercado? Preguntale a la IA →
                  </button>
                  {aiLoading && <p className="text-[#C9A227] text-xs font-mono mt-2 animate-pulse">▶ Consultando...</p>}
                  {aiMsg && <p className="text-[#9CA3AF] text-xs font-mono mt-2 leading-relaxed">{aiMsg}</p>}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button onClick={publicar} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Publicar</button>
                <button onClick={() => { setForm({}); setVista("explorar"); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MIS PUBLICACIONES ===== */}
        {vista === "mis_publicaciones" && (
          <div>
            <h2 className="text-lg font-bold font-mono text-[#E5E7EB] mb-6">📋 MIS PUBLICACIONES ({misPublicaciones.length})</h2>
            {misPublicaciones.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">📢</div>
                <p className="text-[#4B5563] font-mono">No tenés publicaciones activas</p>
                <button onClick={() => setVista("publicar")} className="mt-4 text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-4 py-2 rounded-lg hover:bg-[#00FF80]/10 transition-all">
                  + Crear primera publicación
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {misPublicaciones.map(p => {
                  const config = CATEGORIAS[p.categoria];
                  return (
                    <div key={p.id} className="pub-card bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-xs px-2 py-0.5 rounded font-mono mb-2 inline-block" style={{ background: config?.color + "20", color: config?.color }}>
                            {config?.icon} {config?.label}
                          </span>
                          <div className="font-bold text-[#E5E7EB] font-mono">{p.titulo}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded font-mono ${p.estado === "activa" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>
                          {p.estado}
                        </span>
                      </div>
                      <div className="text-lg font-bold font-mono text-[#C9A227] mb-3">{formatPrecio(p)}</div>
                      <div className="flex items-center gap-4 text-xs text-[#4B5563] font-mono mb-4">
                        <span>👁 {p.vistas} vistas</span>
                        <span>📍 {p.provincia || "—"}</span>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-[#00FF80]/10">
                        <button onClick={() => sumarVista(p)} className="text-xs text-[#00FF80] hover:text-[#00FF80]/70 font-mono transition-colors">Ver →</button>
                        <button onClick={() => marcarVendida(p.id)} className="text-xs text-[#C9A227] hover:text-[#C9A227]/70 font-mono transition-colors">✓ Marcar vendida</button>
                        <button onClick={() => eliminarPub(p.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono transition-colors ml-auto">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · MARKETPLACE AGROPECUARIO</p>
    </div>
  );
}

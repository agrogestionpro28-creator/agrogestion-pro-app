"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "granos" | "insumos" | "gasoil" | "varios";
type GranoItem = { id: string; cultivo: string; stock_fisico: number; ventas_pactadas: number; precio_venta: number; ubicacion?: string; tipo_ubicacion?: string; };
type InsumoItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; tipo_ubicacion: string; precio_unitario: number; };
type GasoilItem = { id: string; cantidad_litros: number; ubicacion: string; tipo_ubicacion: string; precio_litro: number; };
type VariosItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; };

const CULTIVOS_BASE = ["soja","maiz","trigo","girasol","sorgo","cebada"];
const CULTIVO_ICONS: Record<string,string> = { soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",arveja:"🫛",otro:"🌐" };
const CULTIVO_IMG: Record<string,string> = { soja:"/cultivo-soja.png",maiz:"/cultivo-maiz.png",trigo:"/cultivo-trigo.png",girasol:"/cultivo-girasol.png",sorgo:"/cultivo-sorgo.png",cebada:"/cultivo-cebada.png" };
const UBICACIONES = [
  { value:"silo",label:"Silo",icon:"🏗️",img:"/ubicacion-silo.png" },
  { value:"silobolsa",label:"Silo Bolsa",icon:"🎒",img:"/ubicacion-silobolsa.png" },
  { value:"campo",label:"En Campo",icon:"🌾",img:"/ubicacion-campo.png" },
  { value:"coop",label:"Empresa/Coop",icon:"🏢",img:"/ubicacion-coop.png" },
];
const TABS = [
  { key:"granos",label:"Libro de Granos",icon:"🌾",color:"#C9A227",img:"/stock-granos.png" },
  { key:"insumos",label:"Insumos",icon:"🧪",color:"#4ADE80",img:"/stock-insumos.png" },
  { key:"gasoil",label:"Gasoil",icon:"⛽",color:"#60A5FA",img:"/stock-gasoil.png" },
  { key:"varios",label:"Stock Varios",icon:"🔧",color:"#A78BFA",img:"/stock-varios.png" },
];

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("granos");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [granos, setGranos] = useState<GranoItem[]>([]);
  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [gasoil, setGasoil] = useState<GasoilItem[]>([]);
  const [varios, setVarios] = useState<VariosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [showGranoDetalle, setShowGranoDetalle] = useState<string|null>(null);
  const [cultivosExtra, setCultivosExtra] = useState<string[]>([]);
  const [showAgregarCultivo, setShowAgregarCultivo] = useState(false);
  const [nuevoCultivo, setNuevoCultivo] = useState("");
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [listening, setListening] = useState(false);

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
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id);
    await fetchAll(emp.id);
    setLoading(false);
  };

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
    const extras = (g.data ?? []).map((x: any) => x.cultivo).filter((c: string) => !CULTIVOS_BASE.includes(c));
    if (extras.length > 0) setCultivosExtra([...new Set<string>(extras)]);
  };

  const todosLosCultivos = [...CULTIVOS_BASE, ...cultivosExtra];

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asistente de stock agropecuario. Respondé en español, práctico. Stock: ${JSON.stringify(granos.map(g=>({cultivo:g.cultivo,fisico:g.stock_fisico,pactado:g.ventas_pactadas})))}. ${prompt}` }]
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
    rec.onresult = (e: any) => { const text = e.results[0][0].transcript; setListening(false); setAiInput(text); setShowIA(true); askAI(`Voz: "${text}". Interpretá qué quiere registrar en el stock.`); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const guardarGrano = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const campanaId = localStorage.getItem("campana_id") ?? "";
    const existing = granos.find(g => g.cultivo === form.cultivo);
    if (existing) {
      await sb.from("stock_granos").update({ stock_fisico: Number(form.stock_fisico ?? existing.stock_fisico), ventas_pactadas: Number(form.ventas_pactadas ?? existing.ventas_pactadas), precio_venta: Number(form.precio_venta ?? existing.precio_venta), ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "silo" }).eq("id", existing.id);
    } else {
      await sb.from("stock_granos").insert({ empresa_id: empresaId, campana_id: campanaId, cultivo: form.cultivo, stock_fisico: Number(form.stock_fisico ?? 0), ventas_pactadas: Number(form.ventas_pactadas ?? 0), precio_venta: Number(form.precio_venta ?? 0), ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "silo" });
    }
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_insumos").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "otro", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio", precio_unitario: Number(form.precio_unitario ?? 0) });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarGasoil = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_gasoil").insert({ empresa_id: empresaId, cantidad_litros: Number(form.cantidad_litros ?? 0), ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "tanque_propio", precio_litro: Number(form.precio_litro ?? 0) });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_varios").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "" });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const agregarCultivo = () => {
    if (!nuevoCultivo.trim()) return;
    const c = nuevoCultivo.toLowerCase().trim();
    if (!cultivosExtra.includes(c) && !CULTIVOS_BASE.includes(c)) setCultivosExtra([...cultivosExtra, c]);
    setNuevoCultivo(""); setShowAgregarCultivo(false);
  };

  const enviarWA = (grano: GranoItem, tipo: "sin_base"|"con_base") => {
    const balance = grano.stock_fisico - grano.ventas_pactadas;
    const ubi = UBICACIONES.find(u => u.value === grano.tipo_ubicacion);
    const msg = tipo === "sin_base"
      ? `Hola! Tengo ${balance} tn de ${grano.cultivo.toUpperCase()} disponibles${ubi ? ` en ${ubi.label}` : ""}. Vendo sin precio base. Oferta?`
      : `Hola! Tengo ${balance} tn de ${grano.cultivo.toUpperCase()} disponibles${ubi ? ` en ${ubi.label}` : ""}. Base: $${Number(grano.precio_venta).toLocaleString("es-AR")}/tn. Les interesa?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">Cargando inventario...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .stock-card:hover{border-color:rgba(201,162,39,0.5)!important;transform:translateY(-2px)}
        .stock-card{transition:all 0.2s ease}
        .tab-img:hover{transform:translateY(-3px)}
        .tab-img{transition:all 0.2s ease}
        .btn-ia-stock{animation:float 3s ease-in-out infinite}
        .logo-btn:hover{filter:drop-shadow(0 0 12px rgba(0,255,128,0.8));transform:scale(1.03)}
        .logo-btn{transition:all 0.2s ease;cursor:pointer}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="bg" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/85"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{backgroundImage:`linear-gradient(rgba(0,255,128,1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,1) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#00FF80,#00AAFF,#00FF80,transparent)",backgroundSize:"200% 100%",animation:"gradient-flow 4s ease infinite"}}/>
        <div className="absolute inset-0" style={{background:"linear-gradient(135deg,rgba(2,8,16,0.95) 0%,rgba(0,20,10,0.90) 50%,rgba(2,8,16,0.95) 100%)"}}/>
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={() => window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">← Dashboard</button>
          <div className="flex-1"/>
          <div className="logo-btn" onClick={() => window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">▣ STOCK</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">SISTEMA DE INVENTARIO AGROPECUARIO</p>
          </div>
          <div className="flex gap-3">
            <button onClick={startVoice} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening?"border-red-400 text-red-400 animate-pulse":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
              🎤 {listening?"Escuchando...":"Voz"}
            </button>
            <button onClick={() => {setShowForm(!showForm);setForm({});}} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">+ Cargar Stock</button>
          </div>
        </div>

        {/* TABS con imágenes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {TABS.map(t => (
            <div key={t.key} className={`tab-img cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${tab===t.key?"border-[#00FF80]":"border-transparent"}`} style={{height:"90px",position:"relative"}}
              onClick={() => {setTab(t.key as Tab);setShowForm(false);}}>
              <Image src={t.img} alt={t.label} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
              <div className="absolute inset-0" style={{background:tab===t.key?"rgba(0,255,128,0.15)":"rgba(2,8,16,0.55)"}}/>
              <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center gap-1.5">
                <span className="text-sm">{t.icon}</span>
                <span className="text-xs font-bold font-mono text-white">{t.label}</span>
              </div>
              {tab===t.key && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#00FF80]"/>}
            </div>
          ))}
        </div>

        {/* FORM */}
        {showForm && (
          <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-6 mb-6">
            <h3 className="text-[#00FF80] font-mono font-bold mb-5 text-sm tracking-widest">+ CARGAR {tab.toUpperCase()}</h3>
            {tab==="granos" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Cultivo</label>
                  <select value={form.cultivo??""} onChange={e=>setForm({...form,cultivo:e.target.value})} className={inputClass}>
                    <option value="">Seleccionar</option>
                    {todosLosCultivos.map(c=><option key={c} value={c}>{CULTIVO_ICONS[c]??"🌾"} {c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Stock Físico (tn)</label><input type="number" value={form.stock_fisico??""} onChange={e=>setForm({...form,stock_fisico:e.target.value})} className={inputClass} placeholder="0"/></div>
                <div><label className={labelClass}>Ventas Pactadas (tn)</label><input type="number" value={form.ventas_pactadas??""} onChange={e=>setForm({...form,ventas_pactadas:e.target.value})} className={inputClass} placeholder="0"/></div>
                <div><label className={labelClass}>Precio base ($/tn)</label><input type="number" value={form.precio_venta??""} onChange={e=>setForm({...form,precio_venta:e.target.value})} className={inputClass} placeholder="0"/></div>
                <div><label className={labelClass}>Dónde está guardado</label>
                  <select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                    {UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Nombre / Lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass} placeholder="Ej: Silo Norte, ACA Rafaela"/></div>
              </div>
            )}
            {tab==="insumos" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass} placeholder="Ej: Glifosato"/></div>
                <div><label className={labelClass}>Categoría</label>
                  <select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}>
                    <option value="semilla">Semilla</option><option value="fertilizante">Fertilizante</option>
                    <option value="agroquimico">Agroquímico</option><option value="otro">Otro</option>
                  </select>
                </div>
                <div><label className={labelClass}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={inputClass}/></div>
                <div><label className={labelClass}>Unidad</label>
                  <select value={form.unidad??"litros"} onChange={e=>setForm({...form,unidad:e.target.value})} className={inputClass}>
                    <option value="litros">Litros</option><option value="kg">kg</option><option value="bolsas">Bolsas</option><option value="unidad">Unidad</option>
                  </select>
                </div>
                <div><label className={labelClass}>Ubicación</label>
                  <select value={form.tipo_ubicacion??"deposito_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                    <option value="deposito_propio">Depósito Propio</option><option value="comercio">Comercio</option><option value="cooperativa">Cooperativa</option>
                  </select>
                </div>
                <div><label className={labelClass}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass} placeholder="Ej: ACA Rafaela"/></div>
                <div><label className={labelClass}>Precio unitario</label><input type="number" value={form.precio_unitario??""} onChange={e=>setForm({...form,precio_unitario:e.target.value})} className={inputClass}/></div>
              </div>
            )}
            {tab==="gasoil" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Litros</label><input type="number" value={form.cantidad_litros??""} onChange={e=>setForm({...form,cantidad_litros:e.target.value})} className={inputClass}/></div>
                <div><label className={labelClass}>Ubicación</label>
                  <select value={form.tipo_ubicacion??"tanque_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                    <option value="tanque_propio">Tanque Propio</option><option value="proveedor">En Proveedor</option>
                  </select>
                </div>
                <div><label className={labelClass}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass} placeholder="Ej: YPF Ruta 34"/></div>
                <div><label className={labelClass}>Precio por litro</label><input type="number" value={form.precio_litro??""} onChange={e=>setForm({...form,precio_litro:e.target.value})} className={inputClass}/></div>
              </div>
            )}
            {tab==="varios" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass}/></div>
                <div><label className={labelClass}>Categoría</label><input type="text" value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}/></div>
                <div><label className={labelClass}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={inputClass}/></div>
                <div><label className={labelClass}>Unidad</label><input type="text" value={form.unidad??""} onChange={e=>setForm({...form,unidad:e.target.value})} className={inputClass} placeholder="kg, unidad, m..."/></div>
                <div><label className={labelClass}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass}/></div>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={tab==="granos"?guardarGrano:tab==="insumos"?guardarInsumo:tab==="gasoil"?guardarGasoil:guardarVarios}
                className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">Guardar</button>
              <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
            </div>
          </div>
        )}

        {/* GRANOS */}
        {tab==="granos" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-[#4B5563] font-mono">{granos.reduce((a,g)=>a+g.stock_fisico,0)} tn totales</span>
              <button onClick={()=>setShowAgregarCultivo(!showAgregarCultivo)} className="text-xs text-[#C9A227] border border-[#C9A227]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#C9A227]/10 transition-all">+ Agregar cultivo</button>
            </div>
            {showAgregarCultivo && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                <input type="text" value={nuevoCultivo} onChange={e=>setNuevoCultivo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&agregarCultivo()} placeholder="Ej: arveja, lenteja..." className={inputClass+" flex-1"}/>
                <button onClick={agregarCultivo} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2.5 rounded-xl text-sm font-mono">+ Agregar</button>
                <button onClick={()=>setShowAgregarCultivo(false)} className="text-[#4B5563] text-sm font-mono">✕</button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {todosLosCultivos.map(cultivo => {
                const g = granos.find(x=>x.cultivo===cultivo);
                const balance=(g?.stock_fisico??0)-(g?.ventas_pactadas??0);
                const ubi=UBICACIONES.find(u=>u.value===g?.tipo_ubicacion);
                const isDetalle=showGranoDetalle===cultivo;
                return (
                  <div key={cultivo} className="stock-card border border-[#C9A227]/15 rounded-xl overflow-hidden cursor-pointer"
                    onClick={()=>setShowGranoDetalle(isDetalle?null:cultivo)}>
                    <div className="relative h-24">
                      <Image src={CULTIVO_IMG[cultivo]??"/cultivo-otro.png"} alt={cultivo} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-[#0a1628]/50 to-transparent"/>
                      <div className="absolute bottom-2 left-3 flex items-center gap-2">
                        <span className="text-lg">{CULTIVO_ICONS[cultivo]??"🌾"}</span>
                        <span className="font-bold text-white font-mono text-sm uppercase">{cultivo}</span>
                      </div>
                      {g && <div className="absolute top-2 right-2">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full" style={{background:balance>=0?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.2)",color:balance>=0?"#4ADE80":"#F87171"}}>
                          {balance>=0?"+":""}{balance} tn
                        </span>
                      </div>}
                    </div>
                    <div className="p-3 bg-[#0a1628]/80">
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2">
                        <div className="text-center"><div className="text-[#4B5563]">Físico</div><div className="text-[#E5E7EB] font-bold">{g?.stock_fisico??0} tn</div></div>
                        <div className="text-center"><div className="text-[#4B5563]">Pactado</div><div className="text-[#60A5FA] font-bold">{g?.ventas_pactadas??0} tn</div></div>
                        <div className="text-center"><div className="text-[#4B5563]">Precio</div><div className="text-[#C9A227] font-bold">${g?.precio_venta?Number(g.precio_venta).toLocaleString("es-AR"):"—"}</div></div>
                      </div>
                      {g?.tipo_ubicacion && (
                        <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[#020810]/40 rounded-lg">
                          <span className="text-sm">{ubi?.icon??"📍"}</span>
                          <span className="text-xs text-[#9CA3AF] font-mono">{ubi?.label??g.tipo_ubicacion}{g.ubicacion?` · ${g.ubicacion}`:""}</span>
                        </div>
                      )}
                      {isDetalle && g && (
                        <div className="border-t border-[#C9A227]/15 pt-3 mt-2">
                          <div className="grid grid-cols-4 gap-1 mb-3">
                            {UBICACIONES.map(u=>(
                              <div key={u.value} onClick={e=>e.stopPropagation()} className={`relative rounded-lg overflow-hidden border-2 transition-all ${g.tipo_ubicacion===u.value?"border-[#C9A227]":"border-transparent opacity-50"}`} style={{height:"40px"}}>
                                <Image src={u.img} alt={u.label} fill style={{objectFit:"cover"}} onError={(ev)=>{(ev.target as any).src="/dashboard-bg.png";}}/>
                                <div className="absolute inset-0 flex items-end justify-center pb-0.5">
                                  <span className="text-[8px] text-white font-mono">{u.label}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={e=>{e.stopPropagation();enviarWA(g,"sin_base");}} className="flex-1 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono hover:bg-[#25D366]/20 transition-all">💬 Sin base</button>
                            <button onClick={e=>{e.stopPropagation();enviarWA(g,"con_base");}} className="flex-1 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono hover:bg-[#25D366]/20 transition-all">💬 Con base</button>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminarItem("stock_granos",g.id);}} className="w-full mt-2 text-xs text-[#4B5563] hover:text-red-400 font-mono transition-colors">✕ Eliminar</button>
                        </div>
                      )}
                      {!g && (
                        <button onClick={e=>{e.stopPropagation();setShowForm(true);setForm({cultivo});setTab("granos");}} className="w-full text-xs text-[#C9A227]/60 hover:text-[#C9A227] font-mono transition-colors text-center py-1">+ Cargar stock</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INSUMOS */}
        {tab==="insumos" && (
          <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
            {insumos.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin insumos registrados</div>:(
              <table className="w-full">
                <thead><tr className="border-b border-[#4ADE80]/10">{["Producto","Categoría","Cantidad","Ubicación","Precio Unit.",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>)}</tr></thead>
                <tbody>{insumos.map(i=>(
                  <tr key={i.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5 transition-colors">
                    <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{i.nombre}</td>
                    <td className="px-5 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-1 rounded font-mono">{i.categoria}</span></td>
                    <td className="px-5 py-3 text-sm text-[#00FF80] font-mono font-bold">{i.cantidad} {i.unidad}</td>
                    <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{i.tipo_ubicacion?.replace("_"," ")}{i.ubicacion?` · ${i.ubicacion}`:""}</td>
                    <td className="px-5 py-3 text-sm text-[#C9A227] font-mono">${i.precio_unitario}/{i.unidad}</td>
                    <td className="px-5 py-3"><button onClick={()=>eliminarItem("stock_insumos",i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {/* GASOIL */}
        {tab==="gasoil" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gasoil.length===0?<div className="col-span-2 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#60A5FA]/15 rounded-xl">Sin stock de gasoil</div>:gasoil.map(g=>(
              <div key={g.id} className="stock-card bg-[#0a1628]/80 border border-[#60A5FA]/20 rounded-xl overflow-hidden">
                <div className="relative h-28">
                  <Image src="/stock-gasoil.png" alt="gasoil" fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] to-transparent"/>
                  <div className="absolute bottom-3 left-4">
                    <div className="text-3xl font-bold text-white font-mono">{g.cantidad_litros.toLocaleString("es-AR")} L</div>
                    <div className="text-xs text-[#60A5FA] font-mono">{g.tipo_ubicacion?.replace("_"," ")}{g.ubicacion?` · ${g.ubicacion}`:""}</div>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-[#C9A227] font-mono font-bold">${g.precio_litro}/L</span>
                  <span className="text-[#9CA3AF] text-xs font-mono">Total: ${(g.cantidad_litros*g.precio_litro).toLocaleString("es-AR")}</span>
                  <button onClick={()=>eliminarItem("stock_gasoil",g.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VARIOS */}
        {tab==="varios" && (
          <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
            {varios.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin stock registrado</div>:(
              <table className="w-full">
                <thead><tr className="border-b border-[#A78BFA]/10">{["Producto","Categoría","Cantidad","Ubicación",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>)}</tr></thead>
                <tbody>{varios.map(v=>(
                  <tr key={v.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                    <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{v.nombre}</td>
                    <td className="px-5 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-1 rounded font-mono">{v.categoria}</span></td>
                    <td className="px-5 py-3 text-sm text-[#00FF80] font-mono font-bold">{v.cantidad} {v.unidad}</td>
                    <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{v.ubicacion}</td>
                    <td className="px-5 py-3"><button onClick={()=>eliminarItem("stock_varios",v.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} className="btn-ia-stock fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#60A5FA]/30" title="Asistente IA Stock">
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#60A5FA]/30 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#60A5FA]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse"/><span className="text-[#60A5FA] text-xs font-mono font-bold">ASISTENTE IA — STOCK</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
            {!aiMsg&&!aiLoading&&(
              <div className="space-y-1">
                {["Cuánto insumo me queda?","Cuándo reabastecer gasoil?","Análisis del stock actual"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#60A5FA] border border-[#60A5FA]/10 hover:border-[#60A5FA]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p className="text-[#60A5FA] text-xs font-mono animate-pulse px-2">Analizando...</p>}
            {aiMsg&&<p className="text-[#9CA3AF] text-xs font-mono leading-relaxed px-2 whitespace-pre-wrap">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre el stock..." className="flex-1 bg-[#020810]/80 border border-[#60A5FA]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#60A5FA]"/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="px-3 py-2 rounded-lg bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

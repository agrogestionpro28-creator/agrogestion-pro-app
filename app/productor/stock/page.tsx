"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "granos" | "insumos" | "gasoil" | "varios";
type UbicacionItem = { id: string; cultivo: string; tipo_ubicacion: string; nombre_ubicacion: string; cantidad_tn: number; };
type VentaPactada = { id: string; cultivo: string; cantidad_tn: number; precio_tn: number; destino: string; tipo_destino: string; fecha_entrega: string; estado: string; observaciones: string; };
type InsumoItem = { id: string; nombre: string; categoria: string; subcategoria: string; cantidad: number; unidad: string; ubicacion: string; tipo_ubicacion: string; precio_unitario: number; };
type GasoilItem = { id: string; cantidad_litros: number; ubicacion: string; tipo_ubicacion: string; precio_litro: number; };
type VariosItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; };

const UBICACIONES = [
  { value:"silo", label:"Silo", icon:"🏗️", img:"/ubicacion-silo.png" },
  { value:"silobolsa", label:"Silo Bolsa", icon:"🎒", img:"/ubicacion-silobolsa.png" },
  { value:"campo", label:"En Campo", icon:"🌾", img:"/ubicacion-campo.png" },
  { value:"coop", label:"Empresa/Coop", icon:"🏢", img:"/ubicacion-coop.png" },
];
const CULTIVO_ICONS: Record<string,string> = { soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",arveja:"🫛",otro:"🌐" };
const SUBCATEGORIAS_AGRO = ["herbicida","insecticida","fungicida","coadyuvante","curasemilla","fertilizante_foliar","otro"];
const TABS = [
  { key:"granos", label:"Libro de Granos", icon:"🌾", color:"#C9A227", img:"/stock-granos.png" },
  { key:"insumos", label:"Insumos", icon:"🧪", color:"#4ADE80", img:"/stock-insumos.png" },
  { key:"gasoil", label:"Gasoil", icon:"⛽", color:"#60A5FA", img:"/stock-gasoil.png" },
  { key:"varios", label:"Stock Varios", icon:"🔧", color:"#A78BFA", img:"/stock-varios.png" },
];
const CAT_INSUMOS = [
  { key:"semilla", label:"Semillas", color:"#4ADE80", icon:"🌱" },
  { key:"fertilizante", label:"Fertilizantes", color:"#C9A227", icon:"💊" },
  { key:"agroquimico", label:"Agroquímicos", color:"#60A5FA", icon:"🧪" },
  { key:"otro", label:"Otros", color:"#A78BFA", icon:"🔧" },
];

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("granos");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [ubicaciones, setUbicaciones] = useState<UbicacionItem[]>([]);
  const [ventas, setVentas] = useState<VentaPactada[]>([]);
  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [gasoil, setGasoil] = useState<GasoilItem[]>([]);
  const [varios, setVarios] = useState<VariosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cultivoActivo, setCultivoActivo] = useState<string|null>(null);
  const [showFormUbicacion, setShowFormUbicacion] = useState(false);
  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showFormInsumo, setShowFormInsumo] = useState(false);
  const [showFormGasoil, setShowFormGasoil] = useState(false);
  const [showFormVarios, setShowFormVarios] = useState(false);
  const [showFormCultivo, setShowFormCultivo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [listening, setListening] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const campanaId = typeof window !== "undefined" ? localStorage.getItem("campana_id") ?? "" : "";

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
    const cid = localStorage.getItem("campana_id") ?? "";
    const [ub, vt, ins, gas, var_] = await Promise.all([
      sb.from("stock_granos_ubicaciones").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("stock_ventas_pactadas").select("*").eq("empresa_id", eid).eq("campana_id", cid).eq("estado","pactada"),
      sb.from("stock_insumos").select("*").eq("empresa_id", eid).order("categoria"),
      sb.from("stock_gasoil").select("*").eq("empresa_id", eid),
      sb.from("stock_varios").select("*").eq("empresa_id", eid),
    ]);
    setUbicaciones(ub.data ?? []);
    setVentas(vt.data ?? []);
    setInsumos(ins.data ?? []);
    setGasoil(gas.data ?? []);
    setVarios(var_.data ?? []);
  };

  // Cultivos con stock > 0
  const cultivosConStock = [...new Set(ubicaciones.map(u => u.cultivo))];

  const stockPorCultivo = (cultivo: string) => {
    const ubs = ubicaciones.filter(u => u.cultivo === cultivo);
    const totalFisico = ubs.reduce((a, u) => a + u.cantidad_tn, 0);
    const totalPactado = ventas.filter(v => v.cultivo === cultivo).reduce((a, v) => a + v.cantidad_tn, 0);
    return { ubs, totalFisico, totalPactado, balance: totalFisico - totalPactado };
  };

  const guardarUbicacion = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    await sb.from("stock_granos_ubicaciones").insert({
      empresa_id: empresaId, campana_id: cid,
      cultivo: form.cultivo, tipo_ubicacion: form.tipo_ubicacion ?? "silo",
      nombre_ubicacion: form.nombre_ubicacion ?? "",
      cantidad_tn: Number(form.cantidad_tn ?? 0),
    });
    await fetchAll(empresaId);
    setShowFormUbicacion(false); setForm({});
  };

  const guardarVenta = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    await sb.from("stock_ventas_pactadas").insert({
      empresa_id: empresaId, campana_id: cid,
      cultivo: form.cultivo, cantidad_tn: Number(form.cantidad_tn ?? 0),
      precio_tn: Number(form.precio_tn ?? 0), destino: form.destino ?? "",
      tipo_destino: form.tipo_destino ?? "cooperativa",
      fecha_entrega: form.fecha_entrega || null,
      estado: "pactada", observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId);
    setShowFormVenta(false); setForm({});
  };

  const marcarEntregada = async (id: string) => {
    const sb = await getSB();
    await sb.from("stock_ventas_pactadas").update({ estado: "entregada" }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const eliminarUbicacion = async (id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from("stock_granos_ubicaciones").delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const eliminarVenta = async (id: string) => {
    if (!confirm("Cancelar venta?")) return;
    const sb = await getSB();
    await sb.from("stock_ventas_pactadas").update({ estado: "cancelada" }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_insumos").insert({
      empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "agroquimico",
      subcategoria: form.subcategoria ?? "", cantidad: Number(form.cantidad ?? 0),
      unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "",
      tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio",
      precio_unitario: Number(form.precio_unitario ?? 0),
    });
    await fetchAll(empresaId); setShowFormInsumo(false); setForm({});
  };

  const guardarGasoil = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_gasoil").insert({
      empresa_id: empresaId, cantidad_litros: Number(form.cantidad_litros ?? 0),
      ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "tanque_propio",
      precio_litro: Number(form.precio_litro ?? 0),
    });
    await fetchAll(empresaId); setShowFormGasoil(false); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("stock_varios").insert({
      empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general",
      cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "",
    });
    await fetchAll(empresaId); setShowFormVarios(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const enviarWA = (cultivo: string, tipo: "sin_base"|"con_base") => {
    const { totalFisico, totalPactado, balance } = stockPorCultivo(cultivo);
    const vtasConPrecio = ventas.filter(v => v.cultivo === cultivo && v.precio_tn > 0);
    const precioRef = vtasConPrecio[0]?.precio_tn ?? 0;
    const msg = tipo === "sin_base"
      ? `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles para vender. Sin precio base. Oferta?`
      : `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles. Base: $${Number(precioRef).toLocaleString("es-AR")}/tn. Les interesa?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Import Excel granos
  const leerExcelGranos = async (file: File) => {
    setImportMsg("Leyendo archivo...");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) { setImportMsg("Sin datos"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const colCultivo = headers.findIndex((h: string) => h.includes("cultivo") || h.includes("grano"));
      const colTipo = headers.findIndex((h: string) => h.includes("tipo") || h.includes("ubic"));
      const colNombre = headers.findIndex((h: string) => h.includes("nombre") || h.includes("lugar"));
      const colTn = headers.findIndex((h: string) => h.includes("tn") || h.includes("ton") || h.includes("cant"));
      if (colCultivo === -1) { setImportMsg("No se encontró columna CULTIVO"); return; }
      const preview = rows.slice(1).filter((r: any) => r[colCultivo]).map((r: any) => ({
        cultivo: String(r[colCultivo]).toLowerCase().trim(),
        tipo_ubicacion: colTipo >= 0 ? String(r[colTipo]).toLowerCase().trim() : "silo",
        nombre_ubicacion: colNombre >= 0 ? String(r[colNombre]).trim() : "",
        cantidad_tn: Number(r[colTn] ?? 0) || 0,
      }));
      setImportPreview(preview);
      setImportMsg(`✅ ${preview.length} registros detectados`);
    } catch(e: any) { setImportMsg("Error: " + e.message); }
  };

  const confirmarImportGranos = async () => {
    if (!empresaId || importPreview.length === 0) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    for (const r of importPreview) {
      await sb.from("stock_granos_ubicaciones").insert({ empresa_id: empresaId, campana_id: cid, ...r });
    }
    await fetchAll(empresaId);
    setImportPreview([]); setImportMsg("✅ Importado correctamente");
    setTimeout(() => { setShowImport(false); setImportMsg(""); }, 2000);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 800,
          messages: [{ role: "user", content: `Asistente stock agropecuario. Stock: ${cultivosConStock.map(c=>{const s=stockPorCultivo(c);return `${c}: ${s.totalFisico}tn físico, ${s.totalPactado}tn pactado`;}).join(", ")}. ${prompt}` }]
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
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setListening(false); setAiInput(t); setShowIA(true); askAI(`Voz: "${t}"`); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">Cargando inventario...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .card-hover:hover{border-color:rgba(201,162,39,0.5)!important;transform:translateY(-2px)}
        .card-hover{transition:all 0.2s ease}
        .tab-img:hover{transform:translateY(-2px)}
        .tab-img{transition:all 0.2s ease}
        .btn-float{animation:float 3s ease-in-out infinite}
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
          <button onClick={()=>cultivoActivo?setCultivoActivo(null):window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
            ← {cultivoActivo?"Volver":"Dashboard"}
          </button>
          <div className="flex-1"/>
          <div className="logo-btn" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">

        {/* Title */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">▣ STOCK</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">SISTEMA DE INVENTARIO AGROPECUARIO</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={startVoice} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening?"border-red-400 text-red-400 animate-pulse":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
              🎤 {listening?"...":"Voz"}
            </button>
            <button onClick={()=>setShowImport(!showImport)} className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-sm transition-all">📥 Importar Excel</button>
          </div>
        </div>

        {/* TABS con imágenes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {TABS.map(t=>(
            <div key={t.key} className={`tab-img cursor-pointer rounded-xl overflow-hidden border-2 ${tab===t.key?"border-[#00FF80]":"border-transparent"}`} style={{height:"80px",position:"relative"}}
              onClick={()=>{setTab(t.key as Tab);setCultivoActivo(null);}}>
              <Image src={t.img} alt={t.label} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
              <div className="absolute inset-0" style={{background:tab===t.key?"rgba(0,255,128,0.15)":"rgba(2,8,16,0.55)"}}/>
              <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center gap-1.5">
                <span>{t.icon}</span><span className="text-xs font-bold font-mono text-white">{t.label}</span>
              </div>
              {tab===t.key&&<div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#00FF80]"/>}
            </div>
          ))}
        </div>

        {/* Import Excel */}
        {showImport && tab==="granos" && (
          <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR GRANOS DESDE EXCEL</h3>
              <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button>
            </div>
            <p className="text-xs text-[#4B5563] font-mono mb-3">Columnas: <span className="text-[#C9A227]">CULTIVO · TIPO_UBICACION · NOMBRE_LUGAR · TN</span></p>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelGranos(f);}}/>
            {importPreview.length===0?(
              <button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/30 rounded-xl text-[#C9A227] font-mono text-sm hover:border-[#C9A227]/60 transition-all w-full justify-center">📁 Seleccionar archivo</button>
            ):(
              <div>
                <div className="max-h-40 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-[#C9A227]/10">{["Cultivo","Tipo","Lugar","Tn"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{importPreview.map((r,i)=>(
                      <tr key={i} className="border-b border-[#C9A227]/5">
                        <td className="px-3 py-2 text-[#E5E7EB] font-mono">{r.cultivo}</td>
                        <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.tipo_ubicacion}</td>
                        <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.nombre_ubicacion}</td>
                        <td className="px-3 py-2 text-[#00FF80] font-mono font-bold">{r.cantidad_tn}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <button onClick={confirmarImportGranos} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono">▶ Confirmar {importPreview.length} registros</button>
              </div>
            )}
            {importMsg&&<p className={`mt-2 text-xs font-mono ${importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]"}`}>{importMsg}</p>}
          </div>
        )}

        {/* ===== GRANOS — Lista cultivos ===== */}
        {tab==="granos" && !cultivoActivo && (
          <div>
            {cultivosConStock.length===0?(
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#C9A227]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">🌾</div>
                <p className="text-[#4B5563] font-mono">Sin stock de granos cargado</p>
                <button onClick={()=>setShowFormCultivo(true)} className="mt-4 text-xs text-[#C9A227] font-mono border border-[#C9A227]/20 px-4 py-2 rounded-lg hover:bg-[#C9A227]/10 transition-all">+ Cargar primer stock</button>
              </div>
            ):(
              <div>
                <div className="flex justify-end mb-4">
                  <button onClick={()=>setShowFormCultivo(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20 transition-all">+ Cargar Stock</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cultivosConStock.map(cultivo=>{
                    const { ubs, totalFisico, totalPactado, balance } = stockPorCultivo(cultivo);
                    return (
                      <div key={cultivo} className="card-hover border border-[#C9A227]/20 rounded-xl overflow-hidden cursor-pointer"
                        onClick={()=>setCultivoActivo(cultivo)}>
                        {/* Banner imagen granos */}
                        <div className="relative h-28">
                          <Image src="/stock-granos.png" alt={cultivo} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/40 to-transparent"/>
                          <div className="absolute bottom-2 left-3 flex items-center gap-2">
                            <span className="text-xl">{CULTIVO_ICONS[cultivo]??"🌾"}</span>
                            <span className="font-bold text-white font-mono text-lg uppercase">{cultivo}</span>
                          </div>
                          <div className="absolute top-2 right-2">
                            <span className="text-xs font-bold px-2 py-1 rounded-full font-mono" style={{background:balance>=0?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)",color:balance>=0?"#4ADE80":"#F87171"}}>
                              {balance>=0?"+":""}{balance} tn
                            </span>
                          </div>
                        </div>
                        {/* Datos resumidos */}
                        <div className="p-4 bg-[#0a1628]/80">
                          <div className="grid grid-cols-3 gap-3 text-xs font-mono mb-3">
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                              <div className="text-[#4B5563] mb-1">Físico</div>
                              <div className="text-[#E5E7EB] font-bold text-sm">{totalFisico} tn</div>
                            </div>
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                              <div className="text-[#4B5563] mb-1">Pactado</div>
                              <div className="text-[#60A5FA] font-bold text-sm">{totalPactado} tn</div>
                            </div>
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                              <div className="text-[#4B5563] mb-1">Balance</div>
                              <div className="font-bold text-sm" style={{color:balance>=0?"#4ADE80":"#F87171"}}>{balance} tn</div>
                            </div>
                          </div>
                          {/* Ubicaciones mini */}
                          <div className="flex gap-1 flex-wrap">
                            {ubs.map(u=>{
                              const ubi=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);
                              return (
                                <div key={u.id} className="flex items-center gap-1 bg-[#020810]/60 rounded-lg px-2 py-1">
                                  <span className="text-xs">{ubi?.icon??"📍"}</span>
                                  <span className="text-xs text-[#9CA3AF] font-mono">{u.cantidad_tn}tn</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form cargar stock */}
            {showFormCultivo && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mt-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ CARGAR STOCK DE GRANO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Cultivo</label>
                    <input type="text" value={form.cultivo??""} onChange={e=>setForm({...form,cultivo:e.target.value.toLowerCase()})} className={inputClass} placeholder="Ej: soja, maiz, trigo..."/>
                  </div>
                  <div><label className={labelClass}>Dónde está</label>
                    <select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                      {UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre lugar</label>
                    <input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={inputClass} placeholder="Ej: Silo Norte, ACA Rafaela"/>
                  </div>
                  <div><label className={labelClass}>Toneladas</label>
                    <input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarUbicacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormCultivo(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DETALLE CULTIVO ===== */}
        {tab==="granos" && cultivoActivo && (
          <div>
            {/* Header cultivo */}
            <div className="relative rounded-2xl overflow-hidden mb-6 h-40">
              <Image src="/stock-granos.png" alt={cultivoActivo} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
              <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/50 to-transparent"/>
              <div className="absolute bottom-4 left-5 flex items-center gap-3">
                <span className="text-4xl">{CULTIVO_ICONS[cultivoActivo]??"🌾"}</span>
                <div>
                  <h2 className="text-3xl font-bold text-white font-mono uppercase">{cultivoActivo}</h2>
                  {(() => { const { totalFisico, totalPactado, balance } = stockPorCultivo(cultivoActivo); return (
                    <div className="flex gap-3 text-xs font-mono mt-1">
                      <span className="text-[#E5E7EB]">{totalFisico} tn físico</span>
                      <span className="text-[#60A5FA]">{totalPactado} tn pactado</span>
                      <span style={{color:balance>=0?"#4ADE80":"#F87171"}}>{balance>=0?"+":""}{balance} tn balance</span>
                    </div>
                  ); })()}
                </div>
              </div>
              <div className="absolute bottom-4 right-5 flex gap-2">
                <button onClick={()=>{setShowFormUbicacion(true);setForm({cultivo:cultivoActivo});}} className="px-3 py-2 rounded-xl bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs">+ Stock</button>
                <button onClick={()=>{setShowFormVenta(true);setForm({cultivo:cultivoActivo});}} className="px-3 py-2 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] font-mono text-xs">+ Venta pactada</button>
              </div>
            </div>

            {/* Form agregar ubicacion */}
            {showFormUbicacion && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ AGREGAR STOCK {cultivoActivo.toUpperCase()}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Dónde está</label>
                    <select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                      {UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre lugar</label>
                    <input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={inputClass} placeholder="Ej: ACA Rafaela"/>
                  </div>
                  <div><label className={labelClass}>Toneladas</label>
                    <input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarUbicacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormUbicacion(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form venta pactada */}
            {showFormVenta && (
              <div className="bg-[#0a1628]/80 border border-[#25D366]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#25D366] font-mono text-sm font-bold mb-4">+ VENTA PACTADA — {cultivoActivo.toUpperCase()}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Toneladas</label>
                    <input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={inputClass} placeholder="0"/>
                  </div>
                  <div><label className={labelClass}>Precio ($/tn)</label>
                    <input type="number" value={form.precio_tn??""} onChange={e=>setForm({...form,precio_tn:e.target.value})} className={inputClass} placeholder="0 = sin base"/>
                  </div>
                  <div><label className={labelClass}>Destino</label>
                    <input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={inputClass} placeholder="Ej: AFA, Coop Santa Fe..."/>
                  </div>
                  <div><label className={labelClass}>Tipo destino</label>
                    <select value={form.tipo_destino??"cooperativa"} onChange={e=>setForm({...form,tipo_destino:e.target.value})} className={inputClass}>
                      <option value="cooperativa">Cooperativa</option>
                      <option value="acopio">Acopio</option>
                      <option value="empresa">Empresa</option>
                      <option value="exportador">Exportador</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha entrega</label>
                    <input type="date" value={form.fecha_entrega??""} onChange={e=>setForm({...form,fecha_entrega:e.target.value})} className={inputClass}/>
                  </div>
                  <div><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass} placeholder="Notas"/>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVenta} className="bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormVenta(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Ubicaciones con imágenes */}
            <div className="mb-6">
              <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-3">📍 STOCK POR UBICACIÓN</h3>
              {ubicaciones.filter(u=>u.cultivo===cultivoActivo).length===0?(
                <p className="text-[#4B5563] font-mono text-sm">Sin ubicaciones cargadas</p>
              ):(
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ubicaciones.filter(u=>u.cultivo===cultivoActivo).map(u=>{
                    const ubi=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);
                    return (
                      <div key={u.id} className="card-hover border border-[#C9A227]/20 rounded-xl overflow-hidden">
                        <div className="relative h-28">
                          <Image src={ubi?.img??"/ubicacion-silo.png"} alt={ubi?.label??""} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#020810]/90 to-transparent"/>
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="text-lg font-bold text-white font-mono">{u.cantidad_tn} tn</div>
                            <div className="text-xs text-[#C9A227] font-mono">{ubi?.label??u.tipo_ubicacion}</div>
                            {u.nombre_ubicacion&&<div className="text-xs text-[#9CA3AF] font-mono truncate">{u.nombre_ubicacion}</div>}
                          </div>
                        </div>
                        <div className="p-2 bg-[#0a1628]/80 flex justify-end">
                          <button onClick={()=>eliminarUbicacion(u.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ventas pactadas */}
            <div className="mb-4">
              <h3 className="text-[#25D366] font-mono text-sm font-bold mb-3">💬 VENTAS PACTADAS</h3>
              {ventas.filter(v=>v.cultivo===cultivoActivo).length===0?(
                <p className="text-[#4B5563] font-mono text-sm">Sin ventas pactadas</p>
              ):(
                <div className="space-y-2">
                  {ventas.filter(v=>v.cultivo===cultivoActivo).map(v=>(
                    <div key={v.id} className="bg-[#0a1628]/80 border border-[#25D366]/15 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-bold text-[#E5E7EB] font-mono">{v.cantidad_tn} tn</div>
                        <div>
                          <div className="text-sm text-[#25D366] font-mono font-bold">{v.destino||"Sin destino"}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{v.tipo_destino}{v.fecha_entrega?` · ${v.fecha_entrega}`:""}</div>
                        </div>
                        {v.precio_tn>0&&<div className="text-sm text-[#C9A227] font-mono font-bold">${Number(v.precio_tn).toLocaleString("es-AR")}/tn</div>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={()=>marcarEntregada(v.id)} className="text-xs text-[#4ADE80] border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#4ADE80]/10">✓ Entregado</button>
                        <button onClick={()=>eliminarVenta(v.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botones WhatsApp */}
            <div className="flex gap-3">
              <button onClick={()=>enviarWA(cultivoActivo,"sin_base")} className="flex-1 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-mono text-sm hover:bg-[#25D366]/20 transition-all">💬 WhatsApp — Sin base</button>
              <button onClick={()=>enviarWA(cultivoActivo,"con_base")} className="flex-1 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-mono text-sm hover:bg-[#25D366]/20 transition-all">💬 WhatsApp — Con base</button>
            </div>
          </div>
        )}

        {/* ===== INSUMOS ===== */}
        {tab==="insumos" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>setShowFormInsumo(!showFormInsumo)} className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm hover:bg-[#4ADE80]/20 transition-all">+ Cargar Insumo</button>
            </div>

            {showFormInsumo && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ NUEVO INSUMO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass} placeholder="Ej: Glifosato 48%"/></div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria??"agroquimico"} onChange={e=>setForm({...form,categoria:e.target.value,subcategoria:""})} className={inputClass}>
                      {CAT_INSUMOS.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  {form.categoria==="agroquimico" && (
                    <div><label className={labelClass}>Subcategoría</label>
                      <select value={form.subcategoria??""} onChange={e=>setForm({...form,subcategoria:e.target.value})} className={inputClass}>
                        <option value="">Seleccionar</option>
                        {SUBCATEGORIAS_AGRO.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div><label className={labelClass}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Unidad</label>
                    <select value={form.unidad??"litros"} onChange={e=>setForm({...form,unidad:e.target.value})} className={inputClass}>
                      <option value="litros">Litros</option><option value="kg">kg</option><option value="bolsas">Bolsas</option><option value="unidad">Unidad</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Precio unitario</label><input type="number" value={form.precio_unitario??""} onChange={e=>setForm({...form,precio_unitario:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Ubicación</label>
                    <select value={form.tipo_ubicacion??"deposito_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={inputClass}>
                      <option value="deposito_propio">Depósito Propio</option><option value="comercio">Comercio</option><option value="cooperativa">Cooperativa</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass} placeholder="Ej: Depósito campo"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarInsumo} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormInsumo(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Cards por categoría */}
            {CAT_INSUMOS.map(cat=>{
              const items = insumos.filter(i=>i.categoria===cat.key);
              if (items.length===0) return null;
              // Si es agroquímico, agrupar por subcategoría
              if (cat.key==="agroquimico") {
                const subgrupos = SUBCATEGORIAS_AGRO.reduce((acc,sub)=>{
                  const filtered = items.filter(i=>i.subcategoria===sub||(!i.subcategoria&&sub==="otro"));
                  if (filtered.length>0) acc[sub]=filtered;
                  return acc;
                },{} as Record<string,InsumoItem[]>);
                return (
                  <div key={cat.key} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{cat.icon}</span>
                      <h3 className="font-bold font-mono" style={{color:cat.color}}>{cat.label}</h3>
                      <span className="text-xs text-[#4B5563] font-mono">{items.length} productos</span>
                    </div>
                    {Object.entries(subgrupos).map(([sub, subItems])=>(
                      <div key={sub} className="mb-3">
                        <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-2 px-1">— {sub}</div>
                        <div className="bg-[#0a1628]/80 border rounded-xl overflow-hidden" style={{borderColor:cat.color+"25"}}>
                          <table className="w-full">
                            <thead><tr className="border-b" style={{borderColor:cat.color+"15"}}>
                              {["Producto","Cantidad","Precio","Ubicación",""].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#4B5563] font-mono">{h}</th>)}
                            </tr></thead>
                            <tbody>{subItems.map(i=>(
                              <tr key={i.id} className="border-b hover:bg-white/5 transition-colors" style={{borderColor:cat.color+"10"}}>
                                <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{i.nombre}</td>
                                <td className="px-4 py-3 text-sm font-mono font-bold" style={{color:cat.color}}>{i.cantidad} {i.unidad}</td>
                                <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${i.precio_unitario}/{i.unidad}</td>
                                <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{i.tipo_ubicacion?.replace("_"," ")}{i.ubicacion?` · ${i.ubicacion}`:""}</td>
                                <td className="px-4 py-3"><button onClick={()=>eliminarItem("stock_insumos",i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div key={cat.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{cat.icon}</span>
                    <h3 className="font-bold font-mono" style={{color:cat.color}}>{cat.label}</h3>
                    <span className="text-xs text-[#4B5563] font-mono">{items.length} productos</span>
                  </div>
                  <div className="bg-[#0a1628]/80 border rounded-xl overflow-hidden" style={{borderColor:cat.color+"25"}}>
                    <table className="w-full">
                      <thead><tr className="border-b" style={{borderColor:cat.color+"15"}}>
                        {["Producto","Cantidad","Precio","Ubicación",""].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#4B5563] font-mono">{h}</th>)}
                      </tr></thead>
                      <tbody>{items.map(i=>(
                        <tr key={i.id} className="border-b hover:bg-white/5 transition-colors" style={{borderColor:cat.color+"10"}}>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{i.nombre}</td>
                          <td className="px-4 py-3 text-sm font-mono font-bold" style={{color:cat.color}}>{i.cantidad} {i.unidad}</td>
                          <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${i.precio_unitario}/{i.unidad}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{i.tipo_ubicacion?.replace("_"," ")}{i.ubicacion?` · ${i.ubicacion}`:""}</td>
                          <td className="px-4 py-3"><button onClick={()=>eliminarItem("stock_insumos",i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {insumos.length===0&&<div className="text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/60 border border-[#4ADE80]/15 rounded-xl">Sin insumos registrados</div>}
          </div>
        )}

        {/* GASOIL */}
        {tab==="gasoil" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>setShowFormGasoil(!showFormGasoil)} className="px-4 py-2 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm hover:bg-[#60A5FA]/20 transition-all">+ Cargar Gasoil</button>
            </div>
            {showFormGasoil && (
              <div className="bg-[#0a1628]/80 border border-[#60A5FA]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-4">+ STOCK GASOIL</h3>
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
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarGasoil} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormGasoil(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gasoil.length===0?<div className="col-span-2 text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#60A5FA]/15 rounded-xl">Sin stock de gasoil</div>:gasoil.map(g=>(
                <div key={g.id} className="card-hover bg-[#0a1628]/80 border border-[#60A5FA]/20 rounded-xl overflow-hidden">
                  <div className="relative h-28">
                    <Image src="/stock-gasoil.png" alt="gasoil" fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] to-transparent"/>
                    <div className="absolute bottom-3 left-4">
                      <div className="text-2xl font-bold text-white font-mono">{g.cantidad_litros.toLocaleString("es-AR")} L</div>
                      <div className="text-xs text-[#60A5FA] font-mono">{g.tipo_ubicacion?.replace("_"," ")}{g.ubicacion?` · ${g.ubicacion}`:""}</div>
                    </div>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-[#C9A227] font-mono font-bold text-sm">${g.precio_litro}/L</span>
                    <span className="text-[#9CA3AF] text-xs font-mono">Total: ${(g.cantidad_litros*g.precio_litro).toLocaleString("es-AR")}</span>
                    <button onClick={()=>eliminarItem("stock_gasoil",g.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VARIOS */}
        {tab==="varios" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>setShowFormVarios(!showFormVarios)} className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm hover:bg-[#A78BFA]/20 transition-all">+ Cargar Item</button>
            </div>
            {showFormVarios && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVO ITEM</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Categoría</label><input type="text" value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Unidad</label><input type="text" value={form.unidad??""} onChange={e=>setForm({...form,unidad:e.target.value})} className={inputClass} placeholder="kg, unidad, m..."/></div>
                  <div><label className={labelClass}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVarios} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormVarios(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
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
          </div>
        )}
      </div>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} className="btn-float fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#60A5FA]/30" title="IA Stock">
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#60A5FA]/30 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#60A5FA]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse"/><span className="text-[#60A5FA] text-xs font-mono font-bold">ASISTENTE IA — STOCK</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} className="text-[#4B5563] text-sm">✕</button>
          </div>
          <div className="p-3 max-h-48 overflow-y-auto">
            {!aiMsg&&!aiLoading&&(
              <div className="space-y-1">
                {["Cuánto stock de granos tengo?","Cuándo reabastecer gasoil?","Análisis del inventario"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#60A5FA] border border-[#60A5FA]/10 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p className="text-[#60A5FA] text-xs font-mono animate-pulse">Analizando...</p>}
            {aiMsg&&<p className="text-[#9CA3AF] text-xs font-mono leading-relaxed whitespace-pre-wrap">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá..." className="flex-1 bg-[#020810]/80 border border-[#60A5FA]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none"/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="px-3 py-2 rounded-lg bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

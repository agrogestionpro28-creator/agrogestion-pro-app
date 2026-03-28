"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type SubTab = "dashboard" | "animales" | "sanidad" | "reproduccion" | "movimientos" | "costos";

type Animal = {
  id: string; caravana: string; categoria: string; raza: string;
  fecha_nacimiento: string; peso_actual: number; estado_corporal: number;
  lote_potrero: string; propietario: string; estado: string; observaciones: string;
};
type Pesada = { id: string; animal_id: string; fecha: string; peso_kg: number; lote: string; };
type Sanidad = {
  id: string; fecha: string; tipo: string; producto: string; dosis: string;
  lote: string; cantidad_animales: number; responsable: string; costo_total: number;
  proxima_fecha: string; observaciones: string;
};
type Reproduccion = {
  id: string; animal_id: string; tipo_servicio: string; fecha_servicio: string;
  fecha_tacto: string; preñada: boolean; fecha_parto: string; tipo_parto: string;
  sexo_cria: string; peso_nacimiento: number; observaciones: string;
};
type Movimiento = {
  id: string; fecha: string; tipo: string; cantidad: number; categoria: string;
  kg_total: number; precio_kg: number; monto_total: number;
  origen: string; destino: string; flete: number; observaciones: string;
};
type Costo = {
  id: string; fecha: string; tipo: string; descripcion: string;
  lote: string; cantidad_animales: number; monto: number; costo_por_animal: number;
};

const CATEGORIAS = ["ternero","ternera","vaquillona","novillo","toro","vaca"];
const CAT_COLORS: Record<string,string> = {
  ternero:"#60A5FA", ternera:"#F472B6", vaquillona:"#4ADE80",
  novillo:"#C9A227", toro:"#F87171", vaca:"#A78BFA"
};
const CAT_ICONS: Record<string,string> = {
  ternero:"🐄", ternera:"🐄", vaquillona:"🐮", novillo:"🐂", toro:"🐃", vaca:"🐄"
};
const TIPO_SANIDAD = ["vacuna","desparasitacion","vitamina","medicamento","otro"];
const TIPO_COSTO = ["alimentacion","sanidad","flete","mano_obra","estructura","otro"];
const TIPO_MOV = ["compra","venta","traslado","muerte","nacimiento"];
const MOV_COLORS: Record<string,string> = {
  compra:"#4ADE80", venta:"#60A5FA", traslado:"#C9A227", muerte:"#F87171", nacimiento:"#A78BFA"
};

const SUBTABS: { key: SubTab; label: string; icon: string; color: string }[] = [
  { key:"dashboard", label:"Dashboard", icon:"📊", color:"#00FF80" },
  { key:"animales", label:"Animales", icon:"🐄", color:"#C9A227" },
  { key:"sanidad", label:"Sanidad", icon:"💉", color:"#4ADE80" },
  { key:"reproduccion", label:"Reproducción", icon:"❤️", color:"#F472B6" },
  { key:"movimientos", label:"Movimientos", icon:"📦", color:"#60A5FA" },
  { key:"costos", label:"Costos", icon:"💰", color:"#A78BFA" },
];

export default function HaciendaPage() {
  const [subTab, setSubTab] = useState<SubTab>("dashboard");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [animales, setAnimales] = useState<Animal[]>([]);
  const [pesadas, setPesadas] = useState<Pesada[]>([]);
  const [sanidad, setSanidad] = useState<Sanidad[]>([]);
  const [reproduccion, setReproduccion] = useState<Reproduccion[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [costos, setCostos] = useState<Costo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [animalDetalle, setAnimalDetalle] = useState<Animal|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [aiInput, setAiInput] = useState("");

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
    const [an, pe, san, rep, mov, cos] = await Promise.all([
      sb.from("hacienda_animales").select("*").eq("empresa_id", eid).eq("estado","activo").order("categoria"),
      sb.from("hacienda_pesadas").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("hacienda_sanidad").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("hacienda_reproduccion").select("*").eq("empresa_id", eid).order("fecha_servicio", { ascending: false }),
      sb.from("hacienda_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("hacienda_costos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
    ]);
    setAnimales(an.data ?? []);
    setPesadas(pe.data ?? []);
    setSanidad(san.data ?? []);
    setReproduccion(rep.data ?? []);
    setMovimientos(mov.data ?? []);
    setCostos(cos.data ?? []);
  };

  // KPIs calculados
  const totalCabezas = animales.length;
  const pesoPromedio = totalCabezas > 0 ? animales.reduce((a,x) => a + x.peso_actual, 0) / totalCabezas : 0;
  const kgTotales = animales.reduce((a,x) => a + x.peso_actual, 0);

  // ADPV por animal (usando últimas 2 pesadas)
  const calcADPV = () => {
    if (pesadas.length < 2) return 0;
    const ultimas = pesadas.slice(0, 20);
    let adpvTotal = 0; let count = 0;
    animales.forEach(a => {
      const pAnimal = ultimas.filter(p => p.animal_id === a.id).sort((x,y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());
      if (pAnimal.length >= 2) {
        const dias = (new Date(pAnimal[0].fecha).getTime() - new Date(pAnimal[1].fecha).getTime()) / (1000*60*60*24);
        if (dias > 0) { adpvTotal += (pAnimal[0].peso_kg - pAnimal[1].peso_kg) / dias; count++; }
      }
    });
    return count > 0 ? adpvTotal / count : 0;
  };

  const adpv = calcADPV();
  const mortandadPct = movimientos.length > 0
    ? (movimientos.filter(m => m.tipo === "muerte").reduce((a,m) => a + m.cantidad, 0) / Math.max(1, totalCabezas + movimientos.filter(m=>m.tipo==="muerte").reduce((a,m)=>a+m.cantidad,0))) * 100
    : 0;

  const preñezPct = reproduccion.length > 0
    ? (reproduccion.filter(r => r.preñada).length / reproduccion.length) * 100
    : 0;

  const costoTotal = costos.reduce((a,c) => a + c.monto, 0);
  const kgProducidos = movimientos.filter(m => m.tipo === "venta").reduce((a,m) => a + m.kg_total, 0);
  const costoPorKg = kgProducidos > 0 ? costoTotal / kgProducidos : 0;
  const ingresoVentas = movimientos.filter(m => m.tipo === "venta").reduce((a,m) => a + m.monto_total, 0);
  const margenBruto = ingresoVentas - costos.filter(c => ["alimentacion","sanidad"].includes(c.tipo)).reduce((a,c) => a + c.monto, 0);

  // Alertas sanitarias
  const alertasSanidad = sanidad.filter(s => {
    if (!s.proxima_fecha) return false;
    const dias = (new Date(s.proxima_fecha).getTime() - Date.now()) / (1000*60*60*24);
    return dias <= 30;
  });

  const guardarAnimal = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("hacienda_animales").insert({
      empresa_id: empresaId, caravana: form.caravana ?? "",
      categoria: form.categoria ?? "novillo", raza: form.raza ?? "",
      fecha_nacimiento: form.fecha_nacimiento || null,
      peso_actual: Number(form.peso_actual ?? 0),
      estado_corporal: Number(form.estado_corporal ?? 0),
      lote_potrero: form.lote_potrero ?? "",
      propietario: form.propietario ?? "",
      estado: "activo", observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarPesada = async (animalId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const peso = Number(form.peso_pesada ?? 0);
    await sb.from("hacienda_pesadas").insert({
      empresa_id: empresaId, animal_id: animalId,
      fecha: form.fecha_pesada ?? new Date().toISOString().split("T")[0],
      peso_kg: peso, lote: form.lote_pesada ?? "",
    });
    await sb.from("hacienda_animales").update({ peso_actual: peso }).eq("id", animalId);
    await fetchAll(empresaId); setForm({});
  };

  const guardarSanidad = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const costo = Number(form.costo_total ?? 0);
    const cant = Number(form.cantidad_animales ?? 0);
    await sb.from("hacienda_sanidad").insert({
      empresa_id: empresaId,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_sanidad ?? "vacuna",
      producto: form.producto ?? "",
      dosis: form.dosis ?? "",
      lote: form.lote ?? "",
      cantidad_animales: cant,
      responsable: form.responsable ?? "",
      costo_total: costo,
      proxima_fecha: form.proxima_fecha || null,
      observaciones: form.observaciones ?? "",
    });
    // Registrar también en costos hacienda
    if (costo > 0) {
      await sb.from("hacienda_costos").insert({
        empresa_id: empresaId, fecha: form.fecha ?? new Date().toISOString().split("T")[0],
        tipo: "sanidad", descripcion: `${form.tipo_sanidad} - ${form.producto}`,
        lote: form.lote ?? "", cantidad_animales: cant,
        monto: costo, costo_por_animal: cant > 0 ? costo/cant : 0,
      });
    }
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarReproduccion = async () => {
    if (!empresaId || !animalDetalle) return;
    const sb = await getSB();
    await sb.from("hacienda_reproduccion").insert({
      empresa_id: empresaId, animal_id: animalDetalle.id,
      tipo_servicio: form.tipo_servicio ?? "natural",
      fecha_servicio: form.fecha_servicio || null,
      fecha_tacto: form.fecha_tacto || null,
      preñada: form.preñada === "si",
      fecha_parto: form.fecha_parto || null,
      tipo_parto: form.tipo_parto ?? "normal",
      sexo_cria: form.sexo_cria ?? "",
      peso_nacimiento: Number(form.peso_nacimiento ?? 0),
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const cant = Number(form.cantidad ?? 0);
    const kgTotal = Number(form.kg_total ?? 0);
    const precioKg = Number(form.precio_kg ?? 0);
    await sb.from("hacienda_movimientos").insert({
      empresa_id: empresaId,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_mov ?? "compra",
      cantidad: cant, categoria: form.categoria ?? "",
      kg_total: kgTotal, precio_kg: precioKg,
      monto_total: kgTotal * precioKg,
      origen: form.origen ?? "", destino: form.destino ?? "",
      flete: Number(form.flete ?? 0),
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarCosto = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const monto = Number(form.monto ?? 0);
    const cant = Number(form.cantidad_animales ?? 0);
    await sb.from("hacienda_costos").insert({
      empresa_id: empresaId,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_costo ?? "alimentacion",
      descripcion: form.descripcion ?? "",
      lote: form.lote ?? "", cantidad_animales: cant,
      monto, costo_por_animal: cant > 0 ? monto/cant : 0,
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 800,
          messages: [{ role: "user", content: `Sos un asesor ganadero experto en Argentina. Datos: ${totalCabezas} cabezas, ADPV: ${adpv.toFixed(2)} kg/día, Mortandad: ${mortandadPct.toFixed(1)}%, Preñez: ${preñezPct.toFixed(0)}%, Costo/kg: $${costoPorKg.toFixed(0)}, Margen bruto: $${margenBruto.toLocaleString("es-AR")}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error IA"); }
    setAiLoading(false);
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#4ADE80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#4ADE80] font-mono animate-pulse">▶ Cargando Hacienda...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .card-hac:hover{border-color:rgba(74,222,128,0.4)!important;transform:translateY(-2px)}
        .card-hac{transition:all 0.2s ease}
        .tab-hac-active{border-color:#4ADE80!important;color:#4ADE80!important;background:rgba(74,222,128,0.08)!important}
        .btn-float{animation:float 3s ease-in-out infinite}
        .logo-btn:hover{filter:drop-shadow(0 0 12px rgba(74,222,128,0.8));transform:scale(1.03)}
        .logo-btn{transition:all 0.2s ease;cursor:pointer}
        .kpi-card{background:rgba(10,22,40,0.85);border:1px solid rgba(74,222,128,0.15);border-radius:12px;padding:16px;transition:all 0.2s}
        .kpi-card:hover{border-color:rgba(74,222,128,0.35);transform:translateY(-2px)}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="bg" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.02]" style={{backgroundImage:`linear-gradient(rgba(74,222,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(74,222,128,0.5) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#4ADE80,#00FF80,#4ADE80,transparent)",backgroundSize:"200% 100%",animation:"gradient-flow 4s ease infinite"}}/>
        <div className="absolute inset-0" style={{background:"linear-gradient(135deg,rgba(2,8,16,0.95) 0%,rgba(0,15,5,0.90) 50%,rgba(2,8,16,0.95) 100%)"}}/>
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={()=>animalDetalle?setAnimalDetalle(null):window.location.href="/productor/dashboard"} className="text-[#4B5563] hover:text-[#4ADE80] transition-colors font-mono text-sm">
            ← {animalDetalle?"Volver":"Dashboard"}
          </button>
          <div className="flex-1"/>
          <div className="logo-btn" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* Title */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold font-mono"><span className="text-[#E5E7EB]">🐄 Hacienda </span><span className="text-[#4ADE80]">PRO</span></h1>
            <p className="text-[#4B5563] text-sm font-mono">{totalCabezas} cabezas activas · {pesoPromedio.toFixed(0)} kg promedio</p>
          </div>
        </div>

        {/* SUBTABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {SUBTABS.map(t=>(
            <button key={t.key} onClick={()=>{setSubTab(t.key);setShowForm(false);setForm({});setAnimalDetalle(null);}}
              className={`px-4 py-2 rounded-xl border text-sm font-mono whitespace-nowrap transition-all ${subTab===t.key?"tab-hac-active":"border-[#4ADE80]/15 text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ===== DASHBOARD ===== */}
        {subTab==="dashboard" && (
          <div>
            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
              {[
                {label:"STOCK TOTAL",value:`${totalCabezas}`,sub:"cabezas",color:"#4ADE80",icon:"🐄"},
                {label:"KG TOTALES",value:`${kgTotales.toLocaleString("es-AR")}`,sub:"kg en pie",color:"#C9A227",icon:"⚖️"},
                {label:"ADPV",value:`${adpv.toFixed(2)}`,sub:"kg/día",color:"#60A5FA",icon:"📈"},
                {label:"MORTANDAD",value:`${mortandadPct.toFixed(1)}%`,sub:"del stock",color:mortandadPct>3?"#F87171":"#4ADE80",icon:"⚠️"},
                {label:"ÍNDICE PREÑEZ",value:`${preñezPct.toFixed(0)}%`,sub:"diagnóstico",color:preñezPct>80?"#4ADE80":"#C9A227",icon:"❤️"},
                {label:"COSTO/KG",value:`$${costoPorKg.toFixed(0)}`,sub:"producido",color:"#A78BFA",icon:"💰"},
              ].map(s=>(
                <div key={s.label} className="kpi-card">
                  <div className="flex items-center justify-between mb-2"><span className="text-xs text-[#4B5563] font-mono">{s.label}</span><span>{s.icon}</span></div>
                  <div className="text-2xl font-bold font-mono" style={{color:s.color}}>{s.value}</div>
                  <div className="text-xs text-[#4B5563] font-mono">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Stats secundarios */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                {label:"PESO PROMEDIO",value:`${pesoPromedio.toFixed(0)} kg`,color:"#E5E7EB"},
                {label:"MARGEN BRUTO",value:`$${margenBruto.toLocaleString("es-AR")}`,color:margenBruto>=0?"#4ADE80":"#F87171"},
                {label:"INGRESOS VENTAS",value:`$${ingresoVentas.toLocaleString("es-AR")}`,color:"#60A5FA"},
                {label:"COSTO TOTAL",value:`$${costoTotal.toLocaleString("es-AR")}`,color:"#F87171"},
              ].map(s=>(
                <div key={s.label} className="kpi-card">
                  <div className="text-xs text-[#4B5563] font-mono mb-2">{s.label}</div>
                  <div className="text-xl font-bold font-mono" style={{color:s.color}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Stock por categoría */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl p-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">🐄 STOCK POR CATEGORÍA</h3>
                <div className="space-y-3">
                  {CATEGORIAS.map(cat=>{
                    const count=animales.filter(a=>a.categoria===cat).length;
                    if(count===0) return null;
                    const pct=totalCabezas>0?count/totalCabezas*100:0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span style={{color:CAT_COLORS[cat]}}>{CAT_ICONS[cat]} {cat.toUpperCase()}</span>
                          <span className="text-[#E5E7EB] font-bold">{count} cab · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-[#020810]/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:CAT_COLORS[cat]}}/>
                        </div>
                      </div>
                    );
                  })}
                  {totalCabezas===0&&<p className="text-[#4B5563] font-mono text-sm text-center py-4">Sin animales registrados</p>}
                </div>
              </div>

              {/* Alertas sanitarias */}
              <div className="bg-[#0a1628]/80 border border-[#F87171]/20 rounded-xl p-5">
                <h3 className="text-[#F87171] font-mono text-sm font-bold mb-4">⚠️ ALERTAS SANITARIAS</h3>
                {alertasSanidad.length===0?(
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">✅</div>
                    <p className="text-[#4ADE80] font-mono text-sm">Sin alertas pendientes</p>
                  </div>
                ):(
                  <div className="space-y-2">
                    {alertasSanidad.map(s=>{
                      const dias=Math.round((new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24));
                      return (
                        <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${dias<=7?"border-[#F87171]/30 bg-[#F87171]/5":"border-[#C9A227]/30 bg-[#C9A227]/5"}`}>
                          <div className="w-2 h-2 rounded-full animate-pulse" style={{background:dias<=7?"#F87171":"#C9A227"}}/>
                          <div className="flex-1">
                            <div className="text-xs font-mono font-bold text-[#E5E7EB]">{s.producto}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{s.lote||"Todo el rodeo"} · {s.proxima_fecha}</div>
                          </div>
                          <span className="text-xs font-mono" style={{color:dias<=7?"#F87171":"#C9A227"}}>{dias}d</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Botones acceso rápido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                {label:"Gestión Animal",icon:"🐄",tab:"animales" as SubTab,color:"#4ADE80"},
                {label:"Reproducción",icon:"❤️",tab:"reproduccion" as SubTab,color:"#F472B6"},
                {label:"Movimientos",icon:"📦",tab:"movimientos" as SubTab,color:"#60A5FA"},
                {label:"Plan Sanitario",icon:"💉",tab:"sanidad" as SubTab,color:"#C9A227"},
              ].map(b=>(
                <button key={b.label} onClick={()=>setSubTab(b.tab)}
                  className="flex items-center justify-between px-5 py-4 rounded-xl border font-mono text-sm font-bold transition-all hover:opacity-80"
                  style={{borderColor:b.color+"40",background:b.color+"10",color:b.color}}>
                  <span>{b.icon} {b.label}</span>
                  <span>→</span>
                </button>
              ))}
            </div>

            {/* Últimos movimientos */}
            <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#4ADE80]/10 flex items-center justify-between">
                <span className="text-[#4ADE80] font-mono text-sm font-bold">📦 ÚLTIMOS MOVIMIENTOS</span>
                <button onClick={()=>setSubTab("movimientos")} className="text-xs text-[#4B5563] hover:text-[#4ADE80] font-mono">Ver todos →</button>
              </div>
              {movimientos.slice(0,5).map(m=>(
                <div key={m.id} className="px-5 py-3 border-b border-[#4ADE80]/5 flex items-center justify-between hover:bg-[#4ADE80]/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:MOV_COLORS[m.tipo]+"20",color:MOV_COLORS[m.tipo]}}>{m.tipo}</span>
                    <div>
                      <div className="text-sm font-mono text-[#E5E7EB]">{m.cantidad} {m.categoria} · {m.kg_total}kg</div>
                      <div className="text-xs text-[#4B5563] font-mono">{m.fecha} · {m.origen||m.destino}</div>
                    </div>
                  </div>
                  {m.monto_total>0&&<span className="text-[#4ADE80] font-bold font-mono text-sm">${Number(m.monto_total).toLocaleString("es-AR")}</span>}
                </div>
              ))}
              {movimientos.length===0&&<div className="text-center py-8 text-[#4B5563] font-mono text-sm">Sin movimientos</div>}
            </div>
          </div>
        )}

        {/* ===== ANIMALES ===== */}
        {subTab==="animales" && !animalDetalle && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-2 text-xs font-mono flex-wrap">
                {CATEGORIAS.map(cat=>{
                  const count=animales.filter(a=>a.categoria===cat).length;
                  if(count===0) return null;
                  return <span key={cat} className="px-2 py-1 rounded-lg" style={{background:CAT_COLORS[cat]+"15",color:CAT_COLORS[cat]}}>{CAT_ICONS[cat]} {count} {cat}</span>;
                })}
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({categoria:"novillo"});}} className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm hover:bg-[#4ADE80]/20 transition-all">+ Nuevo Animal</button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ NUEVO ANIMAL</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Caravana / ID</label><input type="text" value={form.caravana??""} onChange={e=>setForm({...form,caravana:e.target.value})} className={inputClass} placeholder="Ej: 123456"/></div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria??"novillo"} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}>
                      {CATEGORIAS.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Raza</label><input type="text" value={form.raza??""} onChange={e=>setForm({...form,raza:e.target.value})} className={inputClass} placeholder="Ej: Hereford, Angus"/></div>
                  <div><label className={labelClass}>Fecha nacimiento</label><input type="date" value={form.fecha_nacimiento??""} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Peso actual (kg)</label><input type="number" value={form.peso_actual??""} onChange={e=>setForm({...form,peso_actual:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Estado corporal (1-5)</label><input type="number" value={form.estado_corporal??""} onChange={e=>setForm({...form,estado_corporal:e.target.value})} className={inputClass} min="1" max="5" placeholder="3"/></div>
                  <div><label className={labelClass}>Lote / Potrero</label><input type="text" value={form.lote_potrero??""} onChange={e=>setForm({...form,lote_potrero:e.target.value})} className={inputClass} placeholder="Ej: Potrero Norte"/></div>
                  <div><label className={labelClass}>Propietario</label><input type="text" value={form.propietario??""} onChange={e=>setForm({...form,propietario:e.target.value})} className={inputClass} placeholder="Propio / Hotelería"/></div>
                  <div className="md:col-span-4"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarAnimal} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {animales.length===0?(
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#4ADE80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">🐄</div>
                <p className="text-[#4B5563] font-mono">Sin animales registrados</p>
              </div>
            ):(
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#4ADE80]/10">
                      {["Caravana","Categoría","Raza","Peso","E.Corp","Lote","Propietario",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono uppercase tracking-widest">{h}</th>)}
                    </tr></thead>
                    <tbody>{animales.map(a=>(
                      <tr key={a.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5 transition-colors cursor-pointer" onClick={()=>setAnimalDetalle(a)}>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{a.caravana||"—"}</td>
                        <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:CAT_COLORS[a.categoria]+"20",color:CAT_COLORS[a.categoria]}}>{CAT_ICONS[a.categoria]} {a.categoria}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{a.raza||"—"}</td>
                        <td className="px-4 py-3 text-sm font-bold text-[#C9A227] font-mono">{a.peso_actual} kg</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{a.estado_corporal||"—"}/5</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{a.lote_potrero||"—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{a.propietario||"Propio"}</td>
                        <td className="px-4 py-3"><button onClick={e=>{e.stopPropagation();eliminar("hacienda_animales",a.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== FICHA INDIVIDUAL ===== */}
        {subTab==="animales" && animalDetalle && (
          <div>
            <button onClick={()=>setAnimalDetalle(null)} className="text-[#4B5563] hover:text-[#4ADE80] font-mono text-sm mb-4">← Volver al rodeo</button>
            <div className="bg-[#0a1628]/80 border rounded-xl p-5 mb-4" style={{borderColor:CAT_COLORS[animalDetalle.categoria]+"30"}}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl" style={{background:CAT_COLORS[animalDetalle.categoria]+"15",border:`1px solid ${CAT_COLORS[animalDetalle.categoria]}30`}}>
                    {CAT_ICONS[animalDetalle.categoria]}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#E5E7EB] font-mono">Caravana {animalDetalle.caravana||"Sin ID"}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:CAT_COLORS[animalDetalle.categoria]+"20",color:CAT_COLORS[animalDetalle.categoria]}}>{animalDetalle.categoria}</span>
                      {animalDetalle.raza&&<span className="text-xs text-[#4B5563] font-mono">{animalDetalle.raza}</span>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><div className="text-xs text-[#4B5563] font-mono">PESO</div><div className="text-xl font-bold text-[#C9A227] font-mono">{animalDetalle.peso_actual} kg</div></div>
                  <div><div className="text-xs text-[#4B5563] font-mono">E.CORP</div><div className="text-xl font-bold text-[#4ADE80] font-mono">{animalDetalle.estado_corporal||"—"}/5</div></div>
                  <div><div className="text-xs text-[#4B5563] font-mono">LOTE</div><div className="text-sm font-bold text-[#E5E7EB] font-mono">{animalDetalle.lote_potrero||"—"}</div></div>
                </div>
              </div>
            </div>

            {/* Historial pesadas */}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold">⚖️ HISTORIAL DE PESADAS</h3>
                <button onClick={()=>setShowForm(showForm?false:true)} className="text-xs text-[#C9A227] border border-[#C9A227]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#C9A227]/10">+ Pesada</button>
              </div>
              {showForm && (
                <div className="flex items-end gap-3 mb-4 flex-wrap">
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha_pesada??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_pesada:e.target.value})} className={inputClass+" w-36"}/></div>
                  <div><label className={labelClass}>Peso (kg)</label><input type="number" value={form.peso_pesada??""} onChange={e=>setForm({...form,peso_pesada:e.target.value})} className={inputClass+" w-28"} placeholder="0"/></div>
                  <button onClick={()=>guardarPesada(animalDetalle.id)} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>setShowForm(false)} className="text-[#4B5563] text-sm font-mono">✕</button>
                </div>
              )}
              {pesadas.filter(p=>p.animal_id===animalDetalle.id).length===0?(
                <p className="text-[#4B5563] font-mono text-sm">Sin pesadas registradas</p>
              ):(
                <div className="space-y-2">
                  {pesadas.filter(p=>p.animal_id===animalDetalle.id).map((p,i,arr)=>{
                    const prev=arr[i+1];
                    const adpvLocal=prev?((p.peso_kg-prev.peso_kg)/Math.max(1,(new Date(p.fecha).getTime()-new Date(prev.fecha).getTime())/(1000*60*60*24))):null;
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-[#020810]/40 rounded-lg px-4 py-2.5">
                        <span className="text-xs text-[#9CA3AF] font-mono">{p.fecha}</span>
                        <span className="text-sm font-bold text-[#C9A227] font-mono">{p.peso_kg} kg</span>
                        {adpvLocal!==null&&<span className="text-xs font-mono" style={{color:adpvLocal>=0?"#4ADE80":"#F87171"}}>{adpvLocal.toFixed(2)} kg/d</span>}
                        <button onClick={()=>eliminar("hacienda_pesadas",p.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Historial reproducción */}
            <div className="bg-[#0a1628]/80 border border-[#F472B6]/15 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#F472B6] font-mono text-sm font-bold">❤️ REPRODUCCIÓN</h3>
              </div>
              {reproduccion.filter(r=>r.animal_id===animalDetalle.id).length===0?(
                <p className="text-[#4B5563] font-mono text-sm">Sin registros de reproducción</p>
              ):(
                <div className="space-y-2">
                  {reproduccion.filter(r=>r.animal_id===animalDetalle.id).map(r=>(
                    <div key={r.id} className="flex items-center justify-between bg-[#020810]/40 rounded-lg px-4 py-2.5 flex-wrap gap-2">
                      <span className="text-xs text-[#9CA3AF] font-mono">{r.fecha_servicio}</span>
                      <span className="text-xs font-mono text-[#E5E7EB]">{r.tipo_servicio}</span>
                      {r.preñada!==null&&<span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:r.preñada?"rgba(74,222,128,0.15)":"rgba(248,113,113,0.15)",color:r.preñada?"#4ADE80":"#F87171"}}>{r.preñada?"✓ Preñada":"✗ Vacía"}</span>}
                      {r.fecha_parto&&<span className="text-xs text-[#F472B6] font-mono">Parto: {r.fecha_parto}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== SANIDAD ===== */}
        {subTab==="sanidad" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_sanidad:"vacuna",fecha:new Date().toISOString().split("T")[0]});}}
                className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm hover:bg-[#4ADE80]/20 transition-all">
                + Nuevo Registro Sanitario
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">+ REGISTRO SANITARIO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_sanidad??"vacuna"} onChange={e=>setForm({...form,tipo_sanidad:e.target.value})} className={inputClass}>
                      {TIPO_SANIDAD.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Producto</label><input type="text" value={form.producto??""} onChange={e=>setForm({...form,producto:e.target.value})} className={inputClass} placeholder="Ej: Aftosa, Ivermectina..."/></div>
                  <div><label className={labelClass}>Dosis</label><input type="text" value={form.dosis??""} onChange={e=>setForm({...form,dosis:e.target.value})} className={inputClass} placeholder="Ej: 2 ml"/></div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Lote / Potrero</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={inputClass} placeholder="Ej: Todo el rodeo"/></div>
                  <div><label className={labelClass}>Cantidad animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Responsable</label><input type="text" value={form.responsable??""} onChange={e=>setForm({...form,responsable:e.target.value})} className={inputClass} placeholder="Veterinario / Encargado"/></div>
                  <div><label className={labelClass}>Costo total</label><input type="number" value={form.costo_total??""} onChange={e=>setForm({...form,costo_total:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Próxima fecha</label><input type="date" value={form.proxima_fecha??""} onChange={e=>setForm({...form,proxima_fecha:e.target.value})} className={inputClass}/></div>
                  <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarSanidad} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {/* Alertas */}
            {alertasSanidad.length>0&&(
              <div className="bg-[#F87171]/5 border border-[#F87171]/20 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse"/><span className="text-[#F87171] text-xs font-mono font-bold">⚠️ PRÓXIMAS APLICACIONES</span></div>
                <div className="flex flex-wrap gap-2">
                  {alertasSanidad.map(s=>{const dias=Math.round((new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24));return<div key={s.id} className="text-xs border px-3 py-1 rounded-lg font-mono" style={{borderColor:dias<=7?"rgba(248,113,113,0.3)":"rgba(201,162,39,0.3)",color:dias<=7?"#F87171":"#C9A227"}}>{s.producto} · {dias}d · {s.lote||"Rodeo"}</div>;})}
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#4ADE80]/15 rounded-xl overflow-hidden">
              {sanidad.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin registros sanitarios</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#4ADE80]/10">{["Fecha","Tipo","Producto","Dosis","Lote","Animales","Costo","Responsable","Próxima",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{sanidad.map(s=>(
                      <tr key={s.id} className="border-b border-[#4ADE80]/5 hover:bg-[#4ADE80]/5">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{s.producto}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.dosis}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.lote||"—"}</td>
                        <td className="px-4 py-3 text-sm text-[#C9A227] font-mono font-bold">{s.cantidad_animales}</td>
                        <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{s.costo_total>0?`$${Number(s.costo_total).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.responsable||"—"}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{color:s.proxima_fecha&&(new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24)<=30?"#F87171":"#9CA3AF"}}>{s.proxima_fecha||"—"}</td>
                        <td className="px-4 py-3"><button onClick={()=>eliminar("hacienda_sanidad",s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== REPRODUCCIÓN ===== */}
        {subTab==="reproduccion" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_servicio:"natural",tipo_parto:"normal"});}}
                className="px-4 py-2 rounded-xl bg-[#F472B6]/10 border border-[#F472B6]/30 text-[#F472B6] font-mono text-sm hover:bg-[#F472B6]/20 transition-all">
                + Nuevo Registro Reproductivo
              </button>
            </div>
            {/* Stats reproducción */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                {label:"DIAGNÓSTICOS",value:reproduccion.length,color:"#E5E7EB"},
                {label:"% PREÑEZ",value:`${preñezPct.toFixed(0)}%`,color:preñezPct>80?"#4ADE80":"#F87171"},
                {label:"PARTOS",value:reproduccion.filter(r=>r.fecha_parto).length,color:"#F472B6"},
              ].map(s=>(
                <div key={s.label} className="kpi-card text-center">
                  <div className="text-xs text-[#4B5563] font-mono">{s.label}</div>
                  <div className="text-2xl font-bold font-mono mt-1" style={{color:s.color}}>{s.value}</div>
                </div>
              ))}
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#F472B6]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#F472B6] font-mono text-sm font-bold mb-4">+ REGISTRO REPRODUCTIVO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Animal (caravana)</label>
                    <select value={form.animal_id??""} onChange={e=>setForm({...form,animal_id:e.target.value})} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {animales.filter(a=>a.categoria==="vaca"||a.categoria==="vaquillona").map(a=><option key={a.id} value={a.id}>{a.caravana||a.id.slice(0,8)} · {a.categoria}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Tipo servicio</label>
                    <select value={form.tipo_servicio??"natural"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className={inputClass}>
                      <option value="natural">Natural</option><option value="inseminacion">Inseminación</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha servicio</label><input type="date" value={form.fecha_servicio??""} onChange={e=>setForm({...form,fecha_servicio:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Fecha tacto</label><input type="date" value={form.fecha_tacto??""} onChange={e=>setForm({...form,fecha_tacto:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Resultado tacto</label>
                    <select value={form.preñada??""} onChange={e=>setForm({...form,preñada:e.target.value})} className={inputClass}>
                      <option value="">Sin diagnóstico</option><option value="si">✓ Preñada</option><option value="no">✗ Vacía</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha parto</label><input type="date" value={form.fecha_parto??""} onChange={e=>setForm({...form,fecha_parto:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Tipo parto</label>
                    <select value={form.tipo_parto??"normal"} onChange={e=>setForm({...form,tipo_parto:e.target.value})} className={inputClass}>
                      <option value="normal">Normal</option><option value="asistido">Asistido</option><option value="cesarea">Cesárea</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Sexo cría</label>
                    <select value={form.sexo_cria??""} onChange={e=>setForm({...form,sexo_cria:e.target.value})} className={inputClass}>
                      <option value="">—</option><option value="macho">Macho</option><option value="hembra">Hembra</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Peso al nacer (kg)</label><input type="number" value={form.peso_nacimiento??""} onChange={e=>setForm({...form,peso_nacimiento:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={()=>{
                    if (!empresaId) return;
                    const animalSel = animales.find(a=>a.id===form.animal_id);
                    setAnimalDetalle(animalSel||null);
                    if(animalSel) guardarReproduccion();
                    else { getSB().then(sb=>sb.from("hacienda_reproduccion").insert({empresa_id:empresaId,animal_id:form.animal_id||null,...{tipo_servicio:form.tipo_servicio??"natural",fecha_servicio:form.fecha_servicio||null,fecha_tacto:form.fecha_tacto||null,preñada:form.preñada==="si",fecha_parto:form.fecha_parto||null,tipo_parto:form.tipo_parto??"normal",sexo_cria:form.sexo_cria??"",peso_nacimiento:Number(form.peso_nacimiento??0),observaciones:form.observaciones??""}})).then(()=>fetchAll(empresaId)).then(()=>{setShowForm(false);setForm({});});
                    }
                  }} className="bg-[#F472B6]/10 border border-[#F472B6]/30 text-[#F472B6] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#F472B6]/15 rounded-xl overflow-hidden">
              {reproduccion.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin registros reproductivos</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#F472B6]/10">{["Animal","Servicio","F.Servicio","F.Tacto","Resultado","Parto","Cría",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{reproduccion.map(r=>{
                    const an=animales.find(a=>a.id===r.animal_id);
                    return (
                      <tr key={r.id} className="border-b border-[#F472B6]/5 hover:bg-[#F472B6]/5">
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{an?.caravana||r.animal_id?.slice(0,8)||"—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.tipo_servicio}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.fecha_servicio||"—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.fecha_tacto||"—"}</td>
                        <td className="px-4 py-3">
                          {r.preñada!==null?<span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:r.preñada?"rgba(74,222,128,0.15)":"rgba(248,113,113,0.15)",color:r.preñada?"#4ADE80":"#F87171"}}>{r.preñada?"Preñada":"Vacía"}</span>:<span className="text-xs text-[#4B5563] font-mono">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#F472B6] font-mono">{r.fecha_parto||"—"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.sexo_cria?`${r.sexo_cria} · ${r.peso_nacimiento}kg`:"—"}</td>
                        <td className="px-4 py-3"><button onClick={()=>eliminar("hacienda_reproduccion",r.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== MOVIMIENTOS ===== */}
        {subTab==="movimientos" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_mov:"compra",fecha:new Date().toISOString().split("T")[0]});}}
                className="px-4 py-2 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm hover:bg-[#60A5FA]/20 transition-all">
                + Nuevo Movimiento
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#60A5FA]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-4">+ MOVIMIENTO DE HACIENDA</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_mov??"compra"} onChange={e=>setForm({...form,tipo_mov:e.target.value})} className={inputClass}>
                      {TIPO_MOV.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Cantidad (cabezas)</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Kg totales</label><input type="number" value={form.kg_total??""} onChange={e=>setForm({...form,kg_total:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Precio/kg</label><input type="number" value={form.precio_kg??""} onChange={e=>setForm({...form,precio_kg:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Origen</label><input type="text" value={form.origen??""} onChange={e=>setForm({...form,origen:e.target.value})} className={inputClass} placeholder="Establecimiento origen"/></div>
                  <div><label className={labelClass}>Destino</label><input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={inputClass} placeholder="Frigorífico / Mercado"/></div>
                  <div><label className={labelClass}>Flete ($)</label><input type="number" value={form.flete??""} onChange={e=>setForm({...form,flete:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/></div>
                </div>
                {form.kg_total&&form.precio_kg&&(
                  <div className="mt-3 p-3 bg-[#60A5FA]/5 border border-[#60A5FA]/20 rounded-lg text-xs font-mono text-[#60A5FA]">
                    Total operación: ${(Number(form.kg_total)*Number(form.precio_kg)).toLocaleString("es-AR")}
                    {form.flete&&Number(form.flete)>0&&` · Neto: $${(Number(form.kg_total)*Number(form.precio_kg)-Number(form.flete)).toLocaleString("es-AR")}`}
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarMovimiento} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#60A5FA]/15 rounded-xl overflow-hidden">
              {movimientos.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin movimientos</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#60A5FA]/10">{["Fecha","Tipo","Categoría","Cabezas","Kg","$/kg","Total","Flete","Origen/Destino",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{movimientos.map(m=>(
                      <tr key={m.id} className="border-b border-[#60A5FA]/5 hover:bg-[#60A5FA]/5">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.fecha}</td>
                        <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{background:MOV_COLORS[m.tipo]+"20",color:MOV_COLORS[m.tipo]}}>{m.tipo}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.categoria}</td>
                        <td className="px-4 py-3 text-sm font-bold text-[#E5E7EB] font-mono">{m.cantidad}</td>
                        <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{m.kg_total}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.precio_kg>0?`$${m.precio_kg}`:"-"}</td>
                        <td className="px-4 py-3 font-bold text-[#4ADE80] font-mono text-sm">{m.monto_total>0?`$${Number(m.monto_total).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#F87171] font-mono">{m.flete>0?`$${Number(m.flete).toLocaleString("es-AR")}`:"-"}</td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{m.origen||m.destino||"—"}</td>
                        <td className="px-4 py-3"><button onClick={()=>eliminar("hacienda_movimientos",m.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== COSTOS ===== */}
        {subTab==="costos" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-mono text-[#A78BFA]">Total: <strong>${costoTotal.toLocaleString("es-AR")}</strong> · Por animal: <strong>${totalCabezas>0?(costoTotal/totalCabezas).toFixed(0):"0"}</strong></div>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_costo:"alimentacion",fecha:new Date().toISOString().split("T")[0]});}}
                className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm hover:bg-[#A78BFA]/20 transition-all">
                + Nuevo Costo
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ CARGAR COSTO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_costo??"alimentacion"} onChange={e=>setForm({...form,tipo_costo:e.target.value})} className={inputClass}>
                      {TIPO_COSTO.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={inputClass}/></div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={inputClass} placeholder="Detalle del costo"/></div>
                  <div><label className={labelClass}>Lote / Imputación</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={inputClass} placeholder="Todo el rodeo / Potrero"/></div>
                  <div><label className={labelClass}>Cantidad animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={inputClass} placeholder="0"/></div>
                  <div><label className={labelClass}>Monto total</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={inputClass}/></div>
                  <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={inputClass}/></div>
                </div>
                {form.monto&&form.cantidad_animales&&Number(form.cantidad_animales)>0&&(
                  <div className="mt-3 p-3 bg-[#A78BFA]/5 border border-[#A78BFA]/20 rounded-lg text-xs font-mono text-[#A78BFA]">
                    Costo por animal: ${(Number(form.monto)/Number(form.cantidad_animales)).toLocaleString("es-AR")}
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCosto} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {/* Por categoría */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              {TIPO_COSTO.map(tipo=>{
                const tot=costos.filter(c=>c.tipo===tipo).reduce((a,c)=>a+c.monto,0);
                if(tot===0) return null;
                return (
                  <div key={tipo} className="kpi-card text-center">
                    <div className="text-xs text-[#4B5563] font-mono mb-1">{tipo.replace("_"," ").toUpperCase()}</div>
                    <div className="text-sm font-bold text-[#A78BFA] font-mono">${tot.toLocaleString("es-AR")}</div>
                  </div>
                );
              })}
            </div>
            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {costos.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin costos registrados</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">{["Fecha","Tipo","Descripción","Lote","Animales","Monto","$/animal",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{costos.map(c=>(
                    <tr key={c.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5">
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{c.tipo.replace("_"," ")}</span></td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.descripcion}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.lote||"—"}</td>
                      <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{c.cantidad_animales||"—"}</td>
                      <td className="px-4 py-3 font-bold text-[#A78BFA] font-mono">${Number(c.monto).toLocaleString("es-AR")}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.costo_por_animal>0?`$${Number(c.costo_por_animal).toLocaleString("es-AR")}`:"-"}</td>
                      <td className="px-4 py-3"><button onClick={()=>eliminar("hacienda_costos",c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[#0a1a08] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · HACIENDA PRO</p>

      {/* Botón IA flotante */}
      <button onClick={()=>setShowIA(!showIA)} className="btn-float fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#4ADE80]/30" title="Asesor Ganadero IA">
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#4ADE80]/30 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#4ADE80]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse"/><span className="text-[#4ADE80] text-xs font-mono font-bold">ASESOR GANADERO IA</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} className="text-[#4B5563] text-sm">✕</button>
          </div>
          <div className="p-3 max-h-52 overflow-y-auto">
            {!aiMsg&&!aiLoading&&(
              <div className="space-y-1">
                {["Analizá mi rodeo actual","Cuándo conviene vender?","Costo por kg producido?","Alertas sanitarias"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#4ADE80] border border-[#4ADE80]/10 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p className="text-[#4ADE80] text-xs font-mono animate-pulse">Analizando rodeo...</p>}
            {aiMsg&&<p className="text-[#9CA3AF] text-xs font-mono leading-relaxed whitespace-pre-wrap">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre el rodeo..." className="flex-1 bg-[#020810]/80 border border-[#4ADE80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none"/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="px-3 py-2 rounded-lg bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

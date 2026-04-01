"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Seccion = "productores" | "cobranza" | "vehiculo" | "ia_campo";
type Productor = {
  empresa_id: string; empresa_nombre: string;
  propietario_nombre: string; propietario_email: string;
  propietario_codigo: string;
  vinculacion_id: string; honorario_tipo: string;
  honorario_monto: number; activa: boolean;
};
type LoteResumen = {
  id: string; nombre: string; hectareas: number;
  cultivo: string; cultivo_completo: string; cultivo_orden: string;
  estado: string; fecha_siembra: string; variedad: string;
  empresa_nombre: string; propietario_nombre: string;
};
type Cobranza = {
  id: string; empresa_id: string; concepto: string;
  monto: number; fecha: string; estado: string;
  metodo_pago: string; observaciones: string;
};
type Vehiculo = {
  id: string; nombre: string; marca: string; modelo: string;
  anio: number; patente: string; seguro_vencimiento: string;
  seguro_compania: string; vtv_vencimiento: string;
  km_actuales: number; proximo_service_km: number; observaciones: string;
};
type ServiceVehiculo = {
  id: string; tipo: string; descripcion: string;
  costo: number; km: number; fecha: string; taller: string;
};
type MensajeIA = { rol: "user" | "assistant"; texto: string };

const CULTIVOS_LISTA = [
  { cultivo:"soja", orden:"1ra", label:"SOJA 1RA", color:"#4ADE80" },
  { cultivo:"soja", orden:"2da", label:"SOJA 2DA", color:"#86EFAC" },
  { cultivo:"maiz", orden:"1ro_temprano", label:"MAIZ 1RO", color:"#C9A227" },
  { cultivo:"maiz", orden:"1ro_tardio", label:"MAIZ 1RO TARDIO", color:"#D97706" },
  { cultivo:"maiz", orden:"2do", label:"MAIZ 2DO", color:"#FCD34D" },
  { cultivo:"trigo", orden:"1ro", label:"TRIGO 1RO", color:"#F59E0B" },
  { cultivo:"girasol", orden:"1ro", label:"GIRASOL 1RO", color:"#FBBF24" },
  { cultivo:"girasol", orden:"2do", label:"GIRASOL 2DO", color:"#FDE68A" },
  { cultivo:"sorgo", orden:"1ro", label:"SORGO 1RO", color:"#F87171" },
  { cultivo:"sorgo", orden:"2do", label:"SORGO 2DO", color:"#FCA5A5" },
  { cultivo:"cebada", orden:"1ra", label:"CEBADA 1RA", color:"#A78BFA" },
  { cultivo:"arveja", orden:"1ra", label:"ARVEJA 1RA", color:"#34D399" },
  { cultivo:"vicia", orden:"cobertura", label:"VICIA COBERTURA", color:"#6EE7B7" },
  { cultivo:"verdeo", orden:"invierno", label:"VERDEO INVIERNO", color:"#60A5FA" },
  { cultivo:"verdeo", orden:"verano", label:"VERDEO VERANO", color:"#93C5FD" },
];
const ESTADOS = [
  {v:"planificado",l:"PLANIFICADO",c:"#6B7280"},
  {v:"sembrado",l:"SEMBRADO",c:"#4ADE80"},
  {v:"en_desarrollo",l:"EN DESARROLLO",c:"#C9A227"},
  {v:"cosechado",l:"COSECHADO",c:"#60A5FA"},
  {v:"barbecho",l:"BARBECHO",c:"#A78BFA"},
];

function getCultivoInfo(cultivo: string, orden: string) {
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { cultivo, orden, label: cultivo?.toUpperCase() || "SIN CULTIVO", color: "#6B7280" };
}

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [ingenieroId, setIngenieroId] = useState<string|null>(null);
  const [ingenieroNombre, setIngenieroNombre] = useState("");
  const [productores, setProductores] = useState<Productor[]>([]);
  const [todosLotes, setTodosLotes] = useState<LoteResumen[]>([]);
  const [productorActivo, setProductorActivo] = useState<Productor|null>(null);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [aiChat, setAiChat] = useState<MensajeIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);

  // Filtros exportación
  const [filterCultivo, setFilterCultivo] = useState("todos");
  const [filterProductor, setFilterProductor] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,nombre,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
    setIngenieroId(u.id); setIngenieroNombre(u.nombre);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (iid: string) => {
    const sb = await getSB();
    // Traer vinculaciones con empresa y propietario
    const { data: vincs } = await sb.from("vinculaciones")
      .select("*, empresas(id,nombre,propietario_id)")
      .eq("ingeniero_id", iid).eq("activa", true);

    const prods: Productor[] = [];
    const lotesTodos: LoteResumen[] = [];

    if (vincs && vincs.length > 0) {
      for (const v of vincs) {
        const emp = (v as any).empresas;
        if (!emp) continue;
        const { data: prop } = await sb.from("usuarios").select("nombre,email,codigo").eq("id", emp.propietario_id).single();
        const prod: Productor = {
          empresa_id: emp.id, empresa_nombre: emp.nombre,
          propietario_nombre: prop?.nombre ?? "—",
          propietario_email: prop?.email ?? "—",
          propietario_codigo: prop?.codigo ?? "—",
          vinculacion_id: v.id,
          honorario_tipo: v.honorario_tipo ?? "mensual",
          honorario_monto: v.honorario_monto ?? 0, activa: v.activa,
        };
        prods.push(prod);
        // Traer lotes de esta empresa
        const { data: lotes } = await sb.from("lotes").select("*").eq("empresa_id", emp.id).eq("es_segundo_cultivo", false);
        (lotes ?? []).forEach((l: any) => {
          lotesTodos.push({
            id: l.id, nombre: l.nombre, hectareas: l.hectareas,
            cultivo: l.cultivo ?? "", cultivo_completo: l.cultivo_completo ?? "",
            cultivo_orden: l.cultivo_orden ?? "", estado: l.estado ?? "planificado",
            fecha_siembra: l.fecha_siembra ?? "", variedad: l.variedad ?? l.hibrido ?? "",
            empresa_nombre: emp.nombre, propietario_nombre: prop?.nombre ?? "—",
          });
        });
      }
    }
    setProductores(prods);
    setTodosLotes(lotesTodos);

    const { data: cobs } = await sb.from("ing_cobranzas").select("*").eq("ingeniero_id", iid).order("fecha", { ascending: false });
    setCobranzas(cobs ?? []);
    const { data: vehs } = await sb.from("ing_vehiculos").select("*").eq("ingeniero_id", iid);
    setVehiculos(vehs ?? []);
    calcularAlertas(vehs ?? [], cobs ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[], cobs: Cobranza[]) => {
    const alerts: {msg:string;urgencia:string}[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const diff = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (diff < 0) alerts.push({ msg: v.nombre + ": Seguro VENCIDO", urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: v.nombre + ": Seguro vence en " + Math.round(diff) + " dias", urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.vtv_vencimiento) {
        const diff = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (diff < 0) alerts.push({ msg: v.nombre + ": VTV VENCIDA", urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: v.nombre + ": VTV vence en " + Math.round(diff) + " dias", urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.proximo_service_km > 0 && v.km_actuales >= v.proximo_service_km - 500)
        alerts.push({ msg: v.nombre + ": Service proximo (" + v.km_actuales + "/" + v.proximo_service_km + " km)", urgencia: "media" });
    });
    cobs.filter(c => c.estado === "pendiente").forEach(c => {
      const diff = (hoy.getTime() - new Date(c.fecha).getTime()) / (1000*60*60*24);
      if (diff > 30) alerts.push({ msg: "Cobro pendiente hace +30 dias: $" + c.monto.toLocaleString("es-AR"), urgencia: "media" });
    });
    setAlertas(alerts);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  // Entrar a ver lotes de un productor
  const entrarProductor = (prod: Productor) => {
    setProductorActivo(prod);
    // Navegar al módulo de lotes del ingeniero con el contexto del productor
    localStorage.setItem("ing_empresa_id", prod.empresa_id);
    localStorage.setItem("ing_empresa_nombre", prod.empresa_nombre);
    window.location.href = "/ingeniero/lotes";
  };

  // Cobranza
  const guardarCobranza = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_cobranzas").insert({
      ingeniero_id: ingenieroId, empresa_id: form.empresa_id ?? null,
      concepto: form.concepto ?? "", monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      estado: form.estado ?? "pendiente", metodo_pago: form.metodo_pago ?? "",
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(ingenieroId); setShowForm(false); setForm({});
  };

  const marcarCobrado = async (id: string) => {
    const sb = await getSB();
    await sb.from("ing_cobranzas").update({ estado: "cobrado" }).eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  // Vehiculo
  const guardarVehiculo = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculos").insert({
      ingeniero_id: ingenieroId, nombre: form.nombre, marca: form.marca ?? "",
      modelo: form.modelo ?? "", año: Number(form.anio ?? 0), patente: form.patente ?? "",
      seguro_vencimiento: form.seguro_vencimiento || null, seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null, km_actuales: Number(form.km_actuales ?? 0),
      proximo_service_km: Number(form.proximo_service_km ?? 0), observaciones: form.observaciones ?? "",
    });
    await fetchAll(ingenieroId); setShowForm(false); setForm({});
  };

  const guardarService = async () => {
    if (!vehiculoSel || !ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculo_service").insert({
      vehiculo_id: vehiculoSel.id, ingeniero_id: ingenieroId,
      tipo: form.tipo_service ?? "service", descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0), km: Number(form.km ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0], taller: form.taller ?? "",
    });
    await fetchServicios(vehiculoSel.id); setShowForm(false); setForm({});
  };

  const fetchServicios = async (vid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id", vid).order("fecha", { ascending: false });
    setServicios(data ?? []);
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  // IA
  const askAI = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim(); setAiInput(""); setAiLoading(true);
    setAiChat(prev => [...prev, { rol:"user", texto:userMsg }]);
    try {
      const hist = aiChat.map(m => ({ role: m.rol==="user"?"user":"assistant", content: m.texto }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          system: "Sos un asistente agronomico experto para ingenieros agronomos en Argentina. Respondé en español, tecnico y practico. Ayuda con dosis, diagnostico de enfermedades y plagas, recomendaciones de cultivo, mercados y normativas SENASA. Ingeniero: " + ingenieroNombre + ". Productores asesorados: " + productores.length + ".",
          messages: [...hist, { role: "user", content: userMsg }]
        })
      });
      const data = await res.json();
      setAiChat(prev => [...prev, { rol:"assistant", texto: data.content?.[0]?.text ?? "Sin respuesta" }]);
    } catch { setAiChat(prev => [...prev, { rol:"assistant", texto:"Error al conectar con IA" }]); }
    setAiLoading(false);
  };

  const startVoice = () => {
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    if (!hasSR) { alert("Usa Chrome"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; setListening(true);
    rec.onresult = (e: any) => { setAiInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  // EXPORTAR EXCEL con filtros
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    let lotesFiltrados = todosLotes;
    if (filterCultivo !== "todos") lotesFiltrados = lotesFiltrados.filter(l => (l.cultivo_completo || l.cultivo) === filterCultivo);
    if (filterProductor !== "todos") lotesFiltrados = lotesFiltrados.filter(l => l.empresa_nombre === filterProductor);
    if (filterEstado !== "todos") lotesFiltrados = lotesFiltrados.filter(l => l.estado === filterEstado);

    const data = lotesFiltrados.map(l => ({
      PRODUCTOR: l.propietario_nombre, EMPRESA: l.empresa_nombre,
      LOTE: l.nombre, HECTAREAS: l.hectareas,
      CULTIVO: l.cultivo_completo || l.cultivo,
      ESTADO: l.estado, FECHA_SIEMBRA: l.fecha_siembra || "",
      VARIEDAD_HIBRIDO: l.variedad || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Array(8).fill({ wch: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lotes");

    const nombreArchivo = "lotes" +
      (filterCultivo !== "todos" ? "_" + filterCultivo.toLowerCase().replace(/ /g,"_") : "") +
      (filterProductor !== "todos" ? "_" + filterProductor.toLowerCase().replace(/ /g,"_") : "") +
      (filterEstado !== "todos" ? "_" + filterEstado : "") +
      "_" + new Date().toISOString().slice(0,10) + ".xlsx";
    XLSX.writeFile(wb, nombreArchivo);
  };

  const iCls = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const totalPendiente = cobranzas.filter(c => c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totalCobrado = cobranzas.filter(c => c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);

  // Stats generales
  const totalHa = todosLotes.reduce((a,l)=>a+l.hectareas,0);
  const cultivosUnicos = [...new Set(todosLotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  const secciones = [
    { key:"productores" as Seccion, label:"MIS PRODUCTORES", icon:"👨‍🌾" },
    { key:"cobranza" as Seccion, label:"COBRANZA", icon:"💰" },
    { key:"vehiculo" as Seccion, label:"MI VEHICULO", icon:"🚗" },
    { key:"ia_campo" as Seccion, label:"IA CAMPO", icon:"🤖" },
  ];

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">Cargando Panel Ingeniero...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-ing:hover{border-color:rgba(0,255,128,0.4)!important;transform:translateY(-2px)}
        .card-ing{transition:all 0.2s ease}
        .sec-active{border-color:#00FF80!important;color:#00FF80!important;background:rgba(0,255,128,0.08)!important}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/90 px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain cursor-pointer" onClick={()=>window.location.href="/ingeniero/dashboard"}/>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold">{ingenieroNombre}</div>
          <div className="text-xs text-[#00FF80] font-mono">INGENIERO AGRONOMO</div>
        </div>
        {alertas.length > 0 && (
          <div className="w-7 h-7 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center">
            <span className="text-[#F87171] text-xs font-bold">{alertas.length}</span>
          </div>
        )}
        <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL INGENIERO AGRONOMO</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTORES · {totalHa.toLocaleString("es-AR")} HA TOTALES · IA AGRONOMICA ACTIVA</p>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse"/><span className="text-[#F87171] text-xs font-mono font-bold">ALERTAS ({alertas.length})</span></div>
            <div className="flex flex-wrap gap-2">
              {alertas.map((a,i)=>(
                <div key={i} className={"px-3 py-1.5 rounded-lg text-xs font-mono border " + (a.urgencia==="alta"?"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5":"border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5")}>
                  {a.urgencia==="alta"?"🔴":"🟡"} {a.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {msgExito && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between " + (msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* TABS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {secciones.map(s=>(
            <button key={s.key} onClick={()=>{setSeccion(s.key);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={"px-5 py-2.5 rounded-xl border text-sm font-mono transition-all font-bold " + (seccion===s.key?"sec-active":"border-[#00FF80]/15 text-[#4B5563] hover:text-[#9CA3AF]")}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ===== MIS PRODUCTORES ===== */}
        {seccion==="productores" && (
          <div>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                {l:"PRODUCTORES",v:String(productores.length),c:"#E5E7EB"},
                {l:"HA TOTALES",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},
                {l:"LOTES",v:String(todosLotes.length),c:"#4ADE80"},
                {l:"CULTIVOS",v:String(cultivosUnicos.length),c:"#60A5FA"},
              ].map(s=>(
                <div key={s.l} className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4 text-center">
                  <div className="text-xs text-[#4B5563] font-mono uppercase">{s.l}</div>
                  <div className="text-xl font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Exportar Excel con filtros */}
            <div className="bg-[#0a1628]/80 border border-[#C9A227]/20 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[#C9A227] font-mono text-sm font-bold">📊 EXPORTAR LOTES A EXCEL</span>
                <span className="text-xs text-[#4B5563] font-mono">— Filtrá y exportá</span>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                {/* Filtro cultivo */}
                <div>
                  <label className={lCls}>CULTIVO</label>
                  <select value={filterCultivo} onChange={e=>setFilterCultivo(e.target.value)} className={iCls + " w-44"}>
                    <option value="todos">Todos los cultivos</option>
                    {cultivosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* Filtro productor */}
                <div>
                  <label className={lCls}>PRODUCTOR</label>
                  <select value={filterProductor} onChange={e=>setFilterProductor(e.target.value)} className={iCls + " w-44"}>
                    <option value="todos">Todos</option>
                    {productores.map(p=><option key={p.empresa_id} value={p.empresa_nombre}>{p.propietario_nombre}</option>)}
                  </select>
                </div>
                {/* Filtro estado */}
                <div>
                  <label className={lCls}>ESTADO</label>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} className={iCls + " w-40"}>
                    <option value="todos">Todos</option>
                    {ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lCls}>LOTES A EXPORTAR</label>
                  <div className="text-sm font-bold font-mono text-[#C9A227] py-2.5">
                    {todosLotes
                      .filter(l=>filterCultivo==="todos"||(l.cultivo_completo||l.cultivo)===filterCultivo)
                      .filter(l=>filterProductor==="todos"||l.empresa_nombre===filterProductor)
                      .filter(l=>filterEstado==="todos"||l.estado===filterEstado).length} lotes · {
                      todosLotes
                      .filter(l=>filterCultivo==="todos"||(l.cultivo_completo||l.cultivo)===filterCultivo)
                      .filter(l=>filterProductor==="todos"||l.empresa_nombre===filterProductor)
                      .filter(l=>filterEstado==="todos"||l.estado===filterEstado)
                      .reduce((a,l)=>a+l.hectareas,0).toLocaleString("es-AR")} ha
                  </div>
                </div>
                <button onClick={exportarExcel} className="px-5 py-2.5 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/20 transition-all">
                  📤 EXPORTAR EXCEL
                </button>
              </div>
              {/* Botones rápidos por cultivo */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#C9A227]/10">
                <span className="text-xs text-[#4B5563] font-mono self-center">RAPIDO:</span>
                <button onClick={()=>{setFilterCultivo("todos");setFilterProductor("todos");setFilterEstado("todos");setTimeout(exportarExcel,100);}} className="px-3 py-1.5 rounded-lg bg-[#E5E7EB]/5 border border-[#E5E7EB]/15 text-[#E5E7EB] text-xs font-mono hover:bg-[#E5E7EB]/10 font-bold">📊 TOTAL GENERAL</button>
                {cultivosUnicos.map(c=>{
                  const info=getCultivoInfo(c.split(" ")[0].toLowerCase(),"");
                  const ha=todosLotes.filter(l=>(l.cultivo_completo||l.cultivo)===c).reduce((a,l)=>a+l.hectareas,0);
                  return(
                    <button key={c} onClick={()=>{setFilterCultivo(c);setFilterProductor("todos");setFilterEstado("todos");setTimeout(exportarExcel,100);}}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold"
                      style={{borderColor:info.color+"40",background:info.color+"10",color:info.color}}>
                      📊 {c} ({ha.toLocaleString()}HA)
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nota: vinculación solo desde admin */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/10 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
              <span className="text-lg">ℹ️</span>
              <p className="text-xs text-[#4B5563] font-mono">La vinculacion ing-productor la realiza el administrador del sistema. Vos ves automaticamente los productores que te asignaron.</p>
            </div>

            {/* Lista productores */}
            {productores.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">👨‍🌾</div>
                <p className="text-[#4B5563] font-mono text-sm">Sin productores asignados</p>
                <p className="text-[#4B5563] font-mono text-xs mt-1">El administrador te asignara productores desde el panel admin</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {productores.map(p=>{
                  const lotesP = todosLotes.filter(l=>l.empresa_nombre===p.empresa_nombre);
                  const haP = lotesP.reduce((a,l)=>a+l.hectareas,0);
                  const cultivosP = [...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                  return(
                    <div key={p.empresa_id} className="card-ing bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                      <div className="p-5 cursor-pointer" onClick={()=>entrarProductor(p)}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#00FF80]/10 border border-[#00FF80]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono uppercase">{p.propietario_nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{p.empresa_nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">Codigo: {p.propietario_codigo}</div>
                            </div>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse"/>
                        </div>
                        {/* Stats del productor */}
                        <div className="grid grid-cols-3 gap-2 mb-3 text-xs font-mono">
                          <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                            <div className="text-[#4B5563]">LOTES</div>
                            <div className="font-bold text-[#E5E7EB] mt-0.5">{lotesP.length}</div>
                          </div>
                          <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                            <div className="text-[#4B5563]">HA</div>
                            <div className="font-bold text-[#C9A227] mt-0.5">{haP.toLocaleString("es-AR")}</div>
                          </div>
                          <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                            <div className="text-[#4B5563]">CULTIVOS</div>
                            <div className="font-bold text-[#4ADE80] mt-0.5">{cultivosP.length}</div>
                          </div>
                        </div>
                        {/* Cultivos del productor */}
                        {cultivosP.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {cultivosP.slice(0,4).map(c=>{
                              const info=getCultivoInfo(c.split(" ")[0].toLowerCase(),"");
                              return <span key={c} className="text-xs px-2 py-0.5 rounded font-mono font-bold" style={{background:info.color+"15",color:info.color}}>{c}</span>;
                            })}
                            {cultivosP.length > 4 && <span className="text-xs text-[#4B5563] font-mono">+{cultivosP.length-4}</span>}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-[#4B5563] font-mono">Honorario</div>
                            <div className="text-sm font-bold font-mono text-[#C9A227]">${p.honorario_monto.toLocaleString("es-AR")} / {p.honorario_tipo.replace("_"," ")}</div>
                          </div>
                          <div className="text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-3 py-1.5 rounded-lg hover:bg-[#00FF80]/10 transition-colors font-bold">
                            VER LOTES →
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-[#00FF80]/10 px-5 py-2 flex items-center justify-between">
                        <span className="text-xs text-[#4B5563] font-mono">{p.propietario_email}</span>
                        <button onClick={()=>{setFilterProductor(p.empresa_nombre);setSeccion("productores");}} className="text-xs text-[#4B5563] hover:text-[#C9A227] font-mono">📊 Exportar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tabla resumen lotes */}
            {todosLotes.length > 0 && (
              <div className="mt-6 bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                  <span className="font-bold text-[#E5E7EB] font-mono text-sm">RESUMEN DE LOTES — TODOS LOS PRODUCTORES</span>
                  <span className="text-xs text-[#4B5563] font-mono">{todosLotes.length} lotes · {totalHa.toLocaleString("es-AR")} ha</span>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#0a1628]"><tr className="border-b border-[#C9A227]/10">{["PRODUCTOR","LOTE","HA","CULTIVO","ESTADO","SIEMBRA","VARIEDAD"].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {todosLotes
                        .filter(l=>filterCultivo==="todos"||(l.cultivo_completo||l.cultivo)===filterCultivo)
                        .filter(l=>filterProductor==="todos"||l.empresa_nombre===filterProductor)
                        .filter(l=>filterEstado==="todos"||l.estado===filterEstado)
                        .map(l=>{
                          const ci=getCultivoInfo(l.cultivo||"",l.cultivo_orden||"");
                          const est=ESTADOS.find(e=>e.v===l.estado);
                          return(
                            <tr key={l.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] font-mono">{l.propietario_nombre}</td>
                              <td className="px-4 py-2.5 font-bold text-[#E5E7EB] font-mono text-sm">{l.nombre}</td>
                              <td className="px-4 py-2.5 text-sm text-[#C9A227] font-mono font-bold">{l.hectareas}</td>
                              <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded font-mono font-bold" style={{background:ci.color+"15",color:ci.color}}>{ci.label||"—"}</span></td>
                              <td className="px-4 py-2.5">{est&&<span className="text-xs px-2 py-0.5 rounded font-mono font-bold" style={{background:est.c+"15",color:est.c}}>{est.l}</span>}</td>
                              <td className="px-4 py-2.5 text-xs text-[#6B7280] font-mono">{l.fecha_siembra||"—"}</td>
                              <td className="px-4 py-2.5 text-xs text-[#6B7280] font-mono">{l.variedad||"—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== COBRANZA ===== */}
        {seccion==="cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha:new Date().toISOString().split("T")[0]});}}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm font-bold">
                + Nuevo Cobro
              </button>
            </div>
            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Productor</label>
                    <select value={form.empresa_id??""} onChange={e=>setForm({...form,empresa_id:e.target.value})} className={iCls}>
                      <option value="">Sin productor</option>
                      {productores.map(p=><option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Estado</label>
                    <select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      <option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Metodo</label>
                    <select value={form.metodo_pago??""} onChange={e=>setForm({...form,metodo_pago:e.target.value})} className={iCls}>
                      <option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {/* Cards por productor */}
            {productores.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {productores.map(p=>{
                  const cobsProd = cobranzas.filter(c=>c.empresa_id===p.empresa_id);
                  const pendProd = cobsProd.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
                  return(
                    <div key={p.empresa_id} className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl p-4">
                      <div className="font-bold text-[#E5E7EB] font-mono text-sm mb-2">{p.propietario_nombre}</div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-[#4B5563]">Honorario</span>
                        <span className="text-[#C9A227] font-bold">${p.honorario_monto.toLocaleString("es-AR")}/{p.honorario_tipo.replace("_"," ")}</span>
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
              {cobranzas.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin cobros registrados</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["Fecha","Productor","Concepto","Monto","Estado","Metodo",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono uppercase">{h}</th>)}</tr></thead>
                  <tbody>{cobranzas.map(c=>{
                    const prod=productores.find(p=>p.empresa_id===c.empresa_id);
                    return(
                      <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                        <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre??"—"}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                        <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded font-mono " + (c.estado==="cobrado"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{c.estado}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago||"—"}</td>
                        <td className="px-4 py-3 flex items-center gap-2">
                          {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-xs text-[#4ADE80] font-mono hover:underline">✓ Cobrar</button>}
                          <button onClick={()=>eliminar("ing_cobranzas",c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VEHICULO ===== */}
        {seccion==="vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHICULO</h2>
              {!vehiculoSel?(
                <button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm font-bold">+ Agregar Vehiculo</button>
              ):(
                <div className="flex gap-3">
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm font-bold">+ Service</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] font-mono text-sm">← Volver</button>
                </div>
              )}
            </div>
            {showForm && !vehiculoSel && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVO VEHICULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Toyota Hilux"/></div>
                  <div><label className={lCls}>Marca</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Modelo</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Año</label><input type="number" value={form.anio??""} onChange={e=>setForm({...form,anio:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Patente</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Venc. Seguro</label><input type="date" value={form.seguro_vencimiento??""} onChange={e=>setForm({...form,seguro_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Compania Seguro</label><input type="text" value={form.seguro_compania??""} onChange={e=>setForm({...form,seguro_compania:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento??""} onChange={e=>setForm({...form,vtv_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Km actuales</label><input type="number" value={form.km_actuales??""} onChange={e=>setForm({...form,km_actuales:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Prox. service km</label><input type="number" value={form.proximo_service_km??""} onChange={e=>setForm({...form,proximo_service_km:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-[#4B5563] font-mono">Sin vehiculos registrados</p></div>:(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v=>{
                    const segVenc=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();
                    const vtvVenc=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();
                    return(
                      <div key={v.id} className="card-ing bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 cursor-pointer" onClick={()=>{setVehiculoSel(v);fetchServicios(v.id);}}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🚗</span>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div>
                            </div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminar("ing_vehiculos",v.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">Km</div><div className="text-lg font-bold font-mono text-[#00FF80]">{(v.km_actuales||0).toLocaleString()} km</div></div>
                          <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">Prox. service</div><div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className={"text-xs px-2 py-1 rounded font-mono " + (segVenc?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>🛡️ {segVenc?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                          <span className={"text-xs px-2 py-1 rounded font-mono " + (vtvVenc?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>📋 VTV {vtvVenc?"VENCIDA":v.vtv_vencimiento||"—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ):(
              <div>
                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-4 mb-4"><span className="text-4xl">🚗</span><div><div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.anio} · {vehiculoSel.patente}</div></div></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[{l:"Km",v:(vehiculoSel.km_actuales||0).toLocaleString()+" km",c:"#00FF80"},{l:"Prox. service",v:vehiculoSel.proximo_service_km?(vehiculoSel.proximo_service_km.toLocaleString()+" km"):"—",c:"#C9A227"},{l:"Seguro",v:vehiculoSel.seguro_vencimiento||"—",c:vehiculoSel.seguro_vencimiento&&new Date(vehiculoSel.seguro_vencimiento)<new Date()?"#F87171":"#4ADE80"},{l:"VTV",v:vehiculoSel.vtv_vencimiento||"—",c:vehiculoSel.vtv_vencimiento&&new Date(vehiculoSel.vtv_vencimiento)<new Date()?"#F87171":"#4ADE80"}].map(d=>(
                      <div key={d.l} className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">{d.l}</div><div className="text-sm font-bold font-mono mt-1" style={{color:d.c}}>{d.v}</div></div>
                    ))}
                  </div>
                </div>
                {showForm && vehiculoSel && (
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE / REPARACION</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={lCls}>Tipo</label><select value={form.tipo_service??"service"} onChange={e=>setForm({...form,tipo_service:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparacion</option><option value="preventivo">Preventivo</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>Descripcion</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} placeholder="Cambio aceite"/></div>
                      <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Km</label><input type="number" value={form.km??""} onChange={e=>setForm({...form,km:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Costo</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ Guardar</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#00FF80]/10"><span className="text-[#00FF80] text-sm font-mono font-bold">🔧 HISTORIAL</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin historial</div>:(
                    <table className="w-full">
                      <thead><tr className="border-b border-[#00FF80]/10">{["Fecha","Tipo","Descripcion","Taller","Km","Costo",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=>(
                        <tr key={s.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.taller}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km?(s.km.toLocaleString()+" km"):"—"}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><button onClick={()=>eliminar("ing_vehiculo_service",s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== IA CAMPO ===== */}
        {seccion==="ia_campo" && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🤖 IA CAMPO — ASISTENTE AGRONOMICO</h2>
              <p className="text-xs text-[#4B5563] font-mono mt-1">Consulta sobre dosis, plagas, enfermedades, cultivos y mercados</p>
            </div>
            {aiChat.length===0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                {["Dosis de glifosato para soja en post-emergencia","Como identificar roya asiatica en soja","Fungicida para manchas foliares en maiz","Recomendaciones para siembra de trigo pampeana","Cuando aplicar insecticida en soja segun MIP","Precio estimado soja en mercado actual"].map(q=>(
                  <button key={q} onClick={()=>setAiInput(q)} className="text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-4 py-3 rounded-xl font-mono transition-all bg-[#0a1628]/60">
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse"/><span className="text-[#00FF80] text-xs font-mono">◆ IA AGRONOMICA ACTIVA</span></div>
                {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">Limpiar</button>}
              </div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {aiChat.length===0&&<div className="text-center py-10 text-[#4B5563] font-mono text-sm"><div className="text-4xl mb-3 opacity-30">🌾</div>Hace tu consulta agronomica...</div>}
                {aiChat.map((m,i)=>(
                  <div key={i} className={"flex " + (m.rol==="user"?"justify-end":"justify-start")}>
                    <div className={"max-w-[80%] px-4 py-3 rounded-xl text-sm font-mono " + (m.rol==="user"?"bg-[#00FF80]/10 border border-[#00FF80]/20 text-[#E5E7EB]":"bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF]")}>
                      {m.rol==="assistant"&&<div className="text-[#00FF80] text-xs mb-2">◆ IA AGRONOMICA</div>}
                      <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoading&&<div className="flex justify-start"><div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-xl"><p className="text-[#00FF80] text-xs font-mono animate-pulse">▶ Analizando consulta...</p></div></div>}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={startVoice} className={"flex items-center gap-2 px-4 py-3 rounded-xl border font-mono text-sm flex-shrink-0 " + (listening?"border-red-400 text-red-400 animate-pulse":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10")}>🎤 {listening?"...":"Voz"}</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta sobre dosis, plagas, enfermedades, precios..." className="flex-1 bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono"/>
              <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} className="px-6 py-3 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm disabled:opacity-40 flex-shrink-0 font-bold">▶ Enviar</button>
            </div>
          </div>
        )}
      </div>
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono">AGROGESTION PRO · PANEL INGENIERO AGRONOMO</p>
    </div>
  );
}

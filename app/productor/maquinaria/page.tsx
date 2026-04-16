"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Maquina = {
  id: string; nombre: string; tipo: string; marca: string; modelo: string;
  año: number; estado: string; horas_uso: number; proximo_service: number;
  seguro_vencimiento: string; seguro_compania: string; vtv_vencimiento: string;
  patente: string; valor_compra: number; observaciones: string;
};
type Reparacion = {
  id: string; tipo: string; descripcion: string; costo: number;
  taller: string; fecha: string; horas_en_reparacion: number;
};
type Alerta = { tipo: string; mensaje: string; urgencia: "alta"|"media"|"baja"; maquina: string; };

const TIPOS = ["tractor","cosechadora","pulverizadora","sembradora","implemento","vehiculo","otro"];
const TIPO_ICONS: Record<string,string> = {
  tractor:"🚜", cosechadora:"🌾", pulverizadora:"💧", sembradora:"🌱",
  implemento:"🔧", vehiculo:"🚗", otro:"⚙️"
};
const ESTADO_COLORS: Record<string,string> = {
  activo:"#16a34a", taller:"#dc2626", baja:"#6b8aaa"
};

export default function MaquinariaPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [seleccionada, setSeleccionada] = useState<Maquina|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFormRep, setShowFormRep] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<string>("todos");

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
    await fetchMaquinas(emp.id);
    setLoading(false);
  };

  const fetchMaquinas = async (eid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria").select("*").eq("empresa_id", eid).order("nombre");
    setMaquinas(data ?? []);
    calcularAlertas(data ?? []);
  };

  const fetchReparaciones = async (mid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria_reparaciones").select("*").eq("maquina_id", mid).order("fecha", { ascending: false });
    setReparaciones(data ?? []);
  };

  const calcularAlertas = (lista: Maquina[]) => {
    const hoy = new Date();
    const alerts: Alerta[] = [];
    lista.forEach(m => {
      if (m.seguro_vencimiento) {
        const d = new Date(m.seguro_vencimiento);
        const diff = (d.getTime() - hoy.getTime()) / (1000*60*60*24);
        if (diff < 0) alerts.push({ tipo:"seguro", mensaje:"Seguro VENCIDO", urgencia:"alta", maquina:m.nombre });
        else if (diff <= 30) alerts.push({ tipo:"seguro", mensaje:`Seguro vence en ${Math.round(diff)} días`, urgencia:diff<=7?"alta":"media", maquina:m.nombre });
      }
      if (m.vtv_vencimiento) {
        const d = new Date(m.vtv_vencimiento);
        const diff = (d.getTime() - hoy.getTime()) / (1000*60*60*24);
        if (diff < 0) alerts.push({ tipo:"vtv", mensaje:"VTV VENCIDA", urgencia:"alta", maquina:m.nombre });
        else if (diff <= 30) alerts.push({ tipo:"vtv", mensaje:`VTV vence en ${Math.round(diff)} días`, urgencia:diff<=7?"alta":"media", maquina:m.nombre });
      }
      if (m.proximo_service > 0 && m.horas_uso > 0) {
        const restantes = m.proximo_service - m.horas_uso;
        if (restantes <= 0) alerts.push({ tipo:"service", mensaje:"Service VENCIDO por horas", urgencia:"alta", maquina:m.nombre });
        else if (restantes <= 50) alerts.push({ tipo:"service", mensaje:`Service en ${Math.round(restantes)} hs`, urgencia:restantes<=20?"alta":"media", maquina:m.nombre });
      }
      if (m.estado === "taller") alerts.push({ tipo:"taller", mensaje:"En taller", urgencia:"media", maquina:m.nombre });
    });
    setAlertas(alerts);
  };

  const guardarMaquina = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const data = {
      empresa_id: empresaId,
      nombre: form.nombre, tipo: form.tipo ?? "tractor",
      marca: form.marca ?? "", modelo: form.modelo ?? "",
      año: Number(form.año ?? 0), estado: form.estado ?? "activo",
      horas_uso: Number(form.horas_uso ?? 0),
      proximo_service: Number(form.proximo_service ?? 0),
      seguro_vencimiento: form.seguro_vencimiento || null,
      seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null,
      patente: form.patente ?? "",
      valor_compra: Number(form.valor_compra ?? 0),
      observaciones: form.observaciones ?? "",
    };
    if (seleccionada && showForm) {
      await sb.from("maquinaria").update(data).eq("id", seleccionada.id);
    } else {
      await sb.from("maquinaria").insert(data);
    }
    await fetchMaquinas(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarReparacion = async () => {
    if (!seleccionada || !empresaId) return;
    const sb = await getSB();
    await sb.from("maquinaria_reparaciones").insert({
      maquina_id: seleccionada.id, empresa_id: empresaId,
      tipo: form.tipo_rep ?? "reparacion",
      descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0),
      taller: form.taller ?? "",
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      horas_en_reparacion: Number(form.horas_en_reparacion ?? 0),
    });
    await fetchReparaciones(seleccionada.id);
    setShowFormRep(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (tabla === "maquinaria") {
      if (empresaId) await fetchMaquinas(empresaId);
      setSeleccionada(null);
    } else {
      if (seleccionada) await fetchReparaciones(seleccionada.id);
    }
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un experto en gestión de maquinaria agrícola para AgroGestión Pro. Respondé en español, de forma práctica. Parque de máquinas: ${maquinas.map(m => `${m.nombre} (${m.tipo}, ${m.horas_uso}hs, estado: ${m.estado})`).join(", ")}. Alertas activas: ${alertas.length}. ${prompt}` }]
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
      askAI(`El usuario dijo por voz: "${text}". Interpretá qué quiere registrar o consultar sobre maquinaria y respondé apropiadamente.`);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  // ── Estilos nuevos ──
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const maquinasFiltradas = maquinas.filter(m => filterEstado === "todos" ? true : m.estado === filterEstado);
  const costoTotal = reparaciones.reduce((a, r) => a + (r.costo ?? 0), 0);

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando Maquinaria...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}

        .topbar-m{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-m::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-m>*{position:relative;z-index:1;}

        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}

        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}

        .maq-card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:18px;box-shadow:0 4px 16px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;position:relative;overflow:hidden;}
        .maq-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .maq-card>*{position:relative;}
        .maq-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(20,80,160,0.18);}

        .kpi-m{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:14px;padding:14px;text-align:center;transition:all 0.18s;}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        .tab-m{padding:7px 14px;border-radius:11px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;border:1.5px solid rgba(255,255,255,0.88);background:rgba(255,255,255,0.65);color:#4a6a8a;}
        .tab-m.on{background-image:url('/AZUL.png');background-size:cover;background-position:center;color:white;border:1.5px solid rgba(100,180,255,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);}

        .row-m:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-m" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>seleccionada?setSeleccionada(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {seleccionada?"Volver":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>⚙️ Maquinaria</div>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="Logo" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* ══════════════════════════════
            DETALLE MÁQUINA
        ══════════════════════════════ */}
        {seleccionada?(
          <div className="fade-in">
            {/* Header */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <span style={{fontSize:44}}>{TIPO_ICONS[seleccionada.tipo]??"⚙️"}</span>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{seleccionada.nombre}</h1>
                  <p style={{fontSize:11,color:"#1565c0",fontWeight:600,margin:"3px 0"}}>
                    {seleccionada.marca} {seleccionada.modelo} · {seleccionada.año} · {seleccionada.patente}
                  </p>
                  <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,border:`1px solid ${ESTADO_COLORS[seleccionada.estado]}`,background:`${ESTADO_COLORS[seleccionada.estado]}15`,color:ESTADO_COLORS[seleccionada.estado],display:"inline-block"}}>
                    {seleccionada.estado.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button onClick={startVoice}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,border:listening?"1.5px solid #dc2626":"1.5px solid rgba(25,118,210,0.35)",background:listening?"rgba(220,38,38,0.10)":"rgba(25,118,210,0.08)",color:listening?"#dc2626":"#1565c0",fontSize:12,fontWeight:700,cursor:"pointer",animation:listening?"pulse 1s infinite":"none"}}>
                  🎤 {listening?"Escuchando...":"Voz"}
                </button>
                <button onClick={()=>{setShowFormRep(true);setForm({});}} className="bbtn" style={{fontSize:11}}>+ Reparación / Service</button>
                <button onClick={()=>{setShowForm(true);setForm(Object.fromEntries(Object.entries(seleccionada).map(([k,v])=>[k,String(v??")])));}} className="abtn" style={{fontSize:11}}>✏️ Editar</button>
                <button onClick={()=>eliminar("maquinaria",seleccionada.id)} style={{padding:"7px 12px",borderRadius:10,border:"1px solid rgba(220,38,38,0.25)",background:"rgba(220,38,38,0.08)",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>🗑️ Eliminar</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:14}}>
              {[
                {label:"Horas de uso",value:`${seleccionada.horas_uso} hs`,color:"#16a34a"},
                {label:"Próximo service",value:seleccionada.proximo_service?`${seleccionada.proximo_service} hs`:"—",color:"#d97706"},
                {label:"Seguro",value:seleccionada.seguro_vencimiento||"—",color:seleccionada.seguro_vencimiento&&new Date(seleccionada.seguro_vencimiento)<new Date()?"#dc2626":"#16a34a"},
                {label:"VTV",value:seleccionada.vtv_vencimiento||"—",color:seleccionada.vtv_vencimiento&&new Date(seleccionada.vtv_vencimiento)<new Date()?"#dc2626":"#16a34a"},
                {label:"Valor de compra",value:seleccionada.valor_compra?`$${Number(seleccionada.valor_compra).toLocaleString("es-AR")}`:"—",color:"#1565c0"},
                {label:"Costo reparaciones",value:`$${costoTotal.toLocaleString("es-AR")}`,color:"#dc2626"},
                {label:"Compañía seguro",value:seleccionada.seguro_compania||"—",color:"#6b8aaa"},
                {label:"Observaciones",value:seleccionada.observaciones||"—",color:"#6b8aaa"},
              ].map(d=>(
                <div key={d.label} className="kpi-m">
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{d.label}</div>
                  <div style={{fontSize:12,fontWeight:800,color:d.color}}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* Panel IA */}
            <div className="sec-w fade-in" style={{padding:14,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a"}}/>
                <span style={{fontSize:11,fontWeight:800,color:"#0d2137"}}>Asistente IA — Maquinaria</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:aiMsg||aiLoading?10:0}}>
                {[
                  `¿Cuándo debería hacerle el próximo service a ${seleccionada.nombre}?`,
                  "¿Cuál es el costo operativo estimado por hora?",
                  "¿Qué mantenimiento preventivo recomendás?",
                ].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} style={{fontSize:11,color:"#4a6a8a",padding:"5px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
              {aiLoading&&<p style={{fontSize:12,color:"#1565c0",fontWeight:700}}>▶ Analizando...</p>}
              {aiMsg&&<div style={{padding:"10px 12px",borderRadius:10,background:"rgba(25,118,210,0.06)",border:"1px solid rgba(25,118,210,0.18)"}}><p style={{fontSize:12,color:"#0d2137",lineHeight:1.6,margin:0}}>{aiMsg}</p></div>}
            </div>

            {/* Form editar */}
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>✏️ Editar — {seleccionada.nombre}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo??"tractor"} onChange={e=>setForm({...form,tipo:e.target.value})} className="sel">{TIPOS.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
                  <div><label className={lCls}>Marca</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Modelo</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Año</label><input type="number" value={form.año??""} onChange={e=>setForm({...form,año:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"activo"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel"><option value="activo">Activo</option><option value="taller">En Taller</option><option value="baja">Baja</option></select></div>
                  <div><label className={lCls}>Horas de uso</label><input type="number" value={form.horas_uso??""} onChange={e=>setForm({...form,horas_uso:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Próximo service (hs)</label><input type="number" value={form.proximo_service??""} onChange={e=>setForm({...form,proximo_service:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Venc. seguro</label><input type="date" value={form.seguro_vencimiento??""} onChange={e=>setForm({...form,seguro_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Compañía seguro</label><input type="text" value={form.seguro_compania??""} onChange={e=>setForm({...form,seguro_compania:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento??""} onChange={e=>setForm({...form,vtv_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Patente</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Valor de compra</label><input type="number" value={form.valor_compra??""} onChange={e=>setForm({...form,valor_compra:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMaquina} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form reparación */}
            {showFormRep&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>+ Registrar Reparación / Service</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_rep??"reparacion"} onChange={e=>setForm({...form,tipo_rep:e.target.value})} className="sel"><option value="service">Service</option><option value="reparacion">Reparación</option><option value="preventivo">Mantenimiento preventivo</option><option value="accidente">Accidente</option></select></div>
                  <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Cambio de aceite y filtros"/></div>
                  <div><label className={lCls}>Taller / Proveedor</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Nombre del taller"/></div>
                  <div><label className={lCls}>Costo</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Horas en reparación</label><input type="number" value={form.horas_en_reparacion??""} onChange={e=>setForm({...form,horas_en_reparacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarReparacion} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>setShowFormRep(false)} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Historial reparaciones */}
            <div className="sec-w">
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>🔧 Historial de Reparaciones</span>
                <span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>Total: ${costoTotal.toLocaleString("es-AR")}</span>
              </div>
              {reparaciones.length===0
                ?<div style={{textAlign:"center",padding:40,color:"#6b8aaa",fontSize:13}}>Sin reparaciones registradas</div>
                :<div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Descripción","Taller","Horas","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{reparaciones.map(r=>(
                      <tr key={r.id} className="row-m" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{r.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.10)",color:"#d97706"}}>{r.tipo}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{r.descripcion}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.taller}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.horas_en_reparacion} hs</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#dc2626"}}>${Number(r.costo).toLocaleString("es-AR")}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("maquinaria_reparaciones",r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              }
            </div>
          </div>

        ):(
          /* ══════════════════════════════
              LISTA MÁQUINAS
          ══════════════════════════════ */
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>⚙️ Maquinaria</h1>
                <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>Gestión de equipos y flota</p>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={startVoice}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,border:listening?"1.5px solid #dc2626":"1.5px solid rgba(25,118,210,0.35)",background:listening?"rgba(220,38,38,0.10)":"rgba(25,118,210,0.08)",color:listening?"#dc2626":"#1565c0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  🎤 {listening?"Escuchando...":"Consultar por Voz"}
                </button>
                <button onClick={()=>{setShowForm(true);setForm({});setSeleccionada(null);}} className="bbtn">+ Nueva Máquina</button>
              </div>
            </div>

            {/* Alertas */}
            {alertas.length>0&&(
              <div style={{padding:"12px 14px",marginBottom:14,borderRadius:14,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.22)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#dc2626"}}/>
                  <span style={{fontSize:11,fontWeight:800,color:"#dc2626"}}>⚠️ Alertas de Maquinaria ({alertas.length})</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
                  {alertas.map((a,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,border:`1px solid ${a.urgencia==="alta"?"rgba(220,38,38,0.25)":"rgba(217,119,6,0.25)"}`,background:a.urgencia==="alta"?"rgba(220,38,38,0.06)":"rgba(217,119,6,0.06)"}}>
                      <span style={{fontSize:14}}>{a.urgencia==="alta"?"🔴":"🟡"}</span>
                      <div>
                        <div style={{fontSize:11,fontWeight:800,color:a.urgencia==="alta"?"#dc2626":"#d97706"}}>{a.maquina}</div>
                        <div style={{fontSize:10,color:"#6b8aaa"}}>{a.mensaje}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {label:"Total Equipos",value:maquinas.length,color:"#0d2137"},
                {label:"Activos",value:maquinas.filter(m=>m.estado==="activo").length,color:"#16a34a"},
                {label:"En Taller",value:maquinas.filter(m=>m.estado==="taller").length,color:"#dc2626"},
                {label:"Alertas",value:alertas.length,color:alertas.length>0?"#dc2626":"#16a34a"},
              ].map(s=>(
                <div key={s.label} className="kpi-m">
                  <div style={{fontSize:24,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginTop:3}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Panel IA */}
            <div className="sec-w" style={{padding:14,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a"}}/>
                <span style={{fontSize:11,fontWeight:800,color:"#0d2137"}}>Asistente IA — Flota</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:aiMsg||aiLoading?10:0}}>
                {["Estado general de la flota","¿Qué equipos necesitan atención urgente?","Plan de mantenimiento preventivo","Costos operativos del mes"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} style={{fontSize:11,color:"#4a6a8a",padding:"5px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
              {aiLoading&&<p style={{fontSize:12,color:"#1565c0",fontWeight:700}}>▶ Analizando flota...</p>}
              {aiMsg&&<div style={{padding:"10px 12px",borderRadius:10,background:"rgba(25,118,210,0.06)",border:"1px solid rgba(25,118,210,0.18)"}}><p style={{fontSize:12,color:"#0d2137",lineHeight:1.6,margin:0}}>{aiMsg}</p></div>}
            </div>

            {/* Filtros */}
            <div style={{display:"flex",gap:7,marginBottom:12}}>
              {["todos","activo","taller","baja"].map(f=>(
                <button key={f} onClick={()=>setFilterEstado(f)} className={`tab-m${filterEstado===f?" on":""}`}>{f.toUpperCase()}</button>
              ))}
            </div>

            {/* Form nueva máquina */}
            {showForm&&!seleccionada&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Nueva Máquina / Vehículo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="John Deere 6110J"/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo??"tractor"} onChange={e=>setForm({...form,tipo:e.target.value})} className="sel">{TIPOS.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
                  <div><label className={lCls}>Marca</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="John Deere"/></div>
                  <div><label className={lCls}>Modelo</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="6110J"/></div>
                  <div><label className={lCls}>Año</label><input type="number" value={form.año??""} onChange={e=>setForm({...form,año:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="2020"/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"activo"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel"><option value="activo">Activo</option><option value="taller">En Taller</option><option value="baja">Baja</option></select></div>
                  <div><label className={lCls}>Horas de uso</label><input type="number" value={form.horas_uso??""} onChange={e=>setForm({...form,horas_uso:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Próximo service (hs)</label><input type="number" value={form.proximo_service??""} onChange={e=>setForm({...form,proximo_service:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="500"/></div>
                  <div><label className={lCls}>Venc. seguro</label><input type="date" value={form.seguro_vencimiento??""} onChange={e=>setForm({...form,seguro_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Compañía seguro</label><input type="text" value={form.seguro_compania??""} onChange={e=>setForm({...form,seguro_compania:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Federación Patronal"/></div>
                  <div><label className={lCls}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento??""} onChange={e=>setForm({...form,vtv_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Patente</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="AB123CD"/></div>
                  <div><label className={lCls}>Valor de compra</label><input type="number" value={form.valor_compra??""} onChange={e=>setForm({...form,valor_compra:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Notas adicionales"/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMaquina} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Grid máquinas */}
            {maquinasFiltradas.length===0?(
              <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>⚙️</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>No hay equipos registrados</p>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                {maquinasFiltradas.map(m=>{
                  const alertasMaq=alertas.filter(a=>a.maquina===m.nombre);
                  return(
                    <div key={m.id} className="maq-card" onClick={()=>{setSeleccionada(m);fetchReparaciones(m.id);}}>
                      <div style={{padding:"14px 14px 12px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:30}}>{TIPO_ICONS[m.tipo]??"⚙️"}</span>
                            <div>
                              <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{m.nombre}</div>
                              <div style={{fontSize:11,color:"#6b8aaa"}}>{m.marca} {m.modelo} · {m.año}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                            <span style={{fontSize:10,padding:"2px 10px",borderRadius:20,fontWeight:700,border:`1px solid ${ESTADO_COLORS[m.estado]}`,background:`${ESTADO_COLORS[m.estado]}15`,color:ESTADO_COLORS[m.estado]}}>{m.estado}</span>
                            {alertasMaq.length>0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626"}}>⚠️ {alertasMaq.length} alerta{alertasMaq.length>1?"s":""}</span>}
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div style={{padding:"8px 10px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Horas</div>
                            <div style={{fontSize:16,fontWeight:800,color:"#16a34a",marginTop:2}}>{m.horas_uso} hs</div>
                          </div>
                          <div style={{padding:"8px 10px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Próx. service</div>
                            <div style={{fontSize:16,fontWeight:800,color:"#d97706",marginTop:2}}>{m.proximo_service?`${m.proximo_service} hs`:"—"}</div>
                          </div>
                        </div>
                        {m.patente&&<div style={{fontSize:11,color:"#6b8aaa",marginTop:8,fontWeight:600}}>🔖 {m.patente}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:16,paddingTop:4}}>© AgroGestión PRO · Maquinaria</p>
    </div>
  );
}

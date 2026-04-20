"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";

type Lote = {
  id: string; nombre: string; hectareas: number;
  tipo_tenencia: string; partido: string; provincia: string;
  cultivo: string; cultivo_orden: string; cultivo_completo: string;
  campana_id: string; fecha_siembra: string; fecha_cosecha: string;
  variedad: string; hibrido: string; rendimiento_esperado: number;
  rendimiento_real: number; estado: string; es_segundo_cultivo: boolean;
};
type Labor = {
  id: string; lote_id: string; fecha: string; tipo: string;
  descripcion: string; producto_dosis?: string;
  hectareas_trabajadas?: number; tipo_aplicacion?: string;
  precio_aplicacion_ha?: number; costo_total_usd?: number;
  comentario?: string; operario?: string; superficie_ha?: number;
  costo_aplicacion_ha?: number; costo_total?: number;
};

const CULTIVOS_LISTA = [
  { cultivo:"soja",    orden:"1ra",          label:"Soja 1º",         color:"#22c55e", icon:"🌱" },
  { cultivo:"soja",    orden:"2da",          label:"Soja 2º",         color:"#86efac", icon:"🌿" },
  { cultivo:"maiz",    orden:"1ro_temprano", label:"Maíz 1º",         color:"#eab308", icon:"🌽" },
  { cultivo:"maiz",    orden:"1ro_tardio",   label:"Maíz 1º Tardío",  color:"#d97706", icon:"🌽" },
  { cultivo:"maiz",    orden:"2do",          label:"Maíz 2º",         color:"#fde047", icon:"🌽" },
  { cultivo:"trigo",   orden:"1ro",          label:"Trigo",           color:"#f59e0b", icon:"🌾" },
  { cultivo:"girasol", orden:"1ro",          label:"Girasol",         color:"#f97316", icon:"🌻" },
  { cultivo:"sorgo",   orden:"1ro",          label:"Sorgo 1º",        color:"#ef4444", icon:"🌿" },
  { cultivo:"sorgo",   orden:"2do",          label:"Sorgo 2º",        color:"#fca5a5", icon:"🌿" },
  { cultivo:"cebada",  orden:"1ra",          label:"Cebada",          color:"#8b5cf6", icon:"🍃" },
  { cultivo:"arveja",  orden:"1ra",          label:"Arveja",          color:"#06b6d4", icon:"🫛" },
  { cultivo:"pastura", orden:"libre",        label:"Pastura",         color:"#10b981", icon:"🌾" },
  { cultivo:"otros",   orden:"libre",        label:"Otros",           color:"#6b7280", icon:"🌱" },
];

const TIPOS_LABOR = ["Siembra","Aplicación","Fertilización","Cosecha","Labranza","Riego","Control malezas","Recorrida","Otro"];
const APLICADORES = ["Propio","Alquilado","Avión","Drone","—"];
const ESTADOS = [
  {v:"planificado",   l:"Planificado",   c:"#6b7280"},
  {v:"sembrado",      l:"Sembrado",      c:"#22c55e"},
  {v:"en_desarrollo", l:"En Desarrollo", c:"#eab308"},
  {v:"cosechado",     l:"Cosechado",     c:"#60a5fa"},
  {v:"barbecho",      l:"Barbecho",      c:"#a78bfa"},
];

function getCultivoInfo(cultivo: string, orden: string) {
  if (!cultivo) return { label:"Sin cultivo", color:"#4b5563", icon:"🌾" };
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { label:cultivo, color:"#6b7280", icon:"🌱" };
}

function laborColor(tipo: string): string {
  if (tipo==="Siembra")    return "#22c55e";
  if (tipo==="Cosecha")    return "#60a5fa";
  if (tipo==="Fertilización") return "#a78bfa";
  if (tipo==="Aplicación"||tipo==="Control malezas") return "#f97316";
  if (tipo==="Labranza")   return "#eab308";
  if (tipo==="Recorrida")  return "#06b6d4";
  return "#6b7280";
}

function naturalSort(a: string, b: string): number {
  const seg = (s: string) => {
    const p: any[] = []; let i = 0;
    while (i < s.length) {
      if (s[i] >= "0" && s[i] <= "9") {
        let n = ""; while (i < s.length && s[i] >= "0" && s[i] <= "9") { n += s[i]; i++; }
        p.push(parseInt(n, 10));
      } else {
        let t = ""; while (i < s.length && !(s[i] >= "0" && s[i] <= "9")) { t += s[i]; i++; }
        p.push(t.toLowerCase());
      }
    }
    return p;
  };
  const pa = seg(a), pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0, vb = pb[i] ?? 0;
    if (typeof va==="number"&&typeof vb==="number") { if (va!==vb) return va-vb; }
    else { const sa=String(va),sb=String(vb); if(sa<sb) return -1; if(sa>sb) return 1; }
  }
  return 0;
}

export default function EmpleadoLotesPage() {
  const [empresaId, setEmpresaId] = useState("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [editandoLabor, setEditandoLabor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");
  const [filterCultivo, setFilterCultivo] = useState("todos");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    const authId = user?.id ?? localStorage.getItem("agro_auth_id");
    if (!authId) { window.location.href = "/login"; return; }

    const { data: u } = await sb.from("usuarios").select("id,rol").eq("auth_id", authId).single();
    if (!u || u.rol !== "empleado") { window.location.href = "/login"; return; }

    // Obtener empresa del empleado
    const empId = localStorage.getItem("empresa_id_empleado");
    if (!empId) {
      // Intentar buscar por vinculación
      const { data: vinc } = await sb.from("vinculaciones")
        .select("empresa_id").eq("profesional_id", u.id).eq("activa", true).single();
      if (!vinc) { setError("Sin empresa asignada"); setLoading(false); return; }
      localStorage.setItem("empresa_id_empleado", vinc.empresa_id);
      setEmpresaId(vinc.empresa_id);
      await fetchLotes(vinc.empresa_id);
    } else {
      setEmpresaId(empId);
      await fetchLotes(empId);
    }
    setLoading(false);
  };

  const fetchLotes = async (eid: string) => {
    const sb = await getSB();
    const [ls, lbs] = await Promise.all([
      sb.from("lotes").select("*").eq("empresa_id", eid),
      sb.from("lote_labores").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
    ]);
    const sorted = (ls.data ?? []).sort((a: any, b: any) => naturalSort(a.nombre ?? "", b.nombre ?? ""));
    const laboresNorm = (lbs.data ?? []).map((l: any) => ({
      ...l,
      producto_dosis: l.productos || l.dosis || l.descripcion || "",
      costo_aplicacion_ha: l.precio_aplicacion_ha || 0,
      costo_total: l.costo_total_usd || 0,
      superficie_ha: l.hectareas_trabajadas || 0,
      comentario: l.observaciones || "",
    }));
    setLotes(sorted);
    setLabores(laboresNorm);
  };

  const toast = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };

  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ha = Number(form.superficie_ha ?? loteActivo.hectareas ?? 0);
    const costoTotal = form.costo_total_lab ? Number(form.costo_total_lab) : form.costo_aplicacion_ha ? Number(form.costo_aplicacion_ha) * ha : 0;
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo.id,
      tipo: form.tipo_lab ?? "Aplicación",
      descripcion: form.producto_dosis || form.descripcion_lab || "",
      productos: form.producto_dosis || "",
      fecha: form.fecha_lab ?? new Date().toISOString().split("T")[0],
      metodo_carga: "manual", metodo_entrada: "empleado",
      hectareas_trabajadas: ha,
      precio_aplicacion_ha: Number(form.costo_aplicacion_ha ?? 0),
      costo_total_usd: costoTotal,
      estado_carga: "confirmado",
      cargado_por_rol: "empleado",
    };
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id", editandoLabor);
      setEditandoLabor(null);
    } else {
      await sb.from("lote_labores").insert(payload);
    }
    toast("✅ Labor guardada");
    await fetchLotes(empresaId);
    setShowFormLabor(false); setForm({});
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("¿Eliminar esta labor?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    await fetchLotes(empresaId);
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const lotesPrincipales = (() => {
    const vistos: string[] = [];
    return lotes.filter(l => !l.es_segundo_cultivo).filter(l => {
      const k = l.nombre.toLowerCase().trim();
      if (vistos.includes(k)) return false; vistos.push(k); return true;
    });
  })();

  const laboresLote = loteActivo ? labores.filter(l => l.lote_id === loteActivo.id) : [];
  const cultivoInfo = loteActivo ? getCultivoInfo(loteActivo.cultivo, loteActivo.cultivo_orden) : null;

  const cultivosFiltros = (() => {
    const mapa: Record<string, number> = {};
    lotesPrincipales.forEach(l => {
      const info = getCultivoInfo(l.cultivo, l.cultivo_orden);
      mapa[info.label] = (mapa[info.label] || 0) + 1;
    });
    return Object.entries(mapa);
  })();

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando lotes...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"rgba(255,255,255,0.92)",borderRadius:20,padding:32,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:14,fontWeight:700,color:"#0d2137",marginBottom:16}}>{error}</div>
        <button onClick={()=>window.location.href="/empleados"}
          style={{background:"none",border:"1.5px solid rgba(25,118,210,0.35)",borderRadius:10,
            padding:"8px 20px",color:"#1565c0",fontWeight:700,cursor:"pointer"}}>← Volver</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);
          outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);
          border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}
        .topbar-l{background-image:url('/FON.png');background-size:cover;background-position:top;
          border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-l::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-l>*{position:relative;z-index:1;}
        .card{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid white;border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.15);
          position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card>*{position:relative;z-index:2;}
        .lote-card{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.88);
          border-radius:18px;box-shadow:0 5px 18px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;
          position:relative;overflow:hidden;}
        .lote-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;z-index:0;}
        .lote-card>*{position:relative;z-index:2;}
        .lote-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(20,80,160,0.20);}
        .kpi-s{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.88);
          border-radius:13px;box-shadow:0 3px 10px rgba(20,80,160,0.10);padding:10px 12px;
          text-align:center;position:relative;overflow:hidden;}
        .kpi-s::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);pointer-events:none;}
        .kpi-s>*{position:relative;}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);
          border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;
          font-size:12px;cursor:pointer;padding:8px 14px;text-shadow:0 1px 3px rgba(0,40,120,0.35);
          box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;
          color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}
        .tag-c{display:inline-flex;align-items:center;border-radius:8px;font-size:11px;font-weight:700;padding:2px 8px;}
        .row-l:hover{background:rgba(255,255,255,0.80)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-l" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/empleados"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {loteActivo?"Volver a lotes":"Mi Panel"}
          </button>
          <div style={{flex:1,textAlign:"center"}}>
            <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>🌾 Lotes y Cultivos</span>
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"#d97706",padding:"3px 10px",borderRadius:8,
            background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.25)"}}>👷 Empleado</span>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"14px 14px 80px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,
          color:msg.startsWith("✅")?"#16a34a":"#dc2626",
          background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",
          border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* ── DETALLE LOTE ── */}
        {loteActivo&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Header */}
            <div className="card" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:5,alignSelf:"stretch",borderRadius:4,background:cultivoInfo?.color,flexShrink:0}}/>
                  <span style={{fontSize:24}}>{cultivoInfo?.icon}</span>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{loteActivo.nombre}</h2>
                    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      <span style={{fontWeight:800,fontSize:13,color:"#d97706"}}>{loteActivo.hectareas} ha</span>
                      <span className="tag-c" style={{background:(cultivoInfo?.color??"#6b7280")+"20",color:cultivoInfo?.color??"#6b7280"}}>{cultivoInfo?.label||"Sin cultivo"}</span>
                      {(()=>{const e=ESTADOS.find(x=>x.v===loteActivo.estado);return e?<span className="tag-c" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null;})()}
                    </div>
                  </div>
                </div>
                <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}}
                  className="bbtn">+ Registrar Labor</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
              {[
                {l:"Tenencia",   v:loteActivo.tipo_tenencia||"—",  c:"#d97706"},
                {l:"Partido",    v:loteActivo.partido||"—",         c:"#6b8aaa"},
                {l:"Variedad",   v:loteActivo.variedad||loteActivo.hibrido||"—", c:"#22c55e"},
                {l:"F. Siembra", v:loteActivo.fecha_siembra||"—",  c:"#60a5fa"},
                {l:"F. Cosecha", v:loteActivo.fecha_cosecha||"—",  c:"#a78bfa"},
                {l:"Rend. Esp.", v:loteActivo.rendimiento_esperado?(loteActivo.rendimiento_esperado+" tn/ha"):"—", c:"#d97706"},
              ].map(s=>(
                <div key={s.l} className="kpi-s">
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>{s.l}</div>
                  <div style={{fontSize:12,fontWeight:800,marginTop:3,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Form labor */}
            {showFormLabor&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:12}}>
                  {editandoLabor?"✏️ Editar Labor":"+ Registrar Labor"} — {loteActivo.nombre}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label>
                    <select value={form.tipo_lab??"Aplicación"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className="sel">
                      {TIPOS_LABOR.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Fecha</label>
                    <input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]}
                      onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
                  </div>
                  <div><label className={lCls}>Superficie ha</label>
                    <input type="number" value={form.superficie_ha??String(loteActivo.hectareas)}
                      onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
                  </div>
                  <div><label className={lCls}>Operario</label>
                    <input type="text" value={form.operario??""} onChange={e=>setForm({...form,operario:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
                  </div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Producto / Dosis</label>
                    <input type="text" value={form.producto_dosis??""} onChange={e=>setForm({...form,producto_dosis:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: Glifosato 4L/ha + Cletodim 0.5L/ha"/>
                  </div>
                  <div><label className={lCls}>Aplicador</label>
                    <select value={form.aplicador??""} onChange={e=>setForm({...form,aplicador:e.target.value})} className="sel">
                      {APLICADORES.map(a=><option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Costo $/ha</label>
                    <input type="number" value={form.costo_aplicacion_ha??""}
                      onChange={e=>{const ha=Number(form.superficie_ha||loteActivo.hectareas||0);setForm({...form,costo_aplicacion_ha:e.target.value,costo_total_lab:String(Number(e.target.value)*ha)});}}
                      className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
                  </div>
                  <div><label className={lCls}>Costo total $</label>
                    <input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
                  </div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Comentario / Novedad</label>
                    <input type="text" value={form.comentario??""} onChange={e=>setForm({...form,comentario:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Observaciones del campo..."/>
                  </div>
                </div>
                {/* Tipo rápido */}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Tipo rápido:</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {TIPOS_LABOR.map(t=>(
                      <button key={t} onClick={()=>setForm({...form,tipo_lab:t})}
                        style={{padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                          borderColor:form.tipo_lab===t?laborColor(t):laborColor(t)+"40",
                          background:form.tipo_lab===t?laborColor(t)+"20":"transparent",
                          color:form.tipo_lab===t?laborColor(t):laborColor(t)+"80"}}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarLabor} className="bbtn" style={{padding:"10px 18px"}}>✓ Guardar Labor</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="abtn" style={{padding:"10px 16px"}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Cuaderno */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",
                display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📋 Cuaderno de Campo</span>
                  <span style={{fontSize:11,color:"#6b8aaa"}}>{laboresLote.length} registros</span>
                </div>
              </div>
              {laboresLote.length===0?(
                <div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:36,opacity:0.12,marginBottom:10}}>📋</div>
                  <p style={{color:"#6b8aaa",fontSize:13,marginBottom:10}}>Sin labores registradas</p>
                  <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0],tipo_lab:"Aplicación"});}}
                    className="bbtn">+ Registrar primera labor</button>
                </div>
              ):(
                <div>
                  {laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>{
                    const color = laborColor(l.tipo);
                    return(
                      <div key={l.id} className="row-l" style={{borderBottom:"1px solid rgba(0,60,140,0.06)",padding:"12px 14px",transition:"background 0.15s"}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                          <div style={{width:4,alignSelf:"stretch",borderRadius:3,background:color,flexShrink:0,marginTop:2}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                              <span className="tag-c" style={{background:color+"20",color}}>{l.tipo}</span>
                              <span style={{fontSize:11,color:"#6b8aaa"}}>{l.fecha}</span>
                              {l.superficie_ha>0&&<span style={{fontSize:11,color:"#6b8aaa"}}>{l.superficie_ha} ha</span>}
                            </div>
                            {(l.producto_dosis||l.descripcion)&&(
                              <div style={{fontSize:13,fontWeight:600,color:"#0d2137",marginBottom:l.comentario?4:0}}>
                                {l.producto_dosis||l.descripcion}
                              </div>
                            )}
                            {l.comentario&&<div style={{fontSize:11,color:"#d97706"}}>💬 {l.comentario}</div>}
                            {l.operario&&<div style={{fontSize:11,color:"#aab8c8",marginTop:2}}>👤 {l.operario}</div>}
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {l.costo_total>0&&<div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>${Number(l.costo_total).toLocaleString("es-AR")}</div>}
                            <div style={{display:"flex",gap:6,marginTop:5,justifyContent:"flex-end"}}>
                              <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,producto_dosis:l.producto_dosis||l.descripcion||"",superficie_ha:String(l.superficie_ha||""),operario:l.operario||"",costo_aplicacion_ha:String(l.costo_aplicacion_ha||""),costo_total_lab:String(l.costo_total||""),comentario:l.comentario||""});setShowFormLabor(true);}}
                                style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                              <button onClick={()=>eliminarLabor(l.id)}
                                style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LISTA LOTES ── */}
        {!loteActivo&&(
          <div>
            {/* KPIs */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[
                {l:"Lotes",  v:String(lotesPrincipales.length),  c:"#0d2137"},
                {l:"Ha",     v:lotesPrincipales.reduce((a,l)=>a+(l.hectareas||0),0).toLocaleString("es-AR"), c:"#d97706"},
                {l:"Labores",v:String(labores.length), c:"#16a34a"},
              ].map(s=>(
                <div key={s.l} className="kpi-s" style={{minWidth:70}}>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c,marginTop:2}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Filtros cultivo */}
            {cultivosFiltros.length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                <button onClick={()=>setFilterCultivo("todos")}
                  style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                    borderColor:filterCultivo==="todos"?"#22c55e":"rgba(180,210,240,0.50)",
                    background:filterCultivo==="todos"?"rgba(34,197,94,0.12)":"rgba(255,255,255,0.70)",
                    color:filterCultivo==="todos"?"#16a34a":"#6b8aaa"}}>
                  Todos ({lotesPrincipales.length})
                </button>
                {cultivosFiltros.map(([nombre, cant])=>{
                  const info = CULTIVOS_LISTA.find(c=>c.label===nombre);
                  const color = info?.color ?? "#6b7280";
                  return(
                    <button key={nombre} onClick={()=>setFilterCultivo(filterCultivo===nombre?"todos":nombre)}
                      style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                        borderColor:filterCultivo===nombre?color:color+"50",
                        background:filterCultivo===nombre?color+"20":"rgba(255,255,255,0.70)",
                        color:filterCultivo===nombre?color:color+"90"}}>
                      {nombre} · {cant}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grid lotes */}
            {lotesPrincipales.length===0?(
              <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🌾</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>Sin lotes cargados en este campo</p>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                {lotesPrincipales
                  .filter(l=>filterCultivo==="todos"||(getCultivoInfo(l.cultivo,l.cultivo_orden).label)===filterCultivo)
                  .map(lote=>{
                    const ci = getCultivoInfo(lote.cultivo||"", lote.cultivo_orden||"");
                    const labsLote = labores.filter(l=>l.lote_id===lote.id);
                    const ultimaLabor = labsLote.sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
                    const est = ESTADOS.find(e=>e.v===lote.estado);
                    return(
                      <div key={lote.id} className="lote-card" onClick={()=>setLoteActivo(lote)}>
                        <div style={{height:4,background:ci.color,borderRadius:"18px 18px 0 0"}}/>
                        <div style={{padding:"12px 14px 10px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <span style={{fontSize:18}}>{ci.icon}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:14,fontWeight:800,color:"#0d2137",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lote.nombre}</div>
                              <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,fontWeight:700,color:ci.color}}>{ci.label}</span>
                                {est&&<span className="tag-c" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                            <div className="kpi-s" style={{padding:"6px 8px"}}>
                              <div style={{fontSize:9,color:"#6b8aaa",fontWeight:600}}>Ha</div>
                              <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginTop:1}}>{lote.hectareas}</div>
                            </div>
                            <div className="kpi-s" style={{padding:"6px 8px"}}>
                              <div style={{fontSize:9,color:"#6b8aaa",fontWeight:600}}>Labores</div>
                              <div style={{fontSize:13,fontWeight:800,color:"#4a6a8a",marginTop:1}}>{labsLote.length}</div>
                            </div>
                          </div>
                          {ultimaLabor&&(
                            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                              <span className="tag-c" style={{background:laborColor(ultimaLabor.tipo)+"20",color:laborColor(ultimaLabor.tipo),fontSize:10}}>{ultimaLabor.tipo}</span>
                              <span style={{color:"#aab8c8"}}>{ultimaLabor.fecha}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

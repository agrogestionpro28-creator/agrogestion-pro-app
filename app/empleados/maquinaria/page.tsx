"use client";
import { useEffect, useState } from "react";

type Maquina = {
  id: string; nombre: string; tipo: string; marca: string; modelo: string;
  año: number; estado: string; horas_uso: number; proximo_service: number;
  seguro_vencimiento: string; vtv_vencimiento: string; patente: string;
  observaciones: string; seguro_compania: string;
};
type Reparacion = {
  id: string; tipo: string; descripcion: string; costo: number;
  taller: string; fecha: string; horas_en_reparacion: number;
};

const TIPO_ICONS: Record<string,string> = {
  tractor:"🚜", cosechadora:"🌾", pulverizadora:"💧", sembradora:"🌱",
  implemento:"🔧", vehiculo:"🚗", otro:"⚙️"
};
const ESTADO_COLORS: Record<string,string> = {
  activo:"#16a34a", taller:"#dc2626", baja:"#6b8aaa"
};
const TIPOS = ["tractor","cosechadora","pulverizadora","sembradora","implemento","vehiculo","otro"];

export default function EmpleadoMaquinariaPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [seleccionada, setSeleccionada] = useState<Maquina|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFormRep, setShowFormRep] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const toast = (t: string) => { setMsg(t); setTimeout(()=>setMsg(""), 4000); };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    const authId = user?.id ?? localStorage.getItem("agro_auth_id");
    if (!authId) { window.location.href = "/login"; return; }

    const { data: u } = await sb.from("usuarios").select("id,rol").eq("auth_id", authId).single();
    if (!u || u.rol !== "empleado") { window.location.href = "/login"; return; }

    let empId = localStorage.getItem("empresa_id_empleado");
    if (!empId) {
      const { data: vinc } = await sb.from("vinculaciones")
        .select("empresa_id").eq("profesional_id", u.id).eq("activa", true).single();
      if (!vinc) { setError("Sin empresa asignada"); setLoading(false); return; }
      empId = vinc.empresa_id;
      localStorage.setItem("empresa_id_empleado", empId!);
    }
    setEmpresaId(empId);
    await fetchMaquinas(empId!);
    setLoading(false);
  };

  const fetchMaquinas = async (eid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria").select("*").eq("empresa_id", eid).order("nombre");
    setMaquinas(data ?? []);
  };

  const fetchReparaciones = async (mid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("maquinaria_reparaciones").select("*").eq("maquina_id", mid).order("fecha", { ascending: false });
    setReparaciones(data ?? []);
  };

  const guardarMaquina = async () => {
    if (!empresaId || !form.nombre?.trim()) { toast("❌ Ingresá el nombre"); return; }
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, nombre: form.nombre, tipo: form.tipo ?? "tractor",
      marca: form.marca ?? "", modelo: form.modelo ?? "",
      año: Number(form.año ?? 0), estado: form.estado ?? "activo",
      horas_uso: Number(form.horas_uso ?? 0),
      proximo_service: Number(form.proximo_service ?? 0),
      seguro_vencimiento: form.seguro_vencimiento || null,
      seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null,
      patente: form.patente ?? "",
      observaciones: form.observaciones ?? "",
    };
    if (seleccionada && showForm) {
      await sb.from("maquinaria").update(payload).eq("id", seleccionada.id);
      toast("✅ Máquina actualizada");
    } else {
      await sb.from("maquinaria").insert(payload);
      toast("✅ Máquina agregada");
    }
    await fetchMaquinas(empresaId);
    setShowForm(false); setForm({});
  };

  const guardarReparacion = async () => {
    if (!seleccionada || !empresaId) return;
    const sb = await getSB();
    await sb.from("maquinaria_reparaciones").insert({
      maquina_id: seleccionada.id, empresa_id: empresaId,
      tipo: form.tipo_rep ?? "service",
      descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0),
      taller: form.taller ?? "",
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      horas_en_reparacion: Number(form.horas_en_reparacion ?? 0),
    });
    toast("✅ Registrado");
    await fetchReparaciones(seleccionada.id);
    setShowFormRep(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (tabla === "maquinaria") { if (empresaId) await fetchMaquinas(empresaId); setSeleccionada(null); }
    else { if (seleccionada) await fetchReparaciones(seleccionada.id); }
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const maquinasFiltradas = maquinas.filter(m => filterEstado==="todos" ? true : m.estado===filterEstado);
  const alertas = maquinas.filter(m => {
    const hoy = new Date();
    if (m.seguro_vencimiento && new Date(m.seguro_vencimiento) < hoy) return true;
    if (m.vtv_vencimiento && new Date(m.vtv_vencimiento) < hoy) return true;
    if (m.proximo_service > 0 && m.horas_uso >= m.proximo_service) return true;
    return false;
  });

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando maquinaria...</span>
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
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}
        .topbar-m{background-image:url('/FON.png');background-size:cover;background-position:top;
          border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-m::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-m>*{position:relative;z-index:1;}
        .card-g{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid white;border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14);
          position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}
        .maq-card{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.88);
          border-radius:18px;box-shadow:0 4px 16px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;
          position:relative;overflow:hidden;}
        .maq-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .maq-card>*{position:relative;}
        .maq-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(20,80,160,0.18);}
        .kpi-m{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:14px;padding:12px;text-align:center;}
        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);
          border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;
          font-size:12px;cursor:pointer;padding:8px 14px;text-shadow:0 1px 3px rgba(0,40,120,0.35);
          box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;
          color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}
        .row-m:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-m" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>seleccionada?setSeleccionada(null):window.location.href="/empleados"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {seleccionada?"Volver":"Mi Panel"}
          </button>
          <div style={{flex:1,textAlign:"center"}}>
            <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>⚙️ Maquinaria</span>
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"#d97706",padding:"3px 10px",borderRadius:8,
            background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.25)"}}>👷 Empleado</span>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,
          color:msg.startsWith("✅")?"#16a34a":"#dc2626",
          background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",
          border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* ── DETALLE MÁQUINA ── */}
        {seleccionada?(
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <span style={{fontSize:44}}>{TIPO_ICONS[seleccionada.tipo]??"⚙️"}</span>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>{seleccionada.nombre}</h1>
                  <p style={{fontSize:11,color:"#1565c0",fontWeight:600,margin:"3px 0"}}>
                    {seleccionada.marca} {seleccionada.modelo} · {seleccionada.año} {seleccionada.patente?`· ${seleccionada.patente}`:""}
                  </p>
                  <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,
                    border:`1px solid ${ESTADO_COLORS[seleccionada.estado]}`,
                    background:`${ESTADO_COLORS[seleccionada.estado]}15`,
                    color:ESTADO_COLORS[seleccionada.estado],display:"inline-block"}}>
                    {seleccionada.estado.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button onClick={()=>{setShowFormRep(true);setForm({fecha:new Date().toISOString().split("T")[0]});}}
                  className="bbtn">+ Reparación / Service</button>
                <button onClick={()=>{setShowForm(true);setForm(Object.fromEntries(Object.entries(seleccionada).map(([k,v])=>[k,String(v??"")])));}}
                  className="abtn">✏️ Editar</button>
                <button onClick={()=>eliminar("maquinaria",seleccionada.id)}
                  style={{padding:"7px 12px",borderRadius:10,border:"1px solid rgba(220,38,38,0.25)",background:"rgba(220,38,38,0.08)",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>🗑️</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
              {[
                {l:"Horas de uso",    v:`${seleccionada.horas_uso} hs`,    c:"#16a34a"},
                {l:"Próximo service", v:seleccionada.proximo_service?`${seleccionada.proximo_service} hs`:"—", c:"#d97706"},
                {l:"Seguro",         v:seleccionada.seguro_vencimiento||"—", c:seleccionada.seguro_vencimiento&&new Date(seleccionada.seguro_vencimiento)<new Date()?"#dc2626":"#16a34a"},
                {l:"VTV",            v:seleccionada.vtv_vencimiento||"—", c:seleccionada.vtv_vencimiento&&new Date(seleccionada.vtv_vencimiento)<new Date()?"#dc2626":"#16a34a"},
                {l:"Compañía seguro",v:seleccionada.seguro_compania||"—",  c:"#6b8aaa"},
                {l:"Observaciones",  v:seleccionada.observaciones||"—",    c:"#6b8aaa"},
              ].map(d=>(
                <div key={d.l} className="kpi-m">
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{d.l}</div>
                  <div style={{fontSize:12,fontWeight:800,color:d.c}}>{d.v}</div>
                </div>
              ))}
            </div>

            {/* Form editar */}
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>✏️ Editar — {seleccionada.nombre}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo??"tractor"} onChange={e=>setForm({...form,tipo:e.target.value})} className="sel">{TIPOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
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
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMaquina} className="bbtn">✓ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form reparación */}
            {showFormRep&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>+ Registrar Service / Reparación</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_rep??"service"} onChange={e=>setForm({...form,tipo_rep:e.target.value})} className="sel"><option value="service">Service</option><option value="reparacion">Reparación</option><option value="preventivo">Mantenimiento preventivo</option><option value="accidente">Accidente</option></select></div>
                  <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Cambio de aceite..."/></div>
                  <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Costo $</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Horas parado</label><input type="number" value={form.horas_en_reparacion??""} onChange={e=>setForm({...form,horas_en_reparacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarReparacion} className="bbtn">✓ Guardar</button>
                  <button onClick={()=>{setShowFormRep(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Historial */}
            <div className="sec-w">
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>🔧 Historial de Reparaciones</span>
                <span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>
                  Total: ${reparaciones.reduce((a,r)=>a+(r.costo||0),0).toLocaleString("es-AR")}
                </span>
              </div>
              {reparaciones.length===0?(
                <div style={{textAlign:"center",padding:40,color:"#6b8aaa",fontSize:13}}>Sin reparaciones registradas</div>
              ):(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Descripción","Taller","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{reparaciones.map(r=>(
                      <tr key={r.id} className="row-m" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.10)",color:"#d97706"}}>{r.tipo}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{r.descripcion}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.taller}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#dc2626"}}>${Number(r.costo).toLocaleString("es-AR")}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("maquinaria_reparaciones",r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ):(
          /* ── LISTA ── */
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>⚙️ Maquinaria</h1>
                <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>Equipos e implementos del campo</p>
              </div>
              <button onClick={()=>{setShowForm(true);setForm({tipo:"tractor",estado:"activo"});setSeleccionada(null);}} className="bbtn">+ Agregar equipo</button>
            </div>

            {/* Alertas */}
            {alertas.length>0&&(
              <div style={{padding:"12px 14px",marginBottom:14,borderRadius:14,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.22)"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#dc2626",marginBottom:8}}>⚠️ Alertas ({alertas.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {alertas.map(m=>(
                    <div key={m.id} style={{fontSize:11,padding:"4px 12px",borderRadius:8,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.20)",color:"#dc2626",fontWeight:600}}>
                      🔴 {m.nombre}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {l:"Total",    v:maquinas.length,                              c:"#0d2137"},
                {l:"Activos",  v:maquinas.filter(m=>m.estado==="activo").length, c:"#16a34a"},
                {l:"En taller",v:maquinas.filter(m=>m.estado==="taller").length, c:"#dc2626"},
                {l:"Alertas",  v:alertas.length,                               c:alertas.length>0?"#dc2626":"#16a34a"},
              ].map(s=>(
                <div key={s.l} className="kpi-m">
                  <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div style={{display:"flex",gap:7,marginBottom:12}}>
              {["todos","activo","taller","baja"].map(f=>(
                <button key={f} onClick={()=>setFilterEstado(f)}
                  style={{padding:"6px 14px",borderRadius:10,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid",
                    borderColor:filterEstado===f?"#1976d2":"rgba(180,210,240,0.50)",
                    background:filterEstado===f?"rgba(25,118,210,0.10)":"rgba(255,255,255,0.70)",
                    color:filterEstado===f?"#1565c0":"#6b8aaa"}}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Form nueva */}
            {showForm&&!seleccionada&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Agregar equipo / implemento</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="John Deere 6110J"/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo??"tractor"} onChange={e=>setForm({...form,tipo:e.target.value})} className="sel">{TIPOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Marca</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Modelo</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Año</label><input type="number" value={form.año??""} onChange={e=>setForm({...form,año:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"activo"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel"><option value="activo">Activo</option><option value="taller">En Taller</option><option value="baja">Baja</option></select></div>
                  <div><label className={lCls}>Horas de uso</label><input type="number" value={form.horas_uso??""} onChange={e=>setForm({...form,horas_uso:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Próximo service (hs)</label><input type="number" value={form.proximo_service??""} onChange={e=>setForm({...form,proximo_service:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Patente</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMaquina} className="bbtn">✓ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Grid */}
            {maquinasFiltradas.length===0?(
              <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>⚙️</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>No hay equipos registrados</p>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                {maquinasFiltradas.map(m=>{
                  const tieneAlerta = alertas.some(a=>a.id===m.id);
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
                            <span style={{fontSize:10,padding:"2px 10px",borderRadius:20,fontWeight:700,
                              border:`1px solid ${ESTADO_COLORS[m.estado]}`,
                              background:`${ESTADO_COLORS[m.estado]}15`,
                              color:ESTADO_COLORS[m.estado]}}>{m.estado}</span>
                            {tieneAlerta&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626"}}>⚠️ Alerta</span>}
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div style={{padding:"8px 10px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Horas</div>
                            <div style={{fontSize:16,fontWeight:800,color:"#16a34a",marginTop:2}}>{m.horas_uso} hs</div>
                          </div>
                          <div style={{padding:"8px 10px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Prox. service</div>
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
    </div>
  );
}

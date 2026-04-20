"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type SubTab = "dashboard" | "animales" | "sanidad" | "reproduccion" | "movimientos" | "costos";
type Animal = { id: string; caravana: string; categoria: string; raza: string; fecha_nacimiento: string; peso_actual: number; estado_corporal: number; lote_potrero: string; propietario: string; estado: string; observaciones: string; };
type Pesada = { id: string; animal_id: string; fecha: string; peso_kg: number; lote: string; };
type Sanidad = { id: string; fecha: string; tipo: string; producto: string; dosis: string; lote: string; cantidad_animales: number; responsable: string; costo_total: number; proxima_fecha: string; observaciones: string; };
type Reproduccion = { id: string; animal_id: string; tipo_servicio: string; fecha_servicio: string; fecha_tacto: string; preñada: boolean; fecha_parto: string; tipo_parto: string; sexo_cria: string; peso_nacimiento: number; observaciones: string; };
type Movimiento = { id: string; fecha: string; tipo: string; cantidad: number; categoria: string; kg_total: number; precio_kg: number; monto_total: number; origen: string; destino: string; flete: number; observaciones: string; };
type Costo = { id: string; fecha: string; tipo: string; descripcion: string; lote: string; cantidad_animales: number; monto: number; costo_por_animal: number; };

const CATEGORIAS = ["ternero","ternera","vaquillona","novillo","toro","vaca"];
const CAT_COLORS: Record<string,string> = { ternero:"#60A5FA", ternera:"#F472B6", vaquillona:"#4ADE80", novillo:"#d97706", toro:"#ef4444", vaca:"#a78bfa" };
const CAT_ICONS: Record<string,string> = { ternero:"🐄", ternera:"🐄", vaquillona:"🐮", novillo:"🐂", toro:"🐃", vaca:"🐄" };
const TIPO_SANIDAD = ["vacuna","desparasitacion","vitamina","medicamento","otro"];
const TIPO_COSTO = ["alimentacion","sanidad","flete","mano_obra","estructura","otro"];
const TIPO_MOV = ["compra","venta","traslado","muerte","nacimiento"];
const MOV_COLORS: Record<string,string> = { compra:"#22c55e", venta:"#60a5fa", traslado:"#d97706", muerte:"#ef4444", nacimiento:"#a78bfa" };
const SUBTABS: { key: SubTab; label: string; icon: string }[] = [
  { key:"dashboard",    label:"Dashboard",    icon:"📊" },
  { key:"animales",     label:"Animales",     icon:"🐄" },
  { key:"sanidad",      label:"Sanidad",      icon:"💉" },
  { key:"reproduccion", label:"Reproducción", icon:"❤️" },
  { key:"movimientos",  label:"Movimientos",  icon:"📦" },
  { key:"costos",       label:"Costos",       icon:"💰" },
];

export default function EmpleadoHaciendaPage() {
  const [subTab, setSubTab] = useState<SubTab>("dashboard");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [animales, setAnimales] = useState<Animal[]>([]);
  const [pesadas, setPesadas] = useState<Pesada[]>([]);
  const [sanidad, setSanidad] = useState<Sanidad[]>([]);
  const [reproduccion, setReproduccion] = useState<Reproduccion[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [costos, setCostos] = useState<Costo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [animalDetalle, setAnimalDetalle] = useState<Animal|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");

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
    await fetchAll(empId!);
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

  const totalCabezas = animales.length;
  const pesoPromedio = totalCabezas > 0 ? animales.reduce((a,x)=>a+x.peso_actual,0)/totalCabezas : 0;
  const preñezPct = reproduccion.length > 0 ? (reproduccion.filter(r=>r.preñada).length/reproduccion.length)*100 : 0;
  const costoTotal = costos.reduce((a,c)=>a+c.monto,0);
  const alertasSanidad = sanidad.filter(s=>{
    if (!s.proxima_fecha) return false;
    const dias=(new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24);
    return dias<=30;
  });

  const guardarAnimal = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("hacienda_animales").insert({
      empresa_id: empresaId, caravana: form.caravana??"",
      categoria: form.categoria??"novillo", raza: form.raza??"",
      fecha_nacimiento: form.fecha_nacimiento||null,
      peso_actual: Number(form.peso_actual??0),
      estado_corporal: Number(form.estado_corporal??0),
      lote_potrero: form.lote_potrero??"", propietario: form.propietario??"",
      estado: "activo", observaciones: form.observaciones??"",
    });
    toast("✅ Animal registrado");
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarPesada = async (animalId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const peso = Number(form.peso_pesada??0);
    await sb.from("hacienda_pesadas").insert({ empresa_id: empresaId, animal_id: animalId, fecha: form.fecha_pesada??new Date().toISOString().split("T")[0], peso_kg: peso, lote: form.lote_pesada??"" });
    await sb.from("hacienda_animales").update({ peso_actual: peso }).eq("id", animalId);
    toast("✅ Pesada registrada");
    await fetchAll(empresaId); setForm({});
  };

  const guardarSanidad = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const costo = Number(form.costo_total??0);
    const cant = Number(form.cantidad_animales??0);
    await sb.from("hacienda_sanidad").insert({
      empresa_id: empresaId, fecha: form.fecha??new Date().toISOString().split("T")[0],
      tipo: form.tipo_sanidad??"vacuna", producto: form.producto??"", dosis: form.dosis??"",
      lote: form.lote??"", cantidad_animales: cant, responsable: form.responsable??"",
      costo_total: costo, proxima_fecha: form.proxima_fecha||null, observaciones: form.observaciones??"",
    });
    if (costo>0) await sb.from("hacienda_costos").insert({ empresa_id: empresaId, fecha: form.fecha??new Date().toISOString().split("T")[0], tipo: "sanidad", descripcion: `${form.tipo_sanidad} - ${form.producto}`, lote: form.lote??"", cantidad_animales: cant, monto: costo, costo_por_animal: cant>0?costo/cant:0 });
    toast("✅ Registro sanitario guardado");
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarMovimiento = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const cant = Number(form.cantidad??0);
    const kgTotal = Number(form.kg_total??0);
    const precioKg = Number(form.precio_kg??0);
    await sb.from("hacienda_movimientos").insert({
      empresa_id: empresaId, fecha: form.fecha??new Date().toISOString().split("T")[0],
      tipo: form.tipo_mov??"compra", cantidad: cant, categoria: form.categoria??"",
      kg_total: kgTotal, precio_kg: precioKg, monto_total: kgTotal*precioKg,
      origen: form.origen??"", destino: form.destino??"",
      flete: Number(form.flete??0), observaciones: form.observaciones??"",
    });
    toast("✅ Movimiento registrado");
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const guardarCosto = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const monto = Number(form.monto??0);
    const cant = Number(form.cantidad_animales??0);
    await sb.from("hacienda_costos").insert({
      empresa_id: empresaId, fecha: form.fecha??new Date().toISOString().split("T")[0],
      tipo: form.tipo_costo??"alimentacion", descripcion: form.descripcion??"",
      lote: form.lote??"", cantidad_animales: cant, monto,
      costo_por_animal: cant>0?monto/cant:0,
    });
    toast("✅ Costo registrado");
    await fetchAll(empresaId); setShowForm(false); setForm({});
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:32,height:32,border:"3px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#16a34a",fontWeight:600}}>Cargando hacienda...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"rgba(255,255,255,0.92)",borderRadius:20,padding:32,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:14,fontWeight:700,color:"#0d2137",marginBottom:16}}>{error}</div>
        <button onClick={()=>window.location.href="/empleados"} style={{background:"none",border:"1.5px solid rgba(25,118,210,0.35)",borderRadius:10,padding:"8px 20px",color:"#1565c0",fontWeight:700,cursor:"pointer"}}>← Volver</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}
        .topbar-h{background-image:url('/FON.png');background-size:cover;background-position:top;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-h::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-h>*{position:relative;z-index:1;}
        .card-g{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid white;border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}
        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}
        .kpi-h{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:14px;padding:14px;}
        .tab-h{padding:8px 14px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;border:1.5px solid rgba(255,255,255,0.88);background:rgba(255,255,255,0.65);color:#4a6a8a;}
        .tab-h.on{background-image:url('/AZUL.png');background-size:cover;color:white;border:1.5px solid rgba(100,180,255,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .row-h:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-h" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>animalDetalle?setAnimalDetalle(null):window.location.href="/empleados"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {animalDetalle?"Volver al rodeo":"Mi Panel"}
          </button>
          <div style={{flex:1,textAlign:"center"}}>
            <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>🐄 Hacienda</span>
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"#d97706",padding:"3px 10px",borderRadius:8,background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.25)"}}>👷 Empleado</span>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* Título + subtabs */}
        <div style={{marginBottom:14}}>
          <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>🐄 Hacienda</h1>
          <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>{totalCabezas} cabezas activas · {pesoPromedio.toFixed(0)} kg promedio</p>
        </div>

        <div style={{display:"flex",gap:7,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {SUBTABS.map(t=>(
            <button key={t.key} onClick={()=>{setSubTab(t.key);setShowForm(false);setForm({});setAnimalDetalle(null);}} className={`tab-h${subTab===t.key?" on":""}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {subTab==="dashboard"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
              {[
                {l:"CABEZAS",v:String(totalCabezas),c:"#16a34a",i:"🐄"},
                {l:"PESO PROM.",v:`${pesoPromedio.toFixed(0)} kg`,c:"#d97706",i:"⚖️"},
                {l:"% PREÑEZ",v:`${preñezPct.toFixed(0)}%`,c:preñezPct>80?"#16a34a":"#d97706",i:"❤️"},
                {l:"COSTO TOTAL",v:`$${costoTotal.toLocaleString("es-AR")}`,c:"#7c3aed",i:"💰"},
              ].map(s=>(
                <div key={s.l} className="kpi-h">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</span>
                    <span style={{fontSize:16}}>{s.i}</span>
                  </div>
                  <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Stock por categoría */}
            <div className="sec-w" style={{padding:14}}>
              <div style={{fontSize:12,fontWeight:800,color:"#16a34a",marginBottom:12}}>🐄 Stock por Categoría</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {CATEGORIAS.map(cat=>{
                  const count=animales.filter(a=>a.categoria===cat).length;
                  if(count===0) return null;
                  const pct=totalCabezas>0?count/totalCabezas*100:0;
                  return(
                    <div key={cat}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,marginBottom:3}}>
                        <span style={{color:CAT_COLORS[cat]}}>{CAT_ICONS[cat]} {cat.toUpperCase()}</span>
                        <span style={{color:"#0d2137"}}>{count} cab · {pct.toFixed(0)}%</span>
                      </div>
                      <div style={{height:6,borderRadius:4,background:"rgba(0,60,140,0.08)",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:4,background:CAT_COLORS[cat],width:`${pct}%`}}/>
                      </div>
                    </div>
                  );
                })}
                {totalCabezas===0&&<p style={{color:"#6b8aaa",fontSize:13,textAlign:"center",padding:"16px 0"}}>Sin animales</p>}
              </div>
            </div>

            {/* Alertas sanitarias */}
            {alertasSanidad.length>0&&(
              <div style={{padding:"12px 14px",borderRadius:14,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.22)"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#dc2626",marginBottom:8}}>⚠️ Alertas Sanitarias</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {alertasSanidad.map(s=>{
                    const dias=Math.round((new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24));
                    return<div key={s.id} style={{fontSize:11,padding:"4px 12px",borderRadius:8,fontWeight:700,border:`1px solid ${dias<=7?"rgba(220,38,38,0.30)":"rgba(217,119,6,0.30)"}`,color:dias<=7?"#dc2626":"#d97706"}}>{s.producto} · {dias}d</div>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ANIMALES ── */}
        {subTab==="animales"&&!animalDetalle&&(
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {CATEGORIAS.map(cat=>{const count=animales.filter(a=>a.categoria===cat).length;if(!count)return null;return<span key={cat} style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[cat]}15`,color:CAT_COLORS[cat]}}>{CAT_ICONS[cat]} {count} {cat}</span>;})}
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({categoria:"novillo"});}} className="bbtn">+ Nuevo Animal</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Nuevo Animal</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Caravana / ID</label><input type="text" value={form.caravana??""} onChange={e=>setForm({...form,caravana:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??"novillo"} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel">{CATEGORIAS.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}</select></div>
                  <div><label className={lCls}>Raza</label><input type="text" value={form.raza??""} onChange={e=>setForm({...form,raza:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Hereford, Angus..."/></div>
                  <div><label className={lCls}>Peso actual (kg)</label><input type="number" value={form.peso_actual??""} onChange={e=>setForm({...form,peso_actual:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado corporal (1-5)</label><input type="number" value={form.estado_corporal??""} onChange={e=>setForm({...form,estado_corporal:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} min="1" max="5"/></div>
                  <div><label className={lCls}>Lote / Potrero</label><input type="text" value={form.lote_potrero??""} onChange={e=>setForm({...form,lote_potrero:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarAnimal} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            {animales.length===0?<div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🐄</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin animales registrados</p></div>:(
              <div className="sec-w">
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Caravana","Categoría","Raza","Peso","Lote",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{animales.map(a=>(
                      <tr key={a.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",cursor:"pointer",transition:"background 0.15s"}} onClick={()=>setAnimalDetalle(a)}>
                        <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{a.caravana||"—"}</td>
                        <td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[a.categoria]}20`,color:CAT_COLORS[a.categoria]}}>{CAT_ICONS[a.categoria]} {a.categoria}</span></td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.raza||"—"}</td>
                        <td style={{padding:"9px 12px",fontWeight:800,color:"#d97706"}}>{a.peso_actual} kg</td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.lote_potrero||"—"}</td>
                        <td style={{padding:"9px 12px"}}><button onClick={e=>{e.stopPropagation();eliminar("hacienda_animales",a.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FICHA ANIMAL ── */}
        {subTab==="animales"&&animalDetalle&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>setAnimalDetalle(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700,textAlign:"left"}}>← Volver al rodeo</button>
            <div className="card-g" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:56,height:56,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,background:`${CAT_COLORS[animalDetalle.categoria]}15`}}>{CAT_ICONS[animalDetalle.categoria]}</div>
                <div>
                  <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>Caravana {animalDetalle.caravana||"Sin ID"}</h2>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[animalDetalle.categoria]}20`,color:CAT_COLORS[animalDetalle.categoria]}}>{animalDetalle.categoria}</span>
                  <span style={{fontSize:11,color:"#d97706",fontWeight:700,marginLeft:8}}>{animalDetalle.peso_actual} kg</span>
                </div>
              </div>
            </div>
            <div className="sec-w" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:800,color:"#d97706"}}>⚖️ Pesadas</div>
                <button onClick={()=>setShowForm(!showForm)} style={{fontSize:11,padding:"5px 12px",borderRadius:8,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.25)",color:"#d97706",cursor:"pointer",fontWeight:700}}>+ Pesada</button>
              </div>
              {showForm&&(
                <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_pesada??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_pesada:e.target.value})} className={iCls} style={{padding:"7px 12px",width:140}}/></div>
                  <div><label className={lCls}>Peso (kg)</label><input type="number" value={form.peso_pesada??""} onChange={e=>setForm({...form,peso_pesada:e.target.value})} className={iCls} style={{padding:"7px 12px",width:110}}/></div>
                  <button onClick={()=>guardarPesada(animalDetalle.id)} className="bbtn" style={{fontSize:11,padding:"7px 14px",alignSelf:"flex-end"}}>▶ Guardar</button>
                  <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:16,alignSelf:"flex-end"}}>✕</button>
                </div>
              )}
              {pesadas.filter(p=>p.animal_id===animalDetalle.id).length===0?<p style={{color:"#6b8aaa",fontSize:13}}>Sin pesadas</p>:(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pesadas.filter(p=>p.animal_id===animalDetalle.id).map((p,i,arr)=>{
                    const prev=arr[i+1];
                    const adpv=prev?((p.peso_kg-prev.peso_kg)/Math.max(1,(new Date(p.fecha).getTime()-new Date(prev.fecha).getTime())/(1000*60*60*24))):null;
                    return(
                      <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                        <span style={{fontSize:11,color:"#6b8aaa"}}>{p.fecha}</span>
                        <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>{p.peso_kg} kg</span>
                        {adpv!==null&&<span style={{fontSize:11,fontWeight:700,color:adpv>=0?"#16a34a":"#dc2626"}}>{adpv.toFixed(2)} kg/d</span>}
                        <button onClick={()=>eliminar("hacienda_pesadas",p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:13}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SANIDAD ── */}
        {subTab==="sanidad"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_sanidad:"vacuna",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo Registro Sanitario</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:12}}>+ Registro Sanitario</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_sanidad??"vacuna"} onChange={e=>setForm({...form,tipo_sanidad:e.target.value})} className="sel">{TIPO_SANIDAD.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Producto</label><input type="text" value={form.producto??""} onChange={e=>setForm({...form,producto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Aftosa, Ivermectina..."/></div>
                  <div><label className={lCls}>Dosis</label><input type="text" value={form.dosis??""} onChange={e=>setForm({...form,dosis:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Lote</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Cant. animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Responsable</label><input type="text" value={form.responsable??""} onChange={e=>setForm({...form,responsable:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Costo total</label><input type="number" value={form.costo_total??""} onChange={e=>setForm({...form,costo_total:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Próxima fecha</label><input type="date" value={form.proxima_fecha??""} onChange={e=>setForm({...form,proxima_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarSanidad} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {sanidad.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin registros sanitarios</div>:(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:600}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Producto","Lote","Animales","Costo","Próxima",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{sanidad.map(s=>(
                      <tr key={s.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{s.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a"}}>{s.tipo}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:700,color:"#0d2137"}}>{s.producto}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{s.lote||"—"}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>{s.cantidad_animales}</td>
                        <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{s.costo_total>0?`$${Number(s.costo_total).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",fontSize:11,color:s.proxima_fecha&&(new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24)<=30?"#dc2626":"#6b8aaa"}}>{s.proxima_fecha||"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_sanidad",s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MOVIMIENTOS ── */}
        {subTab==="movimientos"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_mov:"compra",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo Movimiento</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1565c0",marginBottom:12}}>+ Movimiento</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_mov??"compra"} onChange={e=>setForm({...form,tipo_mov:e.target.value})} className="sel">{TIPO_MOV.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel"><option value="">Seleccionar</option>{CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Kg totales</label><input type="number" value={form.kg_total??""} onChange={e=>setForm({...form,kg_total:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Origen</label><input type="text" value={form.origen??""} onChange={e=>setForm({...form,origen:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Destino</label><input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMovimiento} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {movimientos.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin movimientos</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Categoría","Cant.","Kg","Origen/Destino",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{movimientos.map(m=>(
                    <tr key={m.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                      <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{m.fecha}</td>
                      <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${MOV_COLORS[m.tipo]}20`,color:MOV_COLORS[m.tipo]}}>{m.tipo}</span></td>
                      <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{m.categoria}</td>
                      <td style={{padding:"8px 12px",fontWeight:800,color:"#0d2137"}}>{m.cantidad}</td>
                      <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{m.kg_total}</td>
                      <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{m.origen||m.destino||"—"}</td>
                      <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_movimientos",m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── COSTOS ── */}
        {subTab==="costos"&&(
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>Total: <strong style={{color:"#7c3aed"}}>${costoTotal.toLocaleString("es-AR")}</strong></span>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_costo:"alimentacion",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo Costo</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginBottom:12}}>+ Cargar Costo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_costo??"alimentacion"} onChange={e=>setForm({...form,tipo_costo:e.target.value})} className="sel">{TIPO_COSTO.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Lote</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Cant. animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Monto total</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCosto} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {costos.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin costos registrados</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Descripción","Lote","Animales","Monto",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{costos.map(c=>(
                    <tr key={c.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                      <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{c.fecha}</td>
                      <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(124,58,237,0.10)",color:"#7c3aed"}}>{c.tipo.replace("_"," ")}</span></td>
                      <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{c.descripcion}</td>
                      <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{c.lote||"—"}</td>
                      <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{c.cantidad_animales||"—"}</td>
                      <td style={{padding:"8px 12px",fontWeight:800,color:"#7c3aed"}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                      <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_costos",c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── REPRODUCCIÓN ── */}
        {subTab==="reproduccion"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_servicio:"natural"});}} className="bbtn">+ Nuevo Registro</button>
            </div>
            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f472b6",marginBottom:12}}>+ Registro Reproductivo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Animal (caravana)</label><select value={form.animal_id??""} onChange={e=>setForm({...form,animal_id:e.target.value})} className="sel"><option value="">Seleccionar</option>{animales.filter(a=>a.categoria==="vaca"||a.categoria==="vaquillona").map(a=><option key={a.id} value={a.id}>{a.caravana||a.id.slice(0,8)} · {a.categoria}</option>)}</select></div>
                  <div><label className={lCls}>Tipo servicio</label><select value={form.tipo_servicio??"natural"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className="sel"><option value="natural">Natural</option><option value="inseminacion">Inseminación</option></select></div>
                  <div><label className={lCls}>Fecha servicio</label><input type="date" value={form.fecha_servicio??""} onChange={e=>setForm({...form,fecha_servicio:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Resultado tacto</label><select value={form.preñada??""} onChange={e=>setForm({...form,preñada:e.target.value})} className="sel"><option value="">Sin diagnóstico</option><option value="si">✓ Preñada</option><option value="no">✗ Vacía</option></select></div>
                  <div><label className={lCls}>Fecha parto</label><input type="date" value={form.fecha_parto??""} onChange={e=>setForm({...form,fecha_parto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    if(!empresaId) return;
                    const sb=await getSB();
                    await sb.from("hacienda_reproduccion").insert({empresa_id:empresaId,animal_id:form.animal_id||null,tipo_servicio:form.tipo_servicio??"natural",fecha_servicio:form.fecha_servicio||null,fecha_tacto:null,preñada:form.preñada==="si",fecha_parto:form.fecha_parto||null,tipo_parto:"normal",sexo_cria:"",peso_nacimiento:0,observaciones:form.observaciones??""});
                    toast("✅ Registro guardado");
                    await fetchAll(empresaId);setShowForm(false);setForm({});
                  }} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="sec-w">
              {reproduccion.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin registros reproductivos</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Animal","Servicio","F.Servicio","Resultado","Parto",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{reproduccion.map(r=>{
                    const an=animales.find(a=>a.id===r.animal_id);
                    return(
                      <tr key={r.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{an?.caravana||"—"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.tipo_servicio}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.fecha_servicio||"—"}</td>
                        <td style={{padding:"8px 12px"}}>{r.preñada!==null?<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:r.preñada?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:r.preñada?"#16a34a":"#dc2626"}}>{r.preñada?"Preñada":"Vacía"}</span>:"—"}</td>
                        <td style={{padding:"8px 12px",color:"#f472b6",fontWeight:600}}>{r.fecha_parto||"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_reproduccion",r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

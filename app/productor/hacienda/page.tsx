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
  novillo:"#d97706", toro:"#ef4444", vaca:"#a78bfa"
};
const CAT_ICONS: Record<string,string> = {
  ternero:"🐄", ternera:"🐄", vaquillona:"🐮", novillo:"🐂", toro:"🐃", vaca:"🐄"
};
const TIPO_SANIDAD = ["vacuna","desparasitacion","vitamina","medicamento","otro"];
const TIPO_COSTO = ["alimentacion","sanidad","flete","mano_obra","estructura","otro"];
const TIPO_MOV = ["compra","venta","traslado","muerte","nacimiento"];
const MOV_COLORS: Record<string,string> = {
  compra:"#22c55e", venta:"#60a5fa", traslado:"#d97706", muerte:"#ef4444", nacimiento:"#a78bfa"
};

const SUBTABS: { key: SubTab; label: string; icon: string; color: string }[] = [
  { key:"dashboard",    label:"Dashboard",   icon:"📊", color:"#22c55e" },
  { key:"animales",     label:"Animales",    icon:"🐄", color:"#d97706" },
  { key:"sanidad",      label:"Sanidad",     icon:"💉", color:"#22c55e" },
  { key:"reproduccion", label:"Reproducción",icon:"❤️", color:"#f472b6" },
  { key:"movimientos",  label:"Movimientos", icon:"📦", color:"#60a5fa" },
  { key:"costos",       label:"Costos",      icon:"💰", color:"#a78bfa" },
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

  // ── KPIs (lógica original) ──
  const totalCabezas = animales.length;
  const pesoPromedio = totalCabezas > 0 ? animales.reduce((a,x) => a + x.peso_actual, 0) / totalCabezas : 0;
  const kgTotales = animales.reduce((a,x) => a + x.peso_actual, 0);

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
  const preñezPct = reproduccion.length > 0 ? (reproduccion.filter(r => r.preñada).length / reproduccion.length) * 100 : 0;
  const costoTotal = costos.reduce((a,c) => a + c.monto, 0);
  const kgProducidos = movimientos.filter(m => m.tipo === "venta").reduce((a,m) => a + m.kg_total, 0);
  const costoPorKg = kgProducidos > 0 ? costoTotal / kgProducidos : 0;
  const ingresoVentas = movimientos.filter(m => m.tipo === "venta").reduce((a,m) => a + m.monto_total, 0);
  const margenBruto = ingresoVentas - costos.filter(c => ["alimentacion","sanidad"].includes(c.tipo)).reduce((a,c) => a + c.monto, 0);

  const alertasSanidad = sanidad.filter(s => {
    if (!s.proxima_fecha) return false;
    const dias = (new Date(s.proxima_fecha).getTime() - Date.now()) / (1000*60*60*24);
    return dias <= 30;
  });

  // ── CRUD (lógica original) ──
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

  // ── Estilos nuevos ──
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#16a34a",fontWeight:600}}>Cargando Hacienda PRO...</span>
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

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}

        .topbar-h{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-h::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-h>*{position:relative;z-index:1;}

        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}

        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}

        .kpi-h{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:14px;padding:14px;transition:all 0.18s;box-shadow:0 3px 10px rgba(20,80,160,0.08);}
        .kpi-h:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(20,80,160,0.14);}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        .tab-h{padding:8px 14px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;border:1.5px solid rgba(255,255,255,0.88);background:rgba(255,255,255,0.65);color:#4a6a8a;}
        .tab-h.on{background-image:url('/AZUL.png');background-size:cover;background-position:center;color:white;border:1.5px solid rgba(100,180,255,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);}

        .row-h:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-h" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>animalDetalle?setAnimalDetalle(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {animalDetalle?"Volver al rodeo":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>🐄 Hacienda PRO</div>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="Logo" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Título */}
        <div style={{marginBottom:14}}>
          <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>🐄 Hacienda <span style={{color:"#16a34a"}}>PRO</span></h1>
          <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>{totalCabezas} cabezas activas · {pesoPromedio.toFixed(0)} kg promedio</p>
        </div>

        {/* SUBTABS */}
        <div style={{display:"flex",gap:7,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {SUBTABS.map(t=>(
            <button key={t.key} onClick={()=>{setSubTab(t.key);setShowForm(false);setForm({});setAnimalDetalle(null);}}
              className={`tab-h${subTab===t.key?" on":""}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════
            DASHBOARD
        ══════════════════════════════ */}
        {subTab==="dashboard"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* KPIs principales */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
              {[
                {label:"STOCK TOTAL",value:`${totalCabezas}`,sub:"cabezas",color:"#16a34a",icon:"🐄"},
                {label:"KG TOTALES",value:kgTotales.toLocaleString("es-AR"),sub:"kg en pie",color:"#d97706",icon:"⚖️"},
                {label:"ADPV",value:`${adpv.toFixed(2)}`,sub:"kg/día",color:"#1565c0",icon:"📈"},
                {label:"MORTANDAD",value:`${mortandadPct.toFixed(1)}%`,sub:"del stock",color:mortandadPct>3?"#dc2626":"#16a34a",icon:"⚠️"},
                {label:"ÍNDICE PREÑEZ",value:`${preñezPct.toFixed(0)}%`,sub:"diagnóstico",color:preñezPct>80?"#16a34a":"#d97706",icon:"❤️"},
                {label:"COSTO/KG",value:`$${costoPorKg.toFixed(0)}`,sub:"producido",color:"#7c3aed",icon:"💰"},
              ].map(s=>(
                <div key={s.label} className="kpi-h">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{s.label}</span>
                    <span style={{fontSize:16}}>{s.icon}</span>
                  </div>
                  <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Stats secundarios */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
              {[
                {label:"PESO PROMEDIO",value:`${pesoPromedio.toFixed(0)} kg`,color:"#0d2137"},
                {label:"MARGEN BRUTO",value:`$${margenBruto.toLocaleString("es-AR")}`,color:margenBruto>=0?"#16a34a":"#dc2626"},
                {label:"INGRESOS VENTAS",value:`$${ingresoVentas.toLocaleString("es-AR")}`,color:"#1565c0"},
                {label:"COSTO TOTAL",value:`$${costoTotal.toLocaleString("es-AR")}`,color:"#dc2626"},
              ].map(s=>(
                <div key={s.label} className="kpi-h">
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Stock por categoría + Alertas */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
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
                          <div style={{height:"100%",borderRadius:4,background:CAT_COLORS[cat],width:`${pct}%`,transition:"width 0.3s"}}/>
                        </div>
                      </div>
                    );
                  })}
                  {totalCabezas===0&&<p style={{color:"#6b8aaa",fontSize:13,textAlign:"center",padding:"16px 0"}}>Sin animales registrados</p>}
                </div>
              </div>

              <div className="sec-w" style={{padding:14}}>
                <div style={{fontSize:12,fontWeight:800,color:"#dc2626",marginBottom:12}}>⚠️ Alertas Sanitarias</div>
                {alertasSanidad.length===0?(
                  <div style={{textAlign:"center",padding:"20px 0"}}>
                    <div style={{fontSize:28,marginBottom:6}}>✅</div>
                    <p style={{color:"#16a34a",fontSize:12,fontWeight:600}}>Sin alertas pendientes</p>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {alertasSanidad.map(s=>{
                      const dias=Math.round((new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24));
                      return(
                        <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,border:`1px solid ${dias<=7?"rgba(220,38,38,0.25)":"rgba(217,119,6,0.25)"}`,background:dias<=7?"rgba(220,38,38,0.05)":"rgba(217,119,6,0.05)"}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:dias<=7?"#dc2626":"#d97706",flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>{s.producto}</div>
                            <div style={{fontSize:10,color:"#6b8aaa"}}>{s.lote||"Todo el rodeo"} · {s.proxima_fecha}</div>
                          </div>
                          <span style={{fontSize:11,fontWeight:800,color:dias<=7?"#dc2626":"#d97706"}}>{dias}d</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Accesos rápidos */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
              {[
                {label:"Gestión Animal",icon:"🐄",tab:"animales" as SubTab,color:"#16a34a"},
                {label:"Reproducción",icon:"❤️",tab:"reproduccion" as SubTab,color:"#f472b6"},
                {label:"Movimientos",icon:"📦",tab:"movimientos" as SubTab,color:"#1565c0"},
                {label:"Plan Sanitario",icon:"💉",tab:"sanidad" as SubTab,color:"#d97706"},
              ].map(b=>(
                <button key={b.label} onClick={()=>setSubTab(b.tab)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:14,border:`1px solid ${b.color}40`,background:`${b.color}10`,color:b.color,fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.18s"}}>
                  <span>{b.icon} {b.label}</span>
                  <span>→</span>
                </button>
              ))}
            </div>

            {/* Últimos movimientos */}
            <div className="sec-w">
              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>📦 Últimos Movimientos</span>
                <button onClick={()=>setSubTab("movimientos")} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>Ver todos →</button>
              </div>
              {movimientos.slice(0,5).map(m=>(
                <div key={m.id} className="row-h" style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.04)",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"background 0.15s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${MOV_COLORS[m.tipo]}20`,color:MOV_COLORS[m.tipo]}}>{m.tipo}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:"#0d2137"}}>{m.cantidad} {m.categoria} · {m.kg_total}kg</div>
                      <div style={{fontSize:10,color:"#6b8aaa"}}>{m.fecha} · {m.origen||m.destino}</div>
                    </div>
                  </div>
                  {m.monto_total>0&&<span style={{color:"#16a34a",fontWeight:800,fontSize:12}}>${Number(m.monto_total).toLocaleString("es-AR")}</span>}
                </div>
              ))}
              {movimientos.length===0&&<div style={{textAlign:"center",padding:32,color:"#6b8aaa",fontSize:13}}>Sin movimientos</div>}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            ANIMALES — LISTA
        ══════════════════════════════ */}
        {subTab==="animales"&&!animalDetalle&&(
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {CATEGORIAS.map(cat=>{
                  const count=animales.filter(a=>a.categoria===cat).length;
                  if(count===0) return null;
                  return<span key={cat} style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[cat]}15`,color:CAT_COLORS[cat]}}>{CAT_ICONS[cat]} {count} {cat}</span>;
                })}
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({categoria:"novillo"});}} className="bbtn">+ Nuevo Animal</button>
            </div>

            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Nuevo Animal</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Caravana / ID</label><input type="text" value={form.caravana??""} onChange={e=>setForm({...form,caravana:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: 123456"/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??"novillo"} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel">{CATEGORIAS.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}</select></div>
                  <div><label className={lCls}>Raza</label><input type="text" value={form.raza??""} onChange={e=>setForm({...form,raza:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Hereford, Angus..."/></div>
                  <div><label className={lCls}>Fecha nacimiento</label><input type="date" value={form.fecha_nacimiento??""} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Peso actual (kg)</label><input type="number" value={form.peso_actual??""} onChange={e=>setForm({...form,peso_actual:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado corporal (1-5)</label><input type="number" value={form.estado_corporal??""} onChange={e=>setForm({...form,estado_corporal:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} min="1" max="5"/></div>
                  <div><label className={lCls}>Lote / Potrero</label><input type="text" value={form.lote_potrero??""} onChange={e=>setForm({...form,lote_potrero:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Potrero Norte"/></div>
                  <div><label className={lCls}>Propietario</label><input type="text" value={form.propietario??""} onChange={e=>setForm({...form,propietario:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Propio / Hotelería"/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarAnimal} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {animales.length===0?(
              <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🐄</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>Sin animales registrados</p>
              </div>
            ):(
              <div className="sec-w">
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Caravana","Categoría","Raza","Peso","E.Corp","Lote","Propietario",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{animales.map(a=>(
                      <tr key={a.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",cursor:"pointer",transition:"background 0.15s"}} onClick={()=>setAnimalDetalle(a)}>
                        <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{a.caravana||"—"}</td>
                        <td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[a.categoria]}20`,color:CAT_COLORS[a.categoria]}}>{CAT_ICONS[a.categoria]} {a.categoria}</span></td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.raza||"—"}</td>
                        <td style={{padding:"9px 12px",fontWeight:800,color:"#d97706"}}>{a.peso_actual} kg</td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.estado_corporal||"—"}/5</td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.lote_potrero||"—"}</td>
                        <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{a.propietario||"Propio"}</td>
                        <td style={{padding:"9px 12px"}}><button onClick={e=>{e.stopPropagation();eliminar("hacienda_animales",a.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            FICHA INDIVIDUAL
        ══════════════════════════════ */}
        {subTab==="animales"&&animalDetalle&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>setAnimalDetalle(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700,textAlign:"left"}}>← Volver al rodeo</button>

            {/* Header animal */}
            <div className="card-g" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:56,height:56,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,background:`${CAT_COLORS[animalDetalle.categoria]}15`,border:`1px solid ${CAT_COLORS[animalDetalle.categoria]}30`}}>
                    {CAT_ICONS[animalDetalle.categoria]}
                  </div>
                  <div>
                    <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>Caravana {animalDetalle.caravana||"Sin ID"}</h2>
                    <div style={{display:"flex",gap:6,marginTop:4}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${CAT_COLORS[animalDetalle.categoria]}20`,color:CAT_COLORS[animalDetalle.categoria]}}>{animalDetalle.categoria}</span>
                      {animalDetalle.raza&&<span style={{fontSize:11,color:"#6b8aaa"}}>{animalDetalle.raza}</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,textAlign:"center"}}>
                  {[{l:"PESO",v:`${animalDetalle.peso_actual} kg`,c:"#d97706"},{l:"E.CORP",v:`${animalDetalle.estado_corporal||"—"}/5`,c:"#16a34a"},{l:"LOTE",v:animalDetalle.lote_potrero||"—",c:"#0d2137"}].map(s=>(
                    <div key={s.l} className="kpi-h">
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                      <div style={{fontSize:14,fontWeight:800,color:s.c,marginTop:2}}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pesadas */}
            <div className="sec-w" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#d97706"}}>⚖️ Historial de Pesadas</div>
                <button onClick={()=>setShowForm(!showForm)} style={{fontSize:11,padding:"5px 12px",borderRadius:8,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.25)",color:"#d97706",cursor:"pointer",fontWeight:700}}>+ Pesada</button>
              </div>
              {showForm&&(
                <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_pesada??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_pesada:e.target.value})} className={iCls} style={{padding:"7px 12px",width:140}}/></div>
                  <div><label className={lCls}>Peso (kg)</label><input type="number" value={form.peso_pesada??""} onChange={e=>setForm({...form,peso_pesada:e.target.value})} className={iCls} style={{padding:"7px 12px",width:110}}/></div>
                  <button onClick={()=>guardarPesada(animalDetalle.id)} className="bbtn" style={{fontSize:11,padding:"7px 14px"}}>▶ Guardar</button>
                  <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:16}}>✕</button>
                </div>
              )}
              {pesadas.filter(p=>p.animal_id===animalDetalle.id).length===0
                ?<p style={{color:"#6b8aaa",fontSize:13}}>Sin pesadas registradas</p>
                :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pesadas.filter(p=>p.animal_id===animalDetalle.id).map((p,i,arr)=>{
                    const prev=arr[i+1];
                    const adpvLocal=prev?((p.peso_kg-prev.peso_kg)/Math.max(1,(new Date(p.fecha).getTime()-new Date(prev.fecha).getTime())/(1000*60*60*24))):null;
                    return(
                      <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                        <span style={{fontSize:11,color:"#6b8aaa"}}>{p.fecha}</span>
                        <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>{p.peso_kg} kg</span>
                        {adpvLocal!==null&&<span style={{fontSize:11,fontWeight:700,color:adpvLocal>=0?"#16a34a":"#dc2626"}}>{adpvLocal.toFixed(2)} kg/d</span>}
                        <button onClick={()=>eliminar("hacienda_pesadas",p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:13}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              }
            </div>

            {/* Reproducción */}
            <div className="sec-w" style={{padding:14}}>
              <div style={{fontSize:12,fontWeight:800,color:"#f472b6",marginBottom:10}}>❤️ Reproducción</div>
              {reproduccion.filter(r=>r.animal_id===animalDetalle.id).length===0
                ?<p style={{color:"#6b8aaa",fontSize:13}}>Sin registros de reproducción</p>
                :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {reproduccion.filter(r=>r.animal_id===animalDetalle.id).map(r=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:"8px 12px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                      <span style={{fontSize:11,color:"#6b8aaa"}}>{r.fecha_servicio}</span>
                      <span style={{fontSize:11,fontWeight:600,color:"#0d2137"}}>{r.tipo_servicio}</span>
                      {r.preñada!==null&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:r.preñada?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:r.preñada?"#16a34a":"#dc2626"}}>{r.preñada?"✓ Preñada":"✗ Vacía"}</span>}
                      {r.fecha_parto&&<span style={{fontSize:11,color:"#f472b6",fontWeight:600}}>Parto: {r.fecha_parto}</span>}
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            SANIDAD
        ══════════════════════════════ */}
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
                  <div><label className={lCls}>Dosis</label><input type="text" value={form.dosis??""} onChange={e=>setForm({...form,dosis:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="2 ml"/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Lote / Potrero</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Todo el rodeo"/></div>
                  <div><label className={lCls}>Cantidad animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Responsable</label><input type="text" value={form.responsable??""} onChange={e=>setForm({...form,responsable:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Veterinario / Encargado"/></div>
                  <div><label className={lCls}>Costo total</label><input type="number" value={form.costo_total??""} onChange={e=>setForm({...form,costo_total:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Próxima fecha</label><input type="date" value={form.proxima_fecha??""} onChange={e=>setForm({...form,proxima_fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarSanidad} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {alertasSanidad.length>0&&(
              <div style={{padding:"10px 14px",marginBottom:12,borderRadius:12,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.20)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#dc2626"}}/>
                  <span style={{fontSize:11,fontWeight:800,color:"#dc2626"}}>⚠️ PRÓXIMAS APLICACIONES</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {alertasSanidad.map(s=>{const dias=Math.round((new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24));return<div key={s.id} style={{fontSize:10,padding:"3px 10px",borderRadius:7,fontWeight:700,border:`1px solid ${dias<=7?"rgba(220,38,38,0.30)":"rgba(217,119,6,0.30)"}`,color:dias<=7?"#dc2626":"#d97706"}}>{s.producto} · {dias}d · {s.lote||"Rodeo"}</div>;})}
                </div>
              </div>
            )}

            <div className="sec-w">
              {sanidad.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin registros sanitarios</div>:(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:800}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Producto","Dosis","Lote","Animales","Costo","Responsable","Próxima",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{sanidad.map(s=>(
                      <tr key={s.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",fontSize:11,color:"#6b8aaa"}}>{s.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a"}}>{s.tipo}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:700,color:"#0d2137"}}>{s.producto}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{s.dosis}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{s.lote||"—"}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>{s.cantidad_animales}</td>
                        <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{s.costo_total>0?`$${Number(s.costo_total).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{s.responsable||"—"}</td>
                        <td style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:s.proxima_fecha&&(new Date(s.proxima_fecha).getTime()-Date.now())/(1000*60*60*24)<=30?"#dc2626":"#6b8aaa"}}>{s.proxima_fecha||"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_sanidad",s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            REPRODUCCIÓN
        ══════════════════════════════ */}
        {subTab==="reproduccion"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_servicio:"natural",tipo_parto:"normal"});}} className="bbtn">+ Nuevo Registro Reproductivo</button>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {label:"DIAGNÓSTICOS",value:reproduccion.length,color:"#0d2137"},
                {label:"% PREÑEZ",value:`${preñezPct.toFixed(0)}%`,color:preñezPct>80?"#16a34a":"#dc2626"},
                {label:"PARTOS",value:reproduccion.filter(r=>r.fecha_parto).length,color:"#f472b6"},
              ].map(s=>(
                <div key={s.label} className="kpi-h" style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.label}</div>
                  <div style={{fontSize:22,fontWeight:800,color:s.color,marginTop:4}}>{s.value}</div>
                </div>
              ))}
            </div>

            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f472b6",marginBottom:12}}>+ Registro Reproductivo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Animal (caravana)</label><select value={form.animal_id??""} onChange={e=>setForm({...form,animal_id:e.target.value})} className="sel"><option value="">Seleccionar</option>{animales.filter(a=>a.categoria==="vaca"||a.categoria==="vaquillona").map(a=><option key={a.id} value={a.id}>{a.caravana||a.id.slice(0,8)} · {a.categoria}</option>)}</select></div>
                  <div><label className={lCls}>Tipo servicio</label><select value={form.tipo_servicio??"natural"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className="sel"><option value="natural">Natural</option><option value="inseminacion">Inseminación</option></select></div>
                  <div><label className={lCls}>Fecha servicio</label><input type="date" value={form.fecha_servicio??""} onChange={e=>setForm({...form,fecha_servicio:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha tacto</label><input type="date" value={form.fecha_tacto??""} onChange={e=>setForm({...form,fecha_tacto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Resultado tacto</label><select value={form.preñada??""} onChange={e=>setForm({...form,preñada:e.target.value})} className="sel"><option value="">Sin diagnóstico</option><option value="si">✓ Preñada</option><option value="no">✗ Vacía</option></select></div>
                  <div><label className={lCls}>Fecha parto</label><input type="date" value={form.fecha_parto??""} onChange={e=>setForm({...form,fecha_parto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo parto</label><select value={form.tipo_parto??"normal"} onChange={e=>setForm({...form,tipo_parto:e.target.value})} className="sel"><option value="normal">Normal</option><option value="asistido">Asistido</option><option value="cesarea">Cesárea</option></select></div>
                  <div><label className={lCls}>Sexo cría</label><select value={form.sexo_cria??""} onChange={e=>setForm({...form,sexo_cria:e.target.value})} className="sel"><option value="">—</option><option value="macho">Macho</option><option value="hembra">Hembra</option></select></div>
                  <div><label className={lCls}>Peso al nacer (kg)</label><input type="number" value={form.peso_nacimiento??""} onChange={e=>setForm({...form,peso_nacimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{
                    if (!empresaId) return;
                    const animalSel = animales.find(a=>a.id===form.animal_id);
                    setAnimalDetalle(animalSel||null);
                    if(animalSel) guardarReproduccion();
                    else { getSB().then(sb=>sb.from("hacienda_reproduccion").insert({empresa_id:empresaId,animal_id:form.animal_id||null,...{tipo_servicio:form.tipo_servicio??"natural",fecha_servicio:form.fecha_servicio||null,fecha_tacto:form.fecha_tacto||null,preñada:form.preñada==="si",fecha_parto:form.fecha_parto||null,tipo_parto:form.tipo_parto??"normal",sexo_cria:form.sexo_cria??"",peso_nacimiento:Number(form.peso_nacimiento??0),observaciones:form.observaciones??""}})).then(()=>fetchAll(empresaId)).then(()=>{setShowForm(false);setForm({});});}
                  }} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            <div className="sec-w">
              {reproduccion.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin registros reproductivos</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Animal","Servicio","F.Servicio","F.Tacto","Resultado","Parto","Cría",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{reproduccion.map(r=>{
                    const an=animales.find(a=>a.id===r.animal_id);
                    return(
                      <tr key={r.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{an?.caravana||r.animal_id?.slice(0,8)||"—"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.tipo_servicio}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.fecha_servicio||"—"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.fecha_tacto||"—"}</td>
                        <td style={{padding:"8px 12px"}}>{r.preñada!==null?<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:r.preñada?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:r.preñada?"#16a34a":"#dc2626"}}>{r.preñada?"Preñada":"Vacía"}</span>:<span style={{color:"#6b8aaa"}}>—</span>}</td>
                        <td style={{padding:"8px 12px",color:"#f472b6",fontWeight:600}}>{r.fecha_parto||"—"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{r.sexo_cria?`${r.sexo_cria} · ${r.peso_nacimiento}kg`:"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_reproduccion",r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            MOVIMIENTOS
        ══════════════════════════════ */}
        {subTab==="movimientos"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_mov:"compra",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo Movimiento</button>
            </div>

            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1565c0",marginBottom:12}}>+ Movimiento de Hacienda</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_mov??"compra"} onChange={e=>setForm({...form,tipo_mov:e.target.value})} className="sel">{TIPO_MOV.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel"><option value="">Seleccionar</option>{CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className={lCls}>Cantidad (cabezas)</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Kg totales</label><input type="number" value={form.kg_total??""} onChange={e=>setForm({...form,kg_total:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Precio/kg</label><input type="number" value={form.precio_kg??""} onChange={e=>setForm({...form,precio_kg:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Origen</label><input type="text" value={form.origen??""} onChange={e=>setForm({...form,origen:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Establecimiento origen"/></div>
                  <div><label className={lCls}>Destino</label><input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Frigorífico / Mercado"/></div>
                  <div><label className={lCls}>Flete ($)</label><input type="number" value={form.flete??""} onChange={e=>setForm({...form,flete:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                {form.kg_total&&form.precio_kg&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.20)",fontSize:11,color:"#1565c0",fontWeight:600}}>
                    Total operación: ${(Number(form.kg_total)*Number(form.precio_kg)).toLocaleString("es-AR")}
                    {form.flete&&Number(form.flete)>0&&` · Neto: $${(Number(form.kg_total)*Number(form.precio_kg)-Number(form.flete)).toLocaleString("es-AR")}`}
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarMovimiento} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            <div className="sec-w">
              {movimientos.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin movimientos</div>:(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:900}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Categoría","Cabezas","Kg","$/kg","Total","Flete","Origen/Destino",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{movimientos.map(m=>(
                      <tr key={m.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                        <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{m.fecha}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${MOV_COLORS[m.tipo]}20`,color:MOV_COLORS[m.tipo]}}>{m.tipo}</span></td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{m.categoria}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#0d2137"}}>{m.cantidad}</td>
                        <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{m.kg_total}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{m.precio_kg>0?`$${m.precio_kg}`:"-"}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#16a34a"}}>{m.monto_total>0?`$${Number(m.monto_total).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",color:"#dc2626",fontSize:11}}>{m.flete>0?`$${Number(m.flete).toLocaleString("es-AR")}`:"-"}</td>
                        <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{m.origen||m.destino||"—"}</td>
                        <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_movimientos",m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            COSTOS
        ══════════════════════════════ */}
        {subTab==="costos"&&(
          <div className="fade-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>Total: <strong style={{color:"#7c3aed"}}>${costoTotal.toLocaleString("es-AR")}</strong> · Por animal: <strong style={{color:"#7c3aed"}}>${totalCabezas>0?(costoTotal/totalCabezas).toFixed(0):"0"}</strong></span>
              <button onClick={()=>{setShowForm(!showForm);setForm({tipo_costo:"alimentacion",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo Costo</button>
            </div>

            {showForm&&(
              <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginBottom:12}}>+ Cargar Costo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_costo??"alimentacion"} onChange={e=>setForm({...form,tipo_costo:e.target.value})} className="sel">{TIPO_COSTO.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Detalle del costo"/></div>
                  <div><label className={lCls}>Lote / Imputación</label><input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Todo el rodeo"/></div>
                  <div><label className={lCls}>Cantidad animales</label><input type="number" value={form.cantidad_animales??""} onChange={e=>setForm({...form,cantidad_animales:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Monto total</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 3"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                {form.monto&&form.cantidad_animales&&Number(form.cantidad_animales)>0&&(
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.20)",fontSize:11,color:"#7c3aed",fontWeight:600}}>
                    Costo por animal: ${(Number(form.monto)/Number(form.cantidad_animales)).toLocaleString("es-AR")}
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCosto} className="bbtn">▶ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Resumen por tipo */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:12}}>
              {TIPO_COSTO.map(tipo=>{
                const tot=costos.filter(c=>c.tipo===tipo).reduce((a,c)=>a+c.monto,0);
                if(tot===0) return null;
                return(
                  <div key={tipo} className="kpi-h" style={{textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{tipo.replace("_"," ")}</div>
                    <div style={{fontSize:13,fontWeight:800,color:"#7c3aed"}}>${tot.toLocaleString("es-AR")}</div>
                  </div>
                );
              })}
            </div>

            <div className="sec-w">
              {costos.length===0?<div style={{textAlign:"center",padding:48,color:"#6b8aaa",fontSize:13}}>Sin costos registrados</div>:(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["Fecha","Tipo","Descripción","Lote","Animales","Monto","$/animal",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{costos.map(c=>(
                    <tr key={c.id} className="row-h" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                      <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{c.fecha}</td>
                      <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(124,58,237,0.10)",color:"#7c3aed"}}>{c.tipo.replace("_"," ")}</span></td>
                      <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>{c.descripcion}</td>
                      <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{c.lote||"—"}</td>
                      <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{c.cantidad_animales||"—"}</td>
                      <td style={{padding:"8px 12px",fontWeight:800,color:"#7c3aed"}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                      <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{c.costo_por_animal>0?`$${Number(c.costo_por_animal).toLocaleString("es-AR")}`:"-"}</td>
                      <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("hacienda_costos",c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:16,paddingTop:4}}>© AgroGestión PRO · Hacienda PRO</p>

      {/* Botón IA */}
      <button onClick={()=>setShowIA(!showIA)} style={{position:"fixed",bottom:20,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",overflow:"hidden",border:"none",cursor:"pointer",padding:0,boxShadow:"0 6px 22px rgba(22,163,74,0.40)",animation:"float 3s ease-in-out infinite"}}>
        <Image src="/btn-ia.png" alt="IA" fill style={{objectFit:"cover"}}/>
      </button>

      {/* Panel IA */}
      {showIA&&(
        <div style={{position:"fixed",bottom:80,right:16,zIndex:40,width:300,borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a"}}/><span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>Asesor Ganadero IA</span></div>
            <button onClick={()=>{setShowIA(false);setAiMsg("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:"10px 12px",maxHeight:200,overflowY:"auto"}}>
            {!aiMsg&&!aiLoading&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {["Analizá mi rodeo actual","¿Cuándo conviene vender?","Costo por kg producido?","Alertas sanitarias"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} style={{textAlign:"left",fontSize:11,color:"#4a6a8a",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading&&<p style={{fontSize:12,color:"#16a34a",fontWeight:700}}>Analizando rodeo...</p>}
            {aiMsg&&<p style={{fontSize:12,color:"#0d2137",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{aiMsg}</p>}
          </div>
          <div style={{padding:"6px 10px 10px",display:"flex",gap:6,borderTop:"1px solid rgba(0,60,140,0.07)"}}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&aiInput.trim()){askAI(aiInput);setAiInput("");}}} placeholder="Preguntá sobre el rodeo..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={()=>{if(aiInput.trim()){askAI(aiInput);setAiInput("");}}} className="bbtn" style={{padding:"7px 12px",fontSize:12}}>▶</button>
          </div>
        </div>
      )}

      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}

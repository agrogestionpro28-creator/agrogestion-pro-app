"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Seccion = "productores" | "cobranza" | "vehiculo" | "ia_campo";

type ProductorVet = {
  id: string; nombre: string; telefono: string; email: string;
  localidad: string; provincia: string; hectareas_total: number;
  cabezas_ganado: number; tipo_produccion: string;
  observaciones: string; empresa_id: string | null;
  tiene_cuenta: boolean; honorario_tipo: string; honorario_monto: number;
};
type Visita = {
  id: string; productor_id: string; fecha: string; tipo_servicio: string;
  descripcion: string; animales: string; medicamentos: string;
  dosis: string; observaciones: string; costo: number;
};
type Cobranza = { id: string; productor_id: string; concepto: string; monto: number; fecha: string; estado: string; metodo_pago: string; };
type Vehiculo = { id: string; nombre: string; marca: string; modelo: string; anio: number; patente: string; seguro_vencimiento: string; seguro_compania: string; vtv_vencimiento: string; km_actuales: number; proximo_service_km: number; };
type ServiceVehiculo = { id: string; tipo: string; descripcion: string; costo: number; km: number; fecha: string; taller: string; };
type MensajeIA = { rol: "user"|"assistant"; texto: string };
type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

const TIPOS_SERVICIO_VET = ["Receta veterinaria","Sanidad animal","Vacunacion","Diagnostico","Cirugia","Castracion","Analisis laboratorio","Asesoramiento reproductivo","Control hacienda","Aplicacion","Otro"];
const VOZ_COLOR: Record<string,string> = {idle:"#22c55e",escuchando:"#ef4444",procesando:"#eab308",respondiendo:"#60a5fa",error:"#ef4444"};
const VOZ_ICON: Record<string,string> = {idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};

const NAV = [
  {k:"productores", icon:"👨‍🌾", label:"Productores"},
  {k:"cobranza",    icon:"💰",    label:"Cobranza"},
  {k:"vehiculo",    icon:"🚗",    label:"Vehículo"},
  {k:"ia_campo",    icon:"🤖",    label:"IA Vet"},
];

export default function VeterinarioPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [vetId, setVetId] = useState<string|null>(null);
  const [vetNombre, setVetNombre] = useState("");
  const [vetData, setVetData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorVet[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showFormVisita, setShowFormVisita] = useState(false);
  const [showFormVincular, setShowFormVincular] = useState(false);
  const [editandoProductor, setEditandoProductor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msj, setMsj] = useState("");
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);
  const [aiChat, setAiChat] = useState<MensajeIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const m = (t: string) => { setMsj(t); setTimeout(() => setMsj(""), 4000); };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("*").eq("auth_id", user.id).single();
    if (!u || u.rol !== "veterinario") { window.location.href = "/login"; return; }
    setVetId(u.id); setVetNombre(u.nombre); setVetData(u);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (vid: string) => {
    const sb = await getSB();
    const { data: prods } = await sb.from("vet_productores").select("*").eq("veterinario_id", vid).eq("activo", true).order("nombre");
    setProductores(prods ?? []);
    const { data: vis } = await sb.from("vet_visitas").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false });
    setVisitas(vis ?? []);
    const { data: cobs } = await sb.from("ing_cobranzas").select("*").eq("ingeniero_id", vid).order("fecha", { ascending: false });
    setCobranzas(cobs ?? []);
    const { data: vehs } = await sb.from("ing_vehiculos").select("*").eq("ingeniero_id", vid);
    setVehiculos(vehs ?? []);
  };

  const guardarProductor = async () => {
    if (!vetId || !form.nombre?.trim()) { m("❌ Ingresá el nombre"); return; }
    const sb = await getSB();
    let empresa_id = null; let tiene_cuenta = false;
    if (form.email?.trim()) {
      const { data: usuario } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (usuario) { const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", usuario.id).single(); if (emp) { empresa_id = emp.id; tiene_cuenta = true; } }
    }
    const payload = { veterinario_id: vetId, nombre: form.nombre.trim(), telefono: form.telefono ?? "", email: form.email ?? "", localidad: form.localidad ?? "", provincia: form.provincia ?? "Santa Fe", hectareas_total: Number(form.hectareas_total ?? 0), cabezas_ganado: Number(form.cabezas_ganado ?? 0), tipo_produccion: form.tipo_produccion ?? "", observaciones: form.observaciones ?? "", honorario_tipo: form.honorario_tipo ?? "mensual", honorario_monto: Number(form.honorario_monto ?? 0), empresa_id, tiene_cuenta, activo: true };
    if (editandoProductor) { await sb.from("vet_productores").update(payload).eq("id", editandoProductor); setEditandoProductor(null); }
    else await sb.from("vet_productores").insert(payload);
    m(tiene_cuenta ? "✅ Guardado — vinculado a app" : "✅ Productor guardado");
    await fetchAll(vetId); setShowForm(false); setForm({});
  };

  const vincularPorCodigo = async () => {
    if (!vetId || !form.codigo_productor?.trim()) { m("❌ Ingresá el código"); return; }
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("id,nombre").eq("codigo", form.codigo_productor.trim()).eq("rol","productor").single();
    if (!u) { m("❌ Productor no encontrado"); return; }
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    const empresa_id = emp?.id ?? null;
    const { data: existe } = await sb.from("vet_productores").select("id").eq("veterinario_id", vetId).eq("nombre", u.nombre).single();
    if (existe) { m("❌ Ya está en tu lista"); return; }
    await sb.from("vet_productores").insert({ veterinario_id: vetId, nombre: u.nombre, empresa_id, tiene_cuenta: true, honorario_tipo: form.honorario_tipo ?? "mensual", honorario_monto: Number(form.honorario_monto ?? 0), activo: true });
    if (empresa_id) {
      const { data: vincExiste } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", vetId).eq("empresa_id", empresa_id).single();
      if (!vincExiste) await sb.from("vinculaciones").insert({ ingeniero_id: vetId, empresa_id, activa: true });
    }
    m("✅ " + u.nombre + " vinculado");
    await fetchAll(vetId); setShowFormVincular(false); setForm({});
  };

  const eliminarProductor = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from("vet_productores").update({ activo: false }).eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarVisita = async () => {
    if (!vetId || !form.productor_id_v) { m("❌ Seleccioná un productor"); return; }
    const sb = await getSB();
    await sb.from("vet_visitas").insert({ veterinario_id: vetId, productor_id: form.productor_id_v, fecha: form.fecha_v ?? new Date().toISOString().split("T")[0], tipo_servicio: form.tipo_servicio ?? "Sanidad animal", descripcion: form.descripcion_v ?? "", animales: form.animales_v ?? "", medicamentos: form.medicamentos_v ?? "", dosis: form.dosis_v ?? "", observaciones: form.obs_v ?? "", costo: Number(form.costo_v ?? 0) });
    m("✅ Visita registrada");
    await fetchAll(vetId); setShowFormVisita(false); setForm({});
  };

  const guardarCobranza = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("ing_cobranzas").insert({ ingeniero_id: vetId, productor_id: form.productor_id||null, concepto: form.concepto??"", monto: Number(form.monto??0), fecha: form.fecha??new Date().toISOString().split("T")[0], estado: form.estado??"pendiente", metodo_pago: form.metodo_pago??"" });
    await fetchAll(vetId); setShowForm(false); setForm({}); m("✅ Cobro registrado");
  };

  const marcarCobrado = async (id: string) => { const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); if(vetId)await fetchAll(vetId); };

  const guardarVehiculo = async () => {
    if (!vetId||!form.nombre?.trim()) return;
    const sb = await getSB();
    await sb.from("ing_vehiculos").insert({ ingeniero_id:vetId, nombre:form.nombre, marca:form.marca??"", modelo:form.modelo??"", anio:Number(form.anio??0), patente:form.patente??"", seguro_vencimiento:form.seguro_vencimiento||null, seguro_compania:form.seguro_compania??"", vtv_vencimiento:form.vtv_vencimiento||null, km_actuales:Number(form.km_actuales??0), proximo_service_km:Number(form.proximo_service_km??0) });
    await fetchAll(vetId); setShowForm(false); setForm({}); m("✅ Vehículo guardado");
  };

  const guardarService = async () => {
    if (!vehiculoSel||!vetId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculo_service").insert({ vehiculo_id:vehiculoSel.id, ingeniero_id:vetId, tipo:form.tipo_service??"service", descripcion:form.descripcion??"", costo:Number(form.costo??0), km:Number(form.km??0), fecha:form.fecha??new Date().toISOString().split("T")[0], taller:form.taller??"" });
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); m("✅ Service guardado");
  };

  const eliminar = async (tabla: string, id: string) => {
    if(!confirm("¿Eliminar?"))return;
    const sb=await getSB(); await sb.from(tabla).delete().eq("id",id);
    if(vetId)await fetchAll(vetId);
  };

  const exportarExcel = async (tipo: "productores"|"visitas") => {
    const XLSX = await import("xlsx");
    let data: any[] = [];
    if (tipo==="productores") data=productores.map(p=>({NOMBRE:p.nombre,TELEFONO:p.telefono,HA:p.hectareas_total,CABEZAS:p.cabezas_ganado,TIPO:p.tipo_produccion,HONORARIO:p.honorario_monto}));
    else data=visitas.map(v=>{const p=productores.find(x=>x.id===v.productor_id);return{PRODUCTOR:p?.nombre??"—",FECHA:v.fecha,SERVICIO:v.tipo_servicio,DESCRIPCION:v.descripcion,ANIMALES:v.animales,MEDICAMENTOS:v.medicamentos,COSTO:v.costo};});
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,tipo);XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const askAI = async () => {
    if(!aiInput.trim())return; const userMsg=aiInput.trim(); setAiInput(""); setAiLoading(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    try {
      const hist=aiChat.map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:`Veterinario experto ganadería Argentina. Respondé en español técnico. Vet: ${vetNombre}. Productores: ${productores.length}.`,messages:[...hist,{role:"user",content:userMsg}]})});
      const data=await res.json();
      setAiChat(prev=>[...prev,{rol:"assistant",texto:data.content?.[0]?.text??"Sin respuesta"}]);
    } catch { setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error de conexión"}]); }
    setAiLoading(false);
  };

  const escucharVoz = () => {
    if(!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)){alert("Usá Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";rec.continuous=false;
    recRef.current=rec;setVozEstado("escuchando");setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setVozEstado("procesando");setAiInput(t);setVozEstado("idle");};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);}; rec.start();
  };

  const totalHa = productores.reduce((a,p)=>a+p.hectareas_total,0);
  const totalCabezas = productores.reduce((a,p)=>a+p.cabezas_ganado,0);
  const totPend = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",background:"url('/FON.png') center/cover fixed",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,border:"3px solid #7c3aed",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#7c3aed",fontWeight:600,fontSize:14}}>Cargando...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes shine{0%{left:-50%}100%{left:120%}}
        @keyframes twinkle{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;}
        .card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.18),inset 0 2px 0 rgba(255,255,255,0.95);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);border-radius:20px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,transparent 100%);border-radius:20px 20px 0 0;pointer-events:none;z-index:1;}
        .card>*{position:relative;z-index:2;}
        .card-sm{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.13);position:relative;overflow:hidden;}
        .card-sm::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);border-radius:16px;pointer-events:none;z-index:0;}
        .card-sm>*{position:relative;z-index:2;}
        .topbar{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar>*{position:relative;z-index:1;}
        .nav-tab{padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s ease;white-space:nowrap;background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.92);color:#1e3a5f;box-shadow:0 3px 12px rgba(20,80,160,0.12);position:relative;}
        .nav-tab::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.42);border-radius:12px;pointer-events:none;z-index:0;}
        .nav-tab>*,.nav-tab span{position:relative;z-index:1;}
        .nav-tab.active{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.45);color:white!important;font-weight:800;box-shadow:0 5px 18px rgba(25,118,210,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);}
        .nav-tab.active::before{display:none;}
        .abtn{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.92);border-top:2px solid rgba(255,255,255,1);border-radius:16px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 4px 16px rgba(20,80,160,0.13);transition:all 0.18s;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 16px;position:relative;overflow:hidden;}
        .abtn::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);border-radius:16px;pointer-events:none;z-index:0;}
        .abtn>*{position:relative;z-index:2;}
        .abtn:hover{transform:translateY(-2px);}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 18px rgba(25,118,210,0.45);transition:all 0.18s;padding:10px 18px;text-shadow:0 1px 3px rgba(0,40,120,0.35);}
        .bbtn:hover{transform:translateY(-2px);filter:brightness(1.08);}
        .kpi{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.13);padding:14px;text-align:center;position:relative;overflow:hidden;}
        .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);border-radius:16px;pointer-events:none;}
        .kpi>*{position:relative;}
        .fade-in{animation:fadeIn 0.22s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* Estrellas */}
      {[[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],[15,70,4,3.2,0.3],[50,55,3,4.5,1.5]].map(([x,y,r,d,delay],i)=>(
        <div key={i} style={{position:"fixed",borderRadius:"50%",background:"white",pointerEvents:"none",left:x+"%",top:y+"%",width:r+"px",height:r+"px",opacity:0.35,["--d" as any]:d+"s",["--delay" as any]:delay+"s",animation:`twinkle ${d}s ${delay}s ease-in-out infinite`}}/>
      ))}

      {/* TOPBAR */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",borderRadius:5,padding:"2px 8px",color:"white",letterSpacing:0.8,border:"1px solid rgba(100,180,255,0.45)"}}>PRO</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",marginTop:1,fontWeight:600}}>Gestión inteligente. Decisiones que rinden.</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>{vetNombre}</div>
              <div style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>🩺 Veterinario · {vetData.codigo}</div>
            </div>
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",border:"2px solid rgba(255,255,255,0.90)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"white",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
              {vetNombre.charAt(0)||"V"}
            </div>
            <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
              style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",background:VOZ_COLOR[vozEstado]+"18",border:`1.5px solid ${VOZ_COLOR[vozEstado]}50`,color:VOZ_COLOR[vozEstado]}}>
              {VOZ_ICON[vozEstado]}
            </button>
            <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>
        {/* NAV */}
        <div style={{display:"flex",gap:6,padding:"0 12px 10px",overflowX:"auto",scrollbarWidth:"none",justifyContent:"center"}}>
          {NAV.map(item=>(
            <button key={item.k} onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}} className={`nav-tab${seccion===item.k?" active":""}`}>
              <span>{item.icon}</span> <span>{item.label}</span>
              {seccion===item.k&&<span style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.8)",display:"inline-block",marginLeft:2}}/>}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:540,margin:"0 auto",padding:"14px 14px 100px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msj&&<div className="fade-in card-sm" style={{marginBottom:12,padding:"10px 14px",fontSize:13,fontWeight:600,color:msj.startsWith("✅")?"#16a34a":"#dc2626",background:msj.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msj.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msj}<button onClick={()=>setMsj("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* ══ PRODUCTORES ══ */}
        {seccion==="productores"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{l:"Productores",v:productores.length,icon:"👨‍🌾",color:"#1976d2"},{l:"Hectáreas",v:totalHa.toLocaleString("es-AR")+" ha",icon:"🌿",color:"#2e7d32"},{l:"Cabezas",v:totalCabezas.toLocaleString("es-AR"),icon:"🐄",color:"#7c3aed"},{l:"Con App",v:productores.filter(p=>p.tiene_cuenta).length,icon:"📱",color:"#d97706"}].map(s=>(
                <div key={s.l} className="kpi">
                  <div style={{fontSize:20,marginBottom:3}}>{s.icon}</div>
                  <div style={{fontSize:24,fontWeight:800,color:s.color,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:11,color:"#6b8aaa",marginTop:3,fontWeight:600}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button className="abtn" onClick={()=>{setShowForm(!showForm);setEditandoProductor(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}}>
                <span style={{fontSize:16}}>➕</span><span>Nuevo</span>
              </button>
              <button className="abtn" onClick={()=>{setShowFormVincular(!showFormVincular);setForm({});}}>
                <span style={{fontSize:16}}>🔗</span><span>Vincular</span>
              </button>
              <button className="abtn" onClick={()=>{setShowFormVisita(!showFormVisita);setForm({fecha_v:new Date().toISOString().split("T")[0]});}}>
                <span style={{fontSize:16}}>📋</span><span>+ Visita</span>
              </button>
              <button className="abtn" onClick={()=>exportarExcel("productores")}>
                <span style={{fontSize:16}}>📤</span><span>Exportar</span>
              </button>
            </div>

            {/* Vincular por código */}
            {showFormVincular&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>🔗 Vincular por código</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Código Productor *</label><input type="text" value={form.codigo_productor??""} onChange={e=>setForm({...form,codigo_productor:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="10001"/></div>
                  <div><label className={lCls}>Honorario tipo</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}><option value="mensual">Mensual</option><option value="por_cabeza">Por cabeza</option><option value="por_servicio">Por servicio</option><option value="otro">Otro</option></select></div>
                  <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={vincularPorCodigo} className="bbtn">Vincular</button>
                  <button onClick={()=>{setShowFormVincular(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Form visita */}
            {showFormVisita&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>📋 Registrar visita veterinaria</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Productor</label><select value={form.productor_id_v??""} onChange={e=>setForm({...form,productor_id_v:e.target.value})} className="sel" style={{width:"100%"}}><option value="">Seleccionar...</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_v??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo servicio</label><select value={form.tipo_servicio??"Sanidad animal"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className="sel" style={{width:"100%"}}>{TIPOS_SERVICIO_VET.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>Costo $</label><input type="number" value={form.costo_v??""} onChange={e=>setForm({...form,costo_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Descripción / Diagnóstico</label><input type="text" value={form.descripcion_v??""} onChange={e=>setForm({...form,descripcion_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Animales tratados</label><input type="text" value={form.animales_v??""} onChange={e=>setForm({...form,animales_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="50 bovinos, lote A"/></div>
                  <div><label className={lCls}>Medicamentos</label><input type="text" value={form.medicamentos_v??""} onChange={e=>setForm({...form,medicamentos_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Dosis / Aplicación</label><input type="text" value={form.dosis_v??""} onChange={e=>setForm({...form,dosis_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Observaciones</label><input type="text" value={form.obs_v??""} onChange={e=>setForm({...form,obs_v:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarVisita} className="bbtn">✓ Guardar visita</button>
                  <button onClick={()=>{setShowFormVisita(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Form productor */}
            {showForm&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>{editandoProductor?"✏️ Editar":"➕"} Productor</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {[["nombre","Nombre *","","text"],["telefono","Teléfono","3400...","text"],["email","Email (app)","","email"],["localidad","Localidad","","text"],["hectareas_total","Hectáreas","0","number"],["cabezas_ganado","Cabezas ganado","0","number"],["honorario_monto","Honorario $","0","number"]].map(([k,l,ph,t])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type={t} value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph}/></div>
                  ))}
                  <div><label className={lCls}>Tipo producción</label>
                    <select value={form.tipo_produccion??""} onChange={e=>setForm({...form,tipo_produccion:e.target.value})} className="sel" style={{width:"100%"}}>
                      {["","Cría","Invernada","Tambo","Feedlot","Mixto","Porcinos","Ovinos","Otro"].map(o=><option key={o} value={o}>{o||"—"}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Honorario tipo</label>
                    <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}>
                      {["mensual","por_cabeza","por_servicio","otro"].map(o=><option key={o} value={o}>{o.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1/-1"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarProductor} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setEditandoProductor(null);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0
              ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🩺</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin productores — agregá el primero</p></div>
              :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                {productores.map(p=>(
                  <div key={p.id} className="card" style={{padding:14}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                      <div style={{width:42,height:42,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",border:"2px solid rgba(180,220,255,0.80)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"white",flexShrink:0,textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
                        {p.nombre.charAt(0)}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>{p.nombre}</div>
                        <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600,marginTop:2}}>📍 {p.localidad}{p.provincia?", "+p.provincia:""}</div>
                        {p.tipo_produccion&&<div style={{fontSize:11,color:"#7c3aed",fontWeight:600,marginTop:1}}>🐄 {p.tipo_produccion}</div>}
                        {p.tiene_cuenta&&<span style={{fontSize:10,color:"#16a34a",fontWeight:700,background:"rgba(22,163,74,0.10)",padding:"1px 7px",borderRadius:5,display:"inline-block",marginTop:2}}>✓ Usa la app</span>}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>{setEditandoProductor(p.id);setForm({nombre:p.nombre,telefono:p.telefono,email:p.email,localidad:p.localidad,provincia:p.provincia,hectareas_total:String(p.hectareas_total),cabezas_ganado:String(p.cabezas_ganado),tipo_produccion:p.tipo_produccion,honorario_tipo:p.honorario_tipo,honorario_monto:String(p.honorario_monto),observaciones:p.observaciones});setShowForm(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:14,padding:"4px"}}>✏️</button>
                        <button onClick={()=>eliminarProductor(p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:18,padding:"4px"}}>✕</button>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                      {[{l:"Hectáreas",v:p.hectareas_total.toLocaleString(),c:"#2e7d32"},{l:"Cabezas",v:p.cabezas_ganado.toLocaleString(),c:"#7c3aed"},{l:"Honorario",v:"$"+p.honorario_monto.toLocaleString("es-AR"),c:"#1565c0"}].map(s=>(
                        <div key={s.l} className="kpi" style={{padding:"8px 10px"}}>
                          <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                          <div style={{fontSize:15,fontWeight:800,color:s.c,marginTop:2}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                    {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px",borderRadius:12,background:"rgba(37,211,102,0.10)",border:"1px solid rgba(37,211,102,0.25)",color:"#16a34a",fontSize:13,fontWeight:700,textDecoration:"none"}}>💬 WhatsApp</a>}
                    {p.observaciones&&<div style={{marginTop:8,fontSize:11,color:"#6b8aaa",borderTop:"1px solid rgba(0,60,140,0.07)",paddingTop:8}}>{p.observaciones}</div>}
                  </div>
                ))}
                {/* Historial visitas */}
                {visitas.length>0&&(
                  <div className="card" style={{padding:0,overflow:"hidden"}}>
                    <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>📋 Historial de Visitas</span>
                      <button onClick={()=>exportarExcel("visitas")} style={{fontSize:11,padding:"4px 10px",borderRadius:8,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.20)",color:"#16a34a",cursor:"pointer",fontWeight:700}}>📤 Exportar</button>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:500}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.07)"}}>{["Fecha","Productor","Servicio","Descripción","Animales","Medicamentos","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {visitas.slice(0,15).map(v=>{const p=productores.find(x=>x.id===v.productor_id);return(
                            <tr key={v.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                              <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{v.fecha}</td>
                              <td style={{padding:"8px 12px",fontWeight:700,color:"#0d2137",fontSize:12}}>{p?.nombre??"—"}</td>
                              <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(124,58,237,0.10)",color:"#7c3aed",fontWeight:700}}>{v.tipo_servicio}</span></td>
                              <td style={{padding:"8px 12px",color:"#4a6a8a",fontSize:11}}>{v.descripcion}</td>
                              <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{v.animales||"—"}</td>
                              <td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{v.medicamentos||"—"}</td>
                              <td style={{padding:"8px 12px",fontWeight:700,color:"#dc2626",fontSize:12}}>{v.costo?"$"+Number(v.costo).toLocaleString("es-AR"):"—"}</td>
                              <td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("vet_visitas",v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td>
                            </tr>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        )}

        {/* ══ COBRANZA ══ */}
        {seccion==="cobranza"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>Cobranza</h2>
                <div style={{display:"flex",gap:14,marginTop:4}}>
                  <span style={{fontSize:12,color:"#dc2626",fontWeight:600}}>Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span>
                  <span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha:new Date().toISOString().split("T")[0]});}} className="bbtn">+ Nuevo cobro</button>
            </div>

            {showForm&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>+ Registrar cobro</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Productor</label><select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className="sel" style={{width:"100%"}}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Sanidad enero"/></div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className="sel" style={{width:"100%"}}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                  <div><label className={lCls}>Método</label><select value={form.metodo_pago??""} onChange={e=>setForm({...form,metodo_pago:e.target.value})} className="sel" style={{width:"100%"}}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCobranza} className="bbtn">✓ Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {cobranzas.length===0
              ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:40,opacity:0.12,marginBottom:12}}>💰</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin cobros registrados</p></div>
              :<div className="card" style={{padding:0,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Fecha","Productor","Concepto","Monto","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                      <tr key={c.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                        <td style={{padding:"9px 12px",color:"#6b8aaa",fontSize:11}}>{c.fecha}</td>
                        <td style={{padding:"9px 12px",fontWeight:600,color:"#0d2137"}}>{p?.nombre??"—"}</td>
                        <td style={{padding:"9px 12px",color:"#4a6a8a"}}>{c.concepto}</td>
                        <td style={{padding:"9px 12px",fontWeight:700,color:"#d97706"}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:c.estado==="cobrado"?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:c.estado==="cobrado"?"#16a34a":"#dc2626"}}>{c.estado}</span></td>
                        <td style={{padding:"9px 12px",display:"flex",gap:6}}>
                          {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} style={{fontSize:11,color:"#16a34a",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>✓</button>}
                          <button onClick={()=>eliminar("ing_cobranzas",c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}

        {/* ══ VEHÍCULO ══ */}
        {seccion==="vehiculo"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>Vehículo</h2>
              {!vehiculoSel
                ?<button onClick={()=>{setShowForm(true);setForm({});}} className="bbtn">+ Agregar</button>
                :<div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="abtn" style={{padding:"8px 14px",fontSize:12}}>+ Service</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="abtn" style={{padding:"8px 14px",fontSize:12}}>← Volver</button>
                </div>
              }
            </div>
            {showForm&&!vehiculoSel&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>+ Nuevo vehículo</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seguro_compania","Compañía seguro","","text"],["seguro_vencimiento","Venc. seguro","","date"],["vtv_vencimiento","Venc. VTV","","date"],["km_actuales","Km actuales","","number"],["proximo_service_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type={t} value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph}/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarVehiculo} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0
                ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🚗</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin vehículos</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {vehiculos.map(v=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                    <div key={v.id} className="card" style={{padding:14,cursor:"pointer"}} onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                        <div style={{width:44,height:44,borderRadius:13,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚗</div>
                        <div style={{flex:1}}><div style={{fontWeight:700,color:"#0d2137",fontSize:15}}>{v.nombre}</div><div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                        <button onClick={e=>{e.stopPropagation();eliminar("ing_vehiculos",v.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:18}}>✕</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        <div className="kpi" style={{padding:"8px 10px"}}><div style={{fontSize:10,color:"#6b8aaa",marginBottom:2}}>Km actuales</div><div style={{fontSize:16,fontWeight:700,color:"#0D47A1"}}>{(v.km_actuales||0).toLocaleString()}</div></div>
                        <div className="kpi" style={{padding:"8px 10px",background:"rgba(251,191,36,0.08)"}}><div style={{fontSize:10,color:"#6b8aaa",marginBottom:2}}>Próx. service</div><div style={{fontSize:14,fontWeight:700,color:"#f57f17"}}>{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <span style={{flex:1,fontSize:11,padding:"6px 10px",borderRadius:9,fontWeight:700,textAlign:"center",background:sV?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.08)",color:sV?"#dc2626":"#16a34a",border:`1px solid ${sV?"rgba(220,38,38,0.18)":"rgba(22,163,74,0.18)"}`}}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span style={{flex:1,fontSize:11,padding:"6px 10px",borderRadius:9,fontWeight:700,textAlign:"center",background:vV?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.08)",color:vV?"#dc2626":"#16a34a",border:`1px solid ${vV?"rgba(220,38,38,0.18)":"rgba(22,163,74,0.18)"}`}}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                      </div>
                    </div>
                  );})}
                </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div className="card" style={{padding:14,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:13,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚗</div>
                  <div><div style={{fontWeight:700,color:"#0d2137"}}>{vehiculoSel.nombre}</div><div style={{fontSize:11,color:"#6b8aaa"}}>{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className="card fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0d2137",marginBottom:12}}>+ Service</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div><label className={lCls}>Tipo</label><select value={form.tipo_service??"service"} onChange={e=>setForm({...form,tipo_service:e.target.value})} className="sel" style={{width:"100%"}}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Km</label><input type="number" value={form.km??""} onChange={e=>setForm({...form,km:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Costo</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={guardarService} className="bbtn">Guardar</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="card" style={{overflow:"hidden",padding:0}}>
                  <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.07)",fontSize:13,fontWeight:700,color:"#0d2137"}}>🔧 Historial</div>
                  {servicios.length===0?<div style={{textAlign:"center",padding:"32px 20px",color:"#6b8aaa",fontSize:13}}>Sin historial</div>:(
                    <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:420}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.07)"}}>{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}><td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{s.fecha}</td><td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 7px",borderRadius:6,fontWeight:700,background:"rgba(251,191,36,0.12)",color:"#f57f17"}}>{s.tipo}</span></td><td style={{padding:"8px 12px",color:"#4a6a8a",fontSize:11}}>{s.descripcion}</td><td style={{padding:"8px 12px",color:"#6b8aaa",fontSize:11}}>{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td style={{padding:"8px 12px",fontWeight:700,color:"#dc2626",fontSize:12}}>${Number(s.costo).toLocaleString("es-AR")}</td><td style={{padding:"8px 12px"}}><button onClick={()=>eliminar("ing_vehiculo_service",s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button></td></tr>)}</tbody>
                    </table></div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ IA VET ══ */}
        {seccion==="ia_campo"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:"0 0 4px"}}>🤖 IA Vet — Asistente Veterinario</h2>
              <p style={{fontSize:12,color:"#6b8aaa",margin:0}}>Consultá sobre sanidad animal, vacunación, diagnóstico, recetas, reproducción</p>
            </div>
            {aiChat.length===0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {["Calendario sanitario bovinos","Protocolo vacunación terneros","Diagnóstico tristeza bovina","Manejo reproductivo rodeo"].map(q=>(
                  <button key={q} onClick={()=>setAiInput(q)} style={{textAlign:"left",fontSize:12,color:"#4a6a8a",padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.70)",border:"1.5px solid rgba(255,255,255,0.92)",cursor:"pointer",fontWeight:600}}>🩺 {q}</button>
                ))}
              </div>
            )}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#7c3aed",boxShadow:"0 0 6px rgba(124,58,237,0.6)"}}/>
                  <span style={{fontWeight:700,color:"#0d2137",fontSize:13}}>🩺 IA Veterinaria Activa</span>
                </div>
                {aiChat.length>0&&<button onClick={()=>setAiChat([])} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>Limpiar</button>}
              </div>
              <div style={{padding:12,display:"flex",flexDirection:"column",gap:8,maxHeight:380,overflowY:"auto"}}>
                {aiChat.length===0&&<div style={{textAlign:"center",padding:"28px 16px",color:"#6b8aaa"}}><div style={{fontSize:36,marginBottom:8}}>🐄</div><p style={{fontSize:12,lineHeight:1.5}}>Hacé tu consulta veterinaria</p></div>}
                {aiChat.map((msg,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:msg.rol==="user"?"flex-end":"flex-start"}}>
                    <div style={{maxWidth:"85%",padding:"9px 13px",borderRadius:14,fontSize:12,lineHeight:1.5,...(msg.rol==="user"?{background:"linear-gradient(145deg,#7c3aed,#6d28d9)",color:"white"}:{background:"rgba(240,248,255,0.90)",border:"1px solid rgba(25,118,210,0.12)",color:"#1a2a4a"})}}>
                      {msg.rol==="assistant"&&<div style={{fontSize:9,fontWeight:700,color:"#7c3aed",marginBottom:4,letterSpacing:1}}>◆ IA VETERINARIA</div>}
                      <p style={{margin:0,whiteSpace:"pre-wrap"}}>{msg.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoading&&<div style={{display:"flex"}}><div style={{background:"rgba(240,248,255,0.90)",border:"1px solid rgba(25,118,210,0.12)",padding:"9px 13px",borderRadius:14,display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"#c4b5fd",animation:`float 1s ${i*0.18}s ease-in-out infinite`}}/>)}</div></div>}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!SR){alert("Usá Chrome");return;}const rec=new SR();rec.lang="es-AR";setListening(true);rec.onresult=(e:any)=>{setAiInput(e.results[0][0].transcript);setListening(false);};rec.onerror=()=>setListening(false);rec.start();}}
                style={{padding:"10px 14px",borderRadius:12,fontSize:14,cursor:"pointer",background:listening?"rgba(220,38,38,0.10)":"rgba(255,255,255,0.70)",border:listening?"1.5px solid rgba(220,38,38,0.35)":"1.5px solid rgba(255,255,255,0.92)",color:listening?"#dc2626":"#4a6a8a"}}>
                🎤 {listening?"...":""}
              </button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta sobre sanidad, vacunación, diagnóstico..." className={iCls} style={{flex:1,padding:"10px 14px"}}/>
              <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} className="bbtn" style={{opacity:aiLoading||!aiInput.trim()?0.4:1}}>→</button>
            </div>
          </div>
        )}

        <div style={{height:90}}/>
      </div>

      {/* Panel voz */}
      {vozPanel&&(
        <div style={{position:"fixed",bottom:20,right:80,zIndex:50,width:272,borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,0.90)",backdropFilter:"blur(16px)",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:7,height:7,borderRadius:"50%",background:VOZ_COLOR[vozEstado]}}/><span style={{color:"#0d2137",fontSize:12,fontWeight:700}}>🎤 Asistente Vet</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:"8px 10px 10px",display:"flex",gap:7}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setAiInput(vozInput);setVozInput("");setVozPanel(false);setSeccion("ia_campo");}}} placeholder="Escribí..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={escucharVoz} style={{padding:"7px 11px",borderRadius:11,fontSize:14,background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}40`,color:VOZ_COLOR[vozEstado],cursor:"pointer"}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* Botón voz flotante */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",color:"white",border:"2px solid rgba(180,220,255,0.70)",boxShadow:"0 4px 22px rgba(33,150,243,0.55)",animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",transition:"all 0.2s ease",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      {vetId&&<EscanerIA empresaId={vetId}/>}
    </div>
  );
}

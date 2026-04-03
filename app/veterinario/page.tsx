"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Seccion = "perfil" | "productores" | "cobranza" | "vehiculo" | "ia_campo";

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
type Cobranza = {
  id: string; productor_id: string; concepto: string;
  monto: number; fecha: string; estado: string; metodo_pago: string;
};
type Vehiculo = {
  id: string; nombre: string; marca: string; modelo: string;
  anio: number; patente: string; seguro_vencimiento: string;
  seguro_compania: string; vtv_vencimiento: string;
  km_actuales: number; proximo_service_km: number;
};
type ServiceVehiculo = { id: string; tipo: string; descripcion: string; costo: number; km: number; fecha: string; taller: string; };
type MensajeIA = { rol: "user"|"assistant"; texto: string };
type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

const TIPOS_SERVICIO_VET = ["Receta veterinaria","Sanidad animal","Vacunacion","Diagnostico","Cirugia","Castracion","Analisis laboratorio","Asesoramiento reproductivo","Control hacienda","Aplicacion","Otro"];

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
  const [msgExito, setMsgExito] = useState("");
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozTranscripcion, setVozTranscripcion] = useState("");
  const [vozRespuesta, setVozRespuesta] = useState("");
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
    calcularAlertas(vehs ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[]) => {
    const alerts: {msg:string;urgencia:string}[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const d = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (d < 0) alerts.push({ msg: v.nombre+": Seguro VENCIDO", urgencia:"alta" });
        else if (d <= 30) alerts.push({ msg: v.nombre+": Seguro vence en "+Math.round(d)+" dias", urgencia: d<=7?"alta":"media" });
      }
      if (v.vtv_vencimiento) {
        const d = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (d < 0) alerts.push({ msg: v.nombre+": VTV VENCIDA", urgencia:"alta" });
        else if (d <= 30) alerts.push({ msg: v.nombre+": VTV vence en "+Math.round(d)+" dias", urgencia: d<=7?"alta":"media" });
      }
    });
    setAlertas(alerts);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const guardarPerfil = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("usuarios").update({
      nombre: form.nombre ?? vetData.nombre,
      telefono: form.telefono ?? vetData.telefono ?? "",
      matricula: form.matricula ?? vetData.matricula ?? "",
      especialidad: form.especialidad ?? vetData.especialidad ?? "",
      cuit: form.cuit ?? vetData.cuit ?? "",
      localidad: form.localidad ?? vetData.localidad ?? "",
      provincia: form.provincia ?? vetData.provincia ?? "",
      direccion: form.direccion ?? vetData.direccion ?? "",
    }).eq("id", vetId);
    msg("✅ PERFIL GUARDADO");
    const sb2 = await getSB();
    const { data: updated } = await sb2.from("usuarios").select("*").eq("id", vetId).single();
    if (updated) setVetData(updated);
  };

  const guardarProductor = async () => {
    if (!vetId || !form.nombre?.trim()) { msg("❌ INGRESA EL NOMBRE"); return; }
    const sb = await getSB();
    let empresa_id = null; let tiene_cuenta = false;
    if (form.email?.trim()) {
      const { data: usuario } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (usuario) {
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", usuario.id).single();
        if (emp) { empresa_id = emp.id; tiene_cuenta = true; }
      }
    }
    const payload = {
      veterinario_id: vetId, nombre: form.nombre.trim(),
      telefono: form.telefono ?? "", email: form.email ?? "",
      localidad: form.localidad ?? "", provincia: form.provincia ?? "Santa Fe",
      hectareas_total: Number(form.hectareas_total ?? 0),
      cabezas_ganado: Number(form.cabezas_ganado ?? 0),
      tipo_produccion: form.tipo_produccion ?? "",
      observaciones: form.observaciones ?? "",
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
      empresa_id, tiene_cuenta, activo: true,
    };
    if (editandoProductor) {
      await sb.from("vet_productores").update(payload).eq("id", editandoProductor);
      setEditandoProductor(null);
    } else {
      await sb.from("vet_productores").insert(payload);
    }
    msg(tiene_cuenta ? "✅ GUARDADO — VINCULADO A APP" : "✅ PRODUCTOR GUARDADO");
    await fetchAll(vetId); setShowForm(false); setForm({});
  };

  const vincularPorCodigo = async () => {
    if (!vetId || !form.codigo_productor?.trim()) { msg("❌ INGRESA EL CODIGO"); return; }
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("id,nombre").eq("codigo", form.codigo_productor.trim()).eq("rol","productor").single();
    if (!u) { msg("❌ NO SE ENCONTRO PRODUCTOR CON ESE CODIGO"); return; }
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    const empresa_id = emp?.id ?? null;
    const { data: existe } = await sb.from("vet_productores").select("id").eq("veterinario_id", vetId).eq("nombre", u.nombre).single();
    if (existe) { msg("❌ YA ESTA EN TU LISTA"); return; }
    await sb.from("vet_productores").insert({
      veterinario_id: vetId, nombre: u.nombre, empresa_id,
      tiene_cuenta: true, honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0), activo: true,
    });
    if (empresa_id) {
      const { data: vincExiste } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", vetId).eq("empresa_id", empresa_id).single();
      if (!vincExiste) await sb.from("vinculaciones").insert({ ingeniero_id: vetId, empresa_id, activa: true, honorario_tipo: form.honorario_tipo ?? "mensual", honorario_monto: Number(form.honorario_monto ?? 0) });
    }
    msg("✅ PRODUCTOR " + u.nombre + " VINCULADO");
    await fetchAll(vetId); setShowFormVincular(false); setForm({});
  };

  const eliminarProductor = async (id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from("vet_productores").update({ activo: false }).eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarVisita = async () => {
    if (!vetId || !form.productor_id_v) { msg("❌ SELECCIONA PRODUCTOR"); return; }
    const sb = await getSB();
    await sb.from("vet_visitas").insert({
      veterinario_id: vetId, productor_id: form.productor_id_v,
      fecha: form.fecha_v ?? new Date().toISOString().split("T")[0],
      tipo_servicio: form.tipo_servicio ?? "Sanidad animal",
      descripcion: form.descripcion_v ?? "",
      animales: form.animales_v ?? "", medicamentos: form.medicamentos_v ?? "",
      dosis: form.dosis_v ?? "", observaciones: form.obs_v ?? "",
      costo: Number(form.costo_v ?? 0),
    });
    msg("✅ VISITA REGISTRADA");
    await fetchAll(vetId); setShowFormVisita(false); setForm({});
  };

  const exportarExcel = async (tipo: "productores"|"visitas") => {
    const XLSX = await import("xlsx");
    let data: any[] = [];
    if (tipo === "productores") {
      data = productores.map(p => ({ NOMBRE:p.nombre, TELEFONO:p.telefono, EMAIL:p.email, LOCALIDAD:p.localidad, HA:p.hectareas_total, CABEZAS:p.cabezas_ganado, TIPO_PRODUCCION:p.tipo_produccion, HONORARIO_TIPO:p.honorario_tipo, HONORARIO_MONTO:p.honorario_monto, TIENE_CUENTA_APP:p.tiene_cuenta?"SI":"NO" }));
    } else {
      data = visitas.map(v => { const p = productores.find(x=>x.id===v.productor_id); return { PRODUCTOR:p?.nombre??"—", FECHA:v.fecha, SERVICIO:v.tipo_servicio, DESCRIPCION:v.descripcion, ANIMALES:v.animales, MEDICAMENTOS:v.medicamentos, DOSIS:v.dosis, COSTO:v.costo }; });
    }
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Array(10).fill({ wch:18 });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, tipo);
    XLSX.writeFile(wb, tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const guardarCobranza = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("ing_cobranzas").insert({ ingeniero_id:vetId, productor_id:form.productor_id??null, concepto:form.concepto??"", monto:Number(form.monto??0), fecha:form.fecha??new Date().toISOString().split("T")[0], estado:form.estado??"pendiente", metodo_pago:form.metodo_pago??"" });
    await fetchAll(vetId); setShowForm(false); setForm({}); msg("✅ COBRO REGISTRADO");
  };
  const marcarCobrado = async (id: string) => { const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); if(vetId)await fetchAll(vetId); };
  const guardarVehiculo = async () => {
    if (!vetId||!form.nombre?.trim()) return;
    const sb = await getSB();
    await sb.from("ing_vehiculos").insert({ ingeniero_id:vetId, nombre:form.nombre, marca:form.marca??"", modelo:form.modelo??"", año:Number(form.anio??0), patente:form.patente??"", seguro_vencimiento:form.seguro_vencimiento||null, seguro_compania:form.seguro_compania??"", vtv_vencimiento:form.vtv_vencimiento||null, km_actuales:Number(form.km_actuales??0), proximo_service_km:Number(form.proximo_service_km??0) });
    await fetchAll(vetId); setShowForm(false); setForm({}); msg("✅ VEHICULO GUARDADO");
  };
  const guardarService = async () => {
    if (!vehiculoSel||!vetId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculo_service").insert({ vehiculo_id:vehiculoSel.id, ingeniero_id:vetId, tipo:form.tipo_service??"service", descripcion:form.descripcion??"", costo:Number(form.costo??0), km:Number(form.km??0), fecha:form.fecha??new Date().toISOString().split("T")[0], taller:form.taller??"" });
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});setServicios(data??[]);setShowForm(false);setForm({});msg("✅ SERVICE GUARDADO");
  };
  const eliminar = async (tabla: string, id: string) => { if(!confirm("Eliminar?"))return; const sb=await getSB(); await sb.from(tabla).delete().eq("id",id); if(vetId)await fetchAll(vetId); };

  const hablar = useCallback((texto: string) => {
    if (typeof window==="undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto); utt.lang="es-AR"; utt.rate=1.05;
    const v = window.speechSynthesis.getVoices().find(x=>x.lang.startsWith("es")); if(v)utt.voice=v;
    utt.onstart=()=>setVozEstado("respondiendo"); utt.onend=()=>setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const resumen = productores.slice(0,5).map(p=>p.nombre+" ("+p.cabezas_ganado+" cab)").join("; ");
    try {
      const res = await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:"Asistente veterinario. Productores: "+resumen+". Usuario: \""+texto+"\". JSON sin markdown: {\"texto\":\"respuesta\",\"accion\":\"consulta|crear_productor\",\"datos\":{}}"}]})});
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text??"{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto??""); hablar(parsed.texto??"");
      setVozEstado("respondiendo");
    } catch { const e="No pude interpretar."; setVozRespuesta(e); hablar(e); setVozEstado("error"); setTimeout(()=>setVozEstado("idle"),2000); }
  }, [productores, hablar]);

  const escucharVoz = () => {
    const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window; if(!hasSR){alert("Usa Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";rec.continuous=false;
    recRef.current=rec;setVozEstado("escuchando");setVozRespuesta("");setVozPanel(true);
    rec.onresult=(e: any)=>{const t=e.results[0][0].transcript;setVozTranscripcion(t);interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);}; rec.start();
  };

  const askAI = async () => {
    if(!aiInput.trim())return; const userMsg=aiInput.trim(); setAiInput(""); setAiLoading(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    try {
      const hist=aiChat.map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:"Sos un veterinario experto para ganaderia en Argentina. Respondé en español tecnico. Ayuda con sanidad animal, vacunacion, diagnostico, recetas, reproduccion, manejo de rodeos. Veterinario: "+vetNombre+". Productores: "+productores.length+".",messages:[...hist,{role:"user",content:userMsg}]})});
      const data=await res.json();
      setAiChat(prev=>[...prev,{rol:"assistant",texto:data.content?.[0]?.text??"Sin respuesta"}]);
    } catch { setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error IA"}]); }
    setAiLoading(false);
  };

  const startVoiceIA = () => {
    const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window; if(!hasSR){alert("Usa Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";setListening(true);
    rec.onresult=(e: any)=>{setAiInput(e.results[0][0].transcript);setListening(false);}; rec.onerror=()=>setListening(false); rec.onend=()=>setListening(false); rec.start();
  };

  const VOZ_COLOR: Record<string,string>={idle:"#A78BFA",escuchando:"#F87171",procesando:"#C9A227",respondiendo:"#60A5FA",error:"#F87171"};
  const VOZ_ICON: Record<string,string>={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};
  const iCls="w-full bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#A78BFA] font-mono transition-all";
  const lCls="block text-xs text-[#5B4B6B] uppercase tracking-widest mb-1 font-mono";
  const totalHa=productores.reduce((a,p)=>a+p.hectareas_total,0);
  const totalCabezas=productores.reduce((a,p)=>a+p.cabezas_ganado,0);
  const totalPendiente=cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totalCobrado=cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);

  const SECCIONES=[
    {key:"perfil" as Seccion,label:"MI PERFIL",icon:"🩺"},
    {key:"productores" as Seccion,label:"MIS PRODUCTORES",icon:"👨‍🌾"},
    {key:"cobranza" as Seccion,label:"COBRANZA",icon:"💰"},
    {key:"vehiculo" as Seccion,label:"MI VEHICULO",icon:"🚗"},
    {key:"ia_campo" as Seccion,label:"IA VET",icon:"🤖"},
  ];

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#A78BFA] font-mono animate-pulse">CARGANDO...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .card-vet{background:rgba(10,22,40,0.85);border:1px solid rgba(167,139,250,0.15);border-radius:12px;transition:all 0.2s}
        .card-vet:hover{border-color:rgba(167,139,250,0.4);transform:translateY(-2px)}
        .sec-active-vet{border-color:#A78BFA!important;color:#A78BFA!important;background:rgba(167,139,250,0.08)!important}
      `}</style>
      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(167,139,250,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10 bg-[#020810]/95 border-b border-[#A78BFA]/20 px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="" width={100} height={36} className="object-contain cursor-pointer" onClick={()=>window.location.href="/veterinario"}/>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold">{vetNombre}</div>
          <div className="text-xs text-[#A78BFA] font-mono">VETERINARIO · COD {vetData.codigo}</div>
        </div>
        {alertas.length > 0 && <div className="w-7 h-7 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center"><span className="text-[#F87171] text-xs font-bold">{alertas.length}</span></div>}
        <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-sm font-bold"
          style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
          {VOZ_ICON[vozEstado]} VOZ
        </button>
        <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL VETERINARIO</h1>
          <p className="text-[#A78BFA] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTORES · {totalHa.toLocaleString("es-AR")} HA · {totalCabezas.toLocaleString("es-AR")} CABEZAS</p>
        </div>

        {alertas.length > 0 && <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-5"><div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse"/><span className="text-[#F87171] text-xs font-mono font-bold">ALERTAS ({alertas.length})</span></div><div className="flex flex-wrap gap-2">{alertas.map((a,i)=><div key={i} className={"px-3 py-1.5 rounded-lg text-xs font-mono border "+(a.urgencia==="alta"?"border-[#F87171]/30 text-[#F87171]":"border-[#C9A227]/30 text-[#C9A227]")}>{a.urgencia==="alta"?"🔴":"🟡"} {a.msg}</div>)}</div></div>}
        {msgExito && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        <div className="flex gap-2 mb-6 flex-wrap">
          {SECCIONES.map(s=><button key={s.key} onClick={()=>{setSeccion(s.key);setShowForm(false);setForm({});setVehiculoSel(null);}} className={"px-5 py-2.5 rounded-xl border text-sm font-mono transition-all font-bold "+(seccion===s.key?"sec-active-vet":"border-[#A78BFA]/15 text-[#4B5563] hover:text-[#9CA3AF]")}>{s.icon} {s.label}</button>)}
        </div>

        {/* PERFIL */}
        {seccion==="perfil" && (
          <div className="card-vet p-6">
            <h2 className="text-[#A78BFA] font-mono text-sm font-bold mb-5">🩺 MIS DATOS PROFESIONALES</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className={lCls}>NOMBRE COMPLETO</label><input type="text" defaultValue={vetData.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>TELEFONO / WA</label><input type="text" defaultValue={vetData.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
              <div><label className={lCls}>MATRICULA / COLEGIO</label><input type="text" defaultValue={vetData.matricula??""} onChange={e=>setForm({...form,matricula:e.target.value})} className={iCls} placeholder="MAT 1234"/></div>
              <div><label className={lCls}>ESPECIALIDAD</label><input type="text" defaultValue={vetData.especialidad??""} onChange={e=>setForm({...form,especialidad:e.target.value})} className={iCls} placeholder="Bovinos, porcinos..."/></div>
              <div><label className={lCls}>CUIT</label><input type="text" defaultValue={vetData.cuit??""} onChange={e=>setForm({...form,cuit:e.target.value})} className={iCls} placeholder="20-12345678-9"/></div>
              <div><label className={lCls}>LOCALIDAD</label><input type="text" defaultValue={vetData.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>PROVINCIA</label><input type="text" defaultValue={vetData.provincia??"Santa Fe"} onChange={e=>setForm({...form,provincia:e.target.value})} className={iCls}/></div>
              <div className="md:col-span-2"><label className={lCls}>DIRECCION</label><input type="text" defaultValue={vetData.direccion??""} onChange={e=>setForm({...form,direccion:e.target.value})} className={iCls}/></div>
            </div>
            <div className="mt-4 p-4 bg-[#020810]/40 rounded-xl border border-[#A78BFA]/15">
              <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                <div className="text-center"><div className="text-[#4B5563]">CODIGO</div><div className="text-[#A78BFA] font-bold text-lg mt-1">{vetData.codigo}</div></div>
                <div className="text-center"><div className="text-[#4B5563]">EMAIL</div><div className="text-[#E5E7EB] mt-1">{vetData.email}</div></div>
                <div className="text-center"><div className="text-[#4B5563]">ROL</div><div className="text-[#A78BFA] font-bold mt-1">VETERINARIO</div></div>
              </div>
            </div>
            <button onClick={guardarPerfil} className="mt-4 bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#A78BFA]/20">▶ GUARDAR PERFIL</button>
          </div>
        )}

        {/* MIS PRODUCTORES */}
        {seccion==="productores" && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[{l:"PRODUCTORES",v:String(productores.length),c:"#E5E7EB"},{l:"HA TOTALES",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"CABEZAS",v:totalCabezas.toLocaleString("es-AR"),c:"#A78BFA"},{l:"CON APP",v:String(productores.filter(p=>p.tiene_cuenta).length),c:"#4ADE80"}].map(s=>(
                <div key={s.l} className="card-vet p-4 text-center"><div className="text-xs text-[#4B5563] font-mono">{s.l}</div><div className="text-xl font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div></div>
              ))}
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={()=>{setShowForm(!showForm);setEditandoProductor(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}} className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm font-bold hover:bg-[#A78BFA]/20">+ NUEVO PRODUCTOR</button>
              <button onClick={()=>{setShowFormVincular(!showFormVincular);setForm({});}} className="px-4 py-2 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm font-bold hover:bg-[#60A5FA]/20">🔗 VINCULAR POR CODIGO</button>
              <button onClick={()=>{setShowFormVisita(!showFormVisita);setForm({fecha_v:new Date().toISOString().split("T")[0]});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">+ REGISTRAR VISITA</button>
              <button onClick={()=>exportarExcel("productores")} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/10">📤 EXPORTAR</button>
            </div>

            {/* Vincular por código */}
            {showFormVincular && (
              <div className="card-vet p-5 mb-4">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-3">🔗 VINCULAR PRODUCTOR POR CODIGO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>CODIGO PRODUCTOR *</label><input type="text" value={form.codigo_productor??""} onChange={e=>setForm({...form,codigo_productor:e.target.value})} className={iCls} placeholder="10001"/></div>
                  <div><label className={lCls}>HONORARIO TIPO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_cabeza">Por cabeza</option><option value="por_servicio">Por servicio</option><option value="otro">Otro</option></select></div>
                  <div><label className={lCls}>MONTO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={vincularPorCodigo} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#60A5FA]/20">▶ VINCULAR</button>
                  <button onClick={()=>{setShowFormVincular(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Form visita veterinaria */}
            {showFormVisita && (
              <div className="card-vet p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR VISITA VETERINARIA</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>PRODUCTOR</label><select value={form.productor_id_v??""} onChange={e=>setForm({...form,productor_id_v:e.target.value})} className={iCls}><option value="">Seleccionar</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_v??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_v:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TIPO SERVICIO</label><select value={form.tipo_servicio??"Sanidad animal"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className={iCls}>{TIPOS_SERVICIO_VET.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                  <div><label className={lCls}>COSTO $</label><input type="number" value={form.costo_v??""} onChange={e=>setForm({...form,costo_v:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>DESCRIPCION / DIAGNOSTICO</label><input type="text" value={form.descripcion_v??""} onChange={e=>setForm({...form,descripcion_v:e.target.value})} className={iCls} placeholder="Descripcion del servicio..."/></div>
                  <div><label className={lCls}>ANIMALES TRATADOS</label><input type="text" value={form.animales_v??""} onChange={e=>setForm({...form,animales_v:e.target.value})} className={iCls} placeholder="50 bovinos, lote A"/></div>
                  <div><label className={lCls}>MEDICAMENTOS</label><input type="text" value={form.medicamentos_v??""} onChange={e=>setForm({...form,medicamentos_v:e.target.value})} className={iCls} placeholder="Ivermectina, Vitamina AD3E"/></div>
                  <div><label className={lCls}>DOSIS / APLICACION</label><input type="text" value={form.dosis_v??""} onChange={e=>setForm({...form,dosis_v:e.target.value})} className={iCls} placeholder="1ml/kg subcutaneo"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.obs_v??""} onChange={e=>setForm({...form,obs_v:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVisita} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormVisita(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Form productor */}
            {showForm && (
              <div className="card-vet p-5 mb-4">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">{editandoProductor?"✏️ EDITAR":"+"} PRODUCTOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TELEFONO / WA</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
                  <div><label className={lCls}>EMAIL <span className="normal-case text-[#4B5563]">(si tiene app)</span></label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls} placeholder="Rafaela"/></div>
                  <div><label className={lCls}>HECTAREAS</label><input type="number" value={form.hectareas_total??""} onChange={e=>setForm({...form,hectareas_total:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>CABEZAS DE GANADO</label><input type="number" value={form.cabezas_ganado??""} onChange={e=>setForm({...form,cabezas_ganado:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>TIPO PRODUCCION</label><select value={form.tipo_produccion??""} onChange={e=>setForm({...form,tipo_produccion:e.target.value})} className={iCls}><option value="">—</option><option value="Cria">Cria</option><option value="Invernada">Invernada</option><option value="Tambo">Tambo</option><option value="Feedlot">Feedlot</option><option value="Mixto">Mixto</option><option value="Porcinos">Porcinos</option><option value="Ovinos">Ovinos</option><option value="Otro">Otro</option></select></div>
                  <div><label className={lCls}>HONORARIO TIPO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_cabeza">Por cabeza</option><option value="por_servicio">Por servicio</option><option value="otro">Otro</option></select></div>
                  <div><label className={lCls}>HONORARIO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarProductor} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#A78BFA]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setEditandoProductor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {productores.length===0?(
              <div className="text-center py-20 card-vet"><div className="text-5xl mb-4 opacity-20">🩺</div><p className="text-[#4B5563] font-mono">SIN PRODUCTORES — AGREGA O VINCULA UNO</p></div>
            ):(
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {productores.map(p=>(
                    <div key={p.id} className="card-vet overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#A78BFA]/10 border border-[#A78BFA]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono uppercase">{p.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{p.localidad}{p.provincia?", "+p.provincia:""}</div>
                              {p.tipo_produccion&&<div className="text-xs text-[#A78BFA] font-mono">{p.tipo_produccion}</div>}
                              {p.tiene_cuenta&&<div className="text-xs text-[#4ADE80] font-mono">✓ USA LA APP</div>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={()=>{setEditandoProductor(p.id);setForm({nombre:p.nombre,telefono:p.telefono,email:p.email,localidad:p.localidad,provincia:p.provincia,hectareas_total:String(p.hectareas_total),cabezas_ganado:String(p.cabezas_ganado),tipo_produccion:p.tipo_produccion,honorario_tipo:p.honorario_tipo,honorario_monto:String(p.honorario_monto),observaciones:p.observaciones});setShowForm(true);}} className="text-[#C9A227] text-xs px-2 py-1 rounded hover:bg-[#C9A227]/10">✏️</button>
                            <button onClick={()=>eliminarProductor(p.id)} className="text-[#4B5563] hover:text-red-400 text-xs px-2 py-1 rounded">✕</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
                          <div className="bg-[#020810]/40 rounded-lg p-2 text-center"><div className="text-[#4B5563]">HA</div><div className="font-bold text-[#C9A227] mt-0.5">{p.hectareas_total.toLocaleString()}</div></div>
                          <div className="bg-[#020810]/40 rounded-lg p-2 text-center"><div className="text-[#4B5563]">CABEZAS</div><div className="font-bold text-[#A78BFA] mt-0.5">{p.cabezas_ganado.toLocaleString()}</div></div>
                          <div className="bg-[#020810]/40 rounded-lg p-2 text-center"><div className="text-[#4B5563]">HONOR.</div><div className="font-bold text-[#00FF80] mt-0.5">${p.honorario_monto.toLocaleString()}</div></div>
                        </div>
                        <div className="flex gap-2">
                          {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono font-bold">💬 WA</a>}
                        </div>
                      </div>
                      {p.observaciones&&<div className="border-t border-[#A78BFA]/10 px-5 py-2 text-xs text-[#4B5563] font-mono">{p.observaciones}</div>}
                    </div>
                  ))}
                </div>
                {/* Historial visitas veterinarias */}
                <div className="card-vet overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                    <span className="text-[#C9A227] font-mono text-sm font-bold">📋 HISTORIAL DE VISITAS VETERINARIAS</span>
                    <button onClick={()=>exportarExcel("visitas")} className="text-xs text-[#4ADE80] border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#4ADE80]/10 font-bold">📤 EXPORTAR</button>
                  </div>
                  {visitas.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN VISITAS REGISTRADAS</div>:(
                    <table className="w-full"><thead><tr className="border-b border-[#C9A227]/10">{["FECHA","PRODUCTOR","SERVICIO","DESCRIPCION","ANIMALES","MEDICAMENTOS","COSTO",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>{visitas.slice(0,20).map(v=>{const p=productores.find(x=>x.id===v.productor_id);return(
                        <tr key={v.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                          <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{v.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono font-bold">{p?.nombre??"—"}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono font-bold">{v.tipo_servicio}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{v.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{v.animales||"—"}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{v.medicamentos||"—"}</td>
                          <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{v.costo?"$"+Number(v.costo).toLocaleString("es-AR"):"-"}</td>
                          <td className="px-4 py-3"><button onClick={()=>eliminar("vet_visitas",v.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );})}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COBRANZA — igual que ingeniero */}
        {seccion==="cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <div><h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2><div className="flex gap-4 mt-1"><span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span><span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span></div></div>
              <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha:new Date().toISOString().split("T")[0]});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">+ NUEVO COBRO</button>
            </div>
            {showForm && (
              <div className="card-vet p-5 mb-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>PRODUCTOR</label><select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>CONCEPTO</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Sanidad enero"/></div>
                  <div><label className={lCls}>MONTO</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>ESTADO</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                  <div><label className={lCls}>METODO</label><select value={form.metodo_pago??""} onChange={e=>setForm({...form,metodo_pago:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            <div className="card-vet overflow-hidden">
              {cobranzas.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">SIN COBROS</div>:(
                <table className="w-full"><thead><tr className="border-b border-[#A78BFA]/10">{["FECHA","PRODUCTOR","CONCEPTO","MONTO","ESTADO","METODO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                    <tr key={c.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5">
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                      <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{p?.nombre??"—"}</td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                      <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${Number(c.monto).toLocaleString("es-AR")}</td>
                      <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded font-mono "+(c.estado==="cobrado"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{c.estado}</span></td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago||"—"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-xs text-[#4ADE80] font-mono">✓</button>}
                        <button onClick={()=>eliminar("ing_cobranzas",c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  );})}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* VEHICULO — igual que ingeniero */}
        {seccion==="vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHICULO</h2>
              {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm font-bold hover:bg-[#A78BFA]/20">+ AGREGAR</button>:<button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] font-mono text-sm">← VOLVER</button>}
            </div>
            {showForm&&!vehiculoSel&&(
              <div className="card-vet p-5 mb-5">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVO VEHICULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Toyota Hilux"/></div>
                  <div><label className={lCls}>MARCA</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>MODELO</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>AÑO</label><input type="number" value={form.anio??""} onChange={e=>setForm({...form,anio:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>PATENTE</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>VENC. SEGURO</label><input type="date" value={form.seguro_vencimiento??""} onChange={e=>setForm({...form,seguro_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>VENC. VTV</label><input type="date" value={form.vtv_vencimiento??""} onChange={e=>setForm({...form,vtv_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>KM ACTUALES</label><input type="number" value={form.km_actuales??""} onChange={e=>setForm({...form,km_actuales:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>PROX. SERVICE KM</label><input type="number" value={form.proximo_service_km??""} onChange={e=>setForm({...form,proximo_service_km:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#A78BFA]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="text-center py-20 card-vet"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-[#4B5563] font-mono">SIN VEHICULOS</p></div>:(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v=>{const segVenc=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();return(
                    <div key={v.id} className="card-vet p-5 cursor-pointer" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-3"><span className="text-2xl">🚗</span><div><div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div></div><button onClick={e=>{e.stopPropagation();eliminar("ing_vehiculos",v.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></div>
                      <div className="flex gap-2 flex-wrap">
                        <span className={"text-xs px-2 py-1 rounded font-mono "+(segVenc?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>🛡️ {segVenc?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span className="text-xs px-2 py-1 rounded font-mono bg-[#A78BFA]/10 text-[#A78BFA]">⚙️ {v.km_actuales?.toLocaleString()||0} km</span>
                      </div>
                    </div>
                  );})}
                </div>
              )
            ):(
              <div>
                <div className="card-vet p-5 mb-4">
                  <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-3"><span className="text-3xl">🚗</span><div><div className="font-bold text-lg text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.patente}</div></div></div><button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold">+ SERVICE</button></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className="card-vet p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={lCls}>TIPO</label><select value={form.tipo_service??"service"} onChange={e=>setForm({...form,tipo_service:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparacion</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>KM</label><input type="number" value={form.km??""} onChange={e=>setForm({...form,km:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>COSTO</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-3 mt-4"><button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ GUARDAR</button><button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button></div>
                  </div>
                )}
                <div className="card-vet overflow-hidden"><div className="px-5 py-3 border-b border-[#A78BFA]/10"><span className="text-[#A78BFA] text-sm font-mono font-bold">🔧 HISTORIAL</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN HISTORIAL</div>:(
                    <table className="w-full"><thead><tr className="border-b border-[#A78BFA]/10">{["FECHA","TIPO","DESCRIPCION","KM","COSTO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=><tr key={s.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5"><td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td><td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td><td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td><td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td><td className="px-4 py-3"><button onClick={()=>eliminar("ing_vehiculo_service",s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td></tr>)}</tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* IA VET */}
        {seccion==="ia_campo" && (
          <div>
            <div className="mb-5"><h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🤖 IA VET — ASISTENTE VETERINARIO</h2><p className="text-xs text-[#4B5563] font-mono mt-1">Consulta sobre sanidad animal, vacunacion, diagnostico, recetas, reproduccion</p></div>
            {aiChat.length===0&&<div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">{["Calendario sanitario bovinos","Protocolo vacunacion terneros Argentina","Diagnostico tristeza bovina sintomas","Manejo reproductivo rodeo cria","Dosis ivermectina bovinos kg","Cuando aplicar fiebre aftosa"].map(q=><button key={q} onClick={()=>setAiInput(q)} className="text-left text-xs text-[#5B4B6B] hover:text-[#A78BFA] border border-[#A78BFA]/10 hover:border-[#A78BFA]/30 px-4 py-3 rounded-xl font-mono transition-all bg-[#0a1628]/60">🩺 {q}</button>)}</div>}
            <div className="card-vet overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#A78BFA]/10 flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse"/><span className="text-[#A78BFA] text-xs font-mono">◆ IA VETERINARIA ACTIVA</span></div>{aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-[#4B5563] font-mono">Limpiar</button>}</div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {aiChat.length===0&&<div className="text-center py-10 text-[#4B5563] font-mono text-sm"><div className="text-4xl mb-3 opacity-30">🐄</div>Hace tu consulta veterinaria...</div>}
                {aiChat.map((m,i)=><div key={i} className={"flex "+(m.rol==="user"?"justify-end":"justify-start")}><div className={"max-w-[80%] px-4 py-3 rounded-xl text-sm font-mono "+(m.rol==="user"?"bg-[#A78BFA]/10 border border-[#A78BFA]/20 text-[#E5E7EB]":"bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF]")}>{m.rol==="assistant"&&<div className="text-[#A78BFA] text-xs mb-2">◆ IA VETERINARIA</div>}<p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p></div></div>)}
                {aiLoading&&<div className="flex justify-start"><div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-xl"><p className="text-[#A78BFA] text-xs font-mono animate-pulse">▶ Analizando...</p></div></div>}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>{const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window;if(!hasSR){alert("Usa Chrome");return;}const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;const rec=new SR();rec.lang="es-AR";setListening(true);rec.onresult=(e: any)=>{setAiInput(e.results[0][0].transcript);setListening(false);};rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);rec.start();}} className={"flex items-center gap-2 px-4 py-3 rounded-xl border font-mono text-sm flex-shrink-0 "+(listening?"border-red-400 text-red-400 animate-pulse":"border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10")}>🎤 {listening?"...":"VOZ"}</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta sobre sanidad, vacunacion, diagnostico, recetas..." className="flex-1 bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#A78BFA] font-mono"/>
              <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} className="px-6 py-3 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm disabled:opacity-40 flex-shrink-0 font-bold">▶ ENVIAR</button>
            </div>
          </div>
        )}
      </div>

      {/* Panel voz */}
      {vozPanel&&<div className="fixed bottom-44 right-6 z-50 w-80 bg-[#0a1628]/97 border border-[#A78BFA]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm"><div className="flex items-center justify-between px-4 py-3 border-b border-[#A78BFA]/20"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-[#A78BFA] text-xs font-mono font-bold">🎤 ASISTENTE VET</span></div><button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] text-sm">✕</button></div><div className="px-4 pt-3 pb-2 min-h-20">{vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-8">{[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:(10+i*5)+"px"}}/>)}</div><span className="text-[#F87171] text-sm font-mono">ESCUCHANDO...</span></div>}{vozRespuesta&&<div className="bg-[#A78BFA]/8 border border-[#A78BFA]/20 rounded-lg px-3 py-2 mb-2"><p className="text-[#E5E7EB] text-sm font-mono">{vozRespuesta}</p></div>}{!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&<div className="space-y-1 py-1">{["CUANTOS PRODUCTORES TENGO","CUANTAS CABEZAS EN TOTAL"].map(q=><button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#5B4B6B] hover:text-[#A78BFA] border border-[#A78BFA]/10 px-3 py-2 rounded-lg font-mono">🩺 {q}</button>)}</div>}</div><div className="px-3 pb-3 flex gap-2 border-t border-[#A78BFA]/10 pt-3"><input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribi o habla..." className="flex-1 bg-[#020810]/80 border border-[#A78BFA]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#A78BFA]"/><button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"20",border:"1px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>{vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] text-xs font-mono">▶</button>}</div></div>}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}} className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg" style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none"}}>{VOZ_ICON[vozEstado]}</button>
      <p className="relative z-10 text-center text-[#0a0a1a] text-xs pb-4 font-mono mt-6">AGROGESTION PRO · PANEL VETERINARIO</p>
      {vetId&&<EscanerIA empresaId={vetId}/>}
    </div>
  );
}

"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";

type Seccion = "perfil"|"productores"|"cobranza"|"vehiculo"|"ia_campo";
type ProductorIng = {
  id: string; nombre: string; telefono: string; email: string;
  localidad: string; provincia: string; hectareas_total: number;
  observaciones: string; empresa_id: string|null;
  tiene_cuenta: boolean; honorario_tipo: string; honorario_monto: number;
};
type Visita = { id: string; productor_id: string; fecha: string; tipo_servicio: string; descripcion: string; lotes: string; observaciones: string; costo: number; };
type Cobranza = { id: string; productor_id: string; concepto: string; monto: number; fecha: string; estado: string; metodo_pago: string; };
type Vehiculo = { id: string; nombre: string; marca: string; modelo: string; anio: number; patente: string; seguro_vencimiento: string; seguro_compania: string; vtv_vencimiento: string; km_actuales: number; proximo_service_km: number; };
type ServiceVehiculo = { id: string; tipo: string; descripcion: string; costo: number; km: number; fecha: string; taller: string; };
type MensajeIA = { rol: "user"|"assistant"; texto: string };
type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

const TIPOS_SERVICIO = ["Siembra","Cosecha","Aplicacion","Fumigacion","Fertilizacion","Analisis de suelo","Asesoramiento","Recorrida campo","Otro"];

const getSB = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
};

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [ingenieroId, setIngenieroId] = useState("");
  const [ingenieroNombre, setIngenieroNombre] = useState("");
  const [ingenieroData, setIngenieroData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [todosLotes, setTodosLotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showFormVisita, setShowFormVisita] = useState(false);
  const [showFormVincular, setShowFormVincular] = useState(false);
  const [editandoProductor, setEditandoProductor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);
  const [filterCultivo, setFilterCultivo] = useState("todos");
  const [filterProductor, setFilterProductor] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);
  const [aiChat, setAiChat] = useState<MensajeIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const sb = await getSB();
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data: u, error: uError } = await sb.from("usuarios").select("*").eq("auth_id", user.id).single();
      if (uError || !u) { window.location.href = "/login"; return; }
      if (u.rol !== "ingeniero") { window.location.href = "/login"; return; }
      setIngenieroId(u.id);
      setIngenieroNombre(u.nombre);
      setIngenieroData(u);
      await fetchProductores(u.id);
      await fetchCobranzas(u.id);
      await fetchVehiculos(u.id);
      await fetchVisitas(u.id);
    } catch(e) {
      console.error("init error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductores = async (iid: string) => {
    try {
      const sb = await getSB();
      const { data: prods, error } = await sb.from("ing_productores").select("*").eq("ingeniero_id", iid).eq("activo", true).order("nombre");
      if (error) { console.error("ing_productores error:", error); return; }
      setProductores(prods ?? []);
      // Cargar lotes de productores vinculados
      const lotesTodos: any[] = [];
      for (const p of (prods ?? []).filter((x: any) => x.empresa_id)) {
        try {
          const sb2 = await getSB();
          const { data: lotes } = await sb2.from("lotes").select("nombre,hectareas,cultivo,cultivo_completo,estado,fecha_siembra,variedad").eq("empresa_id", p.empresa_id).eq("es_segundo_cultivo", false);
          (lotes ?? []).forEach((l: any) => lotesTodos.push({ ...l, productor_nombre: p.nombre }));
        } catch {}
      }
      setTodosLotes(lotesTodos);
    } catch(e) { console.error("fetchProductores:", e); }
  };

  const fetchVisitas = async (iid: string) => {
    try {
      const sb = await getSB();
      const { data } = await sb.from("ing_visitas").select("*").eq("ingeniero_id", iid).order("fecha", { ascending: false });
      setVisitas(data ?? []);
    } catch {}
  };

  const fetchCobranzas = async (iid: string) => {
    try {
      const sb = await getSB();
      const { data } = await sb.from("ing_cobranzas").select("*").eq("ingeniero_id", iid).order("fecha", { ascending: false });
      setCobranzas(data ?? []);
    } catch {}
  };

  const fetchVehiculos = async (iid: string) => {
    try {
      const sb = await getSB();
      const { data: vehs } = await sb.from("ing_vehiculos").select("*").eq("ingeniero_id", iid);
      setVehiculos(vehs ?? []);
      const alertasNuevas: {msg:string;urgencia:string}[] = [];
      const hoy = new Date();
      (vehs ?? []).forEach((v: any) => {
        if (v.seguro_vencimiento) { const d=(new Date(v.seguro_vencimiento).getTime()-hoy.getTime())/(86400000); if(d<0)alertasNuevas.push({msg:v.nombre+": Seguro VENCIDO",urgencia:"alta"}); else if(d<=30)alertasNuevas.push({msg:v.nombre+": Seguro vence en "+Math.round(d)+" dias",urgencia:d<=7?"alta":"media"}); }
        if (v.vtv_vencimiento) { const d=(new Date(v.vtv_vencimiento).getTime()-hoy.getTime())/(86400000); if(d<0)alertasNuevas.push({msg:v.nombre+": VTV VENCIDA",urgencia:"alta"}); else if(d<=30)alertasNuevas.push({msg:v.nombre+": VTV vence en "+Math.round(d)+" dias",urgencia:d<=7?"alta":"media"}); }
      });
      setAlertas(alertasNuevas);
    } catch {}
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const guardarPerfil = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("usuarios").update({ nombre:form.nombre??ingenieroData.nombre, telefono:form.telefono??"", matricula:form.matricula??"", especialidad:form.especialidad??"", cuit:form.cuit??"", localidad:form.localidad??"", provincia:form.provincia??"", direccion:form.direccion??"" }).eq("id", ingenieroId);
    msg("✅ PERFIL GUARDADO");
    const sb2 = await getSB();
    const { data: u } = await sb2.from("usuarios").select("*").eq("id", ingenieroId).single();
    if (u) { setIngenieroData(u); setIngenieroNombre(u.nombre); }
  };

  const guardarProductor = async () => {
    if (!ingenieroId || !form.nombre?.trim()) { msg("❌ INGRESA EL NOMBRE"); return; }
    const sb = await getSB();
    let empresa_id = null; let tiene_cuenta = false;
    if (form.email?.trim()) {
      const { data: uEmail } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (uEmail) { const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", uEmail.id).single(); if (emp) { empresa_id = emp.id; tiene_cuenta = true; } }
    }
    const payload = { ingeniero_id:ingenieroId, nombre:form.nombre.trim(), telefono:form.telefono??"", email:form.email??"", localidad:form.localidad??"", provincia:form.provincia??"Santa Fe", hectareas_total:Number(form.hectareas_total??0), observaciones:form.observaciones??"", honorario_tipo:form.honorario_tipo??"mensual", honorario_monto:Number(form.honorario_monto??0), empresa_id, tiene_cuenta, activo:true };
    if (editandoProductor) { await sb.from("ing_productores").update(payload).eq("id", editandoProductor); setEditandoProductor(null); }
    else { await sb.from("ing_productores").insert(payload); }
    msg(tiene_cuenta?"✅ GUARDADO — VINCULADO A APP":"✅ PRODUCTOR GUARDADO");
    await fetchProductores(ingenieroId); setShowForm(false); setForm({});
  };

  const vincularPorCodigo = async () => {
    if (!ingenieroId || !form.codigo_productor?.trim()) { msg("❌ INGRESA EL CODIGO"); return; }
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("id,nombre").eq("codigo", form.codigo_productor.trim()).single();
    if (!u) { msg("❌ CODIGO NO ENCONTRADO"); return; }
    let { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) {
      const { data: newEmp } = await sb.from("empresas").insert({ nombre:"Empresa de "+u.nombre, propietario_id:u.id }).select().single();
      emp = newEmp;
    }
    if (!emp) { msg("❌ ERROR AL OBTENER EMPRESA"); return; }
    // Upsert en ing_productores
    const { data: existeProd } = await sb.from("ing_productores").select("id").eq("ingeniero_id", ingenieroId).eq("empresa_id", emp.id).single();
    if (!existeProd) {
      await sb.from("ing_productores").insert({ ingeniero_id:ingenieroId, nombre:u.nombre, empresa_id:emp.id, tiene_cuenta:true, honorario_tipo:form.honorario_tipo??"mensual", honorario_monto:Number(form.honorario_monto??0), activo:true });
    } else {
      await sb.from("ing_productores").update({ empresa_id:emp.id, tiene_cuenta:true }).eq("id", existeProd.id);
    }
    // Vinculacion
    const { data: vincExiste } = await sb.from("vinculaciones").select("id").eq("profesional_id", ingenieroId).eq("empresa_id", emp.id).single();
    if (!vincExiste) { await sb.from("vinculaciones").insert({ profesional_id:ingenieroId, empresa_id:emp.id, activa:true, rol_profesional:"ingeniero" }); }
    msg("✅ "+u.nombre+" VINCULADO — LOTES COMPARTIDOS");
    await fetchProductores(ingenieroId); setShowFormVincular(false); setForm({});
  };

  const eliminarProductor = async (id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from("ing_productores").update({ activo:false }).eq("id", id);
    await fetchProductores(ingenieroId);
  };

  const entrarProductor = (prod: ProductorIng) => {
    if (prod.empresa_id) {
      localStorage.setItem("ing_empresa_id", prod.empresa_id);
      localStorage.setItem("ing_empresa_nombre", prod.nombre);
      localStorage.setItem("ing_modo_compartido", "true");
    } else {
      localStorage.setItem("ing_empresa_id", prod.id);
      localStorage.setItem("ing_empresa_nombre", prod.nombre);
      localStorage.setItem("ing_modo_compartido", "false");
    }
    window.location.href = "/ingeniero/lotes";
  };

  const guardarVisita = async () => {
    if (!ingenieroId || !form.productor_id_v) { msg("❌ SELECCIONA PRODUCTOR"); return; }
    const sb = await getSB();
    await sb.from("ing_visitas").insert({ ingeniero_id:ingenieroId, productor_id:form.productor_id_v, fecha:form.fecha_v??new Date().toISOString().split("T")[0], tipo_servicio:form.tipo_servicio??"Asesoramiento", descripcion:form.descripcion_v??"", lotes:form.lotes_v??"", observaciones:form.obs_v??"", costo:Number(form.costo_v??0) });
    msg("✅ VISITA REGISTRADA");
    await fetchVisitas(ingenieroId); setShowFormVisita(false); setForm({});
  };

  const exportarExcel = async (tipo: "productores"|"lotes"|"visitas") => {
    const XLSX = await import("xlsx");
    let data: any[] = [];
    if (tipo==="productores") data=productores.map(p=>({NOMBRE:p.nombre,TELEFONO:p.telefono,EMAIL:p.email,LOCALIDAD:p.localidad,HA:p.hectareas_total,HONORARIO:p.honorario_monto,APP:p.tiene_cuenta?"SI":"NO"}));
    else if (tipo==="lotes") {
      let lf=todosLotes;
      if(filterCultivo!=="todos")lf=lf.filter((l:any)=>(l.cultivo_completo||l.cultivo)===filterCultivo);
      if(filterProductor!=="todos")lf=lf.filter((l:any)=>l.productor_nombre===filterProductor);
      if(filterEstado!=="todos")lf=lf.filter((l:any)=>l.estado===filterEstado);
      data=lf.map((l:any)=>({PRODUCTOR:l.productor_nombre,LOTE:l.nombre,HA:l.hectareas,CULTIVO:l.cultivo_completo||l.cultivo,ESTADO:l.estado,SIEMBRA:l.fecha_siembra||"",VARIEDAD:l.variedad||""}));
    } else data=visitas.map(v=>{const p=productores.find(x=>x.id===v.productor_id);return{PRODUCTOR:p?.nombre??"—",FECHA:v.fecha,SERVICIO:v.tipo_servicio,DESCRIPCION:v.descripcion,LOTES:v.lotes,COSTO:v.costo};});
    const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,tipo);
    XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const leerExcelProductores = async (file: File) => {
    setImportMsg("LEYENDO...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if (rows.length<2){setImportMsg("SIN DATOS");return;}
      const headers=rows[0].map((h:any)=>String(h).toLowerCase().trim());
      const cn=headers.findIndex((h:string)=>h.includes("nombre")||h.includes("productor"));
      const ct=headers.findIndex((h:string)=>h.includes("tel")||h.includes("cel"));
      const ce=headers.findIndex((h:string)=>h.includes("email"));
      const cl=headers.findIndex((h:string)=>h.includes("local")||h.includes("ciudad"));
      const ch=headers.findIndex((h:string)=>h.includes("ha")||h.includes("hect"));
      const preview=rows.slice(1).filter((r:any)=>r[cn>=0?cn:0]).map((r:any)=>({
        nombre:String(r[cn>=0?cn:0]).trim(),telefono:ct>=0?String(r[ct]).trim():"",email:ce>=0?String(r[ce]).trim():"",localidad:cl>=0?String(r[cl]).trim():"",hectareas_total:ch>=0?Number(r[ch])||0:0,
        existe:productores.some(p=>p.nombre.toLowerCase()===String(r[cn>=0?cn:0]).toLowerCase().trim()),
      }));
      setImportPreview(preview); setImportMsg("✅ "+preview.length+" DETECTADOS");
    } catch(e:any){setImportMsg("❌ "+e.message);}
  };

  const confirmarImportProductores = async () => {
    if (!ingenieroId||!importPreview.length) return;
    const sb=await getSB(); let creados=0;
    for (const p of importPreview.filter(x=>!x.existe)) {
      await sb.from("ing_productores").insert({ingeniero_id:ingenieroId,nombre:p.nombre,telefono:p.telefono,email:p.email,localidad:p.localidad,hectareas_total:p.hectareas_total,honorario_tipo:"mensual",honorario_monto:0,activo:true});
      creados++;
    }
    msg("✅ "+creados+" IMPORTADOS");
    await fetchProductores(ingenieroId); setImportPreview([]); setImportMsg(""); setShowImport(false);
  };

  const guardarCobranza = async () => {
    if (!ingenieroId) return;
    const sb=await getSB();
    await sb.from("ing_cobranzas").insert({ingeniero_id:ingenieroId,productor_id:form.productor_id||null,concepto:form.concepto??"",monto:Number(form.monto??0),fecha:form.fecha??new Date().toISOString().split("T")[0],estado:form.estado??"pendiente",metodo_pago:form.metodo_pago??""});
    await fetchCobranzas(ingenieroId); setShowForm(false); setForm({}); msg("✅ COBRO REGISTRADO");
  };

  const marcarCobrado = async (id: string) => {
    const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id);
    await fetchCobranzas(ingenieroId);
  };

  const guardarVehiculo = async () => {
    if (!ingenieroId||!form.nombre?.trim()) return;
    const sb=await getSB();
    await sb.from("ing_vehiculos").insert({ingeniero_id:ingenieroId,nombre:form.nombre,marca:form.marca??"",modelo:form.modelo??"",anio:Number(form.anio??0),patente:form.patente??"",seguro_vencimiento:form.seguro_vencimiento||null,seguro_compania:form.seguro_compania??"",vtv_vencimiento:form.vtv_vencimiento||null,km_actuales:Number(form.km_actuales??0),proximo_service_km:Number(form.proximo_service_km??0)});
    await fetchVehiculos(ingenieroId); setShowForm(false); setForm({}); msg("✅ GUARDADO");
  };

  const guardarService = async () => {
    if (!vehiculoSel||!ingenieroId) return;
    const sb=await getSB();
    await sb.from("ing_vehiculo_service").insert({vehiculo_id:vehiculoSel.id,ingeniero_id:ingenieroId,tipo:form.tipo_service??"service",descripcion:form.descripcion??"",costo:Number(form.costo??0),km:Number(form.km??0),fecha:form.fecha??new Date().toISOString().split("T")[0],taller:form.taller??""});
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); msg("✅ SERVICE GUARDADO");
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb=await getSB(); await sb.from(tabla).delete().eq("id",id);
    if(seccion==="cobranza")await fetchCobranzas(ingenieroId);
    else await fetchVehiculos(ingenieroId);
  };

  // VOZ
  const hablar = useCallback((texto: string) => {
    if (typeof window==="undefined") return;
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(texto); utt.lang="es-AR";
    const v=window.speechSynthesis.getVoices().find(x=>x.lang.startsWith("es")); if(v)utt.voice=v;
    utt.onstart=()=>setVozEstado("respondiendo"); utt.onend=()=>setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  },[]);

  const escucharVoz = () => {
    const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window; if(!hasSR){alert("Usa Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR(); rec.lang="es-AR"; rec.continuous=false;
    recRef.current=rec; setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;interpretarVoz(t);};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);}; rec.start();
  };

  const interpretarVoz = async (texto: string) => {
    setVozEstado("procesando");
    setVozRespuesta("Procesando: "+texto);
    hablar("Entendido: "+texto);
  };

  const askAI = async () => {
    if(!aiInput.trim())return; const userMsg=aiInput.trim(); setAiInput(""); setAiLoading(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    try {
      const hist=aiChat.map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:"Asistente agronomico experto Argentina. Respondé en español tecnico. Ingeniero: "+ingenieroNombre+".",messages:[...hist,{role:"user",content:userMsg}]})});
      const data=await res.json();
      setAiChat(prev=>[...prev,{rol:"assistant",texto:data.content?.[0]?.text??"Sin respuesta"}]);
    } catch { setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error IA"}]); }
    setAiLoading(false);
  };

  const VOZ_COLOR: Record<string,string>={idle:"#00FF80",escuchando:"#F87171",procesando:"#C9A227",respondiendo:"#60A5FA",error:"#F87171"};
  const VOZ_ICON: Record<string,string>={idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};
  const iCls="w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono";
  const lCls="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const totalHa=productores.reduce((a,p)=>a+(p.hectareas_total||0),0);
  const totalPendiente=cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totalCobrado=cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosUnicos=[...new Set(todosLotes.map((l:any)=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-[#00FF80] border-t-transparent rounded-full animate-spin"/>
      <p className="text-[#00FF80] font-mono text-sm animate-pulse">CARGANDO PANEL...</p>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .card-ing{background:rgba(10,22,40,0.85);border:1px solid rgba(0,255,128,0.15);border-radius:12px;transition:all 0.2s}
        .card-ing:hover{border-color:rgba(0,255,128,0.4)}
        .sec-a{border-color:#00FF80!important;color:#00FF80!important;background:rgba(0,255,128,0.08)!important}
      `}</style>
      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10 bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="" width={100} height={36} className="object-contain cursor-pointer" onClick={()=>window.location.href="/ingeniero"}/>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold">{ingenieroNombre}</div>
          <div className="text-xs text-[#60A5FA] font-mono">INGENIERO · COD {ingenieroData.codigo}</div>
        </div>
        {alertas.length>0&&<div className="w-7 h-7 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center"><span className="text-[#F87171] text-xs font-bold">{alertas.length}</span></div>}
        <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-sm font-bold transition-all"
          style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
          {VOZ_ICON[vozEstado]} VOZ
        </button>
        <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL INGENIERO AGRONOMO</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTORES · {totalHa.toLocaleString("es-AR")} HA · IA ACTIVA</p>
        </div>

        {alertas.length>0&&<div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-5"><div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse"/><span className="text-[#F87171] text-xs font-mono font-bold">ALERTAS ({alertas.length})</span></div><div className="flex flex-wrap gap-2">{alertas.map((a,i)=><div key={i} className={"px-3 py-1.5 rounded-lg text-xs font-mono border "+(a.urgencia==="alta"?"border-[#F87171]/30 text-[#F87171]":"border-[#C9A227]/30 text-[#C9A227]")}>{a.urgencia==="alta"?"🔴":"🟡"} {a.msg}</div>)}</div></div>}
        {msgExito&&<div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* TABS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[{k:"perfil",l:"MI PERFIL",i:"👨‍💼"},{k:"productores",l:"MIS PRODUCTORES",i:"👨‍🌾"},{k:"cobranza",l:"COBRANZA",i:"💰"},{k:"vehiculo",l:"MI VEHICULO",i:"🚗"},{k:"ia_campo",l:"IA CAMPO",i:"🤖"}].map(s=>(
            <button key={s.k} onClick={()=>{setSeccion(s.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={"px-5 py-2.5 rounded-xl border text-sm font-mono font-bold transition-all "+(seccion===s.k?"sec-a":"border-[#00FF80]/15 text-[#4B5563] hover:text-[#9CA3AF]")}>
              {s.i} {s.l}
            </button>
          ))}
        </div>

        {/* PERFIL */}
        {seccion==="perfil"&&(
          <div className="card-ing p-6">
            <h2 className="text-[#60A5FA] font-mono text-sm font-bold mb-5">👨‍💼 MIS DATOS PROFESIONALES</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[["nombre","NOMBRE",ingenieroData.nombre??""],["telefono","TELEFONO",ingenieroData.telefono??""],["matricula","MATRICULA",ingenieroData.matricula??""],["especialidad","ESPECIALIDAD",ingenieroData.especialidad??""],["cuit","CUIT",ingenieroData.cuit??""],["localidad","LOCALIDAD",ingenieroData.localidad??""],["provincia","PROVINCIA",ingenieroData.provincia??"Santa Fe"],["direccion","DIRECCION",ingenieroData.direccion??""]].map(([k,l,def])=>(
                <div key={k} className={k==="direccion"?"md:col-span-2":""}>
                  <label className={lCls}>{l}</label>
                  <input type="text" defaultValue={def} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls}/>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-[#020810]/40 rounded-xl border border-[#60A5FA]/15">
              <div className="grid grid-cols-3 gap-4 text-xs font-mono text-center">
                <div><div className="text-[#4B5563]">CODIGO</div><div className="text-[#60A5FA] font-bold text-lg mt-1">{ingenieroData.codigo}</div></div>
                <div><div className="text-[#4B5563]">EMAIL</div><div className="text-[#E5E7EB] mt-1 text-xs break-all">{ingenieroData.email}</div></div>
                <div><div className="text-[#4B5563]">ROL</div><div className="text-[#60A5FA] font-bold mt-1">INGENIERO</div></div>
              </div>
            </div>
            <button onClick={guardarPerfil} className="mt-4 bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#60A5FA]/20">▶ GUARDAR PERFIL</button>
          </div>
        )}

        {/* MIS PRODUCTORES */}
        {seccion==="productores"&&(
          <div>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[{l:"PRODUCTORES",v:String(productores.length),c:"#E5E7EB"},{l:"HA TOTALES",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"LOTES APP",v:String(todosLotes.length),c:"#4ADE80"},{l:"CON CUENTA APP",v:String(productores.filter(p=>p.tiene_cuenta).length),c:"#60A5FA"}].map(s=>(
                <div key={s.l} className="card-ing p-4 text-center"><div className="text-xs text-[#4B5563] font-mono">{s.l}</div><div className="text-xl font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div></div>
              ))}
            </div>

            {/* Acciones */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={()=>{setShowForm(!showForm);setEditandoProductor(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm font-bold hover:bg-[#00FF80]/20">+ NUEVO PRODUCTOR</button>
              <button onClick={()=>{setShowFormVincular(!showFormVincular);setForm({});}} className="px-4 py-2 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm font-bold hover:bg-[#60A5FA]/20">🔗 VINCULAR POR CODIGO</button>
              <button onClick={()=>{setShowFormVisita(!showFormVisita);setForm({fecha_v:new Date().toISOString().split("T")[0]});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">+ REGISTRAR VISITA</button>
              <button onClick={()=>setShowImport(!showImport)} className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/10">📥 IMPORTAR</button>
              <button onClick={()=>exportarExcel("productores")} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/10">📤 EXPORTAR</button>
            </div>

            {/* Vincular por código */}
            {showFormVincular&&(
              <div className="card-ing p-5 mb-4">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-3">🔗 VINCULAR POR CODIGO</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-3">Ingresa el codigo del productor (ej: 10001). Se vinculan los lotes automaticamente.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>CODIGO *</label><input type="text" value={form.codigo_productor??""} onChange={e=>setForm({...form,codigo_productor:e.target.value})} className={iCls} placeholder="10001"/></div>
                  <div><label className={lCls}>HONORARIO TIPO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                  <div><label className={lCls}>MONTO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="flex items-end"><button onClick={vincularPorCodigo} className="w-full py-2.5 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm font-bold hover:bg-[#60A5FA]/20">▶ VINCULAR</button></div>
                </div>
              </div>
            )}

            {/* Form visita */}
            {showFormVisita&&(
              <div className="card-ing p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR VISITA</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>PRODUCTOR</label><select value={form.productor_id_v??""} onChange={e=>setForm({...form,productor_id_v:e.target.value})} className={iCls}><option value="">Seleccionar</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_v??""} onChange={e=>setForm({...form,fecha_v:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>TIPO SERVICIO</label><select value={form.tipo_servicio??"Asesoramiento"} onChange={e=>setForm({...form,tipo_servicio:e.target.value})} className={iCls}>{TIPOS_SERVICIO.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className={lCls}>COSTO $</label><input type="number" value={form.costo_v??""} onChange={e=>setForm({...form,costo_v:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion_v??""} onChange={e=>setForm({...form,descripcion_v:e.target.value})} className={iCls} placeholder="Detalle..."/></div>
                  <div><label className={lCls}>LOTES</label><input type="text" value={form.lotes_v??""} onChange={e=>setForm({...form,lotes_v:e.target.value})} className={iCls} placeholder="El Norte..."/></div>
                  <div><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.obs_v??""} onChange={e=>setForm({...form,obs_v:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVisita} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormVisita(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Import */}
            {showImport&&(
              <div className="card-ing p-5 mb-4">
                <div className="flex items-center justify-between mb-3"><h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR</h3><button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button></div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelProductores(f);}}/>
                {importPreview.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/40 rounded-xl text-[#C9A227] font-mono text-sm w-full justify-center">📁 SELECCIONAR ARCHIVO</button>
                  :<div>
                    <div className="max-h-32 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                      <table className="w-full text-xs"><thead><tr className="border-b border-[#C9A227]/10">{["NOMBRE","TEL","LOCALIDAD","HA","ESTADO"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=><tr key={i} className="border-b border-[#C9A227]/5"><td className="px-3 py-2 text-[#E5E7EB] font-mono font-bold">{r.nombre}</td><td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.telefono||"—"}</td><td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.localidad||"—"}</td><td className="px-3 py-2 text-[#C9A227] font-mono">{r.hectareas_total||"—"}</td><td className="px-3 py-2"><span className={r.existe?"text-[#60A5FA] font-mono text-xs":"text-[#4ADE80] font-mono text-xs"}>{r.existe?"Ya existe":"Nuevo"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={confirmarImportProductores} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono">▶ IMPORTAR {importPreview.filter(p=>!p.existe).length} NUEVOS</button>
                      <button onClick={()=>setImportPreview([])} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">CANCELAR</button>
                    </div>
                  </div>
                }
                {importMsg&&<p className={"mt-2 text-xs font-mono "+(importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]")}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo/editar productor */}
            {showForm&&(
              <div className="card-ing p-5 mb-4">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">{editandoProductor?"✏️ EDITAR":"+"} PRODUCTOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                  <div><label className={lCls}>TELEFONO</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
                  <div><label className={lCls}>EMAIL (si tiene app)</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>HECTAREAS</label><input type="number" value={form.hectareas_total??""} onChange={e=>setForm({...form,hectareas_total:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>HONORARIO TIPO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                  <div><label className={lCls}>HONORARIO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarProductor} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setEditandoProductor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Exportar lotes */}
            {todosLotes.length>0&&(
              <div className="card-ing p-4 mb-4">
                <div className="flex items-center justify-between mb-3"><span className="text-[#C9A227] font-mono text-sm font-bold">📊 EXPORTAR LOTES</span></div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div><label className={lCls}>CULTIVO</label><select value={filterCultivo} onChange={e=>setFilterCultivo(e.target.value)} className={iCls+" w-36"}><option value="todos">Todos</option>{cultivosUnicos.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className={lCls}>PRODUCTOR</label><select value={filterProductor} onChange={e=>setFilterProductor(e.target.value)} className={iCls+" w-40"}><option value="todos">Todos</option>{productores.filter(p=>p.tiene_cuenta).map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>ESTADO</label><select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} className={iCls+" w-36"}><option value="todos">Todos</option>{["planificado","sembrado","en_desarrollo","cosechado"].map(e=><option key={e} value={e}>{e.toUpperCase()}</option>)}</select></div>
                  <button onClick={()=>exportarExcel("lotes")} className="px-5 py-2.5 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/20">📤 EXPORTAR LOTES</button>
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0
              ?<div className="text-center py-20 card-ing"><div className="text-5xl mb-4 opacity-20">👨‍🌾</div><p className="text-[#4B5563] font-mono text-sm">SIN PRODUCTORES — AGREGA O VINCULA UNO</p></div>
              :<div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {productores.map(p=>(
                    <div key={p.id} className="card-ing overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#00FF80]/10 border border-[#00FF80]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono uppercase">{p.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{p.localidad}{p.provincia?", "+p.provincia:""}</div>
                              {p.tiene_cuenta&&<div className="text-xs text-[#4ADE80] font-mono font-bold">✓ USA LA APP</div>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={()=>{setEditandoProductor(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",hectareas_total:String(p.hectareas_total||0),honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),observaciones:p.observaciones||""});setShowForm(true);}} className="text-[#C9A227] text-xs px-2 py-1 rounded hover:bg-[#C9A227]/10">✏️</button>
                            <button onClick={()=>eliminarProductor(p.id)} className="text-[#4B5563] hover:text-red-400 text-xs px-2 py-1">✕</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                          <div className="bg-[#020810]/40 rounded-lg p-2 text-center"><div className="text-[#4B5563]">HA</div><div className="font-bold text-[#C9A227] mt-0.5">{(p.hectareas_total||0).toLocaleString("es-AR")}</div></div>
                          <div className="bg-[#020810]/40 rounded-lg p-2 text-center"><div className="text-[#4B5563]">HONORARIO</div><div className="font-bold text-[#00FF80] mt-0.5">${(p.honorario_monto||0).toLocaleString("es-AR")}</div></div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono font-bold">💬 WA</a>}
                          <button onClick={()=>entrarProductor(p)} className="flex-1 text-center py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono font-bold hover:bg-[#00FF80]/20">{p.tiene_cuenta?"🔗 LOTES COMPARTIDOS":"🌾 MIS LOTES"}</button>
                        </div>
                      </div>
                      {p.observaciones&&<div className="border-t border-[#00FF80]/10 px-5 py-2 text-xs text-[#4B5563] font-mono">{p.observaciones}</div>}
                    </div>
                  ))}
                </div>
                {/* Historial visitas */}
                <div className="card-ing overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                    <span className="text-[#C9A227] font-mono text-sm font-bold">📋 HISTORIAL DE VISITAS</span>
                    <button onClick={()=>exportarExcel("visitas")} className="text-xs text-[#4ADE80] border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#4ADE80]/10 font-bold">📤 EXPORTAR</button>
                  </div>
                  {visitas.length===0
                    ?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN VISITAS</div>
                    :<table className="w-full"><thead><tr className="border-b border-[#C9A227]/10">{["FECHA","PRODUCTOR","SERVICIO","DESCRIPCION","LOTES","COSTO",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                      <tbody>{visitas.slice(0,20).map(v=>{const p=productores.find(x=>x.id===v.productor_id);return(
                        <tr key={v.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                          <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{v.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono font-bold">{p?.nombre??"—"}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono font-bold">{v.tipo_servicio}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{v.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{v.lotes||"—"}</td>
                          <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{v.costo?"$"+Number(v.costo).toLocaleString("es-AR"):"-"}</td>
                          <td className="px-4 py-3"><button onClick={async()=>{const sb=await getSB();await sb.from("ing_visitas").delete().eq("id",v.id);await fetchVisitas(ingenieroId);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );})}
                      </tbody>
                    </table>
                  }
                </div>
              </div>
            }
          </div>
        )}

        {/* COBRANZA */}
        {seccion==="cobranza"&&(
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <div><h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2><div className="flex gap-4 mt-1"><span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span><span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span></div></div>
              <div className="flex gap-2">
                <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold">📤 EXPORTAR</button>
                <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha:new Date().toISOString().split("T")[0]});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">+ NUEVO COBRO</button>
              </div>
            </div>
            {showForm&&(
              <div className="card-ing p-5 mb-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>PRODUCTOR</label><select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>CONCEPTO</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                  <div><label className={lCls}>MONTO</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>ESTADO</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                  <div><label className={lCls}>METODO</label><select value={form.metodo_pago??""} onChange={e=>setForm({...form,metodo_pago:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            <div className="card-ing overflow-hidden">
              {cobranzas.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">SIN COBROS</div>:(
                <table className="w-full"><thead><tr className="border-b border-[#00FF80]/10">{["FECHA","PRODUCTOR","CONCEPTO","MONTO","ESTADO","METODO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                    <tr key={c.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5">
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

        {/* VEHICULO */}
        {seccion==="vehiculo"&&(
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHICULO</h2>
              {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm font-bold">+ AGREGAR</button>:(
                <div className="flex gap-3">
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold">+ SERVICE</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] font-mono text-sm">← VOLVER</button>
                </div>
              )}
            </div>
            {showForm&&!vehiculoSel&&(
              <div className="card-ing p-5 mb-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVO VEHICULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[["nombre","NOMBRE","Toyota Hilux"],["marca","MARCA",""],["modelo","MODELO",""],["anio","AÑO",""],["patente","PATENTE",""],["seguro_compania","COMP. SEGURO",""]].map(([k,l,ph])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type={k==="anio"?"number":"text"} value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} placeholder={ph}/></div>
                  ))}
                  {[["seguro_vencimiento","VENC. SEGURO"],["vtv_vencimiento","VENC. VTV"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="date" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls}/></div>
                  ))}
                  {[["km_actuales","KM ACTUALES"],["proximo_service_km","PROX. SERVICE KM"]].map(([k,l])=>(
                    <div key={k}><label className={lCls}>{l}</label><input type="number" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls}/></div>
                  ))}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="text-center py-20 card-ing"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-[#4B5563] font-mono">SIN VEHICULOS</p></div>:(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map((v:any)=>{const segV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vtvV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                    <div key={v.id} className="card-ing p-5 cursor-pointer" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div className="flex items-start justify-between mb-4"><div className="flex items-center gap-3"><span className="text-3xl">🚗</span><div><div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div></div><button onClick={e=>{e.stopPropagation();eliminar("ing_vehiculos",v.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">KM</div><div className="text-lg font-bold font-mono text-[#00FF80]">{(v.km_actuales||0).toLocaleString()} km</div></div>
                        <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">PROX. SERVICE</div><div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <span className={"text-xs px-2 py-1 rounded font-mono "+(segV?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>🛡️ {segV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span className={"text-xs px-2 py-1 rounded font-mono "+(vtvV?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>📋 VTV {vtvV?"VENCIDA":v.vtv_vencimiento||"—"}</span>
                      </div>
                    </div>
                  );})}
                </div>
              )
            ):(
              <div>
                <div className="card-ing p-5 mb-4">
                  <div className="flex items-center gap-4 mb-4"><span className="text-4xl">🚗</span><div><div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className="card-ing p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={lCls}>TIPO</label><select value={form.tipo_service??"service"} onChange={e=>setForm({...form,tipo_service:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparacion</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} placeholder="Cambio aceite"/></div>
                      <div><label className={lCls}>TALLER</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>KM</label><input type="number" value={form.km??""} onChange={e=>setForm({...form,km:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>COSTO</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ GUARDAR</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button>
                    </div>
                  </div>
                )}
                <div className="card-ing overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#00FF80]/10"><span className="text-[#00FF80] text-sm font-mono font-bold">🔧 HISTORIAL</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN HISTORIAL</div>:(
                    <table className="w-full"><thead><tr className="border-b border-[#00FF80]/10">{["FECHA","TIPO","DESCRIPCION","TALLER","KM","COSTO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
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

        {/* IA CAMPO */}
        {seccion==="ia_campo"&&(
          <div>
            <div className="mb-5"><h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🤖 IA CAMPO</h2><p className="text-xs text-[#4B5563] font-mono mt-1">Consulta sobre dosis, plagas, enfermedades, cultivos y mercados</p></div>
            {aiChat.length===0&&<div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">{["Dosis glifosato soja","Roya asiatica sintomas","Fungicida maiz","Siembra trigo pampeana","Insecticida soja MIP","Precio soja hoy"].map(q=><button key={q} onClick={()=>setAiInput(q)} className="text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-4 py-3 rounded-xl font-mono bg-[#0a1628]/60">💬 {q}</button>)}</div>}
            <div className="card-ing overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse"/><span className="text-[#00FF80] text-xs font-mono">◆ IA AGRONOMICA</span></div>{aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-[#4B5563] font-mono">Limpiar</button>}</div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {aiChat.length===0&&<div className="text-center py-10 text-[#4B5563] font-mono text-sm"><div className="text-4xl mb-3 opacity-30">🌾</div>Hace tu consulta...</div>}
                {aiChat.map((m,i)=><div key={i} className={"flex "+(m.rol==="user"?"justify-end":"justify-start")}><div className={"max-w-[80%] px-4 py-3 rounded-xl text-sm font-mono "+(m.rol==="user"?"bg-[#00FF80]/10 border border-[#00FF80]/20 text-[#E5E7EB]":"bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF]")}>{m.rol==="assistant"&&<div className="text-[#00FF80] text-xs mb-2">◆ IA</div>}<p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p></div></div>)}
                {aiLoading&&<div className="flex justify-start"><div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-xl"><p className="text-[#00FF80] text-xs font-mono animate-pulse">▶ Analizando...</p></div></div>}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>{const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window;if(!hasSR){alert("Usa Chrome");return;}const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;const rec=new SR();rec.lang="es-AR";setListening(true);rec.onresult=(e:any)=>{setAiInput(e.results[0][0].transcript);setListening(false);};rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);rec.start();}} className={"flex items-center gap-2 px-4 py-3 rounded-xl border font-mono text-sm flex-shrink-0 "+(listening?"border-red-400 text-red-400 animate-pulse":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10")}>🎤 {listening?"...":"VOZ"}</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta agronomica..." className="flex-1 bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono"/>
              <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} className="px-6 py-3 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm disabled:opacity-40 font-bold">▶ ENVIAR</button>
            </div>
          </div>
        )}
      </div>

      {/* VOZ PANEL */}
      {vozPanel&&<div className="fixed bottom-44 right-6 z-50 w-72 bg-[#0a1628]/97 border border-[#00FF80]/30 rounded-2xl shadow-2xl overflow-hidden"><div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF80]/20"><span className="text-[#00FF80] text-xs font-mono font-bold">🎤 ASISTENTE VOZ</span><button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] text-sm">✕</button></div><div className="px-4 pt-3 pb-2 min-h-16">{vozRespuesta&&<p className="text-[#E5E7EB] text-sm font-mono">{vozRespuesta}</p>}</div><div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3"><input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribi..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none"/></div></div>}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}} className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg" style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado],animation:"float 3s ease-in-out infinite"}}>{VOZ_ICON[vozEstado]}</button>
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 font-mono mt-6">AGROGESTION PRO · PANEL INGENIERO</p>
    </div>
  );
}

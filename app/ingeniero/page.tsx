"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const getSB = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
};

type Seccion = "general"|"productores"|"cobranza"|"vehiculo"|"ia_campo";
type ProductorIng = { id:string; nombre:string; telefono:string; email:string; localidad:string; provincia:string; hectareas_total:number; observaciones:string; empresa_id:string|null; tiene_cuenta:boolean; honorario_tipo:string; honorario_monto:number; };
type Campana = { id:string; nombre:string; activa:boolean; };
type Cobranza = { id:string; productor_id:string; concepto:string; monto:number; fecha:string; estado:string; metodo_pago:string; };
type Vehiculo = { id:string; nombre:string; marca:string; modelo:string; anio:number; patente:string; seguro_vencimiento:string; vtv_vencimiento:string; km_actuales:number; proximo_service_km:number; seguro_compania:string; };
type ServiceVeh = { id:string; tipo:string; descripcion:string; costo:number; km:number; fecha:string; taller:string; };
type MsgIA = { rol:"user"|"assistant"; texto:string };
type LoteResumen = { nombre:string; hectareas:number; cultivo:string; cultivo_completo:string; estado:string; productor_nombre:string; };

// ── Cultivos completos ──
const CULTIVOS = [
  { key:"soja_1", label:"Soja 1º",    color:"#22c55e", grupo:"Verano" },
  { key:"soja_2", label:"Soja 2º",    color:"#86efac", grupo:"Verano" },
  { key:"maiz_1", label:"Maíz 1º",   color:"#eab308", grupo:"Verano" },
  { key:"maiz_2", label:"Maíz 2º",   color:"#fde047", grupo:"Verano" },
  { key:"girasol",label:"Girasol",   color:"#f97316", grupo:"Verano" },
  { key:"sorgo_1",label:"Sorgo 1º",  color:"#ef4444", grupo:"Verano" },
  { key:"sorgo_2",label:"Sorgo 2º",  color:"#fca5a5", grupo:"Verano" },
  { key:"trigo",  label:"Trigo",     color:"#f59e0b", grupo:"Invierno" },
  { key:"cebada", label:"Cebada",    color:"#8b5cf6", grupo:"Invierno" },
  { key:"arveja", label:"Arveja",    color:"#06b6d4", grupo:"Invierno" },
  { key:"carinata",label:"Carinata", color:"#0ea5e9", grupo:"Invierno" },
  { key:"camelina",label:"Camelina", color:"#38bdf8", grupo:"Invierno" },
  { key:"pastura",label:"Pastura",   color:"#10b981", grupo:"Especial", libre:true },
  { key:"otros",  label:"Otros",     color:"#6b7280", grupo:"Especial", libre:true },
];

const CULTIVO_MAP: Record<string,{label:string;color:string}> = {};
CULTIVOS.forEach(c => { CULTIVO_MAP[c.key] = {label:c.label, color:c.color}; });

function getCultivoColor(cultivo: string): string {
  const c = CULTIVOS.find(x => x.label.toLowerCase() === cultivo?.toLowerCase() || x.key === cultivo?.toLowerCase());
  return c?.color ?? "#6b7280";
}

function getCultivoLabel(cultivo: string): string {
  if (!cultivo) return "—";
  const c = CULTIVOS.find(x => x.key === cultivo.toLowerCase() || x.label.toLowerCase() === cultivo.toLowerCase());
  return c?.label ?? cultivo.charAt(0).toUpperCase() + cultivo.slice(1);
}

type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";
const VOZ_COLOR: Record<VozEstado,string> = {idle:"#22c55e",escuchando:"#ef4444",procesando:"#eab308",respondiendo:"#60a5fa",error:"#ef4444"};
const VOZ_ICON: Record<VozEstado,string> = {idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("general");
  const [ingId, setIngId] = useState("");
  const [ingNombre, setIngNombre] = useState("");
  const [ingData, setIngData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVeh[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [lotes, setLotes] = useState<LoteResumen[]>([]);
  const [campanasPorProd, setCampanasPorProd] = useState<Record<string,Campana[]>>({});
  const [campSelProd, setCampSelProd] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editProd, setEditProd] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msj, setMsj] = useState("");
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);
  const [importPrev, setImportPrev] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [fCultivo, setFCultivo] = useState("todos");
  const [fProductor, setFProductor] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [aiChat, setAiChat] = useState<MsgIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [nuevaCampProd, setNuevaCampProd] = useState<string|null>(null);
  const [nuevaCampNombre, setNuevaCampNombre] = useState("");
  const recRef = useRef<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Voz
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const sb = await getSB();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("*").eq("auth_id", user.id).single();
      if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
      setIngId(u.id); setIngNombre(u.nombre); setIngData(u);
      await fetchProds(u.id);
      await fetchCobs(u.id);
      await fetchVehs(u.id);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProds = async (iid: string) => {
    const sb = await getSB();
    const { data: prods } = await sb.from("ing_productores").select("*").eq("ingeniero_id", iid).eq("activo", true).order("nombre");
    setProductores(prods ?? []);
    const cpMap: Record<string,Campana[]> = {};
    const csMap: Record<string,string> = {};
    const lotesAll: LoteResumen[] = [];
    for (const p of (prods ?? [])) {
      if (!p.empresa_id) continue;
      const eid = p.empresa_id;
      const { data: camps } = await sb.from("campanas").select("id,nombre,activa").eq("empresa_id", eid).order("año_inicio", { ascending: false });
      const campList = camps ?? [];
      cpMap[eid] = campList;
      const activa = campList.find((c:any) => c.activa) ?? campList[0];
      if (activa) {
        csMap[eid] = activa.id;
        const { data: ls } = await sb.from("lotes").select("nombre,hectareas,cultivo,cultivo_completo,estado").eq("empresa_id", eid).eq("campana_id", activa.id).eq("es_segundo_cultivo", false);
        (ls ?? []).forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre}));
      }
    }
    setCampanasPorProd(cpMap);
    setCampSelProd(csMap);
    setLotes(lotesAll);
  };

  const cambiarCampana = async (eid: string, campana_id: string, prod_nombre: string) => {
    setCampSelProd(prev => ({...prev, [eid]: campana_id}));
    const sb = await getSB();
    const { data: ls } = await sb.from("lotes").select("nombre,hectareas,cultivo,cultivo_completo,estado").eq("empresa_id", eid).eq("campana_id", campana_id).eq("es_segundo_cultivo", false);
    setLotes(prev => [...prev.filter(l => l.productor_nombre !== prod_nombre), ...(ls ?? []).map((l:any) => ({...l, productor_nombre: prod_nombre}))]);
  };

  const crearCampana = async (eid: string, nombre: string) => {
    const sb = await getSB();
    const parts = nombre.split("/");
    const anioInicio = Number(parts[0]) || new Date().getFullYear();
    const anioFin = Number(parts[1]) || anioInicio + 1;
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", eid);
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id: eid, nombre, año_inicio: anioInicio, año_fin: anioFin, activa: true }).select().single();
    if (nueva) { setCampanasPorProd(prev => ({ ...prev, [eid]: [nueva, ...(prev[eid] ?? [])] })); setCampSelProd(prev => ({ ...prev, [eid]: nueva.id })); m("✅ Campaña creada"); }
  };

  const fetchCobs = async (iid: string) => { try { const sb=await getSB(); const{data}=await sb.from("ing_cobranzas").select("*").eq("ingeniero_id",iid).order("fecha",{ascending:false}); setCobranzas(data??[]); } catch {} };

  const fetchVehs = async (iid: string) => {
    try {
      const sb=await getSB(); const{data}=await sb.from("ing_vehiculos").select("*").eq("ingeniero_id",iid); setVehiculos(data??[]);
      const als:{msg:string;urgencia:string}[]=[]; const hoy=new Date();
      (data??[]).forEach((v:any)=>{
        if(v.seguro_vencimiento){const d=(new Date(v.seguro_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": Seguro VENCIDO",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": Seguro vence en "+Math.round(d)+" días",urgencia:d<=7?"alta":"media"});}
        if(v.vtv_vencimiento){const d=(new Date(v.vtv_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": VTV VENCIDA",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": VTV vence en "+Math.round(d)+" días",urgencia:d<=7?"alta":"media"});}
      });
      setAlertas(als);
    } catch {}
  };

  const m = (t:string) => { setMsj(t); setTimeout(()=>setMsj(""),4000); };

  const guardarProductor = async () => {
    if(!ingId||!form.nombre?.trim()){m("❌ Ingresá el nombre");return;}
    const sb=await getSB();
    let empresa_id=null; let tiene_cuenta=false;
    if(form.email?.trim()){const{data:ue}=await sb.from("usuarios").select("id").eq("email",form.email.trim()).single();if(ue){const{data:emp}=await sb.from("empresas").select("id").eq("propietario_id",ue.id).single();if(emp){empresa_id=emp.id;tiene_cuenta=true;}}}
    const pay={ingeniero_id:ingId,nombre:form.nombre.trim(),telefono:form.telefono??"",email:form.email??"",localidad:form.localidad??"",provincia:form.provincia??"Santa Fe",hectareas_total:Number(form.hectareas_total??0),observaciones:form.obs??"",honorario_tipo:form.honorario_tipo??"mensual",honorario_monto:Number(form.honorario_monto??0),empresa_id,tiene_cuenta,activo:true};
    if(editProd){await sb.from("ing_productores").update(pay).eq("id",editProd);setEditProd(null);}else{
      const{data:nuevo}=await sb.from("ing_productores").insert(pay).select().single();
      if(nuevo&&!empresa_id){const{data:emp}=await sb.from("empresas").insert({nombre:form.nombre.trim()+" (Ing)",propietario_id:ingId}).select().single();if(emp)await sb.from("ing_productores").update({empresa_id:emp.id}).eq("id",nuevo.id);}
    }
    m(tiene_cuenta?"✅ Guardado — con cuenta APP":"✅ Guardado"); await fetchProds(ingId); setShowForm(false); setForm({});
  };

  const vincularCodigo = async () => {
    if(!ingId||!form.codigo?.trim()){m("❌ Ingresá el código");return;}
    const sb=await getSB();
    const{data:u}=await sb.from("usuarios").select("id,nombre").eq("codigo",form.codigo.trim()).single();
    if(!u){m("❌ Código no encontrado");return;}
    let{data:emp}=await sb.from("empresas").select("id").eq("propietario_id",u.id).single();
    if(!emp){const{data:ne}=await sb.from("empresas").insert({nombre:"Empresa de "+u.nombre,propietario_id:u.id}).select().single();emp=ne;}
    if(!emp){m("❌ Error empresa");return;}
    const{data:ex}=await sb.from("ing_productores").select("id").eq("ingeniero_id",ingId).eq("empresa_id",emp.id).single();
    if(!ex)await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:u.nombre,empresa_id:emp.id,tiene_cuenta:true,honorario_tipo:form.honorario_tipo??"mensual",honorario_monto:Number(form.honorario_monto??0),activo:true});
    else await sb.from("ing_productores").update({empresa_id:emp.id,tiene_cuenta:true}).eq("id",ex.id);
    const{data:vex}=await sb.from("vinculaciones").select("id").eq("profesional_id",ingId).eq("empresa_id",emp.id).single();
    if(!vex)await sb.from("vinculaciones").insert({profesional_id:ingId,empresa_id:emp.id,activa:true,rol_profesional:"ingeniero"});
    m("✅ "+u.nombre+" vinculado"); await fetchProds(ingId); setShowVincular(false); setForm({});
  };

  const eliminarProd = async (id:string) => { if(!confirm("¿Eliminar?"))return; const sb=await getSB(); await sb.from("ing_productores").update({activo:false}).eq("id",id); await fetchProds(ingId); };

  const entrar = (p:ProductorIng) => {
    const eid = p.empresa_id ?? p.id;
    const campId = campSelProd[eid] ?? null;
    localStorage.setItem("ing_empresa_id", eid);
    localStorage.setItem("ing_empresa_nombre", p.nombre);
    localStorage.setItem("ing_modo_compartido", p.empresa_id ? "true" : "false");
    if (campId) localStorage.setItem("ing_campana_id", campId);
    window.location.href = "/ingeniero/lotes";
  };

  const guardarCob = async () => {
    if(!ingId)return; const sb=await getSB();
    await sb.from("ing_cobranzas").insert({ingeniero_id:ingId,productor_id:form.prod_c||null,concepto:form.concepto??"",monto:Number(form.monto??0),fecha:form.fecha_c??new Date().toISOString().split("T")[0],estado:form.estado??"pendiente",metodo_pago:form.metodo??""});
    await fetchCobs(ingId); setShowForm(false); setForm({}); m("✅ Cobro registrado");
  };
  const marcarCobrado = async (id:string) => { const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); await fetchCobs(ingId); };

  const guardarVeh = async () => {
    if(!ingId||!form.nombre?.trim())return; const sb=await getSB();
    await sb.from("ing_vehiculos").insert({ingeniero_id:ingId,nombre:form.nombre,marca:form.marca??"",modelo:form.modelo??"",anio:Number(form.anio??0),patente:form.patente??"",seguro_vencimiento:form.seg_venc||null,seguro_compania:form.seg_comp??"",vtv_vencimiento:form.vtv_venc||null,km_actuales:Number(form.km??0),proximo_service_km:Number(form.prox_km??0)});
    await fetchVehs(ingId); setShowForm(false); setForm({}); m("✅ Vehículo guardado");
  };

  const guardarService = async () => {
    if(!vehiculoSel||!ingId)return; const sb=await getSB();
    await sb.from("ing_vehiculo_service").insert({vehiculo_id:vehiculoSel.id,ingeniero_id:ingId,tipo:form.tipo_s??"service",descripcion:form.desc_s??"",costo:Number(form.costo_s??0),km:Number(form.km_s??0),fecha:form.fecha_s??new Date().toISOString().split("T")[0],taller:form.taller??""});
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); m("✅ Service guardado");
  };

  const exportXLS = async (tipo:"productores"|"lotes") => {
    const XLSX=await import("xlsx"); let data:any[]=[];
    if(tipo==="productores")data=productores.map(p=>({NOMBRE:p.nombre,TEL:p.telefono,EMAIL:p.email,LOCALIDAD:p.localidad,HA:lotes.filter(l=>l.productor_nombre===p.nombre).reduce((a,l)=>a+(l.hectareas||0),0),HONORARIO:p.honorario_monto,APP:p.tiene_cuenta?"SI":"NO"}));
    else{let lf=lotes;if(fCultivo!=="todos")lf=lf.filter(l=>(l.cultivo_completo||l.cultivo)===fCultivo);if(fProductor!=="todos")lf=lf.filter(l=>l.productor_nombre===fProductor);if(fEstado!=="todos")lf=lf.filter(l=>l.estado===fEstado);data=lf.map(l=>({PRODUCTOR:l.productor_nombre,LOTE:l.nombre,HA:l.hectareas,CULTIVO:l.cultivo_completo||l.cultivo,ESTADO:l.estado}));}
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,tipo);XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const leerExcel = async (file:File) => {
    setImportMsg("Leyendo...");
    try {
      const XLSX=await import("xlsx");const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if(rows.length<2){setImportMsg("Sin datos");return;}
      const h=rows[0].map((x:any)=>String(x).toLowerCase().trim());
      const cn=h.findIndex((x:string)=>x.includes("nombre")||x.includes("productor"));
      const ct=h.findIndex((x:string)=>x.includes("tel")||x.includes("cel"));
      const cl=h.findIndex((x:string)=>x.includes("local"));
      const cha=h.findIndex((x:string)=>x.includes("ha")||x.includes("hect"));
      const prev=rows.slice(1).filter((r:any)=>r[cn>=0?cn:0]).map((r:any)=>({nombre:String(r[cn>=0?cn:0]).trim(),telefono:ct>=0?String(r[ct]).trim():"",localidad:cl>=0?String(r[cl]).trim():"",hectareas_total:cha>=0?Number(r[cha])||0:0,existe:productores.some(p=>p.nombre.toLowerCase()===String(r[cn>=0?cn:0]).toLowerCase().trim())}));
      setImportPrev(prev);setImportMsg("✅ "+prev.length+" detectados");
    } catch(e:any){setImportMsg("❌ "+e.message);}
  };

  const confirmarImport = async () => {
    const sb=await getSB();let c=0;
    for(const p of importPrev.filter(x=>!x.existe)){
      const{data:nuevo}=await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:p.nombre,telefono:p.telefono,localidad:p.localidad,hectareas_total:p.hectareas_total,honorario_tipo:"mensual",honorario_monto:0,activo:true}).select().single();
      if(nuevo){const{data:emp}=await sb.from("empresas").insert({nombre:p.nombre+" (Ing)",propietario_id:ingId}).select().single();if(emp)await sb.from("ing_productores").update({empresa_id:emp.id}).eq("id",nuevo.id);}
      c++;
    }
    m("✅ "+c+" importados");await fetchProds(ingId);setImportPrev([]);setImportMsg("");setShowImport(false);
  };

  const askAI = async (texto?: string) => {
    const userMsg=(texto??aiInput).trim();
    if(!userMsg)return;
    setAiInput(""); setAiLoad(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    setSeccion("ia_campo");
    try {
      const hist=aiChat.slice(-8).map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:`Asistente agronómico experto Argentina. Respondé técnico y preciso. Ingeniero: ${ingNombre}. Total productores: ${productores.length}. Total ha: ${totalHa}.`,messages:[...hist,{role:"user",content:userMsg}]})});
      const d=await res.json();setAiChat(prev=>[...prev,{rol:"assistant",texto:d.content?.[0]?.text??"Sin respuesta"}]);
    } catch{setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error de conexión"}]);}
    setAiLoad(false);
  };

  // ── Voz ──
  const escucharVoz = () => {
    const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window;
    if(!hasSR){alert("Usá Chrome para reconocimiento de voz");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";rec.continuous=false;
    recRef.current=rec;setVozEstado("escuchando");setVozRespuesta("");setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setVozEstado("procesando");askAI(t);setVozEstado("idle");};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  // ── KPIs ──
  const totalHa = lotes.reduce((a,l) => a + (l.hectareas||0), 0);
  const totPend = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosU = [...new Set(lotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  // ── Gráficos ──
  const haPorCultivo = (() => {
    const mapa: Record<string,{ha:number;color:string}> = {};
    lotes.forEach(l => {
      const label = getCultivoLabel(l.cultivo_completo||l.cultivo||"");
      const color = getCultivoColor(l.cultivo_completo||l.cultivo||"");
      if(!mapa[label]) mapa[label]={ha:0,color};
      mapa[label].ha += l.hectareas||0;
    });
    return Object.entries(mapa).map(([name,v])=>({name,ha:Math.round(v.ha),color:v.color})).sort((a,b)=>b.ha-a.ha);
  })();

  const iCls = "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-green-500 transition-all";
  const lCls = "block text-xs text-gray-400 font-medium mb-1";

  const NAV = [
    { k:"general",    icon:"📊", label:"General" },
    { k:"productores",icon:"👨‍🌾", label:"Mis Productores" },
    { k:"cobranza",   icon:"💰", label:"Cobranza" },
    { k:"vehiculo",   icon:"🚗", label:"Mi Vehículo" },
    { k:"ia_campo",   icon:"🤖", label:"IA Campo" },
  ];

  // Selector de cultivo con opción libre
  const SelectorCultivo = ({value, onChange}: {value:string, onChange:(v:string)=>void}) => {
    const esCultivoLibre = value?.startsWith("libre:");
    const cultivoLibre = esCultivoLibre ? value.replace("libre:","") : "";
    const [showLibre, setShowLibre] = useState(esCultivoLibre);
    const [libreTexto, setLibreTexto] = useState(cultivoLibre);
    const grupos = ["Verano","Invierno","Especial"];
    return (
      <div>
        <select value={showLibre?"libre":value??""} onChange={e=>{
          if(e.target.value==="libre"){setShowLibre(true);onChange("libre:");}
          else{setShowLibre(false);onChange(e.target.value);}
        }} className={iCls}>
          <option value="">Sin cultivo</option>
          {grupos.map(g=>(
            <optgroup key={g} label={g}>
              {CULTIVOS.filter(c=>c.grupo===g).map(c=>(
                <option key={c.key} value={c.libre?"libre":c.key}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {showLibre && (
          <input type="text" value={libreTexto} onChange={e=>{setLibreTexto(e.target.value);onChange("libre:"+e.target.value);}}
            className={iCls+" mt-2"} placeholder="Escribí el cultivo (ej: Alfalfa, Festuca...)"/>
        )}
      </div>
    );
  };

  if(loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-white font-medium">Cargando panel...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex" style={{fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}100%{box-shadow:0 0 0 10px rgba(239,68,68,0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .nav-item{transition:all 0.15s ease;cursor:pointer}
        .nav-item:hover{background:rgba(34,197,94,0.08)!important}
        .nav-active{background:rgba(34,197,94,0.12)!important}
        .card{background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.3)}
        .prod-card{transition:all 0.15s ease}
        .prod-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.4)!important}
        .btn-p{background:#16a34a;color:white;border:none;cursor:pointer;transition:all 0.15s}
        .btn-p:hover{background:#15803d}
        .btn-o{background:white;border:1px solid #374151;color:#d1d5db;cursor:pointer;transition:all 0.15s}
        .btn-o:hover{border-color:#22c55e;color:#22c55e}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#111827}::-webkit-scrollbar-thumb{background:#374151;border-radius:4px}
      `}</style>

      {/* ── SIDEBAR ── */}
      <aside className={`${sidebarOpen?"w-56":"w-16"} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 flex-shrink-0`} style={{minHeight:"100vh"}}>
        <div className="px-3 py-4 border-b border-gray-800 flex items-center gap-2">
          {sidebarOpen
            ? <Image src="/logo.png" alt="AgroGestión PRO" width={120} height={40} className="object-contain"/>
            : <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center"><span className="text-white text-sm font-bold">A</span></div>
          }
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map(item=>(
            <button key={item.k} onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={`nav-item w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left ${seccion===item.k?"nav-active text-green-400":"text-gray-400"}`}>
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {sidebarOpen&&<span className="text-sm font-medium truncate">{item.label}</span>}
              {seccion===item.k&&sidebarOpen&&<div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"/>}
            </button>
          ))}
        </nav>
        <div className="px-2 py-3 border-t border-gray-800 space-y-0.5">
          <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}}
            className="nav-item w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-500 text-left">
            <span className="text-base">🚪</span>
            {sidebarOpen&&<span className="text-sm font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-auto bg-gray-950">
        {/* Topbar */}
        <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h1 className="text-sm font-bold text-white">{NAV.find(n=>n.k===seccion)?.label}</h1>
              <p className="text-xs text-gray-500">{new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"})}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {alertas.length>0&&<div className="w-7 h-7 rounded-full bg-red-900/50 border border-red-700/50 flex items-center justify-center text-red-400 text-xs font-bold">{alertas.length}</div>}
            <div className="w-8 h-8 rounded-full bg-green-900 border border-green-700 flex items-center justify-center">
              <span className="text-green-400 text-xs font-bold">{ingNombre.charAt(0)}</span>
            </div>
            {sidebarOpen&&<div className="hidden md:block"><div className="text-sm font-semibold text-gray-200">{ingNombre}</div><div className="text-xs text-gray-500">Cód. {ingData.codigo}</div></div>}
          </div>
        </div>

        <div className="p-5">
          {/* Toast */}
          {msj&&<div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${msj.startsWith("✅")?"bg-green-950 text-green-400 border border-green-800":"bg-red-950 text-red-400 border border-red-800"}`}>{msj}<button onClick={()=>setMsj("")} className="opacity-60 hover:opacity-100 ml-3">✕</button></div>}

          {/* Alertas */}
          {alertas.length>0&&<div className="mb-4 bg-red-950 border border-red-800 rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="text-red-400 font-semibold text-sm">⚠ {alertas.length} alerta{alertas.length>1?"s":""}</span></div><div className="flex flex-wrap gap-2">{alertas.map((a,i)=><span key={i} className={`text-xs px-3 py-1.5 rounded-full font-medium ${a.urgencia==="alta"?"bg-red-900 text-red-300":"bg-amber-900 text-amber-300"}`}>{a.msg}</span>)}</div></div>}

          {/* ===== GENERAL ===== */}
          {seccion==="general"&&(
            <div>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                {[
                  {l:"Productores",v:productores.length,sub:"Activos",icon:"👨‍🌾",bg:"from-green-900 to-green-800",border:"border-green-700"},
                  {l:"Hectáreas Totales",v:totalHa.toLocaleString("es-AR")+" ha",sub:"Superficie activa",icon:"🌿",bg:"from-emerald-900 to-teal-900",border:"border-emerald-700"},
                  {l:"Lotes Totales",v:lotes.length,sub:"Activos",icon:"🗺️",bg:"from-teal-900 to-cyan-900",border:"border-teal-700"},
                  {l:"Con Cuenta App",v:productores.filter(p=>p.tiene_cuenta).length,sub:"Usuarios",icon:"📱",bg:"from-blue-900 to-indigo-900",border:"border-blue-700"},
                ].map(s=>(
                  <div key={s.l} className={`card bg-gradient-to-br ${s.bg} border ${s.border} rounded-2xl p-5`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-gray-400 font-medium">{s.l}</p>
                        <p className="text-3xl font-bold text-white mt-1">{s.v}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
                      </div>
                      <span className="text-2xl">{s.icon}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gráficos */}
              {haPorCultivo.length>0&&(
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <div className="md:col-span-2 card bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div><h3 className="font-semibold text-white">Hectáreas por Cultivo</h3><p className="text-xs text-gray-500 mt-0.5">Distribución de superficie cultivada</p></div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={haPorCultivo} margin={{top:0,right:0,bottom:0,left:-20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false}/>
                        <XAxis dataKey="name" tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
                        <Tooltip formatter={(v:any)=>[v+" ha","Hectáreas"]} contentStyle={{background:"#111827",border:"1px solid #374151",borderRadius:"10px",fontSize:"12px",color:"white"}}/>
                        <Bar dataKey="ha" radius={[6,6,0,0]}>{haPorCultivo.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-white mb-1">Distribución</h3>
                    <p className="text-xs text-gray-500 mb-3">% por cultivo</p>
                    <div style={{width:"100%",height:130}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={haPorCultivo.map(d=>({...d,value:d.ha}))} cx="50%" cy="50%" outerRadius={55} innerRadius={28} dataKey="value" paddingAngle={3}>
                            {haPorCultivo.map((e,i)=><Cell key={i} fill={e.color}/>)}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>[v+" ha",n]} contentStyle={{background:"#111827",border:"1px solid #374151",borderRadius:"10px",fontSize:"12px",color:"white"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 mt-2">
                      {haPorCultivo.map((d,i)=>(
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:d.color}}/>
                          <span className="text-xs text-gray-400 flex-1 truncate">{d.name}</span>
                          <span className="text-xs font-semibold text-gray-300">{Math.round(d.ha/totalHa*100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen cobranza */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="card bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-white mb-3">💰 Cobranza</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-950 border border-red-900 rounded-xl p-3 text-center"><div className="text-xs text-red-400">Pendiente</div><div className="text-xl font-bold text-red-300 mt-1">${totPend.toLocaleString("es-AR")}</div></div>
                    <div className="bg-green-950 border border-green-900 rounded-xl p-3 text-center"><div className="text-xs text-green-400">Cobrado</div><div className="text-xl font-bold text-green-300 mt-1">${totCob.toLocaleString("es-AR")}</div></div>
                  </div>
                </div>
                <div className="card bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-white mb-3">🚗 Alertas Vehículo</h3>
                  {alertas.length===0
                    ?<p className="text-sm text-gray-500">Sin alertas activas</p>
                    :<div className="space-y-2">{alertas.slice(0,3).map((a,i)=><div key={i} className={`text-xs px-3 py-2 rounded-lg ${a.urgencia==="alta"?"bg-red-950 text-red-400 border border-red-900":"bg-amber-950 text-amber-400 border border-amber-900"}`}>{a.msg}</div>)}</div>
                  }
                </div>
              </div>
            </div>
          )}

          {/* ===== PRODUCTORES ===== */}
          {seccion==="productores"&&(
            <div>
              {/* Acciones */}
              <div className="card bg-gray-900 border border-gray-800 rounded-2xl mb-5 overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-800">
                  {[
                    {icon:"➕",l:"Nuevo Productor",sub:"Registrar nuevo",c:"text-green-400",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},
                    {icon:"📥",l:"Importar",sub:"Desde archivo Excel",c:"text-blue-400",fn:()=>setShowImport(!showImport)},
                    {icon:"📤",l:"Exportar",sub:"Descargar lista",c:"text-purple-400",fn:()=>exportXLS("productores")},
                  ].map(b=>(
                    <button key={b.l} onClick={b.fn} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-800 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">{b.icon}</div>
                      <div><div className={`text-sm font-semibold ${b.c}`}>{b.l}</div><div className="text-xs text-gray-500 mt-0.5">{b.sub}</div></div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={()=>{setShowVincular(!showVincular);setForm({});}} className="mb-4 flex items-center gap-2 text-sm text-blue-400 font-medium hover:underline">
                🔗 Vincular productor por código
              </button>

              {showVincular&&(
                <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-5">
                  <h3 className="font-semibold text-white mb-3">🔗 Vincular por código</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} placeholder="10001"/></div>
                    <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option></select></div>
                    <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                    <button onClick={vincularCodigo} className="btn-p px-4 py-2 rounded-lg text-sm font-semibold">Vincular</button>
                  </div>
                </div>
              )}

              {showImport&&(
                <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-5">
                  <div className="flex justify-between mb-3"><h3 className="font-semibold text-white">📥 Importar productores</h3><button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} className="text-gray-500 hover:text-gray-300">✕</button></div>
                  <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                  {importPrev.length===0
                    ?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-700 rounded-xl text-gray-400 text-sm w-full justify-center hover:border-green-600 hover:text-green-400 transition-colors">📁 Seleccionar archivo Excel</button>
                    :<div>
                      <div className="max-h-40 overflow-y-auto mb-3 rounded-xl border border-gray-700 text-sm">
                        <table className="w-full"><thead className="bg-gray-800"><tr>{["Nombre","Tel","Localidad","Ha","Estado"].map(h=><th key={h} className="text-left px-3 py-2 text-xs text-gray-400 font-medium">{h}</th>)}</tr></thead>
                          <tbody>{importPrev.map((r,i)=><tr key={i} className="border-t border-gray-800"><td className="px-3 py-2 font-medium text-gray-200">{r.nombre}</td><td className="px-3 py-2 text-gray-400">{r.telefono||"—"}</td><td className="px-3 py-2 text-gray-400">{r.localidad||"—"}</td><td className="px-3 py-2 text-gray-300">{r.hectareas_total||"—"}</td><td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.existe?"bg-blue-900 text-blue-300":"bg-green-900 text-green-300"}`}>{r.existe?"Existente":"Nuevo"}</span></td></tr>)}</tbody>
                        </table>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={confirmarImport} className="btn-p px-4 py-2 rounded-lg text-sm font-semibold">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                        <button onClick={()=>setImportPrev([])} className="btn-o px-4 py-2 rounded-lg text-sm">Cancelar</button>
                      </div>
                    </div>
                  }
                  {importMsg&&<p className={`mt-2 text-xs font-medium ${importMsg.startsWith("✅")?"text-green-400":"text-red-400"}`}>{importMsg}</p>}
                </div>
              )}

              {showForm&&(
                <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-5">
                  <h3 className="font-semibold text-white mb-4">{editProd?"✏️ Editar":"➕"} Productor</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                    <div><label className={lCls}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Email (si tiene app)</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Localidad</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Honorario tipo</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                    <div><label className={lCls}>Honorario $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                    <div className="md:col-span-2"><label className={lCls}>Observaciones</label><input type="text" value={form.obs??""} onChange={e=>setForm({...form,obs:e.target.value})} className={iCls}/></div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={guardarProductor} className="btn-p px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button>
                    <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="btn-o px-5 py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Filtros lotes */}
              {lotes.length>0&&(
                <div className="card bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-5">
                  <div className="flex flex-wrap gap-3 items-end">
                    <p className="font-semibold text-gray-300 text-sm self-center mr-1">Exportar lotes:</p>
                    {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                      <div key={l as string}><label className="block text-xs text-gray-500 mb-1">{l as string}</label>
                        <select value={v as string} onChange={e=>(fn as any)(e.target.value)} className={iCls+" min-w-[130px]"}>
                          {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                        </select>
                      </div>
                    ))}
                    <button onClick={()=>exportXLS("lotes")} className="btn-p flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold">📤 Exportar lotes</button>
                  </div>
                </div>
              )}

              {/* Lista productores */}
              {productores.length===0
                ?<div className="card bg-gray-900 border border-gray-800 rounded-2xl p-20 text-center"><div className="text-5xl mb-4 opacity-20">👨‍🌾</div><p className="text-gray-500 font-medium">Sin productores — agregá el primero</p></div>
                :<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {productores.map(p=>{
                    const eid=p.empresa_id??p.id;
                    const camps=campanasPorProd[eid]??[];
                    const campActiva=campSelProd[eid]??null;
                    const lotesP=lotes.filter(l=>l.productor_nombre===p.nombre);
                    const haReales=lotesP.reduce((a,l)=>a+(l.hectareas||0),0);
                    const cultivosProd=[...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                    return(
                      <div key={p.id} className="prod-card card bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden" style={{boxShadow:"0 1px 3px rgba(0,0,0,0.4)"}}>
                        <div className="px-5 pt-5 pb-4 border-b border-gray-800">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-900 to-emerald-800 border border-green-700 flex items-center justify-center flex-shrink-0">
                              <span className="text-green-400 font-bold text-sm">{p.nombre.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-white truncate">{p.nombre}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}</div>
                              {p.tiene_cuenta&&<span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium mt-1">✓ Usa la app</span>}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors text-sm">✏️</button>
                              <button onClick={()=>eliminarProd(p.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-600 hover:text-red-400 transition-colors text-sm">✕</button>
                            </div>
                          </div>
                        </div>
                        <div className="px-5 py-4">
                          {/* Campaña */}
                          <div className="mb-4">
                            <label className="block text-xs text-gray-500 font-medium mb-1.5">CAMPAÑA</label>
                            <div className="flex gap-2 items-center">
                              {camps.length>0
                                ?<select value={campActiva??""} onChange={e=>cambiarCampana(eid,e.target.value,p.nombre)} className={iCls+" flex-1"}>
                                  {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                                </select>
                                :<div className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-500">Sin campañas</div>
                              }
                              <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}}
                                className="px-2.5 py-2 rounded-lg bg-amber-900/50 border border-amber-700 text-amber-400 text-xs font-semibold hover:bg-amber-900 transition-colors flex-shrink-0">
                                + Nueva
                              </button>
                            </div>
                            {nuevaCampProd===p.id&&(
                              <div className="flex gap-2 mt-2">
                                <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} placeholder="2025/2026" className={iCls+" flex-1"}/>
                                <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="px-3 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-600">✓</button>
                                <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="px-2.5 py-2 rounded-lg border border-gray-700 text-gray-400 text-xs">✕</button>
                              </div>
                            )}
                            <div className="text-xs text-gray-600 mt-1.5">{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha en esta campaña</div>
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-amber-950/50 border border-amber-900/50 rounded-xl p-3 text-center">
                              <div className="text-xs text-amber-500">Hectáreas</div>
                              <div className="text-2xl font-bold text-amber-300 mt-0.5">{haReales.toLocaleString("es-AR")}</div>
                            </div>
                            <div className="bg-green-950/50 border border-green-900/50 rounded-xl p-3 text-center">
                              <div className="text-xs text-green-500">Honorario</div>
                              <div className="text-2xl font-bold text-green-300 mt-0.5">${(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                            </div>
                          </div>

                          {/* Cultivos */}
                          {cultivosProd.length>0&&(
                            <div className="flex gap-1.5 flex-wrap mb-4">
                              {cultivosProd.map(c=>{const col=getCultivoColor(c);const lab=getCultivoLabel(c);return(
                                <span key={c} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{background:col+"22",color:col,border:"1px solid "+col+"44"}}>{lab}</span>
                              );})}
                            </div>
                          )}

                          <div className="flex gap-2">
                            {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="p-2.5 rounded-xl bg-green-900/50 border border-green-800 text-green-400 hover:bg-green-900 transition-colors flex-shrink-0">💬</a>}
                            <button onClick={()=>entrar(p)} className="btn-p flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">{p.tiene_cuenta?"🔗 Ver Lotes":"🌾 Mis Lotes"}</button>
                          </div>
                        </div>
                        {p.observaciones&&<div className="px-5 py-3 bg-gray-950/50 border-t border-gray-800 text-xs text-gray-500">{p.observaciones}</div>}
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          )}

          {/* ===== COBRANZA ===== */}
          {seccion==="cobranza"&&(
            <div>
              <div className="flex items-center justify-between mb-5">
                <div><h2 className="text-xl font-bold text-white">Cobranza</h2><div className="flex gap-4 mt-1"><span className="text-sm text-red-400">Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span><span className="text-sm text-green-400">Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span></div></div>
                <div className="flex gap-2">
                  <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} className="btn-o px-4 py-2 rounded-lg text-sm font-medium">📤 Exportar</button>
                  <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} className="btn-p px-4 py-2 rounded-lg text-sm font-semibold">+ Nuevo cobro</button>
                </div>
              </div>
              {showForm&&(
                <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-5">
                  <h3 className="font-semibold text-white mb-4">+ Nuevo cobro</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={lCls}>Productor</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                    <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                    <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                    <div><label className={lCls}>Método</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                  </div>
                  <div className="flex gap-3 mt-4"><button onClick={guardarCob} className="btn-p px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="btn-o px-5 py-2 rounded-lg text-sm">Cancelar</button></div>
                </div>
              )}
              <div className="card bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                {cobranzas.length===0?<div className="text-center py-16 text-gray-500">Sin cobros registrados</div>:(
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="bg-gray-800 border-b border-gray-700"><tr>{["Fecha","Productor","Concepto","Monto","Estado","Método",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-gray-400 font-semibold">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-800">{cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                      <tr key={c.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3.5 text-gray-500">{c.fecha}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-200">{p?.nombre??"—"}</td>
                        <td className="px-5 py-3.5 text-gray-300">{c.concepto}</td>
                        <td className="px-5 py-3.5 font-bold text-amber-400">${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td className="px-5 py-3.5"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.estado==="cobrado"?"bg-green-900 text-green-400":"bg-red-900 text-red-400"}`}>{c.estado}</span></td>
                        <td className="px-5 py-3.5 text-gray-500">{c.metodo_pago||"—"}</td>
                        <td className="px-5 py-3.5 flex gap-2">
                          {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-green-400 text-xs font-medium hover:underline">✓ Cobrado</button>}
                          <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                        </td>
                      </tr>
                    );})}</tbody>
                  </table></div>
                )}
              </div>
            </div>
          )}

          {/* ===== VEHICULO ===== */}
          {seccion==="vehiculo"&&(
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white">Mi Vehículo</h2>
                {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} className="btn-p px-4 py-2 rounded-lg text-sm font-semibold">+ Agregar</button>:(
                  <div className="flex gap-2"><button onClick={()=>{setShowForm(true);setForm({});}} className="btn-o px-4 py-2 rounded-lg text-sm">+ Service</button><button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="btn-o px-4 py-2 rounded-lg text-sm">← Volver</button></div>
                )}
              </div>
              {showForm&&!vehiculoSel&&(
                <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-5">
                  <h3 className="font-semibold text-white mb-4">+ Nuevo vehículo</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                      <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} placeholder={ph as string}/></div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-4"><button onClick={guardarVeh} className="btn-p px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="btn-o px-5 py-2 rounded-lg text-sm">Cancelar</button></div>
                </div>
              )}
              {!vehiculoSel?(
                vehiculos.length===0?<div className="card bg-gray-900 border border-gray-800 rounded-2xl p-20 text-center"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-gray-500">Sin vehículos registrados</p></div>:(
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                      <div key={v.id} className="prod-card card bg-gray-900 border border-gray-800 rounded-2xl p-5" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">🚗</div><div><div className="font-bold text-white">{v.nombre}</div><div className="text-sm text-gray-400">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div></div>
                          <button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} className="text-gray-600 hover:text-red-400 text-sm">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-gray-800 rounded-xl p-3"><div className="text-xs text-gray-500">Km actuales</div><div className="text-xl font-bold text-white mt-0.5">{(v.km_actuales||0).toLocaleString()}</div></div>
                          <div className="bg-amber-950/50 border border-amber-900/50 rounded-xl p-3"><div className="text-xs text-amber-500">Próx. service</div><div className="text-xl font-bold text-amber-300 mt-0.5">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium flex-1 text-center ${sV?"bg-red-900 text-red-400":"bg-green-900/50 text-green-400"}`}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium flex-1 text-center ${vV?"bg-red-900 text-red-400":"bg-green-900/50 text-green-400"}`}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                        </div>
                      </div>
                    );})}
                  </div>
                )
              ):(
                <div>
                  <div className="card bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gray-800 flex items-center justify-center text-3xl">🚗</div>
                    <div><div className="text-xl font-bold text-white">{vehiculoSel.nombre}</div><div className="text-sm text-gray-400">{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                  </div>
                  {showForm&&vehiculoSel&&(
                    <div className="card bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-4">
                      <h3 className="font-semibold text-white mb-4">+ Service</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div><label className={lCls}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                        <div><label className={lCls}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls}/></div>
                      </div>
                      <div className="flex gap-3 mt-4"><button onClick={guardarService} className="btn-p px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="btn-o px-5 py-2 rounded-lg text-sm">Cancelar</button></div>
                    </div>
                  )}
                  <div className="card bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-800"><span className="font-semibold text-white">🔧 Historial de services</span></div>
                    {servicios.length===0?<div className="text-center py-12 text-gray-500 text-sm">Sin historial</div>:(
                      <table className="w-full text-sm"><thead className="bg-gray-800 border-b border-gray-700"><tr>{["Fecha","Tipo","Descripción","Taller","Km","Costo",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-gray-400 font-semibold">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-800">{servicios.map(s=><tr key={s.id} className="hover:bg-gray-800/50"><td className="px-5 py-3.5 text-gray-500">{s.fecha}</td><td className="px-5 py-3.5"><span className="bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full text-xs font-medium border border-amber-800/50">{s.tipo}</span></td><td className="px-5 py-3.5 text-gray-300">{s.descripcion}</td><td className="px-5 py-3.5 text-gray-500">{s.taller}</td><td className="px-5 py-3.5 text-gray-500">{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td className="px-5 py-3.5 font-bold text-red-400">${Number(s.costo).toLocaleString("es-AR")}</td><td className="px-5 py-3.5"><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} className="text-gray-600 hover:text-red-400 text-xs">✕</button></td></tr>)}</tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== IA CAMPO ===== */}
          {seccion==="ia_campo"&&(
            <div>
              <div className="mb-5"><h2 className="text-xl font-bold text-white">IA Campo</h2><p className="text-sm text-gray-500 mt-0.5">Consultas sobre dosis, plagas, enfermedades, cultivos y mercados</p></div>
              {aiChat.length===0&&(
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  {["Dosis glifosato soja","Roya asiática síntomas","Fungicida maíz","Siembra trigo pampeana","Insecticida soja MIP","Precio soja hoy"].map(q=>(
                    <button key={q} onClick={()=>askAI(q)} className="text-left text-sm text-gray-400 border border-gray-700 px-4 py-3 rounded-xl hover:border-green-600 hover:text-green-400 hover:bg-green-950/30 transition-all bg-gray-900">💬 {q}</button>
                  ))}
                </div>
              )}
              <div className="card bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-4">
                <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/><span className="font-medium text-gray-200 text-sm">IA Agronómica</span></div>
                  {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-gray-500 hover:text-gray-300">Limpiar</button>}
                </div>
                <div className="p-5 max-h-96 overflow-y-auto flex flex-col gap-4">
                  {aiChat.length===0&&<div className="text-center py-10 text-gray-600"><div className="text-4xl mb-3">🌾</div><p className="text-sm">Hacé tu consulta agronómica...</p></div>}
                  {aiChat.map((msg,i)=>(
                    <div key={i} className={`flex ${msg.rol==="user"?"justify-end":"justify-start"}`}>
                      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.rol==="user"?"bg-green-700 text-white":"bg-gray-800 text-gray-200 border border-gray-700"}`}>
                        {msg.rol==="assistant"&&<div className="text-xs text-green-400 font-semibold mb-1.5">◆ IA Agronómica</div>}
                        <p className="whitespace-pre-wrap">{msg.texto}</p>
                      </div>
                    </div>
                  ))}
                  {aiLoad&&<div className="flex"><div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>)}</div></div></div>}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={escucharVoz} className="btn-o p-3 rounded-xl text-gray-400 flex-shrink-0">🎤</button>
                <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consultá sobre dosis, plagas, cultivos..." className={iCls+" flex-1"}/>
                <button onClick={()=>askAI()} disabled={aiLoad||!aiInput.trim()} className="btn-p px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex-shrink-0">Enviar →</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── PANEL VOZ FLOTANTE ── */}
      {vozPanel&&(
        <div className="fixed bottom-28 right-6 z-50 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-green-400 text-xs font-bold">🎤 ASISTENTE VOZ</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} className="text-gray-500 hover:text-gray-300 text-sm">✕</button>
          </div>
          <div className="p-4 min-h-16">
            {vozEstado==="escuchando"&&<p className="text-red-400 text-sm animate-pulse">🔴 Escuchando...</p>}
            {vozRespuesta&&<p className="text-gray-200 text-sm leading-relaxed">{vozRespuesta}</p>}
            {vozEstado==="idle"&&!vozRespuesta&&(
              <div className="space-y-1.5">
                {["¿Cuántos productores tengo?","Cuántas ha totales","Dosis glifosato soja"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="w-full text-left text-xs text-gray-500 hover:text-green-400 border border-gray-800 hover:border-green-800 px-3 py-2 rounded-lg transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-gray-800 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){askAI(vozInput);setVozInput("");setVozPanel(false);}}} placeholder="Escribí..." className={iCls+" flex-1 text-xs py-2"}/>
            <button onClick={escucharVoz} className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"22",border:"1px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",boxShadow:"0 4px 20px "+VOZ_COLOR[vozEstado]+"40"}}>
        {VOZ_ICON[vozEstado]}
      </button>
    </div>
  );
}

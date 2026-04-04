"use client";
import { useEffect, useState, useRef, useCallback } from "react";

const getSB = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
};

type Seccion = "perfil"|"productores"|"cobranza"|"vehiculo"|"ia_campo";
type ProductorIng = { id:string; nombre:string; telefono:string; email:string; localidad:string; provincia:string; hectareas_total:number; observaciones:string; empresa_id:string|null; tiene_cuenta:boolean; honorario_tipo:string; honorario_monto:number; };
type Visita = { id:string; productor_id:string; fecha:string; tipo_servicio:string; descripcion:string; lotes:string; observaciones:string; costo:number; };
type Cobranza = { id:string; productor_id:string; concepto:string; monto:number; fecha:string; estado:string; metodo_pago:string; };
type Vehiculo = { id:string; nombre:string; marca:string; modelo:string; anio:number; patente:string; seguro_vencimiento:string; vtv_vencimiento:string; km_actuales:number; proximo_service_km:number; seguro_compania:string; };
type ServiceVeh = { id:string; tipo:string; descripcion:string; costo:number; km:number; fecha:string; taller:string; };
type MsgIA = { rol:"user"|"assistant"; texto:string };

const SERVICIOS = ["Siembra","Cosecha","Aplicacion","Fumigacion","Fertilizacion","Analisis de suelo","Asesoramiento","Recorrida campo","Otro"];

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [ingId, setIngId] = useState("");
  const [ingNombre, setIngNombre] = useState("");
  const [ingData, setIngData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVeh[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [lotes, setLotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVisita, setShowVisita] = useState(false);
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
  const [listening, setListening] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const sb = await getSB();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("*").eq("auth_id", user.id).single();
      if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
      setIngId(u.id); setIngNombre(u.nombre); setIngData(u);
      await Promise.all([fetchProds(u.id), fetchVisitas(u.id), fetchCobs(u.id), fetchVehs(u.id)]);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProds = async (iid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("ing_productores").select("*").eq("ingeniero_id", iid).eq("activo", true).order("nombre");
    setProductores(data ?? []);
    const lotesAll: any[] = [];
    for (const p of (data ?? []).filter((x:any) => x.empresa_id)) {
      const { data: ls } = await sb.from("lotes").select("nombre,hectareas,cultivo,cultivo_completo,estado,fecha_siembra,variedad").eq("empresa_id", p.empresa_id).eq("es_segundo_cultivo", false);
      (ls ?? []).forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre}));
    }
    setLotes(lotesAll);
  };
  const fetchVisitas = async (iid: string) => { try { const sb=await getSB(); const{data}=await sb.from("ing_visitas").select("*").eq("ingeniero_id",iid).order("fecha",{ascending:false}); setVisitas(data??[]); } catch {} };
  const fetchCobs = async (iid: string) => { try { const sb=await getSB(); const{data}=await sb.from("ing_cobranzas").select("*").eq("ingeniero_id",iid).order("fecha",{ascending:false}); setCobranzas(data??[]); } catch {} };
  const fetchVehs = async (iid: string) => {
    try {
      const sb=await getSB(); const{data}=await sb.from("ing_vehiculos").select("*").eq("ingeniero_id",iid); setVehiculos(data??[]);
      const als: {msg:string;urgencia:string}[] = []; const hoy=new Date();
      (data??[]).forEach((v:any)=>{
        if(v.seguro_vencimiento){const d=(new Date(v.seguro_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": Seguro VENCIDO",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": Seguro vence en "+Math.round(d)+" dias",urgencia:d<=7?"alta":"media"});}
        if(v.vtv_vencimiento){const d=(new Date(v.vtv_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": VTV VENCIDA",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": VTV vence en "+Math.round(d)+" dias",urgencia:d<=7?"alta":"media"});}
      });
      setAlertas(als);
    } catch {}
  };

  const m = (t:string) => { setMsj(t); setTimeout(()=>setMsj(""),4000); };

  const guardarPerfil = async () => {
    const sb=await getSB();
    await sb.from("usuarios").update({nombre:form.nombre??ingData.nombre,telefono:form.telefono??"",matricula:form.matricula??"",especialidad:form.especialidad??"",cuit:form.cuit??"",localidad:form.localidad??"",provincia:form.provincia??"",direccion:form.direccion??""}).eq("id",ingId);
    m("✅ PERFIL GUARDADO"); const{data:u}=await (await getSB()).from("usuarios").select("*").eq("id",ingId).single(); if(u){setIngData(u);setIngNombre(u.nombre);}
  };

  const guardarProductor = async () => {
    if(!ingId||!form.nombre?.trim()){m("❌ INGRESA EL NOMBRE");return;}
    const sb=await getSB();
    let empresa_id=null; let tiene_cuenta=false;
    if(form.email?.trim()){const{data:ue}=await sb.from("usuarios").select("id").eq("email",form.email.trim()).single();if(ue){const{data:emp}=await sb.from("empresas").select("id").eq("propietario_id",ue.id).single();if(emp){empresa_id=emp.id;tiene_cuenta=true;}}}
    const pay={ingeniero_id:ingId,nombre:form.nombre.trim(),telefono:form.telefono??"",email:form.email??"",localidad:form.localidad??"",provincia:form.provincia??"Santa Fe",hectareas_total:Number(form.hectareas_total??0),observaciones:form.obs??"",honorario_tipo:form.honorario_tipo??"mensual",honorario_monto:Number(form.honorario_monto??0),empresa_id,tiene_cuenta,activo:true};
    if(editProd){await sb.from("ing_productores").update(pay).eq("id",editProd);setEditProd(null);}else{await sb.from("ing_productores").insert(pay);}
    m(tiene_cuenta?"✅ GUARDADO — CON CUENTA APP":"✅ GUARDADO"); await fetchProds(ingId); setShowForm(false); setForm({});
  };

  const vincularCodigo = async () => {
    if(!ingId||!form.codigo?.trim()){m("❌ INGRESA EL CODIGO");return;}
    const sb=await getSB();
    const{data:u}=await sb.from("usuarios").select("id,nombre").eq("codigo",form.codigo.trim()).single();
    if(!u){m("❌ CODIGO NO ENCONTRADO");return;}
    let{data:emp}=await sb.from("empresas").select("id").eq("propietario_id",u.id).single();
    if(!emp){const{data:ne}=await sb.from("empresas").insert({nombre:"Empresa de "+u.nombre,propietario_id:u.id}).select().single();emp=ne;}
    if(!emp){m("❌ ERROR EMPRESA");return;}
    const{data:ex}=await sb.from("ing_productores").select("id").eq("ingeniero_id",ingId).eq("empresa_id",emp.id).single();
    if(!ex)await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:u.nombre,empresa_id:emp.id,tiene_cuenta:true,honorario_tipo:form.honorario_tipo??"mensual",honorario_monto:Number(form.honorario_monto??0),activo:true});
    else await sb.from("ing_productores").update({empresa_id:emp.id,tiene_cuenta:true}).eq("id",ex.id);
    const{data:vex}=await sb.from("vinculaciones").select("id").eq("profesional_id",ingId).eq("empresa_id",emp.id).single();
    if(!vex)await sb.from("vinculaciones").insert({profesional_id:ingId,empresa_id:emp.id,activa:true,rol_profesional:"ingeniero"});
    m("✅ "+u.nombre+" VINCULADO"); await fetchProds(ingId); setShowVincular(false); setForm({});
  };

  const eliminarProd = async (id:string) => { if(!confirm("Eliminar?"))return; const sb=await getSB(); await sb.from("ing_productores").update({activo:false}).eq("id",id); await fetchProds(ingId); };

  const entrar = (p:ProductorIng) => {
    localStorage.setItem("ing_empresa_id", p.empresa_id ?? p.id);
    localStorage.setItem("ing_empresa_nombre", p.nombre);
    localStorage.setItem("ing_modo_compartido", p.empresa_id ? "true" : "false");
    window.location.href = "/ingeniero/lotes";
  };

  const guardarVisita = async () => {
    if(!ingId||!form.prod_v){m("❌ SELECCIONA PRODUCTOR");return;}
    const sb=await getSB();
    await sb.from("ing_visitas").insert({ingeniero_id:ingId,productor_id:form.prod_v,fecha:form.fecha_v??new Date().toISOString().split("T")[0],tipo_servicio:form.tipo_v??"Asesoramiento",descripcion:form.desc_v??"",lotes:form.lotes_v??"",observaciones:form.obs_v??"",costo:Number(form.costo_v??0)});
    m("✅ VISITA REGISTRADA"); await fetchVisitas(ingId); setShowVisita(false); setForm({});
  };

  const guardarCob = async () => {
    if(!ingId)return; const sb=await getSB();
    await sb.from("ing_cobranzas").insert({ingeniero_id:ingId,productor_id:form.prod_c||null,concepto:form.concepto??"",monto:Number(form.monto??0),fecha:form.fecha_c??new Date().toISOString().split("T")[0],estado:form.estado??"pendiente",metodo_pago:form.metodo??""});
    await fetchCobs(ingId); setShowForm(false); setForm({}); m("✅ COBRO REGISTRADO");
  };

  const marcarCobrado = async (id:string) => { const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); await fetchCobs(ingId); };

  const guardarVeh = async () => {
    if(!ingId||!form.nombre?.trim())return; const sb=await getSB();
    await sb.from("ing_vehiculos").insert({ingeniero_id:ingId,nombre:form.nombre,marca:form.marca??"",modelo:form.modelo??"",anio:Number(form.anio??0),patente:form.patente??"",seguro_vencimiento:form.seg_venc||null,seguro_compania:form.seg_comp??"",vtv_vencimiento:form.vtv_venc||null,km_actuales:Number(form.km??0),proximo_service_km:Number(form.prox_km??0)});
    await fetchVehs(ingId); setShowForm(false); setForm({}); m("✅ VEHICULO GUARDADO");
  };

  const guardarService = async () => {
    if(!vehiculoSel||!ingId)return; const sb=await getSB();
    await sb.from("ing_vehiculo_service").insert({vehiculo_id:vehiculoSel.id,ingeniero_id:ingId,tipo:form.tipo_s??"service",descripcion:form.desc_s??"",costo:Number(form.costo_s??0),km:Number(form.km_s??0),fecha:form.fecha_s??new Date().toISOString().split("T")[0],taller:form.taller??""});
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); m("✅ SERVICE GUARDADO");
  };

  const exportXLS = async (tipo:"productores"|"lotes"|"visitas") => {
    const XLSX=await import("xlsx"); let data:any[]=[];
    if(tipo==="productores")data=productores.map(p=>({NOMBRE:p.nombre,TEL:p.telefono,EMAIL:p.email,LOCALIDAD:p.localidad,HA:p.hectareas_total,HONORARIO:p.honorario_monto,APP:p.tiene_cuenta?"SI":"NO"}));
    else if(tipo==="lotes"){let lf=lotes;if(fCultivo!=="todos")lf=lf.filter((l:any)=>(l.cultivo_completo||l.cultivo)===fCultivo);if(fProductor!=="todos")lf=lf.filter((l:any)=>l.productor_nombre===fProductor);if(fEstado!=="todos")lf=lf.filter((l:any)=>l.estado===fEstado);data=lf.map((l:any)=>({PRODUCTOR:l.productor_nombre,LOTE:l.nombre,HA:l.hectareas,CULTIVO:l.cultivo_completo||l.cultivo,ESTADO:l.estado,SIEMBRA:l.fecha_siembra||"",VARIEDAD:l.variedad||""}));}
    else data=visitas.map(v=>{const p=productores.find(x=>x.id===v.productor_id);return{PRODUCTOR:p?.nombre??"—",FECHA:v.fecha,SERVICIO:v.tipo_servicio,DESC:v.descripcion,LOTES:v.lotes,COSTO:v.costo};});
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,tipo);XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  const leerExcel = async (file:File) => {
    setImportMsg("LEYENDO...");
    try {
      const XLSX=await import("xlsx");const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if(rows.length<2){setImportMsg("SIN DATOS");return;}
      const h=rows[0].map((x:any)=>String(x).toLowerCase().trim());
      const cn=h.findIndex((x:string)=>x.includes("nombre")||x.includes("productor"));
      const ct=h.findIndex((x:string)=>x.includes("tel")||x.includes("cel"));
      const cl=h.findIndex((x:string)=>x.includes("local"));
      const cha=h.findIndex((x:string)=>x.includes("ha")||x.includes("hect"));
      const prev=rows.slice(1).filter((r:any)=>r[cn>=0?cn:0]).map((r:any)=>({nombre:String(r[cn>=0?cn:0]).trim(),telefono:ct>=0?String(r[ct]).trim():"",localidad:cl>=0?String(r[cl]).trim():"",hectareas_total:cha>=0?Number(r[cha])||0:0,existe:productores.some(p=>p.nombre.toLowerCase()===String(r[cn>=0?cn:0]).toLowerCase().trim())}));
      setImportPrev(prev);setImportMsg("✅ "+prev.length+" DETECTADOS");
    } catch(e:any){setImportMsg("❌ "+e.message);}
  };

  const confirmarImport = async () => {
    const sb=await getSB();let c=0;
    for(const p of importPrev.filter(x=>!x.existe)){await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:p.nombre,telefono:p.telefono,localidad:p.localidad,hectareas_total:p.hectareas_total,honorario_tipo:"mensual",honorario_monto:0,activo:true});c++;}
    m("✅ "+c+" IMPORTADOS");await fetchProds(ingId);setImportPrev([]);setImportMsg("");setShowImport(false);
  };

  const askAI = async () => {
    if(!aiInput.trim())return;const userMsg=aiInput.trim();setAiInput("");setAiLoad(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    try {
      const hist=aiChat.map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:"Asistente agronomico experto Argentina. Respondé técnico. Ingeniero: "+ingNombre+".",messages:[...hist,{role:"user",content:userMsg}]})});
      const d=await res.json();setAiChat(prev=>[...prev,{rol:"assistant",texto:d.content?.[0]?.text??"Sin respuesta"}]);
    } catch{setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error IA"}]);}
    setAiLoad(false);
  };

  const totalHa=productores.reduce((a,p)=>a+(p.hectareas_total||0),0);
  const totPend=cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob=cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosU=[...new Set(lotes.map((l:any)=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  const iCls="w-full bg-[#0a1628] border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono";
  const lCls="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  if(loading) return <div style={{minHeight:"100vh",background:"#020810",display:"flex",alignItems:"center",justifyContent:"center",color:"#00FF80",fontFamily:"monospace",fontSize:"1rem"}}>CARGANDO...</div>;

  return (
    <div style={{minHeight:"100vh",background:"#020810",color:"#E5E7EB",position:"relative"}}>
      <style>{`
        .ci{background:rgba(10,22,40,0.9);border:1px solid rgba(0,255,128,0.15);border-radius:12px}
        .ci:hover{border-color:rgba(0,255,128,0.4)}
        .sa{border-color:#00FF80!important;color:#00FF80!important;background:rgba(0,255,128,0.1)!important}
        *{box-sizing:border-box}
      `}</style>

      {/* BG — pointer-events-none para que no bloquee clicks */}
      <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:"url('/dashboard-bg.png')",backgroundSize:"cover",backgroundPosition:"center",opacity:0.3,pointerEvents:"none"}}/>
      <div style={{position:"fixed",inset:0,zIndex:1,background:"rgba(2,8,16,0.75)",pointerEvents:"none"}}/>

      {/* TODO EL CONTENIDO en z-index 10 */}
      <div style={{position:"relative",zIndex:10}}>

        {/* HEADER */}
        <div style={{background:"rgba(2,8,16,0.95)",borderBottom:"1px solid rgba(0,255,128,0.2)",padding:"12px 24px",display:"flex",alignItems:"center",gap:16}}>
          <span style={{color:"#00FF80",fontFamily:"monospace",fontWeight:"bold",cursor:"pointer"}} onClick={()=>window.location.href="/ingeniero"}>AGROGESTION PRO</span>
          <div style={{flex:1}}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:"#E5E7EB",fontFamily:"monospace",fontWeight:"bold"}}>{ingNombre}</div>
            <div style={{fontSize:11,color:"#60A5FA",fontFamily:"monospace"}}>INGENIERO · COD {ingData.codigo}</div>
          </div>
          {alertas.length>0&&<div style={{width:28,height:28,borderRadius:"50%",background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F87171",fontSize:11,fontWeight:"bold"}}>{alertas.length}</div>}
          <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} style={{fontSize:11,color:"#4B5563",fontFamily:"monospace",background:"none",border:"none",cursor:"pointer"}}>Salir</button>
        </div>

        <div style={{maxWidth:1280,margin:"0 auto",padding:24}}>
          <div style={{marginBottom:20}}>
            <h1 style={{fontSize:24,fontWeight:"bold",color:"#E5E7EB",fontFamily:"monospace",margin:0}}>◆ PANEL INGENIERO AGRONOMO</h1>
            <p style={{color:"#00FF80",fontSize:11,fontFamily:"monospace",marginTop:4,letterSpacing:2}}>{productores.length} PRODUCTORES · {totalHa.toLocaleString("es-AR")} HA · IA ACTIVA</p>
          </div>

          {alertas.length>0&&<div style={{background:"rgba(10,22,40,0.8)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:12,padding:16,marginBottom:20}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#F87171"}}/><span style={{color:"#F87171",fontSize:11,fontFamily:"monospace",fontWeight:"bold"}}>ALERTAS ({alertas.length})</span></div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{alertas.map((a,i)=><div key={i} style={{padding:"4px 12px",borderRadius:8,fontSize:11,fontFamily:"monospace",border:a.urgencia==="alta"?"1px solid rgba(248,113,113,0.3)":"1px solid rgba(201,162,39,0.3)",color:a.urgencia==="alta"?"#F87171":"#C9A227"}}>{a.urgencia==="alta"?"🔴":"🟡"} {a.msg}</div>)}</div></div>}

          {msj&&<div style={{marginBottom:16,padding:"8px 16px",borderRadius:8,fontSize:13,fontFamily:"monospace",border:msj.startsWith("✅")?"1px solid rgba(74,222,128,0.3)":"1px solid rgba(248,113,113,0.3)",color:msj.startsWith("✅")?"#4ADE80":"#F87171",background:msj.startsWith("✅")?"rgba(74,222,128,0.05)":"rgba(248,113,113,0.05)",display:"flex",justifyContent:"space-between"}}>{msj}<button onClick={()=>setMsj("")} style={{background:"none",border:"none",color:"inherit",cursor:"pointer"}}>✕</button></div>}

          {/* TABS */}
          <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
            {[{k:"perfil",l:"👨‍💼 MI PERFIL"},{k:"productores",l:"👨‍🌾 MIS PRODUCTORES"},{k:"cobranza",l:"💰 COBRANZA"},{k:"vehiculo",l:"🚗 MI VEHICULO"},{k:"ia_campo",l:"🤖 IA CAMPO"}].map(s=>(
              <button key={s.k} onClick={()=>{setSeccion(s.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
                style={{padding:"10px 20px",borderRadius:12,border:seccion===s.k?"1px solid #00FF80":"1px solid rgba(0,255,128,0.15)",background:seccion===s.k?"rgba(0,255,128,0.1)":"transparent",color:seccion===s.k?"#00FF80":"#4B5563",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>
                {s.l}
              </button>
            ))}
          </div>

          {/* PERFIL */}
          {seccion==="perfil"&&(
            <div className="ci" style={{padding:24}}>
              <h2 style={{color:"#60A5FA",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:20}}>👨‍💼 MIS DATOS PROFESIONALES</h2>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
                {[["nombre","NOMBRE",ingData.nombre??"",[],false],["telefono","TELEFONO",ingData.telefono??"",[],false],["matricula","MATRICULA",ingData.matricula??"",[],false],["especialidad","ESPECIALIDAD",ingData.especialidad??"",[],false],["cuit","CUIT",ingData.cuit??"",[],false],["localidad","LOCALIDAD",ingData.localidad??"",[],false],["provincia","PROVINCIA",ingData.provincia??"Santa Fe",[],false],["direccion","DIRECCION",ingData.direccion??"",[],true]].map(([k,l,def,,wide])=>(
                  <div key={k as string} style={{gridColumn:wide?"1/-1":"auto"}}>
                    <label style={{display:"block",fontSize:10,color:"#4B6B5B",textTransform:"uppercase",letterSpacing:2,marginBottom:4,fontFamily:"monospace"}}>{l as string}</label>
                    <input type="text" defaultValue={def as string} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} style={{width:"100%"}}/>
                  </div>
                ))}
              </div>
              <div style={{marginTop:16,padding:16,background:"rgba(2,8,16,0.4)",borderRadius:12,border:"1px solid rgba(96,165,250,0.15)"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,textAlign:"center",fontFamily:"monospace",fontSize:12}}>
                  <div><div style={{color:"#4B5563"}}>CODIGO</div><div style={{color:"#60A5FA",fontWeight:"bold",fontSize:18,marginTop:4}}>{ingData.codigo}</div></div>
                  <div><div style={{color:"#4B5563"}}>EMAIL</div><div style={{color:"#E5E7EB",marginTop:4,fontSize:11}}>{ingData.email}</div></div>
                  <div><div style={{color:"#4B5563"}}>ROL</div><div style={{color:"#60A5FA",fontWeight:"bold",marginTop:4}}>INGENIERO</div></div>
                </div>
              </div>
              <button onClick={guardarPerfil} style={{marginTop:16,padding:"10px 24px",borderRadius:12,background:"rgba(96,165,250,0.1)",border:"1px solid rgba(96,165,250,0.3)",color:"#60A5FA",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR PERFIL</button>
            </div>
          )}

          {/* MIS PRODUCTORES */}
          {seccion==="productores"&&(
            <div>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                {[{l:"PRODUCTORES",v:String(productores.length),c:"#E5E7EB"},{l:"HA TOTALES",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"LOTES APP",v:String(lotes.length),c:"#4ADE80"},{l:"CON CUENTA APP",v:String(productores.filter(p=>p.tiene_cuenta).length),c:"#60A5FA"}].map(s=>(
                  <div key={s.l} className="ci" style={{padding:16,textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#4B5563",fontFamily:"monospace"}}>{s.l}</div>
                    <div style={{fontSize:22,fontWeight:"bold",fontFamily:"monospace",marginTop:4,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Botones acción */}
              <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                {[{l:"+ NUEVO PRODUCTOR",c:"#00FF80",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},{l:"🔗 VINCULAR POR CODIGO",c:"#60A5FA",fn:()=>{setShowVincular(!showVincular);setForm({});}},{l:"+ REGISTRAR VISITA",c:"#C9A227",fn:()=>{setShowVisita(!showVisita);setForm({fecha_v:new Date().toISOString().split("T")[0]});}},{l:"📥 IMPORTAR",c:"#C9A227",fn:()=>setShowImport(!showImport)},{l:"📤 EXPORTAR",c:"#4ADE80",fn:()=>exportXLS("productores")}].map(b=>(
                  <button key={b.l} onClick={b.fn} style={{padding:"8px 16px",borderRadius:12,background:"transparent",border:`1px solid ${b.c}40`,color:b.c,fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>{b.l}</button>
                ))}
              </div>

              {/* Vincular */}
              {showVincular&&(
                <div className="ci" style={{padding:20,marginBottom:16}}>
                  <h3 style={{color:"#60A5FA",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:8}}>🔗 VINCULAR POR CODIGO</h3>
                  <p style={{color:"#4B5563",fontSize:11,fontFamily:"monospace",marginBottom:12}}>Ingresa el codigo del productor (ej: 10001)</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:12,alignItems:"end"}}>
                    <div><label className={lCls}>CODIGO *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} placeholder="10001"/></div>
                    <div><label className={lCls}>HONORARIO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                    <div><label className={lCls}>MONTO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                    <button onClick={vincularCodigo} style={{padding:"10px 20px",borderRadius:12,background:"rgba(96,165,250,0.1)",border:"1px solid rgba(96,165,250,0.3)",color:"#60A5FA",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>▶ VINCULAR</button>
                  </div>
                </div>
              )}

              {/* Form visita */}
              {showVisita&&(
                <div className="ci" style={{padding:20,marginBottom:16}}>
                  <h3 style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:16}}>+ REGISTRAR VISITA</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    <div><label className={lCls}>PRODUCTOR</label><select value={form.prod_v??""} onChange={e=>setForm({...form,prod_v:e.target.value})} className={iCls}><option value="">Seleccionar</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                    <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_v??""} onChange={e=>setForm({...form,fecha_v:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>TIPO SERVICIO</label><select value={form.tipo_v??"Asesoramiento"} onChange={e=>setForm({...form,tipo_v:e.target.value})} className={iCls}>{SERVICIOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label className={lCls}>COSTO $</label><input type="number" value={form.costo_v??""} onChange={e=>setForm({...form,costo_v:e.target.value})} className={iCls} placeholder="0"/></div>
                    <div style={{gridColumn:"span 2"}}><label className={lCls}>DESCRIPCION</label><input type="text" value={form.desc_v??""} onChange={e=>setForm({...form,desc_v:e.target.value})} className={iCls} placeholder="Detalle..."/></div>
                    <div><label className={lCls}>LOTES</label><input type="text" value={form.lotes_v??""} onChange={e=>setForm({...form,lotes_v:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.obs_v??""} onChange={e=>setForm({...form,obs_v:e.target.value})} className={iCls}/></div>
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:16}}>
                    <button onClick={guardarVisita} style={{padding:"10px 24px",borderRadius:12,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.4)",color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR</button>
                    <button onClick={()=>{setShowVisita(false);setForm({});}} style={{padding:"10px 24px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none"}}>CANCELAR</button>
                  </div>
                </div>
              )}

              {/* Import */}
              {showImport&&(
                <div className="ci" style={{padding:20,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",margin:0}}>📥 IMPORTAR</h3><button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",fontSize:14}}>✕</button></div>
                  <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                  {importPrev.length===0
                    ?<button onClick={()=>importRef.current?.click()} style={{padding:"12px 24px",border:"1px dashed rgba(201,162,39,0.4)",borderRadius:12,color:"#C9A227",fontFamily:"monospace",fontSize:12,cursor:"pointer",background:"none",width:"100%"}}>📁 SELECCIONAR ARCHIVO</button>
                    :<div>
                      <div style={{maxHeight:120,overflowY:"auto",marginBottom:12,border:"1px solid rgba(201,162,39,0.15)",borderRadius:8}}>
                        <table style={{width:"100%",fontSize:11,fontFamily:"monospace"}}><thead><tr style={{borderBottom:"1px solid rgba(201,162,39,0.1)"}}>{["NOMBRE","TEL","LOCALIDAD","HA","ESTADO"].map(h=><th key={h} style={{padding:"6px 12px",textAlign:"left",color:"#4B5563"}}>{h}</th>)}</tr></thead><tbody>{importPrev.map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(201,162,39,0.05)"}}><td style={{padding:"6px 12px",color:"#E5E7EB",fontWeight:"bold"}}>{r.nombre}</td><td style={{padding:"6px 12px",color:"#9CA3AF"}}>{r.telefono||"—"}</td><td style={{padding:"6px 12px",color:"#9CA3AF"}}>{r.localidad||"—"}</td><td style={{padding:"6px 12px",color:"#C9A227"}}>{r.hectareas_total||"—"}</td><td style={{padding:"6px 12px",color:r.existe?"#60A5FA":"#4ADE80"}}>{r.existe?"Ya existe":"Nuevo"}</td></tr>)}</tbody></table>
                      </div>
                      <div style={{display:"flex",gap:12}}>
                        <button onClick={confirmarImport} style={{padding:"8px 16px",borderRadius:8,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.3)",color:"#C9A227",fontFamily:"monospace",fontSize:11,fontWeight:"bold",cursor:"pointer"}}>▶ IMPORTAR {importPrev.filter(p=>!p.existe).length} NUEVOS</button>
                        <button onClick={()=>setImportPrev([])} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:11,cursor:"pointer",background:"none"}}>CANCELAR</button>
                      </div>
                    </div>
                  }
                  {importMsg&&<p style={{marginTop:8,fontSize:11,fontFamily:"monospace",color:importMsg.startsWith("✅")?"#4ADE80":"#F87171"}}>{importMsg}</p>}
                </div>
              )}

              {/* Form nuevo/editar */}
              {showForm&&(
                <div className="ci" style={{padding:20,marginBottom:16}}>
                  <h3 style={{color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:16}}>{editProd?"✏️ EDITAR":"+"} PRODUCTOR</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                    <div><label className={lCls}>TELEFONO</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
                    <div><label className={lCls}>EMAIL (si tiene app)</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>HECTAREAS</label><input type="number" value={form.hectareas_total??""} onChange={e=>setForm({...form,hectareas_total:e.target.value})} className={iCls} placeholder="0"/></div>
                    <div><label className={lCls}>HONORARIO TIPO</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                    <div><label className={lCls}>HONORARIO $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                    <div><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.obs??""} onChange={e=>setForm({...form,obs:e.target.value})} className={iCls}/></div>
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:16}}>
                    <button onClick={guardarProductor} style={{padding:"10px 24px",borderRadius:12,background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR</button>
                    <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} style={{padding:"10px 24px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none"}}>CANCELAR</button>
                  </div>
                </div>
              )}

              {/* Exportar lotes */}
              {lotes.length>0&&(
                <div className="ci" style={{padding:16,marginBottom:16}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
                    <span style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold"}}>📊 EXPORTAR LOTES:</span>
                    {[["CULTIVO",fCultivo,setFCultivo,["todos",...cultivosU]],["PRODUCTOR",fProductor,setFProductor,["todos",...productores.filter(p=>p.tiene_cuenta).map(p=>p.nombre)]],["ESTADO",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                      <div key={l as string}><label className={lCls}>{l as string}</label><select value={v as string} onChange={e=>(fn as any)(e.target.value)} className={iCls} style={{width:140}}>{(opts as string[]).map(o=><option key={o} value={o}>{o.toUpperCase()}</option>)}</select></div>
                    ))}
                    <button onClick={()=>exportXLS("lotes")} style={{padding:"10px 20px",borderRadius:12,background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.3)",color:"#4ADE80",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>📤 EXPORTAR</button>
                  </div>
                </div>
              )}

              {/* Lista productores */}
              {productores.length===0
                ?<div className="ci" style={{textAlign:"center",padding:80}}><div style={{fontSize:48,opacity:0.2,marginBottom:16}}>👨‍🌾</div><p style={{color:"#4B5563",fontFamily:"monospace",fontSize:13}}>SIN PRODUCTORES — AGREGA O VINCULA UNO</p></div>
                :<div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16,marginBottom:24}}>
                    {productores.map(p=>(
                      <div key={p.id} className="ci" style={{overflow:"hidden"}}>
                        <div style={{padding:20}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👨‍🌾</div>
                              <div>
                                <div style={{fontWeight:"bold",color:"#E5E7EB",fontFamily:"monospace",textTransform:"uppercase"}}>{p.nombre}</div>
                                <div style={{fontSize:11,color:"#4B5563",fontFamily:"monospace"}}>{p.localidad}{p.provincia?", "+p.provincia:""}</div>
                                {p.tiene_cuenta&&<div style={{fontSize:11,color:"#4ADE80",fontFamily:"monospace",fontWeight:"bold"}}>✓ USA LA APP</div>}
                              </div>
                            </div>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",hectareas_total:String(p.hectareas_total||0),honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} style={{fontSize:12,padding:"4px 8px",borderRadius:6,background:"rgba(201,162,39,0.1)",border:"none",color:"#C9A227",cursor:"pointer"}}>✏️</button>
                              <button onClick={()=>eliminarProd(p.id)} style={{fontSize:12,padding:"4px 8px",borderRadius:6,background:"none",border:"none",color:"#4B5563",cursor:"pointer"}}>✕</button>
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                            <div style={{background:"rgba(2,8,16,0.4)",borderRadius:8,padding:10,textAlign:"center"}}><div style={{fontSize:10,color:"#4B5563",fontFamily:"monospace"}}>HA</div><div style={{fontWeight:"bold",color:"#C9A227",fontFamily:"monospace",marginTop:2}}>{(p.hectareas_total||0).toLocaleString("es-AR")}</div></div>
                            <div style={{background:"rgba(2,8,16,0.4)",borderRadius:8,padding:10,textAlign:"center"}}><div style={{fontSize:10,color:"#4B5563",fontFamily:"monospace"}}>HONORARIO</div><div style={{fontWeight:"bold",color:"#00FF80",fontFamily:"monospace",marginTop:2}}>${(p.honorario_monto||0).toLocaleString("es-AR")}</div></div>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" style={{flex:1,textAlign:"center",padding:"8px",borderRadius:8,background:"rgba(37,211,102,0.1)",border:"1px solid rgba(37,211,102,0.3)",color:"#25D366",fontSize:11,fontFamily:"monospace",fontWeight:"bold",textDecoration:"none"}}>💬 WA</a>}
                            <button onClick={()=>entrar(p)} style={{flex:1,padding:"8px",borderRadius:8,background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",color:"#00FF80",fontSize:11,fontFamily:"monospace",fontWeight:"bold",cursor:"pointer"}}>{p.tiene_cuenta?"🔗 LOTES COMPARTIDOS":"🌾 MIS LOTES"}</button>
                          </div>
                        </div>
                        {p.observaciones&&<div style={{borderTop:"1px solid rgba(0,255,128,0.1)",padding:"8px 20px",fontSize:11,color:"#4B5563",fontFamily:"monospace"}}>{p.observaciones}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Historial visitas */}
                  <div className="ci" style={{overflow:"hidden"}}>
                    <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(201,162,39,0.15)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold"}}>📋 HISTORIAL DE VISITAS</span>
                      <button onClick={()=>exportXLS("visitas")} style={{fontSize:11,color:"#4ADE80",border:"1px solid rgba(74,222,128,0.2)",padding:"4px 12px",borderRadius:6,fontFamily:"monospace",cursor:"pointer",background:"none"}}>📤 EXPORTAR</button>
                    </div>
                    {visitas.length===0
                      ?<div style={{textAlign:"center",padding:40,color:"#4B5563",fontFamily:"monospace",fontSize:13}}>SIN VISITAS</div>
                      :<div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,fontFamily:"monospace"}}><thead><tr style={{borderBottom:"1px solid rgba(201,162,39,0.1)"}}>{["FECHA","PRODUCTOR","SERVICIO","DESCRIPCION","LOTES","COSTO",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 16px",fontSize:11,color:"#4B5563"}}>{h}</th>)}</tr></thead>
                        <tbody>{visitas.slice(0,20).map(v=>{const p=productores.find(x=>x.id===v.productor_id);return(
                          <tr key={v.id} style={{borderBottom:"1px solid rgba(201,162,39,0.05)"}}>
                            <td style={{padding:"12px 16px",color:"#6B7280"}}>{v.fecha}</td>
                            <td style={{padding:"12px 16px",color:"#E5E7EB",fontWeight:"bold"}}>{p?.nombre??"—"}</td>
                            <td style={{padding:"12px 16px"}}><span style={{background:"rgba(201,162,39,0.1)",color:"#C9A227",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:"bold"}}>{v.tipo_servicio}</span></td>
                            <td style={{padding:"12px 16px",color:"#E5E7EB"}}>{v.descripcion}</td>
                            <td style={{padding:"12px 16px",color:"#9CA3AF"}}>{v.lotes||"—"}</td>
                            <td style={{padding:"12px 16px",fontWeight:"bold",color:"#C9A227"}}>{v.costo?"$"+Number(v.costo).toLocaleString("es-AR"):"-"}</td>
                            <td style={{padding:"12px 16px"}}><button onClick={async()=>{const sb=await getSB();await sb.from("ing_visitas").delete().eq("id",v.id);await fetchVisitas(ingId);}} style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",fontSize:12}}>✕</button></td>
                          </tr>
                        );})}</tbody>
                      </table></div>
                    }
                  </div>
                </div>
              }
            </div>
          )}

          {/* COBRANZA */}
          {seccion==="cobranza"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                <div><h2 style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:"#E5E7EB",margin:0}}>💰 COBRANZA</h2><div style={{display:"flex",gap:16,marginTop:4}}><span style={{fontSize:11,fontFamily:"monospace",color:"#F87171"}}>Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span><span style={{fontSize:11,fontFamily:"monospace",color:"#4ADE80"}}>Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span></div></div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} style={{padding:"8px 16px",borderRadius:12,border:"1px solid rgba(74,222,128,0.3)",color:"#4ADE80",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer",background:"none"}}>📤 EXPORTAR</button>
                  <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} style={{padding:"8px 16px",borderRadius:12,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.3)",color:"#C9A227",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>+ NUEVO COBRO</button>
                </div>
              </div>
              {showForm&&(
                <div className="ci" style={{padding:20,marginBottom:20}}>
                  <h3 style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:16}}>+ COBRO</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                    <div><label className={lCls}>PRODUCTOR</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                    <div><label className={lCls}>CONCEPTO</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                    <div><label className={lCls}>MONTO</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>ESTADO</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                    <div><label className={lCls}>METODO</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:16}}>
                    <button onClick={guardarCob} style={{padding:"10px 24px",borderRadius:12,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.3)",color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR</button>
                    <button onClick={()=>{setShowForm(false);setForm({});}} style={{padding:"10px 24px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none"}}>CANCELAR</button>
                  </div>
                </div>
              )}
              <div className="ci" style={{overflow:"hidden"}}>
                {cobranzas.length===0?<div style={{textAlign:"center",padding:60,color:"#4B5563",fontFamily:"monospace"}}>SIN COBROS</div>:(
                  <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,fontFamily:"monospace"}}><thead><tr style={{borderBottom:"1px solid rgba(0,255,128,0.1)"}}>{["FECHA","PRODUCTOR","CONCEPTO","MONTO","ESTADO","METODO",""].map(h=><th key={h} style={{textAlign:"left",padding:"12px 16px",fontSize:11,color:"#4B5563"}}>{h}</th>)}</tr></thead>
                    <tbody>{cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                      <tr key={c.id} style={{borderBottom:"1px solid rgba(0,255,128,0.05)"}}>
                        <td style={{padding:"12px 16px",color:"#9CA3AF"}}>{c.fecha}</td>
                        <td style={{padding:"12px 16px",color:"#E5E7EB"}}>{p?.nombre??"—"}</td>
                        <td style={{padding:"12px 16px",color:"#E5E7EB"}}>{c.concepto}</td>
                        <td style={{padding:"12px 16px",fontWeight:"bold",color:"#C9A227"}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td style={{padding:"12px 16px"}}><span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:c.estado==="cobrado"?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)",color:c.estado==="cobrado"?"#4ADE80":"#F87171"}}>{c.estado}</span></td>
                        <td style={{padding:"12px 16px",color:"#9CA3AF"}}>{c.metodo_pago||"—"}</td>
                        <td style={{padding:"12px 16px",display:"flex",gap:8}}>
                          {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} style={{background:"none",border:"none",color:"#4ADE80",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>✓</button>}
                          <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",fontSize:12}}>✕</button>
                        </td>
                      </tr>
                    );})}</tbody>
                  </table></div>
                )}
              </div>
            </div>
          )}

          {/* VEHICULO */}
          {seccion==="vehiculo"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <h2 style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:"#E5E7EB",margin:0}}>🚗 MI VEHICULO</h2>
                {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} style={{padding:"8px 16px",borderRadius:12,background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",color:"#00FF80",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>+ AGREGAR</button>:(
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setShowForm(true);setForm({});}} style={{padding:"8px 16px",borderRadius:12,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.3)",color:"#C9A227",fontFamily:"monospace",fontSize:12,fontWeight:"bold",cursor:"pointer"}}>+ SERVICE</button>
                    <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} style={{padding:"8px 16px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:12,cursor:"pointer",background:"none"}}>← VOLVER</button>
                  </div>
                )}
              </div>
              {showForm&&!vehiculoSel&&(
                <div className="ci" style={{padding:20,marginBottom:20}}>
                  <h3 style={{color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:16}}>+ NUEVO VEHICULO</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[["nombre","NOMBRE","Toyota Hilux","text"],["marca","MARCA","","text"],["modelo","MODELO","","text"],["anio","AÑO","","number"],["patente","PATENTE","","text"],["seg_comp","COMP. SEGURO","","text"],["seg_venc","VENC. SEGURO","","date"],["vtv_venc","VENC. VTV","","date"],["km","KM ACTUALES","","number"],["prox_km","PROX. SERVICE KM","","number"]].map(([k,l,ph,t])=>(
                      <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} placeholder={ph as string}/></div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:16}}>
                    <button onClick={guardarVeh} style={{padding:"10px 24px",borderRadius:12,background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR</button>
                    <button onClick={()=>{setShowForm(false);setForm({});}} style={{padding:"10px 24px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none"}}>CANCELAR</button>
                  </div>
                </div>
              )}
              {!vehiculoSel
                ?(vehiculos.length===0?<div className="ci" style={{textAlign:"center",padding:80}}><div style={{fontSize:48,opacity:0.2}}>🚗</div><p style={{color:"#4B5563",fontFamily:"monospace",fontSize:13,marginTop:16}}>SIN VEHICULOS</p></div>
                  :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
                    {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                      <div key={v.id} className="ci" style={{padding:20,cursor:"pointer"}} onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:28}}>🚗</span><div><div style={{fontWeight:"bold",color:"#E5E7EB",fontFamily:"monospace"}}>{v.nombre}</div><div style={{fontSize:11,color:"#4B5563",fontFamily:"monospace"}}>{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div></div><button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",fontSize:12}}>✕</button></div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                          <div style={{background:"rgba(2,8,16,0.6)",borderRadius:8,padding:12}}><div style={{fontSize:10,color:"#4B5563",fontFamily:"monospace"}}>KM</div><div style={{fontSize:18,fontWeight:"bold",color:"#00FF80",fontFamily:"monospace"}}>{(v.km_actuales||0).toLocaleString()}</div></div>
                          <div style={{background:"rgba(2,8,16,0.6)",borderRadius:8,padding:12}}><div style={{fontSize:10,color:"#4B5563",fontFamily:"monospace"}}>PROX. SERVICE</div><div style={{fontSize:18,fontWeight:"bold",color:"#C9A227",fontFamily:"monospace"}}>{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,padding:"4px 8px",borderRadius:4,background:sV?"rgba(248,113,113,0.1)":"rgba(74,222,128,0.1)",color:sV?"#F87171":"#4ADE80",fontFamily:"monospace"}}>🛡️ {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                          <span style={{fontSize:11,padding:"4px 8px",borderRadius:4,background:vV?"rgba(248,113,113,0.1)":"rgba(74,222,128,0.1)",color:vV?"#F87171":"#4ADE80",fontFamily:"monospace"}}>📋 VTV {vV?"VENCIDA":v.vtv_vencimiento||"—"}</span>
                        </div>
                      </div>
                    );})}
                  </div>
                ):(
                  <div>
                    <div className="ci" style={{padding:20,marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:16}}><span style={{fontSize:36}}>🚗</span><div><div style={{fontSize:20,fontWeight:"bold",color:"#E5E7EB",fontFamily:"monospace"}}>{vehiculoSel.nombre}</div><div style={{fontSize:11,color:"#4B5563",fontFamily:"monospace"}}>{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div></div></div>
                    {showForm&&vehiculoSel&&(
                      <div className="ci" style={{padding:20,marginBottom:16}}>
                        <h3 style={{color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",marginBottom:16}}>+ SERVICE</h3>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                          <div><label className={lCls}>TIPO</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparacion</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                          <div><label className={lCls}>DESCRIPCION</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls} placeholder="Cambio aceite"/></div>
                          <div><label className={lCls}>TALLER</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                          <div><label className={lCls}>KM</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls}/></div>
                          <div><label className={lCls}>COSTO</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls}/></div>
                          <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls}/></div>
                        </div>
                        <div style={{display:"flex",gap:12,marginTop:16}}>
                          <button onClick={guardarService} style={{padding:"10px 24px",borderRadius:12,background:"rgba(201,162,39,0.1)",border:"1px solid rgba(201,162,39,0.3)",color:"#C9A227",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>▶ GUARDAR</button>
                          <button onClick={()=>{setShowForm(false);setForm({});}} style={{padding:"10px 24px",borderRadius:12,border:"1px solid #1C2128",color:"#4B5563",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none"}}>CANCELAR</button>
                        </div>
                      </div>
                    )}
                    <div className="ci" style={{overflow:"hidden"}}>
                      <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(0,255,128,0.1)"}}><span style={{color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold"}}>🔧 HISTORIAL</span></div>
                      {servicios.length===0?<div style={{textAlign:"center",padding:40,color:"#4B5563",fontFamily:"monospace",fontSize:13}}>SIN HISTORIAL</div>:(
                        <table style={{width:"100%",fontSize:12,fontFamily:"monospace"}}><thead><tr style={{borderBottom:"1px solid rgba(0,255,128,0.1)"}}>{["FECHA","TIPO","DESCRIPCION","TALLER","KM","COSTO",""].map(h=><th key={h} style={{textAlign:"left",padding:"12px 16px",fontSize:11,color:"#4B5563"}}>{h}</th>)}</tr></thead>
                          <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(0,255,128,0.05)"}}><td style={{padding:"12px 16px",color:"#9CA3AF"}}>{s.fecha}</td><td style={{padding:"12px 16px"}}><span style={{background:"rgba(201,162,39,0.1)",color:"#C9A227",padding:"2px 8px",borderRadius:4,fontSize:11}}>{s.tipo}</span></td><td style={{padding:"12px 16px",color:"#E5E7EB"}}>{s.descripcion}</td><td style={{padding:"12px 16px",color:"#9CA3AF"}}>{s.taller}</td><td style={{padding:"12px 16px",color:"#9CA3AF"}}>{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td style={{padding:"12px 16px",fontWeight:"bold",color:"#F87171"}}>${Number(s.costo).toLocaleString("es-AR")}</td><td style={{padding:"12px 16px"}}><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} style={{background:"none",border:"none",color:"#4B5563",cursor:"pointer",fontSize:12}}>✕</button></td></tr>)}</tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )
              }
            </div>
          )}

          {/* IA CAMPO */}
          {seccion==="ia_campo"&&(
            <div>
              <div style={{marginBottom:20}}><h2 style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:"#E5E7EB",margin:0}}>🤖 IA CAMPO</h2><p style={{color:"#4B5563",fontSize:11,fontFamily:"monospace",marginTop:4}}>Consulta sobre dosis, plagas, enfermedades, cultivos y mercados</p></div>
              {aiChat.length===0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>{["Dosis glifosato soja","Roya asiatica sintomas","Fungicida maiz","Siembra trigo pampeana","Insecticida soja MIP","Precio soja hoy"].map(q=><button key={q} onClick={()=>setAiInput(q)} style={{textAlign:"left",fontSize:11,color:"#4B6B5B",border:"1px solid rgba(0,255,128,0.1)",padding:"12px 16px",borderRadius:12,fontFamily:"monospace",cursor:"pointer",background:"rgba(10,22,40,0.6)"}}>💬 {q}</button>)}</div>}
              <div className="ci" style={{overflow:"hidden",marginBottom:16}}>
                <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(0,255,128,0.1)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#00FF80"}}/><span style={{color:"#00FF80",fontSize:11,fontFamily:"monospace"}}>◆ IA AGRONOMICA</span></div>{aiChat.length>0&&<button onClick={()=>setAiChat([])} style={{fontSize:11,color:"#4B5563",fontFamily:"monospace",background:"none",border:"none",cursor:"pointer"}}>Limpiar</button>}</div>
                <div style={{padding:16,maxHeight:380,overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>
                  {aiChat.length===0&&<div style={{textAlign:"center",padding:40,color:"#4B5563",fontFamily:"monospace",fontSize:13}}><div style={{fontSize:36,opacity:0.3,marginBottom:12}}>🌾</div>Hace tu consulta...</div>}
                  {aiChat.map((msg2,i)=><div key={i} style={{display:"flex",justifyContent:msg2.rol==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"80%",padding:"12px 16px",borderRadius:12,fontSize:13,fontFamily:"monospace",background:msg2.rol==="user"?"rgba(0,255,128,0.1)":"rgba(15,17,21,1)",border:msg2.rol==="user"?"1px solid rgba(0,255,128,0.2)":"1px solid #1C2128",color:msg2.rol==="user"?"#E5E7EB":"#9CA3AF"}}>{msg2.rol==="assistant"&&<div style={{color:"#00FF80",fontSize:10,marginBottom:6}}>◆ IA</div>}<p style={{margin:0,whiteSpace:"pre-wrap",lineHeight:1.5}}>{msg2.texto}</p></div></div>)}
                  {aiLoad&&<div style={{display:"flex"}}><div style={{padding:"12px 16px",borderRadius:12,background:"rgba(15,17,21,1)",border:"1px solid #1C2128"}}><p style={{margin:0,color:"#00FF80",fontSize:11,fontFamily:"monospace"}}>▶ Analizando...</p></div></div>}
                </div>
              </div>
              <div style={{display:"flex",gap:12}}>
                <button onClick={()=>{const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window;if(!hasSR){alert("Usa Chrome");return;}const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;const rec=new SR();rec.lang="es-AR";setListening(true);rec.onresult=(e:any)=>{setAiInput(e.results[0][0].transcript);setListening(false);};rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);rec.start();}} style={{padding:"12px 16px",borderRadius:12,border:listening?"1px solid #F87171":"1px solid rgba(0,255,128,0.3)",color:listening?"#F87171":"#00FF80",fontFamily:"monospace",fontSize:13,cursor:"pointer",background:"none",flexShrink:0}}>🎤 {listening?"...":"VOZ"}</button>
                <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta agronomica..." style={{flex:1,background:"rgba(10,22,40,0.8)",border:"1px solid rgba(0,255,128,0.2)",borderRadius:12,padding:"12px 16px",color:"#E5E7EB",fontSize:13,fontFamily:"monospace",outline:"none"}}/>
                <button onClick={askAI} disabled={aiLoad||!aiInput.trim()} style={{padding:"12px 24px",borderRadius:12,background:"rgba(0,255,128,0.1)",border:"1px solid rgba(0,255,128,0.3)",color:"#00FF80",fontFamily:"monospace",fontSize:13,fontWeight:"bold",cursor:"pointer",flexShrink:0,opacity:aiLoad||!aiInput.trim()?0.4:1}}>▶ ENVIAR</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const getSB = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
};

type Seccion = "productores"|"cobranza"|"vehiculo"|"ia_campo";
type ProductorIng = { id:string; nombre:string; telefono:string; email:string; localidad:string; provincia:string; hectareas_total:number; observaciones:string; empresa_id:string|null; tiene_cuenta:boolean; honorario_tipo:string; honorario_monto:number; };
type Campana = { id:string; nombre:string; activa:boolean; };
type Cobranza = { id:string; productor_id:string; concepto:string; monto:number; fecha:string; estado:string; metodo_pago:string; };
type Vehiculo = { id:string; nombre:string; marca:string; modelo:string; anio:number; patente:string; seguro_vencimiento:string; vtv_vencimiento:string; km_actuales:number; proximo_service_km:number; seguro_compania:string; };
type ServiceVeh = { id:string; tipo:string; descripcion:string; costo:number; km:number; fecha:string; taller:string; };
type MsgIA = { rol:"user"|"assistant"; texto:string };
type LoteResumen = { nombre:string; hectareas:number; cultivo:string; cultivo_completo:string; estado:string; productor_nombre:string; };

const CULTIVO_COLORS: Record<string,string> = {
  soja:"#22c55e", maiz:"#eab308", trigo:"#f59e0b", girasol:"#f97316",
  sorgo:"#ef4444", cebada:"#8b5cf6", arveja:"#06b6d4", otro:"#6b7280",
};

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
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
        const { data: ls } = await sb.from("lotes").select("nombre,hectareas,cultivo,cultivo_completo,estado,fecha_siembra,variedad").eq("empresa_id", eid).eq("campana_id", activa.id).eq("es_segundo_cultivo", false);
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

  const eliminarProd = async (id:string) => { if(!confirm("¿Eliminar productor?"))return; const sb=await getSB(); await sb.from("ing_productores").update({activo:false}).eq("id",id); await fetchProds(ingId); };

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

  const askAI = async () => {
    if(!aiInput.trim())return;const userMsg=aiInput.trim();setAiInput("");setAiLoad(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    try {
      const hist=aiChat.map(m=>({role:m.rol==="user"?"user":"assistant",content:m.texto}));
      const res=await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:"Asistente agronómico experto Argentina. Respondé técnico y preciso. Ingeniero: "+ingNombre+".",messages:[...hist,{role:"user",content:userMsg}]})});
      const d=await res.json();setAiChat(prev=>[...prev,{rol:"assistant",texto:d.content?.[0]?.text??"Sin respuesta"}]);
    } catch{setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error de conexión"}]);}
    setAiLoad(false);
  };

  // KPIs
  const totalHa = lotes.reduce((a,l) => a + (l.hectareas||0), 0);
  const totPend = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosU = [...new Set(lotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  // Datos gráfico barras hectáreas por cultivo
  const haPorCultivo = (() => {
    const mapa: Record<string,number> = {};
    lotes.forEach(l => {
      const k = l.cultivo_completo || l.cultivo || "Otro";
      mapa[k] = (mapa[k]||0) + (l.hectareas||0);
    });
    return Object.entries(mapa).map(([name,ha]) => ({
      name: name.replace("1RA","").replace("1RO","").replace("2DA","2da").replace("2DO","2do").trim(),
      ha: Math.round(ha),
      color: CULTIVO_COLORS[Object.keys(CULTIVO_COLORS).find(k=>name.toLowerCase().includes(k)) ?? "otro"] ?? "#6b7280"
    })).sort((a,b)=>b.ha-a.ha);
  })();

  // Datos torta
  const pieData = haPorCultivo.map(d => ({...d, value: d.ha}));

  const iCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all";
  const lCls = "block text-xs text-gray-500 font-medium mb-1";

  const NAV_ITEMS = [
    { k:"productores", icon:"👨‍🌾", label:"Mis Productores" },
    { k:"cobranza", icon:"💰", label:"Cobranza" },
    { k:"vehiculo", icon:"🚗", label:"Mi Vehículo" },
    { k:"ia_campo", icon:"🤖", label:"IA Campo" },
  ];

  if(loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-white font-medium">Cargando panel...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex" style={{fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .nav-item{transition:all 0.15s ease}
        .nav-item:hover{background:rgba(34,197,94,0.08)}
        .nav-item.active{background:rgba(34,197,94,0.12);color:#16a34a}
        .prod-card{transition:all 0.15s ease;cursor:pointer}
        .prod-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08);transform:translateY(-1px)}
        .stat-card{transition:all 0.15s ease}
        .stat-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.06)}
        .btn-primary{background:#16a34a;color:white;transition:all 0.15s}
        .btn-primary:hover{background:#15803d}
        .btn-outline{border:1px solid #e5e7eb;background:white;transition:all 0.15s}
        .btn-outline:hover{border-color:#16a34a;color:#16a34a}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
      `}</style>

      {/* SIDEBAR */}
      <aside className={`${sidebarOpen?"w-56":"w-16"} bg-gray-900 flex flex-col transition-all duration-200 flex-shrink-0`} style={{minHeight:"100vh"}}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          {sidebarOpen && <div><div className="text-white text-sm font-bold leading-none">AGRO</div><div className="text-green-400 text-xs">INTELIGENCIA</div></div>}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button key={item.k} onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${seccion===item.k?"active text-green-400":"text-gray-400"}`}>
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
              {seccion===item.k && sidebarOpen && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400"/>}
            </button>
          ))}

          <div className="pt-4 border-t border-gray-800 mt-4">
            {[{k:"reportes",icon:"📊",label:"Reportes"},{k:"config",icon:"⚙️",label:"Configuración"}].map(item=>(
              <button key={item.k} className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 text-left opacity-50" disabled>
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* User + salir */}
        <div className="px-2 py-4 border-t border-gray-800">
          <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}}
            className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 text-left">
            <span className="text-lg flex-shrink-0">🚪</span>
            {sidebarOpen && <span className="text-sm font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto">
        {/* Topbar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Panel Ingeniero Agrónomo</h1>
              <p className="text-sm text-gray-500">Gestión y monitoreo inteligente de productores y cultivos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"})}</span>
            {alertas.length > 0 && (
              <button className="relative p-2 text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"/>
              </button>
            )}
            <div className="w-9 h-9 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center">
              <span className="text-green-700 text-sm font-bold">{ingNombre.charAt(0)}</span>
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-semibold text-gray-800">{ingNombre}</div>
              <div className="text-xs text-gray-500">Cod. {ingData.codigo}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Toast */}
          {msj && (
            <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm ${msj.startsWith("✅")?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
              {msj}<button onClick={()=>setMsj("")} className="opacity-50 hover:opacity-100 ml-3">✕</button>
            </div>
          )}

          {/* Alertas */}
          {alertas.length > 0 && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><span className="text-red-500 font-semibold text-sm">⚠ {alertas.length} alerta{alertas.length>1?"s":""}</span></div>
              <div className="flex flex-wrap gap-2">{alertas.map((a,i)=><span key={i} className={`text-xs px-3 py-1.5 rounded-full font-medium ${a.urgencia==="alta"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{a.msg}</span>)}</div>
            </div>
          )}

          {/* ===== PRODUCTORES ===== */}
          {seccion==="productores" && (
            <div>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  {l:"Productores",v:productores.length,sub:"Activos",icon:"👨‍🌾",c:"from-emerald-500 to-green-600"},
                  {l:"Hectáreas Totales",v:totalHa.toLocaleString("es-AR")+" ha",sub:"Superficie total activa",icon:"🌿",c:"from-green-500 to-teal-600"},
                  {l:"Lotes Totales",v:lotes.length,sub:"Activos",icon:"🗺️",c:"from-teal-500 to-cyan-600"},
                  {l:"Con Cuenta App",v:productores.filter(p=>p.tiene_cuenta).length,sub:"Usuario",icon:"📱",c:"from-cyan-500 to-blue-600"},
                ].map(s=>(
                  <div key={s.l} className="stat-card bg-white rounded-2xl p-5 border border-gray-100 shadow-sm overflow-hidden relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">{s.l}</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{s.v}</p>
                        <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.c} flex items-center justify-center text-xl shadow-sm`}>{s.icon}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gráficos */}
              {haPorCultivo.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                  {/* Barras */}
                  <div className="md:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-800">Hectáreas por Cultivo</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Distribución de superficie cultivada</p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Este año</span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={haPorCultivo} margin={{top:0,right:0,bottom:0,left:-20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                        <XAxis dataKey="name" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                        <Tooltip formatter={(v:any)=>[v+" ha","Hectáreas"]} contentStyle={{background:"white",border:"1px solid #e5e7eb",borderRadius:"10px",fontSize:"12px",boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}/>
                        <Bar dataKey="ha" radius={[6,6,0,0]}>
                          {haPorCultivo.map((e,i)=><Cell key={i} fill={e.color}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Torta */}
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-1">Distribución</h3>
                    <p className="text-xs text-gray-400 mb-3">% por cultivo</p>
                    <div className="flex flex-col items-center">
                      <div style={{width:"100%",height:140}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" outerRadius={60} innerRadius={35} dataKey="value" paddingAngle={3}>
                              {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                            </Pie>
                            <Tooltip formatter={(v:any,n:string)=>[v+" ha",n]} contentStyle={{background:"white",border:"1px solid #e5e7eb",borderRadius:"10px",fontSize:"12px"}}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1.5 mt-2">
                        {pieData.map((d,i)=>(
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:d.color}}/>
                            <span className="text-xs text-gray-600 flex-1">{d.name}</span>
                            <span className="text-xs font-semibold text-gray-700">{Math.round(d.value/totalHa*100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Exportar lotes */}
              {lotes.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-5">
                  <div className="flex flex-wrap gap-3 items-end">
                    <p className="font-semibold text-gray-700 text-sm self-center mr-2">Gestión de Lotes y Productores</p>
                    {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                      <div key={l as string}>
                        <label className="block text-xs text-gray-500 mb-1">{l as string}</label>
                        <select value={v as string} onChange={e=>(fn as any)(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-green-500 min-w-[130px]">
                          {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                        </select>
                      </div>
                    ))}
                    <button onClick={()=>{setFCultivo("todos");setFProductor("todos");setFEstado("todos");}} className="btn-outline px-4 py-2 rounded-lg text-sm font-medium text-gray-600">Limpiar</button>
                    <button onClick={()=>exportXLS("lotes")} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Exportar Lotes
                    </button>
                  </div>
                </div>
              )}

              {/* Botones acción */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  {[
                    {icon:"➕",l:"+ Nuevo Productor",sub:"Registrar un nuevo productor",c:"text-green-600",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},
                    {icon:"📥",l:"Importar",sub:"Cargar productores desde archivo",c:"text-blue-600",fn:()=>setShowImport(!showImport)},
                    {icon:"📤",l:"Exportar Productores",sub:"Descargar lista completa",c:"text-purple-600",fn:()=>exportXLS("productores")},
                  ].map(b=>(
                    <button key={b.l} onClick={b.fn} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">{b.icon}</div>
                      <div><div className={`text-sm font-semibold ${b.c}`}>{b.l}</div><div className="text-xs text-gray-400 mt-0.5">{b.sub}</div></div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vincular */}
              <button onClick={()=>{setShowVincular(!showVincular);setForm({});}} className="mb-4 flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
                🔗 Vincular productor por código
              </button>

              {showVincular && (
                <div className="bg-white rounded-2xl border border-blue-100 p-5 mb-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-3">🔗 Vincular por código</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} placeholder="10001"/></div>
                    <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option></select></div>
                    <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                    <button onClick={vincularCodigo} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">Vincular</button>
                  </div>
                </div>
              )}

              {/* Import */}
              {showImport && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm">
                  <div className="flex justify-between mb-3"><h3 className="font-semibold text-gray-800">📥 Importar productores</h3><button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} className="text-gray-400 hover:text-gray-600">✕</button></div>
                  <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                  {importPrev.length===0?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm w-full justify-center hover:border-green-400 hover:text-green-600 transition-colors">📁 Seleccionar archivo Excel</button>:(
                    <div>
                      <div className="max-h-40 overflow-y-auto mb-3 rounded-xl border border-gray-100 text-sm">
                        <table className="w-full"><thead className="bg-gray-50"><tr>{["Nombre","Tel","Localidad","Ha","Estado"].map(h=><th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>)}</tr></thead>
                          <tbody>{importPrev.map((r,i)=><tr key={i} className="border-t border-gray-50"><td className="px-3 py-2 font-medium text-gray-800">{r.nombre}</td><td className="px-3 py-2 text-gray-500">{r.telefono||"—"}</td><td className="px-3 py-2 text-gray-500">{r.localidad||"—"}</td><td className="px-3 py-2 text-gray-600">{r.hectareas_total||"—"}</td><td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.existe?"bg-blue-50 text-blue-600":"bg-green-50 text-green-600"}`}>{r.existe?"Existente":"Nuevo"}</span></td></tr>)}</tbody>
                        </table>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={confirmarImport} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                        <button onClick={()=>setImportPrev([])} className="btn-outline px-4 py-2 rounded-lg text-sm text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  )}
                  {importMsg && <p className={`mt-3 text-xs font-medium ${importMsg.startsWith("✅")?"text-green-600":"text-red-500"}`}>{importMsg}</p>}
                </div>
              )}

              {/* Form productor */}
              {showForm && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">{editProd?"✏️ Editar":"➕"} Productor</h3>
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
                    <button onClick={guardarProductor} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button>
                    <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="btn-outline px-5 py-2 rounded-lg text-sm text-gray-600">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Lista productores */}
              {productores.length===0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center shadow-sm">
                  <div className="text-5xl mb-4 opacity-30">👨‍🌾</div>
                  <p className="text-gray-400 font-medium">Sin productores — agregá el primero</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {productores.map(p => {
                    const eid = p.empresa_id ?? p.id;
                    const camps = campanasPorProd[eid] ?? [];
                    const campActiva = campSelProd[eid] ?? null;
                    const lotesP = lotes.filter(l=>l.productor_nombre===p.nombre);
                    const haReales = lotesP.reduce((a,l)=>a+(l.hectareas||0),0);
                    const cultivosProd = [...new Set(lotesP.map(l=>l.cultivo).filter(Boolean))];
                    return (
                      <div key={p.id} className="prod-card bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Header tarjeta */}
                        <div className="px-5 pt-5 pb-4 border-b border-gray-50">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-200 flex items-center justify-center flex-shrink-0">
                              <span className="text-green-700 font-bold text-sm">{p.nombre.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-gray-900 truncate">{p.nombre}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}</div>
                              {p.tiene_cuenta && <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-1">✓ Usa la app</span>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-sm">✏️</button>
                              <button onClick={()=>eliminarProd(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors text-sm">✕</button>
                            </div>
                          </div>
                        </div>

                        <div className="px-5 py-4">
                          {/* Campaña selector */}
                          <div className="mb-4">
                            <label className="block text-xs text-gray-400 font-medium mb-1.5">CAMPAÑA</label>
                            <div className="flex gap-2 items-center">
                              {camps.length > 0 ? (
                                <select value={campActiva??""} onChange={e=>cambiarCampana(eid, e.target.value, p.nombre)}
                                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-green-400">
                                  {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                                </select>
                              ) : (
                                <div className="flex-1 bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-400">Sin campañas</div>
                              )}
                              <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold hover:bg-amber-100 transition-colors flex-shrink-0">
                                + Nueva
                              </button>
                            </div>
                            {nuevaCampProd===p.id && (
                              <div className="flex gap-2 mt-2">
                                <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} placeholder="2025/2026"
                                  className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-amber-400"/>
                                <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600">✓</button>
                                <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 text-xs">✕</button>
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1.5">{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha en esta campaña</div>
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                              <div className="text-xs text-amber-600 font-medium">Hectáreas</div>
                              <div className="text-xl font-bold text-amber-700 mt-0.5">{haReales.toLocaleString("es-AR")}</div>
                            </div>
                            <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                              <div className="text-xs text-green-600 font-medium">Honorario</div>
                              <div className="text-xl font-bold text-green-700 mt-0.5">${(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                            </div>
                          </div>

                          {/* Cultivos badges */}
                          {cultivosProd.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mb-4">
                              {cultivosProd.map(c=><span key={c} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{background:(CULTIVO_COLORS[c]??"#6b7280")+"18",color:CULTIVO_COLORS[c]??"#6b7280"}}>{c}</span>)}
                            </div>
                          )}

                          {/* Botones */}
                          <div className="flex gap-2">
                            {p.telefono && (
                              <a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer"
                                className="flex-shrink-0 p-2.5 rounded-xl bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors">
                                💬
                              </a>
                            )}
                            <button onClick={()=>entrar(p)} className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                              {p.tiene_cuenta?"🔗 Ver Lotes":"🌾 Mis Lotes"}
                            </button>
                          </div>
                        </div>

                        {p.observaciones && (
                          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">{p.observaciones}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== COBRANZA ===== */}
          {seccion==="cobranza" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Cobranza</h2>
                  <div className="flex gap-4 mt-1">
                    <span className="text-sm text-red-500 font-medium">Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span>
                    <span className="text-sm text-green-600 font-medium">Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} className="btn-outline px-4 py-2 rounded-lg text-sm font-medium text-gray-600">📤 Exportar</button>
                  <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">+ Nuevo cobro</button>
                </div>
              </div>

              {showForm && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">+ Nuevo cobro</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={lCls}>Productor</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                    <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                    <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls}/></div>
                    <div><label className={lCls}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                    <div><label className={lCls}>Método</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={guardarCob} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button>
                    <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-outline px-5 py-2 rounded-lg text-sm text-gray-600">Cancelar</button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {cobranzas.length===0 ? <div className="text-center py-16 text-gray-400">Sin cobros registrados</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>{["Fecha","Productor","Concepto","Monto","Estado","Método",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-gray-500 font-semibold">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3.5 text-gray-500">{c.fecha}</td>
                            <td className="px-5 py-3.5 font-medium text-gray-800">{p?.nombre??"—"}</td>
                            <td className="px-5 py-3.5 text-gray-600">{c.concepto}</td>
                            <td className="px-5 py-3.5 font-bold text-amber-600">${Number(c.monto).toLocaleString("es-AR")}</td>
                            <td className="px-5 py-3.5"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.estado==="cobrado"?"bg-green-50 text-green-600":"bg-red-50 text-red-500"}`}>{c.estado}</span></td>
                            <td className="px-5 py-3.5 text-gray-400">{c.metodo_pago||"—"}</td>
                            <td className="px-5 py-3.5 flex gap-2">
                              {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-green-600 text-xs font-medium hover:underline">✓ Cobrado</button>}
                              <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== VEHICULO ===== */}
          {seccion==="vehiculo" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">Mi Vehículo</h2>
                {!vehiculoSel
                  ?<button onClick={()=>{setShowForm(true);setForm({});}} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">+ Agregar</button>
                  :<div className="flex gap-2">
                    <button onClick={()=>{setShowForm(true);setForm({});}} className="btn-outline px-4 py-2 rounded-lg text-sm font-medium text-gray-600">+ Service</button>
                    <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="btn-outline px-4 py-2 rounded-lg text-sm text-gray-600">← Volver</button>
                  </div>
                }
              </div>

              {showForm&&!vehiculoSel && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">+ Nuevo vehículo</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                      <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} placeholder={ph as string}/></div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={guardarVeh} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button>
                    <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-outline px-5 py-2 rounded-lg text-sm text-gray-600">Cancelar</button>
                  </div>
                </div>
              )}

              {!vehiculoSel ? (
                vehiculos.length===0 ? <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center shadow-sm"><div className="text-5xl mb-4 opacity-30">🚗</div><p className="text-gray-400">Sin vehículos registrados</p></div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                      <div key={v.id} className="prod-card bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">🚗</div>
                            <div><div className="font-bold text-gray-900">{v.nombre}</div><div className="text-sm text-gray-400">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-400">Km actuales</div><div className="text-xl font-bold text-gray-800 mt-0.5">{(v.km_actuales||0).toLocaleString()}</div></div>
                          <div className="bg-amber-50 rounded-xl p-3"><div className="text-xs text-amber-500">Próx. service</div><div className="text-xl font-bold text-amber-700 mt-0.5">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium flex-1 text-center ${sV?"bg-red-50 text-red-600":"bg-green-50 text-green-600"}`}>🛡 {sV?"Seguro VENCIDO":v.seguro_vencimiento||"—"}</span>
                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium flex-1 text-center ${vV?"bg-red-50 text-red-600":"bg-green-50 text-green-600"}`}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                        </div>
                      </div>
                    );})}
                  </div>
                )
              ) : (
                <div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-3xl">🚗</div>
                    <div><div className="text-xl font-bold text-gray-900">{vehiculoSel.nombre}</div><div className="text-sm text-gray-400">{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                  </div>
                  {showForm&&vehiculoSel && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
                      <h3 className="font-semibold text-gray-800 mb-4">+ Service</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div><label className={lCls}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                        <div><label className={lCls}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls}/></div>
                        <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls}/></div>
                      </div>
                      <div className="flex gap-3 mt-4">
                        <button onClick={guardarService} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Guardar</button>
                        <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-outline px-5 py-2 rounded-lg text-sm text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"><span className="font-semibold text-gray-800">🔧 Historial de services</span></div>
                    {servicios.length===0?<div className="text-center py-12 text-gray-400 text-sm">Sin historial</div>:(
                      <table className="w-full text-sm"><thead className="bg-gray-50 border-b border-gray-100"><tr>{["Fecha","Tipo","Descripción","Taller","Km","Costo",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">{servicios.map(s=><tr key={s.id} className="hover:bg-gray-50"><td className="px-5 py-3.5 text-gray-400">{s.fecha}</td><td className="px-5 py-3.5"><span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-xs font-medium">{s.tipo}</span></td><td className="px-5 py-3.5 text-gray-700">{s.descripcion}</td><td className="px-5 py-3.5 text-gray-400">{s.taller}</td><td className="px-5 py-3.5 text-gray-400">{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td className="px-5 py-3.5 font-bold text-red-500">${Number(s.costo).toLocaleString("es-AR")}</td><td className="px-5 py-3.5"><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} className="text-gray-300 hover:text-red-400 text-xs">✕</button></td></tr>)}</tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== IA CAMPO ===== */}
          {seccion==="ia_campo" && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900">IA Campo</h2>
                <p className="text-sm text-gray-400 mt-0.5">Consultas sobre dosis, plagas, enfermedades, cultivos y mercados</p>
              </div>
              {aiChat.length===0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  {["Dosis glifosato soja","Roya asiática síntomas","Fungicida maíz","Siembra trigo pampeana","Insecticida soja MIP","Precio soja hoy"].map(q=>(
                    <button key={q} onClick={()=>setAiInput(q)} className="text-left text-sm text-gray-500 border border-gray-200 px-4 py-3 rounded-xl hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-all bg-white">💬 {q}</button>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/><span className="font-medium text-gray-700 text-sm">IA Agronómica</span></div>
                  {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-gray-400 hover:text-gray-600">Limpiar</button>}
                </div>
                <div className="p-5 max-h-96 overflow-y-auto flex flex-col gap-4">
                  {aiChat.length===0 && <div className="text-center py-10 text-gray-300"><div className="text-4xl mb-3">🌾</div><p className="text-sm">Hacé tu consulta agronómica...</p></div>}
                  {aiChat.map((msg,i)=>(
                    <div key={i} className={`flex ${msg.rol==="user"?"justify-end":"justify-start"}`}>
                      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.rol==="user"?"bg-green-500 text-white":"bg-gray-50 text-gray-700 border border-gray-100"}`}>
                        {msg.rol==="assistant"&&<div className="text-xs text-green-500 font-semibold mb-1.5">◆ IA Agronómica</div>}
                        <p className="whitespace-pre-wrap">{msg.texto}</p>
                      </div>
                    </div>
                  ))}
                  {aiLoad && <div className="flex"><div className="bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>)}</div></div></div>}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{const hasSR="webkitSpeechRecognition" in window||"SpeechRecognition" in window;if(!hasSR){alert("Usá Chrome");return;}const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;const rec=new SR();rec.lang="es-AR";rec.onresult=(e:any)=>{setAiInput(e.results[0][0].transcript);};rec.start();}} className="btn-outline p-3 rounded-xl text-gray-500 flex-shrink-0">🎤</button>
                <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consultá sobre dosis, plagas, cultivos..." className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"/>
                <button onClick={askAI} disabled={aiLoad||!aiInput.trim()} className="btn-primary px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex-shrink-0">Enviar →</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

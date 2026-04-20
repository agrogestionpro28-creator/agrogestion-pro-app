"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";

// Solo insumos, gasoil y varios — sin granos
type Tab = "insumos" | "gasoil" | "varios";
type InsumoItem = { id: string; nombre: string; categoria: string; subcategoria: string; cantidad: number; unidad: string; ubicacion: string; tipo_ubicacion: string; precio_unitario: number; precio_ppp: number; costo_total_stock: number; };
type GasoilItem = { id: string; cantidad_litros: number; ubicacion: string; tipo_ubicacion: string; precio_litro: number; precio_ppp: number; costo_total_stock: number; };
type GasoilMov = { id: string; gasoil_id: string; fecha: string; tipo: string; litros: number; descripcion: string; metodo: string; precio_litro: number; precio_ppp: number; };
type VariosItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; };

const SUBCATS_AGRO = ["Herbicida","Insecticida","Fungicida","Coadyuvante","Curasemilla","Fertilizante","Otro"];
const TABS = [
  { key:"insumos", label:"Insumos",      icon:"🧪", color:"#16a34a", img:"/stock-insumos.png" },
  { key:"gasoil",  label:"Gasoil",       icon:"⛽", color:"#1565c0", img:"/stock-gasoil.png"  },
  { key:"varios",  label:"Stock Varios", icon:"🔧", color:"#7c3aed", img:"/stock-varios.png"  },
];
const CAT_INSUMOS = [
  { key:"semilla",      label:"Semillas",      color:"#22c55e", icon:"🌱" },
  { key:"fertilizante", label:"Fertilizantes", color:"#d97706", icon:"💊" },
  { key:"agroquimico",  label:"Agroquímicos",  color:"#1565c0", icon:"🧪" },
  { key:"otro",         label:"Otros",         color:"#7c3aed", icon:"🔧" },
];

function calcPPP(stockActual: number, pppAnterior: number, cantNueva: number, precioNuevo: number): number {
  const total = stockActual + cantNueva;
  if (total <= 0) return precioNuevo;
  return (stockActual * pppAnterior + cantNueva * precioNuevo) / total;
}

export default function EmpleadoStockPage() {
  const [tab, setTab] = useState<Tab>("insumos");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [gasoil, setGasoil] = useState<GasoilItem[]>([]);
  const [gasoilMovs, setGasoilMovs] = useState<GasoilMov[]>([]);
  const [varios, setVarios] = useState<VariosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormInsumo, setShowFormInsumo] = useState(false);
  const [showFormGasoil, setShowFormGasoil] = useState(false);
  const [showFormGasoilMov, setShowFormGasoilMov] = useState("");
  const [showFormVarios, setShowFormVarios] = useState(false);
  const [editandoInsumo, setEditandoInsumo] = useState<string|null>(null);
  const [editandoVarios, setEditandoVarios] = useState<string|null>(null);
  const [gasoilActivo, setGasoilActivo] = useState<string|null>(null);
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
    const [ins, gas, gmov, var_] = await Promise.all([
      sb.from("stock_insumos").select("*").eq("empresa_id", eid).order("categoria"),
      sb.from("stock_gasoil").select("*").eq("empresa_id", eid),
      sb.from("stock_gasoil_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("stock_varios").select("*").eq("empresa_id", eid),
    ]);
    setInsumos(ins.data ?? []);
    setGasoil(gas.data ?? []);
    setGasoilMovs(gmov.data ?? []);
    setVarios(var_.data ?? []);
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const cantNueva = Number(form.cantidad ?? 0);
    const precioNuevo = Number(form.precio_unitario ?? 0);
    if (editandoInsumo) {
      await sb.from("stock_insumos").update({ nombre: form.nombre, categoria: form.categoria ?? "agroquimico", subcategoria: form.subcategoria ?? "", cantidad: cantNueva, unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio", precio_unitario: precioNuevo }).eq("id", editandoInsumo);
      setEditandoInsumo(null);
      toast("✅ Insumo actualizado");
    } else {
      const existente = insumos.find(i => i.nombre.toLowerCase().trim() === (form.nombre ?? "").toLowerCase().trim() && i.categoria === (form.categoria ?? "agroquimico"));
      if (existente) {
        const pppNuevo = calcPPP(existente.cantidad, existente.precio_ppp || existente.precio_unitario, cantNueva, precioNuevo);
        const cantTotal = existente.cantidad + cantNueva;
        await sb.from("stock_insumos").update({ cantidad: cantTotal, precio_ppp: pppNuevo, precio_unitario: precioNuevo, costo_total_stock: cantTotal * pppNuevo }).eq("id", existente.id);
        await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: existente.id, fecha: new Date().toISOString().split("T")[0], tipo: "compra", cantidad: cantNueva, precio_unitario: precioNuevo, precio_ppp: pppNuevo, descripcion: `Compra: ${cantNueva} ${existente.unidad} a $${precioNuevo}`, metodo: "empleado" });
        toast(`✅ Stock actualizado — PPP: $${pppNuevo.toFixed(2)}/${existente.unidad}`);
      } else {
        const { data: nuevo } = await sb.from("stock_insumos").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "agroquimico", subcategoria: form.subcategoria ?? "", cantidad: cantNueva, unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio", precio_unitario: precioNuevo, precio_ppp: precioNuevo, costo_total_stock: cantNueva * precioNuevo }).select().single();
        if (nuevo) await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: nuevo.id, fecha: new Date().toISOString().split("T")[0], tipo: "compra", cantidad: cantNueva, precio_unitario: precioNuevo, precio_ppp: precioNuevo, descripcion: `Carga inicial por empleado`, metodo: "empleado" });
        toast("✅ Insumo cargado");
      }
    }
    await fetchAll(empresaId); setShowFormInsumo(false); setForm({});
  };

  const descontarInsumo = async (id: string, cantDescontar: number) => {
    const sb = await getSB();
    const ins = insumos.find(i => i.id === id);
    if (!ins || !empresaId) return;
    const nuevaCant = Math.max(0, ins.cantidad - cantDescontar);
    const pppActual = ins.precio_ppp || ins.precio_unitario || 0;
    await sb.from("stock_insumos").update({ cantidad: nuevaCant, costo_total_stock: nuevaCant * pppActual }).eq("id", id);
    await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: id, fecha: new Date().toISOString().split("T")[0], tipo: "uso", cantidad: cantDescontar, precio_unitario: 0, precio_ppp: pppActual, descripcion: `Uso registrado por empleado`, metodo: "empleado" });
    toast(`✅ ${cantDescontar} ${ins.unidad} descontados`);
    await fetchAll(empresaId);
  };

  const registrarMovGasoil = async (gasoilId: string, tipo: "carga"|"consumo") => {
    if (!empresaId) return;
    const sb = await getSB();
    const litros = Number(form.litros_mov ?? 0);
    const precioLitroNuevo = Number(form.precio_litro_mov ?? 0);
    const tanque = gasoil.find(g => g.id === gasoilId);
    if (!tanque) return;
    let nuevaCant: number; let pppNuevo: number;
    if (tipo === "carga") {
      nuevaCant = tanque.cantidad_litros + litros;
      pppNuevo = precioLitroNuevo > 0 ? calcPPP(tanque.cantidad_litros, tanque.precio_ppp || tanque.precio_litro, litros, precioLitroNuevo) : tanque.precio_ppp || tanque.precio_litro;
    } else {
      nuevaCant = Math.max(0, tanque.cantidad_litros - litros);
      pppNuevo = tanque.precio_ppp || tanque.precio_litro;
    }
    await sb.from("stock_gasoil").update({ cantidad_litros: nuevaCant, precio_ppp: pppNuevo, costo_total_stock: nuevaCant * pppNuevo, ...(tipo === "carga" && precioLitroNuevo > 0 ? { precio_litro: precioLitroNuevo } : {}) }).eq("id", gasoilId);
    await sb.from("stock_gasoil_movimientos").insert({ empresa_id: empresaId, gasoil_id: gasoilId, fecha: form.fecha_mov ?? new Date().toISOString().split("T")[0], tipo, litros, descripcion: form.descripcion_mov ?? "", metodo: "empleado", precio_litro: precioLitroNuevo, precio_ppp: pppNuevo });
    toast(tipo === "carga" ? `✅ Carga registrada` : `✅ Consumo registrado — ${litros}L`);
    await fetchAll(empresaId); setShowFormGasoilMov(""); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    if (editandoVarios) {
      await sb.from("stock_varios").update({ nombre: form.nombre, categoria: form.categoria ?? "general", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "" }).eq("id", editandoVarios);
      setEditandoVarios(null);
    } else {
      await sb.from("stock_varios").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "" });
    }
    toast("✅ Guardado"); await fetchAll(empresaId); setShowFormVarios(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando stock...</span>
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
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;width:100%;}
        .topbar-st{background-image:url('/FON.png');background-size:cover;background-position:top;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-st::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-st>*{position:relative;z-index:1;}
        .card{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid white;border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card>*{position:relative;z-index:2;}
        .tab-img{border-radius:14px;overflow:hidden;cursor:pointer;transition:all 0.20s;position:relative;height:72px;border:2px solid transparent;}
        .tab-img.active{border-color:rgba(255,255,255,0.90);box-shadow:0 4px 18px rgba(25,118,210,0.30);}
        .tab-img:hover{transform:translateY(-2px);}
        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}
        .form-box{background:rgba(255,255,255,0.55);border:1px solid rgba(180,210,240,0.40);border-radius:14px;padding:14px;}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}
        .row-s:hover{background:rgba(255,255,255,0.80)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-st" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>window.location.href="/empleados"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← Mi Panel
          </button>
          <div style={{flex:1,textAlign:"center"}}>
            <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>📦 Stock</span>
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

        {/* TABS */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {TABS.map(t=>(
            <div key={t.key} className={`tab-img${tab===t.key?" active":""}`}
              onClick={()=>{setTab(t.key as Tab);setGasoilActivo(null);}}>
              <Image src={t.img} alt={t.label} fill style={{objectFit:"cover"}}
                onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
              <div style={{position:"absolute",inset:0,background:tab===t.key?"rgba(255,255,255,0.18)":"rgba(20,40,80,0.45)",transition:"background 0.2s"}}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:15}}>{t.icon}</span>
                <span style={{fontSize:11,fontWeight:800,color:"white",textShadow:"0 1px 3px rgba(0,0,0,0.55)"}}>{t.label}</span>
              </div>
              {tab===t.key&&<div style={{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:"white"}}/>}
            </div>
          ))}
        </div>

        {/* ── INSUMOS ── */}
        {tab==="insumos"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowFormInsumo(!showFormInsumo);setEditandoInsumo(null);setForm({categoria:"agroquimico"});}} className="bbtn">+ Cargar Insumo</button>
            </div>

            {showFormInsumo&&(
              <div className="card fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:6}}>{editandoInsumo?"✏️ Editar":"+"} Insumo</div>
                {!editandoInsumo&&<p style={{fontSize:11,color:"#6b8aaa",marginBottom:10}}>💡 Si el insumo ya existe, se suma al stock y se recalcula el PPP automáticamente</p>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: Glifosato 48%"/></div>
                  <div><label className={lCls}>Categoría</label>
                    <select value={form.categoria??"agroquimico"} onChange={e=>setForm({...form,categoria:e.target.value,subcategoria:""})} className="sel">
                      {CAT_INSUMOS.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  {form.categoria==="agroquimico"&&<div><label className={lCls}>Subcategoría</label>
                    <select value={form.subcategoria??""} onChange={e=>setForm({...form,subcategoria:e.target.value})} className="sel">
                      <option value="">Seleccionar</option>
                      {SUBCATS_AGRO.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>}
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Unidad</label>
                    <select value={form.unidad??"litros"} onChange={e=>setForm({...form,unidad:e.target.value})} className="sel">
                      <option value="litros">Litros</option><option value="kg">kg</option><option value="bolsas">Bolsas</option><option value="unidad">Unidad</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Precio de compra</label><input type="number" value={form.precio_unitario??""} onChange={e=>setForm({...form,precio_unitario:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Depósito..."/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarInsumo} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormInsumo(false);setEditandoInsumo(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {CAT_INSUMOS.map(cat=>{
              const items = insumos.filter(i=>i.categoria===cat.key);
              if (items.length===0) return null;
              return(
                <div key={cat.key} style={{marginBottom:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:18}}>{cat.icon}</span>
                    <span style={{fontSize:14,fontWeight:800,color:cat.color}}>{cat.label}</span>
                    <span style={{fontSize:11,color:"#6b8aaa"}}>{items.length} productos</span>
                  </div>
                  <div className="card" style={{padding:0,overflow:"hidden"}}>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                        {["Producto","Cantidad","PPP","Ubicación",""].map(h=>(
                          <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{items.map(i=>(
                        <tr key={i.id} className="row-s" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                          <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{i.nombre}</td>
                          <td style={{padding:"9px 12px",fontWeight:800,color:cat.color}}>{i.cantidad} {i.unidad}</td>
                          <td style={{padding:"9px 12px",fontWeight:800,color:"#d97706"}}>{(i.precio_ppp||i.precio_unitario)>0?`$${Number(i.precio_ppp||i.precio_unitario).toFixed(2)}/${i.unidad}`:"—"}</td>
                          <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{i.ubicacion||"—"}</td>
                          <td style={{padding:"9px 12px"}}>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>{setEditandoInsumo(i.id);setForm({nombre:i.nombre,categoria:i.categoria,subcategoria:i.subcategoria??"",cantidad:String(i.cantidad),unidad:i.unidad,ubicacion:i.ubicacion,tipo_ubicacion:i.tipo_ubicacion,precio_unitario:String(i.precio_unitario)});setShowFormInsumo(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                              <button onClick={()=>{const cant=prompt(`Descontar cantidad (${i.unidad}):`);if(cant&&Number(cant)>0)descontarInsumo(i.id,Number(cant));}} style={{background:"none",border:"none",cursor:"pointer",color:"#1565c0",fontSize:13,fontWeight:800}} title="Descontar uso">➖</button>
                              <button onClick={()=>eliminarItem("stock_insumos",i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {insumos.length===0&&!showFormInsumo&&(
              <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>🧪</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>Sin insumos registrados</p>
              </div>
            )}
          </div>
        )}

        {/* ── GASOIL ── */}
        {tab==="gasoil"&&(
          <div className="fade-in">
            {gasoil.length===0?(
              <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>⛽</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>Sin stock de gasoil cargado</p>
                <p style={{color:"#aab8c8",fontSize:12,marginTop:4}}>El productor o administrador debe cargar el stock inicial</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {gasoil.map(g=>{
                  const movsDeTanque = gasoilMovs.filter(m=>m.gasoil_id===g.id);
                  const isActivo = gasoilActivo===g.id;
                  const pppActual = g.precio_ppp||g.precio_litro;
                  return(
                    <div key={g.id} className="card" style={{padding:0,overflow:"hidden"}}>
                      <div style={{position:"relative",height:100}}>
                        <Image src="/stock-gasoil.png" alt="gasoil" fill style={{objectFit:"cover"}}
                          onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 10%,rgba(255,255,255,0.85) 100%)"}}/>
                        <div style={{position:"absolute",bottom:10,left:14}}>
                          <div style={{fontSize:22,fontWeight:800,color:"#0d2137"}}>{g.cantidad_litros.toLocaleString("es-AR")} L</div>
                          <div style={{fontSize:11,color:"#1565c0",fontWeight:600}}>{g.tipo_ubicacion?.replace("_"," ")}{g.ubicacion?` · ${g.ubicacion}`:""}</div>
                        </div>
                        <div style={{position:"absolute",top:8,right:10}}>
                          <button onClick={()=>setGasoilActivo(isActivo?null:g.id)} className="abtn" style={{fontSize:11,padding:"4px 10px"}}>{isActivo?"▲":"▼ Historial"}</button>
                        </div>
                      </div>
                      <div style={{padding:14}}>
                        <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:12,color:"#6b8aaa"}}>Último precio: <strong style={{color:"#0d2137"}}>${g.precio_litro}/L</strong></span>
                          <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>PPP: ${pppActual.toFixed(2)}/L</span>
                          <span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>Stock: ${Math.round(g.cantidad_litros*pppActual).toLocaleString("es-AR")}</span>
                        </div>
                        <div style={{display:"flex",gap:8,marginBottom:showFormGasoilMov.startsWith(g.id)?12:0}}>
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_carga");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.22)",color:"#16a34a",cursor:"pointer",fontWeight:700,fontSize:12}}>⬆️ Registrar carga</button>
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_consumo");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(220,38,38,0.07)",border:"1px solid rgba(220,38,38,0.20)",color:"#dc2626",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇️ Registrar consumo</button>
                        </div>

                        {(showFormGasoilMov===g.id+"_carga"||showFormGasoilMov===g.id+"_consumo")&&(
                          <div className="form-box fade-in" style={{marginBottom:10}}>
                            <div style={{fontSize:12,fontWeight:800,color:"#1565c0",marginBottom:10}}>{showFormGasoilMov.endsWith("_carga")?"⬆️ Cargar gasoil":"⬇️ Registrar consumo"}</div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                              <div><label className={lCls}>Litros</label><input type="number" value={form.litros_mov??""} onChange={e=>setForm({...form,litros_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                              {showFormGasoilMov.endsWith("_carga")&&<div><label className={lCls}>Precio/litro</label><input type="number" value={form.precio_litro_mov??""} onChange={e=>setForm({...form,precio_litro_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>}
                              <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_mov??""} onChange={e=>setForm({...form,fecha_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                              <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion_mov??""} onChange={e=>setForm({...form,descripcion_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}} placeholder="Tractor, cosecha..."/></div>
                            </div>
                            <div style={{display:"flex",gap:8}}>
                              <button onClick={()=>registrarMovGasoil(g.id,showFormGasoilMov.endsWith("_carga")?"carga":"consumo")} className="bbtn" style={{fontSize:11,padding:"7px 14px"}}>▶ Guardar</button>
                              <button onClick={()=>{setShowFormGasoilMov("");setForm({});}} className="abtn" style={{fontSize:11,padding:"7px 12px"}}>Cancelar</button>
                            </div>
                          </div>
                        )}

                        {isActivo&&movsDeTanque.length>0&&(
                          <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:10}}>
                            <div style={{fontSize:10,fontWeight:800,color:"#1565c0",textTransform:"uppercase",marginBottom:8}}>Historial</div>
                            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:180,overflowY:"auto"}}>
                              {movsDeTanque.map(m=>(
                                <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.65)"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <span style={{color:m.tipo==="carga"?"#16a34a":"#dc2626",fontSize:12}}>{m.tipo==="carga"?"⬆️":"⬇️"}</span>
                                    <span style={{fontSize:11,color:"#6b8aaa"}}>{m.fecha}</span>
                                    {m.descripcion&&<span style={{fontSize:11,color:"#4a6a8a"}}>{m.descripcion}</span>}
                                  </div>
                                  <span style={{fontSize:12,fontWeight:800,color:m.tipo==="carga"?"#16a34a":"#dc2626"}}>{m.tipo==="carga"?"+":"-"}{m.litros}L</span>
                                </div>
                              ))}
                            </div>
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

        {/* ── VARIOS ── */}
        {tab==="varios"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowFormVarios(!showFormVarios);setEditandoVarios(null);setForm({});}} className="bbtn">+ Cargar Item</button>
            </div>
            {showFormVarios&&(
              <div className="card fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginBottom:12}}>{editandoVarios?"✏️ Editar":"+"} Item</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Categoría</label><input type="text" value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Repuesto, herramienta..."/></div>
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Unidad</label><input type="text" value={form.unidad??""} onChange={e=>setForm({...form,unidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="kg, unidad, m..."/></div>
                  <div><label className={lCls}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarVarios} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormVarios(false);setEditandoVarios(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              {varios.length===0?(
                <div style={{textAlign:"center",padding:"40px 20px",color:"#6b8aaa",fontSize:14}}>
                  <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>🔧</div>Sin items registrados
                </div>
              ):(
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Producto","Categoría","Cantidad","Ubicación",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{varios.map(v=>(
                    <tr key={v.id} className="row-s" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{v.nombre}</td>
                      <td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"rgba(124,58,237,0.10)",color:"#7c3aed",fontWeight:700}}>{v.categoria}</span></td>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#7c3aed"}}>{v.cantidad} {v.unidad}</td>
                      <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{v.ubicacion||"—"}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{setEditandoVarios(v.id);setForm({nombre:v.nombre,categoria:v.categoria,cantidad:String(v.cantidad),unidad:v.unidad,ubicacion:v.ubicacion});setShowFormVarios(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                          <button onClick={()=>eliminarItem("stock_varios",v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

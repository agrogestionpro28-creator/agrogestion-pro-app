"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Usuario = {
  id: string; nombre: string; email: string;
  rol: string; codigo: string; activo: boolean;
  telefono?: string; matricula?: string; especialidad?: string;
  cuit?: string; localidad?: string; provincia?: string; direccion?: string;
};
type Vinculacion = {
  id: string; ingeniero_nombre: string; empresa_nombre: string;
  propietario_nombre: string; activa: boolean;
};
type VinculacionDetalle = {
  id: string; profesional_nombre: string; rol_profesional: string;
  empresa_id: string; honorario_tipo: string; honorario_monto: number; activa: boolean;
};
type EmpresaDetalle = {
  id: string; nombre: string; propietario_id: string;
  propietario_nombre: string; propietario_email: string;
  propietario_codigo: string;
  cuit: string; direccion: string; localidad: string;
  provincia: string; telefono: string; email_empresa: string;
  razon_social: string; condicion_iva: string;
  ingresos_brutos: string; inicio_actividades: string;
  socios: string; empleados: string; observaciones: string;
};

const ROL_PREFIJOS: Record<string, { prefix: number; label: string; color: string; icon: string; accentColor: string }> = {
  admin:       { prefix: 0,     label: "Admin",       color: "#dc2626", icon: "👑", accentColor: "rgba(220,38,38,0.12)" },
  productor:   { prefix: 10000, label: "Productor",   color: "#16a34a", icon: "👨‍🌾", accentColor: "rgba(22,163,74,0.12)" },
  ingeniero:   { prefix: 20000, label: "Ingeniero",   color: "#1976d2", icon: "👨‍💼", accentColor: "rgba(25,118,210,0.12)" },
  veterinario: { prefix: 30000, label: "Veterinario", color: "#7c3aed", icon: "🩺", accentColor: "rgba(124,58,237,0.12)" },
  empleado:    { prefix: 40000, label: "Empleado",    color: "#d97706", icon: "👷", accentColor: "rgba(217,119,6,0.12)" },
  aplicador:   { prefix: 50000, label: "Aplicador",   color: "#0891b2", icon: "💧", accentColor: "rgba(8,145,178,0.12)" },
  sembrador:   { prefix: 60000, label: "Sembrador",   color: "#15803d", icon: "🌱", accentColor: "rgba(21,128,61,0.12)" },
};

export default function AdminPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaDetalle[]>([]);
  const [empresaActiva, setEmpresaActiva] = useState<EmpresaDetalle|null>(null);
  const [usuarioEditar, setUsuarioEditar] = useState<Usuario|null>(null);
  const [vinculacionesEmpresa, setVinculacionesEmpresa] = useState<VinculacionDetalle[]>([]);
  const [showVincLocal, setShowVincLocal] = useState(false);
  const [formVinc, setFormVinc] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"usuarios"|"vinculaciones">("usuarios");
  const [showForm, setShowForm] = useState(false);
  const [showVincForm, setShowVincForm] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");
  const [ingenieros, setIngenieros] = useState<Usuario[]>([]);
  const [adminId, setAdminId] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const m = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "admin") { window.location.href = "/login"; return; }
    setAdminId(u.id);
    await fetchAll();
    setLoading(false);
  };

  const fetchAll = async () => {
    const sb = await getSB();
    const { data: us } = await sb.from("usuarios").select("*").order("codigo");
    setUsuarios(us ?? []);
    setIngenieros((us ?? []).filter(u => u.rol === "ingeniero"));
    const { data: emps } = await sb.from("empresas").select("*");
    if (emps && us) {
      const empresasDetalle: EmpresaDetalle[] = emps.map((e: any) => {
        const prop = (us ?? []).find(u => u.id === e.propietario_id);
        return {
          id: e.id, nombre: e.nombre, propietario_id: e.propietario_id,
          propietario_nombre: prop?.nombre ?? "—",
          propietario_email: prop?.email ?? "—",
          propietario_codigo: prop?.codigo ?? "—",
          cuit: e.cuit ?? "", direccion: e.direccion ?? "",
          localidad: e.localidad ?? "", provincia: e.provincia ?? "",
          telefono: e.telefono ?? "", email_empresa: e.email ?? "",
          razon_social: e.razon_social ?? "", condicion_iva: e.condicion_iva ?? "",
          ingresos_brutos: e.ingresos_brutos ?? "", inicio_actividades: e.inicio_actividades ?? "",
          socios: e.socios ?? "", empleados: e.empleados ?? "", observaciones: e.observaciones ?? "",
        };
      });
      setEmpresas(empresasDetalle);
    }
    const { data: vincs } = await sb.from("vinculaciones").select("id,activa,ingeniero_id,empresa_id");
    if (vincs && emps && us) {
      const vincsC: Vinculacion[] = (vincs ?? []).map((v: any) => {
        const ing = (us ?? []).find(u => u.id === v.ingeniero_id);
        const emp = (emps ?? []).find((e: any) => e.id === v.empresa_id);
        const prop = (us ?? []).find(u => u.id === emp?.propietario_id);
        return { id: v.id, ingeniero_nombre: ing?.nombre ?? "—", empresa_nombre: emp?.nombre ?? "—", propietario_nombre: prop?.nombre ?? "—", activa: v.activa };
      });
      setVinculaciones(vincsC);
    }
  };

  const generarCodigo = (rol: string): string => {
    const config = ROL_PREFIJOS[rol];
    if (!config) return "99999";
    const base = config.prefix;
    const usados = usuarios.filter(u => u.rol === rol).map(u => Number(u.codigo)).filter(c => c > base);
    if (usados.length === 0) return String(base + 1);
    return String(Math.max(...usados) + 1);
  };

  const crearUsuario = async () => {
    if (!form.nombre?.trim() || !form.email?.trim() || !form.password?.trim()) { m("❌ Completá nombre, email y contraseña"); return; }
    m("Creando usuario...");
    try {
      const sb = await getSB();
      const codigo = generarCodigo(form.rol || "productor");
      const { data, error } = await sb.auth.signUp({ email: form.email, password: form.password, options: { data: { nombre: form.nombre } } });
      if (error) { m("❌ " + error.message); return; }
      if (!data.user) { m("❌ Error al crear usuario"); return; }
      await sb.from("usuarios").insert({ auth_id: data.user.id, nombre: form.nombre, email: form.email, rol: form.rol || "productor", codigo, activo: true });
      if (form.rol === "productor") {
        const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
        if (nuevoUser) await sb.from("empresas").insert({ nombre: form.nombre_empresa || "Empresa de " + form.nombre, propietario_id: nuevoUser.id });
      }
      m("✅ Usuario creado — Código: " + codigo);
      await fetchAll(); setShowForm(false); setForm({});
    } catch { m("❌ Error inesperado"); }
  };

  const toggleUsuario = async (id: string, activo: boolean, esAdmin: boolean) => {
    if (esAdmin) { m("❌ No se puede desactivar al administrador"); return; }
    const sb = await getSB();
    await sb.from("usuarios").update({ activo: !activo }).eq("id", id);
    await fetchAll();
  };

  const crearVinculacion = async () => {
    if (!form.ingeniero_id || !form.empresa_id) { m("❌ Seleccioná ingeniero y productor"); return; }
    const sb = await getSB();
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", form.ingeniero_id).eq("empresa_id", form.empresa_id).single();
    if (existe) { m("❌ Ya existe esa vinculación"); return; }
    await sb.from("vinculaciones").insert({ ingeniero_id: form.ingeniero_id, empresa_id: form.empresa_id, activa: true, honorario_tipo: form.honorario_tipo ?? "mensual", honorario_monto: Number(form.honorario_monto ?? 0) });
    m("✅ Vinculación creada");
    await fetchAll(); setShowVincForm(false); setForm({});
  };

  const toggleVinculacion = async (id: string, activa: boolean) => {
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: !activa }).eq("id", id);
    await fetchAll();
    if (empresaActiva) await fetchVinculacionesEmpresa(empresaActiva.id);
  };

  const fetchVinculacionesEmpresa = async (empId: string) => {
    const sb = await getSB();
    const { data: vincs } = await sb.from("vinculaciones").select("*").eq("empresa_id", empId);
    if (!vincs) { setVinculacionesEmpresa([]); return; }
    const detalle: VinculacionDetalle[] = [];
    for (const v of vincs) {
      const { data: u } = await sb.from("usuarios").select("nombre,rol").eq("id", v.ingeniero_id).single();
      detalle.push({ id: v.id, profesional_nombre: u?.nombre ?? "—", rol_profesional: u?.rol ?? "ingeniero", empresa_id: v.empresa_id, honorario_tipo: v.honorario_tipo ?? "mensual", honorario_monto: v.honorario_monto ?? 0, activa: v.activa });
    }
    setVinculacionesEmpresa(detalle);
  };

  const vincularProfesionalAEmpresa = async () => {
    if (!empresaActiva || !formVinc.usuario_id) { m("❌ Selecciona un profesional"); return; }
    const sb = await getSB();
    const [usuarioId] = formVinc.usuario_id.split("||");
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", usuarioId).eq("empresa_id", empresaActiva.id).single();
    if (existe) { m("❌ Ya está vinculado"); return; }
    await sb.from("vinculaciones").insert({ ingeniero_id: usuarioId, empresa_id: empresaActiva.id, activa: true, honorario_tipo: formVinc.honorario_tipo ?? "mensual", honorario_monto: Number(formVinc.honorario_monto ?? 0) });
    m("✅ Vinculado correctamente");
    setFormVinc({}); setShowVincLocal(false);
    await fetchVinculacionesEmpresa(empresaActiva.id);
    await fetchAll();
  };

  const guardarUsuarioProfesional = async () => {
    if (!usuarioEditar) return;
    const sb = await getSB();
    await sb.from("usuarios").update({ nombre: form.nombre ?? usuarioEditar.nombre, telefono: form.telefono ?? "", matricula: form.matricula ?? "", especialidad: form.especialidad ?? "", cuit: form.cuit ?? "", localidad: form.localidad ?? "", provincia: form.provincia ?? "" }).eq("id", usuarioEditar.id);
    if (form.codigo_vincular?.trim()) {
      const { data: prod } = await sb.from("usuarios").select("id,nombre").eq("codigo", form.codigo_vincular.trim()).single();
      if (prod) {
        let { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", prod.id).single();
        if (!emp) { const { data: newEmp } = await sb.from("empresas").insert({ nombre: "Empresa de " + prod.nombre, propietario_id: prod.id }).select().single(); emp = newEmp; }
        if (emp) {
          const { data: vincExiste } = await sb.from("vinculaciones").select("id").eq("profesional_id", usuarioEditar.id).eq("empresa_id", emp.id).single();
          if (!vincExiste) await sb.from("vinculaciones").insert({ profesional_id: usuarioEditar.id, empresa_id: emp.id, activa: true, rol_profesional: usuarioEditar.rol });
          if (usuarioEditar.rol === "ingeniero") {
            const { data: ingProd } = await sb.from("ing_productores").select("id").eq("ingeniero_id", usuarioEditar.id).eq("empresa_id", emp.id).single();
            if (!ingProd) await sb.from("ing_productores").insert({ ingeniero_id: usuarioEditar.id, nombre: prod.nombre, empresa_id: emp.id, tiene_cuenta: true, activo: true });
          }
          m("✅ Guardado y vinculado con " + prod.nombre);
        }
      } else { m("⚠️ Guardado — Código de productor no encontrado"); }
    } else { m("✅ Datos guardados"); }
    await fetchAll();
    setUsuarioEditar(null); setForm({});
  };

  const guardarEmpresaDetalle = async () => {
    if (!empresaActiva) return;
    const sb = await getSB();
    await sb.from("empresas").update({ cuit: form.cuit ?? "", direccion: form.direccion ?? "", localidad: form.localidad ?? "", provincia: form.provincia ?? "", telefono: form.telefono ?? "", email: form.email_empresa ?? "", razon_social: form.razon_social ?? "", condicion_iva: form.condicion_iva ?? "", ingresos_brutos: form.ingresos_brutos ?? "", inicio_actividades: form.inicio_actividades ?? "", socios: form.socios ?? "", empleados: form.empleados ?? "", observaciones: form.observaciones ?? "" }).eq("id", empresaActiva.id);
    m("✅ Datos guardados");
    await fetchAll();
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const empresasDeProductores = empresas.filter(e => {
    const prop = usuarios.find(u => u.id === e.propietario_id);
    return prop?.rol === "productor";
  });

  const usuariosFiltrados = usuarios.filter(u =>
    !busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.codigo?.includes(busqueda)
  );

  if (loading) return (
    <div style={{minHeight:"100vh",background:"url('/FON.png') center/cover fixed",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600,fontSize:14}}>Cargando panel admin...</span>
      </div>
    </div>
  );

  // ── Vista editar profesional ──
  if (usuarioEditar) {
    const config = ROL_PREFIJOS[usuarioEditar.rol] ?? { label: usuarioEditar.rol, color: "#1976d2", icon: "👤", accentColor: "rgba(25,118,210,0.12)" };
    const vincsProf = vinculaciones.filter(v => v.ingeniero_nombre === usuarioEditar.nombre);
    return (
      <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');@keyframes spin{to{transform:rotate(360deg)}}.inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}.inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}.card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.18);position:relative;overflow:hidden;}.card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);border-radius:20px;pointer-events:none;z-index:0;}.card>*{position:relative;z-index:2;}.bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;padding:10px 18px;text-shadow:0 1px 3px rgba(0,40,120,0.35);}.abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:14px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;padding:10px 18px;}.sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;}`}</style>
        <div style={{background:"rgba(255,255,255,0.30)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(255,255,255,0.40)",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
          <button onClick={()=>setUsuarioEditar(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>← Volver</button>
          <div style={{flex:1}}/>
          <span style={{fontSize:12,fontWeight:800,color:"white",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",padding:"4px 14px",borderRadius:8}}>👑 Admin</span>
        </div>
        <div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}>
          {msg&&<div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer"}}>✕</button></div>}

          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:config.accentColor,border:`2px solid ${config.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{config.icon}</div>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:"#0d2137"}}>{usuarioEditar.nombre}</div>
                <div style={{fontSize:12,fontWeight:600,color:config.color,marginTop:2}}>{config.label} · Cód {usuarioEditar.codigo}</div>
                <div style={{fontSize:11,color:"#6b8aaa"}}>{usuarioEditar.email}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>📋 Datos Profesionales</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["nombre","Nombre",usuarioEditar.nombre,"text"],["telefono","Teléfono","3400...","text"],["matricula","Matrícula","MAT 1234","text"],["especialidad","Especialidad","","text"],["cuit","CUIT","20-123-9","text"],["localidad","Localidad","","text"],["provincia","Provincia","","text"]].map(([k,l,ph,t])=>(
                <div key={k}><label className={lCls}>{l}</label><input type={t} value={form[k]??(k==="nombre"?usuarioEditar.nombre:"")} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph}/></div>
              ))}
            </div>
          </div>

          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1565c0",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🔗 Vincular a Productor</div>
            <p style={{fontSize:12,color:"#6b8aaa",marginBottom:10}}>Ingresá el código del productor para vincularlo automáticamente</p>
            <div><label className={lCls}>Código del Productor</label><input type="text" value={form.codigo_vincular??""} onChange={e=>setForm({...form,codigo_vincular:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="10001"/></div>
            {vincsProf.length>0&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",marginBottom:8}}>Vinculaciones actuales</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {vincsProf.map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>👨‍🌾 {v.propietario_nombre}</span>
                      <span style={{fontSize:10,padding:"1px 6px",borderRadius:5,fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:v.activa?"#16a34a":"#dc2626"}}>{v.activa?"Activa":"Inactiva"}</span>
                      <button onClick={()=>toggleVinculacion(v.id,v.activa)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>{v.activa?"Desact.":"Activar"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={guardarUsuarioProfesional} className="bbtn">✓ Guardar{form.codigo_vincular?" y Vincular":""}</button>
            <button onClick={()=>{setUsuarioEditar(null);setForm({});}} className="abtn">Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista detalle empresa ──
  if (empresaActiva) {
    return (
      <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');.inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}.inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;}.card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.18);position:relative;overflow:hidden;}.card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);border-radius:20px;pointer-events:none;z-index:0;}.card>*{position:relative;z-index:2;}.bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;padding:10px 18px;text-shadow:0 1px 3px rgba(0,40,120,0.35);}.abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:14px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;padding:10px 18px;}.sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;}`}</style>
        <div style={{background:"rgba(255,255,255,0.30)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(255,255,255,0.40)",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
          <button onClick={()=>setEmpresaActiva(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>← Volver</button>
          <div style={{flex:1}}/>
          <span style={{fontSize:12,fontWeight:800,color:"white",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",padding:"4px 14px",borderRadius:8}}>👑 Admin</span>
        </div>
        <div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}>
          {msg&&<div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer"}}>✕</button></div>}

          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(22,163,74,0.12)",border:"2px solid rgba(22,163,74,0.30)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>👨‍🌾</div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:800,color:"#0d2137"}}>{empresaActiva.propietario_nombre}</div>
                <div style={{fontSize:12,color:"#16a34a",fontWeight:600}}>Código: {empresaActiva.propietario_codigo}</div>
                <div style={{fontSize:11,color:"#6b8aaa"}}>{empresaActiva.propietario_email}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>Empresa</div>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>{empresaActiva.nombre}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>📋 Datos Completos del Productor</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[["cuit","CUIT","20-123-9"],["razon_social","Razón Social",""],["telefono","Teléfono",""],["email_empresa","Email Empresa",""],["direccion","Dirección",""],["localidad","Localidad",""],["provincia","Provincia","Santa Fe"],["ingresos_brutos","Ingresos Brutos",""]].map(([k,l,ph])=>(
                <div key={k}><label className={lCls}>{l}</label><input type="text" value={form[k]??(empresaActiva as any)[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph}/></div>
              ))}
              <div><label className={lCls}>Condición IVA</label>
                <select value={form.condicion_iva??empresaActiva.condicion_iva} onChange={e=>setForm({...form,condicion_iva:e.target.value})} className="sel" style={{width:"100%"}}>
                  <option value="">—</option>
                  {["Responsable Inscripto","Monotributo","Exento","No Responsable"].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label className={lCls}>Inicio Actividades</label><input type="date" value={form.inicio_actividades??empresaActiva.inicio_actividades} onChange={e=>setForm({...form,inicio_actividades:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className={lCls}>Socios (nombre, DNI, %)</label><textarea value={form.socios??empresaActiva.socios} onChange={e=>setForm({...form,socios:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",minHeight:80,resize:"vertical"}} placeholder="Juan Pérez, DNI 12345678, 50%"/></div>
              <div><label className={lCls}>Empleados (nombre, rol)</label><textarea value={form.empleados??empresaActiva.empleados} onChange={e=>setForm({...form,empleados:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",minHeight:80,resize:"vertical"}} placeholder="Pedro Martínez, Encargado"/></div>
            </div>
            <div style={{marginBottom:14}}><label className={lCls}>Observaciones</label><textarea value={form.observaciones??empresaActiva.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",minHeight:56,resize:"vertical"}}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={guardarEmpresaDetalle} className="bbtn">✓ Guardar Datos</button>
              <button onClick={()=>setEmpresaActiva(null)} className="abtn">Cancelar</button>
            </div>
          </div>

          {/* Vinculaciones */}
          <div className="card" style={{padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1565c0",textTransform:"uppercase",letterSpacing:1}}>🔗 Profesionales Vinculados</div>
              <button onClick={()=>setShowVincLocal(!showVincLocal)} className="bbtn" style={{padding:"7px 14px",fontSize:12}}>+ Vincular</button>
            </div>
            {showVincLocal&&(
              <div style={{padding:14,borderRadius:14,background:"rgba(255,255,255,0.60)",border:"1px solid rgba(180,210,240,0.45)",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className={lCls}>Profesional</label>
                    <select value={formVinc.usuario_id??""} onChange={e=>setFormVinc({...formVinc,usuario_id:e.target.value})} className="sel" style={{width:"100%"}}>
                      <option value="">Seleccionar...</option>
                      {usuarios.filter(u=>u.rol!=="admin"&&u.rol!=="productor").map(u=>(
                        <option key={u.id} value={u.id+"||"+u.rol}>{ROL_PREFIJOS[u.rol]?.icon} {u.nombre} ({ROL_PREFIJOS[u.rol]?.label}) — {u.codigo}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lCls}>Tipo Honorario</label>
                    <select value={formVinc.honorario_tipo??"mensual"} onChange={e=>setFormVinc({...formVinc,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}>
                      {["mensual","por_ha","por_campana","por_servicio","otro"].map(o=><option key={o} value={o}>{o.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Monto $</label><input type="number" value={formVinc.honorario_monto??""} onChange={e=>setFormVinc({...formVinc,honorario_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={vincularProfesionalAEmpresa} className="bbtn" style={{padding:"8px 16px",fontSize:12}}>Vincular</button>
                  <button onClick={()=>{setShowVincLocal(false);setFormVinc({});}} className="abtn" style={{padding:"8px 14px",fontSize:12}}>Cancelar</button>
                </div>
              </div>
            )}
            {vinculacionesEmpresa.length===0
              ?<p style={{color:"#6b8aaa",fontSize:13}}>Sin profesionales vinculados todavía.</p>
              :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {vinculacionesEmpresa.map(v=>{
                  const cfg=ROL_PREFIJOS[v.rol_profesional]??ROL_PREFIJOS["ingeniero"];
                  return(
                    <div key={v.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.40)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:18}}>{cfg.icon}</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:cfg.color}}>{v.profesional_nombre}</div>
                          <div style={{fontSize:11,color:"#6b8aaa"}}>{cfg.label} · {v.honorario_tipo?.replace("_"," ")} ${Number(v.honorario_monto||0).toLocaleString("es-AR")}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:v.activa?"#16a34a":"#dc2626"}}>{v.activa?"Activa":"Inactiva"}</span>
                        <button onClick={()=>toggleVinculacion(v.id,v.activa)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>{v.activa?"Desact.":"Activar"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Panel principal ──
  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;}
        .card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.18),inset 0 2px 0 rgba(255,255,255,0.95);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);border-radius:20px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,transparent 100%);border-radius:20px 20px 0 0;pointer-events:none;z-index:1;}
        .card>*{position:relative;z-index:2;}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 18px rgba(25,118,210,0.45);padding:10px 18px;text-shadow:0 1px 3px rgba(0,40,120,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-2px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:14px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;padding:10px 18px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.90);}
        .nav-tab{padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s ease;white-space:nowrap;background:rgba(255,255,255,0.55);border:1.5px solid rgba(255,255,255,0.92);color:#1e3a5f;}
        .nav-tab.active{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.45);color:white;font-weight:800;box-shadow:0 5px 18px rgba(25,118,210,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);}
        .row-u:hover{background:rgba(255,255,255,0.80)!important;}
        .topbar{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar>*{position:relative;z-index:1;}
        .kpi{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.13);padding:14px;text-align:center;position:relative;overflow:hidden;}
        .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);border-radius:16px;pointer-events:none;}
        .kpi>*{position:relative;}
        .fade-in{animation:fadeIn 0.22s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",borderRadius:5,padding:"2px 8px",color:"white",letterSpacing:0.8,border:"1px solid rgba(100,180,255,0.45)"}}>ADMIN</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",marginTop:1,fontWeight:600}}>Panel de Administración</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",border:"2px solid rgba(255,255,255,0.90)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"white"}}>👑</div>
            <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:6,padding:"0 16px 10px"}}>
          {[{k:"usuarios",l:"👥 Usuarios",c:usuarios.length},{k:"vinculaciones",l:"🔗 Vinculaciones",c:vinculaciones.length}].map(t=>(
            <button key={t.k} onClick={()=>{setTab(t.k as any);setShowForm(false);setShowVincForm(false);}} className={`nav-tab${tab===t.k?" active":""}`}>
              {t.l} <span style={{opacity:0.65,fontSize:11,marginLeft:4}}>({t.c})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 16px 80px"}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* KPIs por rol */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:16}}>
          {Object.entries(ROL_PREFIJOS).map(([r,cfg])=>{
            const count=usuarios.filter(u=>u.rol===r).length;
            return(
              <div key={r} className="kpi">
                <div style={{fontSize:20,marginBottom:4}}>{cfg.icon}</div>
                <div style={{fontSize:22,fontWeight:800,color:cfg.color}}>{count}</div>
                <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600,marginTop:2}}>{cfg.label}</div>
              </div>
            );
          })}
        </div>

        {/* ══ USUARIOS ══ */}
        {tab==="usuarios"&&(
          <div className="fade-in">
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)} className="inp" style={{flex:1,minWidth:180,padding:"9px 14px"}} placeholder="🔍 Buscar por nombre, email o código..."/>
              <button onClick={()=>{setShowForm(!showForm);setForm({rol:"productor"});setMsg("");}} className="bbtn">+ Crear Usuario</button>
            </div>

            {showForm&&(
              <div className="card fade-in" style={{padding:16,marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>+ Nuevo Usuario</div>
                  {form.rol&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:8,fontWeight:700,background:(ROL_PREFIJOS[form.rol]?.accentColor||"rgba(25,118,210,0.10)"),color:(ROL_PREFIJOS[form.rol]?.color||"#1565c0"),border:`1px solid ${(ROL_PREFIJOS[form.rol]?.color||"#1565c0")}30`}}>Código asignado: {generarCodigo(form.rol)}</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <div><label className={lCls}>Rol</label>
                    <select value={form.rol??"productor"} onChange={e=>setForm({...form,rol:e.target.value})} className="sel" style={{width:"100%"}}>
                      {Object.entries(ROL_PREFIJOS).filter(([r])=>r!=="admin").map(([r,cfg])=>(
                        <option key={r} value={r}>{cfg.icon} {cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lCls}>Nombre Completo</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Nombre y apellido"/></div>
                  <div><label className={lCls}>Email</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="email@ejemplo.com"/></div>
                  <div><label className={lCls}>Contraseña Inicial</label><input type="text" value={form.password??""} onChange={e=>setForm({...form,password:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Clave temporal"/></div>
                  {form.rol==="productor"&&<div><label className={lCls}>Nombre de la Empresa</label><input type="text" value={form.nombre_empresa??""} onChange={e=>setForm({...form,nombre_empresa:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Establecimiento Don Juan"/></div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={crearUsuario} className="bbtn">✓ Crear</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Código","Nombre","Email","Rol","Estado","",""].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map(u=>{
                    const cfg=ROL_PREFIJOS[u.rol];
                    const esAdmin=u.rol==="admin";
                    const empDeEsteUser=empresasDeProductores.find(e=>e.propietario_id===u.id);
                    return(
                      <tr key={u.id} className="row-u" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",background:"transparent",transition:"background 0.15s"}}>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:800,color:"#1565c0"}}>{u.codigo}</td>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:"#0d2137"}}>{u.nombre}</td>
                        <td style={{padding:"10px 14px",fontSize:11,color:"#6b8aaa"}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:7,fontWeight:700,background:cfg?.accentColor||"rgba(25,118,210,0.10)",color:cfg?.color||"#1565c0",border:`1px solid ${(cfg?.color||"#1565c0")}30`}}>
                            {cfg?.icon} {cfg?.label??u.rol}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:u.activo?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:u.activo?"#16a34a":"#dc2626"}}>
                            {u.activo?"Activo":"Inactivo"}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          {!esAdmin&&<button onClick={()=>toggleUsuario(u.id,u.activo,esAdmin)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>{u.activo?"Desactivar":"Activar"}</button>}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:6}}>
                            {empDeEsteUser&&(
                              <button onClick={async()=>{setEmpresaActiva(empDeEsteUser);setForm({});setShowVincLocal(false);setFormVinc({});await fetchVinculacionesEmpresa(empDeEsteUser.id);}} style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.25)",color:"#d97706",cursor:"pointer",fontWeight:700}}>📋 Datos</button>
                            )}
                            {u.rol!=="admin"&&u.rol!=="productor"&&(
                              <button onClick={()=>{setUsuarioEditar(u);setForm({nombre:u.nombre,telefono:u.telefono??"",matricula:u.matricula??"",especialidad:u.especialidad??"",cuit:u.cuit??"",localidad:u.localidad??"",provincia:u.provincia??"",codigo_vincular:""});}} style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"rgba(25,118,210,0.10)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0",cursor:"pointer",fontWeight:700}}>✏️ Editar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usuariosFiltrados.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>Sin usuarios{busqueda?" que coincidan con la búsqueda":""}</div>}
            </div>
          </div>
        )}

        {/* ══ VINCULACIONES ══ */}
        {tab==="vinculaciones"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowVincForm(!showVincForm);setForm({});}} className="bbtn">+ Nueva Vinculación</button>
            </div>

            {showVincForm&&(
              <div className="card fade-in" style={{padding:16,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:14}}>🔗 Vincular Ingeniero ↔ Productor</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <div><label className={lCls}>Ingeniero</label>
                    <select value={form.ingeniero_id??""} onChange={e=>setForm({...form,ingeniero_id:e.target.value})} className="sel" style={{width:"100%"}}>
                      <option value="">Seleccionar...</option>
                      {ingenieros.map(i=><option key={i.id} value={i.id}>{i.nombre} ({i.codigo})</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Productor</label>
                    <select value={form.empresa_id??""} onChange={e=>setForm({...form,empresa_id:e.target.value})} className="sel" style={{width:"100%"}}>
                      <option value="">Seleccionar...</option>
                      {empresasDeProductores.map(e=><option key={e.id} value={e.id}>{e.propietario_nombre} — {e.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Tipo Honorario</label>
                    <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}>
                      {["mensual","por_ha","por_campana","otro"].map(o=><option key={o} value={o}>{o.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Monto Honorario</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="0"/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={crearVinculacion} className="bbtn">✓ Vincular</button>
                  <button onClick={()=>{setShowVincForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Ingeniero","Productor","Empresa","Estado",""].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vinculaciones.map(v=>(
                    <tr key={v.id} className="row-u" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",background:"transparent",transition:"background 0.15s"}}>
                      <td style={{padding:"10px 14px",fontSize:13,color:"#1976d2",fontWeight:600}}>👨‍💼 {v.ingeniero_nombre}</td>
                      <td style={{padding:"10px 14px",fontSize:13,color:"#16a34a",fontWeight:600}}>👨‍🌾 {v.propietario_nombre}</td>
                      <td style={{padding:"10px 14px",fontSize:11,color:"#6b8aaa"}}>{v.empresa_nombre}</td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:v.activa?"#16a34a":"#dc2626"}}>{v.activa?"Activa":"Inactiva"}</span>
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <button onClick={()=>toggleVinculacion(v.id,v.activa)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>{v.activa?"Desactivar":"Activar"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vinculaciones.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>Sin vinculaciones registradas</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

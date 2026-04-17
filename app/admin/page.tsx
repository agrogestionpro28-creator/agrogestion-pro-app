"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Usuario = {
  id: string; nombre: string; email: string;
  rol: string; codigo: string; activo: boolean;
  telefono?: string; matricula?: string; especialidad?: string;
  cuit?: string; localidad?: string; provincia?: string;
};
type Empresa = {
  id: string; nombre: string; propietario_id: string;
};
type Vinculacion = {
  id: string; profesional_id: string; empresa_id: string;
  rol_profesional: string; activa: boolean;
  profesional_nombre?: string; profesional_codigo?: string;
  productor_nombre?: string; productor_codigo?: string;
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

// Roles que pueden vincularse a productores
const ROLES_VINCULABLES = ["ingeniero","veterinario","empleado","aplicador","sembrador"];

export default function AdminPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"usuarios"|"vinculaciones">("usuarios");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [saving, setSaving] = useState(false);

  // Vista de edición de usuario
  const [usuarioEditar, setUsuarioEditar] = useState<Usuario|null>(null);
  const [vincsDelUsuario, setVincsDelUsuario] = useState<Vinculacion[]>([]);
  const [codigoVincular, setCodigoVincular] = useState("");
  const [loadingVinc, setLoadingVinc] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const m = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 5000); };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "admin") { window.location.href = "/login"; return; }
    await fetchAll();
    setLoading(false);
  };

  const fetchAll = async () => {
    const sb = await getSB();
    const [{ data: us }, { data: emps }, { data: vincs }] = await Promise.all([
      sb.from("usuarios").select("*").order("codigo"),
      sb.from("empresas").select("id,nombre,propietario_id"),
      sb.from("vinculaciones").select("*"),
    ]);
    setUsuarios(us ?? []);
    setEmpresas(emps ?? []);

    // Enriquecer vinculaciones con nombres
    const vincsRich: Vinculacion[] = (vincs ?? []).map((v: any) => {
      const prof = (us ?? []).find(u => u.id === v.profesional_id || u.id === v.ingeniero_id);
      const emp = (emps ?? []).find((e: any) => e.id === v.empresa_id);
      const prod = (us ?? []).find(u => u.id === emp?.propietario_id);
      return {
        id: v.id,
        profesional_id: v.profesional_id ?? v.ingeniero_id,
        empresa_id: v.empresa_id,
        rol_profesional: v.rol_profesional ?? prof?.rol ?? "ingeniero",
        activa: v.activa,
        profesional_nombre: prof?.nombre ?? "—",
        profesional_codigo: prof?.codigo ?? "—",
        productor_nombre: prod?.nombre ?? "—",
        productor_codigo: prod?.codigo ?? "—",
      };
    });
    setVinculaciones(vincsRich);
  };

  const fetchVincsUsuario = async (usuarioId: string) => {
    const sb = await getSB();
    const { data: vincs } = await sb.from("vinculaciones")
      .select("*")
      .or(`profesional_id.eq.${usuarioId},ingeniero_id.eq.${usuarioId}`);
    if (!vincs) { setVincsDelUsuario([]); return; }
    const rich: Vinculacion[] = vincs.map((v: any) => {
      const emp = empresas.find(e => e.id === v.empresa_id);
      const prod = usuarios.find(u => u.id === emp?.propietario_id);
      return {
        id: v.id,
        profesional_id: v.profesional_id ?? v.ingeniero_id,
        empresa_id: v.empresa_id,
        rol_profesional: v.rol_profesional ?? usuarioEditar?.rol ?? "ingeniero",
        activa: v.activa,
        productor_nombre: prod?.nombre ?? "—",
        productor_codigo: prod?.codigo ?? "—",
      };
    });
    setVincsDelUsuario(rich);
  };

  const generarCodigo = (rol: string): string => {
    const config = ROL_PREFIJOS[rol];
    if (!config) return "99999";
    const usados = usuarios.filter(u => u.rol === rol).map(u => Number(u.codigo)).filter(c => !isNaN(c));
    if (usados.length === 0) return String(config.prefix + 1);
    return String(Math.max(...usados) + 1);
  };

  const crearUsuario = async () => {
    if (!form.nombre?.trim() || !form.email?.trim() || !form.password?.trim()) {
      m("❌ Completá nombre, email y contraseña"); return;
    }
    setSaving(true); m("Creando usuario...");
    try {
      const sb = await getSB();
      const codigo = generarCodigo(form.rol || "productor");
      const { data, error } = await sb.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { nombre: form.nombre } }
      });
      if (error || !data.user) { m("❌ " + (error?.message || "Error al crear")); setSaving(false); return; }

      await sb.from("usuarios").insert({
        auth_id: data.user.id, nombre: form.nombre,
        email: form.email, rol: form.rol || "productor",
        codigo, activo: true,
      });

      // Si es productor → crear empresa automáticamente
      if (form.rol === "productor") {
        const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
        if (nuevoUser) {
          await sb.from("empresas").insert({
            nombre: form.nombre_empresa || "Empresa de " + form.nombre,
            propietario_id: nuevoUser.id,
          });
        }
      }

      // Si es vinculable y se ingresó código de productor → vincular
      if (ROLES_VINCULABLES.includes(form.rol || "") && form.codigo_productor?.trim()) {
        const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
        if (nuevoUser) {
          await vincularConCodigo(nuevoUser.id, form.rol || "", form.codigo_productor.trim(), false);
        }
      }

      m("✅ Usuario creado — Código: " + codigo);
      await fetchAll();
      setShowForm(false); setForm({});
    } catch { m("❌ Error inesperado"); }
    setSaving(false);
  };

  // Función central de vinculación por código
  const vincularConCodigo = async (
    profesionalId: string,
    rolProfesional: string,
    codigoProd: string,
    mostrarMsg: boolean = true
  ): Promise<boolean> => {
    const sb = await getSB();

    // Buscar productor por código
    const { data: prod } = await sb.from("usuarios")
      .select("id,nombre").eq("codigo", codigoProd.trim()).eq("rol","productor").single();
    if (!prod) {
      if (mostrarMsg) m("❌ No se encontró productor con código " + codigoProd);
      return false;
    }

    // Buscar o crear empresa del productor
    let { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", prod.id).single();
    if (!emp) {
      const { data: newEmp } = await sb.from("empresas")
        .insert({ nombre: "Empresa de " + prod.nombre, propietario_id: prod.id })
        .select().single();
      emp = newEmp;
    }
    if (!emp) { if (mostrarMsg) m("❌ Error al obtener empresa"); return false; }

    // Verificar si ya existe vinculación
    const { data: existe } = await sb.from("vinculaciones").select("id,activa")
      .or(`profesional_id.eq.${profesionalId},ingeniero_id.eq.${profesionalId}`)
      .eq("empresa_id", emp.id).single();

    if (existe) {
      if (!existe.activa) {
        // Reactivar si estaba inactiva
        await sb.from("vinculaciones").update({ activa: true }).eq("id", existe.id);
        if (mostrarMsg) m("✅ Vinculación reactivada con " + prod.nombre);
      } else {
        if (mostrarMsg) m("⚠️ Ya está vinculado con " + prod.nombre);
      }
      return true;
    }

    // Crear vinculación nueva
    // Compatible con ambas estructuras de tabla (profesional_id o ingeniero_id)
    await sb.from("vinculaciones").insert({
      profesional_id: profesionalId,
      ingeniero_id: profesionalId, // para compatibilidad
      empresa_id: emp.id,
      rol_profesional: rolProfesional,
      activa: true,
      honorario_tipo: "mensual",
      honorario_monto: 0,
    });

    // Si es empleado → actualizar empresa_id en tabla empleados también
    if (rolProfesional === "empleado") {
      await sb.from("empleados").update({ empresa_id: emp.id })
        .eq("auth_id", (await sb.from("usuarios").select("auth_id").eq("id", profesionalId).single())?.data?.auth_id ?? "");
    }

    if (mostrarMsg) m("✅ Vinculado con " + prod.nombre + " (Cód. " + codigoProd + ")");
    return true;
  };

  const agregarVinculacion = async () => {
    if (!usuarioEditar || !codigoVincular.trim()) {
      m("❌ Ingresá el código del productor"); return;
    }
    setLoadingVinc(true);
    const ok = await vincularConCodigo(usuarioEditar.id, usuarioEditar.rol, codigoVincular, true);
    if (ok) {
      setCodigoVincular("");
      await fetchAll();
      await fetchVincsUsuario(usuarioEditar.id);
    }
    setLoadingVinc(false);
  };

  const toggleVinculacion = async (id: string, activa: boolean) => {
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: !activa }).eq("id", id);
    await fetchAll();
    if (usuarioEditar) await fetchVincsUsuario(usuarioEditar.id);
  };

  const eliminarVinculacion = async (id: string) => {
    if (!confirm("¿Eliminar esta vinculación?")) return;
    const sb = await getSB();
    await sb.from("vinculaciones").delete().eq("id", id);
    await fetchAll();
    if (usuarioEditar) await fetchVincsUsuario(usuarioEditar.id);
    m("✅ Vinculación eliminada");
  };

  const toggleUsuario = async (id: string, activo: boolean, esAdmin: boolean) => {
    if (esAdmin) { m("❌ No se puede desactivar al administrador"); return; }
    const sb = await getSB();
    await sb.from("usuarios").update({ activo: !activo }).eq("id", id);
    await fetchAll();
  };

  const guardarUsuario = async () => {
    if (!usuarioEditar) return;
    setSaving(true);
    const sb = await getSB();
    await sb.from("usuarios").update({
      nombre: form.nombre ?? usuarioEditar.nombre,
      telefono: form.telefono ?? "",
      matricula: form.matricula ?? "",
      especialidad: form.especialidad ?? "",
      cuit: form.cuit ?? "",
      localidad: form.localidad ?? "",
      provincia: form.provincia ?? "",
    }).eq("id", usuarioEditar.id);
    m("✅ Datos guardados");
    await fetchAll();
    setSaving(false);
  };

  const abrirEditar = async (u: Usuario) => {
    setUsuarioEditar(u);
    setForm({
      nombre: u.nombre, telefono: u.telefono ?? "",
      matricula: u.matricula ?? "", especialidad: u.especialidad ?? "",
      cuit: u.cuit ?? "", localidad: u.localidad ?? "", provincia: u.provincia ?? "",
    });
    setCodigoVincular("");
    setVincsDelUsuario([]);
    await fetchVincsUsuario(u.id);
  };

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  const usuariosFiltrados = usuarios.filter(u =>
    !busqueda ||
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.codigo?.includes(busqueda)
  );

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600,fontSize:14}}>Cargando panel admin...</span>
      </div>
    </div>
  );

  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;font-family:'DM Sans',system-ui;}
    .inp::placeholder{color:rgba(80,120,160,0.50);}
    .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
    .inp option{background:white;color:#1a2a4a;}
    .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;}
    .card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:20px;box-shadow:0 8px 32px rgba(20,80,160,0.18);position:relative;overflow:hidden;}
    .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);pointer-events:none;z-index:0;}
    .card>*{position:relative;z-index:2;}
    .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;padding:10px 18px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 4px 18px rgba(25,118,210,0.40);transition:all 0.18s;}
    .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
    .bbtn:disabled{opacity:0.6;cursor:not-allowed;}
    .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:14px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;padding:10px 18px;transition:all 0.18s;}
    .abtn:hover{background:rgba(255,255,255,0.95);}
    .nav-tab{padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;background:rgba(255,255,255,0.55);border:1.5px solid rgba(255,255,255,0.92);color:#1e3a5f;}
    .nav-tab.active{background-image:url('/AZUL.png');background-size:cover;border:1.5px solid rgba(100,180,255,0.45);color:white;font-weight:800;box-shadow:0 5px 18px rgba(25,118,210,0.40);text-shadow:0 1px 3px rgba(0,40,120,0.30);}
    .row-u:hover{background:rgba(255,255,255,0.80)!important;}
    .topbar{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
    .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
    .topbar>*{position:relative;z-index:1;}
    .kpi{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.13);padding:14px;text-align:center;position:relative;overflow:hidden;}
    .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);pointer-events:none;}
    .kpi>*{position:relative;}
    .fade-in{animation:fadeIn 0.22s ease;}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
  `;

  // ══════════════════════════════
  // VISTA EDITAR USUARIO
  // ══════════════════════════════
  if (usuarioEditar) {
    const cfg = ROL_PREFIJOS[usuarioEditar.rol] ?? { label: usuarioEditar.rol, color: "#1976d2", icon: "👤", accentColor: "rgba(25,118,210,0.12)" };
    const esVinculable = ROLES_VINCULABLES.includes(usuarioEditar.rol);

    return (
      <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center"}}>
        <style>{STYLES}</style>

        {/* Topbar */}
        <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px"}}>
            <button onClick={()=>{setUsuarioEditar(null);setForm({});setVincsDelUsuario([]);}} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>← Volver</button>
            <div style={{flex:1}}/>
            <span style={{fontSize:12,fontWeight:800,color:"white",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",padding:"4px 14px",borderRadius:8}}>👑 Admin</span>
          </div>
        </div>

        <div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px 80px"}}>
          {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":msg.startsWith("⚠️")?"#d97706":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":msg.startsWith("⚠️")?"rgba(254,243,199,0.90)":"rgba(254,226,226,0.90)",border:"1px solid rgba(0,0,0,0.08)",display:"flex",justifyContent:"space-between"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer"}}>✕</button></div>}

          {/* Header usuario */}
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:cfg.accentColor,border:`2px solid ${cfg.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{cfg.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:800,color:"#0d2137"}}>{usuarioEditar.nombre}</div>
                <div style={{fontSize:12,fontWeight:600,color:cfg.color}}>{cfg.label} · Cód. {usuarioEditar.codigo}</div>
                <div style={{fontSize:11,color:"#6b8aaa"}}>{usuarioEditar.email}</div>
              </div>
              <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:usuarioEditar.activo?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:usuarioEditar.activo?"#16a34a":"#dc2626"}}>{usuarioEditar.activo?"Activo":"Inactivo"}</span>
            </div>
          </div>

          {/* Datos */}
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>📋 Datos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[["nombre","Nombre",usuarioEditar.nombre,"text"],["telefono","Teléfono","","text"],["cuit","CUIT","20-123-9","text"],["localidad","Localidad","","text"],["provincia","Provincia","","text"],["matricula","Matrícula","","text"],["especialidad","Especialidad","","text"]].map(([k,l,ph])=>(
                <div key={k}><label className={lCls}>{l}</label><input type="text" value={form[k]??""} onChange={e=>setForm({...form,[k]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph}/></div>
              ))}
            </div>
            <button onClick={guardarUsuario} disabled={saving} className="bbtn" style={{fontSize:12,padding:"9px 18px"}}>{saving?"Guardando...":"✓ Guardar datos"}</button>
          </div>

          {/* Vinculaciones — solo para roles vinculables */}
          {esVinculable&&(
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1565c0",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>🔗 Productores Vinculados</div>
              <p style={{fontSize:12,color:"#6b8aaa",marginBottom:14}}>
                Un {cfg.label.toLowerCase()} puede estar vinculado a <strong>varios productores</strong>. Ingresá el código del productor para vincularlo.
              </p>

              {/* Input vincular por código */}
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <div style={{flex:1}}>
                  <label className={lCls}>Código del productor a vincular</label>
                  <input
                    type="text"
                    value={codigoVincular}
                    onChange={e=>setCodigoVincular(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&agregarVinculacion()}
                    className={iCls}
                    style={{width:"100%",padding:"10px 14px",fontSize:14,fontWeight:700}}
                    placeholder="10001, 10002..."
                  />
                </div>
                <button onClick={agregarVinculacion} disabled={loadingVinc||!codigoVincular.trim()} className="bbtn" style={{alignSelf:"flex-end",padding:"10px 16px",fontSize:12}}>
                  {loadingVinc?"...":"+ Vincular"}
                </button>
              </div>

              {/* Lista de vinculaciones actuales */}
              {vincsDelUsuario.length===0?(
                <div style={{textAlign:"center",padding:"20px 0",color:"#6b8aaa",fontSize:13}}>Sin productores vinculados todavía</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {vincsDelUsuario.map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.40)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20}}>👨‍🌾</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:"#16a34a"}}>{v.productor_nombre}</div>
                          <div style={{fontSize:11,color:"#6b8aaa"}}>Código: {v.productor_codigo}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,padding:"2px 9px",borderRadius:20,fontWeight:700,background:v.activa?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:v.activa?"#16a34a":"#dc2626"}}>{v.activa?"Activa":"Inactiva"}</span>
                        <button onClick={()=>toggleVinculacion(v.id,v.activa)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>{v.activa?"Pausar":"Activar"}</button>
                        <button onClick={()=>eliminarVinculacion(v.id)} style={{fontSize:11,color:"#dc2626",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════
  // PANEL PRINCIPAL
  // ══════════════════════════════
  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{STYLES}</style>

      {/* TOPBAR */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",borderRadius:5,padding:"2px 8px",color:"white",letterSpacing:0.8}}>ADMIN</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",fontWeight:600}}>Panel de Administración</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"white"}}>👑</div>
            <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,padding:"0 16px 10px"}}>
          {[{k:"usuarios",l:"👥 Usuarios"},{k:"vinculaciones",l:"🔗 Vinculaciones"}].map(t=>(
            <button key={t.k} onClick={()=>{setTab(t.k as any);setShowForm(false);}} className={`nav-tab${tab===t.k?" active":""}`}>{t.l}</button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 16px 80px"}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":msg.startsWith("⚠️")?"#d97706":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":msg.startsWith("⚠️")?"rgba(254,243,199,0.90)":"rgba(254,226,226,0.90)",border:"1px solid rgba(0,0,0,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* KPIs */}
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
              <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)} className="inp" style={{flex:1,minWidth:200,padding:"9px 14px"}} placeholder="🔍 Buscar por nombre, email o código..."/>
              <button onClick={()=>{setShowForm(!showForm);setForm({rol:"productor"});}} className="bbtn">+ Crear Usuario</button>
            </div>

            {showForm&&(
              <div className="card fade-in" style={{padding:16,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:14}}>+ Nuevo Usuario</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Rol</label>
                    <select value={form.rol??"productor"} onChange={e=>setForm({...form,rol:e.target.value})} className="sel" style={{width:"100%"}}>
                      {Object.entries(ROL_PREFIJOS).filter(([r])=>r!=="admin").map(([r,cfg])=>(
                        <option key={r} value={r}>{cfg.icon} {cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    {form.rol&&<span style={{fontSize:12,fontWeight:700,color:ROL_PREFIJOS[form.rol]?.color||"#1565c0",padding:"4px 12px",borderRadius:8,background:(ROL_PREFIJOS[form.rol]?.accentColor||"rgba(25,118,210,0.10)")}}>Código: {generarCodigo(form.rol)}</span>}
                  </div>
                  <div><label className={lCls}>Nombre completo</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Apellido y nombre"/></div>
                  <div><label className={lCls}>Email</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="email@ejemplo.com"/></div>
                  <div><label className={lCls}>Contraseña inicial</label><input type="text" value={form.password??""} onChange={e=>setForm({...form,password:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Clave temporal"/></div>
                  {form.rol==="productor"&&(
                    <div><label className={lCls}>Nombre empresa / campo</label><input type="text" value={form.nombre_empresa??""} onChange={e=>setForm({...form,nombre_empresa:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Establecimiento Don Juan"/></div>
                  )}
                  {ROLES_VINCULABLES.includes(form.rol||"")&&(
                    <div style={{gridColumn:"span 2"}}>
                      <label className={lCls}>Código del productor al que pertenece (opcional)</label>
                      <input type="text" value={form.codigo_productor??""} onChange={e=>setForm({...form,codigo_productor:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="10001 — se vincula automáticamente al crear"/>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={crearUsuario} disabled={saving} className="bbtn">{saving?"Creando...":"✓ Crear"}</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Tabla usuarios */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Código","Nombre","Email","Rol","Estado","Vinculaciones",""].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map(u=>{
                    const cfg = ROL_PREFIJOS[u.rol];
                    const esAdmin = u.rol==="admin";
                    const esVinculable = ROLES_VINCULABLES.includes(u.rol);
                    // Contar vinculaciones activas de este usuario
                    const vincsUser = vinculaciones.filter(v => v.profesional_id === u.id);
                    return(
                      <tr key={u.id} className="row-u" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:800,color:"#1565c0"}}>{u.codigo}</td>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:"#0d2137"}}>{u.nombre}</td>
                        <td style={{padding:"10px 14px",fontSize:11,color:"#6b8aaa"}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:7,fontWeight:700,background:cfg?.accentColor||"rgba(25,118,210,0.10)",color:cfg?.color||"#1565c0",border:`1px solid ${(cfg?.color||"#1565c0")}25`}}>
                            {cfg?.icon} {cfg?.label??u.rol}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:u.activo?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:u.activo?"#16a34a":"#dc2626"}}>
                            {u.activo?"Activo":"Inactivo"}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          {esVinculable&&(
                            vincsUser.length>0
                              ?<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                {vincsUser.slice(0,3).map(v=>(
                                  <span key={v.id} style={{fontSize:9,padding:"1px 7px",borderRadius:20,fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:v.activa?"#16a34a":"#dc2626"}}>{v.productor_codigo}</span>
                                ))}
                                {vincsUser.length>3&&<span style={{fontSize:9,color:"#6b8aaa"}}>+{vincsUser.length-3}</span>}
                              </div>
                              :<span style={{fontSize:11,color:"#aab8c8"}}>Sin vincular</span>
                          )}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            {!esAdmin&&(
                              <button onClick={()=>toggleUsuario(u.id,u.activo,esAdmin)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>{u.activo?"Desact.":"Activar"}</button>
                            )}
                            {!esAdmin&&(
                              <button onClick={()=>abrirEditar(u)} style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"rgba(25,118,210,0.10)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0",cursor:"pointer",fontWeight:700}}>✏️ Editar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usuariosFiltrados.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>Sin usuarios{busqueda?" que coincidan":""}</div>}
            </div>
          </div>
        )}

        {/* ══ VINCULACIONES ══ */}
        {tab==="vinculaciones"&&(
          <div className="fade-in">
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:"rgba(25,118,210,0.06)",border:"1px solid rgba(25,118,210,0.18)",fontSize:12,color:"#1565c0",fontWeight:600}}>
              💡 Para vincular un profesional a un productor, andá a <strong>Usuarios → Editar</strong> y usá el campo de código de productor.
            </div>

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Todas las vinculaciones ({vinculaciones.length})</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Profesional","Código","Rol","Productor","Código","Estado",""].map(h=>(
                      <th key={h+Math.random()} style={{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vinculaciones.map(v=>{
                    const cfg = ROL_PREFIJOS[v.rol_profesional] ?? ROL_PREFIJOS["ingeniero"];
                    return(
                      <tr key={v.id} className="row-u" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:cfg.color}}>{cfg.icon} {v.profesional_nombre}</td>
                        <td style={{padding:"10px 14px",fontSize:12,color:"#6b8aaa"}}>{v.profesional_codigo}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:cfg.accentColor,color:cfg.color}}>{cfg.label}</span>
                        </td>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:"#16a34a"}}>👨‍🌾 {v.productor_nombre}</td>
                        <td style={{padding:"10px 14px",fontSize:12,color:"#6b8aaa"}}>{v.productor_codigo}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",color:v.activa?"#16a34a":"#dc2626"}}>{v.activa?"Activa":"Inactiva"}</span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <button onClick={()=>toggleVinculacion(v.id,v.activa)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>{v.activa?"Pausar":"Activar"}</button>
                        </td>
                      </tr>
                    );
                  })}
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

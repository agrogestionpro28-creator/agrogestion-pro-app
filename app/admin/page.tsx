"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Usuario = {
  id: string; nombre: string; email: string; rol: string;
  codigo: string; activo: boolean; telefono?: string;
  matricula?: string; especialidad?: string; cuit?: string;
  localidad?: string; provincia?: string;
};
type Empresa = { id: string; nombre: string; propietario_id: string; };
type Vinculacion = {
  id: string; profesional_id: string; empresa_id: string;
  rol_profesional: string; activa: boolean;
  // enriquecidos
  profesional_nombre?: string; profesional_codigo?: string; profesional_rol?: string;
  productor_nombre?: string; productor_codigo?: string;
};

const ROLES: Record<string, { prefix: number; label: string; color: string; icon: string; bg: string }> = {
  admin:          { prefix: 0,     label: "Admin",            color: "#dc2626", icon: "👑", bg: "rgba(220,38,38,0.10)" },
  productor:      { prefix: 10000, label: "Productor",        color: "#16a34a", icon: "👨‍🌾", bg: "rgba(22,163,74,0.10)" },
  ingeniero:      { prefix: 20000, label: "Ingeniero",        color: "#1976d2", icon: "👨‍💼", bg: "rgba(25,118,210,0.10)" },
  veterinario:    { prefix: 30000, label: "Veterinario",      color: "#7c3aed", icon: "🩺",  bg: "rgba(124,58,237,0.10)" },
  empleado:       { prefix: 40000, label: "Empleado",         color: "#d97706", icon: "👷", bg: "rgba(217,119,6,0.10)" },
  aplicador:      { prefix: 50000, label: "Aplicador",        color: "#0891b2", icon: "💧", bg: "rgba(8,145,178,0.10)" },
  sembrador:      { prefix: 60000, label: "Sembrador",        color: "#15803d", icon: "🌱", bg: "rgba(21,128,61,0.10)" },
  cosechadora:    { prefix: 70000, label: "Cosechadora",      color: "#b45309", icon: "🌾", bg: "rgba(180,83,9,0.10)" },
  servicios:      { prefix: 80000, label: "Servicios Varios", color: "#6b7280", icon: "🔧", bg: "rgba(107,114,128,0.10)" },
};

// Roles que se vinculan a un productor
const VINCULABLES = ["ingeniero","veterinario","empleado","aplicador","sembrador","cosechadora","servicios"];

export default function AdminPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"usuarios"|"vinculaciones">("usuarios");
  const [busqueda, setBusqueda] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Formulario nuevo usuario
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});

  // Edición de usuario
  const [editando, setEditando] = useState<Usuario|null>(null);
  const [formEdit, setFormEdit] = useState<Record<string,string>>({});
  const [vincsEdit, setVincsEdit] = useState<Vinculacion[]>([]);
  const [codVincular, setCodVincular] = useState("");
  const [vincLoading, setVincLoading] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const toast = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 5000); };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "admin") { window.location.href = "/login"; return; }
    await cargarTodo();
    setLoading(false);
  };

  const cargarTodo = async () => {
    const sb = await getSB();
    const [{ data: us }, { data: emps }, { data: vincs }] = await Promise.all([
      sb.from("usuarios").select("*").order("codigo"),
      sb.from("empresas").select("id,nombre,propietario_id"),
      sb.from("vinculaciones").select("*").order("created_at", { ascending: false }),
    ]);
    const usuariosData = us ?? [];
    const empresasData = emps ?? [];
    setUsuarios(usuariosData);
    setEmpresas(empresasData);

    // Enriquecer vinculaciones
    const rich: Vinculacion[] = (vincs ?? []).map((v: any) => {
      const prof = usuariosData.find(u => u.id === v.profesional_id);
      const emp  = empresasData.find((e: any) => e.id === v.empresa_id);
      const prod = usuariosData.find(u => u.id === emp?.propietario_id);
      return {
        id: v.id,
        profesional_id: v.profesional_id,
        empresa_id: v.empresa_id,
        rol_profesional: v.rol_profesional,
        activa: v.activa,
        profesional_nombre: prof?.nombre ?? "—",
        profesional_codigo: prof?.codigo ?? "—",
        profesional_rol: prof?.rol ?? v.rol_profesional,
        productor_nombre: prod?.nombre ?? "—",
        productor_codigo: prod?.codigo ?? "—",
      };
    });
    setVinculaciones(rich);
  };

  // Cargar vinculaciones del usuario que se está editando
  const cargarVincsDeUsuario = async (usuarioId: string) => {
    const sb = await getSB();
    const { data: vincs } = await sb.from("vinculaciones")
      .select("*")
      .eq("profesional_id", usuarioId)
      .order("created_at", { ascending: false });

    const rich: Vinculacion[] = (vincs ?? []).map((v: any) => {
      const emp  = empresas.find(e => e.id === v.empresa_id);
      const prod = usuarios.find(u => u.id === emp?.propietario_id);
      return {
        id: v.id,
        profesional_id: v.profesional_id,
        empresa_id: v.empresa_id,
        rol_profesional: v.rol_profesional,
        activa: v.activa,
        productor_nombre: prod?.nombre ?? "—",
        productor_codigo: prod?.codigo ?? "—",
      };
    });
    setVincsEdit(rich);
  };

  const generarCodigo = (rol: string): string => {
    const cfg = ROLES[rol];
    if (!cfg) return "99999";
    const usados = usuarios
      .filter(u => u.rol === rol)
      .map(u => Number(u.codigo))
      .filter(n => !isNaN(n) && n >= cfg.prefix);
    return usados.length === 0 ? String(cfg.prefix + 1) : String(Math.max(...usados) + 1);
  };

  // ── CREAR USUARIO ──
  const crearUsuario = async () => {
    if (!form.nombre?.trim() || !form.email?.trim() || !form.password?.trim()) {
      toast("❌ Completá nombre, email y contraseña"); return;
    }
    setSaving(true);
    try {
      const sb = await getSB();
      const rol = form.rol || "productor";
      const codigo = generarCodigo(rol);

      const { data, error } = await sb.auth.signUp({
        email: form.email.trim(),
        password: form.password.trim(),
        options: { data: { nombre: form.nombre.trim() } },
      });
      if (error || !data.user) { toast("❌ " + (error?.message || "Error al crear")); setSaving(false); return; }

      // Insertar en usuarios
      const { data: nuevoU } = await sb.from("usuarios").insert({
        auth_id: data.user.id,
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        rol, codigo, activo: true,
      }).select().single();

      // Si es productor → crear empresa
      if (rol === "productor" && nuevoU) {
        await sb.from("empresas").insert({
          nombre: form.nombre_empresa?.trim() || "Empresa de " + form.nombre.trim(),
          propietario_id: nuevoU.id,
        });
      }

      // Si es vinculable y pusieron código de productor → vincular
      if (VINCULABLES.includes(rol) && form.cod_productor?.trim() && nuevoU) {
        await vincularPorCodigo(nuevoU.id, rol, form.cod_productor.trim(), false);
      }

      toast("✅ Usuario creado — Código: " + codigo);
      await cargarTodo();
      setShowForm(false); setForm({});
    } catch (e: any) { toast("❌ " + (e.message || "Error inesperado")); }
    setSaving(false);
  };

  // ── VINCULAR POR CÓDIGO ──
  const vincularPorCodigo = async (
    profesionalId: string,
    rolProf: string,
    codigoProd: string,
    mostrarMsg = true
  ): Promise<boolean> => {
    const sb = await getSB();

    // Buscar productor
    const { data: prod } = await sb.from("usuarios")
      .select("id,nombre")
      .eq("codigo", codigoProd.trim())
      .eq("rol", "productor")
      .single();
    if (!prod) {
      if (mostrarMsg) toast("❌ No existe productor con código " + codigoProd);
      return false;
    }

    // Buscar empresa del productor
    let { data: emp } = await sb.from("empresas")
      .select("id")
      .eq("propietario_id", prod.id)
      .single();

    // Si no tiene empresa, crearla
    if (!emp) {
      const { data: newEmp } = await sb.from("empresas")
        .insert({ nombre: "Empresa de " + prod.nombre, propietario_id: prod.id })
        .select().single();
      emp = newEmp;
    }
    if (!emp) { if (mostrarMsg) toast("❌ Error con la empresa del productor"); return false; }

    // Verificar si ya existe esta vinculación exacta (profesional_id + empresa_id)
    const { data: existe } = await sb.from("vinculaciones")
      .select("id,activa")
      .eq("profesional_id", profesionalId)
      .eq("empresa_id", emp.id)
      .single();

    if (existe) {
      if (!existe.activa) {
        await sb.from("vinculaciones").update({ activa: true }).eq("id", existe.id);
        if (mostrarMsg) toast("✅ Vinculación reactivada con " + prod.nombre);
      } else {
        if (mostrarMsg) toast("⚠️ Ya estaba vinculado con " + prod.nombre);
      }
      return true;
    }

    // Crear vinculación nueva
    await sb.from("vinculaciones").insert({
      profesional_id: profesionalId,
      empresa_id: emp.id,
      rol_profesional: rolProf,
      activa: true,
    });

    // Si es empleado → actualizar empresa_id en tabla empleados
    if (rolProf === "empleado") {
      const { data: authData } = await sb.from("usuarios")
        .select("auth_id").eq("id", profesionalId).single();
      if (authData?.auth_id) {
        await sb.from("empleados")
          .update({ empresa_id: emp.id })
          .eq("auth_id", authData.auth_id);
      }
    }

    if (mostrarMsg) toast("✅ Vinculado con " + prod.nombre + " (cód. " + codigoProd + ")");
    return true;
  };

  // ── AGREGAR VINCULACIÓN DESDE EDICIÓN ──
  const agregarVinc = async () => {
    if (!editando || !codVincular.trim()) { toast("❌ Ingresá el código del productor"); return; }
    setVincLoading(true);
    const ok = await vincularPorCodigo(editando.id, editando.rol, codVincular.trim(), true);
    if (ok) {
      setCodVincular("");
      await cargarTodo();
      await cargarVincsDeUsuario(editando.id);
    }
    setVincLoading(false);
  };

  // ── TOGGLE VINCULACIÓN ──
  const toggleVinc = async (id: string, activa: boolean) => {
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: !activa }).eq("id", id);
    await cargarTodo();
    if (editando) await cargarVincsDeUsuario(editando.id);
    toast(activa ? "✅ Vinculación pausada" : "✅ Vinculación activada");
  };

  // ── ELIMINAR VINCULACIÓN ──
  const eliminarVinc = async (id: string) => {
    if (!confirm("¿Eliminar esta vinculación?")) return;
    const sb = await getSB();
    await sb.from("vinculaciones").delete().eq("id", id);
    await cargarTodo();
    if (editando) await cargarVincsDeUsuario(editando.id);
    toast("✅ Vinculación eliminada");
  };

  // ── BLOQUEAR / DESBLOQUEAR USUARIO ──
  const toggleActivo = async (u: Usuario) => {
    if (u.rol === "admin") { toast("❌ No podés desactivar al administrador"); return; }
    const sb = await getSB();
    await sb.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    await cargarTodo();
    toast(u.activo ? `🔒 ${u.nombre} bloqueado` : `🔓 ${u.nombre} desbloqueado`);
  };

  // ── GUARDAR DATOS USUARIO ──
  const guardarDatos = async () => {
    if (!editando) return;
    setSaving(true);
    const sb = await getSB();
    await sb.from("usuarios").update({
      nombre:       formEdit.nombre?.trim() || editando.nombre,
      telefono:     formEdit.telefono ?? "",
      matricula:    formEdit.matricula ?? "",
      especialidad: formEdit.especialidad ?? "",
      cuit:         formEdit.cuit ?? "",
      localidad:    formEdit.localidad ?? "",
      provincia:    formEdit.provincia ?? "",
    }).eq("id", editando.id);
    // Actualizar nombre local para que se refleje
    setEditando({ ...editando, nombre: formEdit.nombre?.trim() || editando.nombre });
    await cargarTodo();
    toast("✅ Datos guardados");
    setSaving(false);
  };

  // ── ABRIR EDICIÓN ──
  const abrirEditar = async (u: Usuario) => {
    setEditando(u);
    setFormEdit({
      nombre: u.nombre, telefono: u.telefono ?? "",
      matricula: u.matricula ?? "", especialidad: u.especialidad ?? "",
      cuit: u.cuit ?? "", localidad: u.localidad ?? "", provincia: u.provincia ?? "",
    });
    setCodVincular("");
    setVincsEdit([]);
    await cargarVincsDeUsuario(u.id);
  };

  // ── FILTRO BÚSQUEDA ──
  const usuariosFiltrados = usuarios.filter(u =>
    !busqueda ||
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    String(u.codigo).includes(busqueda)
  );

  // ── ESTILOS ──
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    body,*{font-family:'DM Sans','Segoe UI',system-ui,sans-serif;}
    .inp{background:rgba(255,255,255,0.78);border:1.5px solid rgba(180,210,240,0.60);border-radius:11px;
      box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
    .inp::placeholder{color:rgba(80,120,160,0.50);}
    .inp:focus{background:rgba(255,255,255,0.98);border-color:rgba(25,118,210,0.45);
      outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.12);}
    .inp option{background:white;color:#1a2a4a;}
    .sel{background:rgba(255,255,255,0.78);border:1.5px solid rgba(180,210,240,0.60);
      border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}
    .card{background-image:url('/FON.png');background-size:cover;background-position:center;
      border:1.5px solid rgba(255,255,255,0.92);border-top:2px solid white;border-radius:20px;
      box-shadow:0 8px 32px rgba(20,80,160,0.16);position:relative;overflow:hidden;}
    .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);
      pointer-events:none;z-index:0;}
    .card>*{position:relative;z-index:2;}
    .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;
      border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);
      border-radius:12px;color:white;font-weight:800;cursor:pointer;
      text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 4px 16px rgba(25,118,210,0.38);
      transition:all 0.18s;}
    .bbtn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08);}
    .bbtn:disabled{opacity:0.6;cursor:not-allowed;}
    .abtn{background:rgba(255,255,255,0.72);border:1.5px solid rgba(255,255,255,0.92);
      border-radius:12px;color:#1e3a5f;font-weight:700;cursor:pointer;transition:all 0.18s;}
    .abtn:hover{background:rgba(255,255,255,0.96);}
    .tab{padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;
      transition:all 0.18s;white-space:nowrap;background:rgba(255,255,255,0.58);
      border:1.5px solid rgba(255,255,255,0.92);color:#1e3a5f;}
    .tab.on{background-image:url('/AZUL.png');background-size:cover;
      border:1.5px solid rgba(100,180,255,0.45);color:white;font-weight:800;
      box-shadow:0 5px 18px rgba(25,118,210,0.38);text-shadow:0 1px 3px rgba(0,40,120,0.30);}
    .topbar{background-image:url('/FON.png');background-size:cover;background-position:top;
      border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);
      position:relative;}
    .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
    .topbar>*{position:relative;z-index:1;}
    .kpi{background-image:url('/FON.png');background-size:cover;border:1.5px solid rgba(255,255,255,0.92);
      border-radius:15px;box-shadow:0 4px 16px rgba(20,80,160,0.12);padding:12px 10px;
      text-align:center;position:relative;overflow:hidden;}
    .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);pointer-events:none;}
    .kpi>*{position:relative;}
    .row:hover{background:rgba(255,255,255,0.82)!important;}
    .fade-in{animation:fadeIn 0.22s ease;}
    ::-webkit-scrollbar{width:3px;height:3px}
    ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.22);border-radius:3px}
  `;

  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando panel admin...</span>
    </div>
  );

  // ══════════════════════════════════════
  // VISTA EDITAR USUARIO
  // ══════════════════════════════════════
  if (editando) {
    const cfg = ROLES[editando.rol] ?? ROLES["servicios"];
    const esVinculable = VINCULABLES.includes(editando.rol);

    return (
      <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center"}}>
        <style>{CSS}</style>
        <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px"}}>
            <button onClick={()=>{setEditando(null);setVincsEdit([]);setCodVincular("");}}
              style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
              ← Volver
            </button>
            <div style={{flex:1}}/>
            <span style={{fontSize:12,fontWeight:800,color:"white",backgroundImage:"url('/AZUL.png')",
              backgroundSize:"cover",padding:"4px 14px",borderRadius:8}}>👑 Admin</span>
          </div>
        </div>

        <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 80px"}}>
          {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,
            fontSize:13,fontWeight:600,
            color:msg.startsWith("✅")?"#16a34a":msg.startsWith("⚠️")?"#d97706":"#dc2626",
            background:msg.startsWith("✅")?"rgba(220,252,231,0.92)":msg.startsWith("⚠️")?"rgba(254,243,199,0.92)":"rgba(254,226,226,0.92)",
            border:"1px solid rgba(0,0,0,0.07)",display:"flex",justifyContent:"space-between"}}>
            {msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer"}}>✕</button>
          </div>}

          {/* Header */}
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:cfg.bg,
                border:`2px solid ${cfg.color}35`,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:26,flexShrink:0}}>{cfg.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:19,fontWeight:800,color:"#0d2137"}}>{editando.nombre}</div>
                <div style={{fontSize:12,fontWeight:700,color:cfg.color}}>{cfg.label} · Cód. {editando.codigo}</div>
                <div style={{fontSize:11,color:"#6b8aaa"}}>{editando.email}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,
                  background:editando.activo?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",
                  color:editando.activo?"#16a34a":"#dc2626"}}>
                  {editando.activo?"✓ Activo":"✗ Bloqueado"}
                </span>
                {editando.rol!=="admin"&&(
                  <button onClick={()=>toggleActivo(editando)}
                    style={{fontSize:11,padding:"4px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,
                      background:editando.activo?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.10)",
                      border:`1px solid ${editando.activo?"rgba(220,38,38,0.25)":"rgba(22,163,74,0.25)"}`,
                      color:editando.activo?"#dc2626":"#16a34a"}}>
                    {editando.activo?"🔒 Bloquear":"🔓 Desbloquear"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Datos */}
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#0d2137",textTransform:"uppercase",
              letterSpacing:0.8,marginBottom:14}}>📋 Datos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[
                ["nombre","Nombre completo"],["telefono","Teléfono"],["cuit","CUIT"],
                ["localidad","Localidad"],["provincia","Provincia"],
                ["matricula","Matrícula / N° Prof."],["especialidad","Especialidad"],
              ].map(([k,l])=>(
                <div key={k}>
                  <label className={lCls}>{l}</label>
                  <input type="text" value={formEdit[k]??""} onChange={e=>setFormEdit({...formEdit,[k]:e.target.value})}
                    className={iCls} style={{width:"100%",padding:"9px 13px"}}/>
                </div>
              ))}
            </div>
            <button onClick={guardarDatos} disabled={saving} className="bbtn"
              style={{fontSize:13,padding:"10px 22px"}}>
              {saving?"Guardando...":"✓ Guardar datos"}
            </button>
          </div>

          {/* Vinculaciones */}
          {esVinculable&&(
            <div className="card" style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1565c0",textTransform:"uppercase",
                letterSpacing:0.8,marginBottom:6}}>🔗 Productores vinculados</div>
              <p style={{fontSize:12,color:"#6b8aaa",marginBottom:16}}>
                Un {cfg.label.toLowerCase()} puede vincularse a <strong>varios productores</strong>.
                Escribí el código (ej: 10001) y presioná Enter o el botón.
              </p>

              {/* Input vincular */}
              <div style={{display:"flex",gap:8,marginBottom:vincsEdit.length>0?16:0}}>
                <div style={{flex:1}}>
                  <label className={lCls}>Código del productor</label>
                  <input
                    type="text" value={codVincular}
                    onChange={e=>setCodVincular(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter") agregarVinc(); }}
                    className={iCls}
                    style={{width:"100%",padding:"11px 14px",fontSize:15,fontWeight:700,letterSpacing:1}}
                    placeholder="10001"
                    disabled={vincLoading}
                  />
                </div>
                <button onClick={agregarVinc} disabled={vincLoading||!codVincular.trim()}
                  className="bbtn" style={{fontSize:13,padding:"0 20px",alignSelf:"flex-end",height:44}}>
                  {vincLoading?"...":"+ Vincular"}
                </button>
              </div>

              {/* Lista vinculaciones */}
              {vincsEdit.length===0?(
                <div style={{textAlign:"center",padding:"24px 0",color:"#6b8aaa",fontSize:13}}>
                  Sin productores vinculados todavía
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {vincsEdit.map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.68)",
                      border:"1px solid rgba(180,210,240,0.45)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:22}}>👨‍🌾</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:800,color:"#16a34a"}}>{v.productor_nombre}</div>
                          <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>Código: {v.productor_codigo}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,padding:"2px 9px",borderRadius:20,fontWeight:700,
                          background:v.activa?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",
                          color:v.activa?"#16a34a":"#dc2626"}}>
                          {v.activa?"Activa":"Pausada"}
                        </span>
                        <button onClick={()=>toggleVinc(v.id,v.activa)}
                          style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>
                          {v.activa?"Pausar":"Activar"}
                        </button>
                        <button onClick={()=>eliminarVinc(v.id)}
                          style={{fontSize:11,color:"#dc2626",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>
                          ✕ Quitar
                        </button>
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

  // ══════════════════════════════════════
  // PANEL PRINCIPAL
  // ══════════════════════════════════════
  return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{CSS}</style>

      {/* TOPBAR */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",
                  borderRadius:6,padding:"2px 9px",color:"white",letterSpacing:0.8}}>ADMIN</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",fontWeight:600}}>Panel de Administración</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",
              backgroundSize:"cover",border:"2px solid rgba(255,255,255,0.90)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>👑</div>
            <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}}
              style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>
              Salir ⎋
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,padding:"0 16px 10px"}}>
          {[{k:"usuarios",l:"👥 Usuarios"},{k:"vinculaciones",l:"🔗 Vinculaciones"}].map(t=>(
            <button key={t.k} onClick={()=>{setTab(t.k as any);setShowForm(false);}}
              className={`tab${tab===t.k?" on":""}`}>{t.l}
              <span style={{opacity:0.6,fontSize:11,marginLeft:5}}>
                ({t.k==="usuarios"?usuarios.length:vinculaciones.length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 16px 80px"}}>

        {/* Toast */}
        {msg&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,
          fontSize:13,fontWeight:600,
          color:msg.startsWith("✅")?"#16a34a":msg.startsWith("⚠️")?"#d97706":"#dc2626",
          background:msg.startsWith("✅")?"rgba(220,252,231,0.92)":msg.startsWith("⚠️")?"rgba(254,243,199,0.92)":"rgba(254,226,226,0.92)",
          border:"1px solid rgba(0,0,0,0.07)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* KPIs por rol */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8,marginBottom:16}}>
          {Object.entries(ROLES).map(([r,cfg])=>{
            const count = usuarios.filter(u=>u.rol===r).length;
            return(
              <div key={r} className="kpi">
                <div style={{fontSize:18,marginBottom:3}}>{cfg.icon}</div>
                <div style={{fontSize:20,fontWeight:800,color:cfg.color}}>{count}</div>
                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:600,marginTop:1,lineHeight:1.2}}>{cfg.label}</div>
              </div>
            );
          })}
        </div>

        {/* ══ USUARIOS ══ */}
        {tab==="usuarios"&&(
          <div className="fade-in">
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                className="inp" style={{flex:1,minWidth:200,padding:"10px 14px",fontSize:13}}
                placeholder="🔍 Buscar por nombre, email o código..."/>
              <button onClick={()=>{setShowForm(!showForm);setForm({rol:"productor"});}} className="bbtn"
                style={{fontSize:13,padding:"10px 20px"}}>
                + Crear Usuario
              </button>
            </div>

            {/* Form crear */}
            {showForm&&(
              <div className="card fade-in" style={{padding:18,marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:800,color:"#0d2137",marginBottom:14}}>+ Nuevo Usuario</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <div>
                    <label className={lCls}>Rol</label>
                    <select value={form.rol??"productor"} onChange={e=>setForm({...form,rol:e.target.value})} className="sel">
                      {Object.entries(ROLES).filter(([r])=>r!=="admin").map(([r,cfg])=>(
                        <option key={r} value={r}>{cfg.icon} {cfg.label} (cód. {generarCodigo(r)})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    {form.rol&&(
                      <div style={{padding:"8px 14px",borderRadius:10,fontWeight:800,fontSize:14,
                        background:ROLES[form.rol]?.bg,color:ROLES[form.rol]?.color}}>
                        {ROLES[form.rol]?.icon} Código asignado: <strong>{generarCodigo(form.rol)}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lCls}>Nombre completo</label>
                    <input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"9px 13px"}} placeholder="Apellido y nombre"/>
                  </div>
                  <div>
                    <label className={lCls}>Email</label>
                    <input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"9px 13px"}} placeholder="email@ejemplo.com"/>
                  </div>
                  <div>
                    <label className={lCls}>Contraseña inicial</label>
                    <input type="text" value={form.password??""} onChange={e=>setForm({...form,password:e.target.value})}
                      className={iCls} style={{width:"100%",padding:"9px 13px"}} placeholder="Clave temporal"/>
                  </div>
                  {form.rol==="productor"&&(
                    <div>
                      <label className={lCls}>Nombre empresa / campo</label>
                      <input type="text" value={form.nombre_empresa??""} onChange={e=>setForm({...form,nombre_empresa:e.target.value})}
                        className={iCls} style={{width:"100%",padding:"9px 13px"}} placeholder="Establecimiento Don Juan"/>
                    </div>
                  )}
                  {VINCULABLES.includes(form.rol||"")&&(
                    <div style={{gridColumn:"span 2"}}>
                      <label className={lCls}>
                        Código del productor al que pertenece{" "}
                        <span style={{color:"#6b8aaa",fontWeight:400,textTransform:"none",letterSpacing:0}}>(opcional — se vincula automáticamente)</span>
                      </label>
                      <input type="text" value={form.cod_productor??""} onChange={e=>setForm({...form,cod_productor:e.target.value})}
                        className={iCls} style={{width:"100%",padding:"9px 13px"}} placeholder="10001"/>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={crearUsuario} disabled={saving} className="bbtn" style={{fontSize:13,padding:"10px 22px"}}>
                    {saving?"Creando...":"✓ Crear Usuario"}
                  </button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{fontSize:13,padding:"10px 18px"}}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Tabla usuarios */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Código","Nombre","Email","Rol","Estado","Vinculaciones","Acciones"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:10,
                        color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map(u=>{
                    const cfg = ROLES[u.rol] ?? ROLES["servicios"];
                    const vincsU = vinculaciones.filter(v=>v.profesional_id===u.id);
                    return(
                      <tr key={u.id} className="row" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",
                        transition:"background 0.15s",background:!u.activo?"rgba(220,38,38,0.03)":"transparent"}}>
                        <td style={{padding:"10px 14px",fontSize:14,fontWeight:800,color:"#1565c0"}}>{u.codigo}</td>
                        <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:"#0d2137"}}>{u.nombre}</td>
                        <td style={{padding:"10px 14px",fontSize:11,color:"#6b8aaa"}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:7,fontWeight:700,
                            background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}25`}}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:10,padding:"2px 9px",borderRadius:20,fontWeight:700,
                            background:u.activo?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.10)",
                            color:u.activo?"#16a34a":"#dc2626"}}>
                            {u.activo?"✓ Activo":"✗ Bloqueado"}
                          </span>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          {VINCULABLES.includes(u.rol)&&(
                            vincsU.length>0?(
                              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                                {vincsU.slice(0,4).map(v=>(
                                  <span key={v.id} style={{fontSize:9,padding:"1px 7px",borderRadius:20,
                                    fontWeight:700,background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",
                                    color:v.activa?"#16a34a":"#dc2626"}}>
                                    {v.productor_codigo}
                                  </span>
                                ))}
                                {vincsU.length>4&&<span style={{fontSize:9,color:"#6b8aaa",fontWeight:600}}>+{vincsU.length-4}</span>}
                              </div>
                            ):(
                              <span style={{fontSize:11,color:"#aab8c8",fontWeight:600}}>Sin vincular</span>
                            )
                          )}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          {u.rol!=="admin"&&(
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <button onClick={()=>toggleActivo(u)}
                                style={{fontSize:11,padding:"3px 10px",borderRadius:7,cursor:"pointer",fontWeight:700,
                                  background:u.activo?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.10)",
                                  border:`1px solid ${u.activo?"rgba(220,38,38,0.25)":"rgba(22,163,74,0.25)"}`,
                                  color:u.activo?"#dc2626":"#16a34a"}}>
                                {u.activo?"🔒 Bloquear":"🔓 Activar"}
                              </button>
                              <button onClick={()=>abrirEditar(u)}
                                style={{fontSize:11,padding:"3px 10px",borderRadius:7,cursor:"pointer",fontWeight:700,
                                  background:"rgba(25,118,210,0.10)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0"}}>
                                ✏️ Editar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usuariosFiltrados.length===0&&(
                <div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>
                  Sin usuarios{busqueda?" que coincidan":""}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ VINCULACIONES ══ */}
        {tab==="vinculaciones"&&(
          <div className="fade-in">
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,
              background:"rgba(25,118,210,0.06)",border:"1px solid rgba(25,118,210,0.18)",
              fontSize:12,color:"#1565c0",fontWeight:600}}>
              💡 Para vincular → <strong>Usuarios → Editar → ingresar código del productor</strong>
            </div>

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>
                  Todas las vinculaciones ({vinculaciones.length})
                </span>
              </div>
              {vinculaciones.length===0?(
                <div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>
                  Sin vinculaciones registradas
                </div>
              ):(
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                      {["Profesional","Cód.","Rol","Productor","Cód.","Estado",""].map((h,i)=>(
                        <th key={i} style={{textAlign:"left",padding:"10px 14px",fontSize:10,
                          color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vinculaciones.map(v=>{
                      const cfg = ROLES[v.profesional_rol??v.rol_profesional] ?? ROLES["servicios"];
                      return(
                        <tr key={v.id} className="row" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                          <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:cfg.color}}>
                            {cfg.icon} {v.profesional_nombre}
                          </td>
                          <td style={{padding:"10px 14px",fontSize:12,color:"#6b8aaa",fontWeight:600}}>
                            {v.profesional_codigo}
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{fontSize:10,padding:"2px 8px",borderRadius:7,fontWeight:700,
                              background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                          </td>
                          <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:"#16a34a"}}>
                            👨‍🌾 {v.productor_nombre}
                          </td>
                          <td style={{padding:"10px 14px",fontSize:12,color:"#6b8aaa",fontWeight:600}}>
                            {v.productor_codigo}
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{fontSize:10,padding:"2px 9px",borderRadius:20,fontWeight:700,
                              background:v.activa?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",
                              color:v.activa?"#16a34a":"#dc2626"}}>
                              {v.activa?"Activa":"Pausada"}
                            </span>
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <button onClick={()=>toggleVinc(v.id,v.activa)}
                              style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",
                                cursor:"pointer",fontWeight:600}}>
                              {v.activa?"Pausar":"Activar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

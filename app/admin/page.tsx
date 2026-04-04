"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Usuario = {
  id: string; nombre: string; email: string;
  rol: string; codigo: string; activo: boolean;
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

const ROL_PREFIJOS: Record<string, { prefix: number; label: string; color: string; icon: string }> = {
  admin:       { prefix: 0,     label: "Admin",       color: "#F87171", icon: "👑" },
  productor:   { prefix: 10000, label: "Productor",   color: "#4ADE80", icon: "👨‍🌾" },
  ingeniero:   { prefix: 20000, label: "Ingeniero",   color: "#60A5FA", icon: "👨‍💼" },
  veterinario: { prefix: 30000, label: "Veterinario", color: "#A78BFA", icon: "🩺" },
  empleado:    { prefix: 40000, label: "Empleado",    color: "#FB923C", icon: "👷" },
  aplicador:   { prefix: 50000, label: "Aplicador",   color: "#C9A227", icon: "💧" },
  sembrador:   { prefix: 60000, label: "Sembrador",   color: "#4ADE80", icon: "🌱" },
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

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

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

    // Empresas con datos completos del propietario
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

    // Vinculaciones
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
    if (!form.nombre?.trim() || !form.email?.trim() || !form.password?.trim()) { setMsg("❌ Completá nombre, email y contraseña"); return; }
    setMsg("Creando usuario...");
    try {
      const sb = await getSB();
      const codigo = generarCodigo(form.rol || "productor");
      const { data, error } = await sb.auth.signUp({ email: form.email, password: form.password, options: { data: { nombre: form.nombre } } });
      if (error) { setMsg("❌ " + error.message); return; }
      if (!data.user) { setMsg("❌ Error al crear usuario"); return; }
      await sb.from("usuarios").insert({ auth_id: data.user.id, nombre: form.nombre, email: form.email, rol: form.rol || "productor", codigo, activo: true });
      if (form.rol === "productor") {
        const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
        if (nuevoUser) {
          await sb.from("empresas").insert({ nombre: form.nombre_empresa || "Empresa de " + form.nombre, propietario_id: nuevoUser.id });
        }
      }
      setMsg("✅ Usuario creado — Código: " + codigo);
      await fetchAll(); setShowForm(false); setForm({});
    } catch { setMsg("❌ Error inesperado"); }
  };

  const toggleUsuario = async (id: string, activo: boolean, esAdmin: boolean) => {
    if (esAdmin) { setMsg("❌ No se puede desactivar al administrador"); return; }
    const sb = await getSB();
    await sb.from("usuarios").update({ activo: !activo }).eq("id", id);
    await fetchAll();
  };

  const crearVinculacion = async () => {
    if (!form.ingeniero_id || !form.empresa_id) { setMsg("❌ Seleccioná ingeniero y productor"); return; }
    const sb = await getSB();
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", form.ingeniero_id).eq("empresa_id", form.empresa_id).single();
    if (existe) { setMsg("❌ Ya existe esa vinculación"); return; }
    await sb.from("vinculaciones").insert({ ingeniero_id: form.ingeniero_id, empresa_id: form.empresa_id, activa: true, honorario_tipo: form.honorario_tipo ?? "mensual", honorario_monto: Number(form.honorario_monto ?? 0) });
    setMsg("✅ Vinculación creada");
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
      detalle.push({
        id: v.id, profesional_nombre: u?.nombre ?? "—",
        rol_profesional: u?.rol ?? "ingeniero",
        empresa_id: v.empresa_id, honorario_tipo: v.honorario_tipo ?? "mensual",
        honorario_monto: v.honorario_monto ?? 0, activa: v.activa,
      });
    }
    setVinculacionesEmpresa(detalle);
  };

  const vincularProfesionalAEmpresa = async () => {
    if (!empresaActiva || !formVinc.usuario_id) { setMsg("❌ Selecciona un profesional"); return; }
    const sb = await getSB();
    const [usuarioId, rol] = formVinc.usuario_id.split("||");
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", usuarioId).eq("empresa_id", empresaActiva.id).single();
    if (existe) { setMsg("❌ Ya esta vinculado"); return; }
    await sb.from("vinculaciones").insert({
      ingeniero_id: usuarioId, empresa_id: empresaActiva.id, activa: true,
      honorario_tipo: formVinc.honorario_tipo ?? "mensual",
      honorario_monto: Number(formVinc.honorario_monto ?? 0),
    });
    setMsg("✅ VINCULADO CORRECTAMENTE");
    setFormVinc({}); setShowVincLocal(false);
    await fetchVinculacionesEmpresa(empresaActiva.id);
    await fetchAll();
  };

  const guardarUsuarioProfesional = async () => {
    if (!usuarioEditar) return;
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
    // Vincular a productor por codigo si se ingreso
    if (form.codigo_vincular?.trim()) {
      const { data: prod } = await sb.from("usuarios").select("id,nombre").eq("codigo", form.codigo_vincular.trim()).single();
      if (prod) {
        let { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", prod.id).single();
        if (!emp) {
          const { data: newEmp } = await sb.from("empresas").insert({ nombre: "Empresa de " + prod.nombre, propietario_id: prod.id }).select().single();
          emp = newEmp;
        }
        if (emp) {
          const { data: vincExiste } = await sb.from("vinculaciones").select("id").eq("profesional_id", usuarioEditar.id).eq("empresa_id", emp.id).single();
          if (!vincExiste) {
            await sb.from("vinculaciones").insert({ profesional_id: usuarioEditar.id, empresa_id: emp.id, activa: true, rol_profesional: usuarioEditar.rol });
          }
          // Si es ingeniero, tambien crear en ing_productores
          if (usuarioEditar.rol === "ingeniero") {
            const { data: ingProd } = await sb.from("ing_productores").select("id").eq("ingeniero_id", usuarioEditar.id).eq("empresa_id", emp.id).single();
            if (!ingProd) {
              await sb.from("ing_productores").insert({ ingeniero_id: usuarioEditar.id, nombre: prod.nombre, empresa_id: emp.id, tiene_cuenta: true, activo: true });
            }
          }
          setMsg("✅ DATOS GUARDADOS Y VINCULADO CON " + prod.nombre.toUpperCase());
        }
      } else {
        setMsg("⚠️ DATOS GUARDADOS — CODIGO DE PRODUCTOR NO ENCONTRADO");
      }
    } else {
      setMsg("✅ DATOS GUARDADOS");
    }
    await fetchAll();
    setUsuarioEditar(null); setForm({});
  };

  const guardarEmpresaDetalle = async () => {
    if (!empresaActiva) return;
    const sb = await getSB();
    await sb.from("empresas").update({
      cuit: form.cuit ?? "", direccion: form.direccion ?? "",
      localidad: form.localidad ?? "", provincia: form.provincia ?? "",
      telefono: form.telefono ?? "", email: form.email_empresa ?? "",
      razon_social: form.razon_social ?? "", condicion_iva: form.condicion_iva ?? "",
      ingresos_brutos: form.ingresos_brutos ?? "", inicio_actividades: form.inicio_actividades ?? "",
      socios: form.socios ?? "", empleados: form.empleados ?? "",
      observaciones: form.observaciones ?? "",
    }).eq("id", empresaActiva.id);
    setMsg("✅ DATOS GUARDADOS");
    await fetchAll();
    // Actualizar empresa activa
    const sb2 = await getSB();
    const { data: updated } = await sb2.from("empresas").select("*").eq("id", empresaActiva.id).single();
    if (updated) {
      const prop = usuarios.find(u => u.id === updated.propietario_id);
      setEmpresaActiva({ ...empresaActiva, ...updated, propietario_nombre: prop?.nombre ?? "—", propietario_email: prop?.email ?? "—" });
    }
  };

  const iCls = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const empresasDeProductores = empresas.filter(e => {
    const prop = usuarios.find(u => u.id === e.propietario_id);
    return prop?.rol === "productor";
  });

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">▶ Cargando Panel Admin...</div>;

  // Vista editar profesional (ing, vet, aplicador, etc)
  if (usuarioEditar) {
    const config = ROL_PREFIJOS[usuarioEditar.rol] ?? { label: usuarioEditar.rol, color: "#60A5FA", icon: "👤" };
    // Vinculaciones actuales de este profesional
    const vincsProf = vinculaciones.filter(v => v.ingeniero_nombre === usuarioEditar.nombre);
    return (
      <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
        <div className="absolute inset-0 z-0"><Image src="/login-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/92"/></div>
        <div className="relative z-10 bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-4">
          <button onClick={()=>setUsuarioEditar(null)} className="text-[#4B5563] hover:text-[#00FF80] font-mono text-sm">← VOLVER</button>
          <div className="flex-1"/>
          <span className="text-xs text-[#F87171] font-mono border border-[#F87171]/30 px-3 py-1 rounded-lg">👑 ADMINISTRADOR</span>
        </div>
        <div className="relative z-10 max-w-4xl mx-auto p-6">
          {msg && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msg.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msg}<button onClick={()=>setMsg("")}>✕</button></div>}

          {/* Header */}
          <div className="bg-[#0a1628]/80 border rounded-xl p-5 mb-5" style={{borderColor:config.color+"30"}}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{background:config.color+"15",border:"1px solid "+config.color+"50"}}>{config.icon}</div>
              <div>
                <div className="text-xl font-bold text-[#E5E7EB] font-mono uppercase">{usuarioEditar.nombre}</div>
                <div className="text-xs font-mono" style={{color:config.color}}>{config.label} · COD {usuarioEditar.codigo} · {usuarioEditar.email}</div>
              </div>
            </div>
          </div>

          {/* Datos profesionales */}
          <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 mb-5">
            <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">📋 DATOS PROFESIONALES</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className={lCls}>NOMBRE</label><input type="text" value={form.nombre??usuarioEditar.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>TELEFONO</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
              <div><label className={lCls}>MATRICULA</label><input type="text" value={form.matricula??""} onChange={e=>setForm({...form,matricula:e.target.value})} className={iCls} placeholder="MAT 1234"/></div>
              <div><label className={lCls}>ESPECIALIDAD</label><input type="text" value={form.especialidad??""} onChange={e=>setForm({...form,especialidad:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>CUIT</label><input type="text" value={form.cuit??""} onChange={e=>setForm({...form,cuit:e.target.value})} className={iCls} placeholder="20-12345678-9"/></div>
              <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>PROVINCIA</label><input type="text" value={form.provincia??""} onChange={e=>setForm({...form,provincia:e.target.value})} className={iCls}/></div>
            </div>
          </div>

          {/* Vincular a productor por codigo */}
          <div className="bg-[#0a1628]/80 border border-[#60A5FA]/20 rounded-xl p-5 mb-5">
            <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-2">🔗 VINCULAR A PRODUCTOR</h3>
            <p className="text-xs text-[#4B5563] font-mono mb-3">Ingresa el codigo del productor para vincularlo automaticamente (ej: 10001)</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1"><label className={lCls}>CODIGO DEL PRODUCTOR</label><input type="text" value={form.codigo_vincular??""} onChange={e=>setForm({...form,codigo_vincular:e.target.value})} className={iCls} placeholder="10001"/></div>
            </div>
            {vincsProf.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-[#4B5563] font-mono mb-2">VINCULACIONES ACTUALES:</div>
                <div className="flex flex-wrap gap-2">
                  {vincsProf.map(v=>(
                    <div key={v.id} className="flex items-center gap-2 px-3 py-2 bg-[#020810]/60 border border-[#60A5FA]/20 rounded-lg">
                      <span className="text-[#4ADE80] text-xs font-mono font-bold">👨‍🌾 {v.propietario_nombre}</span>
                      <span className={"text-xs px-1.5 py-0.5 rounded font-mono "+(v.activa?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{v.activa?"Activa":"Inactiva"}</span>
                      <button onClick={()=>toggleVinculacion(v.id,v.activa)} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">{v.activa?"Desact.":"Activar"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={guardarUsuarioProfesional} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ GUARDAR{form.codigo_vincular?" Y VINCULAR":""}</button>
            <button onClick={()=>{setUsuarioEditar(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
          </div>
        </div>
      </div>
    );
  }

  // Vista detalle empresa/productor
  if (empresaActiva) {
    return (
      <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
        <div className="absolute inset-0 z-0"><Image src="/login-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/92"/></div>
        <div className="relative z-10 bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-4">
          <button onClick={()=>setEmpresaActiva(null)} className="text-[#4B5563] hover:text-[#00FF80] font-mono text-sm">← VOLVER</button>
          <div className="flex-1"/>
          <span className="text-xs text-[#F87171] font-mono border border-[#F87171]/30 px-3 py-1 rounded-lg">👑 ADMINISTRADOR</span>
        </div>
        <div className="relative z-10 max-w-4xl mx-auto p-6">
          {msg && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msg.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msg}<button onClick={()=>setMsg("")}>✕</button></div>}

          {/* Header productor */}
          <div className="bg-[#0a1628]/80 border border-[#4ADE80]/20 rounded-xl p-5 mb-5">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/30 flex items-center justify-center text-2xl">👨‍🌾</div>
              <div>
                <div className="text-xl font-bold text-[#E5E7EB] font-mono uppercase">{empresaActiva.propietario_nombre}</div>
                <div className="text-xs text-[#4ADE80] font-mono">CÓDIGO: {empresaActiva.propietario_codigo} · {empresaActiva.propietario_email}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xs text-[#4B5563] font-mono">EMPRESA</div>
                <div className="text-sm font-bold text-[#C9A227] font-mono uppercase">{empresaActiva.nombre}</div>
              </div>
            </div>
          </div>

          {/* Datos completos */}
          <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5">
            <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-5">📋 DATOS COMPLETOS DEL PRODUCTOR</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div><label className={lCls}>CUIT</label><input type="text" value={form.cuit??empresaActiva.cuit} onChange={e=>setForm({...form,cuit:e.target.value})} className={iCls} placeholder="20-12345678-9"/></div>
              <div><label className={lCls}>RAZÓN SOCIAL</label><input type="text" value={form.razon_social??empresaActiva.razon_social} onChange={e=>setForm({...form,razon_social:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>CONDICIÓN IVA</label>
                <select value={form.condicion_iva??empresaActiva.condicion_iva} onChange={e=>setForm({...form,condicion_iva:e.target.value})} className={iCls}>
                  <option value="">—</option>
                  <option value="Responsable Inscripto">Responsable Inscripto</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                  <option value="No Responsable">No Responsable</option>
                </select>
              </div>
              <div><label className={lCls}>INGRESOS BRUTOS</label><input type="text" value={form.ingresos_brutos??empresaActiva.ingresos_brutos} onChange={e=>setForm({...form,ingresos_brutos:e.target.value})} className={iCls} placeholder="Nro. IIBB"/></div>
              <div><label className={lCls}>INICIO ACTIVIDADES</label><input type="date" value={form.inicio_actividades??empresaActiva.inicio_actividades} onChange={e=>setForm({...form,inicio_actividades:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>TELÉFONO</label><input type="text" value={form.telefono??empresaActiva.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
              <div><label className={lCls}>EMAIL EMPRESA</label><input type="email" value={form.email_empresa??empresaActiva.email_empresa} onChange={e=>setForm({...form,email_empresa:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>DIRECCIÓN</label><input type="text" value={form.direccion??empresaActiva.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??empresaActiva.localidad} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
              <div><label className={lCls}>PROVINCIA</label><input type="text" value={form.provincia??empresaActiva.provincia} onChange={e=>setForm({...form,provincia:e.target.value})} className={iCls} placeholder="Santa Fe"/></div>
            </div>
            <div className="border-t border-[#00FF80]/10 pt-4 mt-2">
              <h4 className="text-xs text-[#C9A227] font-mono font-bold mb-3 uppercase">SOCIOS Y EMPLEADOS</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={lCls}>SOCIOS <span className="normal-case text-[#4B5563]">(nombre, DNI, %)</span></label>
                  <textarea value={form.socios??empresaActiva.socios} onChange={e=>setForm({...form,socios:e.target.value})} className={iCls+" h-24 resize-none"} placeholder={"Juan Perez, DNI 12345678, 50%\nMaria Lopez, DNI 87654321, 50%"}/>
                </div>
                <div><label className={lCls}>EMPLEADOS <span className="normal-case text-[#4B5563]">(nombre, rol)</span></label>
                  <textarea value={form.empleados??empresaActiva.empleados} onChange={e=>setForm({...form,empleados:e.target.value})} className={iCls+" h-24 resize-none"} placeholder={"Pedro Martinez, Encargado\nCarlos Gomez, Operario"}/>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className={lCls}>OBSERVACIONES</label>
              <textarea value={form.observaciones??empresaActiva.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls+" h-16 resize-none"} placeholder="Notas internas..."/>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardarEmpresaDetalle} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ GUARDAR DATOS</button>
              <button onClick={()=>setEmpresaActiva(null)} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
            </div>
          </div>

          {/* Vinculaciones de este productor — todos los roles */}
          <div className="bg-[#0a1628]/80 border border-[#60A5FA]/15 rounded-xl p-5 mt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#60A5FA] font-mono text-sm font-bold">🔗 PROFESIONALES VINCULADOS</h3>
              <button onClick={()=>setShowVincLocal(!showVincLocal)} className="text-xs text-[#60A5FA] border border-[#60A5FA]/30 px-3 py-1.5 rounded-lg font-mono hover:bg-[#60A5FA]/10 font-bold">
                {showVincLocal?"CANCELAR":"+ VINCULAR"}
              </button>
            </div>

            {showVincLocal && (
              <div className="bg-[#020810]/60 border border-[#60A5FA]/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-[#4B5563] font-mono mb-3">Vinculá cualquier profesional con este productor</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={lCls}>PROFESIONAL</label>
                    <select value={formVinc.usuario_id??""} onChange={e=>setFormVinc({...formVinc,usuario_id:e.target.value})} className={iCls}>
                      <option value="">Seleccionar</option>
                      {usuarios.filter(u=>u.rol!=="admin"&&u.rol!=="productor").map(u=>(
                        <option key={u.id} value={u.id+"||"+u.rol}>{ROL_PREFIJOS[u.rol]?.icon} {u.nombre} ({ROL_PREFIJOS[u.rol]?.label}) — {u.codigo}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lCls}>TIPO HONORARIO</label>
                    <select value={formVinc.honorario_tipo??"mensual"} onChange={e=>setFormVinc({...formVinc,honorario_tipo:e.target.value})} className={iCls}>
                      <option value="mensual">Mensual</option><option value="por_ha">Por HA</option>
                      <option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option><option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={lCls}>MONTO $</label><input type="number" value={formVinc.honorario_monto??""} onChange={e=>setFormVinc({...formVinc,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="flex items-end"><button onClick={vincularProfesionalAEmpresa} className="w-full py-2.5 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm font-bold hover:bg-[#60A5FA]/20">▶ VINCULAR</button></div>
                </div>
              </div>
            )}

            {vinculacionesEmpresa.length === 0 ? (
              <p className="text-xs text-[#4B5563] font-mono">Sin profesionales vinculados todavía.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {vinculacionesEmpresa.map(v=>{
                  const config = ROL_PREFIJOS[v.rol_profesional] ?? ROL_PREFIJOS["ingeniero"];
                  return(
                    <div key={v.id} className="flex items-center justify-between px-4 py-3 bg-[#020810]/60 border border-[#60A5FA]/15 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{config.icon}</span>
                        <div>
                          <div className="text-sm font-bold font-mono" style={{color:config.color}}>{v.profesional_nombre}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{config.label} · {v.honorario_tipo?.replace("_"," ")} ${Number(v.honorario_monto||0).toLocaleString("es-AR")}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={"text-xs px-2 py-0.5 rounded font-mono "+(v.activa?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{v.activa?"Activa":"Inactiva"}</span>
                        <button onClick={()=>toggleVinculacion(v.id,v.activa)} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">{v.activa?"Desact.":"Activar"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .tab-a{border-color:#00FF80!important;color:#00FF80!important;background:rgba(0,255,128,0.08)!important}
        .user-row:hover{background:rgba(0,255,128,0.03)}
      `}</style>
      <div className="absolute inset-0 z-0"><Image src="/login-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/90"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,1) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain"/>
        <div className="flex-1"/>
        <span className="text-xs text-[#F87171] font-mono border border-[#F87171]/30 px-3 py-1 rounded-lg">👑 ADMINISTRADOR</span>
        <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL ADMINISTRADOR</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">GESTION GLOBAL DEL SISTEMA</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          {Object.keys(ROL_PREFIJOS).map(r=>{
            const count=usuarios.filter(u=>u.rol===r).length;
            const config=ROL_PREFIJOS[r];
            return(
              <div key={r} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{config.icon}</div>
                <div className="text-xl font-bold font-mono" style={{color:config.color}}>{count}</div>
                <div className="text-xs text-[#4B5563] font-mono">{config.label}</div>
                <div className="text-xs text-[#1a3a2a] font-mono">{config.prefix > 0 ? config.prefix+"+" : "—"}</div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[{k:"usuarios",l:"👥 USUARIOS",c:usuarios.length},{k:"vinculaciones",l:"🔗 VINCULACIONES",c:vinculaciones.length}].map(t=>(
            <button key={t.k} onClick={()=>{setTab(t.k as any);setShowForm(false);setShowVincForm(false);}}
              className={"px-5 py-2 rounded-xl border border-[#00FF80]/15 text-sm font-mono transition-all "+(tab===t.k?"tab-a":"text-[#4B5563] hover:text-[#9CA3AF]")}>
              {t.l} <span className="ml-1 opacity-60">({t.c})</span>
            </button>
          ))}
        </div>

        {msg && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msg.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msg}<button onClick={()=>setMsg("")}>✕</button></div>}

        {/* ===== USUARIOS ===== */}
        {tab==="usuarios" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowForm(!showForm);setForm({rol:"productor"});setMsg("");}}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm font-bold">
                + Crear Usuario
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-[#00FF80] font-mono text-sm font-bold">+ NUEVO USUARIO</h3>
                  {form.rol && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{color:ROL_PREFIJOS[form.rol]?.color,borderColor:ROL_PREFIJOS[form.rol]?.color,background:(ROL_PREFIJOS[form.rol]?.color||"")+"15"}}>
                      Código asignado: {generarCodigo(form.rol)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={lCls}>ROL</label>
                    <select value={form.rol??"productor"} onChange={e=>setForm({...form,rol:e.target.value})} className={iCls}>
                      {Object.keys(ROL_PREFIJOS).filter(r=>r!=="admin").map(r=>(
                        <option key={r} value={r}>{ROL_PREFIJOS[r].icon} {ROL_PREFIJOS[r].label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lCls}>NOMBRE COMPLETO</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                  <div><label className={lCls}>EMAIL</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} placeholder="email@ejemplo.com"/></div>
                  <div><label className={lCls}>CONTRASEÑA INICIAL</label><input type="text" value={form.password??""} onChange={e=>setForm({...form,password:e.target.value})} className={iCls} placeholder="Clave temporal"/></div>
                  {form.rol==="productor" && (
                    <div><label className={lCls}>NOMBRE DE LA EMPRESA</label><input type="text" value={form.nombre_empresa??""} onChange={e=>setForm({...form,nombre_empresa:e.target.value})} className={iCls} placeholder="Ej: Establecimiento Don Juan"/></div>
                  )}
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={crearUsuario} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ CREAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});setMsg("");}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-[#00FF80]/10">
                  {["CÓDIGO","NOMBRE","EMAIL","ROL","ESTADO","",""].map(h=>(
                    <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {usuarios.map(u=>{
                    const config=ROL_PREFIJOS[u.rol];
                    const esAdmin = u.rol === "admin";
                    const empDeEsteUser = empresasDeProductores.find(e=>e.propietario_id===u.id);
                    return(
                      <tr key={u.id} className="user-row border-b border-[#00FF80]/5 transition-colors">
                        <td className="px-5 py-3 text-sm font-bold font-mono text-[#00FF80]">{u.codigo}</td>
                        <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono">{u.nombre}</td>
                        <td className="px-5 py-3 text-xs text-[#4B5563] font-mono">{u.email}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs px-2 py-1 rounded font-mono border" style={{color:config?.color??"#9CA3AF",borderColor:config?.color??"#9CA3AF",background:(config?.color??"#9CA3AF")+"15"}}>
                            {config?.icon} {config?.label??u.rol}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={"text-xs px-2 py-0.5 rounded font-mono "+(u.activo?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>
                            {u.activo?"Activo":"Inactivo"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {!esAdmin && (
                            <button onClick={()=>toggleUsuario(u.id,u.activo,esAdmin)} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono transition-colors">
                              {u.activo?"Desactivar":"Activar"}
                            </button>
                          )}
                          {esAdmin && <span className="text-xs text-[#4B5563] font-mono opacity-40">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex gap-2">
                            {empDeEsteUser && (
                              <button onClick={async()=>{setEmpresaActiva(empDeEsteUser);setForm({});setShowVincLocal(false);setFormVinc({});await fetchVinculacionesEmpresa(empDeEsteUser.id);}} className="text-xs text-[#C9A227] font-mono border border-[#C9A227]/30 px-2 py-1 rounded hover:bg-[#C9A227]/10">
                                📋 Datos
                              </button>
                            )}
                            {u.rol !== "admin" && u.rol !== "productor" && (
                              <button onClick={()=>{setUsuarioEditar(u);setForm({nombre:u.nombre,telefono:u.telefono??"",matricula:u.matricula??"",especialidad:u.especialidad??"",cuit:u.cuit??"",localidad:u.localidad??"",provincia:u.provincia??"",codigo_vincular:""});}} className="text-xs text-[#60A5FA] font-mono border border-[#60A5FA]/30 px-2 py-1 rounded hover:bg-[#60A5FA]/10">
                                ✏️ Editar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usuarios.length===0&&<div className="text-center py-16 text-[#4B5563] font-mono">Sin usuarios registrados</div>}
            </div>
          </div>
        )}

        {/* ===== VINCULACIONES ===== */}
        {tab==="vinculaciones" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowVincForm(!showVincForm);setForm({});setMsg("");}}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm font-bold">
                + Nueva Vinculación
              </button>
            </div>

            {showVincForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">🔗 VINCULAR INGENIERO ↔ PRODUCTOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>INGENIERO</label>
                    <select value={form.ingeniero_id??""} onChange={e=>setForm({...form,ingeniero_id:e.target.value})} className={iCls}>
                      <option value="">Seleccionar</option>
                      {ingenieros.map(i=><option key={i.id} value={i.id}>{i.nombre} ({i.codigo})</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>PRODUCTOR</label>
                    <select value={form.empresa_id??""} onChange={e=>setForm({...form,empresa_id:e.target.value})} className={iCls}>
                      <option value="">Seleccionar</option>
                      {empresasDeProductores.map(e=><option key={e.id} value={e.id}>{e.propietario_nombre} — {e.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>TIPO HONORARIO</label>
                    <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}>
                      <option value="mensual">Mensual</option><option value="por_ha">Por hectárea</option>
                      <option value="por_campana">Por campaña</option><option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={lCls}>MONTO HONORARIO</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={crearVinculacion} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ VINCULAR</button>
                  <button onClick={()=>{setShowVincForm(false);setForm({});setMsg("");}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-[#00FF80]/10">
                  {["INGENIERO","PRODUCTOR","EMPRESA","ESTADO",""].map(h=>(
                    <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vinculaciones.map(v=>(
                    <tr key={v.id} className="user-row border-b border-[#00FF80]/5 transition-colors">
                      <td className="px-5 py-3 text-sm text-[#60A5FA] font-mono">👨‍💼 {v.ingeniero_nombre}</td>
                      <td className="px-5 py-3 text-sm text-[#4ADE80] font-mono">👨‍🌾 {v.propietario_nombre}</td>
                      <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{v.empresa_nombre}</td>
                      <td className="px-5 py-3"><span className={"text-xs px-2 py-0.5 rounded font-mono "+(v.activa?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{v.activa?"Activa":"Inactiva"}</span></td>
                      <td className="px-5 py-3"><button onClick={()=>toggleVinculacion(v.id,v.activa)} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">{v.activa?"Desactivar":"Activar"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vinculaciones.length===0&&<div className="text-center py-16 text-[#4B5563] font-mono">Sin vinculaciones registradas</div>}
            </div>
          </div>
        )}
      </div>
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono">© AGROGESTION PRO · PANEL ADMINISTRADOR</p>
    </div>
  );
}

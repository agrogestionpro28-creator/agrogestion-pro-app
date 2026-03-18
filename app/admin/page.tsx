"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  codigo: string;
  activo: boolean;
};

type Vinculacion = {
  id: string;
  ingeniero_nombre: string;
  empresa_nombre: string;
  propietario_nombre: string;
  activa: boolean;
};

const ROL_PREFIJOS: Record<string, { prefix: number; label: string; color: string; icon: string }> = {
  admin:      { prefix: 0,     label: "Admin",      color: "#F87171", icon: "👑" },
  productor:  { prefix: 10000, label: "Productor",  color: "#4ADE80", icon: "👨‍🌾" },
  ingeniero:  { prefix: 20000, label: "Ingeniero",  color: "#60A5FA", icon: "👨‍💼" },
  veterinario:{ prefix: 30000, label: "Veterinario",color: "#A78BFA", icon: "🩺" },
  empleado:   { prefix: 40000, label: "Empleado",   color: "#FB923C", icon: "👷" },
  aplicador:  { prefix: 50000, label: "Aplicador",  color: "#C9A227", icon: "💧" },
  sembrador:  { prefix: 60000, label: "Sembrador",  color: "#4ADE80", icon: "🌱" },
};

export default function AdminPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"usuarios" | "vinculaciones">("usuarios");
  const [showForm, setShowForm] = useState(false);
  const [showVincForm, setShowVincForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [ingenieros, setIngenieros] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nombre: string; propietario: string }[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "admin") { window.location.href = "/login"; return; }
    await fetchAll();
    setLoading(false);
  };

  const fetchAll = async () => {
    const sb = await getSB();
    const { data: us } = await sb.from("usuarios").select("*").order("codigo");
    setUsuarios(us ?? []);
    setIngenieros(us?.filter(u => u.rol === "ingeniero") ?? []);

    // Fetch empresas con propietario
    const { data: emps } = await sb.from("empresas").select("id, nombre, propietario_id");
    if (emps) {
      const empresasConProp = emps.map(e => {
        const prop = us?.find(u => u.id === e.propietario_id);
        return { id: e.id, nombre: e.nombre, propietario: prop?.nombre ?? "—" };
      });
      setEmpresas(empresasConProp);
    }

    // Fetch vinculaciones
    const { data: vincs } = await sb.from("vinculaciones").select("id, activa, ingeniero_id, empresa_id");
    if (vincs) {
      const vincsCompletas: Vinculacion[] = vincs.map(v => {
        const ing = us?.find(u => u.id === v.ingeniero_id);
        const emp = emps?.find(e => e.id === v.empresa_id);
        const prop = us?.find(u => u.id === emp?.propietario_id);
        return {
          id: v.id,
          ingeniero_nombre: ing?.nombre ?? "—",
          empresa_nombre: emp?.nombre ?? "—",
          propietario_nombre: prop?.nombre ?? "—",
          activa: v.activa,
        };
      });
      setVinculaciones(vincsCompletas);
    }
  };

  const generarCodigo = (rol: string, usuarios: Usuario[]): string => {
    const config = ROL_PREFIJOS[rol];
    if (!config) return "99999";
    // Reservados: los números redondos (10000, 20000, etc.) son para pruebas
    const base = config.prefix;
    const reservado = base; // ej: 10000
    const usadosDelRol = usuarios
      .filter(u => u.rol === rol)
      .map(u => Number(u.codigo))
      .filter(c => c > reservado); // solo los que son mayores al reservado
    if (usadosDelRol.length === 0) return String(base + 1); // ej: 10001
    return String(Math.max(...usadosDelRol) + 1);
  };

  const crearUsuario = async () => {
    setMsg("Creando usuario...");
    try {
      const sb = await getSB();
      const codigo = generarCodigo(form.rol, usuarios);
      // Crear en auth
      const { data, error } = await sb.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { nombre: form.nombre } }
      });
      if (error) { setMsg("Error: " + error.message); return; }
      if (!data.user) { setMsg("Error al crear usuario"); return; }
      // Insertar en tabla usuarios
      await sb.from("usuarios").insert({
        auth_id: data.user.id,
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        codigo: codigo,
        activo: true,
      });
      // Si es productor, crear empresa automáticamente
      if (form.rol === "productor") {
        const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
        if (nuevoUser) {
          await sb.from("empresas").insert({
            nombre: form.nombre_empresa || `Empresa de ${form.nombre}`,
            propietario_id: nuevoUser.id,
          });
        }
      }
      setMsg(`✅ Usuario creado — Código: ${codigo}`);
      await fetchAll();
      setShowForm(false);
      setForm({});
    } catch (e) {
      setMsg("Error inesperado");
    }
  };

  const crearVinculacion = async () => {
    const sb = await getSB();
    // Verificar si ya existe
    const { data: existe } = await sb.from("vinculaciones")
      .select("id").eq("ingeniero_id", form.ingeniero_id).eq("empresa_id", form.empresa_id).single();
    if (existe) { setMsg("Ya existe esa vinculación"); return; }
    await sb.from("vinculaciones").insert({
      ingeniero_id: form.ingeniero_id,
      empresa_id: form.empresa_id,
      activa: true,
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
    });
    setMsg("✅ Vinculación creada");
    await fetchAll();
    setShowVincForm(false);
    setForm({});
  };

  const toggleVinculacion = async (id: string, activa: boolean) => {
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: !activa }).eq("id", id);
    await fetchAll();
  };

  const toggleUsuario = async (id: string, activo: boolean) => {
    const sb = await getSB();
    await sb.from("usuarios").update({ activo: !activo }).eq("id", id);
    await fetchAll();
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const statsPorRol = Object.keys(ROL_PREFIJOS).map(r => ({
    rol: r,
    count: usuarios.filter(u => u.rol === r).length,
    ...ROL_PREFIJOS[r]
  })).filter(s => s.count > 0);

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Panel Admin...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .tab-admin-active { border-color: #00FF80 !important; color: #00FF80 !important; background: rgba(0,255,128,0.08) !important; }
        .user-row:hover { background: rgba(0,255,128,0.03); }
      `}</style>

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/login-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/90" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
        <div className="flex-1" />
        <span className="text-xs text-[#F87171] font-mono border border-[#F87171]/30 px-3 py-1 rounded-lg">👑 ADMINISTRADOR</span>
        <button onClick={async () => {
          const sb = await getSB();
          await sb.auth.signOut();
          window.location.href = "/login";
        }} className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL ADMINISTRADOR</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">GESTIÓN GLOBAL DEL SISTEMA</p>
        </div>

        {/* Stats por rol */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          {Object.keys(ROL_PREFIJOS).map(r => {
            const count = usuarios.filter(u => u.rol === r).length;
            const config = ROL_PREFIJOS[r];
            return (
              <div key={r} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{config.icon}</div>
                <div className="text-xl font-bold font-mono" style={{ color: config.color }}>{count}</div>
                <div className="text-xs text-[#4B5563] font-mono">{config.label}</div>
                <div className="text-xs text-[#1a3a2a] font-mono">{config.prefix}+</div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: "usuarios", label: "👥 USUARIOS", count: usuarios.length },
            { key: "vinculaciones", label: "🔗 VINCULACIONES", count: vinculaciones.length },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as any); setShowForm(false); setShowVincForm(false); }}
              className={`px-5 py-2 rounded-xl border border-[#00FF80]/15 text-sm font-mono transition-all ${tab === t.key ? "tab-admin-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {t.label} <span className="ml-1 opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Mensaje */}
        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg}
          </div>
        )}

        {/* ===== USUARIOS ===== */}
        {tab === "usuarios" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(!showForm); setForm({ rol: "productor" }); setMsg(""); }}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                + Crear Usuario
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-[#00FF80] font-mono text-sm font-bold">+ NUEVO USUARIO</h3>
                  {form.rol && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ color: ROL_PREFIJOS[form.rol]?.color, borderColor: ROL_PREFIJOS[form.rol]?.color, background: ROL_PREFIJOS[form.rol]?.color + "15" }}>
                      Código asignado: {generarCodigo(form.rol, usuarios)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Rol</label>
                    <select value={form.rol ?? "productor"} onChange={e => setForm({ ...form, rol: e.target.value })} className={inputClass}>
                      {Object.keys(ROL_PREFIJOS).filter(r => r !== "admin").map(r => (
                        <option key={r} value={r}>{ROL_PREFIJOS[r].icon} {ROL_PREFIJOS[r].label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={labelClass}>Nombre completo</label>
                    <input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Nombre y apellido" />
                  </div>
                  <div><label className={labelClass}>Email</label>
                    <input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="email@ejemplo.com" />
                  </div>
                  <div><label className={labelClass}>Contraseña inicial</label>
                    <input type="text" value={form.password ?? ""} onChange={e => setForm({ ...form, password: e.target.value })} className={inputClass} placeholder="Clave temporal" />
                  </div>
                  {form.rol === "productor" && (
                    <div><label className={labelClass}>Nombre de la empresa</label>
                      <input type="text" value={form.nombre_empresa ?? ""} onChange={e => setForm({ ...form, nombre_empresa: e.target.value })} className={inputClass} placeholder="Ej: Establecimiento Don Juan" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={crearUsuario} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Crear</button>
                  <button onClick={() => { setShowForm(false); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#00FF80]/10">
                    {["Código","Nombre","Email","Rol","Estado",""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => {
                    const config = ROL_PREFIJOS[u.rol];
                    return (
                      <tr key={u.id} className="user-row border-b border-[#00FF80]/5 transition-colors">
                        <td className="px-5 py-3 text-sm font-bold font-mono text-[#00FF80]">{u.codigo}</td>
                        <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono">{u.nombre}</td>
                        <td className="px-5 py-3 text-xs text-[#4B5563] font-mono">{u.email}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs px-2 py-1 rounded font-mono border"
                            style={{ color: config?.color ?? "#9CA3AF", borderColor: config?.color ?? "#9CA3AF", background: (config?.color ?? "#9CA3AF") + "15" }}>
                            {config?.icon} {config?.label ?? u.rol}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${u.activo ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>
                            {u.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => toggleUsuario(u.id, u.activo)}
                            className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono transition-colors">
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {usuarios.length === 0 && (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin usuarios registrados</div>
              )}
            </div>
          </div>
        )}

        {/* ===== VINCULACIONES ===== */}
        {tab === "vinculaciones" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowVincForm(!showVincForm); setForm({}); setMsg(""); }}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                + Nueva Vinculación
              </button>
            </div>

            {showVincForm && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">🔗 VINCULAR INGENIERO ↔ PRODUCTOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Ingeniero</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({ ...form, ingeniero_id: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Productor / Empresa</label>
                    <select value={form.empresa_id ?? ""} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.propietario} — {e.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Tipo honorario</label>
                    <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                      <option value="mensual">Mensual</option>
                      <option value="por_ha">Por hectárea</option>
                      <option value="por_campaña">Por campaña</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Monto honorario</label>
                    <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={crearVinculacion} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Vincular</button>
                  <button onClick={() => { setShowVincForm(false); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#00FF80]/10">
                    {["Ingeniero","Productor","Empresa","Estado",""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vinculaciones.map(v => (
                    <tr key={v.id} className="user-row border-b border-[#00FF80]/5 transition-colors">
                      <td className="px-5 py-3 text-sm text-[#60A5FA] font-mono">👨‍💼 {v.ingeniero_nombre}</td>
                      <td className="px-5 py-3 text-sm text-[#4ADE80] font-mono">👨‍🌾 {v.propietario_nombre}</td>
                      <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{v.empresa_nombre}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-mono ${v.activa ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>
                          {v.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleVinculacion(v.id, v.activa)}
                          className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono transition-colors">
                          {v.activa ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vinculaciones.length === 0 && (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin vinculaciones registradas</div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono">
        © AGROGESTION PRO · PANEL ADMINISTRADOR
      </p>
    </div>
  );
}

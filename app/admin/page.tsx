"use client";
import { useEffect, useState } from "react";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  codigo: string;
  activo: boolean;
};

export default function AdminPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("productor");
  const [msg, setMsg] = useState("");

  const fetchUsuarios = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await sb.from("usuarios").select("*").order("created_at", { ascending: false });
    setUsuarios(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const crearUsuario = async () => {
    setMsg("Creando...");
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const codigos: Record<string, string> = { productor: "1", ingeniero: "2", veterinario: "3", empleado: "4", aplicador: "5" };
    const prefix = codigos[rol] ?? "9";
    const codigo = prefix + Math.floor(Math.random() * 9000 + 1000).toString();
    const { data: authData, error: authError } = await sb.auth.signUp({ email, password });
    if (authError) { setMsg("Error: " + authError.message); return; }
    if (authData.user) {
      await sb.from("usuarios").insert({ auth_id: authData.user.id, nombre, email, rol, codigo, activo: true });
      setMsg("✅ Usuario creado. Código: " + codigo);
      setNombre(""); setEmail(""); setPassword(""); setRol("productor");
      setShowForm(false);
      fetchUsuarios();
    }
  };

  const rolColor: Record<string, string> = {
    admin: "#C9A227", productor: "#4ADE80", ingeniero: "#60A5FA",
    veterinario: "#A78BFA", empleado: "#FB923C", aplicador: "#F87171"
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#E5E7EB] p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#E5E7EB]">Panel Admin</h1>
            <p className="text-[#C9A227] text-sm mt-1">AgroGestión Pro 2.8 · Gestión de usuarios</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#C9A227] text-[#0F1115] font-bold px-6 py-3 rounded-lg text-sm hover:bg-[#D4AE35] transition-colors"
          >
            + Nuevo Usuario
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="bg-[#14171C] border border-[#C9A227]/30 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-bold text-[#E5E7EB] mb-5">Crear nuevo usuario</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Nombre completo</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Rol</label>
                <select
                  value={rol}
                  onChange={e => setRol(e.target.value)}
                  className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
                >
                  <option value="productor">Productor</option>
                  <option value="ingeniero">Ingeniero Agrónomo</option>
                  <option value="veterinario">Veterinario</option>
                  <option value="empleado">Empleado</option>
                  <option value="aplicador">Aplicador</option>
                </select>
              </div>
            </div>
            {msg && <p className="text-sm mt-4" style={{ color: msg.includes("✅") ? "#4ADE80" : "#F87171" }}>{msg}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={crearUsuario} className="bg-[#C9A227] text-[#0F1115] font-bold px-6 py-2 rounded-lg text-sm hover:bg-[#D4AE35] transition-colors">
                Crear Usuario
              </button>
              <button onClick={() => setShowForm(false)} className="bg-[#1C2128] text-[#9CA3AF] px-6 py-2 rounded-lg text-sm hover:bg-[#2D3139] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de usuarios */}
        <div className="bg-[#14171C] border border-[#1C2128] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1C2128]">
            <h2 className="text-sm font-bold text-[#E5E7EB]">Usuarios registrados ({usuarios.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[#4B5563]">Cargando...</div>
          ) : usuarios.length === 0 ? (
            <div className="p-8 text-center text-[#4B5563]">No hay usuarios registrados</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1C2128]">
                  <th className="text-left px-6 py-3 text-xs text-[#4B5563] uppercase tracking-widest">Nombre</th>
                  <th className="text-left px-6 py-3 text-xs text-[#4B5563] uppercase tracking-widest">Email</th>
                  <th className="text-left px-6 py-3 text-xs text-[#4B5563] uppercase tracking-widest">Rol</th>
                  <th className="text-left px-6 py-3 text-xs text-[#4B5563] uppercase tracking-widest">Código</th>
                  <th className="text-left px-6 py-3 text-xs text-[#4B5563] uppercase tracking-widest">Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} className="border-b border-[#1C2128] hover:bg-[#1C2128] transition-colors">
                    <td className="px-6 py-4 text-sm text-[#E5E7EB] font-medium">{u.nombre}</td>
                    <td className="px-6 py-4 text-sm text-[#9CA3AF]">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ color: rolColor[u.rol] ?? "#9CA3AF", background: (rolColor[u.rol] ?? "#9CA3AF") + "20" }}>
                        {u.rol.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#C9A227] font-mono">{u.codigo}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${u.activo ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type EmpleadoData = {
  id: string; nombre: string; categoria: string; empresa_id: string;
  permisos: string[]; foto_url: string; auth_id: string;
};
type EmpresaData = { nombre: string; logo_url: string; };
type JornadaActiva = { id: string; fecha: string; hora_entrada: string; } | null;

const MODULOS: Record<string, { label: string; icon: string; color: string; href: string }> = {
  lotes:      { label: "Lotes y Cultivos", icon: "🌾", color: "#16a34a", href: "/empleados/lotes" },
  stock:      { label: "Stock",            icon: "📦", color: "#1565c0", href: "/empleados/stock" },
  maquinaria: { label: "Maquinaria",       icon: "🚜", color: "#d97706", href: "/empleados/maquinaria" },
  hacienda:   { label: "Hacienda",         icon: "🐄", color: "#7c3aed", href: "/empleados/hacienda" },
};

export default function EmpleadoPanel() {
  const [empleado, setEmpleado] = useState<EmpleadoData|null>(null);
  const [empresa, setEmpresa] = useState<EmpresaData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jornada, setJornada] = useState<JornadaActiva>(null);
  const [jornadaLoading, setJornadaLoading] = useState(false);
  const [asistenciaHoy, setAsistenciaHoy] = useState<any>(null);
  const [showFormJornada, setShowFormJornada] = useState(false);
  const [lotes, setLotes] = useState<any[]>([]);
  const [maquinas, setMaquinas] = useState<any[]>([]);
  const [formJ, setFormJ] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");
  const [horaActual, setHoraActual] = useState("");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => {
    init();
    const t = setInterval(() => setHoraActual(new Date().toLocaleTimeString("es-AR")), 1000);
    return () => clearInterval(t);
  }, []);

  const init = async () => {
    const sb = await getSB();

   // 1. Verificar sesión
const { data: { user } } = await sb.auth.getUser();
const authId = user?.id ?? localStorage.getItem("agro_auth_id");
if (!authId) { window.location.href = "/login"; return; }

    // 2. Verificar rol en tabla usuarios (campo "rol", no "tipo")
    const { data: u } = await sb.from("usuarios")
      .select("id,rol,empresa_id")
      .eq("auth_id", authId)
      .single();

    if (!u) { setError("Usuario no registrado en el sistema"); setLoading(false); return; }
    if (u.rol !== "empleado") { setError("Acceso denegado — este panel es solo para empleados"); setLoading(false); return; }

    // 3. Buscar datos del empleado
    // Primero intentamos por auth_id directo en la tabla empleados
    let empData: any = null;
    const { data: empPorAuth } = await sb.from("empleados")
      .select("id,nombre,categoria,empresa_id,permisos,foto_url,auth_id")
      .eq("auth_id", authId)
      .single();

    if (empPorAuth) {
      empData = empPorAuth;
    } else {
      // Fallback: buscar por vinculación empresa → empleado
      // Si el admin vinculó al empleado con un productor, buscamos la empresa
      const { data: vinc } = await sb.from("vinculaciones")
        .select("empresa_id")
        .eq("profesional_id", u.id)
        .eq("activa", true)
        .single();

      if (vinc) {
        // Buscar empleado por empresa_id y nombre coincidente
        const { data: empPorEmpresa } = await sb.from("empleados")
          .select("id,nombre,categoria,empresa_id,permisos,foto_url,auth_id")
          .eq("empresa_id", vinc.empresa_id)
          .single();
        empData = empPorEmpresa;
      }
    }

    if (!empData) {
      // Empleado aún no tiene ficha creada en la tabla empleados
      // Creamos una entrada básica con los datos del usuario
      const { data: vinc } = await sb.from("vinculaciones")
        .select("empresa_id")
        .eq("profesional_id", u.id)
        .eq("activa", true)
        .single();

      if (!vinc) {
        setError("Tu cuenta no está vinculada a ningún productor. Contactá al administrador.");
        setLoading(false); return;
      }

      // Crear ficha básica en empleados
      const { data: nuevaFicha } = await sb.from("empleados").insert({
        empresa_id: vinc.empresa_id,
        nombre: user.email?.split("@")[0] ?? "Empleado",
        auth_id: authId,
        activo: true,
        permisos: [],
      }).select().single();

      empData = nuevaFicha;
    }

    if (!empData) {
      setError("No se encontró tu perfil de empleado. Contactá al administrador.");
      setLoading(false); return;
    }

    setEmpleado(empData);

    // 4. Datos de la empresa
    if (empData.empresa_id) {
      const { data: emp } = await sb.from("empresas")
        .select("nombre,logo_url")
        .eq("id", empData.empresa_id)
        .single();
      setEmpresa(emp);
    }

    // 5. Asistencia de hoy
    const hoy = new Date().toISOString().split("T")[0];
    const { data: asist } = await sb.from("empleado_asistencia")
      .select("*")
      .eq("empleado_id", empData.id)
      .eq("fecha", hoy)
      .single();
    setAsistenciaHoy(asist);
    if (asist?.hora_entrada && !asist.hora_salida) {
      setJornada({ id: asist.id, fecha: asist.fecha, hora_entrada: asist.hora_entrada });
    }

    // 6. Lotes y máquinas para el formulario de jornada
    if (empData.empresa_id) {
      const [lt, mq] = await Promise.all([
        sb.from("lotes").select("id,nombre,hectareas,cultivo").eq("empresa_id", empData.empresa_id).limit(60),
        sb.from("maquinaria").select("id,nombre,tipo").eq("empresa_id", empData.empresa_id).eq("estado","activo"),
      ]);
      setLotes(lt.data ?? []);
      setMaquinas(mq.data ?? []);
    }

    setLoading(false);
  };

  const iniciarJornada = async () => {
    if (!empleado) return;
    setJornadaLoading(true);
    const sb = await getSB();
    const ahora = new Date();
    const hoy = ahora.toISOString().split("T")[0];
    const horaEntrada = ahora.toTimeString().slice(0,5);
    const { data } = await sb.from("empleado_asistencia").insert({
      empresa_id: empleado.empresa_id,
      empleado_id: empleado.id,
      fecha: hoy,
      estado: "presente",
      hora_entrada: horaEntrada,
      cargado_por: empleado.nombre,
      cargado_por_tipo: "empleado",
    }).select().single();
    if (data) {
      setJornada({ id: data.id, fecha: hoy, hora_entrada: horaEntrada });
      setAsistenciaHoy(data);
      setMsg("✅ Jornada iniciada — " + horaEntrada);
    }
    setJornadaLoading(false);
  };

  const finalizarJornada = () => {
    setShowFormJornada(true);
    setFormJ({ tareas: "", lote_id: "", maquina_id: "", observaciones: "" });
  };

  const guardarCierreJornada = async () => {
    if (!jornada || !empleado) return;
    setJornadaLoading(true);
    const sb = await getSB();
    const ahora = new Date();
    const horaSalida = ahora.toTimeString().slice(0,5);
    const [hE, mE] = jornada.hora_entrada.split(":").map(Number);
    const [hS, mS] = horaSalida.split(":").map(Number);
    const totalMin = (hS*60+mS) - (hE*60+mE);
    const horasTotal = Math.round(totalMin / 60 * 100) / 100;
    const horasNorm = Math.min(horasTotal, 8);
    const horasExtra = horasTotal > 8 ? Math.round((horasTotal-8)*100)/100 : 0;

    await sb.from("empleado_asistencia").update({
      hora_salida: horaSalida,
      horas_normales: horasNorm,
      horas_extra: horasExtra,
      lote_id: formJ.lote_id || null,
      maquina_id: formJ.maquina_id || null,
      tareas: formJ.tareas || "",
      observaciones: formJ.observaciones || "",
    }).eq("id", jornada.id);

    setJornada(null);
    setShowFormJornada(false);
    setMsg(`✅ Jornada finalizada — ${horasNorm}hs${horasExtra>0?" + "+horasExtra+"hs extra":""}`);
    await init();
    setJornadaLoading(false);
  };

  const logout = async () => {
    const sb = await getSB();
    await sb.auth.signOut();
    window.location.href = "/empleados/login";
  };

  // ── Loading ──
  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando tu panel...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"rgba(255,255,255,0.92)",borderRadius:20,padding:"32px 28px",
        maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 12px 40px rgba(20,80,160,0.18)"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:800,color:"#0d2137",marginBottom:8}}>Acceso no disponible</div>
        <div style={{fontSize:13,color:"#6b8aaa",marginBottom:20,lineHeight:1.5}}>{error}</div>
        <button onClick={logout} style={{background:"none",border:"1.5px solid rgba(25,118,210,0.35)",
          borderRadius:10,padding:"8px 20px",color:"#1565c0",fontWeight:700,cursor:"pointer",fontSize:13}}>
          Volver al login
        </button>
      </div>
    </div>
  );

  if (!empleado) return null;

  const permisos: string[] = empleado.permisos ?? [];
  const modulosHabilitados = Object.entries(MODULOS).filter(([key]) => permisos.includes(key));

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .inp{background:rgba(255,255,255,0.80);border:1.5px solid rgba(180,210,240,0.60);border-radius:11px;
          padding:10px 13px;font-size:13px;color:#1a2a4a;width:100%;box-sizing:border-box;
          transition:all 0.18s;font-family:'DM Sans',system-ui;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.45);
          outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.12);}
        .inp option{background:white;color:#1a2a4a;}
        .topbar-e{background-image:url('/FON.png');background-size:cover;
          border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-e::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-e>*{position:relative;z-index:1;}
        .card-g{background-image:url('/FON.png');background-size:cover;
          border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);
          border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);
          pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}
        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);
          border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}
        .mod-card{background-image:url('/FON.png');background-size:cover;
          border:1.5px solid rgba(255,255,255,0.88);border-radius:18px;
          box-shadow:0 4px 16px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;
          position:relative;overflow:hidden;text-decoration:none;display:block;}
        .mod-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .mod-card>*{position:relative;}
        .mod-card:hover{transform:translateY(-4px);box-shadow:0 10px 28px rgba(20,80,160,0.20);}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;
          border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);
          border-radius:12px;color:white;font-weight:800;font-size:13px;cursor:pointer;padding:10px 20px;
          text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);
          border-radius:12px;color:#1e3a5f;font-weight:700;font-size:13px;cursor:pointer;
          padding:10px 16px;transition:all 0.18s;}
        .btn-verde{background:linear-gradient(135deg,#16a34a,#15803d);
          border:1.5px solid rgba(22,163,74,0.40);border-radius:14px;color:white;font-weight:800;
          font-size:15px;cursor:pointer;padding:14px 24px;box-shadow:0 4px 16px rgba(22,163,74,0.35);
          transition:all 0.18s;width:100%;}
        .btn-verde:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08);}
        .btn-rojo{background:linear-gradient(135deg,#dc2626,#b91c1c);
          border:1.5px solid rgba(220,38,38,0.40);border-radius:14px;color:white;font-weight:800;
          font-size:15px;cursor:pointer;padding:14px 24px;box-shadow:0 4px 16px rgba(220,38,38,0.30);
          transition:all 0.18s;width:100%;}
        .btn-rojo:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08);}
        .fade-in{animation:fadeIn 0.25s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-e" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(25,118,210,0.12)",
            border:"1.5px solid rgba(25,118,210,0.25)",display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:16,fontWeight:800,color:"#1565c0",flexShrink:0}}>
            {empleado.nombre.charAt(0).toUpperCase()}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0d2137",lineHeight:1.2}}>{empleado.nombre}</div>
            <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>
              {empleado.categoria?.replace("_"," ")||"Empleado"}
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:"#1565c0"}}>{horaActual}</div>
          <Image src="/logo.png" alt="Logo" width={80} height={28} style={{objectFit:"contain"}}/>
          <button onClick={logout} style={{background:"none",border:"none",cursor:"pointer",
            fontSize:12,color:"#6b8aaa",fontWeight:600}}>Salir</button>
        </div>
      </div>

      <div style={{maxWidth:500,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Empresa */}
        {empresa&&(
          <div style={{textAlign:"center",marginBottom:16,padding:"8px 14px",borderRadius:12,
            background:"rgba(255,255,255,0.55)",fontSize:12,color:"#6b8aaa",fontWeight:600}}>
            🏢 {empresa.nombre}
          </div>
        )}

        {/* Toast */}
        {msg&&<div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,fontSize:13,fontWeight:600,
          color:msg.startsWith("✅")?"#16a34a":"#dc2626",
          background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",
          border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,
          display:"flex",justifyContent:"space-between"}}>
          {msg}
          <button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16}}>✕</button>
        </div>}

        {/* ── JORNADA ── */}
        <div className="card-g fade-in" style={{padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>🕐 Mi Jornada de Hoy</div>

          {asistenciaHoy?.hora_salida?(
            /* Jornada completada */
            <div style={{textAlign:"center",padding:"14px 0"}}>
              <div style={{fontSize:28,marginBottom:6}}>✅</div>
              <div style={{fontSize:14,fontWeight:700,color:"#16a34a"}}>Jornada completada</div>
              <div style={{fontSize:12,color:"#6b8aaa",marginTop:4}}>
                {asistenciaHoy.hora_entrada} → {asistenciaHoy.hora_salida} · {asistenciaHoy.horas_normales}hs
                {asistenciaHoy.horas_extra>0?` + ${asistenciaHoy.horas_extra}hs extra`:""}
              </div>
              {asistenciaHoy.tareas&&<div style={{fontSize:11,color:"#4a6a8a",marginTop:4}}>📋 {asistenciaHoy.tareas}</div>}
            </div>
          ):jornada?(
            /* Jornada en curso */
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>Jornada en curso</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#16a34a"}}>▶ Desde {jornada.hora_entrada}</div>
                </div>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#16a34a",
                  animation:"pulse 2s ease-in-out infinite"}}/>
              </div>
              {!showFormJornada?(
                <button onClick={finalizarJornada} className="btn-rojo">⏹ Finalizar Jornada</button>
              ):(
                <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#0d2137",marginBottom:2}}>¿Dónde y qué hiciste hoy?</div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",
                      letterSpacing:0.8,display:"block",marginBottom:4}}>Lote donde trabajaste</label>
                    <select value={formJ.lote_id||""} onChange={e=>setFormJ({...formJ,lote_id:e.target.value})} className="inp">
                      <option value="">Sin lote específico</option>
                      {lotes.map(l=><option key={l.id} value={l.id}>{l.nombre} · {l.hectareas}ha{l.cultivo?` (${l.cultivo})`:""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",
                      letterSpacing:0.8,display:"block",marginBottom:4}}>Máquina utilizada</label>
                    <select value={formJ.maquina_id||""} onChange={e=>setFormJ({...formJ,maquina_id:e.target.value})} className="inp">
                      <option value="">Sin maquinaria</option>
                      {maquinas.map(m=><option key={m.id} value={m.id}>{m.nombre} ({m.tipo})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",
                      letterSpacing:0.8,display:"block",marginBottom:4}}>Tareas realizadas</label>
                    <input type="text" value={formJ.tareas||""} onChange={e=>setFormJ({...formJ,tareas:e.target.value})}
                      placeholder="Siembra, pulverización, cerco..." className="inp"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",
                      letterSpacing:0.8,display:"block",marginBottom:4}}>Observaciones</label>
                    <input type="text" value={formJ.observaciones||""} onChange={e=>setFormJ({...formJ,observaciones:e.target.value})}
                      placeholder="Clima, problemas, novedades..." className="inp"/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={guardarCierreJornada} disabled={jornadaLoading}
                      className="btn-rojo" style={{flex:1,fontSize:13,padding:"11px"}}>
                      {jornadaLoading?"Guardando...":"⏹ Confirmar cierre"}
                    </button>
                    <button onClick={()=>setShowFormJornada(false)} className="abtn">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ):(
            /* Sin jornada */
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:12,color:"#6b8aaa",marginBottom:14}}>
                {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
              </div>
              <button onClick={iniciarJornada} disabled={jornadaLoading} className="btn-verde">
                {jornadaLoading?(
                  <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.4)",
                      borderTopColor:"white",borderRadius:"50%",display:"inline-block",
                      animation:"spin 0.8s linear infinite"}}/>
                    Registrando...
                  </span>
                ):"▶ Iniciar Jornada"}
              </button>
            </div>
          )}
        </div>

        {/* ── MÓDULOS HABILITADOS ── */}
        {modulosHabilitados.length>0&&(
          <div className="fade-in" style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",
              letterSpacing:0.8,marginBottom:12}}>◆ Módulos habilitados</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {modulosHabilitados.map(([key,mod])=>(
                <a key={key} href={mod.href} className="mod-card" style={{padding:16}}>
                  <div style={{fontSize:32,marginBottom:8}}>{mod.icon}</div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>{mod.label}</div>
                  <div style={{fontSize:10,color:mod.color,fontWeight:700,marginTop:3}}>→ Ver módulo</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {modulosHabilitados.length===0&&(
          <div className="sec-w fade-in" style={{padding:"32px 20px",textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:10,opacity:0.3}}>🔒</div>
            <div style={{fontSize:14,fontWeight:700,color:"#6b8aaa"}}>Sin módulos habilitados</div>
            <div style={{fontSize:12,color:"#6b8aaa",marginTop:4}}>
              Consultá con tu empleador para obtener acceso
            </div>
          </div>
        )}

        {/* ── ÚLTIMAS JORNADAS ── */}
        <UltimasJornadas empleadoId={empleado.id} getSB={getSB}/>
      </div>
    </div>
  );
}

function UltimasJornadas({ empleadoId, getSB }: { empleadoId: string; getSB: () => Promise<any> }) {
  const [jornadas, setJornadas] = useState<any[]>([]);
  useEffect(() => {
    getSB().then((sb: any) =>
      sb.from("empleado_asistencia")
        .select("*").eq("empleado_id", empleadoId)
        .order("fecha",{ascending:false}).limit(7)
        .then(({ data }: any) => setJornadas(data ?? []))
    );
  }, [empleadoId]);
  if (jornadas.length===0) return null;
  return (
    <div>
      <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",
        letterSpacing:0.8,marginBottom:10}}>📅 Mis últimas jornadas</div>
      <div style={{background:"rgba(255,255,255,0.88)",border:"1.5px solid rgba(255,255,255,0.92)",
        borderRadius:16,overflow:"hidden",boxShadow:"0 4px 18px rgba(20,80,160,0.10)"}}>
        {jornadas.map((j,i)=>(
          <div key={j.id} style={{padding:"10px 14px",
            borderBottom:i<jornadas.length-1?"1px solid rgba(0,60,140,0.06)":"none",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>
                {new Date(j.fecha+"T12:00:00").toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"short"})}
              </div>
              {j.tareas&&<div style={{fontSize:10,color:"#6b8aaa"}}>{j.tareas}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              {j.hora_entrada&&j.hora_salida?(
                <div style={{fontSize:11,fontWeight:700,color:"#16a34a"}}>
                  {j.horas_normales}hs{j.horas_extra>0?` +${j.horas_extra}e`:""}
                </div>
              ):j.hora_entrada?(
                <div style={{fontSize:11,fontWeight:700,color:"#d97706"}}>En curso</div>
              ):(
                <div style={{fontSize:11,fontWeight:700,color:"#dc2626"}}>{j.estado}</div>
              )}
              {j.hora_entrada&&(
                <div style={{fontSize:10,color:"#6b8aaa"}}>
                  {j.hora_entrada}{j.hora_salida?` - ${j.hora_salida}`:""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

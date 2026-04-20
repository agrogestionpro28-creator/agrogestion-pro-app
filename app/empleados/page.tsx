"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

const MODULOS = [
  { href: "/productor/lotes",      label: "Lotes y Cultivos", sub: "Campos del productor",  img: "/mod-lotes.png",      icon: "🌾" },
  { href: "/productor/maquinaria", label: "Maquinarias",      sub: "Equipos e implementos", img: "/mod-maquinaria.png", icon: "🚜" },
  { href: "/productor/hacienda",   label: "Hacienda",         sub: "Ganadería",             img: "/mod-hacienda.png",   icon: "🐄" },
  { href: "/productor/stock",      label: "Stock",            sub: "Insumos · Gasoil · Varios", img: "/mod-stock.png",  icon: "📦" },
];

type EmpleadoData = {
  id: string; nombre: string; categoria: string; empresa_id: string;
  permisos: string[]; foto_url: string; auth_id: string;
  fecha_nacimiento?: string; estado_civil?: string;
  contacto_emergencia?: string; telefono_emergencia?: string;
  tipo_contratacion?: string; jornada_horas_dia?: number;
  forma_pago?: string; alta_afip?: boolean;
  alta_seguridad_social?: boolean; art?: string; obra_social?: string;
  cuit?: string; localidad?: string; provincia?: string; telefono?: string;
};

type EmpresaData = { nombre: string; };
type UsuarioData = { nombre: string; email: string; codigo: string; };

export default function EmpleadoDashboard() {
  const [empleado, setEmpleado] = useState<EmpleadoData|null>(null);
  const [empresa, setEmpresa] = useState<EmpresaData|null>(null);
  const [usuario, setUsuario] = useState<UsuarioData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"modulos"|"perfil">("modulos");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => {
    setMounted(true);
    init();
  }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    const authId = user?.id ?? localStorage.getItem("agro_auth_id");
    if (!authId) { window.location.href = "/login"; return; }

    // Verificar rol
    const { data: u } = await sb.from("usuarios")
      .select("id,rol,nombre,email,codigo")
      .eq("auth_id", authId)
      .single();
    if (!u) { setError("Usuario no registrado"); setLoading(false); return; }
    if (u.rol !== "empleado") { window.location.href = "/login"; return; }
    setUsuario({ nombre: u.nombre, email: u.email, codigo: u.codigo });

    // Buscar ficha empleado
    const { data: emp } = await sb.from("empleados")
      .select("*")
      .eq("auth_id", authId)
      .single();

    if (!emp) {
      // Buscar por vinculación
      const { data: vinc } = await sb.from("vinculaciones")
        .select("empresa_id")
        .eq("profesional_id", u.id)
        .eq("activa", true)
        .single();

      if (!vinc) { setError("Tu cuenta no está vinculada a ningún productor. Contactá al administrador."); setLoading(false); return; }

      // Crear ficha básica
      const { data: nuevaFicha } = await sb.from("empleados").insert({
        empresa_id: vinc.empresa_id,
        nombre: u.nombre,
        auth_id: authId,
        activo: true,
        permisos: [],
      }).select().single();

      if (!nuevaFicha) { setError("Error al crear perfil. Contactá al administrador."); setLoading(false); return; }
      setEmpleado(nuevaFicha);

      const { data: empresa } = await sb.from("empresas").select("nombre").eq("id", vinc.empresa_id).single();
      setEmpresa(empresa);

      // Guardar empresa_id para que los módulos del productor funcionen
      localStorage.setItem("empresa_id_empleado", vinc.empresa_id);
    } else {
      setEmpleado(emp);
      const { data: empresa } = await sb.from("empresas").select("nombre").eq("id", emp.empresa_id).single();
      setEmpresa(empresa);
      localStorage.setItem("empresa_id_empleado", emp.empresa_id);
    }

    setLoading(false);
  };

  const logout = async () => {
    const sb = await getSB();
    await sb.auth.signOut();
    localStorage.removeItem("agro_auth_id");
    localStorage.removeItem("empresa_id_empleado");
    window.location.href = "/login";
  };

  const saludo = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  };

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{color:"#1565c0",fontWeight:600}}>Cargando...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"rgba(255,255,255,0.92)",borderRadius:20,padding:"32px 28px",
        maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 12px 40px rgba(20,80,160,0.18)"}}>
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

  if (!empleado || !usuario) return null;

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"fixed"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes twinkle{0%,100%{opacity:0.25;transform:scale(0.8)}50%{opacity:0.85;transform:scale(1.2)}}
        .topbar-dash{background-image:url('/FON.png');background-size:cover;background-position:top center;
          border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 20px rgba(20,80,160,0.14);position:relative;}
        .topbar-dash::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.32);pointer-events:none;}
        .topbar-dash>*{position:relative;z-index:1;}
        .mod-card{background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);
          border-radius:20px;box-shadow:0 8px 28px rgba(20,80,160,0.15),inset 0 2px 0 rgba(255,255,255,0.90);
          position:relative;overflow:hidden;cursor:pointer;
          transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);}
        .mod-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.52);
          pointer-events:none;z-index:0;transition:background 0.22s;}
        .mod-card::after{content:"";position:absolute;top:0;left:0;right:0;height:40%;
          background:linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%);
          border-radius:20px 20px 0 0;pointer-events:none;z-index:1;}
        .mod-card>*{position:relative;z-index:2;}
        .mod-card:hover{transform:translateY(-5px) scale(1.02);box-shadow:0 16px 40px rgba(20,80,160,0.22);}
        .mod-card:hover::before{background:rgba(255,255,255,0.72);}
        .mod-img-wrap{position:relative;height:130px;overflow:hidden;border-radius:14px 14px 0 0;}
        .mod-img-wrap img{transition:transform 0.35s ease;object-fit:cover;}
        .mod-card:hover .mod-img-wrap img{transform:scale(1.07);}
        .mod-img-wrap::after{content:"";position:absolute;inset:0;
          background:linear-gradient(180deg,transparent 40%,rgba(255,255,255,0.60) 100%);}
        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);
          border-radius:20px;box-shadow:0 8px 28px rgba(20,80,160,0.15);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);
          pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}
        .tab-btn{padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;
          transition:all 0.18s;background:rgba(255,255,255,0.58);
          border:1.5px solid rgba(255,255,255,0.92);color:#1e3a5f;}
        .tab-btn.on{background-image:url('/AZUL.png');background-size:cover;
          border:1.5px solid rgba(100,180,255,0.45);color:white;font-weight:800;
          box-shadow:0 5px 18px rgba(25,118,210,0.38);text-shadow:0 1px 3px rgba(0,40,120,0.30);}
        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);
          border-radius:14px;color:white;font-weight:800;font-size:13px;cursor:pointer;padding:10px 18px;
          box-shadow:0 4px 18px rgba(25,118,210,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-2px);filter:brightness(1.08);}
        .fade-in{animation:fadeIn 0.25s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* Estrellas */}
      {mounted&&([[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],
        [15,70,4,3.2,0.3],[50,55,3,4.5,1.5],[90,65,5,3,0.7],[35,85,3,2.5,2]] as number[][]).map(([x,y,r,d,delay],i)=>(
        <div key={i} style={{position:"fixed",borderRadius:"50%",background:"white",pointerEvents:"none",
          left:x+"%",top:y+"%",width:r+"px",height:r+"px",opacity:0.35,zIndex:0,
          animation:`twinkle ${d}s ease-in-out infinite`,animationDelay:delay+"s"}}/>
      ))}

      {/* TOPBAR */}
      <div className="topbar-dash" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",gap:12}}>
          <div style={{cursor:"pointer",flexShrink:0}} onClick={()=>window.location.href="/empleados"}>
            <Image src="/logo.png" alt="AgroGestión PRO" width={120} height={42} style={{objectFit:"contain"}}/>
          </div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>
                {saludo()}, <span style={{color:"#d97706"}}>{usuario.nombre}</span>
              </span>
              {empresa&&(
                <span style={{fontSize:12,fontWeight:600,color:"#4a6a8a",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{color:"#d97706",fontSize:10}}>◆</span> {empresa.nombre}
                </span>
              )}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,
              background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.25)"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#d97706",boxShadow:"0 0 6px rgba(217,119,6,0.60)"}}/>
              <span style={{fontSize:11,fontWeight:700,color:"#d97706"}}>👷 Empleado</span>
            </div>
            <button onClick={logout} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,padding:"0 16px 10px"}}>
          <button onClick={()=>setTab("modulos")} className={`tab-btn${tab==="modulos"?" on":""}`}>🏠 Mi Campo</button>
          <button onClick={()=>setTab("perfil")} className={`tab-btn${tab==="perfil"?" on":""}`}>👷 Mi Perfil</button>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{maxWidth:1080,margin:"0 auto",padding:"24px 16px 60px",position:"relative",zIndex:1}}>

        {/* ── MÓDULOS ── */}
        {tab==="modulos"&&(
          <div className="fade-in">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14,marginBottom:20}}>
              {MODULOS.map(mod=>(
                <div key={mod.href} className="mod-card" onClick={()=>window.location.href=mod.href}>
                  <div className="mod-img-wrap">
                    <Image src={mod.img} alt={mod.label} fill style={{objectFit:"cover"}}/>
                  </div>
                  <div style={{padding:"12px 14px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                      <span style={{fontSize:18}}>{mod.icon}</span>
                      <span style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>{mod.label}</span>
                    </div>
                    <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600,letterSpacing:0.2}}>{mod.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Info campo */}
            {empresa&&(
              <div className="card-g" style={{padding:16}}>
                <div style={{fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>
                  🏢 Campo asignado
                </div>
                <div style={{fontSize:18,fontWeight:800,color:"#0d2137"}}>{empresa.nombre}</div>
                <div style={{fontSize:12,color:"#6b8aaa",marginTop:4}}>
                  Código empleado: <strong style={{color:"#d97706"}}>#{usuario.codigo}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PERFIL ── */}
        {tab==="perfil"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Header perfil */}
            <div className="card-g" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:60,height:60,borderRadius:"50%",
                  background:"rgba(217,119,6,0.12)",border:"2px solid rgba(217,119,6,0.35)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
                  👷
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:20,fontWeight:800,color:"#0d2137"}}>{usuario.nombre}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#d97706",marginTop:2}}>
                    {empleado.categoria?.replace(/_/g," ")||"Empleado"} · Cód. {usuario.codigo}
                  </div>
                  <div style={{fontSize:11,color:"#6b8aaa"}}>{usuario.email}</div>
                </div>
                <div style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,
                  background:"rgba(22,163,74,0.12)",color:"#16a34a"}}>✓ Activo</div>
              </div>
            </div>

            {/* Datos personales */}
            <div className="card-g" style={{padding:18}}>
              <div style={{fontSize:12,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                📋 Datos Personales
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  ["CUIT", empleado.cuit||"—"],
                  ["Teléfono", empleado.telefono||"—"],
                  ["Localidad", empleado.localidad||"—"],
                  ["Provincia", empleado.provincia||"—"],
                  ["Estado civil", empleado.estado_civil||"—"],
                  ["Fecha nac.", empleado.fecha_nacimiento||"—"],
                  ["Contacto emergencia", empleado.contacto_emergencia||"—"],
                  ["Tel. emergencia", empleado.telefono_emergencia||"—"],
                ].map(([l,v])=>(
                  <div key={l} style={{padding:"10px 12px",borderRadius:12,
                    background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.40)"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Datos laborales */}
            <div className="card-g" style={{padding:18}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1565c0",textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                💼 Datos Laborales
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  ["Tipo contratación", empleado.tipo_contratacion||"—"],
                  ["Jornada", empleado.jornada_horas_dia ? empleado.jornada_horas_dia+"hs/día" : "—"],
                  ["Forma de pago", empleado.forma_pago||"—"],
                  ["Alta AFIP", empleado.alta_afip?"✅ Sí":"❌ No"],
                  ["Seguridad Social", empleado.alta_seguridad_social?"✅ Sí":"❌ No"],
                  ["ART", empleado.art||"—"],
                  ["Obra Social", empleado.obra_social||"—"],
                  ["Empresa", empresa?.nombre||"—"],
                ].map(([l,v])=>(
                  <div key={l} style={{padding:"10px 12px",borderRadius:12,
                    background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.40)"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen horas y vacaciones — próximamente */}
            <div className="card-g" style={{padding:18}}>
              <div style={{fontSize:12,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                📅 Horas y Vacaciones
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                {[
                  ["Horas normales mes","—","#1565c0"],
                  ["Horas extras mes","—","#d97706"],
                  ["Vacaciones","—","#16a34a"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{padding:"14px 12px",borderRadius:12,textAlign:"center",
                    background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.40)"}}>
                    <div style={{fontSize:24,fontWeight:800,color:c as string,marginBottom:4}}>{v}</div>
                    <div style={{fontSize:9,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,padding:"10px 14px",borderRadius:12,
                background:"rgba(25,118,210,0.06)",border:"1px solid rgba(25,118,210,0.18)",
                fontSize:12,color:"#1565c0",fontWeight:600}}>
                💡 Los registros de horas y liquidaciones los carga el productor o administrador
              </div>
            </div>

          </div>
        )}

        <p style={{textAlign:"center",marginTop:28,fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em"}}>
          © AgroGestión PRO 2.8
        </p>
      </div>
    </div>
  );
}

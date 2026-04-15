"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Campana = {
  id: string;
  nombre: string;
  año_inicio: number;
  año_fin: number;
  activa: boolean;
};

type Empresa = {
  id: string;
  nombre: string;
};

export default function ProductorHome() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [añoInicio, setAñoInicio] = useState(new Date().getFullYear());
  const [añoFin, setAñoFin] = useState(new Date().getFullYear() + 1);

  useEffect(() => {
    const init = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("nombre").eq("auth_id", user.id).single();
      if (u) setNombre(u.nombre);
      const { data: emp } = await sb.from("empresas").select("*").eq("propietario_id", user.id).single();
      if (emp) {
        setEmpresa(emp);
        const { data: cs } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
        setCampanas(cs ?? []);
      }
      setLoading(false);
    };
    init();
  }, []);

  const crearCampana = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    let empId = empresa?.id;
    if (!empId) {
      const { data: u } = await sb.from("usuarios").select("id, nombre").eq("auth_id", user.id).single();
      const { data: newEmp } = await sb.from("empresas").insert({ nombre: u?.nombre ?? "Mi Empresa", propietario_id: u?.id }).select().single();
      if (newEmp) { setEmpresa(newEmp); empId = newEmp.id; }
    }
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", empId);
    await sb.from("campanas").insert({ empresa_id: empId, nombre: `${añoInicio}/${añoFin}`, año_inicio: añoInicio, año_fin: añoFin, activa: true });
    const { data: cs } = await sb.from("campanas").select("*").eq("empresa_id", empId).order("año_inicio", { ascending: false });
    setCampanas(cs ?? []);
    setShowForm(false);
  };

  const seleccionarCampana = (id: string) => {
    localStorage.setItem("campana_id", id);
    window.location.href = "/productor/dashboard";
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"url('/FON.png') center/cover fixed",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600,fontSize:14}}>Cargando...</span>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh",
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",
      backgroundSize:"cover",
      backgroundPosition:"center",
      backgroundAttachment:"fixed",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shine{0%{left:-60%}100%{left:130%}}
        @keyframes twinkle{0%,100%{opacity:0.25;transform:scale(0.8)}50%{opacity:0.8;transform:scale(1.2)}}

        .camp-card{
          background-image:url('/FON.png');
          background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:22px;
          box-shadow:0 8px 32px rgba(20,80,160,0.15),inset 0 2px 0 rgba(255,255,255,0.90);
          position:relative;overflow:hidden;
          cursor:pointer;
          transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .camp-card::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.60);
          border-radius:22px;pointer-events:none;z-index:0;
          transition:background 0.22s;
        }
        .camp-card::after{
          content:"";position:absolute;top:0;left:0;right:0;height:42%;
          background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);
          border-radius:22px 22px 0 0;pointer-events:none;z-index:1;
        }
        .camp-card>*{position:relative;z-index:2;}
        .camp-card:hover{transform:translateY(-4px);box-shadow:0 14px 40px rgba(20,80,160,0.22);}
        .camp-card.activa::before{background:rgba(255,255,255,0.68);}

        .inp-prod{
          background:rgba(255,255,255,0.75);
          border:1px solid rgba(180,210,240,0.55);
          border-radius:12px;color:#1a2a4a;
          padding:10px 14px;font-size:14px;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);
          transition:all 0.18s;outline:none;
          font-family:'DM Sans',system-ui,sans-serif;
          width:100px;
        }
        .inp-prod:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);box-shadow:0 0 0 3px rgba(25,118,210,0.10);}

        .topbar-prod{
          background-image:url('/FON.png');
          background-size:cover;background-position:top center;
          border-bottom:1px solid rgba(255,255,255,0.40);
          box-shadow:0 2px 16px rgba(20,80,160,0.12);
          position:relative;
        }
        .topbar-prod::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-prod>*{position:relative;z-index:1;}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:16px;color:white;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 18px rgba(25,118,210,0.45);padding:12px 22px;text-shadow:0 1px 3px rgba(0,40,120,0.35);transition:all 0.18s;font-family:'DM Sans',system-ui,sans-serif;}
        .bbtn:hover{transform:translateY(-2px);filter:brightness(1.08);}

        .form-card{
          background-image:url('/FON.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.90);border-radius:20px;
          box-shadow:0 8px 32px rgba(20,80,160,0.15);
          position:relative;overflow:hidden;
        }
        .form-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);border-radius:20px;pointer-events:none;}
        .form-card>*{position:relative;z-index:1;}

        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* Estrellas */}
      {([[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],[15,70,4,3.2,0.3],[50,55,3,4.5,1.5],[90,65,5,3,0.7],[35,85,3,2.5,2]] as number[][]).map(([x,y,r,d,delay],i)=>(
        <div key={i} style={{position:"fixed",borderRadius:"50%",background:"white",pointerEvents:"none",left:x+"%",top:y+"%",width:r+"px",height:r+"px",opacity:0.35,animation:`twinkle ${d}s ease-in-out infinite`,animationDelay:delay+"s"}}/>
      ))}

      {/* TOPBAR */}
      <div className="topbar-prod" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",borderRadius:5,padding:"2px 8px",color:"white",letterSpacing:0.8,border:"1px solid rgba(100,180,255,0.45)"}}>PRO</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",marginTop:1,fontWeight:600}}>Gestión inteligente. Decisiones que rinden.</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>{nombre}</div>
              <div style={{fontSize:11,color:"#16a34a",fontWeight:600}}>👨‍🌾 Productor</div>
            </div>
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",border:"2px solid rgba(255,255,255,0.90)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"white",fontWeight:800}}>
              {nombre.charAt(0)||"P"}
            </div>
            <button onClick={()=>window.location.href="/login"} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{maxWidth:860,margin:"0 auto",padding:"32px 16px 60px"}}>

        {/* Título */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <h1 style={{fontSize:32,fontWeight:800,color:"#0d2137",margin:"0 0 10px",letterSpacing:-0.5}}>
            Seleccionar Campaña
          </h1>
          <p style={{color:"#6b8aaa",fontSize:15,fontWeight:500}}>
            Elegí el ciclo productivo para gestionar tus lotes y labores
          </p>
        </div>

        {/* Botón nueva campaña */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:20}}>
          <button onClick={()=>setShowForm(!showForm)} className="bbtn">
            {showForm?"Cancelar":"+ Nueva Campaña"}
          </button>
        </div>

        {/* Formulario nueva campaña */}
        {showForm&&(
          <div className="form-card" style={{padding:20,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0d2137",marginBottom:16}}>Nueva campaña agrícola</div>
            <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Año inicio</label>
                <input type="number" value={añoInicio} onChange={e=>setAñoInicio(Number(e.target.value))} className="inp-prod"/>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Año fin</label>
                <input type="number" value={añoFin} onChange={e=>setAñoFin(Number(e.target.value))} className="inp-prod"/>
              </div>
              <button onClick={crearCampana} className="bbtn" style={{fontSize:13,padding:"10px 20px"}}>Crear</button>
            </div>
          </div>
        )}

        {/* Lista campañas */}
        {campanas.length===0?(
          <div style={{textAlign:"center",padding:"64px 20px"}}>
            <div style={{fontSize:56,opacity:0.15,marginBottom:16}}>🌱</div>
            <p style={{fontSize:16,color:"#6b8aaa",marginBottom:6}}>No tenés campañas creadas</p>
            <p style={{fontSize:13,color:"#9ab0c4"}}>Hacé clic en "Nueva Campaña" para empezar</p>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>
            {campanas.map(c=>(
              <div key={c.id} className={`camp-card${c.activa?" activa":""}`} onClick={()=>seleccionarCampana(c.id)} style={{padding:22}}>
                {c.activa&&(
                  <div style={{
                    display:"inline-flex",alignItems:"center",gap:5,
                    backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
                    color:"white",fontSize:10,fontWeight:800,
                    padding:"3px 12px",borderRadius:20,marginBottom:14,
                    border:"1px solid rgba(100,180,255,0.45)",
                    textShadow:"0 1px 2px rgba(0,40,120,0.35)",
                    letterSpacing:0.5,
                  }}>
                    ★ CAMPAÑA ACTUAL
                  </div>
                )}
                <div style={{fontSize:36,fontWeight:800,color:"#0d2137",letterSpacing:-1,marginBottom:4}}>
                  {c.año_inicio}/{c.año_fin}
                </div>
                <div style={{fontSize:11,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:1.2,fontWeight:600,marginBottom:16}}>
                  Ciclo Agrícola
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:c.activa?"#16a34a":"#9ab0c4",fontWeight:600}}>
                  <span>🌱</span>
                  <span>Ver lotes y labores →</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{textAlign:"center",marginTop:40,fontSize:11,color:"rgba(30,58,90,0.50)",fontWeight:600,letterSpacing:"0.15em"}}>
          © AgroGestión PRO 2.8
        </p>
      </div>
    </div>
  );
}

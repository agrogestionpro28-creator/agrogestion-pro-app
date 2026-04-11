"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!email.trim() || !password.trim()) { setMsg("Completá email y clave"); return; }
    setMsg(""); setLoading(true);
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

      const letraMatch = password.match(/^(.+)-([A-H])$/i);
      let letraSocio: string | null = null;
      let passwordReal = password;
      if (letraMatch) { passwordReal = letraMatch[1]; letraSocio = letraMatch[2].toUpperCase(); }

      const { data, error } = await sb.auth.signInWithPassword({ email, password: passwordReal });
      if (error) { setMsg("Email o clave incorrectos"); setLoading(false); return; }

      if (data.user) {
        const { data: u } = await sb.from("usuarios").select("id, rol, nombre").eq("auth_id", data.user.id).single();
        if (!u) { setMsg("Usuario no encontrado"); setLoading(false); return; }

        if (letraSocio && u.rol === "productor") {
          const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
          if (emp) {
            const { data: socio } = await sb.from("empresa_socios")
              .select("nombre, permisos, activo").eq("empresa_id", emp.id)
              .eq("letra", letraSocio).eq("activo", true).single();
            if (socio) {
              localStorage.setItem("socio_nombre", socio.nombre);
              localStorage.setItem("socio_letra", letraSocio);
              localStorage.setItem("socio_permisos", socio.permisos);
            } else {
              setMsg(`Socio "${letraSocio}" no encontrado o inactivo`);
              await sb.auth.signOut(); setLoading(false); return;
            }
          }
        } else {
          localStorage.removeItem("socio_nombre");
          localStorage.removeItem("socio_letra");
          localStorage.removeItem("socio_permisos");
        }
        const rol = u.rol ?? "productor";
        window.location.href = rol === "productor" ? "/productor/dashboard" : "/" + rol;
      }
    } catch { setMsg("Error de conexión"); setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100vh",
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage:"url('/FON.png')",
      backgroundSize:"cover",
      backgroundPosition:"center",
      backgroundAttachment:"fixed",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      justifyContent:"center",
      padding:"24px 16px",
      position:"relative",
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shine{0%{left:-60%}100%{left:130%}}
        @keyframes twinkle{0%,100%{opacity:0.25;transform:scale(0.8)}50%{opacity:0.9;transform:scale(1.2)}}
        @keyframes spin{to{transform:rotate(360deg)}}

        .login-card{
          background:rgba(255,255,255,0.60);
          backdrop-filter:blur(22px) saturate(170%);
          -webkit-backdrop-filter:blur(22px) saturate(170%);
          border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:28px;
          box-shadow:
            0 20px 60px rgba(20,80,160,0.20),
            0 4px 16px rgba(0,0,0,0.08),
            inset 0 2px 0 rgba(255,255,255,0.95),
            inset 0 -1px 0 rgba(255,255,255,0.30);
          position:relative;overflow:hidden;
          animation:fadeUp 0.5s ease;
        }
        .login-card::before{
          content:"";position:absolute;top:0;left:0;right:0;height:40%;
          background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);
          border-radius:28px 28px 0 0;pointer-events:none;z-index:0;
        }
        .login-card::after{
          content:"";position:absolute;
          top:-30%;left:-60%;width:30%;height:160%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.20),transparent);
          transform:skewX(-15deg);
          animation:shine 7s ease-in-out infinite;
          pointer-events:none;z-index:0;
        }
        .login-card>*{position:relative;z-index:1;}

        .inp-login{
          width:100%;
          background:rgba(255,255,255,0.70);
          border:1.5px solid rgba(180,210,240,0.55);
          border-top:1.5px solid rgba(255,255,255,0.90);
          border-radius:14px;
          padding:13px 16px 13px 44px;
          font-size:14px;
          font-family:'DM Sans',system-ui,sans-serif;
          color:#1a2a4a;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.05),inset 0 1px 0 rgba(255,255,255,0.80);
          transition:all 0.2s ease;
          outline:none;
        }
        .inp-login::placeholder{color:rgba(80,120,160,0.55);font-size:13px;}
        .inp-login:focus{
          background:rgba(255,255,255,0.92);
          border-color:rgba(25,118,210,0.45);
          box-shadow:0 0 0 3px rgba(25,118,210,0.12),inset 0 1px 0 rgba(255,255,255,0.90);
        }

        .btn-login{
          width:100%;
          background-image:url('/AZUL.png');
          background-size:cover;
          background-position:center;
          border:1.5px solid rgba(100,180,255,0.50);
          border-top:2px solid rgba(180,220,255,0.70);
          border-radius:16px;
          color:white;
          font-size:16px;
          font-weight:800;
          font-family:'DM Sans',system-ui,sans-serif;
          padding:15px 20px;
          cursor:pointer;
          letter-spacing:0.5px;
          text-shadow:0 1px 3px rgba(0,40,120,0.40);
          box-shadow:0 5px 22px rgba(25,118,210,0.45),inset 0 1px 0 rgba(255,255,255,0.25);
          transition:all 0.2s ease;
          position:relative;overflow:hidden;
        }
        .btn-login::before{
          content:"";position:absolute;top:0;left:0;right:0;height:45%;
          background:linear-gradient(180deg,rgba(255,255,255,0.22) 0%,transparent 100%);
          border-radius:16px 16px 0 0;pointer-events:none;
        }
        .btn-login:hover:not(:disabled){
          transform:translateY(-2px);
          box-shadow:0 8px 28px rgba(25,118,210,0.60),inset 0 1px 0 rgba(255,255,255,0.30);
          filter:brightness(1.08);
        }
        .btn-login:active{transform:scale(0.98);}
        .btn-login:disabled{opacity:0.65;cursor:not-allowed;}

.hint-box{
          background:rgba(255,255,255,0.55);
          border:1px solid rgba(180,210,240,0.50);
          border-radius:12px;
          padding:10px 14px;
        }

        .divider{
          display:flex;align-items:center;gap:10px;
          color:#6b8aaa;font-size:11px;font-weight:600;
        }
        .divider::before,.divider::after{
          content:"";flex:1;height:1px;
          background:linear-gradient(90deg,transparent,rgba(100,150,200,0.25),transparent);
        }
      `}</style>

      {/* Estrellas de fondo */}
      {([[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],
        [15,70,4,3.2,0.3],[50,55,3,4.5,1.5],[90,65,5,3,0.7],[35,85,3,2.5,2],
        [72,20,4,3.8,1],[5,40,3,4.2,0.4],[45,15,5,3.5,1.8],[88,80,3,2.8,0.6]
      ] as number[][]).map(([x,y,r,d,delay],i)=>(
        <div key={i} style={{
          position:"fixed",borderRadius:"50%",background:"white",pointerEvents:"none",
          left:x+"%",top:y+"%",width:r+"px",height:r+"px",
          opacity:0.35,
          animation:`twinkle ${d}s ease-in-out infinite`,
          animationDelay:delay+"s"
        }}/>
      ))}

      {/* Contenido */}
      <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>

        {/* Logo flotante */}
        <div style={{marginBottom:24,animation:"float 3.5s ease-in-out infinite",filter:"drop-shadow(0 8px 24px rgba(25,118,210,0.30))"}}>
          <Image src="/logo.png" alt="AgroGestión PRO" width={200} height={80} priority style={{objectFit:"contain"}}/>
        </div>

        {/* Subtítulo */}
        <div style={{marginBottom:24,textAlign:"center"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#1e3a5f",letterSpacing:"0.25em",textTransform:"uppercase",
            background:"rgba(255,255,255,0.60)",backdropFilter:"blur(8px)",
            border:"1px solid rgba(255,255,255,0.80)",borderRadius:20,
            padding:"5px 16px",display:"inline-block",
            boxShadow:"0 2px 8px rgba(20,80,160,0.10)"}}>
            Gestión inteligente · Decisiones que rinden
          </div>
        </div>

        {/* Card login */}
        <div className="login-card" style={{width:"100%",padding:"32px 28px"}}>

          {/* Header card */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
            <div style={{
              width:42,height:42,borderRadius:"50%",
              backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
              border:"2px solid rgba(180,220,255,0.80)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,
              boxShadow:"0 3px 12px rgba(25,118,210,0.40)",
              flexShrink:0
            }}>
              🌾
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:"#0a1a3a",lineHeight:1.1}}>Bienvenido</div>
              <div style={{fontSize:12,color:"#4a6a8a",fontWeight:600,marginTop:2}}>Ingresá a tu cuenta AgroGestión PRO</div>
            </div>
          </div>

          {/* Campos */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Email */}
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:17,zIndex:2,pointerEvents:"none"}}>
                👤
              </div>
              <input
                type="email"
                placeholder="Email de acceso"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key==="Enter" && login()}
                className="inp-login"
              />
            </div>

            {/* Password */}
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:17,zIndex:2,pointerEvents:"none"}}>
                🔑
              </div>
              <input
                type="password"
                placeholder="Clave de acceso"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key==="Enter" && login()}
                className="inp-login"
              />
            </div>

            {/* Hint socios */}
            <div className="hint-box">
              <div style={{fontSize:12,color:"#4a6a8a",fontWeight:500,lineHeight:1.5}}>
                💡 <strong style={{color:"#1565c0"}}>Socio / familiar:</strong> agregá <strong style={{color:"#1976d2"}}>-B</strong>, <strong style={{color:"#1976d2"}}>-C</strong>, <strong style={{color:"#1976d2"}}>-D</strong>... al final de tu clave
              </div>
            </div>

            {/* Mensaje */}
            {msg && (
              <div style={{
                padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:700,textAlign:"center",
                background:msg.includes("Conectando")||loading?"rgba(25,118,210,0.10)":"rgba(220,38,38,0.08)",
                border:`1px solid ${msg.includes("Conectando")||loading?"rgba(25,118,210,0.25)":"rgba(220,38,38,0.20)"}`,
                color:msg.includes("Conectando")||loading?"#1565c0":"#dc2626",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8
              }}>
                {loading
                  ? <><div style={{width:14,height:14,border:"2px solid #1565c0",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/> Conectando...</>
                  : <>{msg.includes("✅")?"✅":"⚠️"} {msg}</>
                }
              </div>
            )}

            {/* Botón */}
            <button
              onClick={login}
              disabled={loading}
              className="btn-login"
              style={{marginTop:4}}
            >
              {loading
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.8)",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>
                    Ingresando...
                  </span>
                : "Ingresar →"
              }
            </button>

            <div className="divider">o</div>

            {/* Olvidé clave */}
            <button
              style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:600,
                textAlign:"center",padding:"4px",transition:"color 0.15s"}}
              onMouseOver={e=>(e.currentTarget.style.color="#1565c0")}
              onMouseOut={e=>(e.currentTarget.style.color="#4a6a8a")}
            >
              ¿Olvidaste tu clave?
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{marginTop:20,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(30,58,90,0.65)",fontWeight:600,letterSpacing:"0.15em"}}>
            © AgroGestión PRO 2.8
          </div>
        </div>
      </div>
    </div>
  );
}

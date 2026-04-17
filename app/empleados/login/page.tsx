"use client";
import { useState } from "react";
import Image from "next/image";

export default function EmpleadosLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const login = async () => {
    if (!email || !password) { setError("Completá usuario y contraseña"); return; }
    setLoading(true); setError("");
    try {
      const sb = await getSB();
      const { data, error: authError } = await sb.auth.signInWithPassword({ email, password });
      if (authError || !data.user) { setError("Usuario o contraseña incorrectos"); setLoading(false); return; }
      const { data: u } = await sb.from("usuarios").select("tipo").eq("auth_id", data.user.id).single();
      if (!u) { setError("Usuario no registrado en el sistema"); setLoading(false); return; }
      if (u.tipo !== "empleado") { setError("Acceso denegado. Usá el login general de AgroGestión."); setLoading(false); return; }
      window.location.href = "/empleado";
    } catch { setError("Error de conexión. Intentá de nuevo."); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",padding:"20px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .inp-l{background:rgba(255,255,255,0.80);border:1.5px solid rgba(180,210,240,0.60);border-radius:12px;padding:13px 16px;font-size:14px;color:#1a2a4a;width:100%;box-sizing:border-box;transition:all 0.18s;font-family:'DM Sans',system-ui;}
        .inp-l::placeholder{color:rgba(80,120,160,0.50);}
        .inp-l:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.45);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.12);}
        .login-card{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.95);border-radius:24px;box-shadow:0 20px 60px rgba(20,80,160,0.18),inset 0 2px 0 rgba(255,255,255,1);animation:fadeIn 0.35s ease;}
        .bbtn-l{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:14px;color:white;font-weight:800;font-size:15px;cursor:pointer;padding:14px;width:100%;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 4px 16px rgba(25,118,210,0.40);transition:all 0.18s;}
        .bbtn-l:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08);}
        .bbtn-l:disabled{opacity:0.7;cursor:not-allowed;}
        .logo-float{animation:float 4s ease-in-out infinite;}
      `}</style>

      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div className="logo-float" style={{display:"inline-block"}}>
            <Image src="/logo.png" alt="AgroGestión PRO" width={160} height={56} style={{objectFit:"contain",filter:"drop-shadow(0 4px 16px rgba(25,118,210,0.25))"}}/>
          </div>
        </div>

        <div className="login-card" style={{padding:"32px 28px"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:40,marginBottom:10}}>👷</div>
            <h1 style={{fontSize:22,fontWeight:800,color:"#0d2137",margin:0}}>Portal Empleados</h1>
            <p style={{fontSize:13,color:"#6b8aaa",margin:"6px 0 0",fontWeight:500}}>Ingresá con tus credenciales de acceso</p>
          </div>

          {error&&<div style={{marginBottom:16,padding:"10px 14px",borderRadius:10,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.22)",color:"#dc2626",fontSize:13,fontWeight:600}}>⚠️ {error}</div>}

          <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Email / Usuario</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="tu@email.com" className="inp-l"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Contraseña</label>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" className="inp-l" style={{paddingRight:44}}/>
                <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#6b8aaa"}}>{showPass?"🙈":"👁️"}</button>
              </div>
            </div>
          </div>

          <button onClick={login} disabled={loading} className="bbtn-l">
            {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span style={{width:18,height:18,border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"white",borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite"}}/>Verificando...</span>:"Ingresar al Panel →"}
          </button>

          <div style={{textAlign:"center",marginTop:20,paddingTop:16,borderTop:"1px solid rgba(0,60,140,0.08)"}}>
            <p style={{fontSize:12,color:"#6b8aaa",margin:0}}>¿No tenés acceso? Contactá a tu empleador</p>
            <button onClick={()=>window.location.href="/login"} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#1565c0",fontWeight:600,marginTop:4}}>→ Login general de AgroGestión</button>
          </div>
        </div>
        <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.15em",marginTop:20}}>© AgroGestión PRO · Portal Empleados</p>
      </div>
    </div>
  );
}

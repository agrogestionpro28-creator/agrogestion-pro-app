"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";
import ChatFlotante from "@/components/ChatFlotante/ChatFlotante";

const modulos = [
  { href: "/productor/lotes",      label: "Lotes y Cultivos", sub: "Propio / Alquilado",  img: "/mod-lotes.png",      icon: "🌾" },
  { href: "/productor/stock",      label: "Stock",            sub: "Granos y cereales",   img: "/mod-stock.png",      icon: "🏗️" },
  { href: "/productor/finanzas",   label: "Finanzas",         sub: "Tesorería PRO",       img: "/mod-finanzas.png",   icon: "💰" },
  { href: "/productor/maquinaria", label: "Maquinarias",      sub: "Equipos",             img: "/mod-maquinaria.png", icon: "🚜" },
  { href: "/productor/hacienda",   label: "Hacienda",         sub: "Ganadería",           img: "/mod-hacienda.png",   icon: "🐄" },
  { href: "/productor/documentos", label: "Documentos",       sub: "Archivos",            img: "/mod-documentos.png", icon: "📁" },
  { href: "/productor/margen",     label: "Margen Bruto",     sub: "Rentabilidad · MB",   img: "/mod-mb.png",         icon: "📊" },
  { href: "/productor/otros",      label: "Otros",            sub: "Más opciones",        img: "/mod-otros.png",      icon: "⚙️" },
];

type Stats = { hectareas: number; stock: number; hacienda: number; alertas: number; saldo: number };

export default function ProductorDashboard() {
  const [nombre, setNombre] = useState("");
  const [campana, setCampana] = useState("");
  const [empresaId, setEmpresaId] = useState<string>("");
  const [usuarioId, setUsuarioId] = useState<string>("");
  const [stats, setStats] = useState<Stats>({ hectareas: 0, stock: 0, hacienda: 0, alertas: 0, saldo: 0 });
  const [showAlertas, setShowAlertas] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [letraSocio, setLetraSocio] = useState("");

  useEffect(() => {
    setMounted(true);
    const init = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("id,nombre").eq("auth_id", user.id).single();

      // Guardar usuarioId para el chat
      if (u) setUsuarioId(u.id);

      const socioNombre = localStorage.getItem("socio_nombre");
      const socioLetra = localStorage.getItem("socio_letra");
      if (socioNombre) { setNombre(socioNombre); setLetraSocio(socioLetra ?? ""); }
      else if (u) setNombre(u.nombre);

      const campanaId = localStorage.getItem("campana_id");
      if (campanaId) {
        const { data: c } = await sb.from("campanas").select("nombre").eq("id", campanaId).single();
        if (c) setCampana(c.nombre);
      }

      const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u?.id).maybeSingle();
      if (emp) {
        setEmpresaId(emp.id);
        if (campanaId) {
          const [lotes, hacienda] = await Promise.all([
            sb.from("lotes").select("hectareas").eq("empresa_id", emp.id).eq("campana_id", campanaId),
            sb.from("hacienda_categorias").select("cantidad").eq("empresa_id", emp.id),
          ]);
          const totalHa = lotes.data?.reduce((a, l) => a + (l.hectareas ?? 0), 0) ?? 0;
          const totalHacienda = hacienda.data?.reduce((a, h) => a + (h.cantidad ?? 0), 0) ?? 0;
          setStats({ hectareas: totalHa, stock: 0, hacienda: totalHacienda, alertas: 0, saldo: 0 });
        }
      }
    };
    init();
  }, []);

  const salir = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    localStorage.removeItem("socio_nombre"); localStorage.removeItem("socio_letra"); localStorage.removeItem("socio_permisos");
    await sb.auth.signOut(); window.location.href = "/login";
  };

  const saludo = () => { const h = new Date().getHours(); if (h < 12) return "Buenos días"; if (h < 19) return "Buenas tardes"; return "Buenas noches"; };

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
      backgroundImage: "url('/FON.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes shine { 0%{left:-60%} 100%{left:130%} }
        @keyframes twinkle { 0%,100%{opacity:0.25;transform:scale(0.8)} 50%{opacity:0.85;transform:scale(1.2)} }

        .topbar-dash {
          background-image: url('/FON.png'); background-size: cover; background-position: top center;
          border-bottom: 1px solid rgba(255,255,255,0.40); box-shadow: 0 2px 20px rgba(20,80,160,0.14); position: relative;
        }
        .topbar-dash::before { content:""; position:absolute; inset:0; background: rgba(255,255,255,0.32); pointer-events:none; }
        .topbar-dash > * { position:relative; z-index:1; }

        .mod-card {
          background-image: url('/FON.png'); background-size: cover; background-position: center;
          border: 1.5px solid rgba(255,255,255,0.90); border-top: 2px solid rgba(255,255,255,1);
          border-radius: 20px; box-shadow: 0 8px 28px rgba(20,80,160,0.15), inset 0 2px 0 rgba(255,255,255,0.90);
          position: relative; overflow: hidden; cursor: pointer;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .mod-card::before { content:""; position:absolute; inset:0; background: rgba(255,255,255,0.52); pointer-events:none; z-index:0; transition: background 0.22s; }
        .mod-card::after { content:""; position:absolute; top:0;left:0;right:0;height:40%; background: linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%); border-radius:20px 20px 0 0; pointer-events:none; z-index:1; }
        .mod-card > * { position:relative; z-index:2; }
        .mod-card:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 16px 40px rgba(20,80,160,0.22); }
        .mod-card:hover::before { background: rgba(255,255,255,0.72); }
        .mod-card:active { transform: scale(0.98); }

        .mod-img-wrap { position: relative; height: 130px; overflow: hidden; border-radius: 14px 14px 0 0; }
        .mod-img-wrap img { transition: transform 0.35s ease; object-fit: cover; }
        .mod-card:hover .mod-img-wrap img { transform: scale(1.07); }
        .mod-img-wrap::after { content:""; position:absolute; inset:0; background: linear-gradient(180deg, transparent 40%, rgba(255,255,255,0.60) 100%); }

        .stats-card {
          background-image: url('/FON.png'); background-size: cover; background-position: center;
          border: 1.5px solid rgba(255,255,255,0.90); border-top: 2px solid rgba(255,255,255,1);
          border-radius: 20px; box-shadow: 0 6px 24px rgba(20,80,160,0.13), inset 0 2px 0 rgba(255,255,255,0.90);
          position: relative; overflow: hidden;
        }
        .stats-card::before { content:""; position:absolute; inset:0; background: rgba(255,255,255,0.68); border-radius:20px; pointer-events:none; z-index:0; }
        .stats-card > * { position:relative; z-index:1; }

        .stat-item {
          background-image: url('/FON.png'); background-size: cover; background-position: center;
          border: 1.5px solid rgba(255,255,255,0.88); border-radius: 14px;
          position: relative; overflow: hidden; padding: 14px 16px; flex: 1; min-width: 110px;
          box-shadow: 0 3px 12px rgba(20,80,160,0.10);
        }
        .stat-item::before { content:""; position:absolute; inset:0; background: rgba(255,255,255,0.68); border-radius:14px; pointer-events:none; }
        .stat-item > * { position:relative; }

        .bell-btn { width:38px; height:38px; border-radius:12px; background: rgba(255,255,255,0.70); border: 1.5px solid rgba(255,255,255,0.92); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.18s; box-shadow: 0 2px 8px rgba(20,80,160,0.10); position:relative; }
        .bell-btn:hover { background:rgba(255,255,255,0.95); transform:translateY(-1px); }

        .alertas-panel {
          background-image: url('/FON.png'); background-size: cover; background-position: center;
          position:fixed; right:0; top:0; height:100vh; width:300px;
          z-index:50; border-left:1.5px solid rgba(255,255,255,0.70);
          box-shadow:-8px 0 32px rgba(20,80,160,0.18); overflow-y:auto;
          animation: fadeIn 0.25s ease;
        }
        .alertas-panel::before { content:""; position:absolute; inset:0; background:rgba(255,255,255,0.78); pointer-events:none; }
        .alertas-panel > * { position:relative; z-index:1; }

        .bbtn { background-image:url('/AZUL.png'); background-size:cover; background-position:center; border:1.5px solid rgba(100,180,255,0.50); border-top:2px solid rgba(180,220,255,0.70); border-radius:14px; color:white; font-weight:800; font-size:13px; cursor:pointer; padding:10px 18px; box-shadow:0 4px 18px rgba(25,118,210,0.45); text-shadow:0 1px 3px rgba(0,40,120,0.35); transition:all 0.18s; }
        .bbtn:hover { transform:translateY(-2px); filter:brightness(1.08); }

        .fade-in { animation: fadeIn 0.25s ease; }
        ::-webkit-scrollbar { width:3px } ::-webkit-scrollbar-thumb { background:rgba(25,118,210,0.20); border-radius:3px }
      `}</style>

      {/* Estrellas */}
      {mounted && ([[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],[15,70,4,3.2,0.3],[50,55,3,4.5,1.5],[90,65,5,3,0.7],[35,85,3,2.5,2]] as number[][]).map(([x,y,r,d,delay],i)=>(
        <div key={i} style={{position:"fixed",borderRadius:"50%",background:"white",pointerEvents:"none",left:x+"%",top:y+"%",width:r+"px",height:r+"px",opacity:0.35,animation:`twinkle ${d}s ease-in-out infinite`,animationDelay:delay+"s",zIndex:0}}/>
      ))}

      {/* TOPBAR */}
      <div className="topbar-dash" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",gap:12}}>
          <div style={{cursor:"pointer",flexShrink:0}} onClick={()=>window.location.href="/productor/dashboard"}>
            <Image src="/logo.png" alt="AgroGestión PRO" width={120} height={42} style={{objectFit:"contain"}}/>
          </div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>
                {saludo()}, <span style={{color:"#1976d2"}}>{nombre}</span>
                {letraSocio&&<span style={{fontSize:11,color:"#6b8aaa",marginLeft:4}}>({letraSocio})</span>}
              </span>
              {campana&&(
                <span style={{fontSize:12,fontWeight:600,color:"#4a6a8a",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{color:"#1976d2",fontSize:10}}>◆</span> Campaña {campana}
                </span>
              )}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.25)"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",boxShadow:"0 0 6px rgba(22,163,74,0.60)"}}/>
              <span style={{fontSize:11,fontWeight:700,color:"#16a34a"}}>Activo</span>
            </div>
            <button className="bell-btn" onClick={()=>setShowAlertas(!showAlertas)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {stats.alertas>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#dc2626",color:"white",fontSize:9,fontWeight:800,width:16,height:16,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>{stats.alertas}</span>}
            </button>
            <button onClick={salir} style={{color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>Salir ⎋</button>
          </div>
        </div>
      </div>

      {/* Panel alertas */}
      {showAlertas&&(
        <div className="alertas-panel">
          <div style={{padding:"20px 18px",borderBottom:"1px solid rgba(0,60,140,0.10)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>🔔 Alertas IA</div>
            <button onClick={()=>setShowAlertas(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:20}}>✕</button>
          </div>
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
            {stats.alertas===0?(
              <div style={{textAlign:"center",padding:"40px 16px",color:"#6b8aaa"}}>
                <div style={{fontSize:36,opacity:0.15,marginBottom:10}}>🔔</div>
                <p style={{fontSize:13,fontWeight:600}}>Sin alertas activas</p>
              </div>
            ):<p style={{fontSize:13,color:"#4a6a8a"}}>{stats.alertas} alerta(s) pendiente(s)</p>}
            <div style={{padding:"12px 14px",borderRadius:14,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",marginTop:8}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1565c0",marginBottom:3}}>◆ IA Monitor Activo</div>
              <div style={{fontSize:11,color:"#6b8aaa"}}>Analizando datos del campo en tiempo real</div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <div style={{maxWidth:1080,margin:"0 auto",padding:"24px 16px 60px",position:"relative",zIndex:1}}>
        <div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14,marginBottom:20}}>
          {modulos.map(mod=>(
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

        <div className="stats-card" style={{padding:16}}>
          <div style={{fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1.2,marginBottom:14}}>📊 Resumen de campaña</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"Hectáreas",   v:stats.hectareas+" Ha",                          icon:"🌿", color:"#2e7d32"},
              {l:"Stock granos",v:stats.stock+" Tn",                              icon:"🏗️", color:"#d97706"},
              {l:"Saldo a pagar",v:"$"+stats.saldo.toLocaleString("es-AR"),       icon:"💰", color:"#1565c0"},
              {l:"Hacienda",    v:stats.hacienda+" cab.",                          icon:"🐄", color:"#7c3aed"},
              {l:"Alertas",     v:String(stats.alertas),                           icon:"🔔", color:stats.alertas>0?"#dc2626":"#16a34a"},
            ].map(s=>(
              <div key={s.l} className="stat-item">
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <div style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</div>
                </div>
                <div style={{fontSize:22,fontWeight:800,color:s.color,lineHeight:1}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{textAlign:"center",marginTop:28,fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em"}}>
          © AgroGestión PRO 2.8
        </p>
      </div>

      {/* Escáner IA */}
      {empresaId&&<EscanerIA empresaId={empresaId}/>}

      {/* Chat flotante */}
      {empresaId&&usuarioId&&(
        <ChatFlotante
          empresaId={empresaId}
          usuarioId={usuarioId}
          usuarioNombre={nombre}
          usuarioRol="productor"
        />
      )}
    </div>
  );
}

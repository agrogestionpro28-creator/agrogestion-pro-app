"use client";
import { useState } from "react";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const login = async () => {
    setMsg("Conectando...");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message); return; }
      if (data.user) {
        const { data: u } = await sb.from("usuarios").select("rol").eq("auth_id", data.user.id).single();
        window.location.href = "/" + (u?.rol ?? "productor");
      }
    } catch (e) {
      setMsg("Error de conexion");
    }
  };
  return (
    <div>
      <h1>AgroGestion Pro 2.8</h1>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={login}>Ingresar</button>
      <p>{msg}</p>
    </div>
  );
}

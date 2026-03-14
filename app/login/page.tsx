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
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message); return; }
      if (data.user) {
        const { data: u } = await supabase.from("usuarios").select("rol").eq("auth_id", data.user.id).single();
        window.location.href = `/${u?.rol ?? "productor"}`;
      }
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0F1115", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#14171C", border: "1px solid rgba(201,162,39,0.2)", borderRadius: 12, padding: 40 }}>
        <h1 style={{ color: "#E5E7EB", textAlign: "center", marginBottom: 8 }}>AgroGestión Pro</h1>
        <p style={{ color: "#C9A227", textAlign: "center", fontSize: 12, marginBottom: 32 }}>VERSIÓN 2.8</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ background: "#0F1115", border: "1px solid #2D3139", borderRadius: 8, padding: "12px 16px", color: "#E5E7EB", fontSize: 14, outline: "none" }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ background: "#0F1115", border: "1px solid #2D3139", borderRadius: 8, padding: "12px 16px", color: "#E5E7EB", fontSize: 14, outline: "none" }}
          />
          <button
            onClick={login}
            style={{ background: "#C9A227", color: "#0F1115", fontWeight: "bold",

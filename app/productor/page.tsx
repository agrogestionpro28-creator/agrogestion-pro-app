"use client";
import { useEffect, useState } from "react";

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
  const [añoInicio, setAñoInicio] = useState(2025);
  const [añoFin, setAñoFin] = useState(2026);

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
    localStorage.setItem

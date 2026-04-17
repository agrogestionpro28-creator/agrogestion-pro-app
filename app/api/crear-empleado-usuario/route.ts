import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { email, password, empleado_id, empresa_id, nombre, permisos } = await req.json();
    if (!email || !password || !empleado_id) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    const sbAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: authData, error: authError } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Error al crear usuario" }, { status: 400 });
    }

    const authId = authData.user.id;

    await sbAdmin.from("usuarios").insert({
      auth_id: authId,
      nombre,
      email,
      tipo: "empleado",
      empresa_id,
    });

    await sbAdmin.from("empleados").update({ auth_id: authId, permisos: permisos ?? [] }).eq("id", empleado_id);

    return NextResponse.json({ success: true, auth_id: authId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error interno" }, { status: 500 });
  }
}

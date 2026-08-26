import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const name =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.email?.split("@")[0] ||
        "Criador";

      const avatarUrl =
        data.user.user_metadata?.avatar_url ||
        data.user.user_metadata?.picture ||
        null;

      try {
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            email: data.user.email || "",
            name,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      } catch (profileErr) {
        console.error("Erro ao sincronizar perfil Supabase:", profileErr);
      }

      // Redirect para a página principal — o onAuthStateChange no client 
      // vai detectar a sessão e atualizar o estado automaticamente.
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Se teve erro, redirecionar com a mensagem
    const errorMsg = error?.message
      ? encodeURIComponent(error.message)
      : "oauth_exchange_failed";
    return NextResponse.redirect(`${origin}/?auth_error=${errorMsg}`);
  }

  return NextResponse.redirect(`${origin}/?auth_error=no_code_received`);
}

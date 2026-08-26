import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

function getDynamicBaseUrl(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host");

  if (host && !host.includes("localhost")) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }

  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }

  const { origin } = new URL(request.url);
  return origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const baseUrl = getDynamicBaseUrl(request);

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

      return NextResponse.redirect(`${baseUrl}${next}`);
    }

    const errorMsg = error?.message
      ? encodeURIComponent(error.message)
      : "oauth_exchange_failed";
    return NextResponse.redirect(`${baseUrl}/?auth_error=${errorMsg}`);
  }

  return NextResponse.redirect(`${baseUrl}/?auth_error=no_code_received`);
}

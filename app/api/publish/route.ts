import { NextRequest, NextResponse } from "next/server";
import { MultiPublishRequest, SocialAccount, SocialPlatform } from "../../../lib/types/publishing";
import { publishToAllPlatforms } from "../../../lib/publishing/publisher";
import { ensureFreshAccount, rowToAccount } from "../../../lib/publishing/token-store";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/server";
import { errorMessage } from "../../../lib/publishing/http";
import type { SocialAccountRow } from "../../../lib/publishing/token-store";

const PLATFORMS: SocialPlatform[] = ["youtube", "tiktok", "instagram"];

export async function POST(req: NextRequest) {
  try {
    const body: MultiPublishRequest = await req.json();

    if (!body.title || !body.platforms || body.platforms.length === 0) {
      return NextResponse.json(
        { error: "Título e ao menos uma plataforma são obrigatórios." },
        { status: 400 }
      );
    }

    const connectedAccounts: Record<SocialPlatform, SocialAccount | undefined> = {
      youtube: undefined,
      tiktok: undefined,
      instagram: undefined,
    };

    /** Contas cuja renovação de token falhou: precisam ser reconectadas. */
    const reconnectRequired: Partial<Record<SocialPlatform, string>> = {};

    let userId: string | null = null;
    let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

    if (isSupabaseConfigured) {
      supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        userId = user.id;
        const { data: accounts } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("user_id", user.id);

        // Renova os tokens vencidos antes de gastar o upload nas plataformas.
        const fresh = await Promise.all(
          (accounts || [])
            .filter((acc: SocialAccountRow) =>
              PLATFORMS.includes(acc.platform as SocialPlatform)
            )
            .map(async (acc: SocialAccountRow) => {
              const result = await ensureFreshAccount(rowToAccount(acc), supabase);
              return { platform: acc.platform as SocialPlatform, ...result };
            })
        );

        for (const item of fresh) {
          connectedAccounts[item.platform] = item.account;
          if (item.error) reconnectRequired[item.platform] = item.error;
        }
      }
    }

    const response = await publishToAllPlatforms(body, connectedAccounts, {
      // O YouTube pode renovar o token no meio do upload; persiste o novo valor.
      onTokenRefreshed: ({ accountId, accessToken, expiresAt }) => {
        if (!supabase || !accountId) return;
        void supabase
          .from("social_accounts")
          .update({
            access_token: accessToken,
            expires_at: expiresAt ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountId);
      },
    });

    // Substitui erros genéricos por instruções de reconexão quando o token morreu.
    for (const [platform, message] of Object.entries(reconnectRequired)) {
      const key = platform as SocialPlatform;
      if (response.results[key]?.status !== "published") {
        response.results[key] = {
          platform: key,
          status: "failed",
          progress: 0,
          errorMessage: message,
        };
      }
    }

    if (isSupabaseConfigured && supabase && userId) {
      const { error } = await supabase.from("publications").insert({
        user_id: userId,
        title: body.title,
        description: body.description || "",
        hashtags: body.hashtags,
        video_url: body.videoUrl || "",
        status: response.success ? "published" : "failed",
        results: response.results,
      });

      if (error) {
        // O histórico é secundário: não invalida uma publicação bem-sucedida.
        console.error("Falha ao gravar o histórico de publicação:", error.message);
      }
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Publish API Error:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Erro durante a publicação multi-plataforma.") },
      { status: 500 }
    );
  }
}

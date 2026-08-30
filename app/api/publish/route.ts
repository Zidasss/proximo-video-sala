import { NextRequest, NextResponse } from "next/server";
import type {
  MultiPublishRequest,
  SocialAccount,
  SocialPlatform,
} from "../../../lib/types/publishing";
import { publishToAllPlatforms } from "../../../lib/publishing/publisher";
import {
  ensureFreshAccount,
  rowToAccount,
  type SocialAccountRow,
} from "../../../lib/publishing/token-store";
import {
  createClient,
  isSupabaseConfigured,
  supabaseUrl,
} from "../../../lib/supabase/server";
import { errorMessage } from "../../../lib/publishing/http";
import {
  isAllowedPublishingVideoUrl,
  isOwnedUploadPath,
  PUBLISH_UPLOAD_BUCKET,
  storagePathFromPublicVideoUrl,
} from "../../../lib/publishing/upload-policy";

const PLATFORMS: SocialPlatform[] = ["youtube", "tiktok", "instagram"];

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  let temporaryUploadPath = "";
  let authenticatedUserId = "";
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    const input = (await req.json().catch(() => null)) as MultiPublishRequest | null;
    if (!input || typeof input.title !== "string" || !input.title.trim()) {
      return jsonError("Informe um título para publicar.", 400);
    }
    const requestedPlatforms = Array.isArray(input.platforms)
      ? [...new Set(input.platforms)].filter((platform): platform is SocialPlatform =>
          PLATFORMS.includes(platform as SocialPlatform),
        )
      : [];
    if (!requestedPlatforms.length) {
      return jsonError("Selecione ao menos uma plataforma válida.", 400);
    }
    if (!input.videoUrl) return jsonError("Envie um vídeo antes de publicar.", 400);

    const body: MultiPublishRequest = {
      ...input,
      title: input.title.trim().slice(0, 100),
      description:
        typeof input.description === "string" ? input.description.slice(0, 5_000) : "",
      hashtags: Array.isArray(input.hashtags)
        ? input.hashtags.filter((tag): tag is string => typeof tag === "string").slice(0, 30)
        : [],
      platforms: requestedPlatforms,
      visibility: ["public", "unlisted", "private"].includes(input.visibility)
        ? input.visibility
        : "private",
    };

    const connectedAccounts: Record<SocialPlatform, SocialAccount | undefined> = {
      youtube: undefined,
      tiktok: undefined,
      instagram: undefined,
    };
    const reconnectRequired: Partial<Record<SocialPlatform, string>> = {};

    if (isSupabaseConfigured) {
      supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return jsonError("Entre na sua conta para publicar nas redes.", 401);
      }
      authenticatedUserId = user.id;

      if (!isAllowedPublishingVideoUrl(body.videoUrl, supabaseUrl)) {
        return jsonError("A origem do vídeo não é autorizada para publicação.", 400);
      }
      const urlStoragePath = storagePathFromPublicVideoUrl(body.videoUrl);
      if (!urlStoragePath || !isOwnedUploadPath(urlStoragePath, user.id)) {
        return jsonError("Este vídeo não pertence à sua área de upload.", 403);
      }
      if (body.uploadPath) {
        if (body.uploadPath !== urlStoragePath) {
          return jsonError("O arquivo enviado não corresponde ao vídeo publicado.", 400);
        }
        temporaryUploadPath = body.uploadPath;
      }

      const { data: accounts, error: accountsError } = await supabase
        .from("social_accounts")
        .select("*")
        .eq("user_id", user.id);
      if (accountsError) {
        console.error("Falha ao carregar contas sociais:", accountsError.message);
        return jsonError("Não foi possível carregar suas contas conectadas.", 500);
      }

      const fresh = await Promise.all(
        (accounts || [])
          .filter((account: SocialAccountRow) =>
            PLATFORMS.includes(account.platform as SocialPlatform),
          )
          .map(async (account: SocialAccountRow) => {
            const result = await ensureFreshAccount(rowToAccount(account), supabase!);
            return { platform: account.platform as SocialPlatform, ...result };
          }),
      );
      for (const item of fresh) {
        connectedAccounts[item.platform] = item.account;
        if (item.error) reconnectRequired[item.platform] = item.error;
      }
    }

    const response = await publishToAllPlatforms(body, connectedAccounts, {
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

    if (supabase && authenticatedUserId) {
      const { error } = await supabase.from("publications").insert({
        user_id: authenticatedUserId,
        title: body.title,
        description: body.description || "",
        hashtags: body.hashtags,
        video_url: body.videoUrl,
        status: response.success ? "published" : "failed",
        results: response.results,
      });
      if (error)
        console.error("Falha ao gravar o histórico de publicação:", error.message);
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Publish API Error:", error);
    return jsonError(
      errorMessage(error, "Erro durante a publicação multi-plataforma."),
      500,
    );
  } finally {
    if (
      supabase &&
      authenticatedUserId &&
      isOwnedUploadPath(temporaryUploadPath, authenticatedUserId)
    ) {
      const { error } = await supabase.storage
        .from(PUBLISH_UPLOAD_BUCKET)
        .remove([temporaryUploadPath]);
      if (error)
        console.error("Falha ao remover vídeo temporário:", error.message);
    }
  }
}

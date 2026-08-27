import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  expiresInToTimestamp,
  isExpired,
  refreshGoogleAccessToken,
} from "../lib/publishing/oauth.ts";
import {
  createState,
  nonceMatches,
  parseState,
} from "../lib/publishing/oauth-state.ts";
import { discoverInstagramTargets } from "../lib/publishing/meta.ts";
import { ensureFreshAccount, rowToAccount } from "../lib/publishing/token-store.ts";
import { publishToInstagramReels } from "../lib/publishing/instagram.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => handler(String(url), init);
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("isExpired renews ahead of time and accepts seconds or milliseconds", () => {
  assert.equal(isExpired(undefined), false, "sem validade conhecida, não renova");
  assert.equal(isExpired(Date.now() + 60 * 60 * 1000), false);
  assert.equal(isExpired(Date.now() + 60 * 1000), true, "renova dentro da margem de 5 min");
  assert.equal(isExpired(Date.now() - 1000), true);
  // Epoch em segundos (formato que algumas APIs devolvem).
  assert.equal(isExpired(Math.floor(Date.now() / 1000) - 10), true);
});

test("expiresInToTimestamp converts the OAuth expires_in seconds to an epoch", () => {
  const ts = expiresInToTimestamp(3600);
  assert.ok(ts > Date.now() + 3500 * 1000);
  assert.equal(expiresInToTimestamp(undefined), undefined);
});

test("OAuth state round-trips and rejects a forged nonce", () => {
  const { state, nonce } = createState("youtube", "/perfil");
  const parsed = parseState(state);

  assert.equal(parsed.platform, "youtube");
  assert.equal(parsed.next, "/perfil");
  assert.ok(nonceMatches(parsed.nonce, nonce));
  assert.equal(nonceMatches(parsed.nonce, "outro-nonce"), false);
  assert.equal(parseState("nao-e-base64url-valido"), null);
});

test("Instagram discovery scans every page, not just the first one", async () => {
  mockFetch(async (url) => {
    if (url.includes("me/accounts")) {
      return jsonResponse({
        data: [
          // Página sem Instagram vinculado: a versão antiga parava aqui.
          { id: "page-1", name: "Página sem Instagram", access_token: "page-1-token" },
          {
            id: "page-2",
            name: "Página do Klip",
            access_token: "page-2-token",
            instagram_business_account: {
              id: "ig-123",
              username: "klip.app",
              profile_picture_url: "https://cdn.example/pic.jpg",
            },
          },
        ],
      });
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const targets = await discoverInstagramTargets("user-token");

  assert.equal(targets.length, 1);
  assert.equal(targets[0].igUserId, "ig-123");
  assert.equal(targets[0].username, "klip.app");
  // O token guardado precisa ser o da Página, não o do usuário.
  assert.equal(targets[0].pageAccessToken, "page-2-token");
});

test("Google refresh exchanges the refresh token for a dated access token", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  mockFetch(async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.match(String(init.body), /grant_type=refresh_token/);
    return jsonResponse({ access_token: "novo-token", expires_in: 3599 });
  });

  const fresh = await refreshGoogleAccessToken("refresh-abc");

  assert.equal(fresh.accessToken, "novo-token");
  assert.ok(fresh.expiresAt > Date.now());
  // O Google não reemite o refresh token: o antigo precisa ser preservado.
  assert.equal(fresh.refreshToken, "refresh-abc");
});

test("ensureFreshAccount renews an expired YouTube token and persists it", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  mockFetch(async () => jsonResponse({ access_token: "token-renovado", expires_in: 3600 }));

  const updates = [];
  const supabase = {
    from() {
      return {
        update(values) {
          return { eq: async (_col, id) => (updates.push({ id, values }), { error: null }) };
        },
      };
    },
  };

  const account = rowToAccount({
    id: "acc-1",
    user_id: "user-1",
    platform: "youtube",
    account_name: "Canal Teste",
    access_token: "token-velho",
    refresh_token: "refresh-abc",
    expires_at: Date.now() - 1000,
  });

  const result = await ensureFreshAccount(account, supabase);

  assert.equal(result.refreshed, true);
  assert.equal(result.account.accessToken, "token-renovado");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "acc-1");
  assert.equal(updates[0].values.access_token, "token-renovado");
  assert.equal(updates[0].values.status, "connected");
});

test("ensureFreshAccount marks the account as expired when renewal fails", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  mockFetch(async () => jsonResponse({ error: "invalid_grant" }, { status: 400 }));

  const updates = [];
  const supabase = {
    from() {
      return {
        update(values) {
          return { eq: async (_col, id) => (updates.push({ id, values }), { error: null }) };
        },
      };
    },
  };

  const result = await ensureFreshAccount(
    rowToAccount({
      id: "acc-2",
      user_id: "user-1",
      platform: "youtube",
      account_name: "Canal Teste",
      access_token: "token-velho",
      refresh_token: "refresh-invalido",
      expires_at: Date.now() - 1000,
    }),
    supabase
  );

  assert.equal(result.refreshed, false);
  assert.equal(result.account.status, "expired");
  assert.match(result.error, /renovar o token/i);
  assert.equal(updates[0].values.status, "expired");
});

test("Instagram publisher refuses a video URL the Meta servers could never fetch", async () => {
  const result = await publishToInstagramReels({
    accessToken: "page-token-real",
    instagramUserId: "ig-123",
    title: "Reel de teste",
    videoUrl: "http://localhost:3000/video.mp4",
  });

  assert.equal(result.status, "failed");
  assert.match(result.errorMessage, /HTTPS/i);
});

test("Instagram publisher requires the Business account id", async () => {
  const result = await publishToInstagramReels({
    accessToken: "page-token-real",
    title: "Reel sem conta vinculada",
    videoUrl: "https://cdn.example/video.mp4",
  });

  assert.equal(result.status, "failed");
  assert.match(result.errorMessage, /Instagram Business/i);
});

test("Instagram publisher creates a container, waits for FINISHED, then publishes", async () => {
  const calls = [];

  mockFetch(async (url, init) => {
    calls.push(url);

    if (url.includes("content_publishing_limit")) {
      return jsonResponse({ data: [{ quota_usage: 3, config: { quota_total: 50 } }] });
    }
    if (url.includes("/media_publish")) {
      return jsonResponse({ id: "media-999" });
    }
    if (url.includes("/media?") && init?.method === "POST") {
      return jsonResponse({ id: "container-1" });
    }
    if (url.includes("container-1")) {
      return jsonResponse({ status_code: "FINISHED" });
    }
    if (url.includes("media-999")) {
      return jsonResponse({ permalink: "https://www.instagram.com/reel/ABC123/" });
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const result = await publishToInstagramReels({
    accessToken: "page-token-real",
    instagramUserId: "ig-123",
    title: "Novidades do Klip",
    hashtags: ["#reels", "novidade"],
    videoUrl: "https://cdn.example/video.mp4",
  });

  assert.equal(result.status, "published");
  assert.equal(result.postId, "media-999");
  assert.equal(result.postUrl, "https://www.instagram.com/reel/ABC123/");
  assert.ok(calls.some((c) => c.includes("media_type=REELS")));
});

test("Instagram publisher surfaces the Meta error message instead of a generic failure", async () => {
  mockFetch(async (url) => {
    if (url.includes("content_publishing_limit")) {
      return jsonResponse({ data: [{ quota_usage: 0, config: { quota_total: 50 } }] });
    }
    return jsonResponse({
      error: { message: "The video file is too large", code: 2207026 },
    });
  });

  const result = await publishToInstagramReels({
    accessToken: "page-token-real",
    instagramUserId: "ig-123",
    title: "Reel grande demais",
    videoUrl: "https://cdn.example/video.mp4",
  });

  assert.equal(result.status, "failed");
  assert.match(result.errorMessage, /video file is too large/);
  assert.match(result.errorMessage, /2207026/);
});

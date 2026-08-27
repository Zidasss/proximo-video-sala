# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support...

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

---

# Publicação multi-plataforma (YouTube, Instagram, TikTok)

O Klip edita o vídeo no navegador e publica o mesmo arquivo em várias
plataformas de uma vez. Esta seção descreve como ligar as APIs reais.

## Como o fluxo funciona

```
Editor  →  POST /api/upload           (Supabase Storage → URL pública HTTPS)
        →  POST /api/publish          (dispara as plataformas em paralelo)
              ├─ YouTube   upload resumível em blocos (Data API v3)
              ├─ Instagram container REELS → polling → media_publish (Graph API)
              └─ TikTok    PULL_FROM_URL (Content Posting API)
```

Antes de qualquer envio, `/api/publish` chama `ensureFreshAccount()`
(`lib/publishing/token-store.ts`), que renova os access tokens vencidos e grava
os novos em `social_accounts`. Se a renovação falhar, a conta é marcada como
`expired` e a UI pede reconexão em vez de estourar um 401 no meio do upload.

## Configuração

Copie `.env.example` para `.env.local` e preencha as credenciais. Sem elas o app
continua funcionando em **modo demonstração**: as publicações são simuladas e
devolvem IDs falsos (também forçado por `ENABLE_PUBLISH_MOCK=true`).

### YouTube — Google Cloud Console

1. Crie um projeto e ative a **YouTube Data API v3**.
2. Na tela de consentimento OAuth, adicione os escopos `youtube.upload` e
   `youtube.readonly`.
3. Crie um **ID do cliente OAuth → Aplicativo da Web** e registre o redirect URI
   `https://SEU-DOMINIO/api/auth/callback/youtube`.
4. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

O consentimento é pedido com `access_type=offline&prompt=consent` porque o
access token do Google dura **1 hora** — sem o refresh token o canal
desconectaria sozinho antes do próximo post.

> **Limite dos apps não verificados:** enquanto o app não passa pela verificação
> do Google e pela auditoria da YouTube API, todo vídeo enviado é forçado para
> `private`, independentemente da visibilidade escolhida na UI.

### Instagram Reels — Meta for Developers

1. Crie um app do tipo **Business** e adicione os produtos **Facebook Login** e
   **Instagram Graph API**.
2. Permissões: `instagram_basic`, `instagram_content_publish`,
   `pages_show_list`, `pages_read_engagement`, `business_management`.
3. Registre o redirect URI `https://SEU-DOMINIO/api/auth/callback/instagram`.
4. Preencha `META_APP_ID` e `META_APP_SECRET`.

A conta que vai publicar precisa ser **Business ou Creator**, estar **vinculada
a uma Página do Facebook**, e quem autoriza precisa ser admin dessa Página. No
callback o app troca o token curto por um **token de 60 dias**, varre todas as
Páginas do usuário procurando a conta Instagram vinculada e guarda o **Page
access token** — é ele, e não o token de usuário, que a Content Publishing API
aceita em `POST /{ig-user-id}/media`.

> O Instagram **não aceita upload de arquivo**: a Meta baixa o vídeo da URL que
> você informar. Por isso o arquivo precisa estar publicado em HTTPS acessível
> pela internet (o bucket `klip-videos` do Supabase Storage resolve isso) antes
> de `/api/publish` ser chamado. Limites: 50 publicações por 24h, 3s–15min de
> duração, proporção recomendada 9:16.

### TikTok — TikTok for Developers

Escopos `user.info.basic,video.upload,video.publish` e redirect URI
`https://SEU-DOMINIO/api/auth/callback/tiktok`. Preencha `TIKTOK_CLIENT_KEY` e
`TIKTOK_CLIENT_SECRET`.

## Banco de dados

Aplique as migrations em `supabase/migrations/` na ordem numérica. A
`002_token_lifecycle.sql` adiciona os índices usados pelas rotas de publicação e
documenta o campo `expires_at` (epoch em **milissegundos**).

## Segurança do OAuth

O parâmetro `state` carrega um nonce que também é gravado num cookie HttpOnly
(`klip_oauth_state`) e conferido no callback. Sem essa checagem, um terceiro
poderia forjar um callback e vincular a própria conta social à sessão da vítima.
O `next` do retorno é validado para aceitar apenas caminhos relativos, evitando
open redirect.

## Arquivos relevantes

| Arquivo | Responsabilidade |
| --- | --- |
| `lib/publishing/oauth.ts` | Credenciais, expiração e renovação de tokens |
| `lib/publishing/oauth-state.ts` | `state` do OAuth com proteção CSRF |
| `lib/publishing/token-store.ts` | Renova e persiste tokens antes de publicar |
| `lib/publishing/meta.ts` | Descoberta da conta Instagram Business e cotas |
| `lib/publishing/youtube.ts` | Upload resumível em blocos de Shorts |
| `lib/publishing/instagram.ts` | Container de Reels, polling e publicação |
| `lib/publishing/publisher.ts` | Orquestra o multi-post em paralelo |

Os testes de integração ficam em `tests/social-apis.test.mjs` e rodam com
`npm test` (usam `fetch` mockado, nenhuma chamada real é feita).

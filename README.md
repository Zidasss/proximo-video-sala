# KLIPAPP

O **KLIPAPP** é uma plataforma web para conversar, gravar e transformar chamadas em conteúdo pronto para publicar. O produto reúne sala privada com áudio, vídeo e compartilhamento de tela, gravação local em alta qualidade, estúdio com múltiplas câmeras, editor de clipes e publicação social em um único fluxo.

- Produção: [www.klipapp.com.br](https://www.klipapp.com.br)
- Política de privacidade: [www.klipapp.com.br/privacidade](https://www.klipapp.com.br/privacidade)
- Termos de serviço: [www.klipapp.com.br/termos](https://www.klipapp.com.br/termos)

## Recursos principais

- Salas privadas por link, código e PIN, com nomes dos participantes e reconexão de sessão.
- Chamada WebRTC com câmera, microfone, chat, compartilhamento de tela e opção de incluir áudio da tela.
- Seleção de câmera, microfone e saída de áudio, supressão de ruído, indicador de fala e diagnóstico de conexão.
- Fundo desfocado, imagem ou mídia animada, além de texto, moldura e overlays na câmera.
- Gravação local com áudio em layouts horizontal, vertical, quadrado, solo, conversa e tela compartilhada.
- Estúdio local para duas câmeras e até dois microfones, com composição visual, medidores e presets de saída.
- KLIPAPP Studio com timeline multipista, cortes, transições, áudio, textos, ilustrações, efeitos e formatos para Reels, TikTok, Shorts e YouTube.
- Radar de clipes que encontra pausas e momentos candidatos sem enviar o vídeo para análise externa.
- Biblioteca de sons e efeitos KLIPAPP Original.
- Publicação integrada para YouTube, Instagram e TikTok, quando as credenciais das plataformas estão configuradas.
- Tema claro e escuro, interface responsiva e páginas legais públicas.

Processamento de câmera, gravação e edição acontece prioritariamente no navegador. Permissão de câmera, microfone, tela e áudio continua sob controle do usuário e do próprio navegador.

## Arquitetura

| Camada | Tecnologia e responsabilidade |
| --- | --- |
| Aplicação | Next.js 16 App Router, React 19 e TypeScript |
| Interface | CSS/Tailwind, componentes reutilizáveis e Lucide |
| Chamada | PeerJS/WebRTC para mídia e canal de dados entre participantes |
| Captura e gravação | MediaDevices, MediaRecorder, Web Audio e Canvas |
| Efeitos de câmera | MediaPipe Tasks Vision e TensorFlow.js |
| Autenticação | Supabase Auth, incluindo login com Google |
| Dados e arquivos | Supabase/Postgres, RLS e Supabase Storage |
| Publicação | YouTube Data API, Instagram Graph API e TikTok Content Posting API |
| Deploy | Vercel, com domínio canônico `https://www.klipapp.com.br` |

### Superfícies da aplicação

- `/`: entrada, sala, chamada, estúdio local e ferramentas de criação.
- `/?editor=1`: KLIPAPP Studio.
- `/perfil`: conta, perfil e conexões sociais.
- `/auth/callback`: retorno do Supabase Auth para o aplicativo.
- `/privacidade` e `/termos`: documentos legais públicos.
- `/api/auth/connect/[platform]` e `/api/auth/callback/[platform]`: OAuth de publicação social.
- `/api/upload` e `/api/publish`: upload e publicação multiplataforma.

## Requisitos

- Node.js `>=22.13.0`
- npm `11.x`
- Chrome, Edge ou outro navegador moderno com suporte a WebRTC e MediaRecorder
- HTTPS em produção para câmera, microfone e compartilhamento de tela
- Projeto Supabase para autenticação, banco e storage

## Desenvolvimento local

```bash
git clone https://github.com/Zidasss/proximo-video-sala.git
cd proximo-video-sala
npm install
Copy-Item .env.example .env.local  # PowerShell
npm run dev
```

Em macOS ou Linux, use `cp .env.example .env.local`. Depois abra [localhost:3000](http://localhost:3000).

O aplicativo funciona sem credenciais sociais em modo local, mas autenticação, persistência e publicação real dependem das variáveis descritas em `.env.example`.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | inicia o Next.js em desenvolvimento |
| `npm run build` | gera e valida o build de produção |
| `npm start` | executa o build de produção |
| `npm run lint` | executa ESLint |
| `npm test` | executa a suíte de integração e regressão |
| `npm run build:sites` | gera o build alternativo com vinext |
| `npm run db:generate` | gera migrations Drizzle |

Antes de publicar uma alteração:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Configuração do Supabase

1. Crie o projeto e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Aplique, em ordem, as migrations de `supabase/migrations/`.
3. Crie o bucket público `klip-videos` para arquivos destinados às APIs sociais.
4. Em **Authentication → URL Configuration**, configure:
   - Site URL: `https://www.klipapp.com.br`
   - Redirect URL: `https://www.klipapp.com.br/auth/callback`
   - Para desenvolvimento: `http://localhost:3000/auth/callback`
5. Ative o provedor Google no Supabase se o login Google for usado.

## OAuth: login Google e YouTube são fluxos diferentes

Não misture os dois callbacks abaixo. Eles pertencem a clientes e finalidades diferentes.

### 1. Login com Google pela conta KLIPAPP

O navegador inicia o login pelo **Supabase Auth**. No cliente OAuth usado pelo provedor Google do Supabase, o URI autorizado no Google Cloud é o callback do próprio Supabase:

```text
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

No projeto atual:

```text
https://kglzsruwwapvppkpcpaz.supabase.co/auth/v1/callback
```

Depois de concluir a autenticação, o Supabase devolve o usuário ao aplicativo em:

```text
https://www.klipapp.com.br/auth/callback
```

Esse segundo endereço deve estar na lista de redirects permitidos do **Supabase**, não no lugar do callback `supabase.co` no cliente Google.

### 2. Conexão do canal e publicação no YouTube

É um OAuth separado, iniciado pelo KLIPAPP Studio. O cliente Google usado pela integração do YouTube precisa do URI:

```text
https://www.klipapp.com.br/api/auth/callback/youtube
```

As variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` deste repositório são usadas por esse fluxo de publicação. Ative a YouTube Data API v3 e solicite os escopos `youtube.upload` e `youtube.readonly`.

Enquanto o app do Google estiver em teste ou sem a auditoria exigida pela YouTube API, uploads podem ser limitados a vídeos privados.

## Publicação social

O fluxo de produção é:

```text
Editor
  -> POST /api/upload
  -> Supabase Storage (URL HTTPS pública)
  -> POST /api/publish
       -> YouTube: upload resumível
       -> Instagram: container Reels, polling e media_publish
       -> TikTok: Content Posting API
```

Os callbacks de produção são:

```text
YouTube:   https://www.klipapp.com.br/api/auth/callback/youtube
Instagram: https://www.klipapp.com.br/api/auth/callback/instagram
TikTok:    https://www.klipapp.com.br/api/auth/callback/tiktok
```

Antes de publicar, `ensureFreshAccount()` em `lib/publishing/token-store.ts` renova tokens vencidos e atualiza `social_accounts`. A proteção CSRF do OAuth usa um nonce também salvo em cookie HttpOnly.

### TikTok Content Posting API

Adicione o produto **Content Posting API** ao app, com os escopos
`user.info.basic,video.upload,video.publish` e o redirect URI
`https://www.klipapp.com.br/api/auth/callback/tiktok`. Preencha
`TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET`.

O fluxo tem quatro etapas, e pular qualquer uma delas quebra a publicação:

1. `creator_info/query` — obrigatório antes de postar. Devolve quais níveis de
   privacidade a conta aceita e se o criador desabilitou comentário, duet ou
   stitch no próprio perfil. O app respeita essas escolhas.
2. `video/init` — abre o envio e devolve `publish_id` + `upload_url`.
3. `PUT` do arquivo em blocos na `upload_url`.
4. `status/fetch` — **polling até `PUBLISH_COMPLETE`**. O `init` não publica
   nada: sem essa etapa um post que falhou aparece como sucesso.

> **Envio por arquivo, não por URL.** A opção `PULL_FROM_URL` exige verificar a
> posse do domínio que hospeda o vídeo. Como os arquivos ficam no Supabase
> Storage (domínio de terceiros), essa verificação é impossível — por isso o
> app usa `FILE_UPLOAD`.

> **Antes da auditoria do TikTok**, um app só publica como privado
> (`SELF_ONLY`). O código lê `privacy_level_options` do criador e rebaixa a
> visibilidade automaticamente, em vez de estourar erro. Com
> `TIKTOK_POST_AS_DRAFT=true` os vídeos vão para os rascunhos do app do TikTok,
> onde o usuário finaliza a publicação na mão.

## Banco de dados

Aplique as migrations de `supabase/migrations/` na ordem numérica. A migration
`002_token_lifecycle.sql` adiciona os índices usados pelas rotas de publicação e
documenta `expires_at` como epoch em milissegundos.

Para desenvolver sem publicar de verdade, defina `ENABLE_PUBLISH_MOCK=true`.

### Requisitos por plataforma

- **Instagram:** conta Business ou Creator vinculada a uma Página do Facebook; permissões `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` e `business_management`.
- **TikTok:** app aprovado com `user.info.basic`, `video.upload` e `video.publish`.
- **YouTube:** YouTube Data API v3 ativa e consentimento offline para obtenção de refresh token.

## Segurança e privacidade

- Nunca versione `.env.local`, client secrets, refresh tokens ou chaves privadas.
- A chave Supabase anon é pública por natureza; a proteção depende das políticas RLS.
- Revise as políticas de `social_accounts` e do bucket antes de produção.
- Use somente callbacks HTTPS e origens cadastradas nas plataformas.
- Mídia publicada em redes sociais precisa ficar temporariamente acessível por HTTPS para ingestão.
- Consulte a [Política de Privacidade](https://www.klipapp.com.br/privacidade) e os [Termos de Serviço](https://www.klipapp.com.br/termos) antes de disponibilizar o produto a terceiros.

O parâmetro OAuth `state` leva um nonce validado contra um cookie HttpOnly. O
caminho `next` aceita apenas destinos relativos e seguros, evitando CSRF e open
redirect.

### Arquivos de publicação

| Arquivo | Responsabilidade |
| --- | --- |
| `lib/publishing/oauth.ts` | Credenciais, expiração e renovação de tokens |
| `lib/publishing/oauth-state.ts` | `state` do OAuth com proteção CSRF |
| `lib/publishing/token-store.ts` | Renova e persiste tokens antes de publicar |
| `lib/publishing/meta.ts` | Descoberta da conta Instagram Business e cotas |
| `lib/publishing/youtube.ts` | Upload resumível em blocos de Shorts |
| `lib/publishing/instagram.ts` | Container de Reels, polling e publicação |
| `lib/publishing/tiktok.ts` | Content Posting API: creator info, upload e polling |
| `lib/publishing/publisher.ts` | Orquestra o multi-post em paralelo |

## Estrutura relevante

```text
app/                    rotas, salas, estúdios, editor e APIs
components/             autenticação, publicação, tema e design system
lib/publishing/         OAuth, tokens e clientes das redes sociais
lib/supabase/           clientes Supabase de browser e servidor
supabase/migrations/    schema e ciclo de vida de tokens
tests/                  regressões, integração e contratos de UI
```

## Licença

Distribuído sob a licença GPL-3.0-only. Consulte `package.json` para a declaração vigente.

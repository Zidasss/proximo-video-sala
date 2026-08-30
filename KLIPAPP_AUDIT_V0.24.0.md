# KLIPAPP v0.24.0 — auditoria, rearquitetura e redesign

Data: 30 de agosto de 2026

Base auditada: `09be0e9` (`main` e `origin/main`, versão 0.23.0)

Branch de trabalho: `codex/klipapp-rearchitecture-redesign`

Este documento registra o que foi encontrado, decidido, implementado e medido. A branch não foi enviada nem mesclada na `main`; portanto, não acionou o deploy automático da Vercel em `klipapp.com.br`.

## 1. Maiores problemas encontrados

| Prioridade | Problema | Impacto observado | Situação na v0.24.0 |
| --- | --- | --- | --- |
| P0 | Captions usavam conversões de tempo dispersas entre fonte, preview, montagem e exportação | Legendas podiam sair do trecho, sumir após cortes ou divergir do export | Corrigido com conversão canônica e testes de trim, move, reorder e duplicate |
| P0 | Export WebM sem áudio podia declarar Opus mesmo sem faixa de áudio | O `MediaRecorder` produzia arquivo vazio em navegador real | Corrigido; MIME e codecs agora refletem as faixas realmente presentes |
| P0 | Upload de publicação atravessava a Function da Vercel | Arquivos reais ultrapassariam o limite de payload da Function e consumiriam memória desnecessariamente | Substituído por ticket autenticado e upload TUS direto ao Supabase Storage |
| P0 | Endpoint de publicação aceitava origem de vídeo sem comprovar propriedade | Risco de SSRF, publicação de URL arbitrária e acesso cruzado entre usuários | Corrigido com autenticação, allowlist de host, path por usuário e limpeza do temporário |
| P1 | `app/page.tsx` concentrava 15.811 linhas e aproximadamente 596 KB | Bootstrap caro, manutenção arriscada e acoplamento entre chamada, homepage e editor | Editor extraído e carregado sob demanda; host caiu para cerca de 5,7 mil linhas |
| P1 | Playback e gestos atualizavam React em frequência excessiva | TBT alto, drag irregular e trabalho desnecessário na thread principal | Playback limitado a aproximadamente 15 atualizações/s e gestos agrupados em `requestAnimationFrame` |
| P1 | Histórico e autosave não cobriam todo o estado e mantinham blobs órfãos | Undo/redo incompleto e crescimento silencioso do IndexedDB | Snapshot ampliado, retenção explícita e remoção de assets órfãos |
| P1 | Importação de projeto confiava em estruturas e valores do arquivo | Projetos corrompidos podiam gerar estado inválido ou milhares de camadas | Formato v7 limitado a 5 MB, sanitização, limites e rejeição de versões futuras |
| P1 | A transição chamada “Dissolver” não dissolvia quadros | UI prometia um efeito que o render não entregava | Renomeada para “Ruído”; projetos legados são migrados sem quebrar |
| P2 | Header, playback e histórico tinham ações duplicadas e competiam com preview/timeline | Menos área útil e hierarquia fraca | Header compacto, ações globais agrupadas, inspector contextual e timeline redimensionável |
| P2 | Todas as prévias de efeitos em vídeo reproduziam ao mesmo tempo | Decodificação e consumo de CPU mesmo fora do foco | Apenas o card em hover, foco ou toque reproduz |

## 2. Causas raiz

- Um único componente cresceu acumulando homepage, chamada, gravação, editor, export e publicação.
- Fonte e timeline não possuíam uma API única de conversão temporal.
- Preview e export tinham implementações paralelas para texto, captions e codecs.
- Upload e publicação foram desenhados para arquivos pequenos, incompatíveis com os limites reais da Vercel.
- Vários controles foram acrescentados historicamente sem reavaliar frequência, contexto ou duplicação.
- Testes anteriores validavam majoritariamente contratos de texto no código; faltava um fluxo de navegador com vídeo real.

## 3. Decisões

- Preservar o produto existente e extrair o editor, em vez de reescrever toda a aplicação.
- Tornar timeline/fonte uma conversão explícita e compartilhada pelo preview e export.
- Manter efeitos que possuem implementação real no canvas; não criar uma lista visual de efeitos fictícios.
- Corrigir a semântica da transição existente em vez de fingir um dissolve sem composição entre dois frames.
- Enviar mídia diretamente ao Storage com TUS, mantendo a Function apenas como emissora de autorização.
- Reorganizar o editor como sistema: ações globais no topo, ferramentas à esquerda, preview no centro, inspector contextual à direita e timeline persistente embaixo.
- Manter a homepage atual após auditoria visual: ela já possuía hierarquia e identidade coerentes, e um redesign adicional seria mudança por vaidade.

## 4. Arquitetura

- `app/page.tsx` continua como host da experiência geral, mas o editor foi extraído para `components/editor/ClipEditor.tsx` e é importado dinamicamente sem SSR.
- CSS específico do editor deixou de bloquear todas as rotas e acompanha o chunk do editor.
- PeerJS, publicação, biblioteca de áudio e galeria de efeitos são carregados somente quando necessários.
- Novos domínios puros:
  - `lib/editor/timeline.ts`: fonte ↔ timeline;
  - `lib/editor/captions.ts`: segmentação e mapeamento;
  - `lib/editor/text-layers.ts`: tipos, escala WYSIWYG e sanitização;
  - `lib/editor/transitions.ts`: tipos, duração, labels e migração;
  - `lib/publishing/upload-policy.ts`: política de arquivo, path, host e limite;
  - `lib/publishing/direct-upload.ts`: cliente TUS, progresso, cancelamento e cleanup.
- O recovery local mantém a versão interna 1 para compatibilidade; o arquivo exportável do projeto passa à versão 7 e aceita projetos antigos de 1 a 7.

Limite arquitetural atual: `ClipEditor.tsx` ainda é grande. A extração retirou o editor do bootstrap e permitiu módulos puros testáveis, mas uma segunda etapa deve separar export renderer, timeline UI, inspector e media pipeline.

## 5. Performance

Medições locais com build de produção, Chrome/Lighthouse e o mesmo computador. Valores Lighthouse variam entre execuções; o comparável é a mudança de ordem de grandeza.

### Homepage

| Métrica | Mobile 0.23.0 | Mobile 0.24.0 | Desktop 0.23.0 | Desktop 0.24.0 |
| --- | ---: | ---: | ---: | ---: |
| Performance | 52 | 93 | 83 | 100 |
| FCP | 1.509 ms | 1.209 ms | 327 ms | 286 ms |
| LCP | 5.660 ms | 3.226 ms | 1.181 ms | 692 ms |
| TBT | 1.861 ms | 43 ms | 346 ms | 0 ms |
| Trabalho da main thread | 2.520 ms | 697 ms | 569 ms | 183 ms |
| Bootup de JavaScript | 2.078 ms | 234 ms | 452 ms | 2 ms |
| JS não usado estimado | 175 KiB | 75 KiB | 175 KiB | 76 KiB |
| Transferência | 461 KiB | 341 KiB | 461 KiB | 341 KiB |
| CLS | 0 | 0 | 0 | 0 |

### Editor vazio

| Métrica | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 89 | 100 |
| Accessibility / Best Practices / SEO | 100 / 100 / 100 | 100 / 100 / 100 |
| FCP | 1.206 ms | 287 ms |
| LCP | 3.767 ms | 765 ms |
| TBT | 39 ms | 0 ms |
| Transferência | 410 KiB | 410 KiB |
| CLS | 0 | 0 |

Outras medidas:

- build: 31,37 s → 11,16 s, redução aproximada de 64%;
- chunk inicial principal: 424,7 KiB → 112,2 KiB, redução aproximada de 74%;
- total de `.next/static`: 3.931,9 KiB → 3.711,4 KiB; o total inclui chunks sob demanda que não chegam no primeiro carregamento;
- interação ao selecionar a última camada permaneceu abaixo de 1 segundo com 5, 20 e 60 camadas no teste E2E;
- cada gesto de drag mantém um único update pendente por frame e aplica o valor final no `pointerup`.

## 6. Editor

- Nova composição desktop/tablet/mobile com prioridade para preview e timeline.
- Preview respeita exatamente o aspecto selecionado por `ResizeObserver`.
- Timeline persistente com 260 px iniciais e redimensionamento vertical.
- Fluxo validado para split, trim, move, delete, undo e redo de clipes independentes.
- Ações de clipe são botões acessíveis separados das alças de trim; não existe mais controle interativo aninhado.
- Undo/redo inclui cortes, montagem, captions, efeitos, transições, mídia, áudio e propriedades relevantes.
- Autosave preserva assets referenciados e remove blobs sem referência.
- Projeto malformado não consegue criar tempos invertidos, posições ilimitadas ou mais de 1.000 camadas de texto.
- Export seleciona codec conforme as faixas presentes e usa a mesma escala relativa de texto do preview.

## 7. Captions

- Mapeamento canônico entre tempo da mídia e tempo da montagem.
- Trim, deslocamento, reordenação e repetição da mesma fonte são cobertos.
- Texto longo é segmentado em cartões contíguos e legíveis.
- Regeneração automática não apaga captions manuais ou importadas.
- Selecionar, importar ou gerar captions abre o inspector contextual correto.
- Edição, estilo, posição e persistência após reload foram validados em navegador.
- O export WebM real inclui a caption editada e produz arquivo não vazio.

## 8. Effects

- Categorias e parâmetros continuam definidos em estrutura portável, usada por preview e canvas de exportação.
- Intensidade e efeito selecionado participam do histórico, projeto e autosave.
- Cards mostram a mídia atual, têm navegação por teclado e controles de toque.
- Vídeos de preview ficam pausados até hover, foco ou pressão, evitando múltiplos decoders ativos.
- A galeria é carregada sob demanda.

## 9. Transitions

- Tipos e metadados centralizados em `lib/editor/transitions.ts`.
- Payload de drag e arquivos de projeto rejeitam valores desconhecidos.
- O legado `dissolve` migra para `noise`, preservando abertura de projetos antigos.
- Labels e duração correspondem ao que o renderer realmente executa.
- Aplicação e persistência após reload foram verificadas em E2E.

## 10. UI/UX

- Marca reduzida dentro do editor; conteúdo, preview e timeline são protagonistas.
- Header compacto mantém projeto, save, undo/redo, qualidade, export e publicação.
- Rail esquerdo organiza Media, Texto, Áudio, Efeitos, Legendas, Transições, Formatos e Radar.
- Inspector à direita responde à seleção; propriedades permanentes e duplicadas foram removidas.
- Playback fica junto do preview; controles específicos de timeline ficam na timeline.
- Mobile usa navegação inferior e painéis em sheet, sem herdar o layout de tablet.
- Safe guides ficam desligadas por padrão e podem ser ativadas quando relevantes.
- Lighthouse registrou accessibility 100 nos quatro cenários finais.

## 11. Testes

- `npm test`: 72/72 testes aprovados.
- `npm run test:e2e`: 5/5 cenários aprovados em Chrome desktop, incluindo viewport mobile e tablet.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: aprovado, sem avisos.
- `npm run build`: aprovado com Next.js 16.3.3.
- `npm audit --omit=dev`: 0 vulnerabilidades de produção.
- `vinext build`: aprovado localmente com Vite 8.2.2 após atualizar o tooling opcional de Cloudflare.
- `npm audit` completo: 4 vulnerabilidades moderadas, todas transitivas do `drizzle-kit` usado apenas em desenvolvimento; a correção automática oferecida exige downgrade incompatível e não foi forçada.

Os E2E usam um WebM real gerado para o teste e cobrem:

- captions, estilo, posição, efeito, transição, autosave, reload e download real;
- 5, 20 e 60 camadas;
- split, trim, move, delete, undo e redo;
- reprodução, texto, histórico e aspecto do preview;
- composição responsiva em celular e tablet.

## 12. Pendências e limites honestos

- P1: uploads reais para YouTube e TikTok ainda materializam uma cópia compartilhada do arquivo na memória da Function para os envios em partes. Está limitado e é melhor que baixar uma cópia por plataforma, mas o próximo passo é streaming/range upload para arquivos próximos de 500 MB.
- P1: dividir `ClipEditor.tsx` em renderer de export, timeline, inspector e media pipeline; a extração atual resolveu bootstrap e testabilidade, não toda a complexidade interna.
- P1: validar publicação ponta a ponta com contas sandbox reais de YouTube, TikTok e Instagram. Os contratos HTTP e estados foram testados com mocks; nenhuma publicação externa foi executada nesta auditoria.
- P1: validar o TUS contra o projeto Supabase de produção e suas políticas de bucket. A implementação segue o protocolo e foi testada localmente, mas não foi feito upload na conta real nesta branch.
- P2: o editor mobile ainda tem LCP em torno de 3,8 s e 147 KiB de JavaScript potencialmente não usado no estado vazio. Timeline e inspector são os próximos candidatos a chunks contextuais.
- P2: adicionar observabilidade de produção para falhas de export, transcrição, TUS e publicação; não foi escolhido um fornecedor sem decisão do produto.
- P2: substituir ou atualizar a cadeia legada do `drizzle-kit` quando houver uma correção compatível para os quatro alertas moderados de `esbuild` no ambiente de desenvolvimento.
- P2: MP4 depende do suporte do `MediaRecorder` do navegador. O teste real automatizado usa WebM, formato disponível no Chrome usado na suíte.
- Operacional: não houve push, merge em `main` nem deploy na Vercel. Essa decisão deve ser explícita porque atualizar `main` publica automaticamente em `klipapp.com.br`.

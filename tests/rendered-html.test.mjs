import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships compact caption navigation and manual participant styling", async () => {
  const editor = await readFile(
    new URL("components/editor/ClipEditor.tsx", root),
    "utf8",
  );
  assert.match(editor, /captionListExpanded/);
  assert.match(editor, /Legenda atual/);
  assert.match(editor, /Mostrar todas/);
  assert.match(editor, /assignCaptionSpeaker/);
  assert.match(editor, /applyCaptionSpeakerStyle/);
  assert.match(editor, /O Whisper local não separa vozes/);
  assert.match(editor, /const speakerName =/);
  assert.match(editor, /captionSpeakerName/);
  assert.match(editor, /renameCaptionSpeaker/);
  assert.match(editor, /applyCaptionPositionToAll/);
  assert.match(editor, /Aplicar posição a todas as legendas/);
});

async function readProductionSource() {
  const [page, editor] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/editor/ClipEditor.tsx", root), "utf8"),
  ]);
  return `${page}\n${editor}`;
}

test("keeps the KLIPAPP editor interaction model in the production source", async () => {
  const page = await readProductionSource();
  assert.match(page, /export default function ClipEditor/);
  assert.match(page, /function beginTimelineItemDrag/);
  assert.match(page, /function beginPrimaryTimelineMove/);
  assert.match(page, /function movePrimaryTimelineMove/);
  assert.match(page, /primaryTimelineStart/);
  assert.match(page, /O trecho cortado foi preservado/);
  assert.match(page, /function moveTimelineItemDrag/);
  assert.match(page, /function beginTimelineFadeDrag/);
  assert.match(page, /function beginPlayheadDrag/);
  assert.match(page, /function copySelected/);
  assert.match(page, /function pasteSelected/);
  assert.match(page, /function openContextMenu/);
  assert.match(page, /function updateSnapGuide/);
  assert.match(page, /function addSceneVideo/);
  assert.match(page, /function addSceneMedia/);
  assert.match(page, /function splitSelectedAtPlayhead/);
  assert.match(page, /function openVideoContextMenu/);
  assert.match(page, /Vídeo na sequência: arraste para mover/);
  assert.match(page, /VÍDEO PRINCIPAL/);
  assert.match(page, /target: "main" \| "scene"/);
  assert.match(page, /role: "scene"/);
  assert.match(page, /editor-workspace-empty/);
  assert.match(page, /scaleX: 1, scaleY: 1/);
  assert.match(page, /beginVideoFrameResize\(event, "corner"\)/);
  assert.match(page, /Sobrepor vídeo ou imagem/);
  assert.match(page, /Vários vídeos e imagens na mesma tela/);
  assert.match(page, /illustration-resize-right/);
  assert.match(page, /illustration-resize-bottom/);
  assert.match(page, /item\.width \?\? item\.size/);
  assert.match(page, /function turnPhotoIntoClip/);
  assert.match(page, /function togglePreviewPlayback/);
  assert.match(page, /function playTimelineAt/);
  assert.match(page, /const baseLoopOffset/);
  assert.match(
    page,
    /onEnded=\{\(\) => \{\s*if \(!exportInProgress\.current\)\s*void playTimelineAt/,
  );
  assert.match(page, /const hasFriendVideo/);
  assert.match(
    page,
    /A recording in a solo room is a proper one-person composition/,
  );
  assert.match(
    page,
    /type VerticalCameraMode = "auto" \| "solo-mine" \| "solo-friend"/,
  );
  assert.match(
    page,
    /TikTok solo ativo: somente a sua câmera será gravada em 9:16/,
  );
  assert.match(page, /resenhaMineSize/);
  assert.match(page, /resenhaLayout === "solo"/);
  assert.match(page, /Composição do Modo Resenha/);
  assert.match(page, /Eu \+\s*\n?\s*tela/);
  assert.match(page, /câmera em cima e vídeo embaixo/i);
  assert.match(page, /className="preview-screen resenha-solo-video"/);
  assert.match(page, /setRecordingFinishedPrompt\(true\)/);
  assert.match(page, /Quer abrir no editor\?/);
  assert.match(page, /Continuar na sala/);
  assert.match(
    page,
    /A tela compartilhada também será gravada exatamente como aparece aqui/,
  );
  assert.match(page, /Câmera \/ placa de captura/);
  assert.match(page, /Placa de captura —/);
  assert.match(page, /Capturar janela, tela ou jogo/);
  assert.match(page, /function isCaptureInputLabel/);
  assert.match(page, /Mixador de áudio/);
  assert.match(page, /Adicionar canais de/);
  assert.match(page, /multiple/);
  assert.match(page, /function addAudioFiles/);
  assert.match(page, /function duplicateAudioTrack/);
  assert.match(page, /soloAudioActive/);
  assert.match(page, /muted: Boolean\(track\.muted\)/);
  assert.match(page, /solo: Boolean\(track\.solo\)/);
  assert.match(page, /function placeholderCameraStream/);
  assert.match(page, /async function startRecording\(\)/);
  assert.match(page, /await audio\.resume\(\)/);
  assert.match(page, /async function record\(\)/);
  assert.match(page, /const audioSources = \[/);
  assert.match(page, /const recordingAudioTracks = audioSources\.flatMap/);
  assert.match(page, /recordingAudioTracks\.forEach\(\(track\) => output\.addTrack\(track\.clone\(\)\)\)/);
  assert.match(page, /Não crie outro AudioContext ao gravar/);
  assert.match(page, /useState<ExportFormat>\("webm"\)/);
  assert.match(page, /WebM\/Opus é o contêiner confiável/);
  assert.match(page, /Tente o microfone isoladamente antes/);
  assert.match(page, /microphone\s*\.getAudioTracks\(\)/);
  assert.match(page, /stream\.addTrack\(track\)/);
  assert.match(page, /async function testMicrophone\(\)/);
  assert.match(page, /await pipeline\.context\.resume\(\)/);
  assert.match(page, /Sala aberta sem mídia/);
  assert.match(
    page,
    /Nunca abra uma segunda chamada ao alterar fundo\/overlay/,
  );
  assert.match(
    page,
    /const stream = processedLocal\.current \|\| local\.current/,
  );
  assert.match(page, /let loadedOverlaySource = cameraOverlayRef\.current/);
  assert.match(page, /if \(background\) image\.src = background/);
  assert.match(page, /Nunca faça composição em 4K implícita/);
  assert.match(page, /Usando IA Premium compatível com este navegador/);
  assert.match(
    page,
    /const usePremiumMatting = mattingQuality === "premium" && !isMacOS/,
  );
  assert.match(page, /"Identity:0", "Identity_1:0", "Identity_2:0"/);
  assert.match(page, /frameRate: \{ ideal: 30, max: 30 \}/);
  assert.match(page, /shareScreenDialogOpen/);
  assert.match(page, /Tela com áudio/);
  assert.match(page, /Somente imagem/);
  assert.match(page, /systemAudio: includeAudio \? "include" : "exclude"/);
  assert.match(
    page,
    /setRemoteScreenAudioActive\(shared\.getAudioTracks\(\)\.length > 0\)/,
  );
  assert.match(page, /firstMaskTimer = window\.setTimeout/);
  assert.match(page, /const macPort: SegmentPort/);
  assert.match(page, /Recorte compatível com macOS pronto/);
  assert.match(page, /selfie_multiclass_256x256\.tflite/);
  assert.match(
    page,
    /worker\.postMessage\(\{ type: "segment", frame: inferenceCanvas/,
  );
  assert.match(page, /Carregando e preparando o GIF/);
  assert.match(page, /inferenceDuration > 95 \? 384/);
  assert.match(page, /Vídeo e enquadramento/);
  assert.match(
    page,
    /Arraste diretamente na prévia ou faça o ajuste preciso aqui/,
  );
  assert.match(
    page,
    /Horizontal · \{Math\.round\(selectedIllustration\.x\)\}%/,
  );
  assert.match(page, /event\.key === "Delete"/);
  assert.match(page, /event\.code === "Space"/);
  assert.match(page, /function buildAudioWaveform/);
  assert.match(page, /timelineWaveform/);
  assert.match(page, /audio-clip-waveform/);
  assert.match(page, /function splitActiveRadarCutAtPlayhead/);
  assert.match(page, /function splitPrimaryVideoAtPlayhead/);
  assert.match(page, /setApprovedCuts\(\[first, second\]\)/);
  assert.match(page, /As duas partes e seus áudios foram preservados/);
  assert.match(page, /Excluir somente este clipe/);
  assert.match(page, /function beginRadarCutTrim/);
  assert.match(page, /function beginRadarCutMove/);
  assert.match(page, /timelineStart: timelineCursor/);
  assert.match(page, /A linha branca permaneceu onde estava/);
  assert.match(page, /montageAudioClips\.map/);
  assert.match(page, /\[5, 10, 15, 20, 30\]/);
  assert.match(page, /function dropTransitionOnRadarClip/);
  assert.match(page, /application\/x-klip-transition", "flash"/);
  assert.match(page, /application\/x-klip-transition", "noise"/);
  const transitions = await readFile(
    new URL("lib/editor/transitions.ts", root),
    "utf8",
  );
  assert.match(transitions, /if \(value === "dissolve"\) return "noise"/);
  assert.doesNotMatch(page, /> Dissolver/);
  assert.match(page, /application\/x-klip-transition", "wipe"/);
  assert.match(page, /activeTransitionKind === "wipe"/);
  assert.match(page, /timeline-split-toggle/);
  assert.match(page, /Dividir clipe/);
});

test("ships direct-manipulation styling for desktop and mobile timelines", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.timeline-item-clip/);
  assert.match(css, /\.timeline-clip-handle/);
  assert.match(css, /\.timeline-transition/);
  assert.match(css, /\.timeline-play-toggle/);
  assert.match(css, /\.clip-fade-handle/);
  assert.match(css, /\.timeline-context-menu/);
  assert.match(css, /\.timeline-snap-guide/);
  assert.match(css, /\.tool-disclosure/);
  assert.match(css, /\.editor-workspace-empty/);
  assert.match(css, /\.editor-empty-upload/);
  assert.match(css, /\.media-destinations/);
  assert.match(css, /\.editor-replace-upload/);
  assert.match(css, /\.video-frame-resize\.edge/);
  assert.match(css, /\.scene-track-heading/);
  assert.match(css, /\.primary-video-clip/);
  assert.match(css, /\.screen-share-dialog/);
  assert.match(css, /\.audio-mixer-heading/);
  assert.match(css, /\.audio-channel-strip/);
  assert.match(css, /\.channel-toggles/);
  assert.match(css, /\.resenha-controls/);
  assert.match(css, /\.timeline-more/);
  assert.match(css, /\.video-properties-grid/);
  assert.match(css, /\.position-grid/);
  assert.match(css, /\.settings-panel::-webkit-scrollbar/);
  assert.match(css, /\.virtual-effect-loading/);
  assert.match(css, /\.audio-clip-waveform/);
  assert.match(css, /\.radar-trim-handle/);
  assert.match(css, /\.radar-clip-fade/);
  assert.match(css, /\.montage-audio-clip/);
  assert.match(css, /\.segmented-waveform/);
  assert.match(css, /\.montage-audio-waveform::after/);
  assert.match(css, /\.transition-shelf button:hover/);
  assert.match(css, /Studio control-density pass/);
  assert.match(css, /--studio-panel-w: 350px/);
  assert.match(
    css,
    /\.editor-tool-rail button:hover\s*\{[^}]*min-height:\s*50px/,
  );
  assert.match(
    css,
    /\.editor-tools \.tool-primary-action\s*\{[^}]*min-height:\s*36px/,
  );
  assert.match(
    css,
    /\.editor-tools \.tool-primary-action\s*\{[^}]*min-height:\s*44px;[^}]*font-size:\s*14px/,
  );
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("ships the image-to-GIF motion studio and camera background handoff", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const studio = await readFile(new URL("app/gif-studio.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(page, /<WandSparkles aria-hidden="true" \/> Motion/);
  assert.match(page, /<GifStudio/);
  assert.match(studio, /function paintMotionFrame/);
  assert.match(studio, /function lzwPixels/);
  assert.match(studio, /"GIF89a"/);
  assert.match(studio, /Usar como fundo/);
  assert.match(studio, /Arraste para reorganizar/);
  assert.match(css, /\.motion-studio/);
  assert.match(css, /\.motion-frame-list/);
  assert.match(css, /\.motion-exporting/);
});

test("ships the local KLIPAPP Radar review flow without replacing the source", async () => {
  const page = await readProductionSource();
  const radar = await readFile(new URL("app/klip-radar.ts", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(page, /autoAnalyze\?: boolean/);
  assert.match(page, /function runRadarAnalysis/);
  assert.match(page, /function applyRadarSuggestions/);
  assert.match(page, /function previewRadarSuggestion/);
  assert.match(page, /const montageRanges/);
  assert.match(page, /const montageTimelineClips/);
  assert.match(page, /const editorTimelineDuration/);
  assert.match(page, /Montagem livre/);
  assert.match(page, /\? "ÁUDIOS" : "ÁUDIO"/);
  assert.match(page, /vídeo e áudio independentes/);
  assert.match(page, /Salvar este clipe sem remover os demais/);
  assert.match(page, /exportReel\(\s*false,\s*\[item\]/);
  assert.match(page, /Os demais clipes continuam na montagem/);
  assert.match(page, /const exportInProgress = useRef\(false\)/);
  assert.match(page, /if \(exportInProgress\.current\) return/);
  assert.match(page, /finishExportWithError/);
  assert.match(page, /const hasExportAudio/);
  assert.match(page, /mimeForExport\(exportFormat, hasExportAudio\)/);
  assert.match(page, /document\.body\.appendChild\(link\)/);
  assert.match(page, /function advanceMontageRange/);
  assert.match(page, /fades automáticos/);
  assert.match(page, /Exportar \$\{approvedCuts\.length\} clipes/);
  assert.match(page, /setEditorOpen\(true\)/);
  assert.match(page, /KLIP RADAR/);
  assert.match(page, /Nada altera o arquivo original/);
  assert.match(radar, /export async function analyzeClipForRadar/);
  assert.match(radar, /samplesAtTimestamps/);
  assert.match(radar, /createRadarSamplingPlan/);
  assert.doesNotMatch(radar, /\.arrayBuffer\(\)/);
  assert.doesNotMatch(radar, /decodeAudioData/);
  assert.match(radar, /sugestões estimadas para conferir/);
  assert.match(css, /\.radar-panel/);
  assert.match(css, /\.radar-cut/);
  assert.match(css, /\.radar-trigger/);
  assert.match(css, /Studio readability pass/);
  assert.match(css, /Export\/Radar usability/);
  assert.match(css, /height: min\(88dvh, 860px\)/);
});

test("KLIPAPP Radar finds separate speech blocks and keeps them inside the source", async () => {
  const { buildSuggestions } = await import("../app/klip-radar.ts");
  const levels = Array.from({ length: 900 }, () => 0.002);
  for (let index = 50; index < 300; index += 1)
    levels[index] = index % 37 < 3 ? 0.004 : 0.08;
  for (let index = 380; index < 680; index += 1)
    levels[index] = index % 43 < 4 ? 0.004 : 0.065;
  const suggestions = buildSuggestions(levels, 0.1, 90, "reels", 5);
  assert.ok(suggestions.length >= 2);
  assert.ok(suggestions.every((item) => item.start >= 0 && item.end <= 90));
  assert.ok(
    suggestions.every((item) => item.end > item.start && item.selected),
  );
  assert.ok(suggestions.some((item) => item.start < 10));
  assert.ok(suggestions.some((item) => item.start >= 25));
});

test("ships compact editing, reliable audio detection, automatic captions and reaction video", async () => {
  const page = await readProductionSource();
  const transcription = await readFile(
    new URL("app/api/transcribe/route.ts", root),
    "utf8",
  );
  const localTranscription = await readFile(
    new URL("lib/editor/local-transcription.ts", root),
    "utf8",
  );
  const localWorker = await readFile(
    new URL("public/workers/local-transcription.js", root),
    "utf8",
  );
  const css = await readFile(new URL("app/styles/klip-pure.css", root), "utf8");
  assert.match(page, /type BaseAudioState/);
  assert.match(page, /probePlayableAudio/);
  assert.match(page, /Áudio presente/);
  assert.match(page, /function generateAutomaticCaptions/);
  assert.match(page, /createTranscriptionAudioPlan/);
  assert.match(page, /extractTranscriptionAudioChunk/);
  assert.match(page, /extractLocalTranscriptionPcmChunk/);
  assert.match(page, /createLocalTranscriptionSession/);
  assert.match(page, /buildCaptionTranscriptionJobs/);
  assert.match(page, /requestTranscriptionChunk/);
  assert.match(page, /TRANSCRIPTION_CHUNK_SECONDS/);
  assert.match(page, /Whisper local · sem chave de API/);
  assert.match(page, /Neste dispositivo/);
  assert.match(page, /Sem API/);
  assert.match(page, /somente áudio compacto/i);
  assert.match(page, /blob\.size <= MAX_IN_MEMORY_AUDIO_BYTES/);
  assert.match(page, /VERY_LARGE_WAVEFORM_BYTES/);
  assert.doesNotMatch(page, /Templates e aparência/);
  assert.doesNotMatch(page, /Este arquivo ultrapassa 24 MB/);
  assert.match(page, /Detectar idioma e gerar legendas/);
  assert.match(page, /Transcrever e traduzir/);
  assert.match(page, /caption-progress/);
  assert.match(page, /captionTargetLanguage/);
  assert.match(page, /Vídeo de reação/);
  assert.match(page, /preset === "reaction" && kind === "video"/);
  assert.match(page, /tool: "captions", icon: Captions, label: "Legendas"/);
  assert.match(page, /activeTool === "captions"/);
  assert.match(page, /Cortar e separar aqui/);
  assert.match(page, /Ímã automático/);
  assert.match(page, /A área segura é só uma guia/);
  assert.match(page, /Prévia de posição e estilo/);
  assert.match(page, /Título central/);
  assert.match(page, /Legenda legível/);
  assert.match(page, /automaticCaptionButtonLabel/);
  assert.match(page, /Português \(Brasil\) · sem tradução/);
  assert.match(page, /captionTargetLanguage === "pt" \? "pt" : detectedLanguage/);
  assert.doesNotMatch(page, /form\.append\("language", "pt"\)/);
  assert.match(css, /\.caption-clip\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(localTranscription, /local-transcription\.js\?v=pt-quality-4/);
  assert.match(transcription, /\/v1\/audio\/transcriptions/);
  assert.match(transcription, /whisper-1/);
  assert.match(transcription, /timestamp_granularities\[\]/);
  assert.match(transcription, /targetLanguage/);
  assert.match(transcription, /targetLanguage === "pt"[\s\S]*?\? "pt"/);
  assert.match(transcription, /detectedLanguage/);
  assert.match(transcription, /translationWarning/);
  assert.match(transcription, /TRANSCRIPTION_CHUNK_MAX_BYTES/);
  assert.match(transcription, /Não foi possível identificar fala/);
  assert.match(transcription, /\/v1\/chat\/completions/);
  assert.match(css, /--pure-panel-w: clamp\(210px, 13vw, 244px\)/);
  assert.match(css, /\.editor-reaction-upload/);
  assert.match(css, /background: #e0eee8 !important/);
  assert.match(css, /background: #276b59 !important/);
  assert.match(css, /background: #dce1e7 !important/);
  assert.match(css, /background: #356b58 !important/);
  assert.match(css, /\.codec-audio-indicator/);
  assert.match(css, /\.studio-hub-backdrop-effects/);
  assert.match(css, /\.studio-background-play/);
  assert.match(page, /aria-modal=\{studioPanel !== "effects"\}/);
  assert.match(page, /studio-effects-gallery/);
  assert.match(css, /bottom: calc\(100% \+ 8px\) !important/);
  assert.match(css, /minmax\(244px, var\(--pure-inspector-w\)\) !important/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1080px\)/);
  assert.match(css, /\.timeline-safe-area-help/);
  assert.match(css, /\.caption-detected-language/);
  assert.match(css, /--pure-rail-w: 76px/);
  const geometryLock = css.slice(css.indexOf("Shell geometry lock"));
  assert.doesNotMatch(geometryLock, /--pure-rail-w: 58px/);
  assert.match(css, /\.caption-engine-switch/);
  assert.match(css, /\.start-marker span/);
  assert.match(css, /\.end-marker span/);
  assert.match(css, /\.caption-service-explainer/);
  assert.match(localTranscription, /workers\/local-transcription\.js/);
  assert.match(localTranscription, /LocalTranscriptionSession/);
  assert.match(localTranscription, /worker \?\?= new Worker/);
  assert.match(localTranscription, /parseFloat32Wave/);
  assert.match(localWorker, /\/_klip-ai\/runtime/);
  assert.match(localWorker, /onnx-community\/whisper-small/);
  assert.match(localWorker, /chunk_length_s: 30/);
  assert.match(localWorker, /stride_length_s: 5/);
  assert.match(localWorker, /useBrowserCache = true/);
  assert.match(localWorker, /navigator\.gpu\.requestAdapter\(\)/);
  assert.match(localTranscription, /fallback-wasm/);
  assert.match(localTranscription, /preferWebGpu/);
});

test("keeps a crash-safe local editor recovery with its media blobs", async () => {
  const page = await readProductionSource();
  const recovery = await readFile(
    new URL("lib/editor-recovery.ts", root),
    "utf8",
  );
  assert.match(page, /function saveRecoveryNow/);
  assert.match(page, /MAX_PROJECT_FILE_BYTES/);
  assert.match(page, /project\.version > PROJECT_FILE_VERSION/);
  assert.match(page, /collectRecoveryAssets/);
  assert.match(page, /Projeto recuperado automaticamente/);
  assert.match(page, /Recuperando seu projeto/);
  assert.match(page, /window\.addEventListener\("pagehide", flush\)/);
  assert.match(
    page,
    /document\.addEventListener\("visibilitychange", onVisibility\)/,
  );
  assert.match(page, /Proteção automática ativa/);
  assert.match(recovery, /klipapp-editor-recovery/);
  assert.match(recovery, /const ASSET_STORE = "assets"/);
  assert.match(recovery, /assetStore\.put\(asset\)/);
  assert.match(recovery, /loadEditorRecoveryAsset/);
  assert.match(recovery, /assetStore\.getAllKeys\(\)/);
  assert.match(recovery, /retained\.has\(String\(id\)\)/);
  assert.match(page, /navigator\.storage\?\.persist/);
});

test("keeps recorder controls compact and theme-safe", async () => {
  const [page, theme] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/styles/klipapp.css", root), "utf8"),
  ]);
  assert.match(page, /screen-audio-option/);
  assert.match(page, /camera-effects-more/);
  assert.match(page, /Mais efeitos/);
  assert.match(page, /Fundo animado/);
  assert.match(page, /Eu \+\s*\n?\s*tela/);
  assert.match(page, /resenha-solo-stage/);
  assert.match(page, /if \(!sharing && !remoteSharing\) setShareScreenDialogOpen\(true\)/);
  assert.match(theme, /\.screen-share-dialog > header \{/);
  assert.match(theme, /background: transparent !important/);
  assert.match(theme, /\.screen-audio-option span \{ color: var\(--ka-text\) !important/);
  assert.match(theme, /\.audio-profile-warning button \{[\s\S]*?var\(--ka-brand-soft\)/);
  assert.match(theme, /\.webcam-text-layer > div button\.selected/);
  assert.match(theme, /\.menu-switch input \{ accent-color: var\(--ka-brand\) !important/);
});

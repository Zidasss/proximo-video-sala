import { expect, test, type Page } from "@playwright/test";
import { stat } from "node:fs/promises";

type ProjectTextLayer = {
  id: string;
  text: string;
  font: string;
  color: string;
  size: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  effect: "none" | "pop" | "slide" | "typewriter" | "zoom" | "bounce";
  background: boolean;
  kind?: "text" | "caption";
  captionOrigin?: "generated" | "imported" | "manual";
};

async function makeBrowserVideo(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Canvas 2D indisponível no navegador de teste.");

    const stream = canvas.captureStream(24);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.start(100);

    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - startedAt;
        const progress = Math.min(1, elapsed / 2_400);
        const gradient = context.createLinearGradient(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        gradient.addColorStop(0, "#153a78");
        gradient.addColorStop(1, "#e45d4e");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(255,255,255,.92)";
        context.beginPath();
        context.arc(110 + progress * 410, 180, 52, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.font = "700 34px sans-serif";
        context.fillText("KLIP fluxo real", 28, 54);
        if (progress < 1) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });

    const stopped = new Promise<void>((resolve) =>
      recorder.addEventListener("stop", () => resolve(), { once: true }),
    );
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const bytes = new Uint8Array(
      await new Blob(chunks, { type: mimeType }).arrayBuffer(),
    );
    return { mimeType, bytes: Array.from(bytes) };
  });
}

async function loadEditorFixture(page: Page) {
  const fixture = await makeBrowserVideo(page);
  await page.locator(".editor-empty-upload input[type=file]").setInputFiles({
    name: "fluxo-real.webm",
    mimeType: fixture.mimeType,
    buffer: Buffer.from(fixture.bytes),
  });
  await expect(page.locator(".editor-stage video")).toBeVisible();
}

async function importProjectLayers(page: Page, layers: ProjectTextLayer[]) {
  const project = {
    version: 7,
    start: 0,
    end: 2.2,
    primaryTimelineStart: 0,
    videoFadeIn: 0,
    videoFadeOut: 0,
    videoFadeInAt: 0,
    videoFadeOutAt: 2.2,
    transitionColor: "black",
    transitionKind: "fade-black",
    exportAspect: "original",
    exportResolution: "source",
    exportFps: 24,
    exportBitrate: "standard",
    visualPreset: "clean",
    selectedSocialPresetId: "custom",
    layers,
    approvedCuts: [],
  };
  await page.locator('input[accept="application/json,.json"]').setInputFiles({
    name: "klip-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
}

function makeProjectLayer(
  index: number,
  overrides: Partial<ProjectTextLayer> = {},
): ProjectTextLayer {
  return {
    id: `layer-${index}`,
    text: `Camada ${index}`,
    font: "Inter",
    color: "#ffffff",
    size: 44,
    x: 20 + (index % 5) * 15,
    y: 20 + (index % 4) * 18,
    align: "center",
    start: 0,
    end: 2.2,
    fadeIn: 0,
    fadeOut: 0,
    effect: "none",
    background: false,
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("klip-theme");
    if (!sessionStorage.getItem("klip-e2e-database-reset")) {
      indexedDB.deleteDatabase("klipapp-editor-recovery");
      sessionStorage.setItem("klip-e2e-database-reset", "done");
    }
  });
  await page.goto("/?editor=1");
  await expect(
    page.getByText("Transforme uma ideia em história."),
  ).toBeVisible();
});

test("preserva edição, estilo, posição e exportação de captions", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loadEditorFixture(page);
  await importProjectLayers(page, [
    makeProjectLayer(1, {
      text: "Legenda gerada",
      y: 82,
      background: true,
      effect: "pop",
      kind: "caption",
      captionOrigin: "generated",
    }),
  ]);

  await expect(page.locator(".caption-overlay")).toContainText(
    "Legenda gerada",
  );
  await page.getByRole("button", { name: "Efeitos", exact: true }).click();
  await page.getByRole("button", { name: "Galeria de efeitos" }).click();
  const effectsDialog = page.getByRole("dialog", {
    name: "Ferramentas de criação do KLIPAPP Studio",
  });
  const zoomEffect = page.getByRole("button", { name: /^Zoom suave\./ });
  await zoomEffect.click();
  await expect(zoomEffect).toHaveAttribute("aria-pressed", "true");
  await effectsDialog
    .getByRole("button", { name: "Fechar ferramentas" })
    .click();
  await page.getByRole("button", { name: "Transições", exact: true }).click();
  await page.getByRole("button", { name: "Ruído", exact: true }).click();
  await expect(page.locator(".timeline-transition.in")).toBeVisible();
  await expect(
    page.locator(".video-transition-overlay.transition-noise"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Legendas", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Texto da legenda" })
    .fill("Legenda corrigida");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: /Aplicar estilo Legenda legível/ })
    .click();
  await page.getByText("Posição e duração", { exact: true }).click();
  await page
    .getByRole("slider", { name: "Posição vertical do texto" })
    .fill("70");
  await expect(page.locator(".caption-overlay")).toContainText(
    "Legenda corrigida",
  );

  await expect(page.locator(".editor-project-status")).toContainText(
    "Salvo localmente",
    { timeout: 8_000 },
  );
  await page.reload();
  await expect(page.locator(".editor-stage video")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(".caption-overlay.with-background")).toContainText(
    "Legenda corrigida",
  );
  await page.getByRole("button", { name: "Efeitos", exact: true }).click();
  await page.getByRole("button", { name: "Galeria de efeitos" }).click();
  await expect(
    page.getByRole("button", { name: /^Zoom suave\./ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("dialog", {
      name: "Ferramentas de criação do KLIPAPP Studio",
    })
    .getByRole("button", { name: "Fechar ferramentas" })
    .click();
  await page.getByRole("button", { name: "Transições", exact: true }).click();
  await expect(page.locator(".transition-drops")).toContainText("Ruído");
  await page.getByRole("button", { name: "Legendas", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Texto da legenda" }),
  ).toHaveValue("Legenda corrigida");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByText("Posição e duração", { exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Posição vertical do texto" }),
  ).toHaveValue("70");

  await page.getByLabel("Configurações de exportação").click();
  await page.getByLabel("Formato de saída").selectOption("webm");
  await page.getByLabel("Quadros por segundo").selectOption("24");
  const downloadStarted = page.waitForEvent("download", { timeout: 20_000 });
  await page.locator(".editor-export").click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const downloadedFile = await stat(path!);
  expect(downloadedFile.size).toBeGreaterThan(10_000);
});

test("mantém interação responsiva com 5, 20 e 60 camadas", async ({ page }) => {
  await loadEditorFixture(page);
  const interactionTimes: Array<{ layers: number; milliseconds: number }> = [];

  for (const count of [5, 20, 60]) {
    await importProjectLayers(
      page,
      Array.from({ length: count }, (_, index) => makeProjectLayer(index)),
    );
    const clips = page.locator("#klip-timeline .text-clip");
    await expect(clips).toHaveCount(count);
    const startedAt = Date.now();
    await clips.last().click();
    await expect(page.locator(".caption-overlay.selected-layer")).toContainText(
      `Camada ${count - 1}`,
    );
    interactionTimes.push({
      layers: count,
      milliseconds: Date.now() - startedAt,
    });
  }

  for (const measurement of interactionTimes)
    expect(measurement.milliseconds).toBeLessThan(1_000);
});

test("divide, recorta, move, exclui e restaura clipes pela timeline", async ({
  page,
}) => {
  await loadEditorFixture(page);
  const baseLane = page.locator(".video-lane .lane-track");
  const laneBox = await baseLane.boundingBox();
  expect(laneBox).not.toBeNull();
  await page.mouse.click(
    laneBox!.x + laneBox!.width * 0.5,
    laneBox!.y + laneBox!.height * 0.5,
  );
  await page.getByRole("button", { name: "Dividir clipe" }).click();

  const montageClips = page.locator(".montage-video-lane .montage-cut");
  await expect(montageClips).toHaveCount(2);

  const firstClip = montageClips.first();
  const trimHandle = firstClip.locator(".radar-trim-handle.end");
  const clipBeforeTrim = await firstClip.boundingBox();
  const trimBox = await trimHandle.boundingBox();
  expect(clipBeforeTrim).not.toBeNull();
  expect(trimBox).not.toBeNull();
  await page.mouse.move(trimBox!.x + trimBox!.width / 2, trimBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(trimBox!.x - 28, trimBox!.y + 5, { steps: 6 });
  await page.mouse.up();
  const clipAfterTrim = await firstClip.boundingBox();
  expect(clipAfterTrim).not.toBeNull();
  expect(clipAfterTrim!.width).toBeLessThan(clipBeforeTrim!.width);

  const secondClip = montageClips.nth(1);
  const secondBeforeMove = await secondClip.boundingBox();
  expect(secondBeforeMove).not.toBeNull();
  await page.mouse.move(
    secondBeforeMove!.x + secondBeforeMove!.width * 0.45,
    secondBeforeMove!.y + secondBeforeMove!.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(secondBeforeMove!.x - 24, secondBeforeMove!.y + 12, {
    steps: 6,
  });
  await page.mouse.up();
  const secondAfterMove = await secondClip.boundingBox();
  expect(secondAfterMove).not.toBeNull();
  expect(Math.abs(secondAfterMove!.x - secondBeforeMove!.x)).toBeGreaterThan(3);

  await page
    .getByRole("button", { name: "Excluir somente este clipe" })
    .first()
    .click();
  await expect(montageClips).toHaveCount(1);
  const history = page.locator(".pure-history-controls");
  await history.getByRole("button", { name: "Desfazer" }).click();
  await expect(montageClips).toHaveCount(2);
  await history.getByRole("button", { name: "Refazer" }).click();
  await expect(montageClips).toHaveCount(1);
});

test("edita uma mídia real, reproduz e preserva histórico", async ({
  page,
}) => {
  await loadEditorFixture(page);
  const playButton = page.locator(".pure-play-button");
  await expect(playButton).toHaveAccessibleName("Reproduzir");
  await expect(playButton).toBeEnabled();
  await expect(
    page.locator("#klip-timeline .primary-video-clip"),
  ).toBeVisible();

  const clock = page.locator(".pure-stage-transport > span");
  await expect(clock).toContainText("00:00");
  const clockAtStart = await clock.textContent();
  await playButton.click();
  await expect
    .poll(async () => (await clock.textContent()) || "", { timeout: 5_000 })
    .not.toBe(clockAtStart);
  if ((await playButton.getAttribute("aria-label")) === "Pausar")
    await playButton.click();

  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar nova camada de texto" })
    .click();
  const textLayers = page.getByRole("button", { name: /Selecionar texto/ });
  await expect(textLayers).toHaveCount(1);
  await textLayers.first().click();
  await expect(page.locator(".caption-overlay")).toHaveCount(1);

  const history = page.locator(".pure-history-controls");
  await history.getByRole("button", { name: "Desfazer" }).click();
  await expect(textLayers).toHaveCount(0);
  await history.getByRole("button", { name: "Refazer" }).click();
  await expect(textLayers).toHaveCount(1);

  await expect(page.locator(".pure-inspector")).toBeVisible();
  await expect(page.locator("#klip-timeline")).toBeVisible();
  await expect(page.locator(".safe-area-guides")).toHaveCount(0);
  const stageBox = await page.locator(".editor-stage").boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.width / stageBox!.height).toBeCloseTo(16 / 9, 2);
});

test("prioriza a prévia no celular e não herda navegação móvel no tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByText("Transforme uma ideia em história."),
  ).toBeVisible();
  await loadEditorFixture(page);

  await expect(page.locator(".mobile-editor-nav")).toBeVisible();
  await expect(page.locator(".editor-tools")).toBeHidden();
  await expect(page.locator("#klip-timeline")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page
    .locator(".mobile-editor-nav")
    .getByRole("button", { name: /Ferramentas/ })
    .click();
  await expect(page.locator(".editor-tools")).toBeVisible();
  await page.getByRole("button", { name: "Fechar ferramentas" }).click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".mobile-editor-nav")).toBeHidden();
  await expect(page.locator(".pure-inspector")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
  const tabletStage = await page.locator(".editor-stage").boundingBox();
  expect(tabletStage).not.toBeNull();
  expect(tabletStage!.width / tabletStage!.height).toBeCloseTo(16 / 9, 2);
});

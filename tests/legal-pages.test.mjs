import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes complete KLIPAPP privacy and service terms pages", async () => {
  const privacy = await readFile(new URL("app/privacidade/page.tsx", root), "utf8");
  const terms = await readFile(new URL("app/termos/page.tsx", root), "utf8");
  const landing = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/legal.module.css", root), "utf8");

  assert.match(privacy, /Política de Privacidade — KLIPAPP/);
  assert.match(privacy, /aria-label="KLIPAPP — página inicial"/);
  assert.match(privacy, /Lei Geral de Proteção de Dados Pessoais/);
  assert.match(privacy, /Processamento local/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /YouTube, TikTok ou Instagram/);
  assert.match(terms, /Termos de Serviço — KLIPAPP/);
  assert.match(terms, /aria-label="KLIPAPP — página inicial"/);
  assert.match(terms, /Você mantém a titularidade do conteúdo/);
  assert.match(terms, /Plataformas externas/);
  assert.match(landing, /href="\/privacidade"/);
  assert.match(landing, /href="\/termos"/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 540px\)/);
});

test("ships the official KLIPAPP brand, metadata, themes and reusable UI system", async () => {
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const manifest = await readFile(new URL("app/manifest.ts", root), "utf8");
  const logo = await readFile(new URL("components/brand/KlipAppLogo.tsx", root), "utf8");
  const themeScript = await readFile(new URL("components/theme/ThemeScript.tsx", root), "utf8");
  const themeToggle = await readFile(new URL("components/theme/ThemeToggle.tsx", root), "utf8");
  const designTokens = await readFile(new URL("app/styles/klipapp.css", root), "utf8");
  const ui = await readFile(new URL("components/ui/index.ts", root), "utf8");

  assert.match(layout, /metadataBase: new URL\("https:\/\/www\.klipapp\.com\.br"\)/);
  assert.match(layout, /applicationName: "KLIPAPP"/);
  assert.match(layout, /siteName: "KLIPAPP"/);
  assert.match(layout, /<html lang="pt-BR" dir="ltr" suppressHydrationWarning>/);
  assert.match(layout, /<ThemeScript \/>/);
  assert.match(manifest, /short_name: "KLIPAPP"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /src: "\/favicon\.svg"/);

  assert.match(logo, /KlipAppLogoVariant = "full" \| "symbol" \| "wordmark"/);
  assert.match(logo, /label = "KLIPAPP"/);
  assert.match(logo, /aria-hidden=\{decorative \? true : undefined\}/);
  assert.match(logo, /role=\{decorative \? undefined : "img"\}/);

  assert.match(themeScript, /localStorage\.getItem\('klip_theme'\)/);
  assert.match(themeScript, /prefers-color-scheme: light/);
  assert.match(themeToggle, /aria-label=\{`Tema atual \$\{theme === "dark" \? "escuro" : "claro"\}\. Usar tema \$\{target\}`\}/);
  assert.match(designTokens, /html\[data-klip-theme="dark"\]/);
  assert.match(designTokens, /html\[data-klip-theme="light"\]/);
  assert.match(designTokens, /--ka-brand:/);
  assert.match(designTokens, /--ka-signal:/);
  assert.match(designTokens, /--ka-live:/);
  assert.match(designTokens, /prefers-reduced-motion/);

  for (const component of [
    "Avatar", "Badge", "Button", "Card", "IconButton", "Skeleton", "StatusIndicator",
    "Checkbox", "Input", "Radio", "Search", "Select", "Switch", "Textarea",
    "Drawer", "DropdownMenu", "Modal", "Toast", "Tooltip", "Pagination", "Tabs",
    "DataTable", "EmptyState",
  ]) {
    assert.match(ui, new RegExp(`\\b${component}\\b`), `${component} must remain part of the shared UI API`);
  }
});

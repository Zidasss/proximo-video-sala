import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes complete Klip privacy and service terms pages", async () => {
  const privacy = await readFile(new URL("app/privacidade/page.tsx", root), "utf8");
  const terms = await readFile(new URL("app/termos/page.tsx", root), "utf8");
  const landing = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/legal.module.css", root), "utf8");

  assert.match(privacy, /Política de Privacidade — Klip/);
  assert.match(privacy, /Lei Geral de Proteção de Dados Pessoais/);
  assert.match(privacy, /Processamento local/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /YouTube, TikTok ou Instagram/);
  assert.match(terms, /Termos de Serviço — Klip/);
  assert.match(terms, /Você mantém a titularidade do conteúdo/);
  assert.match(terms, /Plataformas externas/);
  assert.match(landing, /href="\/privacidade"/);
  assert.match(landing, /href="\/termos"/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

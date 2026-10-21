import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const {
  BRAND_TEXT,
  PiWebTitle,
  SCRAMBLE_CHARS,
  VERSION_SHOWN_MS,
  brandVersionText,
  scrambleFrame,
  scrambleFrameCount,
} = await jiti.import("./PiWebTitle.tsx");
const { SIDEBAR_MIN_WIDTH } = await jiti.import("@/lib/panel-layout.ts");
const { getLocalePlugin } = await jiti.import("@/lib/i18n/registry.ts");

const css = await readFile(new URL("../app/sidebar.css", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

/** A rule's declarations (its first rule for the selector). */
function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} not found`);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

/** A fixed sequence for Math.random's place. */
function sequence(...values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("the versions read as the old brand showed them: pi-web's, a p, pi's", () => {
  assert.equal(brandVersionText("0.11.0", "1.1.0"), "0.11.0p1.1.0");
  assert.equal(brandVersionText(undefined, undefined), "0.0.0p0.0.0");
  assert.equal(BRAND_TEXT, "My Slim Pi Web");
  assert.equal(VERSION_SHOWN_MS, 3000);
});

test("the scramble keeps the length and the spaces and settles left to right", () => {
  const target = "Pi Web";
  const total = scrambleFrameCount(target);
  assert.equal(total, 24);
  // The first frame: nothing settled but the space, every character from the set.
  const first = scrambleFrame(target, 0, sequence(0, 0.5, 0.99));
  assert.equal(first.length, target.length);
  assert.equal(first[2], " ");
  for (const [index, char] of [...first].entries()) {
    if (index !== 2) assert.ok(SCRAMBLE_CHARS.includes(char), `${char} is a scramble character`);
  }
  const pick = (value) => SCRAMBLE_CHARS[Math.floor(value * SCRAMBLE_CHARS.length)];
  assert.equal(first, `${pick(0)}${pick(0.5)} ${pick(0.99)}${pick(0)}${pick(0.5)}`);
  // Halfway, the first half is final.
  assert.equal(scrambleFrame(target, total / 2, () => 0).slice(0, 3), "Pi ");
  assert.equal(scrambleFrame(target, total / 2, () => 0).slice(3), "AAA");
  // From the last frame on, the text itself; every frame before has its length.
  assert.equal(scrambleFrame(target, total), target);
  assert.equal(scrambleFrame(target, total + 5), target);
  for (let frame = 0; frame < total; frame++) assert.equal(scrambleFrame(target, frame).length, target.length);
  const versions = brandVersionText("0.11.0", "1.1.0");
  assert.equal(scrambleFrameCount(versions), versions.length * 4);
});

test("the brand is a named button with the Pi mark and accessible version information", () => {
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(PiWebTitle)));
  const app = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const pi = process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0";
  assert.ok(html.startsWith(`<button type="button" class="sidebar-brand" aria-label="My Slim Pi Web, versions: web ${app}, pi ${pi}"><svg `));
  assert.match(html, /class="sidebar-brand-logo"[^>]*fill="currentColor"/);
  assert.doesNotMatch(html, />My Slim Pi Web</, "the visible text has been replaced by the mark");
  assert.doesNotMatch(html, /style=/, "no inline styles: its look is app/sidebar.css's");
  // In every language, with the visible name in it.
  for (const locale of ["en", "zh-CN", "zh-TW"]) {
    const label = getLocalePlugin(locale).messages["sidebar.brandLabel"];
    assert.ok(label?.startsWith("My Slim Pi Web"), `${locale}: ${label}`);
    assert.match(label, /\{app\}[\s\S]*\{pi\}/);
  }
});

test("the brand's icon and versions fit at the sidebar's minimum", async () => {
  const brand = rule(".sidebar-brand");
  // Its text in the chevron column: the tree's 6px inset and a toggle's 5px.
  const [marginLeft] = brand.match(/margin: 0 0 0 (\d+)px;/).slice(1).map(Number);
  const [paddingLeft] = brand.match(/padding: \d+px (\d+)px;/).slice(1).map(Number);
  assert.equal(marginLeft + paddingLeft, 6 + 5);

  // The icon and the optional version text fit beside New and Search.
  assert.match(brand, /(?:^|\s)font-family: var\(--font-mono\);/);
  assert.match(brand, /(?:^|\s)font-size: 15px;/);
  assert.match(css, /\.sidebar-header\[data-fit="2"\] \.sidebar-brand \{\s*font-size: 11px;\s*\}/);
  const room = SIDEBAR_MIN_WIDTH - 1 - 36 - 36;
  const box = (text, fontSize) => marginLeft + 2 * paddingLeft + text.length * 0.6 * fontSize;
  assert.ok(marginLeft + 2 * paddingLeft + 24 <= room, "the Pi mark fits");
  const piPackage = JSON.parse(await readFile(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json", import.meta.url), "utf8"));
  // Longer fork versions wrap into two lines without losing a character.
  const versions = brandVersionText(packageJson.version, piPackage.version);
  assert.match(css, /\.sidebar-header\[data-fit="2"\] \.sidebar-brand\.is-version \{[^}]*max-width: 100px;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;[^}]*line-height: 1;/);
  const wrapped = (text) => box("x".repeat(Math.ceil(text.length / 2)), 11);
  assert.ok(wrapped(versions) <= Math.min(room, 100), `${versions} at 11px in two lines`);
  assert.ok(wrapped(`${versions}0`) <= Math.min(room, 100), "and a digit more");
});

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/keter-screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});

console.log("→ open raffle screen");
await page.goto(`${BASE}/raffle-screen/keter-live-raffle`, { waitUntil: "networkidle" });
await page.waitForFunction(() => {
  const buttons = Array.from(document.querySelectorAll("button"));
  const spins = buttons.filter((b) => /^spin/i.test(b.textContent || ""));
  return spins.length >= 2 && spins.every((b) => !b.disabled);
}, { timeout: 15000 });
await page.waitForTimeout(500);

// Grab geometry of each wheel's container so we can clip screenshots to it
async function getWheelBoxes() {
  return await page.evaluate(() => {
    const giftTitle = Array.from(document.querySelectorAll("h3")).find((h) =>
      /GIFT CARD/.test(h.textContent || "")
    );
    const bookTitle = Array.from(document.querySelectorAll("h3")).find((h) =>
      /BOOK IN STORE/.test(h.textContent || "")
    );
    const giftCanvas = giftTitle?.parentElement?.querySelector("canvas");
    const bookCanvas = bookTitle?.parentElement?.querySelector("canvas");
    const bb = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { gift: bb(giftCanvas), book: bb(bookCanvas) };
  });
}

const boxes = await getWheelBoxes();
console.log("  gift canvas bbox:", JSON.stringify(boxes.gift));
console.log("  book canvas bbox:", JSON.stringify(boxes.book));

// Count how many canvases are in the DOM (must be exactly 2: one per wheel)
const canvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
console.log(`  canvas count in DOM: ${canvasCount} (expect 2)`);

// Click GIFT and sample the canvas pixels for both wheels during the confetti
console.log("\n→ click GIFT Spin");
const spinButtons = await page.getByRole("button", { name: /^spin/i }).all();
const clickT = Date.now();
await spinButtons[0].click();

// Wait until the gift overlay renders (post-16s spin)
await page.waitForSelector("text=WINNER", { timeout: 20000 });
console.log(`  gift WINNER at +${Date.now() - clickT}ms`);

// Wait for confetti to be actively emitting (~500ms into the burst)
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/U-gift-confetti-mid.png` });

// Read each canvas's pixel data. A canvas with active confetti should have a
// large number of non-transparent pixels; a quiet canvas should be empty.
const after1 = await page.evaluate(() => {
  function score(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const w = canvas.width, h = canvas.height;
    if (w === 0 || h === 0) return { width: w, height: h, nonEmpty: 0 };
    // Sample a 100x100 grid for performance
    const sampleW = Math.min(100, w);
    const sampleH = Math.min(100, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonEmpty = 0;
    const stepX = Math.max(1, Math.floor(w / sampleW));
    const stepY = Math.max(1, Math.floor(h / sampleH));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        // Any pixel with alpha > 0 counts as confetti
        if (data[i + 3] > 0) nonEmpty++;
      }
    }
    return { width: w, height: h, nonEmpty };
  }
  const canvases = Array.from(document.querySelectorAll("canvas"));
  return canvases.map(score);
});
console.log("  canvas-by-canvas non-empty pixel counts after gift spin:");
after1.forEach((s, i) => console.log(`    canvas[${i}]: ${JSON.stringify(s)}`));

// The first canvas in DOM order should be gift (because gift wheel appears first).
// We expect gift canvas to have substantial non-empty pixels; book canvas should be empty.
const giftHasParticles = (after1[0]?.nonEmpty ?? 0) > 50;
const bookHasParticles = (after1[1]?.nonEmpty ?? 0) > 50;
console.log(`  gift canvas has particles? ${giftHasParticles} (expect true)`);
console.log(`  book canvas has particles? ${bookHasParticles} (expect false)`);
console.log(`  ✅ confetti scoped to gift only? ${giftHasParticles && !bookHasParticles}`);

// Now click BOOK and verify the opposite
console.log("\n→ click BOOK Spin");
const buttons2 = await page.getByRole("button", { name: /^spin/i }).all();
console.log(`  spin buttons remaining: ${buttons2.length}`);
const bookClickT = Date.now();
await buttons2[0].click();

await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll("h2")).filter((h) =>
      /^WINNER$/i.test((h.textContent || "").trim())
    ).length >= 2,
  { timeout: 22000 }
);
console.log(`  book WINNER at +${Date.now() - bookClickT}ms`);

await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/V-book-confetti-mid.png` });

const after2 = await page.evaluate(() => {
  function score(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const w = canvas.width, h = canvas.height;
    if (w === 0 || h === 0) return { width: w, height: h, nonEmpty: 0 };
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonEmpty = 0;
    const stepX = Math.max(1, Math.floor(w / 100));
    const stepY = Math.max(1, Math.floor(h / 100));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 0) nonEmpty++;
      }
    }
    return { width: w, height: h, nonEmpty };
  }
  return Array.from(document.querySelectorAll("canvas")).map(score);
});
console.log("  canvas-by-canvas non-empty pixel counts during book confetti:");
after2.forEach((s, i) => console.log(`    canvas[${i}]: ${JSON.stringify(s)}`));

const bookHasNow = (after2[1]?.nonEmpty ?? 0) > 50;
console.log(`  book canvas has particles? ${bookHasNow} (expect true)`);
console.log(`  ✅ confetti scoped to book wheel only?`);

await page.screenshot({ path: `${OUT}/W-final.png` });

console.log("\nPage errors:", errors.length);
errors.forEach((e) => console.log("  " + e));

await browser.close();
console.log("\nDone.");

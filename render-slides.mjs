// node render-slides.mjs  ->  slides/slide-1.png ... slide-5.png (1080x1920)
import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
import path from "path";

const browser = await puppeteer.launch({ headless: "new", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + path.resolve("slides.html") + "?render", { waitUntil: "networkidle0" });
await page.waitForFunction("window.renderSlide");
mkdirSync("slides", { recursive: true });
const count = await page.evaluate(() => window.SLIDE_COUNT);
for (let i = 0; i < count; i++) {
  await page.evaluate((n) => window.renderSlide(n), i);
  await page.screenshot({ path: `slides/slide-${i + 1}.png` });
  console.log(`slides/slide-${i + 1}.png`);
}
await browser.close();
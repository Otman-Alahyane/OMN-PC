// npm i puppeteer  |  node render.mjs   (ffmpeg requis)
import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const FRAMES = 360, FPS = 30;
const browser = await puppeteer.launch({ headless: "new", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + path.resolve("preview.html") + "?render", { waitUntil: "networkidle0" });
await page.waitForFunction("window.renderFrame");
mkdirSync("frames", { recursive: true });
for (let f = 0; f < FRAMES; f++) {
  await page.evaluate((n) => window.renderFrame(n), f);
  await page.screenshot({ path: `frames/${String(f).padStart(4, "0")}.png` });
}
await browser.close();
execSync(`ffmpeg -y -framerate ${FPS} -i frames/%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 omnpc_tiktok.mp4`, { stdio: "inherit" });

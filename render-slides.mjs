// Usage :  node render-slides.mjs [id] [fichier.csv]
//   node render-slides.mjs        -> ligne id=1 du Google Sheets
//   node render-slides.mjs 3      -> ligne id=3
//   node render-slides.mjs 3 configs.csv  -> lit un CSV local au lieu du Sheets
import puppeteer from "puppeteer";
import { existsSync, readFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";

const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT4tfJ11NmT-PxEroLCjPhQ1YrEU_62ziDFq_HtlQXrqJ1WOjc-ga7iwdddUz3b2BdYM4TouScXIm3n/pub?output=csv";
const id = process.argv[2] || "1";
const localCsv = process.argv[3];

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...data] = rows.filter((r) => r.some((c) => c.trim()));
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

let csvText;
if (localCsv) { csvText = readFileSync(localCsv, "utf8"); console.log("CSV local :", localCsv); }
else { csvText = await (await fetch(SHEET)).text(); console.log("CSV : Google Sheets"); }
const row = parseCsv(csvText).find((r) => String(r.id) === String(id));
if (!row) { console.error(`❌ Aucune ligne avec id=${id}`); process.exit(1); }

const cfg = { ...row };
cfg.price = Number(row.price_total || row.price) || undefined;
if (row.cta_link) cfg.cta = row.cta_link;
delete cfg.accent; // le rouge de la marque (#D91E29) est fixe
for (const k of ["cpu", "gpu", "ram", "storage", "motherboard", "psu", "case", "cooling", "os"]) {
  const v = String(row[k + "_price"] ?? "").replace(/[^\d.,]/g, "").replace(",", ".");
  cfg[k + "_price"] = v === "" ? "" : Number(v);
}
if (!Object.keys(row).some((k) => k.endsWith("_price"))) console.warn("⚠️  Aucune colonne *_price (cpu_price, gpu_price...) dans le Sheets : les slides afficheront « Prix à jour sur le site ».");

// Image : on cherche le fichier (sans accent) à la racine ou dans images/
const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const wanted = path.basename(row.image_pc || row.image || "");
const files = [".", "images"].filter(existsSync).flatMap((d) => readdirSync(d).map((f) => path.join(d, f)));
const found = wanted && files.find((f) => strip(path.basename(f)).toLowerCase() === strip(wanted).toLowerCase());
cfg.image = found ? found.split(path.sep).join("/") : "";
if (!found) console.warn(`⚠️  Photo « ${wanted || "(vide)"} » introuvable : une silhouette sera dessinée à la place.`);

// Photos des composants dans images/ (noms français ou anglais, accents/majuscules ignorés)
// Ordre de recherche : colonne <composant>_image du Sheets, puis images/config-<id>/, images/<id>/, images/
const ALIASES = {
  cpu: ["cpu", "processeur"], gpu: ["gpu", "cartegraphique"], ram: ["ram", "memoire"],
  storage: ["storage", "ssd", "stockage", "nvme"], motherboard: ["motherboard", "cartemere"],
  psu: ["psu", "alimentation", "alim"], case: ["case", "boitier"],
  cooling: ["cooling", "ventirad", "refroidissement", "watercooling"], os: ["os", "windows"],
};
const exts = [".png", ".jpg", ".jpeg", ".webp", ".avif"];
const norm = (s) => strip(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const dirs = [`images/config-${id}`, `images/${id}`, "images"].filter(existsSync);
cfg.images = {};
for (const k of Object.keys(ALIASES)) {
  const custom = path.basename(row[k + "_image"] || "").toLowerCase();
  for (const d of dirs) {
    const f = readdirSync(d).find((n) => custom ? strip(n).toLowerCase() === strip(custom) : exts.includes(path.extname(n).toLowerCase()) && ALIASES[k].includes(norm(path.parse(n).name)));
    if (f) { cfg.images[k] = `${d}/${f}`; break; }
  }
}
console.log("Photos de composants trouvées :", Object.keys(cfg.images).join(", ") || "aucune (icônes à la place)");
const missing = ["cpu", "gpu", "ram", "storage"].filter((k) => !cfg.images[k]);
if (missing.length) console.warn(`⚠️  Pas de photo pour : ${missing.join(", ")} (une icône sera utilisée).`);

const browser = await puppeteer.launch({ headless: "new", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("requestfailed", (r) => console.warn("Echec de chargement :", r.url()));
page.on("pageerror", (e) => console.warn("Erreur de la page :", e.message));
await page.evaluateOnNewDocument((c) => { window.OMN_CONFIG = c; }, cfg);
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + path.resolve("slides.html") + "?render", { waitUntil: "networkidle0" });
await page.waitForFunction("window.renderSlide");
const out = path.join("slides", `config-${id}`);
mkdirSync(out, { recursive: true });
const count = await page.evaluate(() => window.SLIDE_COUNT);
for (let i = 0; i < count; i++) {
  await page.evaluate((n) => window.renderSlide(n), i);
  await page.screenshot({ path: path.join(out, `slide-${i + 1}.png`) });
  console.log(path.join(out, `slide-${i + 1}.png`));
}
await browser.close();

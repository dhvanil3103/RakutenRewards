import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true }); // overwrite in place: deleting dist can make Chrome fail to fetch scripts mid-rebuild
await build({
  entryPoints: { content: "src/content.ts", background: "src/background.ts", popup: "src/popup.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
  logLevel: "info",
});
cpSync("manifest.json", "dist/manifest.json");
cpSync("popup.html", "dist/popup.html");

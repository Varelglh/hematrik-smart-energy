/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyIfExists(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return false;
  fs.copyFileSync(srcPath, destPath);
  return true;
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const assetDir = path.join(projectRoot, "asset");
  const publicAssetDir = path.join(projectRoot, "public", "asset");

  ensureDir(publicAssetDir);

  const files = ["icon-logo.png", "font-logo.png"];
  let copied = 0;

  for (const file of files) {
    const ok = copyIfExists(path.join(assetDir, file), path.join(publicAssetDir, file));
    if (ok) copied += 1;
  }

  if (copied > 0) {
    console.log(`[sync-public-assets] Copied ${copied}/${files.length} file(s) to public/asset/`);
  } else {
    console.log("[sync-public-assets] No assets copied (asset folder empty or missing files)");
  }
}

main();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = join(__dirname, "../../../..");
const desktopRoot = join(repoRoot, "apps/desktop");

test("desktop package is configured for GitHub auto-update", () => {
  const packageJson = JSON.parse(
    readFileSync(join(desktopRoot, "package.json"), "utf8"),
  );

  assert.ok(
    packageJson.dependencies["electron-updater"],
    "electron-updater must be installed in desktop dependencies",
  );
  assert.deepEqual(packageJson.build.publish, [
    {
      provider: "github",
      owner: "CodeToIsekaii",
      repo: "SnapKO",
    },
  ]);
  assert.equal(
    packageJson.build.artifactName,
    "SnapKO.Desktop.Setup.${version}.${ext}",
  );
  assert.deepEqual(packageJson.build.win.target, ["nsis"]);
});

test("desktop main process checks for updates in packaged builds", () => {
  const mainProcess = readFileSync(
    join(desktopRoot, "src/main/index.ts"),
    "utf8",
  );

  assert.match(mainProcess, /from "electron-updater"/);
  assert.match(mainProcess, /checkForUpdates/);
  assert.match(mainProcess, /quitAndInstall/);
});

test("desktop release uploads updater metadata alongside the installer", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github/workflows/desktop-build.yml"),
    "utf8",
  );

  assert.match(workflow, /SnapKO\.Desktop\.Setup\.\*\.exe/);
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /\.blockmap/);
});

test("web download page accepts GitHub-safe desktop installer asset names", () => {
  const downloadPage = readFileSync(
    join(repoRoot, "apps/web-landing/app/download/page.tsx"),
    "utf8",
  );

  assert.match(downloadPage, /snapko\.desktop\.setup\./);
  assert.match(downloadPage, /asset.name.toLowerCase\(\)/);
  assert.match(downloadPage, /published_at:\s*string/);
});

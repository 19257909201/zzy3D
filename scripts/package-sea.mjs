import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")
);
const ARCHIVE_MODE = process.platform === "darwin" ? "sea-assets" : "footer";
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const SEA_MANIFEST_ASSET_KEY = "__web3d__/manifest.json";
const FOOTER_MAGIC = "WEB3DSEA_ARCHIVE_V1";
const FOOTER_MAGIC_BUFFER = Buffer.from(FOOTER_MAGIC, "utf8");
const FOOTER_SIZE = FOOTER_MAGIC_BUFFER.length + 8;

const productName = sanitizeSegment(
  process.env.APP_NAME || PACKAGE_JSON.name || "app"
);
const releaseTag = sanitizeSegment(
  process.env.RELEASE_TAG || `v${PACKAGE_JSON.version}`
);
const platformName = process.env.TARGET_OS || mapPlatform(process.platform);
const archName = process.env.TARGET_ARCH || mapArch(process.arch);
const targetId = sanitizeSegment(
  process.env.TARGET_ID || `${platformName}-${archName}`
);
const executableBaseName = `${productName}-${releaseTag}-${targetId}`;
const executableName =
  process.platform === "win32"
    ? `${executableBaseName}.exe`
    : executableBaseName;

const buildStandaloneDir = path.join(PROJECT_ROOT, ".next", "standalone");
const buildStaticDir = path.join(PROJECT_ROOT, ".next", "static");
const distDir = path.join(PROJECT_ROOT, "dist");
const seaWorkDir = path.join(distDir, "sea", targetId);
const releaseDir = path.join(distDir, "release");
const outputBinary = path.join(releaseDir, executableName);
const postjectCliPath = path.join(PROJECT_ROOT, "node_modules", "postject", "dist", "cli.js");

main();

function main() {
  ensureExists(
    path.join(buildStandaloneDir, "server.js"),
    "Missing .next/standalone/server.js. Run `npm run build` first."
  );
  ensureExists(
    buildStaticDir,
    "Missing .next/static. Run `npm run build` first."
  );

  fs.rmSync(seaWorkDir, { recursive: true, force: true });
  fs.rmSync(outputBinary, { force: true });
  fs.mkdirSync(seaWorkDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  const runtimeFiles = collectRuntimeFiles();
  const archiveManifest = createArchiveManifest(runtimeFiles);
  const bootstrapPath = path.join(seaWorkDir, "bootstrap.cjs");
  const manifestPath = path.join(seaWorkDir, "bundle-manifest.json");
  const seaConfigPath = path.join(seaWorkDir, "sea-config.json");
  const seaBlobPath = path.join(seaWorkDir, "sea-prep.blob");

  fs.writeFileSync(bootstrapPath, createBootstrapSource(), "utf8");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(archiveManifest, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: bootstrapPath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        ...(ARCHIVE_MODE === "sea-assets"
          ? { assets: buildSeaAssets(runtimeFiles, manifestPath) }
          : {}),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  run(process.execPath, ["--experimental-sea-config", seaConfigPath]);

  fs.copyFileSync(process.execPath, outputBinary);
  if (process.platform !== "win32") {
    fs.chmodSync(outputBinary, 0o755);
  }

  if (process.platform === "darwin") {
    run("codesign", ["--remove-signature", outputBinary]);
  }

  const postjectArgs = [
    postjectCliPath,
    outputBinary,
    "NODE_SEA_BLOB",
    seaBlobPath,
    "--sentinel-fuse",
    SENTINEL_FUSE,
  ];

  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }

  run(process.execPath, postjectArgs);

  if (ARCHIVE_MODE === "footer") {
    appendRuntimeArchive(outputBinary, runtimeFiles, archiveManifest);
  }

  if (process.platform === "darwin") {
    run("codesign", ["--sign", "-", outputBinary]);
  }

  exposeGithubOutputs();

  console.log(`Created single-file executable: ${outputBinary}`);
}

function collectRuntimeFiles() {
  const filesByPath = new Map();

  addDirectoryToRuntimeFiles(filesByPath, buildStandaloneDir, "", {
    skipDirectories: new Set(["glbfile"]),
  });
  addDirectoryToRuntimeFiles(filesByPath, buildStaticDir, ".next/static");
  addOptionalDirectory(filesByPath, "public");
  addOptionalDirectory(filesByPath, "glbfile");

  return [...filesByPath.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

function addOptionalDirectory(filesByPath, directory) {
  const absoluteDir = path.join(PROJECT_ROOT, directory);

  if (!fs.existsSync(absoluteDir)) {
    return;
  }

  addDirectoryToRuntimeFiles(filesByPath, absoluteDir, directory);
}

function addDirectoryToRuntimeFiles(
  filesByPath,
  sourceRoot,
  targetPrefix,
  options = {}
) {
  const skipDirectories = options.skipDirectories || new Set();

  for (const absolutePath of walkFiles(sourceRoot, skipDirectories)) {
    const relativeFromRoot = toPosixPath(path.relative(sourceRoot, absolutePath));
    const relativePath = targetPrefix
      ? `${targetPrefix}/${relativeFromRoot}`
      : relativeFromRoot;

    filesByPath.set(relativePath, {
      assetKey: toAssetKey(relativePath),
      absolutePath,
      relativePath,
    });
  }
}

function walkFiles(directory, skipDirectories) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (skipDirectories.has(entry.name)) {
        continue;
      }

      files.push(...walkFiles(absolutePath, skipDirectories));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function createArchiveManifest(runtimeFiles) {
  const buildSeed = [
    productName,
    releaseTag,
    targetId,
    process.env.GITHUB_SHA || "",
    `${runtimeFiles.length}`,
    ...runtimeFiles.map((file) => {
      const stat = fs.statSync(file.absolutePath);
      return `${file.relativePath}:${stat.size}:${stat.mtimeMs}`;
    }),
  ].join("|");

  return {
    version: 1,
    productName,
    releaseTag,
    targetId,
    bundleId: createHash("sha256").update(buildSeed).digest("hex").slice(0, 16),
    payloadSize: 0,
    files: runtimeFiles.map((file) => ({
      assetKey: file.assetKey,
      path: file.relativePath,
      offset: 0,
      size: 0,
      originalSize: fs.statSync(file.absolutePath).size,
      compression: "raw",
    })),
  };
}

function appendRuntimeArchive(binaryPath, runtimeFiles, archiveManifest) {
  const fd = fs.openSync(binaryPath, "a");

  try {
    let payloadOffset = 0;

    for (const [index, file] of runtimeFiles.entries()) {
      const source = fs.readFileSync(file.absolutePath);
      const compressed = brotliCompressSync(source, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
        },
      });
      const useCompressed = compressed.length < source.length;
      const output = useCompressed ? compressed : source;

      fs.writeSync(fd, output);

      archiveManifest.files[index].offset = payloadOffset;
      archiveManifest.files[index].size = output.length;
      archiveManifest.files[index].compression = useCompressed ? "br" : "raw";

      payloadOffset += output.length;
    }

    archiveManifest.payloadSize = payloadOffset;

    const manifestBuffer = Buffer.from(
      JSON.stringify(archiveManifest),
      "utf8"
    );
    const footerBuffer = Buffer.alloc(FOOTER_SIZE);

    FOOTER_MAGIC_BUFFER.copy(footerBuffer, 0);
    footerBuffer.writeBigUInt64LE(
      BigInt(manifestBuffer.length),
      FOOTER_MAGIC_BUFFER.length
    );

    fs.writeSync(fd, manifestBuffer);
    fs.writeSync(fd, footerBuffer);
  } finally {
    fs.closeSync(fd);
  }
}

function createBootstrapSource() {
  if (ARCHIVE_MODE === "sea-assets") {
    return `"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sea = require("node:sea");
const { createRequire } = require("node:module");

const MANIFEST_ASSET_KEY = ${JSON.stringify(SEA_MANIFEST_ASSET_KEY)};
const manifest = JSON.parse(sea.getAsset(MANIFEST_ASSET_KEY, "utf8"));
const extractRoot = path.join(
  os.tmpdir(),
  \`\${manifest.productName}-sea-\${manifest.bundleId}-\${manifest.targetId}\`
);
const readyFile = path.join(extractRoot, ".sea-ready.json");
const appRoot = ensureExtracted();
const serverEntry = path.join(appRoot, "server.js");

if (!fs.existsSync(serverEntry)) {
  console.error("Unable to locate extracted Next.js server at", serverEntry);
  process.exit(1);
}

process.chdir(appRoot);
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";
process.env.NEXT_TELEMETRY_DISABLED =
  process.env.NEXT_TELEMETRY_DISABLED || "1";

const requireFromApp = createRequire(serverEntry);
requireFromApp("./server.js");

function ensureExtracted() {
  if (isReady()) {
    return extractRoot;
  }

  const stagingRoot = \`\${extractRoot}.staging-\${process.pid}-\${Date.now()}\`;

  fs.rmSync(stagingRoot, { recursive: true, force: true });

  for (const file of manifest.files) {
    const output = Buffer.from(sea.getAsset(file.assetKey));
    const destinationPath = path.join(stagingRoot, file.path);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, output);
  }

  fs.writeFileSync(
    path.join(stagingRoot, ".sea-ready.json"),
    JSON.stringify({
      bundleId: manifest.bundleId,
      fileCount: manifest.files.length,
    }),
    "utf8"
  );

  try {
    fs.renameSync(stagingRoot, extractRoot);
  } catch (error) {
    if (!isReady()) {
      throw error;
    }

    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  return extractRoot;
}

function isReady() {
  try {
    const state = JSON.parse(fs.readFileSync(readyFile, "utf8"));
    return (
      state.bundleId === manifest.bundleId &&
      fs.existsSync(path.join(extractRoot, "server.js"))
    );
  } catch {
    return false;
  }
}
`;
  }

  return `"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { brotliDecompressSync } = require("node:zlib");

const FOOTER_MAGIC = ${JSON.stringify(FOOTER_MAGIC)};
const FOOTER_MAGIC_BUFFER = Buffer.from(FOOTER_MAGIC, "utf8");
const FOOTER_SIZE = FOOTER_MAGIC_BUFFER.length + 8;

const archive = readArchiveMetadata(process.execPath);
const manifest = archive.manifest;
const extractRoot = path.join(
  os.tmpdir(),
  \`\${manifest.productName}-sea-\${manifest.bundleId}-\${manifest.targetId}\`
);
const readyFile = path.join(extractRoot, ".sea-ready.json");
const appRoot = ensureExtracted(archive);
const serverEntry = path.join(appRoot, "server.js");

if (!fs.existsSync(serverEntry)) {
  console.error("Unable to locate extracted Next.js server at", serverEntry);
  process.exit(1);
}

process.chdir(appRoot);
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";
process.env.NEXT_TELEMETRY_DISABLED =
  process.env.NEXT_TELEMETRY_DISABLED || "1";

const requireFromApp = createRequire(serverEntry);
requireFromApp("./server.js");

function ensureExtracted(archive) {
  if (isReady()) {
    return extractRoot;
  }

  const stagingRoot = \`\${extractRoot}.staging-\${process.pid}-\${Date.now()}\`;

  fs.rmSync(stagingRoot, { recursive: true, force: true });

  for (const file of archive.manifest.files) {
    const compressed = readRange(
      archive.fd,
      archive.payloadStart + file.offset,
      file.size
    );
    const output =
      file.compression === "br"
        ? brotliDecompressSync(compressed)
        : compressed;
    const destinationPath = path.join(stagingRoot, file.path);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, output);
  }

  fs.writeFileSync(
    path.join(stagingRoot, ".sea-ready.json"),
    JSON.stringify({
      bundleId: archive.manifest.bundleId,
      fileCount: archive.manifest.files.length,
    }),
    "utf8"
  );

  try {
    fs.renameSync(stagingRoot, extractRoot);
  } catch (error) {
    if (!isReady()) {
      throw error;
    }

    fs.rmSync(stagingRoot, { recursive: true, force: true });
  } finally {
    fs.closeSync(archive.fd);
  }

  return extractRoot;
}

function isReady() {
  try {
    const state = JSON.parse(fs.readFileSync(readyFile, "utf8"));
    return (
      state.bundleId === manifest.bundleId &&
      fs.existsSync(path.join(extractRoot, "server.js"))
    );
  } catch {
    return false;
  }
}

function readArchiveMetadata(executablePath) {
  const fd = fs.openSync(executablePath, "r");
  const stat = fs.fstatSync(fd);
  const footer = readRange(fd, stat.size - FOOTER_SIZE, FOOTER_SIZE);

  if (
    footer.subarray(0, FOOTER_MAGIC_BUFFER.length).compare(FOOTER_MAGIC_BUFFER) !==
    0
  ) {
    throw new Error("Embedded runtime archive footer not found.");
  }

  const manifestLength = Number(
    footer.readBigUInt64LE(FOOTER_MAGIC_BUFFER.length)
  );
  const manifestStart = stat.size - FOOTER_SIZE - manifestLength;
  const manifestBuffer = readRange(fd, manifestStart, manifestLength);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));

  return {
    fd,
    manifest,
    payloadStart: manifestStart - manifest.payloadSize,
  };
}

function readRange(fd, position, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;

  while (offset < length) {
    const bytesRead = fs.readSync(fd, buffer, offset, length - offset, position + offset);

    if (bytesRead === 0) {
      throw new Error("Unexpected EOF while reading embedded runtime archive.");
    }

    offset += bytesRead;
  }

  return buffer;
}
`;
}

function mapPlatform(platform) {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      return platform;
  }
}

function mapArch(arch) {
  switch (arch) {
    case "x64":
      return "x64";
    case "arm64":
      return "arm64";
    default:
      return arch;
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function toAssetKey(relativePath) {
  return `__web3d__/${relativePath}`;
}

function buildSeaAssets(runtimeFiles, manifestPath) {
  const assets = {
    [SEA_MANIFEST_ASSET_KEY]: manifestPath,
  };

  for (const file of runtimeFiles) {
    assets[file.assetKey] = file.absolutePath;
  }

  return assets;
}

function sanitizeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(
      `Command failed to start (${command} ${args.join(" ")}): ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}), exit code: ${result.status}, signal: ${result.signal ?? "none"}`
    );
  }
}

function exposeGithubOutputs() {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (!githubOutput) {
    return;
  }

  fs.appendFileSync(
    githubOutput,
    [
      `executable_name=${executableName}`,
      `executable_path=${outputBinary}`,
      "",
    ].join("\n"),
    "utf8"
  );
}

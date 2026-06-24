import { createHash } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, posix, resolve } from "node:path";

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export type CatalogImageSource =
  | {
    kind: "id";
    imageId: string;
    sourceField: "imageId" | "image";
  }
  | {
    kind: "default";
    imageId: string;
    sourceField: "defaultImageId";
  }
  | {
    kind: "file";
    imageFile: string;
    resolvedPath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }
  | {
    kind: "url";
    imageUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  };

export type CatalogImageResolveOptions = {
  catalogFilePath: string;
  projectRoot?: string;
  publicDir?: string;
};

export type ImageUploadAsset = {
  sourceKind: "file" | "url";
  source: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  buffer: Buffer;
};

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function supportedImageMimeTypes(): string[] {
  return Array.from(SUPPORTED_IMAGE_MIME_TYPES);
}

export async function inspectImageFile(
  imageFile: string,
  options: CatalogImageResolveOptions,
): Promise<CatalogImageSource> {
  const resolvedPath = await resolveExistingImagePath(imageFile, options);
  const info = await stat(resolvedPath);
  if (!info.isFile()) {
    throw new Error(`imageFile must point to a file: ${resolvedPath}`);
  }
  if (info.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error(formatTooLarge(info.size));
  }

  const buffer = await readFile(resolvedPath);
  const mimeType = detectImageMime(buffer);
  if (!mimeType) {
    throw new Error(formatUnsupportedMime());
  }

  return {
    kind: "file",
    imageFile,
    resolvedPath,
    fileName: basename(resolvedPath),
    mimeType,
    sizeBytes: info.size,
    sha256: sha256Hex(buffer),
  };
}

export async function inspectImageUrl(imageUrl: string): Promise<CatalogImageSource> {
  const asset = await downloadImage(imageUrl);
  return {
    kind: "url",
    imageUrl,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
  };
}

export async function loadImageUploadAsset(source: CatalogImageSource): Promise<ImageUploadAsset> {
  if (source.kind === "file") {
    const buffer = await readFile(source.resolvedPath);
    const mimeType = detectImageMime(buffer);
    if (!mimeType) {
      throw new Error(`Catalog image ${source.imageFile} is no longer a supported image file.`);
    }
    const sha256 = sha256Hex(buffer);
    return {
      sourceKind: "file",
      source: source.resolvedPath,
      fileName: source.fileName,
      mimeType,
      sizeBytes: buffer.byteLength,
      sha256,
      buffer,
    };
  }

  if (source.kind === "url") {
    return downloadImage(source.imageUrl);
  }

  throw new Error("imageId sources do not need uploading");
}

export function createImageUploadFormFromAsset(asset: ImageUploadAsset): FormData {
  const form = new FormData();
  const arrayBuffer = asset.buffer.buffer.slice(
    asset.buffer.byteOffset,
    asset.buffer.byteOffset + asset.buffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: asset.mimeType });
  form.append("file", blob, asset.fileName);
  return form;
}

function resolveCandidateRoots(options: CatalogImageResolveOptions): string[] {
  const catalogDir = dirname(resolve(options.catalogFilePath));
  const roots: string[] = [catalogDir];
  if (options.projectRoot) roots.push(resolve(options.projectRoot));
  if (options.publicDir) {
    roots.push(
      isAbsolute(options.publicDir)
        ? resolve(options.publicDir)
        : resolve(options.projectRoot ? resolve(options.projectRoot) : catalogDir, options.publicDir),
    );
  }
  return Array.from(new Set(roots));
}

async function resolveExistingImagePath(
  imageFile: string,
  options: CatalogImageResolveOptions,
): Promise<string> {
  const raw = imageFile.trim();
  const strippedRootRelative = raw.replace(/^[\\/]+/, "");
  const candidates = isAbsolute(raw) && !options.publicDir
    ? [resolve(raw)]
    : resolveCandidateRoots(options).map((root) => resolve(root, raw.startsWith("/") || raw.startsWith("\\") ? strippedRootRelative : raw));

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw new Error(`imageFile not found. Tried: ${Array.from(new Set(candidates)).join(", ")}`);
}

async function downloadImage(imageUrl: string): Promise<ImageUploadAsset> {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error("imageUrl must be a valid http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("imageUrl must use http:// or https://");
  }

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not download imageUrl: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not download imageUrl: HTTP ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error(formatTooLarge(declaredLength));
  }

  const buffer = await readResponseBuffer(response, PRODUCT_IMAGE_MAX_BYTES + 1);
  if (buffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error(formatTooLarge(buffer.byteLength));
  }

  const headerMime = normalizeMime(response.headers.get("content-type"));
  const detectedMime = detectImageMime(buffer);
  const mimeType = detectedMime ?? headerMime;
  if (!mimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(formatUnsupportedMime(headerMime));
  }

  const sha256 = sha256Hex(buffer);
  return {
    sourceKind: "url",
    source: imageUrl,
    fileName: fileNameFromUrl(url, mimeType),
    mimeType,
    sizeBytes: buffer.byteLength,
    sha256,
    buffer,
  };
}

async function readResponseBuffer(response: Response, limitBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.from(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total > limitBytes) break;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks, total);
}

function detectImageMime(buffer: Buffer): string | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  const asciiStart = buffer.subarray(0, 6).toString("ascii");
  if (asciiStart === "GIF87a" || asciiStart === "GIF89a") {
    return "image/gif";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

function normalizeMime(value: string | null): string | undefined {
  if (!value) return undefined;
  const mime = value.split(";")[0]?.trim().toLowerCase();
  return mime && SUPPORTED_IMAGE_MIME_TYPES.has(mime) ? mime : undefined;
}

function fileNameFromUrl(url: URL, mimeType: string): string {
  const rawName = decodeURIComponent(posix.basename(url.pathname || ""));
  const safeName = rawName && rawName !== "/" ? rawName.replace(/[^\w. -]+/g, "-") : `product-image${EXTENSION_BY_MIME[mimeType]}`;
  return extname(safeName) ? safeName : `${safeName}${EXTENSION_BY_MIME[mimeType]}`;
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatTooLarge(sizeBytes: number): string {
  return `Image file is ${sizeBytes} bytes; product images must not exceed ${PRODUCT_IMAGE_MAX_BYTES} bytes.`;
}

function formatUnsupportedMime(actual?: string): string {
  const suffix = actual ? ` Got ${actual}.` : "";
  return `Unsupported product image MIME type.${suffix} Supported types: ${supportedImageMimeTypes().join(", ")}.`;
}

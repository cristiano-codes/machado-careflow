const DEFAULT_FAVICON_HREF = "/favicon.ico";
const DEFAULT_APPLE_TOUCH_HREF = "/logo.png";
const MAX_DATA_URL_BYTES = 120 * 1024;

function withVersion(href: string, versionKey?: string): string {
  if (!versionKey) return href;

  const encodedVersion = encodeURIComponent(versionKey);
  if (href.startsWith("data:")) {
    return `${href}#v=${encodedVersion}`;
  }

  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}v=${encodedVersion}`;
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function resolveVersionKey(logoDataUrl: string, versionKey?: string): string {
  if (versionKey && versionKey.trim().length > 0) return versionKey.trim();
  return `${logoDataUrl.length.toString(36)}-${shortHash(logoDataUrl)}`;
}

function getDataUrlSizeBytes(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).length;
}

function isPngDataUrl(logoDataUrl: string): boolean {
  return logoDataUrl.startsWith("data:image/png;base64,");
}

function applyFallback(versionKey?: string) {
  const iconLink = getOrCreateLink("icon");
  iconLink.rel = "icon";
  iconLink.removeAttribute("type");
  iconLink.setAttribute("sizes", "any");
  iconLink.href = withVersion(DEFAULT_FAVICON_HREF, versionKey);

  const appleTouchLink = getOrCreateLink("apple-touch-icon");
  appleTouchLink.rel = "apple-touch-icon";
  appleTouchLink.removeAttribute("type");
  appleTouchLink.setAttribute("sizes", "180x180");
  appleTouchLink.href = withVersion(DEFAULT_APPLE_TOUCH_HREF, versionKey);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao carregar imagem para favicon."));
    image.src = src;
  });
}

async function toPngDataUrl(sourceDataUrl: string, size: number): Promise<string> {
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Falha ao criar contexto de canvas para favicon.");
  }

  const ratio = Math.min(size / image.width, size / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  return canvas.toDataURL("image/png");
}

export function getOrCreateLink(rel: string): HTMLLinkElement {
  const selector = `link[rel="${rel}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (existing) return existing;

  const link = document.createElement("link");
  link.setAttribute("rel", rel);
  document.head.appendChild(link);
  return link;
}

export async function updateFaviconFromLogo(
  logoDataUrl: string | null,
  versionKey?: string
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const normalizedLogo = logoDataUrl?.trim() ?? "";
  if (!normalizedLogo || !isPngDataUrl(normalizedLogo)) {
    applyFallback(versionKey);
    return;
  }

  const resolvedVersion = resolveVersionKey(normalizedLogo, versionKey);

  try {
    const faviconDataUrl = await toPngDataUrl(normalizedLogo, 32);
    if (getDataUrlSizeBytes(faviconDataUrl) > MAX_DATA_URL_BYTES) {
      applyFallback(resolvedVersion);
      return;
    }

    const iconLink = getOrCreateLink("icon");
    iconLink.rel = "icon";
    iconLink.type = "image/png";
    iconLink.setAttribute("sizes", "32x32");
    iconLink.href = withVersion(faviconDataUrl, resolvedVersion);

    const appleTouchDataUrl = await toPngDataUrl(normalizedLogo, 180);
    const appleTouchLink = getOrCreateLink("apple-touch-icon");
    appleTouchLink.rel = "apple-touch-icon";
    appleTouchLink.type = "image/png";
    appleTouchLink.setAttribute("sizes", "180x180");

    if (getDataUrlSizeBytes(appleTouchDataUrl) > MAX_DATA_URL_BYTES) {
      appleTouchLink.href = withVersion(DEFAULT_APPLE_TOUCH_HREF, resolvedVersion);
      appleTouchLink.removeAttribute("type");
    } else {
      appleTouchLink.href = withVersion(appleTouchDataUrl, resolvedVersion);
    }
  } catch (error) {
    console.warn("Nao foi possivel atualizar favicon dinamico.", error);
    applyFallback(resolvedVersion);
  }
}

// Public projection only: no draft identifiers, private storage keys or signed URLs.
export type PublishedImage = { src: string; alt: string; caption: string; width: number; height: number };
export type PublishedMediaBlock =
  | { type: "image"; version: 1; image: PublishedImage }
  | { type: "gallery"; version: 1; images: readonly PublishedImage[] };

export function isPublishedMediaPath(value: unknown): value is string {
  return typeof value === "string" && /^\/blog\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(value);
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key)))
    throw new Error("Invalid published media");
  return value as Record<string, unknown>;
}
function dimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20000;
}
export function decodePublishedImage(value: unknown): PublishedImage {
  const image = record(value, ["src", "alt", "caption", "width", "height"]);
  if (!isPublishedMediaPath(image.src) ||
      typeof image.alt !== "string" || !image.alt.trim() || image.alt.length > 500 ||
      typeof image.caption !== "string" || image.caption.length > 1000 ||
      !dimension(image.width) || !dimension(image.height)) throw new Error("Invalid published image");
  return { src: image.src, alt: image.alt, caption: image.caption, width: image.width, height: image.height };
}
export function decodePublishedMediaBlock(value: unknown): PublishedMediaBlock {
  if (!value || typeof value !== "object") throw new Error("Invalid published media");
  const kind = (value as Record<string, unknown>).type;
  if (kind === "image") {
    const block = record(value, ["type", "version", "image"]);
    if (block.version !== 1) throw new Error("Invalid published media version");
    return { type: kind, version: 1, image: decodePublishedImage(block.image) };
  }
  if (kind === "gallery") {
    const block = record(value, ["type", "version", "images"]);
    if (block.version !== 1 || !Array.isArray(block.images) || block.images.length < 2 || block.images.length > 8)
      throw new Error("Invalid published gallery");
    const images = block.images.map(decodePublishedImage);
    if (new Set(images.map(image => image.src)).size !== images.length) throw new Error("Duplicate gallery image");
    return { type: kind, version: 1, images };
  }
  throw new Error("Invalid published media kind");
}
export function isPublicCoverPath(value: unknown): value is string {
  // Preserve the existing same-origin legacy static cover contract, but
  // reserve the entire media namespace for canonical UUID JPEG paths.
  return typeof value === "string" && /^\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(value) &&
    !value.split("/").some(segment => segment === "." || segment === ".." || !segment && value.includes("//")) &&
    (!/^\/blog\/media(?:\/|$)/i.test(value) || isPublishedMediaPath(value));
}

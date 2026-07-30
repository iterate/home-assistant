import { readFile } from "node:fs/promises";
import { z } from "zod";

const RawOptions = z
  .object({
    iterate_url: z.string().url(),
    project_slug: z.string().min(1).max(100),
    project_secret: z.string().min(1),
    itx_path: z.string().min(1).max(200),
    stream_path: z.string().min(1).max(200),
  })
  .strict();

const IDENTIFIER = /^[$A-Z_a-z][$\w]*$/;
const UNSAFE_PATH_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "inspect",
  "prototype",
  "then",
  "toJSON",
]);

export type BridgeConfig = {
  iterateUrl: string;
  itxPath: string[];
  projectSecret: string;
  projectSlug: string;
  streamPath: string;
};

export function parseOptions(input: unknown): BridgeConfig {
  const raw = RawOptions.parse(input);
  const projectSecret = raw.project_secret.trim();
  const projectSlug = raw.project_slug.trim();
  if (!projectSecret) throw new Error("project_secret must not be blank");
  if (!projectSlug) throw new Error("project_slug must not be blank");

  const iterateUrl = new URL(raw.iterate_url);
  if (iterateUrl.protocol !== "https:" && iterateUrl.protocol !== "http:") {
    throw new Error("iterate_url must use http or https");
  }
  if (iterateUrl.username || iterateUrl.password) {
    throw new Error("iterate_url must not contain credentials");
  }

  return {
    iterateUrl: iterateUrl.toString().replace(/\/$/, ""),
    itxPath: parseItxPath(raw.itx_path),
    projectSecret,
    projectSlug,
    streamPath: parseStreamPath(raw.stream_path),
  };
}

export function parseItxPath(value: string): string[] {
  const segments = value
    .trim()
    .split(".")
    .map((segment) => segment.trim());

  if (segments[0]?.toLowerCase() === "itx") segments.shift();
  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0)
  ) {
    throw new Error("itx_path must contain at least one dotted path segment");
  }

  for (const segment of segments) {
    if (!IDENTIFIER.test(segment)) {
      throw new Error(`Invalid itx_path segment ${JSON.stringify(segment)}`);
    }
    if (UNSAFE_PATH_SEGMENTS.has(segment)) {
      throw new Error(`Unsafe itx_path segment ${JSON.stringify(segment)}`);
    }
  }
  return segments;
}

export function parseStreamPath(value: string): string {
  const withLeadingSlash = value.trim().startsWith("/")
    ? value.trim()
    : `/${value.trim()}`;
  const normalized =
    withLeadingSlash.length > 1
      ? withLeadingSlash.replace(/\/+$/, "")
      : withLeadingSlash;

  if (normalized.length > 200)
    throw new Error("stream_path must be at most 200 characters");
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("stream_path must not contain control characters");
  }
  const segments = normalized.slice(1).split("/");
  if (
    normalized === "/" ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      "stream_path must be an absolute path with non-empty segments",
    );
  }
  return normalized;
}

export async function loadConfig(
  optionsPath = process.env.OPTIONS_PATH ?? "/data/options.json",
): Promise<BridgeConfig> {
  const source = await readFile(optionsPath, "utf8");
  return parseOptions(JSON.parse(source) as unknown);
}

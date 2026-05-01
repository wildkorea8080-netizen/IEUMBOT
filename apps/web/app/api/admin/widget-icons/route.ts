import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

const WIDGET_ICON_ROOT = path.join(process.cwd(), "public", "widget-icons");
const CUSTOM_ICON_DIR = path.join(WIDGET_ICON_ROOT, "custom");
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const EXCLUDED_FILES = new Set(["appswebpublicwidget-icons.png"]);

export const runtime = "nodejs";

type WidgetIconAsset = {
  id: string;
  name: string;
  url: string;
  deletable: boolean;
};

function getApiBaseUrl(): string {
  const envBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.WEB_PUBLIC_API_BASE_URL ??
    "http://localhost:8000/api";

  return envBaseUrl.endsWith("/") ? envBaseUrl.slice(0, -1) : envBaseUrl;
}

async function authorize(request: NextRequest): Promise<NextResponse | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "UNAUTHORIZED" }, { status: 401 });
  }

  const response = await fetch(`${getApiBaseUrl()}/admin/chatbots`, {
    method: "GET",
    headers: { Authorization: authorization },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ detail: "UNAUTHORIZED" }, { status: 401 });
  }

  return null;
}

function toLabel(fileName: string): string {
  return fileName
    .replace(path.extname(fileName), "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIconUrl(filePath: string): string {
  const relative = path.relative(path.join(process.cwd(), "public"), filePath).split(path.sep).join("/");
  return `/${relative}`;
}

async function collectIcons(dirPath: string): Promise<WidgetIconAsset[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const items: WidgetIconAsset[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      items.push(...(await collectIcons(entryPath)));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      continue;
    }
    if (EXCLUDED_FILES.has(entry.name)) {
      continue;
    }

    const url = toIconUrl(entryPath);
    items.push({
      id: url,
      name: toLabel(entry.name),
      url,
      deletable: true,
    });
  }

  return items.sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

function resolveManagedFile(url: string): string | null {
  if (!url.startsWith("/widget-icons/")) {
    return null;
  }
  const relative = url.replace("/widget-icons/", "");
  const absolute = path.resolve(WIDGET_ICON_ROOT, relative);
  const normalizedRoot = path.resolve(WIDGET_ICON_ROOT);
  if (!absolute.startsWith(normalizedRoot)) {
    return null;
  }
  if (EXCLUDED_FILES.has(path.basename(absolute))) {
    return null;
  }
  return absolute;
}

export async function GET(request: NextRequest) {
  const unauthorized = await authorize(request);
  if (unauthorized) return unauthorized;

  await mkdir(CUSTOM_ICON_DIR, { recursive: true });
  const items = await collectIcons(WIDGET_ICON_ROOT);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const unauthorized = await authorize(request);
  if (unauthorized) return unauthorized;

  await mkdir(CUSTOM_ICON_DIR, { recursive: true });
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "ICON_FILE_REQUIRED" }, { status: 400 });
  }

  const extension = path.extname(file.name || "").toLowerCase();
  const safeExtension = ALLOWED_EXTENSIONS.has(extension) ? extension : ".png";
  const safeBaseName = (path.basename(file.name || "widget-icon", extension) || "widget-icon")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "widget-icon";
  const fileName = `${Date.now()}-${safeBaseName}${safeExtension}`;
  const destination = path.join(CUSTOM_ICON_DIR, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(destination, bytes);

  return NextResponse.json({
    id: `/widget-icons/custom/${fileName}`,
    name: toLabel(fileName),
    url: `/widget-icons/custom/${fileName}`,
    deletable: true,
  } satisfies WidgetIconAsset);
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await authorize(request);
  if (unauthorized) return unauthorized;

  const payload = (await request.json().catch(() => null)) as { url?: string } | null;
  const targetUrl = payload?.url?.trim();
  if (!targetUrl) {
    return NextResponse.json({ detail: "ICON_URL_REQUIRED" }, { status: 400 });
  }

  const targetFile = resolveManagedFile(targetUrl);
  if (!targetFile) {
    return NextResponse.json({ detail: "INVALID_ICON_URL" }, { status: 400 });
  }

  const currentStat = await stat(targetFile).catch(() => null);
  if (!currentStat?.isFile()) {
    return NextResponse.json({ detail: "ICON_NOT_FOUND" }, { status: 404 });
  }

  await unlink(targetFile);
  return new NextResponse(null, { status: 204 });
}

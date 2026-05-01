import { NextRequest, NextResponse } from "next/server";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getApiBaseUrl(): string {
  const envBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.WEB_PUBLIC_API_BASE_URL ??
    "http://localhost:8000/api";
  return envBaseUrl.endsWith("/") ? envBaseUrl.slice(0, -1) : envBaseUrl;
}

function buildTargetUrl(path: string[], request: NextRequest): string {
  const pathname = path.join("/");
  const search = request.nextUrl.search || "";
  return `${getApiBaseUrl()}/${pathname}${search}`;
}

async function proxy(request: NextRequest, params: { path: string[] }) {
  const targetUrl = buildTargetUrl(params.path, request);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "BACKEND_PROXY_FAILED";
    return NextResponse.json({ detail }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

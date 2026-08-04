import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

/**
 * 업로드된 런처 아이콘 파일 서빙 (공개 · 인증 없음).
 *
 * 왜 필요한가: Next.js는 정적 파일 목록을 빌드 시점에 확정하므로, 실행 중에
 * public/ 아래에 새로 쓴 파일은 서빙하지 않는다(디스크에는 있는데 URL은 404).
 * 그래서 업로드분만 이 라우트로 직접 읽어 내려준다. 저장소에 커밋된 기본
 * 아이콘은 빌드에 포함돼 있어 기존 정적 경로 그대로 동작한다.
 *
 * 인증을 걸지 않는 이유: 이 URL은 기관 홈페이지에 삽입된 위젯이 불러가므로
 * 누구나 접근 가능해야 한다. 노출되는 것은 관리자가 직접 올린 런처 이미지뿐이다.
 */

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 실행 위치(cwd)가 apps/web 인지 저장소 루트인지에 따라 달라지는 public 경로를 찾는다. */
function resolveCustomIconDir(): string {
  const candidates = [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "apps", "web", "public"),
  ];
  const publicRoot = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  return path.join(publicRoot, "widget-icons", "custom");
}

export async function GET(_request: NextRequest, context: { params: { name: string } }) {
  const rawName = context.params.name ?? "";
  // 경로 탈출 차단 — 파일명만 허용하고 디렉터리 구분자는 받지 않는다.
  const fileName = path.basename(decodeURIComponent(rawName));
  if (!fileName || fileName !== rawName.replace(/^.*\//, "")) {
    return NextResponse.json({ detail: "INVALID_ICON_NAME" }, { status: 400 });
  }

  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ detail: "UNSUPPORTED_ICON_TYPE" }, { status: 400 });
  }

  const customDir = resolveCustomIconDir();
  const filePath = path.join(customDir, fileName);
  // path.join 이후에도 custom 디렉터리 밖을 가리키지 않는지 다시 확인.
  if (!path.resolve(filePath).startsWith(path.resolve(customDir))) {
    return NextResponse.json({ detail: "INVALID_ICON_NAME" }, { status: 400 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ detail: "ICON_NOT_FOUND" }, { status: 404 });
    }
    const body = await readFile(filePath);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        // 파일명에 업로드 시각이 들어가 있어 내용이 바뀌면 URL도 바뀐다 → 길게 캐시해도 안전.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ detail: "ICON_NOT_FOUND" }, { status: 404 });
  }
}

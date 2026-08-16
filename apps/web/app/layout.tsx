import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "IEUMBOT 관리자",
  description: "IEUMBOT 관리자 콘솔"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add("js-motion")`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

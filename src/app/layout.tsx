import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "ARBITER / AI対戦裁定機構",
  description:
    "自由文でキャラクターを作り、AI審判が能力を解釈し、構造化された戦闘状態の上で勝敗を裁定するブラウザ対戦ゲーム。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="shell">
          <SiteHeader />
          {children}
          <footer className="site-footer">
            <span>ARBITER ／ AI BATTLE ADJUDICATION ENGINE</span>
            <span>能力解釈・状態管理・整合性監査</span>
            <span>RULESET v1.0</span>
          </footer>
        </div>
      </body>
    </html>
  );
}

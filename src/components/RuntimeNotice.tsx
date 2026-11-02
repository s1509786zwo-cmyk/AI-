"use client";

import { useEffect, useState } from "react";

/**
 * 実行URLから、外部通信が制限されたプレビューかどうかを判定して案内する。
 * 通常のデプロイ（Vercel等）では何も表示しない。
 */
export function RuntimeNotice() {
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  if (!host) return null;

  if (host.endsWith("e2b.app")) {
    return (
      <div className="banner banner-danger">
        <div>
          <div className="banner-title">このURLはArenaのプレビューです</div>
          <p>
            この環境は外部通信が制限されているため、Gemini APIには接続できません。
            GitHub Codespacesの「PORTS」タブから 3000 番を開いたURL（末尾が
            <span className="mono"> app.github.dev </span>）で遊んでください。
          </p>
        </div>
      </div>
    );
  }

  if (host.endsWith("app.github.dev")) {
    return (
      <div className="banner banner-ok">
        <div>
          <div className="banner-title">GitHub Codespacesで実行中</div>
          <p>
            このURLは外部通信できます。AIの接続情報はサーバー側（.env.local）から読み込まれます。
            接続できない場合はターミナルで <span className="mono">npm run ai:check</span> を実行してください。
          </p>
        </div>
      </div>
    );
  }

  return null;
}

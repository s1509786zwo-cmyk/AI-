import Link from "next/link";
import { AiDiagnosticButton } from "@/components/AiDiagnosticButton";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { resolveAiConfig, toPublicConfig } from "@/lib/ai/config";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI接続 / ARBITER" };

export default async function SetupPage() {
  const config = await resolveAiConfig();
  const publicConfig = toPublicConfig(config);
  const storage = getStore().kind;
  const providerLabel =
    publicConfig.provider === "gemini"
      ? "Google Gemini（ネイティブAPI）"
      : publicConfig.provider === "anthropic"
        ? "Anthropic"
        : "OpenAI互換";

  return (
    <main className="main narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI connection</div>
          <h1>AI審判の接続状態</h1>
          <p>
            このゲームにAIの設定画面はありません。接続情報はサーバーの環境変数からのみ読み込まれ、
            ブラウザには送出されません。
          </p>
        </div>
        <Link href="/" className="btn">
          ホーム
        </Link>
      </div>

      <RuntimeNotice />

      {publicConfig.configured ? (
        <div className="banner banner-ok">
          <div>
            <div className="banner-title">接続設定はサーバー側で完了しています</div>
            <p>ゲームを始めるのにAIの設定は不要です。下の「接続診断を実行」で実際の応答を確認できます。</p>
          </div>
        </div>
      ) : (
        <div className="banner banner-error">
          <div>
            <div className="banner-title">AIが未設定です</div>
            <p>
              ゲームを動かすには、サーバーの <span className="mono">.env.local</span> に{" "}
              <span className="mono">GEMINI_API_KEY</span> を設定して再起動してください。
              ゲーム画面からAPIキーを入力することはできません。
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>接続情報</h3>
          <span className="panel-label">Server-side only</span>
        </div>
        <div className="kv">
          <div>
            <span>状態</span>
            <span>{publicConfig.configured ? "設定済み" : "未設定"}</span>
          </div>
          <div>
            <span>プロバイダ</span>
            <span>{providerLabel}</span>
          </div>
          <div>
            <span>モデル</span>
            <span>{publicConfig.model}</span>
          </div>
          {publicConfig.judgeModel !== publicConfig.model && (
            <div>
              <span>裁定モデル</span>
              <span>{publicConfig.judgeModel}</span>
            </div>
          )}
          <div>
            <span>接続先</span>
            <span>{publicConfig.baseHost}</span>
          </div>
          <div>
            <span>APIキー</span>
            <span>{publicConfig.configured ? publicConfig.maskedKey : "未設定"}</span>
          </div>
          <div>
            <span>整合性監査</span>
            <span>{publicConfig.audit ? "有効" : "無効"}</span>
          </div>
          <div>
            <span>永続化</span>
            <span>{storage === "postgres" ? "PostgreSQL" : "ファイル"}</span>
          </div>
        </div>
      </div>

      <AiDiagnosticButton />

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <h3>サーバー側の設定例</h3>
          <span className="panel-label">For deployment</span>
        </div>
        <p className="small muted">
          <span className="mono">.env.local</span> またはホスティングの環境変数に設定し、サーバーを再起動します。
          Gemini のモデル一覧は <span className="mono">npm run ai:models</span> で確認できます。
        </p>
        <pre className="code mt-sm">{`# .env.local
AI_PROVIDER=gemini
GEMINI_API_KEY=...
AI_MODEL=gemini-2.5-flash
AI_AUDIT=on`}</pre>
        <p className="hint">
          設定を変えたら <span className="mono">npm run ai:check</span> で実際の接続を確認してください。
          キーが未設定のままゲームを開始した場合、固定の勝敗や代用の描写は表示せずエラーになります。
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";
import { AiSettingsForm, type PublicSettings } from "@/components/AiSettingsForm";
import { envKeyPresent, resolveAiConfig, toPublicConfig } from "@/lib/ai/config";
import { getStore } from "@/lib/store";
import { DEFAULT_MODEL } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI接続 / ARBITER" };

export default async function SetupPage() {
  const config = await resolveAiConfig();
  const publicConfig = toPublicConfig(config);
  const initial: PublicSettings = {
    configured: publicConfig.configured,
    source: publicConfig.source,
    provider: publicConfig.provider,
    baseUrl: config.baseUrl,
    baseHost: publicConfig.baseHost,
    model: config.model,
    fastModel: config.fastModel,
    judgeModel: publicConfig.judgeModel,
    audit: config.audit,
    maskedKey: publicConfig.maskedKey,
    envLocked: envKeyPresent(),
    warning: publicConfig.warning,
  };
  const storage = getStore().kind;

  if (publicConfig.source === "env") {
    const providerLabel =
      publicConfig.provider === "gemini"
        ? "Google Gemini"
        : publicConfig.provider === "anthropic"
          ? "Anthropic"
          : "OpenAI互換";
    return (
      <main className="main narrow">
        <div className="page-head">
          <div>
            <div className="eyebrow">AI connection</div>
            <h1>AI審判は構成済みです</h1>
          </div>
          <Link href="/" className="btn">
            ホーム
          </Link>
        </div>
        <div className="banner banner-ok">
          <div>
            <div className="banner-title">接続設定はサーバー側で完了しています</div>
            <p>
              このゲームを使うためにAIの設定をする必要はありません。接続情報は環境変数からのみ読み込まれ、
              ブラウザには送出されません。
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>接続情報</h3>
            <span className="panel-label">Server-side only</span>
          </div>
          <div className="kv">
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
              <span>整合性監査</span>
              <span>{publicConfig.audit ? "有効" : "無効"}</span>
            </div>
            <div>
              <span>永続化</span>
              <span>{storage === "postgres" ? "PostgreSQL" : "ファイル"}</span>
            </div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>
          設定の変更はサーバーの環境変数（.env.local）で行います。この画面からAPIキーを入力する必要はありません。
        </p>
      </main>
    );
  }

  const envExample = `# .env.local
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=${DEFAULT_MODEL}
AI_JUDGE_MODEL=${DEFAULT_MODEL}
AI_FAST_MODEL=gpt-4.1-mini
AI_AUDIT=on`;

  return (
    <main className="main narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI connection</div>
          <h1>AI審判の接続設定</h1>
          <p>
            能力解析・行動選択・裁定・描写・整合性監査はすべて実際のAIモデルで実行します。
            APIキーはサーバー側でのみ使用し、ブラウザには返送しません。未設定の間はダミーの裁定結果を表示しません。
          </p>
        </div>
        <Link href="/" className="btn btn-ghost">
          ホーム
        </Link>
      </div>

      <div className="banner">
        <div>
          <div className="banner-title">
            {publicConfig.configured ? "接続済み" : "未接続"}
            {publicConfig.configured && (
              <span className="badge badge-live" style={{ marginLeft: 10 }}>
                SAVED
              </span>
            )}
          </div>
          <p>
            {publicConfig.configured
              ? `${publicConfig.provider} / ${publicConfig.model}${publicConfig.judgeModel !== publicConfig.model ? ` / 裁定: ${publicConfig.judgeModel}` : ""} / キー: ${publicConfig.maskedKey} / 接続先: ${publicConfig.baseHost}`
              : "下のいずれかの方法でAPIキーを設定してください。設定後、接続テストで実際の応答を確認できます。"}
          </p>
        </div>
        <span className="tag">{storage === "postgres" ? "PostgreSQL 永続化" : "ファイル永続化"}</span>
      </div>

      <div className="setup-grid">
        <div className="stack">
          <AiSettingsForm initial={initial} />

          <div className="panel">
            <div className="panel-head">
              <h3>環境変数で設定する（推奨）</h3>
              <span className="panel-label">For deployment</span>
            </div>
            <p className="small muted">
              本番環境では <span className="mono">.env.local</span> またはホスティングの環境変数に設定してください。
              環境変数が設定されている場合、画面から保存した設定より優先されます。
            </p>
            <pre className="code mt-sm">{envExample}</pre>
            <p className="notice">
              OpenAI互換APIを利用する場合は <span className="mono">AI_BASE_URL</span> を変更します。
              Anthropicを利用する場合は <span className="mono">AI_PROVIDER=anthropic</span> と{" "}
              <span className="mono">ANTHROPIC_API_KEY</span> を設定してください。
            </p>
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-label">Setup steps</div>
            <div className="steps mt-sm">
              <div className="step">
                <span>
                  AIプロバイダのAPIキーを用意します（OpenAI、Anthropic、OpenRouter等のOpenAI互換API）。
                </span>
              </div>
              <div className="step">
                <span>
                  左のフォームにプロバイダ・APIキー・モデル名を入力し、「設定を保存」を押します。
                  環境変数を使う場合はサーバーを再起動してください。
                </span>
              </div>
              <div className="step">
                <span>「接続テスト」で、実際のモデルからJSON応答が返ることを確認します。</span>
              </div>
              <div className="step">
                <span>
                  キャラクターを作成すると、能力解析が実行されます。解析結果を確認してから対戦を組んでください。
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-label">Security</div>
            <ul className="small muted" style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>APIキーはサーバー側のAI呼び出しにのみ使用します。クライアントJS・API応答には含めません。</li>
              <li>画面から保存したキーは AES-256-GCM で暗号化して保存します（マスク表示のみ）。</li>
              <li>本番運用では環境変数と <span className="mono">SETTINGS_SECRET</span> の併用を推奨します。</li>
              <li>このアプリは認証を持たないため、公開URLに置く場合はアクセス制御を検討してください。</li>
            </ul>
          </div>

          <div className="panel">
            <div className="panel-label">Failure policy</div>
            <p className="small muted" style={{ marginTop: 8, lineHeight: 1.9 }}>
              AIが応答しない、または裁定が能力仕様と矛盾する場合は、ラウンドを保存せずにエラーを表示します。
              固定の勝敗や代用の描写で埋めることはありません。再試行するか、設定を確認してください。
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

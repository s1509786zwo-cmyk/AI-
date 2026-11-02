# このゲームを実際に遊ぶ手順（Windows / Mac）

このArenaのプレビューは、外部通信が許可リストで制限されているため、**Geminiへの実通信だけができません**。
ゲームを実際に遊ぶには、自分のPCで起動してください。所要時間は約10分です。

---

## 0. 必要なもの

- **Node.js 20.9以上**（推奨: 22）— https://nodejs.org/ja
- **Gemini APIキー** — https://aistudio.google.com/apikey
- ターミナル
  - Windows: 「PowerShell」
  - Mac: 「ターミナル」

確認:

```bash
node -v
npm -v
```

`v20.19.0` のように表示されればOKです。

---

## Node.jsを入れずに遊ぶ（ブラウザだけでOK）

PCにNode.jsを入れたくない場合は、**GitHub Codespaces** が一番簡単です。
GitHubのクラウド上に開発環境が立ち上がり、Node.js・インターネット・保存領域がすべて揃っています。

### おすすめ: GitHub Codespaces

1. 次のURLを開く（このリポジトリは公開されています）  
   https://github.com/s1509786zwo-cmyk/AI-/tree/arena/ef2838fa-ai
2. 緑の **Code** ボタン → **Codespaces** タブ → **Create codespace on arena/ef2838fa-ai**
3. 初回は1〜2分待つ。`.devcontainer` の設定で `npm install` が自動実行されます。
4. 左のファイル一覧から **`.env.local`** を開き、`GEMINI_API_KEY=...` を自分のキーに書き換える  
   （ファイルが無い場合はターミナルで `cp .env.example .env.local`）
5. ターミナルで起動:
   ```bash
   npm run dev
   ```
6. 「Port 3000 is available」と出たら **Open in Browser** をクリック  
   出ない場合は **PORTS** タブ → `3000` → **Open in Browser**
7. 開いたURLの `/setup` が「接続設定はサーバー側で完了しています」になっていればOK

- 使わないときは Codespaces を **Stop** すれば課金/時間消費を止められます。
- キャラクターと履歴は Codespace 内の `.data/` に残ります（Codespaceを削除すると消えます）。
- 無料枠の時間制限はGitHubのプランによります。

### 公開URLがほしい場合: Vercel

1. https://vercel.com/new を開き、GitHubの `AI-` リポジトリを Import
2. Branch に `arena/ef2838fa-ai` を選択（Next.jsは自動検出）
3. **Environment Variables** に設定:
   ```dotenv
   AI_PROVIDER=gemini
   GEMINI_API_KEY=...
   AI_MODEL=gemini-2.5-flash
   AI_AUDIT=on
   AI_TIMEOUT_MS=180000
   ```
4. Deploy

> **Vercelの注意**: Vercelのファイルシステムは書き込み不可/一時的です。
> そのままではキャラクター保存でエラーになります。次のどちらかを設定してください。
> - **DATABASE_URL**（Neon / Supabase などのPostgreSQL）… データが永続化される（推奨）
> - **DATA_DIR=/tmp/arbiter** … デモ用。再起動でデータが消える
>
> PostgreSQL経路はコード上サポートしていますが、この開発環境では実接続テスト未実施です。

### Codespacesで「AI APIエラー」になる場合

まず **開いているURL** を確認してください。

- `https://xxxx-3000.app.github.dev/...` → Codespaces。外部通信できます
- `https://3000-xxxx.e2b.app/...` → Arenaのプレビュー。**外部通信ができません**  
  → Codespacesの **PORTS** タブ → `3000` → **Open in Browser** で開き直してください

次に、Codespacesのターミナルで診断コマンドを実行します。

```bash
npm run ai:check
```

表示例:

```text
provider   : gemini
model      : gemini-2.5-flash
endpoint   : https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
apiKey     : set                ← 「NOT SET」なら .env.local が未設定
...
OK: 1234 ms / model=gemini-2.5-flash
```

`NG` の場合は `code` を見ます。

| code | 意味 | 対処 |
| --- | --- | --- |
| `auth` | キーが拒否された | AI Studioで再発行。前後の空白・引用符を除去 |
| `model` | モデルまたはURLが使えない | `AI_BASE_URL` を削除し、`npm run ai:models` で表示されたモデルを `AI_MODEL` に設定 |
| `network` | 接続できない | 上記のURL確認。VPN/プロキシも確認 |
| `rate_limit` | 回数制限 | 1分待って再実行 |
| `not_configured` | キー未設定 | `.env.local` に `GEMINI_API_KEY=...` を設定 |

`apiKey: NOT SET` の場合は、`.env.local` ではなく `.env.example` を編集していないか、
ファイル名が `.env.local.txt` になっていないかを確認してください。
設定を変えたら `Ctrl + C` → `npm run dev` で再起動します。

### 「モデルまたはエンドポイントが見つかりません。」と出る場合

このアプリはGeminiの**ネイティブAPI**（`/v1beta/models/...:generateContent`）を使います。
AI Studioの新しいキー（`AQ.` で始まるもの）はこの経路でのみ動作します。

1. `.env.local` に `AI_BASE_URL` がある場合は**行ごと削除**する  
   （`.../v1beta/openai` を指定すると、`AQ.` キーでは通りません）
2. 利用可能なモデルを確認する:

   ```bash
   npm run ai:models
   ```

3. 一覧に表示された名前（例: `gemini-2.5-flash`、`gemini-2.0-flash`）を `AI_MODEL` に設定する
4. `npm run ai:check` を再実行する

`AI_MODEL` が一覧に無い場合は、そのキーでは利用できません。一覧から選び直してください。
このアプリは、モデルが見つからない場合に `gemini-2.5-flash` → `gemini-2.0-flash` →
`gemini-2.5-flash-lite` の順で自動的に再試行します。

### 方法の比較

| 方法 | Node.jsのインストール | Gemini通信 | データ保存 | 向き |
| --- | --- | --- | --- | --- |
| このArenaのプレビュー | 不要 | **不可（環境制限）** | ワークスペース | UIの確認だけ |
| GitHub Codespaces | **不要** | 可能 | Codespace内に保存 | すぐ遊ぶ（おすすめ） |
| Vercel | 不要 | 可能 | Postgres か /tmp | 公開URLがほしい |
| 自分のPC | 必要 | 可能 | `.data/` に保存 | 長く遊ぶ |

---

## 1. プロジェクトを用意する

### 方法A: GitHubから clone（推奨）

```bash
git clone -b arena/ef2838fa-ai https://github.com/s1509786zwo-cmyk/AI-.git
cd AI-
```

リポジトリが非公開の場合は、GitHubにログインしたブラウザで
`Code` → `Download ZIP` を選び、展開したフォルダでターミナルを開いてください。

### 方法B: このワークスペースのZIPを使う

`ai-battler-source.zip` をダウンロードして展開し、`ai-battler` フォルダでターミナルを開きます。

---

## 2. 依存関係をインストール

```bash
npm install
```

1〜2分かかります。`added ... packages` と出ればOKです。

---

## 3. APIキーを設定する

プロジェクト直下に `.env.local` を作ります。

### Windows（PowerShell）

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

### Mac / Linux

```bash
cp .env.example .env.local
nano .env.local
```

`.env.local` を次の内容にします（キーは自分のものに置き換え）:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=ここにGeminiのAPIキー
AI_MODEL=gemini-2.5-flash
AI_AUDIT=on
AI_TIMEOUT_MS=180000
```

保存して閉じます。

> `.env.local` は `.gitignore` 済みです。GitHubや他人に送らないでください。
> ゲーム画面にはAI設定はありません。設定はこのファイルだけで完結します。

---

## 4. 起動する

```bash
npm run dev
```

表示された `http://localhost:3000` をブラウザで開きます。

### 最初に確認すること

1. `/setup` を開く
   - 「接続設定はサーバー側で完了しています」
   - `Google Gemini（ネイティブAPI）` / `gemini-2.5-flash`
   - と表示されれば接続設定はOK
2. 「キャラクター」→「新規作成」
   - 名前と能力を入れて保存（テンプレートボタンでも可）
   - 自動でAI解析が走り、「AI解析済み」になれば成功
3. 2体作成したら「対戦」→ 2体と戦場を選んで開始
4. 対戦ページでラウンドを進める
5. 決着すると判決理由が表示され、履歴に残る

---

## 5. うまくいかないとき

| 症状 | 対処 |
| --- | --- |
| `AI APIの認証に失敗しました` | キーが無効・期限切れ。AI Studioで再発行して `.env.local` を更新 |
| `モデルまたはエンドポイントが見つかりません` | 上の「モデルまたはエンドポイントが見つかりません。と出る場合」を確認。`npm run ai:models` で利用可能なモデルを確認 |
| `AI APIに接続できませんでした` / `fetch failed` | PCのネットワーク・VPN・プロキシを確認。GoogleへのHTTPS通信が必要 |
| `ポート3000は使用中` | `npx next dev -p 3001` で起動し、`http://localhost:3001` を開く |
| 設定を変えたのに反映されない | ターミナルで `Ctrl + C` → `npm run dev` で再起動 |
| キャラクターや履歴を消したい | `.data/store.json` を削除（フォルダごと消してもOK） |
| 解析が失敗する | キャラクター詳細の「再解析」を実行。失敗理由が画面に出ます |

---

## 6. ネットに公開する場合（任意）

Vercel / Render / Railway などのNode.jsホスティングにGitHubリポジトリを接続します。

環境変数:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=...
AI_MODEL=gemini-2.5-flash
AI_AUDIT=on
```

- ビルド: `npm run build`
- 起動: `npm run start`
- **Vercelの無料枠はファイル保存が消える**ため、キャラクターと履歴を残すには
  `DATABASE_URL`（Neon / Supabase などのPostgreSQL）を設定してください。
  PostgreSQL経路はコード上サポートしていますが、この開発環境では実接続テスト未実施です。
- APIキーはホスティングの環境変数に入れ、GitHubには絶対にコミットしないでください。

---

## 7. キーの取り扱い

- このゲームのAPIキーは**サーバー側でのみ**使われ、ブラウザには返りません。
- チャットに貼ったキーは、必要なら https://aistudio.google.com/apikey で無効化し、
  新しいキーを発行して `.env.local` に設定してください。
- `.env.local` を配布物に含めないでください（ZIPにも含まれていません）。

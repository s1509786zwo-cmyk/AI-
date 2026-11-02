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
7. 開いたURLの `/setup` が「AI審判は構成済みです」になっていればOK

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
   - 「AI審判は構成済みです」
   - `Google Gemini` / `gemini-2.5-flash`
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
| `指定されたAIモデルが利用できません` | `AI_MODEL` を `gemini-2.0-flash` など利用可能なモデルに変更 |
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

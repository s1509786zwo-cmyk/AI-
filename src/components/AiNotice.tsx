import Link from "next/link";
import { resolveAiConfig, toPublicConfig } from "@/lib/ai/config";

/**
 * AI未設定時に、ダミー結果を出さずに設定方法を案内する。
 */
export async function AiNotice({ compact = false }: { compact?: boolean }) {
  const config = toPublicConfig(await resolveAiConfig());
  // 接続済みの場合は何も表示しない（プレイヤーに設定作業を求めない）
  if (config.configured) return null;
  void compact;
  return (
    <div className="banner banner-danger">
      <div>
        <div className="banner-title">AI APIが未設定です</div>
        <p>
          このゲームは実際のAIモデルで能力解釈・裁定・描写を行います。固定文やダミーの裁定結果は使いません。
          接続設定を完了するまで、キャラクターの解析と対戦は開始できません。
        </p>
      </div>
      <Link href="/setup" className="btn btn-primary btn-sm">
        設定方法を見る
      </Link>
    </div>
  );
}

import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { CharacterForm } from "@/components/CharacterForm";

export const metadata = { title: "キャラクター作成 / ARBITER" };

export default function NewCharacterPage() {
  return (
    <main className="main narrow">
      <AiNotice compact />
      <div className="page-head">
        <div>
          <div className="eyebrow">New character</div>
          <h1>キャラクターを作成</h1>
          <p>
            能力は自由文で構いません。AIが発動条件・効果・代償・弱点を抽出し、審判が扱える仕様に翻訳します。
            保存後に解析結果を確認し、意図と違えば本文を書き直してください。
          </p>
        </div>
        <Link href="/characters" className="btn btn-ghost">
          一覧へ戻る
        </Link>
      </div>
      <CharacterForm mode="create" />
    </main>
  );
}

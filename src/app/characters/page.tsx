import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { CharacterCard } from "@/components/CharacterCard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "キャラクター / ARBITER" };

export default async function CharactersPage() {
  const characters = await getStore().listCharacters();
  return (
    <main className="main">
      <AiNotice compact />
      <div className="page-head">
        <div>
          <div className="eyebrow">Character archive</div>
          <h1>キャラクター</h1>
          <p>
            能力は自由文で記述します。AI審判が発動条件・効果・代償・弱点を抽出し、裁定可能な仕様として保存します。
            同じ能力文でも、弱点の書き方次第で戦い方が変わります。
          </p>
        </div>
        <Link href="/characters/new" className="btn btn-primary">
          新規作成
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="empty">
          まだキャラクターがいません。
          <br />
          自由な能力を持つ人物を1体、書いてみてください。
          <div className="mt">
            <Link href="/characters/new" className="btn btn-primary btn-sm">
              キャラクターを作成
            </Link>
          </div>
        </div>
      ) : (
        <div className="char-grid">
          {characters.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      )}
    </main>
  );
}

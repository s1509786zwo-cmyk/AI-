import Link from "next/link";
import { notFound } from "next/navigation";
import { AiNotice } from "@/components/AiNotice";
import { CharacterForm } from "@/components/CharacterForm";
import { getCharacter } from "@/lib/service/characters";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditCharacterPage({ params }: Props) {
  const { id } = await params;
  const character = await getCharacter(id);
  if (!character) notFound();
  return (
    <main className="main narrow">
      <AiNotice compact />
      <div className="page-head">
        <div>
          <div className="eyebrow">Edit character</div>
          <h1>{character.name} を編集</h1>
          <p>保存すると元のAI解析は破棄され、新しい本文で再解析されます。</p>
        </div>
        <Link href={`/characters/${character.id}`} className="btn btn-ghost">
          詳細へ戻る
        </Link>
      </div>
      <CharacterForm
        mode="edit"
        initial={{
          id: character.id,
          name: character.name,
          abilityText: character.abilityText,
          personality: character.personality,
          background: character.background,
          weakness: character.weakness,
          hasAnalysis: Boolean(character.analysis),
        }}
      />
    </main>
  );
}

import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { BattleSetup } from "@/components/BattleSetup";
import { ARENAS } from "@/lib/engine/battle";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "対戦を組む / ARBITER" };

type Props = { searchParams: Promise<{ A?: string }> };

export default async function NewBattlePage({ searchParams }: Props) {
  const { A } = await searchParams;
  const characters = await getStore().listCharacters();
  return (
    <main className="main narrow">
      <AiNotice compact />
      <div className="page-head">
        <div>
          <div className="eyebrow">Battle setup</div>
          <h1>対戦を組む</h1>
          <p>
            キャラクターを2体選び、戦場を決めます。能力は互いに公開されていますが、このラウンドの行動は
            互いの選択を知らずに決まります。裁定はAI審判が行います。
          </p>
        </div>
        <Link href="/characters" className="btn btn-ghost">
          キャラクター管理
        </Link>
      </div>
      <BattleSetup characters={characters} arenas={ARENAS} initialA={A} />
    </main>
  );
}

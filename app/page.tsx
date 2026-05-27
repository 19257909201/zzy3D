import { connection } from "next/server";
import ModelViewer from "@/components/ModelViewer";
import { getAvailableSiteModels } from "@/lib/site-models";

export default async function Home() {
  await connection();
  const models = await getAvailableSiteModels();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#ece2d5] text-slate-900">
      <ModelViewer models={models} />
    </main>
  );
}

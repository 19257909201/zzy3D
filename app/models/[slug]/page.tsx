import { notFound } from "next/navigation";
import { connection } from "next/server";
import ModelViewer from "@/components/ModelViewer";
import { getAvailableSiteModels } from "@/lib/site-models";

type ModelPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ModelPage({ params }: ModelPageProps) {
  await connection();

  const { slug } = await params;
  const models = await getAvailableSiteModels();
  const model = models.find((entry) => entry.slug === slug);

  if (!model) {
    notFound();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#ece2d5] text-slate-900">
      <ModelViewer models={models} initialSlug={model.slug} />
    </main>
  );
}

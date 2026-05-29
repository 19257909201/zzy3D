import { getSiteModelPictures } from "@/lib/site-models";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return new Response("Missing model slug", { status: 400 });
  }

  const pictures = await getSiteModelPictures(slug);

  return Response.json(
    { pictures },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

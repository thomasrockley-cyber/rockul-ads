import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { setCampaignImage } from "@/lib/db";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  const ext = file.type.split("/")[1];
  const blob = await put(`ad-images/${id}-${Date.now()}.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  await setCampaignImage(id, blob.url);

  return NextResponse.json({ image_url: blob.url });
}

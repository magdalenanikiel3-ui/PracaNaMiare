import { NextResponse } from "next/server";
import { extractProfile } from "@/lib/ai/extract-profile";
import { modelInput, readDocument } from "@/lib/profile/read-document";
import { readJson, writeJson } from "@/lib/store";
import { emptyProfile, MasterProfileSchema, type MasterProfile } from "@/lib/profile/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const p = await readJson<MasterProfile>("profile.json", emptyProfile());
  return NextResponse.json(p);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("cv");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nie przesłano pliku." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Plik jest za duży (maksimum 15 MB)." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || guessMime(file.name);

    // NAZWA PLIKU KOŃCZY SIĘ TUTAJ.
    // Używamy jej wyłącznie do rozpoznania formatu i dalej nie przekazujemy.
    // To jest naprawa błędu "Iturri" z v0.4 — patrz komentarz w extract-profile.ts.
    const { text } = await readDocument(bytes, mime);

    if (text.trim().length < 50) {
      return NextResponse.json({
        error: "Z dokumentu nie udało się odczytać tekstu. Jeśli to skan, potrzebne będzie OCR.",
      }, { status: 422 });
    }

    const forModel = modelInput(bytes, mime, text);
    const profile = await extractProfile({
      bytes: forModel?.data ?? Buffer.from(""),
      mimeType: forModel?.mimeType ?? "text/plain",
      plainText: text,
    });

    // Zachowujemy preferencje i decyzje użytkownika przy ponownym wgraniu CV.
    const prev = await readJson<MasterProfile>("profile.json", emptyProfile());
    profile.preferences = prev.preferences;
    profile.acceptedDirections = prev.acceptedDirections;
    profile.rejectedDirections = prev.rejectedDirections;

    const parsed = MasterProfileSchema.parse(profile);
    await writeJson("profile.json", parsed);
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[api/profile]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const prev = await readJson<MasterProfile>("profile.json", emptyProfile());
  const next = { ...prev, ...body, updatedAt: new Date().toISOString() };
  const parsed = MasterProfileSchema.parse(next);
  await writeJson("profile.json", parsed);
  return NextResponse.json(parsed);
}

function guessMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

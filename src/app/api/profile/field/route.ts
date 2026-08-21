import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/store";
import { emptyProfile, MasterProfileSchema, type MasterProfile } from "@/lib/profile/schema";
import { addItem, resolveQuestion, setFieldById } from "@/lib/profile/edit";

export const runtime = "nodejs";

/**
 * Edycja pojedynczego pola profilu.
 *
 * Interfejs wysyła identyfikator pola i nową wartość — nie musi wiedzieć,
 * gdzie w strukturze to pole siedzi.
 */
export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    fieldId?: string; value?: string | null;
    add?: { kind: string; value: string };
  };

  const p = await readJson<MasterProfile>("profile.json", emptyProfile());

  if (body.add) {
    if (!addItem(p, body.add.kind, body.add.value)) {
      return NextResponse.json({ error: "Nie udało się dodać — może już istnieje." }, { status: 400 });
    }
  } else if (body.fieldId) {
    if (!setFieldById(p, body.fieldId, body.value ?? null)) {
      return NextResponse.json({ error: `Nie znam pola "${body.fieldId}".` }, { status: 400 });
    }
    resolveQuestion(p, body.fieldId);
  } else {
    return NextResponse.json({ error: "Brak danych do zapisu." }, { status: 400 });
  }

  p.updatedAt = new Date().toISOString();
  const parsed = MasterProfileSchema.parse(p);
  await writeJson("profile.json", parsed);
  return NextResponse.json(parsed);
}

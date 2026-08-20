import { NextResponse } from "next/server";
import { proposeDirections } from "@/lib/ai/expand-queries";
import { readJson, writeJson } from "@/lib/store";
import { emptyProfile, type MasterProfile } from "@/lib/profile/schema";
import type { Direction } from "@/lib/ai/expand-queries";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json(await readJson<{ directions: Direction[] }>("directions.json", { directions: [] }));
}

export async function POST() {
  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
  if (profile.skills.length === 0 && profile.experience.length === 0) {
    return NextResponse.json({ error: "Najpierw wgraj CV — bez profilu nie ma z czego proponować kierunków." }, { status: 400 });
  }
  const directions = await proposeDirections(profile);
  await writeJson("directions.json", { directions });
  return NextResponse.json({ directions });
}

/** Akceptacja lub odrzucenie kierunku przez użytkownika. AI proponuje, człowiek decyduje. */
export async function PATCH(req: Request) {
  const { id, accepted } = (await req.json()) as { id: string; accepted: boolean };
  const store = await readJson<{ directions: Direction[] }>("directions.json", { directions: [] });
  const d = store.directions.find((x) => x.id === id);
  if (d) d.accepted = accepted;
  await writeJson("directions.json", store);

  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
  const label = d?.pl ?? id;
  profile.acceptedDirections = accepted
    ? [...new Set([...profile.acceptedDirections, label])]
    : profile.acceptedDirections.filter((x) => x !== label);
  profile.rejectedDirections = accepted
    ? profile.rejectedDirections.filter((x) => x !== label)
    : [...new Set([...profile.rejectedDirections, label])];
  await writeJson("profile.json", profile);

  return NextResponse.json({ ok: true, directions: store.directions });
}

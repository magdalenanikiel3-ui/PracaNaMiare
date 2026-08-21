import { NextResponse } from "next/server";
import { buildQueries, buildSkillQueries, proposeDirections } from "@/lib/ai/expand-queries";
import { readJson, writeJson } from "@/lib/store";
import { emptyProfile, type MasterProfile } from "@/lib/profile/schema";
import type { Direction } from "@/lib/ai/expand-queries";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const store = await readJson<{ directions: Direction[] }>("directions.json", { directions: [] });
  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());

  // Podglad fraz, pod ktorymi system NAPRAWDE bedzie szukal.
  // Bez tego uzytkownik zaznacza kierunki na slepo i nie wie, co z tego wyniknie.
  const titles = buildQueries(store.directions, profile.preferences.market);
  const skills = buildSkillQueries(profile);

  return NextResponse.json({
    directions: store.directions,
    preview: { titles, skills, total: new Set([...titles, ...skills]).size },
  });
}

export async function POST() {
  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
  if (profile.skills.length === 0 && profile.experience.length === 0) {
    return NextResponse.json({ error: "Najpierw wgraj CV — bez profilu nie ma z czego proponować kierunków." }, { status: 400 });
  }
  const directions = await proposeDirections(profile);
  await writeJson("directions.json", { directions });

  profile.acceptedDirections = directions.filter((x) => x.accepted).map((x) => x.pl);
  profile.rejectedDirections = directions.filter((x) => !x.accepted).map((x) => x.pl);
  await writeJson("profile.json", profile);

  const titles = buildQueries(directions, profile.preferences.market);
  const skills = buildSkillQueries(profile);
  return NextResponse.json({
    directions,
    preview: { titles, skills, total: new Set([...titles, ...skills]).size },
  });
}

/** Akceptacja lub odrzucenie kierunku przez użytkownika. AI proponuje, człowiek decyduje. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: string; accepted: boolean; all?: boolean };
  const store = await readJson<{ directions: Direction[] }>("directions.json", { directions: [] });

  if (body.all) {
    for (const x of store.directions) x.accepted = body.accepted;
  } else if (body.id) {
    const d = store.directions.find((x) => x.id === body.id);
    if (d) d.accepted = body.accepted;
  }
  await writeJson("directions.json", store);

  const d = body.id ? store.directions.find((x) => x.id === body.id) : undefined;
  const accepted = body.accepted;

  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
  profile.acceptedDirections = store.directions.filter((x) => x.accepted).map((x) => x.pl);
  profile.rejectedDirections = store.directions.filter((x) => !x.accepted).map((x) => x.pl);
  await writeJson("profile.json", profile);
  void d;

  const titles = buildQueries(store.directions, profile.preferences.market);
  const skills = buildSkillQueries(profile);

  return NextResponse.json({
    ok: true,
    directions: store.directions,
    preview: { titles, skills, total: new Set([...titles, ...skills]).size },
  });
}

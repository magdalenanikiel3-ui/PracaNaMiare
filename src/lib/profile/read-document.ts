/**
 * Deterministyczne wydobycie tekstu z dokumentu.
 *
 * UWAGA: to NIE jest parser CV. To wyłącznie źródło tekstu do WERYFIKACJI
 * cytatów podanych przez model. Rozumienie dokumentu robi model, który
 * dostaje oryginalny plik i widzi jego układ.
 *
 * Podział ról jest celowy:
 *   - kod deterministyczny: wydobycie i sprawdzanie (szybkie, darmowe, pewne),
 *   - model: rozumienie znaczenia (drogie, ale jedyne, co tu działa).
 *
 * To odpowiedź na wniosek z sekcji 40 dokumentu projektowego: problemem nie jest
 * odczytanie PDF, tylko zrozumienie treści. Ale z tego NIE wynika, że trzeba
 * porzucić kod deterministyczny — wynika, że trzeba go przenieść z ekstrakcji
 * do weryfikacji.
 */

export type ReadResult = { text: string; pages: number; mimeType: string };

export async function readDocument(bytes: Buffer, mimeType: string): Promise<ReadResult> {
  if (mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: String(text), pages: totalPages, mimeType };
  }

  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return { text: value, pages: 1, mimeType };
  }

  if (mimeType.startsWith("text/")) {
    return { text: bytes.toString("utf-8"), pages: 1, mimeType };
  }

  throw new Error(`Nieobsługiwany format: ${mimeType}. Obsługiwane: PDF, DOCX, TXT.`);
}

/**
 * Modele przyjmują obrazy i PDF, ale nie DOCX. Dla DOCX przekazujemy sam tekst.
 * Tracimy wtedy informację o układzie — dlatego w UI zachęcamy do PDF.
 */
export function modelInput(bytes: Buffer, mimeType: string, text: string): { mimeType: string; data: Buffer } | null {
  if (mimeType === "application/pdf") return { mimeType, data: bytes };
  if (mimeType.startsWith("image/")) return { mimeType, data: bytes };
  void text;
  return null;
}

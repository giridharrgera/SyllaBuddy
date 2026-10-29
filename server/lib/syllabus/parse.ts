import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export async function documentToText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (name.endsWith(".doc")) {
    const doc = await new WordExtractor().extract(buffer);
    return doc.getBody();
  }
  throw new Error("Only .doc and .docx files are supported.");
}

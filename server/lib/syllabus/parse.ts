import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export type Table = string[][];

export interface ParsedDocument {
  text: string;
  tables: Table[];
}

function cleanCell(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expands colspan/rowspan so every row has one entry per visual column. */
function parseTable(tableHtml: string): Table {
  const grid: Table = [];
  const open: { text: string; left: number }[] = [];
  for (const rowHtml of tableHtml.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const row: string[] = [];
    let col = 0;
    const fillSpan = () => {
      while (open[col] && open[col]!.left > 0) {
        row[col] = open[col]!.text;
        open[col]!.left--;
        col++;
      }
    };
    for (const match of rowHtml.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g)) {
      fillSpan();
      const attrs = match[2] ?? "";
      const text = cleanCell(match[3] ?? "");
      const colspan = Math.max(1, Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1));
      const rowspan = Math.max(1, Number(/rowspan="(\d+)"/.exec(attrs)?.[1] ?? 1));
      for (let i = 0; i < colspan; i++) {
        row[col + i] = i === 0 ? text : "";
        if (rowspan > 1) open[col + i] = { text: i === 0 ? text : "", left: rowspan - 1 };
      }
      col += colspan;
    }
    fillSpan();
    for (let i = row.length; i < open.length; i++) {
      if (open[i] && open[i]!.left > 0) {
        row[i] = open[i]!.text;
        open[i]!.left--;
      }
    }
    grid.push(Array.from(row, (cell) => cell ?? ""));
  }
  return grid;
}

function htmlToTables(html: string): Table[] {
  return (html.match(/<table[\s\S]*?<\/table>/g) ?? []).map(parseTable);
}

export async function documentToStructure(file: File): Promise<ParsedDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    return { text: raw.value, tables: htmlToTables(html.value) };
  }
  if (name.endsWith(".doc")) {
    const body = (await new WordExtractor().extract(buffer)).getBody();
    return { text: body, tables: [] };
  }
  throw new Error("Only .doc and .docx files are supported.");
}

export async function documentToText(file: File): Promise<string> {
  return (await documentToStructure(file)).text;
}

import puppeteer from "puppeteer";

const WATERMARK = `<div style="position:fixed;top:35%;left:-10%;width:120%;text-align:center;transform:rotate(-30deg);font-size:150px;font-weight:700;letter-spacing:12px;color:rgba(99,102,241,0.12);pointer-events:none">DRAFT</div>`;

export async function renderPdf(html: string, draft: boolean): Promise<Uint8Array> {
  const pageHtml = draft ? html.replace("</body>", `${WATERMARK}</body>`) : html;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(pageHtml, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }
}

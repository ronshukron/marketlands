import { parseSupplierTextLines } from '../utils/supplierPriceMatching';

let pdfModulePromise;

const getPdfModule = async () => {
  if (!pdfModulePromise) {
    pdfModulePromise = import('pdfjs-dist').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
      return pdfjs;
    });
  }
  return pdfModulePromise;
};

const groupTextItemsIntoLines = (items = [], pageNumber) => {
  const groups = [];
  items.forEach((item) => {
    const text = String(item?.str || '').trim();
    if (!text) return;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    let group = groups.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (!group) {
      group = { y, items: [] };
      groups.push(group);
    }
    group.items.push({ text, x });
  });

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => ({
      page: pageNumber,
      text: group.items
        .sort((a, b) => b.x - a.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
};

export const parseSupplierPdfFile = async (file) => {
  const pdfjs = await getPdfModule();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...groupTextItemsIntoLines(content.items, pageNumber));
  }

  const parsed = parseSupplierTextLines(lines);
  if (parsed.rows.length === 0) {
    throw new Error('לא נמצאו שורות מחיר בקובץ. ייתכן שזהו PDF סרוק.');
  }
  return { ...parsed, pageCount: pdf.numPages, lines };
};

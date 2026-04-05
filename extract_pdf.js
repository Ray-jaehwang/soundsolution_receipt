import PDFParser from "pdf2json";
import fs from "fs";

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync("pdf_out.txt", pdfParser.getRawTextContent());
});

pdfParser.loadPDF("지출결의서_2026.pdf");

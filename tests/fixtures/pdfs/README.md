# PDF Test Fixtures

These PDFs are used for testing PDF reading support.

## Required Test Files

| File | Purpose |
|------|---------|
| single-column.pdf | Standard text-based PDF with single-column layout |
| two-column.pdf | Academic paper format with two-column layout |
| scanned.pdf | Scanned document (image-based, requires OCR) |

## Creating Test PDFs

For unit tests, use mock data. For integration tests, place actual PDF files here.

To generate test PDFs, you can use:
- LibreOffice: `libreoffice --headless --convert-to pdf document.odt`
- LaTeX: `pdflatex document.tex`
- Web-based tools for specific layout types

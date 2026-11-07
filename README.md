# QGE Premium

A premium, responsive sales rate portal for Qaiser Group of Electronics.

## Stack
- React + TypeScript + Vite
- Tailwind CSS 4
- Excel workbook parsing with SheetJS
- Client-side favourites and imported-workbook cache

## Run locally
```bash
npm install
npm run dev
```

## Deploy on Vercel
Import this repository into Vercel. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.

## Add your live rates
Upload the latest workbook as `rates.xlsx` to the repository root and commit it. The portal will read that workbook on the next refresh. You can also use **Upload Excel** inside the portal to preview a workbook in your own browser; browser uploads are saved locally on that device and are not committed back to GitHub.

Supported workbook columns include Company, Product, Model, Cash Rate, 10 Installment, 15 Installment, Fix Rate, Remarks, Month, and Year.

## Important privacy note
This repository is public. Anything committed here—including the workbook and built site assets—can be viewed by the public. Do not commit confidential rates or credentials. A frontend-only login cannot protect files bundled into a public static website. Use a server-side backend and proper authentication before storing confidential data.

## Project separation
This is an independent premium redesign. The original `qgeportal/Price-List` repository is not modified by this project.

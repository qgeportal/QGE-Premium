# QGE Premium

A premium, responsive sales rate workspace for Qaiser Group of Electronics.

## Included features
- Responsive premium dashboard for desktop and mobile
- Search by company, product and model (including typo-tolerant model matching)
- Company, product, rate-month and price sorting filters
- Cash, 10-installment, 15-installment and configured fix-rate cards
- WhatsApp sharing and one-click rate copying
- Favourites saved in the current browser
- Excel workbook import, local browser persistence and downloadable workbook template
- Historical month selection when the workbook contains previous periods
- Offline/saved-rate support from the existing rate loader

## Run locally
```bash
npm install
npm run dev
```

Production build:
```bash
npm run build
```

## Deploy on Vercel
Import this repository into Vercel. Use the Vite framework preset, build command `npm run build`, and output directory `dist`.

## Add your live rates
Place the latest workbook at `public/rates.xlsx` and commit it. Vite copies files from `public/` to the deployed site root, where the portal can read the workbook on refresh.

Supported workbook columns include Company, Product, Model, Cash Rate, 10 Installment, 15 Installment, Fix Rate, Remarks, Month and Year.

You can also use **Upload Excel** inside the portal. Browser uploads are saved locally on that device only; they are not automatically committed to GitHub or shared with other users.

Until a real workbook is added, the portal displays clearly labelled sample preview data. Do not use those sample prices for customer quotations.

## Important privacy note
This repository is **public**. Anything committed here—including the workbook and built site assets—can be viewed by anyone. Do not commit confidential rates or credentials. A frontend-only login cannot protect files bundled into a public static website. Use a server-side backend and proper authentication before storing confidential data.

## Project separation
This is an independent premium redesign. The original `qgeportal/Price-List` repository is not modified by this project.

import type { RawRow } from './rates';

/**
 * SAMPLE rates — only shown while no rates.xlsx is uploaded yet.
 * (Also used to generate the downloadable Excel template.)
 */
type SampleRow = [string, string, string, number, number, number | null, string];

const DATA: SampleRow[] = [
  ['HAIER', 'LED TV', 'H32K66G', 52500, 64000, 57500, ''],
  ['HAIER', 'LED TV', 'H43K800FX', 104500, 127000, 114000, 'Google TV · Free wall mount'],
  ['HAIER', 'LED TV', 'H55P7UX', 189000, 229000, 205000, ''],
  ['HAIER', 'REFRIGERATOR', 'HRF-368IFRA', 189500, 229000, 205500, '10 years compressor warranty'],
  ['HAIER', 'REFRIGERATOR', 'HRF-438IDB', 214000, 259000, 232000, ''],
  ['HAIER', 'SPLIT AC', 'HSU-12HFPAA (1 Ton)', 164000, 198500, 178000, 'Installation charges extra'],
  ['HAIER', 'SPLIT AC', 'HSU-18HFCM (1.5 Ton)', 199000, 239000, 215000, ''],
  ['HAIER', 'WASHING MACHINE', 'HWM 120-826', 61500, 74500, 67000, ''],
  ['HAIER', 'DEEP FREEZER', 'HDF-405IM', 157500, 190000, 170500, ''],
  ['HAIER', 'MICROWAVE OVEN', 'HDL-38MX', 38500, 47000, 42000, ''],
  ['DAWLANCE', 'REFRIGERATOR', '9193 LF AVANTE+', 174500, 210000, null, ''],
  ['DAWLANCE', 'REFRIGERATOR', '91999 WB AVANTE GD', 204500, 246000, null, 'Limited stock'],
  ['DAWLANCE', 'SPLIT AC', 'ELEGANCE-30 INVERTER (1.5 Ton)', 184500, 222000, null, ''],
  ['DAWLANCE', 'DEEP FREEZER', 'DF-400 ES', 144500, 174000, null, ''],
  ['DAWLANCE', 'MICROWAVE OVEN', 'DW-295', 34500, 41500, null, ''],
  ['DAWLANCE', 'WASHING MACHINE', 'DW-6550W', 28500, 34500, null, ''],
  ['ORIENT', 'REFRIGERATOR', 'GRAND 485 GD', 161500, 195000, null, ''],
  ['ORIENT', 'SPLIT AC', 'ULTRON PLUS 1.5 TON', 171500, 206500, null, 'Free installation this month'],
  ['ORIENT', 'WATER DISPENSER', 'ICON 5000', 36500, 44000, null, ''],
  ['PEL', 'REFRIGERATOR', 'PRINVOGUE-2550', 147500, 178000, null, ''],
  ['PEL', 'SPLIT AC', 'INVERTERON 1.5 TON', 167500, 202000, null, ''],
  ['PEL', 'AIR COOLER', 'PAC-9000', 31500, 38500, null, ''],
  ['GREE', 'SPLIT AC', 'GS-12FITH6G (1 Ton)', 174500, 210000, null, ''],
  ['GREE', 'SPLIT AC', 'GS-18PITH11G (1.5 Ton)', 214500, 258000, null, 'Pre-booking only'],
  ['TCL', 'LED TV', '43S5400', 88500, 107000, null, ''],
  ['TCL', 'LED TV', '55P735 4K', 168500, 203000, null, ''],
  ['SAMSUNG', 'LED TV', 'UA43CU7000', 134500, 162000, null, ''],
  ['SAMSUNG', 'MOBILE', 'GALAXY A15 (8/256)', 59999, 72500, null, 'PTA approved'],
  ['KENWOOD', 'SPLIT AC', 'KES-1837S ESMART (1.5 Ton)', 188500, 227000, null, ''],
  ['SUPER ASIA', 'WASHING MACHINE', 'SA-240', 24500, 29500, null, ''],
  ['SUPER ASIA', 'AIR COOLER', 'ECM-4600', 29500, 35500, null, ''],
  ['INFINIX', 'MOBILE', 'HOT 50 (8/256)', 42999, 52000, null, ''],
  ['BOSS', 'WASHING MACHINE', 'KE-9000-BS', 25500, 31000, null, ''],
];

export function getSampleRows(): RawRow[] {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return DATA.map(([company, product, model, cash, installment, fix, remarks]) => ({
    company,
    product,
    model,
    cash,
    installment,
    installment15: null,
    fix,
    remarks,
    month,
    year,
  }));
}

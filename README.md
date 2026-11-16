# BursaViz

Pagini în stil FinViz pentru acțiunile de la Bursa de Valori București.

## Pornire

```bash
npm install
npm run dev        # http://localhost:5173
```

## Actualizarea datelor

Site-ul nu vorbește cu niciun server: citește doar fișierele JSON din `public/data/`.
Acestea sunt scrise de scraper:

```bash
npm run scrape              # toate simbolurile din scripts/tickers.ts (~3 minute)
npm run scrape -- TLV H2O   # doar câteva
```

Surse: Yahoo Finance prin `yahoo-finance2` (prețuri zilnice și orare, indicatori, situații
financiare) și Google News RSS (știri). Simbolurile pe care Yahoo nu le are sunt sărite.
Dacă Yahoo limitează conexiunea (HTTP 429), scraper-ul se oprește singur — rulează-l din nou mai târziu.

## Structură

| Unde | Ce |
| --- | --- |
| `scripts/tickers.ts` | lista de simboluri, căutarea de știri și apartenența la BET (statică) |
| `scripts/scrape.ts` | scraper-ul; calculează și tot tabelul de indicatori |
| `src/lib/indicators.ts` | SMA, RSI, ATR, performanțe — folosit și de scraper, și de grafic |
| `src/lib/aggregate.ts` | lumânările 4H (din cele orare), săptămânale și lunare |
| `src/pages/Stock.tsx` | pagina unei acțiuni |
| `src/pages/Home.tsx` | harta pieței și tabelul cu toate acțiunile |

## Limite cunoscute

- Instantaneu static, nu flux live. Intervalul de 1 oră acoperă ultimii ~2 ani (limita Yahoo).
- Yahoo nu are pentru BVB: short interest, opțiuni, tranzacții ale insiderilor, număr de tranzacții — apar ca „-”.
- Pentru câțiva emitenți (H2O, IARV, DN, MILK, simbolurile AeRO) Yahoo nu are situații financiare complete;
  acolo se afișează doar venituri și profit net, sau nimic.
- `EPS Y/Y` și `Sales Y/Y` sunt an fiscal față de an fiscal, nu TTM.
- Segmentele de venit (coloana din stânga a diagramei FinViz) nu există în sursa gratuită.

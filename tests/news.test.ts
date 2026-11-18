import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSource, dedupeNews, isMarketRelevant, isRelevant, normalizeTitle, parseRss, tagTickers } from "../scripts/lib/news.ts";
import type { NewsItem } from "../src/lib/types.ts";

test("normalizeTitle", () => {
  assert.equal(normalizeTitle("  OMV Petrom: PROFIT în creștere! "), "omv petrom profit in crestere");
});

test("isRelevant is whole-word and diacritic-insensitive", () => {
  assert.equal(isRelevant("Electrica raportează profit", ["Electrica"]), true);
  assert.equal(isRelevant("Prețul la electricitate crește", ["Electrica"]), false);
  assert.equal(isRelevant("Acțiunile TLV urcă", ["Banca Transilvania", "TLV"]), true);
  assert.equal(isRelevant("One more thing about phones", ["One United Properties"]), false);
  assert.equal(isRelevant("Santierul Naval Orsova", ["Șantierul Naval Orșova"]), true);
});

test("dedupeNews keeps earliest, sorts newest first", () => {
  const mk = (title: string, date: string, link = "x"): NewsItem => ({ title, link, source: "s", date });
  const out = dedupeNews([
    mk("Profit record!", "2026-03-02T00:00:00.000Z", "late"),
    mk("profit record", "2026-03-01T00:00:00.000Z", "early"),
    mk("Alt titlu", "2026-04-01T00:00:00.000Z"),
    mk("Al treilea", "2026-02-01T00:00:00.000Z"),
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((i) => i.date), [
    "2026-04-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  ]);
  assert.equal(out[1].link, "early");
});

test("parseRss", () => {
  const xml = `<rss><channel>
    <item><title>Profit &amp; pierderi la M&#39;s - Ziarul Financiar</title><link>https://a.example/1</link>
      <pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate><source url="https://zf.ro">Ziarul Financiar</source></item>
    <item><title>Fara data - Sursa</title><link>https://a.example/2</link><source>Sursa</source></item>
    <item><title>Al doilea - Profit.ro</title><link>https://a.example/3</link>
      <pubDate>Tue, 03 Mar 2026 10:00:00 GMT</pubDate><source>Profit.ro</source></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Profit & pierderi la M's");
  assert.equal(items[0].link, "https://a.example/1");
  assert.equal(items[0].source, "Ziarul Financiar");
  assert.equal(items[0].date, "2026-03-02T10:00:00.000Z");
  assert.equal(items[1].title, "Al doilea");
});

test("tagTickers", () => {
  const defs = [
    { t: "TLV", aliases: ["Banca Transilvania", "TLV"] },
    { t: "SNG", aliases: ["Romgaz"] },
    { t: "EL", aliases: ["Electrica"] },
  ];
  assert.deepEqual(tagTickers("Banca Transilvania și Romgaz conduc tranzacțiile", defs), ["TLV", "SNG"]);
  assert.deepEqual(tagTickers("Prețul la electricitate", defs), []);
});

test("isMarketRelevant", () => {
  assert.equal(isMarketRelevant("Detalii despre viața privată a lui Anne-Mary de la Mireasa", []), false);
  assert.equal(isMarketRelevant("Prefectura a anulat taxa de salubrizare", []), false);
  assert.equal(isMarketRelevant("Bursa de la București a deschis în creștere", []), true);
  assert.equal(isMarketRelevant("Indicele BET a urcat cu 0,4%", []), true);
  assert.equal(isMarketRelevant("Anunț important", ["TLV"]), true);
  assert.equal(isMarketRelevant("Un bet pe viitor", []), true);
  assert.equal(isMarketRelevant("Bursierii de la facultate au terminat", []), false);
  assert.equal(isMarketRelevant("Dividendele se vor plăti în iunie", []), true);
});

test("parseRss handles direct publication feeds (CDATA, dc:date, no date, no source)", () => {
  const xml = `<?xml version="1.0"?><rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
    <item rdf:about="x"><title><![CDATA[Bursa a închis în creștere - cu &amp; fără dividende]]></title>
      <link><![CDATA[https://pub.example/a]]></link><dc:date>2026-11-16T09:30:00+02:00</dc:date></item>
    <item><title>Titlu fără dată</title><link>https://pub.example/b</link></item>
    <item><title>Fără link</title></item>
    <item><title>Dată în pubDate &#x219;i hex</title><guid isPermaLink="true">https://pub.example/c</guid>
      <pubDate>Mon, 16 Nov 2026 08:00:00 +0200</pubDate></item>
  </channel></rdf:RDF>`;
  // Without a fallback date, the dateless item is skipped.
  assert.equal(parseRss(xml, { source: "Pub" }).length, 2);
  const items = parseRss(xml, { source: "Pub", fallbackDate: "2026-11-16T12:00:00.000Z" });
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "Bursa a închis în creștere - cu & fără dividende");
  assert.equal(items[0].source, "Pub");
  assert.equal(items[0].link, "https://pub.example/a");
  assert.equal(items[0].date, "2026-11-16T07:30:00.000Z");
  assert.equal(items[1].date, "2026-11-16T12:00:00.000Z");
  assert.equal(items[2].title, "Dată în pubDate și hex");
  assert.equal(items[2].link, "https://pub.example/c");
});

test("cleanSource turns URL-shaped sources into one bare host and keeps real names", () => {
  for (const raw of ["https://www.goldring.ro/ro", "www.goldring.ro", "goldring.ro", "http://goldring.ro/", "WWW.Goldring.ro"]) {
    assert.equal(cleanSource(raw), "goldring.ro", raw);
  }
  assert.equal(cleanSource("https://www.smark.ro/"), "smark.ro");
  assert.equal(cleanSource(": Europa FM"), "Europa FM");
  assert.equal(cleanSource("  Ziarul   Financiar "), "Ziarul Financiar");
  for (const name of ["Profit.ro", "Economica.net", "Realitatea.NET", "PRO TV.ro", "Mold-street.com"]) assert.equal(cleanSource(name), name);
});

test("parseRss cleans the source and still strips it from the title suffix", () => {
  const xml = `<rss><channel><item><title>BET urcă - https://www.goldring.ro/ro</title><link>https://x/1</link>
    <pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate><source url="https://www.goldring.ro">https://www.goldring.ro/ro</source></item></channel></rss>`;
  const [item] = parseRss(xml);
  assert.equal(item.source, "goldring.ro");
  assert.equal(item.title, "BET urcă");
});

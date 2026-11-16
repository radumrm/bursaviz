// The BVB universe the scraper covers. Yahoo symbol = `${t}.RO`.
// `q` is the Google News search used for the per-stock news feed.
// `idx` marks BET membership — a static list, update it when the index is rebalanced.
// Tickers Yahoo does not carry are skipped at scrape time, so listing an uncertain one is harmless.

export interface TickerDef {
  t: string;
  name: string;
  /** Names a Romanian headline actually uses; matched as whole words (see scripts/lib/news.ts). */
  aliases: string[];
  q: string;
  idx?: string;
}

const ctx = "(acțiuni OR bursa OR BVB)";

export const TICKERS: TickerDef[] = [
  // BET
  { t: "TLV", name: "Banca Transilvania", aliases: ["Banca Transilvania", "TLV"], q: `"Banca Transilvania"`, idx: "BET" },
  { t: "SNP", name: "OMV Petrom", aliases: ["OMV Petrom", "Petrom", "SNP"], q: `"OMV Petrom"`, idx: "BET" },
  { t: "H2O", name: "Hidroelectrica", aliases: ["Hidroelectrica"], q: `"Hidroelectrica"`, idx: "BET" },
  { t: "SNG", name: "Romgaz", aliases: ["Romgaz", "SNG"], q: `"Romgaz"`, idx: "BET" },
  { t: "BRD", name: "BRD - Groupe Société Générale", aliases: ["BRD", "Groupe Société Générale"], q: `"BRD" ${ctx}`, idx: "BET" },
  { t: "SNN", name: "Nuclearelectrica", aliases: ["Nuclearelectrica", "SNN"], q: `"Nuclearelectrica"`, idx: "BET" },
  { t: "TGN", name: "Transgaz", aliases: ["Transgaz", "TGN"], q: `"Transgaz"`, idx: "BET" },
  { t: "EL", name: "Electrica", aliases: ["Electrica"], q: `"Electrica" ${ctx}`, idx: "BET" },
  { t: "DIGI", name: "Digi Communications", aliases: ["Digi Communications", "Digi"], q: `"Digi Communications" OR "Digi" ${ctx}`, idx: "BET" },
  { t: "M", name: "MedLife", aliases: ["MedLife"], q: `"MedLife"`, idx: "BET" },
  { t: "ONE", name: "One United Properties", aliases: ["One United Properties", "One United"], q: `"One United Properties"`, idx: "BET" },
  { t: "TEL", name: "Transelectrica", aliases: ["Transelectrica"], q: `"Transelectrica"`, idx: "BET" },
  { t: "FP", name: "Fondul Proprietatea", aliases: ["Fondul Proprietatea"], q: `"Fondul Proprietatea"`, idx: "BET" },
  { t: "PE", name: "Premier Energy", aliases: ["Premier Energy"], q: `"Premier Energy"`, idx: "BET" },
  { t: "TTS", name: "Transport Trade Services", aliases: ["Transport Trade Services", "TTS"], q: `"Transport Trade Services" OR "TTS" ${ctx}`, idx: "BET" },
  { t: "AQ", name: "Aquila Part Prod Com", aliases: ["Aquila"], q: `"Aquila" ${ctx}`, idx: "BET" },
  { t: "WINE", name: "Purcari Wineries", aliases: ["Purcari", "Purcari Wineries"], q: `"Purcari"`, idx: "BET" },
  { t: "SFG", name: "Sphera Franchise Group", aliases: ["Sphera Franchise Group", "Sphera", "SFG"], q: `"Sphera Franchise Group"`, idx: "BET" },
  { t: "ATB", name: "Antibiotice", aliases: ["Antibiotice", "ATB"], q: `"Antibiotice" ${ctx}`, idx: "BET" },
  { t: "TRP", name: "TeraPlast", aliases: ["TeraPlast", "TRP"], q: `"TeraPlast"`, idx: "BET" },

  // Rest of the main market
  { t: "BVB", name: "Bursa de Valori București", aliases: ["Bursa de Valori București", "BVB"], q: `"Bursa de Valori București" acțiuni BVB` },
  { t: "COTE", name: "Conpet", aliases: ["Conpet"], q: `"Conpet"` },
  { t: "BNET", name: "Bittnet Systems", aliases: ["Bittnet", "BNET"], q: `"Bittnet"` },
  { t: "CFH", name: "Cris-Tim Family Holding", aliases: ["Cris-Tim", "CFH"], q: `"Cris-Tim"` },
  { t: "ALR", name: "Alro", aliases: ["Alro", "ALR"], q: `"Alro" ${ctx}` },
  { t: "CMP", name: "Compa", aliases: ["Compa", "CMP"], q: `"Compa" Sibiu ${ctx}` },
  { t: "RRC", name: "Rompetrol Rafinare", aliases: ["Rompetrol Rafinare", "RRC"], q: `"Rompetrol Rafinare"` },
  { t: "OIL", name: "Oil Terminal", aliases: ["Oil Terminal"], q: `"Oil Terminal"` },
  { t: "IARV", name: "IAR Brașov", aliases: ["IAR Brașov", "IARV"], q: `"IAR" Brașov ${ctx}` },
  { t: "ARS", name: "Aerostar", aliases: ["Aerostar", "ARS"], q: `"Aerostar" Bacău` },
  { t: "TBM", name: "Turbomecanica", aliases: ["Turbomecanica", "TBM"], q: `"Turbomecanica"` },
  { t: "EVER", name: "Evergent Investments", aliases: ["Evergent Investments", "Evergent"], q: `"Evergent Investments"` },
  { t: "LION", name: "Lion Capital", aliases: ["Lion Capital"], q: `"Lion Capital" ${ctx}` },
  { t: "TRANSI", name: "Transilvania Investments Alliance", aliases: ["Transilvania Investments", "TRANSI"], q: `"Transilvania Investments"` },
  { t: "INFINITY", name: "Infinity Capital Investments", aliases: ["Infinity Capital Investments"], q: `"Infinity Capital Investments"` },
  { t: "LONG", name: "Longshield Investment Group", aliases: ["Longshield"], q: `"Longshield"` },
  { t: "SAFE", name: "Safetech Innovations", aliases: ["Safetech Innovations", "Safetech"], q: `"Safetech Innovations"` },
  { t: "AROBS", name: "AROBS Transilvania Software", aliases: ["AROBS"], q: `"AROBS"` },
  { t: "ROCE", name: "Romcarbon", aliases: ["Romcarbon", "ROCE"], q: `"Romcarbon"` },
  { t: "BIO", name: "Biofarm", aliases: ["Biofarm"], q: `"Biofarm"` },
  { t: "RMAH", name: "Farmaceutica Remedia", aliases: ["Farmaceutica Remedia", "Remedia", "RMAH"], q: `"Farmaceutica Remedia"` },
  { t: "ALU", name: "Alumil Rom Industry", aliases: ["Alumil", "ALU"], q: `"Alumil"` },
  { t: "PTR", name: "Rompetrol Well Services", aliases: ["Rompetrol Well Services", "PTR"], q: `"Rompetrol Well Services"` },
  { t: "SNO", name: "Șantierul Naval Orșova", aliases: ["Șantierul Naval Orșova", "SNO"], q: `"Șantierul Naval Orșova"` },
  { t: "PREB", name: "Prebet Aiud", aliases: ["Prebet", "PREB"], q: `"Prebet"` },
  { t: "PBK", name: "Patria Bank", aliases: ["Patria Bank", "PBK"], q: `"Patria Bank"` },
  { t: "IMP", name: "Impact Developer & Contractor", aliases: ["Impact Developer"], q: `"Impact Developer"` },
  { t: "DN", name: "DN Agrar Group", aliases: ["DN Agrar"], q: `"DN Agrar"` },
  { t: "MILK", name: "Agroserv Măriuța", aliases: ["Agroserv Măriuța", "Lăptăria cu Caimac"], q: `"Agroserv Măriuța" OR "Lăptăria cu Caimac"` },
  { t: "AAG", name: "Aages", aliases: ["Aages", "AAG"], q: `"Aages"` },
  { t: "ELMA", name: "Electromagnetica", aliases: ["Electromagnetica", "ELMA"], q: `"Electromagnetica"` },
  { t: "VNC", name: "Vrancart", aliases: ["Vrancart", "VNC"], q: `"Vrancart"` },
  { t: "BRK", name: "BRK Financial Group", aliases: ["BRK Financial Group", "BRK"], q: `"BRK Financial Group"` },
  { t: "EFO", name: "Turism Felix", aliases: ["Turism Felix", "EFO"], q: `"Turism Felix"` },
  { t: "ARTE", name: "Artego", aliases: ["Artego"], q: `"Artego"` },
  { t: "SOCP", name: "Socep", aliases: ["Socep", "SOCP"], q: `"Socep"` },
  { t: "UAM", name: "UAMT", aliases: ["UAMT", "UAM"], q: `"UAMT" Oradea` },
  { t: "ELGS", name: "Electroargeș", aliases: ["Electroargeș", "ELGS"], q: `"Electroargeș"` },
  { t: "RPH", name: "Ropharma", aliases: ["Ropharma", "RPH"], q: `"Ropharma"` },
  { t: "ROC1", name: "ROCA Industry", aliases: ["ROCA Industry", "ROC1"], q: `"ROCA Industry"` },
  { t: "SMTL", name: "Simtel Team", aliases: ["Simtel", "SMTL"], q: `"Simtel"` },
  { t: "NRF", name: "Norofert", aliases: ["Norofert", "NRF"], q: `"Norofert"` },
  { t: "HAI", name: "Holde Agri Invest", aliases: ["Holde Agri Invest"], q: `"Holde Agri Invest"` },
  { t: "BENTO", name: "2B Intelligent Soft", aliases: ["2B Intelligent Soft", "Bento"], q: `"Bento" 2B Intelligent Soft` },
  { t: "2P", name: "2Performant Network", aliases: ["2Performant"], q: `"2Performant"` },
  { t: "LIH", name: "Life Is Hard", aliases: ["Life Is Hard", "LIH"], q: `"Life is Hard" ${ctx}` },
];

// Market map. B (two proportional maps with a declared scale break) is the one in use.
// The others stay reachable for comparison: `#/?map=a`, `#/?map=c`, and `#/?map=old` for the compressed single map.
import { Heatmap } from "../Heatmap";
import { MapA } from "./MapA";
import { MapB } from "./MapB";
import { MapC } from "./MapC";
import { readHashQuery } from "../../lib/router";
import type { IndexRow } from "../../lib/types";

export function MarketMap({ rows }: { rows: IndexRow[] }) {
  const pick = readHashQuery().get("map");
  if (pick === "a") return <MapA rows={rows} />;
  if (pick === "c") return <MapC rows={rows} />;
  if (pick === "old") return <Heatmap rows={rows} />;
  return <MapB rows={rows} />;
}

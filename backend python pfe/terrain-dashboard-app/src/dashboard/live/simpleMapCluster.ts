import type { MapCluster, MapPinInput } from "../shared/mapTypes";

/**
 * Regroupe les points proches (grille fixe) pour limiter le nombre de markers
 * sur petit écran — pas de supercluster, juste du bucketing géographique.
 */
export function clusterPins(pins: MapPinInput[], cellSizeDeg = 0.004): MapCluster[] {
  if (pins.length === 0) return [];

  const buckets = new Map<string, MapPinInput[]>();
  for (const p of pins) {
    const gx = Math.floor(p.latitude / cellSizeDeg);
    const gy = Math.floor(p.longitude / cellSizeDeg);
    const key = `${gx}_${gy}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const out: MapCluster[] = [];
  let idx = 0;
  for (const [, group] of buckets) {
    let sumLat = 0;
    let sumLng = 0;
    let critical = false;
    for (const g of group) {
      sumLat += g.latitude;
      sumLng += g.longitude;
      if (g.critical) critical = true;
    }
    const n = group.length;
    out.push({
      id: `c${idx++}`,
      latitude: sumLat / n,
      longitude: sumLng / n,
      count: n,
      critical,
    });
  }
  return out;
}

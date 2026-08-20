/**
 * Decode an encoded polyline (precision 5 — what Ola's directions return)
 * into [lng, lat] pairs ready for a GeoJSON LineString.
 */
export function decodePolyline(str: string): Array<[number, number]> {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: Array<[number, number]> = [];
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let shift = 0;
      let result = 0;
      let b = 0x20;
      while (b >= 0x20) {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      }
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

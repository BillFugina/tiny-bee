/** Plain geometry on the globe: distances and the point that sits fairly between people. */

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371.0088

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

type Vec3 = [number, number, number]

function toVec(p: LatLng): Vec3 {
  const lat = toRad(p.lat)
  const lng = toRad(p.lng)
  return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)]
}

function toLatLng([x, y, z]: Vec3): LatLng {
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lng: toDeg(Math.atan2(y, x)) }
}

/**
 * The geometric median: the point with the smallest total distance to everyone.
 * Unlike the plain average, one far-off person can't drag it away from everyone else.
 *
 * This is an approximation, not an exact spherical optimization. Each step is a
 * Weiszfeld step in 3D: average the points as unit vectors, weighted by the
 * inverse of their great-circle distance, then project back onto the sphere.
 * Within driving range (a few hundred km) the sphere is nearly flat and the
 * result is close to the true median; across continents it can drift. That's
 * fine here, since the median is only one starting candidate, and real travel
 * times decide the ranking.
 */
export function geometricMedian(points: readonly LatLng[], { iterations = 200, toleranceKm = 0.001 } = {}): LatLng {
  if (points.length === 0) throw new Error('geometricMedian needs at least one point')
  if (points.length === 1) return { ...points[0]! }

  const vecs = points.map(toVec)
  let current = normalize(sum(vecs))
  // All points antipodal or cancelling out: fall back to the first one.
  if (current === null) return { ...points[0]! }

  for (let i = 0; i < iterations; i++) {
    let acc: Vec3 = [0, 0, 0]
    let weight = 0
    for (const [index, v] of vecs.entries()) {
      const d = distanceKm(toLatLng(current), points[index]!)
      // Sitting on a point: that point is a fine answer, since moving off it can't win by much.
      if (d < 1e-9) return { ...points[index]! }
      acc = [acc[0] + v[0] / d, acc[1] + v[1] / d, acc[2] + v[2] / d]
      weight += 1 / d
    }
    const next = normalize([acc[0] / weight, acc[1] / weight, acc[2] / weight])
    if (next === null) break
    const moved = distanceKm(toLatLng(current), toLatLng(next))
    current = next
    if (moved < toleranceKm) break
  }
  return toLatLng(current)
}

function sum(vecs: Vec3[]): Vec3 {
  return vecs.reduce<Vec3>((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0])
}

function normalize(v: Vec3): Vec3 | null {
  const n = Math.hypot(...v)
  return n < 1e-12 ? null : [v[0] / n, v[1] / n, v[2] / n]
}

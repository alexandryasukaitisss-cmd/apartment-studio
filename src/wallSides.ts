import { type Project, type Wall, type Point, inside } from './model';
/** Split at all room boundary coordinates; find the actual rooms on the two faces. */
export function wallFaceSpans(w: Wall, project: Project, start: number, end: number): { start: number; end: number; positive: string | null; negative: string | null }[] {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const cuts = [start, end];
  for (const r of project.rooms)
    for (const pt of r.polygon) {
      const t = (pt[0] - w.a[0]) * ux + (pt[1] - w.a[1]) * uz;
      if (t > start + 1e-8 && t < end - 1e-8)
        cuts.push(t)
    }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((s, i) => {
    const e = sorted[i + 1], x = w.a[0] + ux * (s + e) / 2, z = w.a[1] + uz * (s + e) / 2;
    const roomAt = (sign: number) => project.rooms.find(r => inside([x - uz * .09 * sign, z + ux * .09 * sign] as Point, r.polygon))?.id ?? null;
    return { start: s, end: e, positive: roomAt(1), negative: roomAt(-1) }
  })
}

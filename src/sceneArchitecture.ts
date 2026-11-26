import * as THREE from 'three';
import { type Project, type RenovationStage, type Variant, solidSpans } from './model';
import { openingHeights } from './openingHeights';
import { doorSwingInfo } from './roomMeasures';
import { wallFaceSpans } from './wallSides';
import { lifeZonePolygons } from './viewpoints';

export function buildDoorAssemblies(project: Project, variant: Variant, stage: RenovationStage, mode: '3d' | 'walk'): THREE.Group {
  const group = new THREE.Group();
  const scale = project.scale;
  const wallH = (mode === 'walk' ? project.ceilingHeight : 1.18) / scale;
  const showLeaves = stage === 'finishes' || stage === 'furnished';
  const doorColor = variant.doorColor ?? '#dfd8cc';
  const hidden = variant.doorStyle === 'hidden';
  const frameMat = showLeaves ? new THREE.MeshStandardMaterial({ color: hidden ? '#d6d1c6' : doorColor, roughness: .72 }) : null;
  const leafMat = showLeaves ? new THREE.MeshStandardMaterial({ color: doorColor, roughness: .68 }) : null;
  const panelMat = showLeaves && !hidden ? new THREE.MeshStandardMaterial({ color: new THREE.Color(doorColor).multiplyScalar(.94), roughness: .75 }) : null;
  const handleMat = showLeaves ? new THREE.MeshStandardMaterial({ color: '#8f9396', metalness: .72, roughness: .28 }) : null;
  const roughJambMat = !showLeaves ? new THREE.MeshStandardMaterial({ color: '#b5ada0', roughness: .92 }) : null;

  for (const w of project.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const angle = -Math.atan2(uz, ux);
    for (const o of w.openings ?? []) {
      if (o.kind !== 'door') continue;
      const head = Math.min((o.headHeight ?? openingHeights.door) / scale, wallH);
      const jambMat = (showLeaves ? frameMat : roughJambMat)!;
      // Door jambs
      for (const t of [o.start, o.end]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(.045, head, hidden ? .135 : .175), jambMat);
        jamb.position.set(w.a[0] + ux * t, head / 2, w.a[1] + uz * t);
        jamb.rotation.y = angle;
        jamb.castShadow = true;
        jamb.receiveShadow = true;
        group.add(jamb);
      }
      // Top transom casing in walk mode
      if (mode === 'walk' && showLeaves && !hidden && frameMat) {
        const mid = (o.start + o.end) / 2;
        const header = new THREE.Mesh(new THREE.BoxGeometry(o.end - o.start + .09, .055 / scale, .178), frameMat);
        header.position.set(w.a[0] + ux * mid, head, w.a[1] + uz * mid);
        header.rotation.y = angle;
        header.castShadow = true;
        group.add(header);
      }
      if (!showLeaves || !leafMat || !handleMat) continue;
      const swing = doorSwingInfo(project, w, o);
      if (!swing) continue;
      const leafWidth = Math.max(.2, o.end - o.start - .05);
      const leafThickness = .042;
      const pivot = new THREE.Group();
      pivot.position.set(swing.hx, 0, swing.hy);
      const dirX = swing.hinge === 'start' ? ux : -ux;
      const dirZ = swing.hinge === 'start' ? uz : -uz;
      const nx = -uz, nz = ux;
      const openDirX = dirX * Math.cos(.38) + nx * swing.sign * Math.sin(.38);
      const openDirZ = dirZ * Math.cos(.38) + nz * swing.sign * Math.sin(.38);
      pivot.rotation.y = -Math.atan2(openDirZ, openDirX);

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, head - .015, leafThickness), leafMat);
      leaf.position.set(leafWidth / 2, (head - .015) / 2, 0);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      pivot.add(leaf);

      if (!hidden && head > 1.2 && panelMat) {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(leafWidth * .74, head * .74, leafThickness + .006), panelMat);
        inset.position.set(leafWidth / 2, head * .5, 0);
        pivot.add(inset);
      }

      // Lever handle at 1.0 m physical height (if visible below cutaway wall height)
      const handleY = Math.min(1.0 / scale, head - .12);
      if (handleY > .35) {
        const hx = leafWidth - .09;
        for (const side of [-1, 1]) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .042, 8), handleMat);
          stem.rotation.x = Math.PI / 2;
          stem.position.set(hx, handleY, side * (leafThickness / 2 + .02));
          pivot.add(stem);
          const lever = new THREE.Mesh(new THREE.BoxGeometry(.11, .016, .016), handleMat);
          lever.position.set(hx - .042, handleY, side * (leafThickness / 2 + .042));
          pivot.add(lever);
        }
      }
      group.add(pivot);
    }
  }
  return group;
}

export function buildSkirtingBoards(project: Project, variant: Variant, stage: RenovationStage): THREE.Group {
  const group = new THREE.Group();
  if (stage !== 'finishes' && stage !== 'furnished') return group;
  const scale = project.scale;
  const h = (variant.skirtingHeight ?? .08) / scale;
  const thickness = .018 / scale;
  const halfWall = .066;
  const mat = new THREE.MeshStandardMaterial({ color: variant.skirtingColor ?? '#ede9e0', roughness: .72 });

  for (const w of project.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const nx = -uz, nz = ux;
    const angle = -Math.atan2(uz, ux);
    // Only skip doors on floor level; windows sit above the skirting.
    const floorWall = { ...w, openings: (w.openings ?? []).filter(o => o.kind === 'door') };
    for (const [s, e] of solidSpans(floorWall)) {
      if (e - s < .04) continue;
      for (const face of wallFaceSpans(w, project, s, e)) {
        const segLen = face.end - face.start;
        if (segLen < .04) continue;
        const mid = (face.start + face.end) / 2;
        const bx = w.a[0] + ux * mid, bz = w.a[1] + uz * mid;
        if (face.positive && face.positive !== 'balcony') {
          const m = new THREE.Mesh(new THREE.BoxGeometry(segLen, h, thickness), mat);
          m.position.set(bx + nx * (halfWall + thickness / 2), h / 2, bz + nz * (halfWall + thickness / 2));
          m.rotation.y = angle;
          m.receiveShadow = true;
          group.add(m);
        }
        if (face.negative && face.negative !== 'balcony') {
          const m = new THREE.Mesh(new THREE.BoxGeometry(segLen, h, thickness), mat);
          m.position.set(bx - nx * (halfWall + thickness / 2), h / 2, bz - nz * (halfWall + thickness / 2));
          m.rotation.y = angle;
          m.receiveShadow = true;
          group.add(m);
        }
      }
    }
  }
  return group;
}

export function buildWindowCurtains(project: Project, stage: RenovationStage, mode: '3d' | 'walk'): THREE.Group {
  const group = new THREE.Group();
  if (stage !== 'furnished' || mode !== 'walk') return group;
  const scale = project.scale;
  const ceilH = project.ceilingHeight / scale;
  const drapeMat = new THREE.MeshStandardMaterial({ color: '#e5dfd3', roughness: .94 });
  const sheerMat = new THREE.MeshStandardMaterial({ color: '#faf9f5', transparent: true, opacity: .36, roughness: .95, depthWrite: false });
  const railMat = new THREE.MeshStandardMaterial({ color: '#6b6f70', metalness: .6, roughness: .35 });

  for (const w of project.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const nx = -uz, nz = ux;
    const angle = -Math.atan2(uz, ux);
    for (const o of w.openings ?? []) {
      if (o.kind !== 'window') continue;
      const mid = (o.start + o.end) / 2;
      const face = wallFaceSpans(w, project, o.start, o.end)[0];
      const insideRoom = face?.positive && face.positive !== 'balcony' ? 1 : face?.negative && face.negative !== 'balcony' ? -1 : 0;
      if (!insideRoom) continue;
      const width = o.end - o.start + .34 / scale;
      const cx = w.a[0] + ux * mid + nx * insideRoom * (.15 / scale);
      const cz = w.a[1] + uz * mid + nz * insideRoom * (.15 / scale);
      const cg = new THREE.Group();
      cg.position.set(cx, 0, cz);
      cg.rotation.y = angle;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, .022 / scale, .022 / scale), railMat);
      rail.position.y = ceilH - .03 / scale;
      cg.add(rail);
      const sheer = new THREE.Mesh(new THREE.BoxGeometry(width * .86, ceilH - .05 / scale, .012 / scale), sheerMat);
      sheer.position.set(0, (ceilH - .05 / scale) / 2, -insideRoom * .02 / scale);
      cg.add(sheer);
      for (const side of [-1, 1]) {
        const panelW = Math.min(.36 / scale, width * .2);
        const drape = new THREE.Mesh(new THREE.BoxGeometry(panelW, ceilH - .04 / scale, .065 / scale), drapeMat);
        drape.position.set(side * (width / 2 - panelW / 2), (ceilH - .04 / scale) / 2, insideRoom * .025 / scale);
        drape.castShadow = true;
        cg.add(drape);
      }
      group.add(cg);
    }
  }
  return group;
}

export function buildElectricalAndEngineering3D(project: Project, variant: Variant, stage: RenovationStage, showElectrical: boolean): THREE.Group {
  const group = new THREE.Group();
  const scale = project.scale;
  const showElec = showElectrical || stage === 'rough' || stage === 'finishes';
  const showEng = stage === 'shell' || stage === 'rough' || showElectrical;

  if (showElec) {
    const plateMat = new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: .55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#394042', roughness: .55 });
    const netMat = new THREE.MeshStandardMaterial({ color: '#3b6b88', roughness: .55 });
    const appMat = new THREE.MeshStandardMaterial({ color: '#b4622b', roughness: .55 });
    for (const pt of variant.electrical.points) {
      if (pt.type === 'light') continue;
      // Find nearest wall of the room so the plate sits flush and oriented on the wall face
      let bestDist = Infinity, bestX = pt.x, bestZ = pt.z, bestAngle = 0;
      for (const w of project.walls) {
        if (!w.rooms.includes(pt.roomId)) continue;
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        if (!len) continue;
        const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
        const t = Math.max(0, Math.min(len, (pt.x - w.a[0]) * ux + (pt.z - w.a[1]) * uz));
        const px = w.a[0] + ux * t, pz = w.a[1] + uz * t;
        const d = Math.hypot(pt.x - px, pt.z - pz);
        if (d < bestDist) {
          bestDist = d;
          const nx = -uz, nz = ux;
          const side = (pt.x - px) * nx + (pt.z - pz) * nz >= 0 ? 1 : -1;
          bestX = px + nx * side * .073;
          bestZ = pz + nz * side * .073;
          bestAngle = -Math.atan2(uz, ux);
        }
      }
      const box = new THREE.Group();
      const px = bestDist < .45 ? bestX : pt.x;
      const pz = bestDist < .45 ? bestZ : pt.z;
      box.position.set(px, pt.height / scale, pz);
      box.rotation.y = bestAngle;
      const wSize = (pt.type === 'socket' ? .14 : .085) / scale;
      const hSize = .085 / scale;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(wSize, hSize, .016 / scale), plateMat);
      box.add(plate);
      const accent = pt.type === 'network' ? netMat : pt.type === 'appliance' ? appMat : darkMat;
      if (pt.type === 'socket') {
        for (const ox of [-.032 / scale, .032 / scale]) {
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(.018 / scale, .018 / scale, .02 / scale, 12), accent);
          hole.rotation.x = Math.PI / 2;
          hole.position.x = ox;
          box.add(hole);
        }
      } else {
        const insert = new THREE.Mesh(new THREE.BoxGeometry(wSize * .55, hSize * .55, .02 / scale), accent);
        box.add(insert);
      }
      group.add(box);
    }
  }

  if (showEng) {
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#6b7985', metalness: .45, roughness: .4 });
    const radMat = new THREE.MeshStandardMaterial({ color: '#ecebe6', metalness: .2, roughness: .4 });
    const acMat = new THREE.MeshStandardMaterial({ color: '#f2f1ed', roughness: .35 });
    for (const it of variant.engineering?.items ?? []) {
      if (it.type === 'riser') {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.055 / scale, .055 / scale, project.ceilingHeight / scale, 12), pipeMat);
        pipe.position.set(it.x, project.ceilingHeight / 2 / scale, it.z);
        group.add(pipe);
      } else if (it.type === 'radiator') {
        const rad = new THREE.Mesh(new THREE.BoxGeometry(.85 / scale, .52 / scale, .10 / scale), radMat);
        rad.position.set(it.x, .42 / scale, it.z);
        rad.castShadow = true;
        group.add(rad);
      } else if (it.type === 'ac') {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(.82 / scale, .28 / scale, .20 / scale), acMat);
        ac.position.set(it.x, Math.min(project.ceilingHeight - .25, 2.45) / scale, it.z);
        ac.castShadow = true;
        group.add(ac);
      } else if (it.type === 'manifold') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(.48 / scale, .62 / scale, .14 / scale), pipeMat);
        box.position.set(it.x, 1.1 / scale, it.z);
        group.add(box);
      } else if (it.type === 'drain') {
        const drain = new THREE.Mesh(new THREE.BoxGeometry(.18 / scale, .012 / scale, .18 / scale), pipeMat);
        drain.position.set(it.x, .008 / scale, it.z);
        group.add(drain);
      }
    }
    // Heated floor warm amber overlay in rough stage
    if (stage === 'rough') {
      const hfMat = new THREE.MeshBasicMaterial({ color: '#e67e22', transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false });
      for (const zone of variant.engineering?.heatedFloors ?? []) {
        const room = project.rooms.find(r => r.id === zone.roomId);
        if (!room) continue;
        const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
        const geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geom, hfMat);
        mesh.position.y = .012;
        group.add(mesh);
      }
    }
  }
  return group;
}

export function buildLifeZones3D(project: Project, variant: Variant): THREE.Group {
  const group = new THREE.Group();
  const zones = lifeZonePolygons(project, variant);
  const colors: Record<string, string> = {
    clearance: '#d97706',
    seating: '#2f7a62',
    tv_cone: '#2563eb',
  };
  for (const zone of zones) {
    const color = colors[zone.kind] ?? '#2f7a62';
    const shape = new THREE.Shape(zone.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false,
    }));
    fill.position.y = .024;
    group.add(fill);
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(zone.polygon.map(([x, z]) => new THREE.Vector3(x, .028, z))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: .75 }),
    );
    group.add(border);
  }
  return group;
}

import type { RaceState } from '../game/race';
import type { Telemetry, Vec2 } from '../physics/types';
import { getTerrainHeight, getTerrainSeed } from '../world/terrain';

export function chartProjection(points: readonly Vec2[], width: number, height: number, padding = 30) {
  const xs = points.map(point => point.x), zs = points.map(point => point.z);
  const minX = Math.floor(Math.min(...xs, -20) / 40) * 40, maxX = Math.ceil(Math.max(...xs, 20) / 40) * 40;
  const minZ = Math.floor(Math.min(...zs, -20) / 40) * 40, maxZ = Math.ceil(Math.max(...zs, 20) / 40) * 40;
  const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxZ - minZ));
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  return {
    scale, key: `${minX}:${maxX}:${minZ}:${maxZ}`,
    point: (point: Vec2) => ({ x: width / 2 + (point.x - centerX) * scale, y: height / 2 + (point.z - centerZ) * scale }),
    world: (x: number, y: number) => ({ x: centerX + (x - width / 2) / scale, z: centerZ + (y - height / 2) / scale }),
  };
}

/** North-up chart. Every mark and boat comes from the same state that judges the race. */
export function createCourseChart(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  const backdrop = document.createElement('canvas'); backdrop.width = 320; backdrop.height = 250;
  const background = backdrop.getContext('2d');
  const width = 320, height = 250;
  let session: RaceState | null = null, backdropKey = '', sampledAt = -Infinity;
  const track: Vec2[] = [];
  canvas.width = width * 2; canvas.height = height * 2;
  function record(race: RaceState) {
    const player = race.racers[0];
    if (session !== race || player.state.time < sampledAt) { session = race; track.length = 0; sampledAt = -Infinity; backdropKey = ''; }
    if (player.state.time - sampledAt >= 1) {
      track.push({ ...player.state.position }); sampledAt = player.state.time;
      if (track.length > 300) track.shift();
    }
  }
  function update(race: RaceState, telemetry: Telemetry) {
    if (!context || !background) return;
    record(race);
    const course = race.course;
    const marks = [course.startPin, course.committee, course.windward, course.gatePort, course.gateStarboard];
    const projection = chartProjection([...marks, ...race.racers.map(r => r.state.position)], width, height);
    const point = projection.point;
    const key = `${getTerrainSeed()}:${projection.key}`;
    if (key !== backdropKey) {
      backdropKey = key;
      background.fillStyle = '#d6f2f4'; background.fillRect(0, 0, width, height);
      // A cached coarse depth chart shows real islands without querying terrain every frame.
      for (let y = 0; y < height; y += 5) for (let x = 0; x < width; x += 5) {
        const world = projection.world(x + 2.5, y + 2.5), elevation = getTerrainHeight(world.x, world.z);
        if (elevation < -4) continue;
        background.fillStyle = elevation < -1 ? '#a2e4df' : elevation < .8 ? '#ffe144' : elevation < 14 ? '#8ddba5' : '#28b5a8';
        background.fillRect(x, y, 5, 5);
      }
      background.strokeStyle = '#55888b44'; background.lineWidth = .5;
      for (let x = 40; x < width; x += 40) { background.beginPath(); background.moveTo(x, 0); background.lineTo(x, height); background.stroke(); }
      for (let y = 40; y < height; y += 40) { background.beginPath(); background.moveTo(0, y); background.lineTo(width, y); background.stroke(); }
    }
    context.setTransform(2, 0, 0, 2, 0, 0); context.clearRect(0, 0, width, height); context.drawImage(backdrop, 0, 0);
    const path = (points: readonly Vec2[], color: string, lineWidth: number, dashed = false) => {
      context.beginPath(); points.forEach((p, i) => { const q = point(p); if (i) context.lineTo(q.x, q.y); else context.moveTo(q.x, q.y); });
      context.strokeStyle = color; context.lineWidth = lineWidth; context.setLineDash(dashed ? [4, 4] : []); context.stroke(); context.setLineDash([]);
    };
    path([course.startPin, course.committee], '#141414', 2.5);
    path([course.gatePort, course.gateStarboard], '#141414', 1.5, true);
    if (track.length > 1) path(track, '#bc4749', 1.5);
    const dot = (location: Vec2, color: string, radius: number) => {
      const q = point(location); context.beginPath(); context.arc(q.x, q.y, radius, 0, Math.PI * 2);
      context.fillStyle = color; context.fill(); context.strokeStyle = '#141414'; context.lineWidth = 1.4; context.stroke();
    };
    dot(course.startPin, '#ff6b6b', 4); dot(course.committee, '#fffdf7', 4);
    dot(course.windward, '#ffe144', 5); dot(course.gatePort, '#ffe144', 4); dot(course.gateStarboard, '#ffe144', 4);
    context.font = 'bold 9px Arial'; context.fillStyle = '#29494b'; context.textAlign = 'center';
    const windward = point(course.windward), start = point({ x: (course.startPin.x + course.committee.x) / 2, z: (course.startPin.z + course.committee.z) / 2 });
    context.fillText('WINDWARD', windward.x, windward.y - 11);
    context.fillText('START / FINISH', start.x, start.y + 17);
    const gate = point({ x: (course.gatePort.x + course.gateStarboard.x) / 2, z: (course.gatePort.z + course.gateStarboard.z) / 2 });
    context.fillText('GATE', gate.x, gate.y - 10);
    for (const racer of [...race.racers].reverse()) {
      const q = point(racer.state.position), size = racer.isPlayer ? 7 : 5;
      context.save(); context.translate(q.x, q.y); context.rotate(racer.state.heading);
      context.beginPath(); context.moveTo(0, -size); context.lineTo(size * .62, size * .65); context.lineTo(0, size * .35); context.lineTo(-size * .62, size * .65); context.closePath();
      context.fillStyle = racer.isPlayer ? '#141414' : `#${racer.color.toString(16).padStart(6, '0')}`;
      context.strokeStyle = racer.isPlayer ? '#fffdf7' : '#141414'; context.lineWidth = racer.isPlayer ? 2 : 1; context.fill(); context.stroke(); context.restore();
    }
    context.font = 'bold 10px Arial'; context.textAlign = 'left'; context.fillStyle = '#141414'; context.fillText('N ↑', 11, 18);
    context.save(); context.translate(width - 24, 27); context.rotate((telemetry.trueWindDirectionDeg + 180) * Math.PI / 180);
    context.strokeStyle = '#141414'; context.lineWidth = 2; context.beginPath(); context.moveTo(0, 10); context.lineTo(0, -10); context.moveTo(-4, -5); context.lineTo(0, -10); context.lineTo(4, -5); context.stroke(); context.restore();
    context.textAlign = 'right'; context.font = 'bold 9px Arial'; context.fillText('WIND', width - 11, 50);
    const meters = [5, 10, 20, 50, 100, 200, 500].find(value => value * projection.scale >= 30) ?? 500;
    context.strokeStyle = '#141414'; context.lineWidth = 2; context.beginPath(); context.moveTo(12, height - 15); context.lineTo(12 + meters * projection.scale, height - 15); context.stroke();
    context.textAlign = 'left'; context.fillText(`${meters} m`, 12, height - 21);
    canvas.setAttribute('aria-label', `North-up course chart. You and ${race.racers.length - 1} opponents. Dark boat is you; coral trail is your last five minutes.`);
  }
  return { update, record };
}

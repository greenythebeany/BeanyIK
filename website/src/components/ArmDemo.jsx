import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n.js';

import { L, REACH, HOME, fk, step } from '../arm.js';

const W = 2.4, H = 1.6; // world box in metres, base at (0, 0)
const toScreen = ([x, y]) => [x + W / 2, H * 0.62 - y];

export default function ArmDemo() {
  const { t } = useLang();
  const [q, setQ] = useState(HOME);
  const [target, setTarget] = useState(() => fk(HOME)[3]);
  const [trail, setTrail] = useState([]);
  const svgRef = useRef(null);
  const qRef = useRef(HOME);
  const targetRef = useRef(target);
  const dragging = useRef(false);

  useEffect(() => { targetRef.current = target; }, [target]);

  useEffect(() => {
    let raf;
    const tick = () => {
      // a few small steps per frame, still capped in total
      let cur = qRef.current;
      for (let k = 0; k < 3; k++) cur = step(cur, targetRef.current).q;
      const moved = cur.some((v, i) => Math.abs(v - qRef.current[i]) > 1e-6);
      if (moved) {
        qRef.current = cur;
        setQ(cur);
        const tip = fk(cur)[3];
        setTrail((tr) => [...tr.slice(-90), tip]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // screen to svg units through the svg's own transform, works with letterboxing
  const toWorld = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x - W / 2, H * 0.62 - p.y];
  };
  const onDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setTarget(toWorld(e));
  };
  const onMove = (e) => { if (dragging.current) setTarget(toWorld(e)); };
  const onUp = () => { dragging.current = false; };

  const pts = fk(q).map(toScreen);
  const tgt = toScreen(target);
  const tip = fk(q)[3];
  const reached = Math.hypot(tip[0] - target[0], tip[1] - target[1]) < 0.005;
  const deg = (r) => `${(r * 180 / Math.PI).toFixed(1)}°`;

  const grid = [];
  for (let x = 0; x <= W + 1e-9; x += 0.1) grid.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} className={Math.abs((x * 10) % 5) < 0.01 ? 'g2' : 'g1'} />);
  for (let y = 0; y <= H + 1e-9; y += 0.1) grid.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} className={Math.abs((y * 10) % 5) < 0.01 ? 'g2' : 'g1'} />);

  return (
    <div className="arm-demo">
      <div className="arm-stage">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label="Interactive robot arm">
          <g className="grid">{grid}</g>
          <circle cx={W / 2} cy={H * 0.62} r={REACH} className="reach" />
          <polyline points={trail.map((p) => toScreen(p).join(',')).join(' ')} className="trail" />
          <rect x={W / 2 - 0.09} y={H * 0.62} width={0.18} height={0.05} rx={0.015} className="base" />
          {pts.slice(0, 3).map((p, i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={pts[i + 1][0]} y2={pts[i + 1][1]} className="link" />
          ))}
          {pts.slice(0, 3).map((p, i) => <circle key={`j${i}`} cx={p[0]} cy={p[1]} r={0.035} className="joint" />)}
          <circle cx={pts[3][0]} cy={pts[3][1]} r={0.022} className="tool" />
          <g transform={`translate(${tgt[0]} ${tgt[1]})`} className="target">
            <circle r={0.05} className="target-ring" />
            <circle r={0.016} className="target-dot" />
          </g>
        </svg>
      </div>
      <div className="arm-readout">
        <div className={`status ${reached ? 'ok' : 'warn'}`}>{reached ? t.tryIt.reachable : t.tryIt.unreachable}</div>
        <div className="label">{t.tryIt.joints}</div>
        <div className="math">
          {q.map((v, i) => <div key={i}><i>q</i><sub>{i + 1}</sub> = {deg(v)}</div>)}
          <div className="dim"><i>p</i> = ({tip[0].toFixed(3)}, {tip[1].toFixed(3)}) m</div>
        </div>
        <button className="btn" onClick={() => { qRef.current = HOME; setQ(HOME); setTarget(fk(HOME)[3]); setTrail([]); }}>{t.tryIt.reset}</button>
      </div>
    </div>
  );
}

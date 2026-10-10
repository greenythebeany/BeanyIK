// export to matlab, csv and latex
import { isActive } from './robot.js';

const toMatlabExpr = (src) => String(src ?? '0').trim()
  .replace(/\*\*/g, '^')
  .replace(/\bln\(/g, 'log(')
  .replace(/\bdeg\(/g, 'rad2deg(')
  .replace(/\brad\(/g, 'deg2rad(') || '0';

const fmt = (v, digits = 4) => {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  return r.toFixed(digits);
};

export function matrixToText(A, digits = 4) {
  const cells = A.map((row) => row.map((v) => fmt(v, digits)));
  const w = Math.max(...cells.flat().map((c) => c.length));
  return cells.map((row) => row.map((c) => c.padStart(w)).join('  ')).join('\n');
}

export function matrixToMatlab(A, name = 'T', digits = 6) {
  return `${name} = [\n${A.map((row) => '  ' + row.map((v) => fmt(v, digits)).join(', ')).join(';\n')}\n];`;
}

export function toMatlab(robot) {
  const lines = [];
  const qNames = [];
  let k = 0;
  robot.joints.forEach((j) => { if (isActive(j)) qNames.push(`q${++k}`); });
  lines.push(`% ${robot.name}, exported from BeanyIK`);
  lines.push(`% Convention: ${robot.convention === 'modified' ? 'modified (Craig) DH: Rx(alpha) Tx(a) Rz(theta) Tz(d)' : 'standard DH: Rz(theta) Tz(d) Tx(a) Rx(alpha)'}`);
  lines.push('% Joint variables q are in rad (revolute) / m (prismatic).');
  lines.push('');
  if (qNames.length) lines.push(`syms ${qNames.join(' ')} real`);
  for (const p of robot.params) lines.push(`${p.name} = ${toMatlabExpr(p.value)};`);
  lines.push('');
  lines.push('d2r = @(x) x*sym(pi)/180;  % exact degrees to radians, keeps cos(pi/2) = 0');
  if (robot.joints.some((j) => j.mode === 'elem')) {
    lines.push('Rx = @(t) [1 0 0 0; 0 cos(t) -sin(t) 0; 0 sin(t) cos(t) 0; 0 0 0 1];');
    lines.push('Ry = @(t) [cos(t) 0 sin(t) 0; 0 1 0 0; -sin(t) 0 cos(t) 0; 0 0 0 1];');
    lines.push('Rz = @(t) [cos(t) -sin(t) 0 0; sin(t) cos(t) 0 0; 0 0 1 0; 0 0 0 1];');
    lines.push('Tx = @(d) [1 0 0 d; 0 1 0 0; 0 0 1 0; 0 0 0 1];');
    lines.push('Ty = @(d) [1 0 0 0; 0 1 0 d; 0 0 1 0; 0 0 0 1];');
    lines.push('Tz = @(d) [1 0 0 0; 0 1 0 0; 0 0 1 d; 0 0 0 1];');
  }
  lines.push(robot.convention === 'modified'
    ? 'A = @(th, d, a, al) [cos(th) -sin(th) 0 a; sin(th)*cos(al) cos(th)*cos(al) -sin(al) -sin(al)*d; sin(th)*sin(al) cos(th)*sin(al) cos(al) cos(al)*d; 0 0 0 1];'
    : 'A = @(th, d, a, al) [cos(th) -sin(th)*cos(al) sin(th)*sin(al) a*cos(th); sin(th) cos(th)*cos(al) -cos(th)*sin(al) a*sin(th); 0 sin(al) cos(al) d; 0 0 0 1];');
  const pose = (p) => `trvec2tform([${toMatlabExpr(p.x)} ${toMatlabExpr(p.y)} ${toMatlabExpr(p.z)}]) * eul2tform(deg2rad([${toMatlabExpr(p.yaw)} ${toMatlabExpr(p.pitch)} ${toMatlabExpr(p.roll)}]), 'ZYX')`;
  lines.push('');
  lines.push(`Tbase = ${pose(robot.base)};`);
  lines.push(`Ttool = ${pose(robot.tool)};`);
  lines.push('');
  k = 0;
  robot.joints.forEach((j, i) => {
    const n = i + 1;
    const label = j.name ? `  % ${j.name}` : '';
    if (j.mode === 'elem') {
      // fields use degrees and q in slider units, so turn q (rad) into degrees for revolute joints
      const q = isActive(j) ? qNames[k++] : '0';
      const qExpr = j.type === 'revolute' ? `(${q}*180/sym(pi))` : q;
      const fac = (j.elems || []).map((e) => {
        const v = toMatlabExpr(e.v).replace(/\bq\b/g, qExpr);
        return e.op[0] === 'R' ? `${e.op}(d2r(${v}))` : `${e.op}(${v})`;
      });
      lines.push(`A${n} = ${fac.join(' * ') || 'eye(4)'};${label}`);
    } else if (j.mode === 'matrix') {
      const q = isActive(j) ? qNames[k++] : '0';
      const rows = j.matrix.map((row) => row.map((c) => toMatlabExpr(c)).join(' '));
      lines.push(`q = ${q};${label}`);
      lines.push(`A${n} = [${rows.join('; ')}; 0 0 0 1];`);
    } else {
      const isZero = (x) => /^\s*-?0*(\.0*)?\s*$/.test(String(x ?? '0'));
      let th = `d2r(${toMatlabExpr(j.dh.theta)})`;
      let d = toMatlabExpr(j.dh.d);
      if (j.type === 'revolute') th = isZero(j.dh.theta) ? qNames[k++] : `${qNames[k++]} + ${th}`;
      else if (j.type === 'prismatic') d = isZero(j.dh.d) ? qNames[k++] : `${qNames[k++]} + ${d}`;
      lines.push(`A${n} = A(${th}, ${d}, ${toMatlabExpr(j.dh.a)}, d2r(${toMatlabExpr(j.dh.alpha)}));${label}`);
    }
  });
  lines.push('');
  const chain = robot.joints.map((_, i) => `A${i + 1}`).join(' * ') || 'eye(4)';
  lines.push(`T = simplify(Tbase * ${chain} * Ttool)`);
  if (qNames.length) {
    lines.push('');
    lines.push('% Linear-velocity part of the Jacobian (angular part = joint z axes):');
    lines.push(`Jv = simplify(jacobian(T(1:3,4), [${qNames.join(' ')}]))`);
  }
  return lines.join('\n') + '\n';
}

export function dhTableCSV(robot) {
  const rows = [['#', 'name', 'type', 'theta_deg', 'd_m', 'a_m', 'alpha_deg', 'min', 'max']];
  robot.joints.forEach((j, i) => {
    if (j.mode === 'matrix') rows.push([i + 1, j.name, `${j.type} (matrix)`, '', '', '', '', j.min, j.max]);
    else rows.push([i + 1, j.name, j.type, j.dh.theta, j.dh.d, j.dh.a, j.dh.alpha, j.min, j.max]);
  });
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

export function dhTableLatex(robot) {
  let k = 0;
  const body = robot.joints.map((j, i) => {
    if (j.mode === 'matrix') return `${i + 1} & \\multicolumn{4}{c}{custom matrix} \\\\`;
    const th = j.type === 'revolute' ? `q_{${++k}}${j.dh.theta !== '0' ? ` + ${j.dh.theta}^\\circ` : ''}` : `${j.dh.theta}^\\circ`;
    const d = j.type === 'prismatic' ? `q_{${++k}}${j.dh.d !== '0' ? ` + ${j.dh.d}` : ''}` : j.dh.d;
    return `${i + 1} & ${th} & ${d} & ${j.dh.a} & ${j.dh.alpha}^\\circ \\\\`;
  });
  return [
    '\\begin{tabular}{c|cccc}',
    `$i$ & $\\theta_i$ & $d_i$ & $a_${robot.convention === 'modified' ? '{i-1}' : 'i'}$ & $\\alpha_${robot.convention === 'modified' ? '{i-1}' : 'i'}$ \\\\ \\hline`,
    ...body.map((l) => l.replace(/^(.*?) & (.*) \\\\$/, (m, a, b) => `${a} & $${b.split(' & ').join('$ & $')}$ \\\\`)),
    '\\end{tabular}',
  ].join('\n') + '\n';
}

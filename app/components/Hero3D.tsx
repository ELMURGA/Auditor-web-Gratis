"use client";
// Escena 3D de la portada del auditor: una ventana de navegador con capas a distintas profundidades,
// un escáner que la recorre marcando puntos (verde bien, ámbar aviso, rojo error) y tres anillos
// de nota (SEO, Velocidad, Seguridad) que orbitan. Reacciona al cursor.
// Como el hero de dazenty.com: se pinta tras cargar la página, respeta movimiento reducido y
// ahorro de datos, se pausa fuera de pantalla y, sin WebGL, queda el dibujo plano de debajo.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SALMON = 0xd97762;
const OK = 0x3fc07a, WARN = 0xf2b33d, BAD = 0xef6b7f;
const CHIPS = [
  { label: "SEO", value: 94, color: "#3fc07a", hex: OK },
  { label: "Velocidad", value: 86, color: "#3fc07a", hex: OK },
  { label: "Seguridad", value: 78, color: "#f2b33d", hex: WARN },
];
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export default function Hero3D() {
  const host = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as any).connection?.saveData;
    if (saveData) return;
    const lowPower = ((navigator as any).deviceMemory && (navigator as any).deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    const touch = matchMedia("(pointer: coarse)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: "high-performance" });
    } catch { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower || touch ? 1.5 : 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "h3d-canvas";
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.1, 7.2);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 4, 5); scene.add(key);
    const warm = new THREE.PointLight(SALMON, 28, 14); warm.position.set(3.2, -1, 3); scene.add(warm);

    const rig = new THREE.Group(); scene.add(rig);

    const edge = (geo: THREE.BufferGeometry, color: number, opacity = 1) => {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
      return l;
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, line?: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
      m.position.set(x, y, z);
      if (line !== undefined) m.add(edge(g, line));
      rig.add(m);
      return m;
    };

    // ----- La ventana del navegador -----
    const W = 3.4, H = 2.3;
    box(W, H, 0.14, 0, 0, 0, 0x131313, SALMON);
    box(W - 0.1, 0.2, 0.06, 0, H / 2 - 0.2, 0.1, 0x262626);                     // barra
    [-1, 0, 1].forEach((i) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), new THREE.MeshStandardMaterial({ color: i === -1 ? BAD : i === 0 ? WARN : OK })); d.rotation.x = Math.PI / 2; d.position.set(-W / 2 + 0.2 + (i + 1) * 0.11, H / 2 - 0.2, 0.15); rig.add(d); });
    box(1.55, 0.2, 0.05, 0.28, H / 2 - 0.2, 0.15, 0x333333);                    // barra de direcciones
    box(1.9, 0.42, 0.12, -0.58, 0.46, 0.26, 0x2c2c2c, 0x555555);                 // titular
    box(1.5, 0.08, 0.06, -0.78, 0.1, 0.2, 0x3a3a3a);                              // texto
    box(1.15, 0.08, 0.06, -0.96, -0.04, 0.2, 0x3a3a3a);
    box(0.62, 0.17, 0.14, -1.17, -0.26, 0.42, SALMON);                            // botón
    box(1.0, 0.95, 0.1, 1.05, 0.28, 0.3, 0x1d1d1d, 0x5a5a5a);                    // imagen
    [-1.12, -0.04, 1.04].forEach((x, i) => box(0.98, 0.62, 0.1, x, -0.68, 0.18 + i * 0.07, 0x1d1d1d, 0x444444)); // tarjetas

    // ----- Escáner y marcas -----
    const scanY0 = H / 2 - 0.05, scanY1 = -H / 2 + 0.05;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.035, 0.3), new THREE.MeshBasicMaterial({ color: SALMON }));
    bar.position.z = 0.35; rig.add(bar);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.1, 0.5), new THREE.MeshBasicMaterial({ color: SALMON, transparent: true, opacity: 0.1, depthWrite: false }));
    band.position.z = 0.36; rig.add(band);

    const marks: { m: THREE.Mesh; y: number }[] = [];
    const markPts: [number, number, number, number][] = [
      [-1.55, 0.95, 0.2, OK], [-0.1, 0.9, 0.22, OK], [1.5, 0.82, 0.22, OK], [-1.3, 0.48, 0.34, OK], [0.52, 0.76, 0.4, WARN],
      [1.55, 0.3, 0.42, OK], [-1.55, -0.3, 0.52, OK], [-0.16, -0.26, 0.2, BAD], [1.55, -0.52, 0.3, OK], [-0.95, -0.82, 0.32, OK], [0.2, -0.98, 0.34, WARN], [1.2, -0.98, 0.36, OK],
    ];
    markPts.forEach(([x, y, z, c]) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.35 }));
      m.position.set(x, y, z); m.scale.setScalar(0.0001); rig.add(m); marks.push({ m, y });
    });

    // ----- Anillos de nota que orbitan -----
    const orbit: { g: THREE.Group; ring: THREE.Mesh; a: number }[] = [];
    CHIPS.forEach((c, i) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 12, 64), new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6 })));
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 12, 64, (c.value / 100) * Math.PI * 2), new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.3, emissive: c.hex, emissiveIntensity: 0.3 }));
      arc.rotation.z = Math.PI / 2; g.add(arc);
      rig.add(g); orbit.push({ g, ring: arc, a: (i / 3) * Math.PI * 2 });
    });

    // ----- Partículas de fondo (como el hero de dazenty.com) -----
    const N = lowPower || touch ? 220 : 520;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 4.2 + Math.random() * 4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph) * 0.75; pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 1;
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9a9a9a, size: 0.035, transparent: true, opacity: 0.65, sizeAttenuation: true }));
    scene.add(points);

    // ----- Tamaño y cursor -----
    let w = 1, h = 1;
    const resize = () => {
      const r = el.getBoundingClientRect(); w = Math.max(r.width, 1); h = Math.max(r.height, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 0.9 ? 10.4 : 7.2; // en vertical se aleja para que quepa todo
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; };
    addEventListener("pointermove", onMove, { passive: true });

    // ----- Animación -----
    const v = new THREE.Vector3();
    let shown = false;
    let raf = 0, visible = true, last = performance.now(), t = reduced ? 3.2 : 0;
    const PERIOD = 6.5;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!reduced) t += dt;

      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
      rig.rotation.y = Math.sin(t * 0.45) * 0.28 + mouse.x * 0.42;
      rig.rotation.x = Math.sin(t * 0.35) * 0.05 - 0.06 + mouse.y * 0.2;
      rig.position.y = Math.sin(t * 0.8) * 0.06;
      points.rotation.y = t * 0.025;

      const p = (t % PERIOD) / PERIOD;
      const sp = reduced ? 1 : Math.min(p / 0.78, 1);
      const sy = scanY0 + (scanY1 - scanY0) * ease(sp);
      bar.position.y = sy; band.position.y = sy + 0.22;
      (bar.material as THREE.MeshBasicMaterial).opacity = 1;
      bar.visible = band.visible = !reduced && sp < 1;
      marks.forEach((k) => {
        const target = reduced || sy <= k.y + 0.06 ? 1 : 0;
        const s = k.m.scale.x + (target - k.m.scale.x) * (target ? 0.22 : 0.4);
        k.m.scale.setScalar(Math.max(s, 0.0001));
        k.m.rotation.y += 0.02;
      });

      orbit.forEach((o, i) => {
        const a = o.a + t * 0.32;
        o.g.position.set(Math.cos(a) * 2.3, Math.sin(a + i) * 0.34 + (i - 1) * 0.3, Math.sin(a) * 1.9 + 0.3);
        o.g.quaternion.copy(camera.quaternion); // el anillo mira siempre a cámara
        o.g.rotateZ(-Math.PI / 2);
      });

      renderer.render(scene, camera);
      if (!shown) { shown = true; setLive(true); } // el dibujo plano se retira solo cuando el 3D ya está pintado

      // Las notas (HTML, texto nítido y accesible) siguen a los anillos
      orbit.forEach((o, i) => {
        const chip = chipRefs.current[i]; if (!chip) return;
        o.g.getWorldPosition(v);
        const dist = camera.position.distanceTo(v);
        const s = (camera.position.z) / dist;
        v.project(camera);
        const depth = THREE.MathUtils.clamp(1.15 - (dist - camera.position.z + 1.8) / 4.2, 0.45, 1);
        chip.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        chip.style.opacity = String(depth);
        chip.style.zIndex = String(Math.round(depth * 10));
      });
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 });
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); removeEventListener("pointermove", onMove);
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={`h3d${live ? " is-live" : ""}`} ref={host} role="img" aria-label="Ilustración: una web con un escáner que revisa SEO, velocidad y seguridad">
      <Poster />
      {CHIPS.map((c, i) => (
        <div key={c.label} className="h3d-chip" aria-hidden="true" ref={(n) => { chipRefs.current[i] = n; }}>
          <b style={{ color: c.color }}>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
      <p className="h3d-cap" aria-hidden="true">Ejemplo ilustrativo</p>
    </div>
  );
}

// Dibujo plano que se ve mientras carga el 3D o si el equipo no tiene WebGL
function Poster() {
  return (
    <svg className="h3d-poster" viewBox="0 0 400 340" aria-hidden="true">
      <rect x="40" y="50" width="320" height="220" rx="14" fill="#131313" stroke="#d97762" strokeWidth="2" />
      <rect x="52" y="62" width="296" height="22" rx="6" fill="#262626" />
      <circle cx="68" cy="73" r="4" fill="#ef6b7f" /><circle cx="82" cy="73" r="4" fill="#f2b33d" /><circle cx="96" cy="73" r="4" fill="#3fc07a" />
      <rect x="62" y="104" width="170" height="40" rx="6" fill="#2c2c2c" />
      <rect x="62" y="156" width="140" height="8" rx="4" fill="#3a3a3a" /><rect x="62" y="172" width="108" height="8" rx="4" fill="#3a3a3a" />
      <rect x="62" y="192" width="64" height="18" rx="9" fill="#d97762" />
      <rect x="252" y="104" width="96" height="106" rx="8" fill="#1d1d1d" stroke="#444" />
      {[62, 160, 258].map((x) => <rect key={x} x={x} y="224" width="90" height="34" rx="6" fill="#1d1d1d" stroke="#444" />)}
      <rect x="30" y="150" width="340" height="3" fill="#d97762" />
    </svg>
  );
}

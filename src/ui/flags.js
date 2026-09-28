// Las banderas del selector de idioma, dibujadas aquí (las banderas en emoji no salen en Windows y
// la catalana no existe). El árabe no es de un solo país, así que en vez de bandera lleva su letra.
const W = 30;
const H = 20;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

function estrella(cx, cy, r, giro = -90) {
  const puntos = [];
  for (let i = 0; i < 10; i++) {
    const a = ((giro + i * 36) * Math.PI) / 180;
    const radio = i % 2 ? r * 0.4 : r;
    puntos.push(`${(cx + Math.cos(a) * radio).toFixed(2)},${(cy + Math.sin(a) * radio).toFixed(2)}`);
  }
  return `<polygon points="${puntos.join(' ')}" fill="#ffde00"/>`;
}

const DIBUJO = {
  es: () => rect(0, 0, W, 5, '#c60b1e') + rect(0, 5, W, 10, '#ffc400') + rect(0, 15, W, 5, '#c60b1e'),
  ca: () => rect(0, 0, W, H, '#fcdd09') + [1, 2, 3, 4].map((i) => rect(0, (H / 9) * (2 * i - 1), W, H / 9, '#da121a')).join(''),
  en: () => `${rect(0, 0, W, H, '#012169')}
    <path d="M0,0 L${W},${H} M${W},0 L0,${H}" stroke="#fff" stroke-width="4"/>
    <path d="M0,0 L${W},${H} M${W},0 L0,${H}" stroke="#c8102e" stroke-width="1.6"/>
    <path d="M${W / 2},0 V${H} M0,${H / 2} H${W}" stroke="#fff" stroke-width="6"/>
    <path d="M${W / 2},0 V${H} M0,${H / 2} H${W}" stroke="#c8102e" stroke-width="3.4"/>`,
  fr: () => rect(0, 0, 10, H, '#0055a4') + rect(10, 0, 10, H, '#fff') + rect(20, 0, 10, H, '#ef4135'),
  it: () => rect(0, 0, 10, H, '#009246') + rect(10, 0, 10, H, '#fff') + rect(20, 0, 10, H, '#ce2b37'),
  zh: () => rect(0, 0, W, H, '#de2910') + estrella(5.5, 5.5, 3.3) + estrella(10.5, 2.2, 1.1, -54) + estrella(12.5, 4.4, 1.1, -72)
    + estrella(12.5, 7.4, 1.1, -90) + estrella(10.5, 9.4, 1.1, -108),
  ar: () => `${rect(0, 0, W, H, '#0b7a3b')}<text x="${W / 2}" y="${H / 2 + 5.2}" font-size="15" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">ع</text>`,
};

export function flagSvg(id) {
  const dibujo = DIBUJO[id]?.() ?? rect(0, 0, W, H, '#888');
  return `<svg viewBox="0 0 ${W} ${H}" class="bandera" aria-hidden="true"><clipPath id="b-${id}"><rect width="${W}" height="${H}" rx="3"/></clipPath><g clip-path="url(#b-${id})">${dibujo}</g></svg>`;
}

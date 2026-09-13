// Busca el hueso de cada mano por su nombre (Tripo, Mixamo, Blender, 3ds Max…).
// Se comparan los nombres sin separadores ni mayúsculas y anclados al final, para no
// confundir la mano con sus dedos («RightHandThumb1»).

const SIDE_PATTERNS = {
  right: [/righthand$/, /handr(ight)?$/, /rhand$/],
  left: [/lefthand$/, /handl(eft)?$/, /lhand$/],
};

const normalize = (name) => name.replace(/[\s_.:|-]/g, '').toLowerCase();

export function pickHandBone(boneNames, side) {
  const patterns = SIDE_PATTERNS[side];
  if (!patterns) throw new Error(`Lado no válido: ${side}`);
  for (const pattern of patterns) {
    const found = boneNames.find((n) => pattern.test(normalize(n)));
    if (found) return found;
  }
  return null;
}

import avatarStrategistImg from '../assets/images/avatar_emerald_strategist_1795072486097.jpg';
import avatarTacticianImg from '../assets/images/avatar_cobalt_tactician_1795072485492.jpg';
import avatarChampionImg from '../assets/images/avatar_amber_champion_1795072485744.jpg';
import avatarArchitectImg from '../assets/images/avatar_slate_architect_1795072486073.jpg';
import avatarCyberFoxImg from '../assets/images/avatar_cyber_fox_1795185280186.jpg';
import avatarGoldenCrownImg from '../assets/images/avatar_golden_crown_1795185279514.jpg';
import avatarNeonOwlImg from '../assets/images/avatar_neon_owl_1795185279393.jpg';
import avatarCrimsonPhoenixImg from '../assets/images/avatar_crimson_phoenix_1795185278936.jpg';

export interface AvatarPreset {
  id: string;
  label: string;
  previewSrc: string;
  persistedPath: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'strategist',
    label: 'Estrategista',
    previewSrc: avatarStrategistImg,
    persistedPath: './src/assets/images/avatar_emerald_strategist_1795072486097.jpg',
  },
  {
    id: 'tactician',
    label: 'Tático',
    previewSrc: avatarTacticianImg,
    persistedPath: './src/assets/images/avatar_cobalt_tactician_1795072485492.jpg',
  },
  {
    id: 'champion',
    label: 'Campeão',
    previewSrc: avatarChampionImg,
    persistedPath: './src/assets/images/avatar_amber_champion_1795072485744.jpg',
  },
  {
    id: 'architect',
    label: 'Arquiteto',
    previewSrc: avatarArchitectImg,
    persistedPath: './src/assets/images/avatar_slate_architect_1795072486073.jpg',
  },
  {
    id: 'cyber_fox',
    label: 'Ciber Raposa',
    previewSrc: avatarCyberFoxImg,
    persistedPath: './src/assets/images/avatar_cyber_fox_1795185280186.jpg',
  },
  {
    id: 'golden_crown',
    label: 'Rei Dourado',
    previewSrc: avatarGoldenCrownImg,
    persistedPath: './src/assets/images/avatar_golden_crown_1795185279514.jpg',
  },
  {
    id: 'neon_owl',
    label: 'Coruja Tática',
    previewSrc: avatarNeonOwlImg,
    persistedPath: './src/assets/images/avatar_neon_owl_1795185279393.jpg',
  },
  {
    id: 'crimson_phoenix',
    label: 'Fênix Rubi',
    previewSrc: avatarCrimsonPhoenixImg,
    persistedPath: './src/assets/images/avatar_crimson_phoenix_1795185278936.jpg',
  },
];

export function resolveAvatarSrc(photoURL?: string | null): string {
  const raw = (photoURL || '').trim();
  if (!raw) return '';
  const preset = AVATAR_PRESETS.find((item) => item.persistedPath === raw);
  return preset ? preset.previewSrc : raw;
}

export function isGalleryDataUrl(photoURL?: string | null): boolean {
  return Boolean(
    photoURL && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photoURL.trim())
  );
}

const MAX_DATA_URL_LENGTH = 54000;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível abrir essa imagem. Tente outro arquivo PNG, JPG ou WebP.'));
    };
    img.src = objectUrl;
  });
}

export async function processGalleryAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('A imagem escolhida é muito pesada (máximo 15 MB).');
  }

  const img = await loadImageFromFile(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  if (!srcWidth || !srcHeight) {
    throw new Error('Dimensões inválidas na imagem selecionada.');
  }

  const side = Math.min(srcWidth, srcHeight);
  const sx = Math.floor((srcWidth - side) / 2);
  const sy = Math.floor((srcHeight - side) / 2);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Seu navegador não suportou o processamento de imagem.');
  }

  const sizes = [160, 128, 96];
  const formats: Array<{ mime: string; qualities: number[] }> = [
    { mime: 'image/webp', qualities: [0.84, 0.72, 0.58] },
    { mime: 'image/jpeg', qualities: [0.82, 0.68, 0.54] },
  ];

  for (const targetSize of sizes) {
    canvas.width = targetSize;
    canvas.height = targetSize;
    ctx.clearRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    for (const fmt of formats) {
      for (const q of fmt.qualities) {
        const dataUrl = canvas.toDataURL(fmt.mime, q);
        if (
          dataUrl.length <= MAX_DATA_URL_LENGTH &&
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)
        ) {
          return dataUrl;
        }
      }
    }
  }

  throw new Error('Não foi possível compactar a foto para o limite do perfil. Tente outra imagem.');
}

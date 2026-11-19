import avatarStrategistImg from '../assets/images/avatar_emerald_strategist_1795072486097.jpg';
import avatarTacticianImg from '../assets/images/avatar_cobalt_tactician_1795072485492.jpg';
import avatarChampionImg from '../assets/images/avatar_amber_champion_1795072485744.jpg';
import avatarArchitectImg from '../assets/images/avatar_slate_architect_1795072486073.jpg';

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
];

export function resolveAvatarSrc(photoURL?: string | null): string {
  const raw = (photoURL || '').trim();
  if (!raw) return '';
  const preset = AVATAR_PRESETS.find((item) => item.persistedPath === raw);
  return preset ? preset.previewSrc : raw;
}

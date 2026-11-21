const MAX_SELFIE_DATA_URL_LENGTH = 85000;
const SELFIE_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function isValidSelfieDataUrl(url: string): boolean {
  return (
    typeof url === 'string' &&
    url.length > 64 &&
    url.length <= MAX_SELFIE_DATA_URL_LENGTH &&
    SELFIE_DATA_URL_RE.test(url)
  );
}

function encodeCanvasWithinBudget(canvas: HTMLCanvasElement): string {
  let out = '';
  for (const quality of [0.82, 0.72, 0.62, 0.5, 0.4, 0.3]) {
    const attempt = canvas.toDataURL('image/jpeg', quality);
    if (attempt.length <= MAX_SELFIE_DATA_URL_LENGTH && SELFIE_DATA_URL_RE.test(attempt)) {
      out = attempt;
      break;
    }
  }
  if (!out) {
    // Shrink canvas dimensions if still above budget
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 240;
    fallbackCanvas.height = 240;
    const fCtx = fallbackCanvas.getContext('2d');
    if (fCtx) {
      fCtx.drawImage(canvas, 0, 0, 240, 240);
      out = fallbackCanvas.toDataURL('image/jpeg', 0.45);
    }
  }
  if (!isValidSelfieDataUrl(out)) {
    throw new Error('Não foi possível compactar a selfie para envio. Tente novamente.');
  }
  return out;
}

export function captureVideoFrameAsDataUrl(video: HTMLVideoElement): string {
  const vw = video.videoWidth || 480;
  const vh = video.videoHeight || 480;
  if (vw < 40 || vh < 40) {
    throw new Error('A câmera ainda está inicializando. Aguarde um instante e tente novamente.');
  }

  const maxSide = 400;
  const side = Math.min(vw, vh);
  const sx = Math.max(0, (vw - side) / 2);
  const sy = Math.max(0, (vh - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = maxSide;
  canvas.height = maxSide;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Navegador sem suporte a captura de imagem.');
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, maxSide, maxSide);
  return encodeCanvasWithinBudget(canvas);
}

export async function compressSelfieFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione uma foto válida (JPG, PNG ou WebP).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('A foto escolhida é muito grande (máximo 12 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      el.src = objectUrl;
    });

    const targetSize = 400;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Erro ao preparar imagem.');
    }

    const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - minSide) / 2;
    const sy = ((img.naturalHeight || img.height) - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
    return encodeCanvasWithinBudget(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

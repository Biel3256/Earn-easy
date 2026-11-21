import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Gift,
  ImagePlus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FACE_VERIFICATION_BONUS_POINTS } from '../types/earneasy';
import { formatBirthDateBr } from '../utils/age';
import { captureVideoFrameAsDataUrl, compressSelfieFromFile } from '../utils/camera';
import { extractReadableError, formatPoints } from '../utils/pix';

interface FaceVerificationModalProps {
  open: boolean;
  onClose: () => void;
}

export const FaceVerificationModal: React.FC<FaceVerificationModalProps> = ({
  open,
  onClose,
}) => {
  const { userAccount, submitFaceVerification } = useAuth();
  const { showToast } = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop failures
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startFrontCamera = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraError('Câmera ao vivo indisponível neste navegador. Envie sua selfie pela galeria abaixo.');
      return;
    }

    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState('ready');
    } catch {
      setCameraState('error');
      setCameraError(
        'Não foi possível acessar a câmera frontal (permissão negada ou dispositivo sem câmera). Você pode enviar uma selfie da galeria.'
      );
    }
  }, [stopCameraStream]);

  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  onCloseRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    if (!open) {
      stopCameraStream();
      setSelfieDataUrl(null);
      setSubmitError(null);
      setCameraError(null);
      setCameraState('idle');
      return;
    }

    void startFrontCamera();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingRef.current) {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopCameraStream();
    };
  }, [open, startFrontCamera, stopCameraStream]);

  if (!open || !userAccount) return null;

  const handleCapturePhoto = () => {
    setSubmitError(null);
    if (!videoRef.current) {
      setSubmitError('Câmera não pronta para captura.');
      return;
    }
    try {
      const dataUrl = captureVideoFrameAsDataUrl(videoRef.current);
      setSelfieDataUrl(dataUrl);
      stopCameraStream();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao capturar foto da câmera.');
    }
  };

  const handlePickGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSubmitError(null);
    setProcessingFile(true);
    try {
      const dataUrl = await compressSelfieFromFile(file);
      stopCameraStream();
      setSelfieDataUrl(dataUrl);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível carregar a foto.');
    } finally {
      setProcessingFile(false);
    }
  };

  const handleRetake = () => {
    setSelfieDataUrl(null);
    setSubmitError(null);
    void startFrontCamera();
  };

  const handleSubmitVerification = async () => {
    if (!selfieDataUrl || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitFaceVerification(selfieDataUrl);
      showToast({
        type: 'success',
        title: 'Selfie enviada para análise!',
        message: `Assim que o administrador aprovar, você receberá o selo Verificado e +${formatPoints(FACE_VERIFICATION_BONUS_POINTS)} pontos.`,
      });
      onClose();
    } catch (err) {
      const msg = extractReadableError(err, 'Não foi possível enviar a verificação facial.');
      setSubmitError(msg);
      showToast({ type: 'error', title: 'Erro no envio', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="face-verify-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-white dark:bg-[#0e1319] border-t sm:border border-slate-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="face-verify-title" className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                Verificação Facial do Perfil
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Envie sua selfie para análise do perfil e da idade
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Fechar verificação facial"
            className="min-w-[38px] min-h-[38px] rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Reward Banner */}
          <div className="rounded-2xl border border-lime-400/40 bg-lime-400/10 p-3.5 flex items-center gap-3">
            <Gift className="w-5 h-5 text-emerald-700 dark:text-lime-400 shrink-0" />
            <div className="text-xs text-slate-800 dark:text-zinc-200 leading-relaxed">
              <strong className="text-emerald-800 dark:text-lime-300">
                Recompensa imediata de +{formatPoints(FACE_VERIFICATION_BONUS_POINTS)} pontos:
              </strong>{' '}
              ao ser aprovado no Painel Admin, você ganha o selo de Perfil Verificado e os pontos na hora.
            </div>
          </div>

          <div className="text-xs text-slate-600 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2 px-1">
            <span>
              Conta: <strong className="text-slate-900 dark:text-zinc-100">{userAccount.displayName}</strong>
            </span>
            <span>
              {userAccount.birthDate ? (
                <>Nascimento informado: <strong className="font-mono text-slate-900 dark:text-zinc-100">{formatBirthDateBr(userAccount.birthDate)}</strong></>
              ) : (
                <>Idade: <strong className="text-slate-900 dark:text-zinc-100">aguardando análise</strong></>
              )}
            </span>
          </div>

          {/* Camera / Preview Viewport */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-950 overflow-hidden aspect-square max-h-[300px] mx-auto w-full max-w-[300px] relative flex items-center justify-center">
            {selfieDataUrl ? (
              <img
                src={selfieDataUrl}
                alt="Prévia da selfie facial"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover scale-x-[-1] ${
                    cameraState === 'ready' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {cameraState === 'ready' && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-lime-400/70"
                  />
                )}
                {cameraState === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 text-xs gap-2 p-4 text-center">
                    <Camera className="w-7 h-7 text-lime-400 animate-pulse" />
                    <span>Iniciando câmera frontal...</span>
                  </div>
                )}
                {cameraState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 text-xs gap-2 p-5 text-center">
                    <Camera className="w-7 h-7 text-amber-400" />
                    <span className="leading-relaxed">{cameraError}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickGalleryFile}
            className="hidden"
          />

          {!selfieDataUrl ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={cameraState !== 'ready' || processingFile}
                onClick={handleCapturePhoto}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-xs font-black cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Tirar Selfie Agora
              </button>
              <button
                type="button"
                disabled={processingFile}
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] text-slate-800 dark:text-zinc-100 text-xs font-bold hover:border-lime-400 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                {processingFile ? 'Processando...' : 'Escolher Foto / Galeria'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={handleRetake}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Tirar Outra Foto
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitVerification}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-black cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Enviando para análise...' : 'Enviar para Análise do ADM'}
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center leading-relaxed">
            Tire uma foto nítida do seu rosto em local iluminado, sem óculos escuros ou boné. A equipe analisará a selfie; a aparência sozinha não comprova legalmente a idade, então confirme 18+ por documento oficial antes de aprovar.
          </p>

          {submitError && (
            <div className="p-3 rounded-xl border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

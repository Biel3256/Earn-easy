import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  Gamepad2,
  Gift,
  ImagePlus,
  Link2,
  Lock,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  AVATAR_PRESETS,
  isGalleryDataUrl,
  processGalleryAvatarFile,
  resolveAvatarSrc,
} from '../utils/avatars';
import { calculateGamesXp, calculatePlayerLevel, PLAYER_LEVELS } from '../utils/levels';
import { formatBRL, formatPoints } from '../utils/pix';

export const ProfileAvatar: React.FC<{
  name: string;
  photoURL: string;
  sizeClass?: string;
  textSizeClass?: string;
}> = ({ name, photoURL, sizeClass = 'w-16 h-16', textSizeClass = 'text-lg' }) => {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveAvatarSrc(photoURL);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'J';

  if (!resolvedSrc || failed) {
    return (
      <div
        aria-hidden="true"
        className={`${sizeClass} rounded-full bg-slate-900 dark:bg-zinc-800 text-white flex items-center justify-center font-display font-bold ${textSizeClass} shrink-0 border border-slate-200 dark:border-zinc-700`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={`Avatar de ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover shrink-0 border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800`}
    />
  );
};

export const PlayerProfile: React.FC = () => {
  const { showToast } = useToast();
  const {
    firebaseUser,
    userAccount,
    privateInfo,
    mySessions,
    myLevelRewards,
    signInWithGoogle,
    updateUserProfile,
    claimLevelReward,
  } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [processingGallery, setProcessingGallery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [claimingLevel, setClaimingLevel] = useState<number | null>(null);
  const [rewardFeedback, setRewardFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (userAccount) {
      setDisplayName(userAccount.displayName);
      setSelectedPhoto(userAccount.photoURL);
      const isPreset = AVATAR_PRESETS.some((p) => p.persistedPath === userAccount.photoURL);
      const isGoogle = firebaseUser?.photoURL === userAccount.photoURL;
      const isGallery = isGalleryDataUrl(userAccount.photoURL);
      setCustomUrl(!isPreset && !isGoogle && !isGallery ? userAccount.photoURL : '');
    }
  }, [userAccount, firebaseUser]);

  if (!firebaseUser || !userAccount) {
    return (
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Meu Perfil, Avatar & ID</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Faça login com sua conta Google para copiar seu ID de jogador, escolher um avatar ou foto da galeria e acompanhar seu nível.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-2xl hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const levelInfo = calculatePlayerLevel(userAccount.lifetimePoints, userAccount.gamesPlayed);
  const gamesXp = calculateGamesXp(mySessions);
  const claimedLevelsSet = new Set(myLevelRewards.map((r) => r.level));
  const claimableTiers = PLAYER_LEVELS.filter(
    (t) => t.rewardPoints > 0 && levelInfo.xp >= t.minXp && !claimedLevelsSet.has(t.level)
  );
  const totalRewardableLevels = PLAYER_LEVELS.filter((t) => t.rewardPoints > 0).length;

  const inviteOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://earneasy.app';
  const inviteLink = `${inviteOrigin}/?ref=${userAccount.uid}`;

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(userAccount.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleGalleryPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setProcessingGallery(true);
    try {
      const compressedDataUrl = await processGalleryAvatarFile(file);
      setCustomUrl('');
      setSelectedPhoto(compressedDataUrl);
      setFeedback({
        type: 'ok',
        msg: 'Foto da galeria carregada na prévia! Clique em "Salvar Perfil e Avatar" para aplicar.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Não foi possível carregar a foto da galeria.',
      });
    } finally {
      setProcessingGallery(false);
    }
  };

  const handleClaimLevel = async (level: number) => {
    setRewardFeedback(null);
    setClaimingLevel(level);
    try {
      const res = await claimLevelReward(level);
      const msg = `Recompensa do Nível ${res.level} (${res.title}) resgatada: +${formatPoints(res.rewardPoints)} pontos adicionados ao seu saldo!`;
      setRewardFeedback({ type: 'ok', msg });
      showToast({ type: 'success', title: `Nível ${res.level} resgatado!`, message: msg });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível resgatar a recompensa deste nível.';
      setRewardFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'Erro no resgate de nível', message: msg });
    } finally {
      setClaimingLevel(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      const msg = 'O nome de exibição deve ter entre 2 e 80 caracteres.';
      setFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'Nome inválido', message: msg });
      return;
    }

    const finalPhoto = (customUrl.trim() || selectedPhoto).trim();
    const isGallery = isGalleryDataUrl(finalPhoto);

    if (!isGallery && finalPhoto.length > 500) {
      const msg = 'A URL do avatar deve ter no máximo 500 caracteres.';
      setFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'URL muito longa', message: msg });
      return;
    }
    if (isGallery && finalPhoto.length > 60000) {
      const msg = 'A imagem escolhida da galeria ficou muito grande. Tente outra foto.';
      setFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'Foto muito pesada', message: msg });
      return;
    }
    if (
      finalPhoto &&
      !isGallery &&
      !finalPhoto.startsWith('https://') &&
      !finalPhoto.startsWith('http://') &&
      !finalPhoto.startsWith('./') &&
      !finalPhoto.startsWith('/')
    ) {
      const msg = 'Escolha um avatar, envie uma foto da galeria ou use uma URL iniciada por https://.';
      setFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'Avatar inválido', message: msg });
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile({ displayName: trimmedName, photoURL: finalPhoto });
      const msg = 'Perfil e foto atualizados e sincronizados em tempo real com o Ranking Global!';
      setFeedback({ type: 'ok', msg });
      showToast({ type: 'success', title: 'Perfil atualizado!', message: msg });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar perfil.';
      setFeedback({ type: 'err', msg });
      showToast({ type: 'error', title: 'Erro ao salvar perfil', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const activePreviewPhoto = customUrl.trim() || selectedPhoto;
  const usingGalleryImage = !customUrl.trim() && isGalleryDataUrl(selectedPhoto);

  return (
    <div className="space-y-6">
      {/* Dedicated Player ID Card (Aba para Ver ID) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/70 border border-slate-800 dark:border-zinc-800 text-white p-6 shadow-lg shadow-slate-900/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Fingerprint className="w-4 h-4" />
              Seu ID Exclusivo no Earn Easy
            </div>
            <div className="font-mono text-sm sm:text-base font-bold text-white bg-white/10 border border-white/15 rounded-2xl px-4 py-3 break-all select-all">
              {userAccount.uid}
            </div>
            <p className="text-xs text-slate-300">
              Passe esse ID para outros jogadores encontrarem você na aba Amigos ou na busca do Ranking. Ele também funciona como seu código de convite (+500 moedas).
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyUid}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-2xl transition-colors whitespace-nowrap cursor-pointer active:scale-[0.98]"
            >
              {copiedUid ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedUid ? 'ID Copiado!' : 'Copiar Meu ID'}
            </button>
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold rounded-2xl transition-colors whitespace-nowrap cursor-pointer active:scale-[0.98]"
            >
              {copiedInvite ? <Check className="w-4 h-4 text-emerald-300" /> : <Link2 className="w-4 h-4 text-emerald-300" />}
              {copiedInvite ? 'Link Copiado!' : 'Copiar Link'}
            </button>
          </div>
        </div>
      </section>

      {/* Profile & Level Header Card */}
      <section className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <ProfileAvatar
              name={displayName || userAccount.displayName}
              photoURL={activePreviewPhoto}
              sizeClass="w-20 h-20"
            />
            <div className="space-y-1 min-w-0">
              <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-50 truncate">
                {userAccount.displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <span>Nível {levelInfo.level} · {levelInfo.title}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{formatPoints(levelInfo.xp)} XP</span>
                {privateInfo?.email && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{privateInfo.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-6 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100 dark:border-zinc-800 shrink-0">
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Partidas</div>
              <div className="text-lg font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                {userAccount.gamesPlayed}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos Totais</div>
              <div className="text-lg font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                {formatPoints(userAccount.lifetimePoints)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Saldo Atual</div>
              <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatBRL(userAccount.brlBalanceCents)}
              </div>
            </div>
          </div>
        </div>

        {/* XP Progress Bar & Games Experience Breakdown */}
        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Nível {levelInfo.level}: {levelInfo.title}
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-zinc-400">
                {levelInfo.isMaxLevel
                  ? `Nível máximo atingido (${formatPoints(levelInfo.xp)} XP)`
                  : `Faltam ${formatPoints(levelInfo.xpRemaining)} XP para Nível ${levelInfo.level + 1} (${levelInfo.nextTitle})`}
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuenow={levelInfo.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso para o próximo nível: ${levelInfo.progressPct}%`}
              className="w-full h-3 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                style={{ width: `${levelInfo.progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-zinc-400">
              <span>{formatPoints(levelInfo.currentFloorXp)} XP</span>
              <span className="font-semibold text-slate-700 dark:text-zinc-300">
                {formatPoints(levelInfo.xp)} XP ({levelInfo.progressPct}%)
              </span>
              <span>{levelInfo.nextLevelXp !== null ? `${formatPoints(levelInfo.nextLevelXp)} XP` : 'Máximo'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Experiência ganha nos jogos
              </div>
              <div className="text-sm font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatPoints(gamesXp.totalGameXp)} XP
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                {gamesXp.verifiedGames} partidas ({formatPoints(gamesXp.verifiedScorePoints)} pts + {formatPoints(gamesXp.matchBonusXp)} XP bônus)
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Experiência Total da Conta</div>
              <div className="text-sm font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatPoints(levelInfo.xp)} XP
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                Jogos + check-ins acumulados
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Recompensas por Nível
              </div>
              <div className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                {claimedLevelsSet.size} / {totalRewardableLevels} resgatadas
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {claimableTiers.length > 0
                  ? `${claimableTiers.length} recompensa(s) pronta(s)!`
                  : 'Suba de nível jogando'}
              </div>
            </div>
          </div>

          {claimableTiers.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-emerald-900 dark:text-emerald-200">
                <span className="font-bold">Recompensa de nível disponível!</span> Você desbloqueou{' '}
                {claimableTiers.map((t) => `Nível ${t.level} (+${formatPoints(t.rewardPoints)} pts)`).join(', ')}.
              </div>
              <button
                type="button"
                disabled={claimingLevel !== null}
                onClick={() => handleClaimLevel(claimableTiers[0].level)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer shrink-0"
              >
                <Gift className="w-3.5 h-3.5" />
                {claimingLevel === claimableTiers[0].level
                  ? 'Resgatando...'
                  : `Resgatar Nível ${claimableTiers[0].level} (+${formatPoints(claimableTiers[0].rewardPoints)} pts)`}
              </button>
            </div>
          )}

          {rewardFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                rewardFeedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}
            >
              {rewardFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{rewardFeedback.msg}</span>
            </div>
          )}
        </div>
      </section>

      {/* Edit Avatar, Gallery Upload & Display Name + Level Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">Personalizar Foto e Avatar</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Escolha entre 8 avatares exclusivos ou envie uma foto direto da sua galeria
              </p>
            </div>
            <UserCheck className="w-5 h-5 text-slate-400 dark:text-zinc-500 shrink-0" />
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Gallery Photo Upload Bar */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <ProfileAvatar
                  name={displayName || userAccount.displayName}
                  photoURL={activePreviewPhoto}
                  sizeClass="w-14 h-14"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                    {usingGalleryImage ? 'Foto da Galeria Selecionada' : 'Foto de Perfil Personalizada'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Envie JPG, PNG ou WebP do seu celular ou PC (ajuste automático).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryPick}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={processingGallery}
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4" />
                  {processingGallery ? 'Ajustando foto...' : 'Escolher da Galeria'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2.5">
                Avatares Exclusivos ({AVATAR_PRESETS.length})
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {AVATAR_PRESETS.map((preset) => {
                  const isActive = !customUrl.trim() && selectedPhoto === preset.persistedPath;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setCustomUrl('');
                        setSelectedPhoto(preset.persistedPath);
                      }}
                      className={`p-3 rounded-2xl border text-center space-y-2 transition-all cursor-pointer active:scale-[0.98] ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                      }`}
                    >
                      <img
                        src={preset.previewSrc}
                        alt={`Avatar ${preset.label}`}
                        className="w-16 h-16 rounded-full object-cover mx-auto border border-slate-200 dark:border-zinc-700"
                      />
                      <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              {firebaseUser.photoURL && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomUrl('');
                    setSelectedPhoto(firebaseUser.photoURL || '');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 underline cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Usar foto original da conta Google
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Nome de Usuário
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  Sem palavrões ou termos ofensivos — violação gera banimento imediato.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  URL de Avatar (opcional)
                </label>
                <input
                  type="url"
                  maxLength={500}
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  feedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}
              >
                {feedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.msg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || processingGallery}
              className="min-h-[44px] px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando perfil...' : 'Salvar Perfil e Avatar'}
            </button>
          </form>
        </section>

        {/* Levels Progression & Rewards List */}
        <section className="lg:col-span-5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">Sistema de Níveis e Recompensas</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Cada ponto ganho (+1 XP) e partida jogada (+25 XP) liberam bônus ao subir de nível
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {PLAYER_LEVELS.map((tier) => {
              const unlocked = levelInfo.xp >= tier.minXp;
              const isCurrent = levelInfo.level === tier.level;
              const isClaimed = claimedLevelsSet.has(tier.level);
              const canClaim = tier.rewardPoints > 0 && unlocked && !isClaimed;
              return (
                <div
                  key={tier.level}
                  className={`py-3.5 flex items-start justify-between gap-3 ${
                    isCurrent ? 'bg-emerald-50/70 dark:bg-emerald-950/35 -mx-3 px-3 rounded-xl' : ''
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex flex-wrap items-center gap-2">
                      <span>Nível {tier.level} · {tier.title}</span>
                      {tier.rewardPoints > 0 && (
                        <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          +{formatPoints(tier.rewardPoints)} pts
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">{tier.perk}</div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-zinc-300">
                      {formatPoints(tier.minXp)} XP
                    </div>
                    {canClaim ? (
                      <button
                        type="button"
                        disabled={claimingLevel !== null}
                        onClick={() => handleClaimLevel(tier.level)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        <Gift className="w-3 h-3" />
                        {claimingLevel === tier.level ? 'Resgatando...' : 'Resgatar'}
                      </button>
                    ) : (
                      <div
                        className={`text-[11px] font-medium ${
                          isClaimed || (tier.rewardPoints === 0 && unlocked)
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-zinc-600'
                        }`}
                      >
                        {tier.rewardPoints === 0
                          ? isCurrent
                            ? 'Nível Atual'
                            : 'Inicial'
                          : isClaimed
                            ? 'Resgatado'
                            : `Faltam ${formatPoints(Math.max(0, tier.minXp - levelInfo.xp))} XP`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

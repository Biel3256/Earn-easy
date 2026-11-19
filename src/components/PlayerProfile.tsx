import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Lock,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS, resolveAvatarSrc } from '../utils/avatars';
import { calculatePlayerLevel, PLAYER_LEVELS } from '../utils/levels';
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
  const { firebaseUser, userAccount, privateInfo, signInWithGoogle, updateUserProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (userAccount) {
      setDisplayName(userAccount.displayName);
      setSelectedPhoto(userAccount.photoURL);
      const isPreset = AVATAR_PRESETS.some((p) => p.persistedPath === userAccount.photoURL);
      const isGoogle = firebaseUser?.photoURL === userAccount.photoURL;
      setCustomUrl(!isPreset && !isGoogle ? userAccount.photoURL : '');
    }
  }, [userAccount, firebaseUser]);

  if (!firebaseUser || !userAccount) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Perfil do Jogador & Níveis</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Faça login com sua conta Google para personalizar seu avatar, editar seu nome de exibição e acompanhar sua evolução de nível.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const levelInfo = calculatePlayerLevel(userAccount.lifetimePoints, userAccount.gamesPlayed);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setFeedback({ type: 'err', msg: 'O nome de exibição deve ter entre 2 e 80 caracteres.' });
      return;
    }

    const finalPhoto = (customUrl.trim() || selectedPhoto).trim();
    if (finalPhoto.length > 500) {
      setFeedback({ type: 'err', msg: 'A URL do avatar deve ter no máximo 500 caracteres.' });
      return;
    }
    if (
      finalPhoto &&
      !finalPhoto.startsWith('https://') &&
      !finalPhoto.startsWith('http://') &&
      !finalPhoto.startsWith('./') &&
      !finalPhoto.startsWith('/')
    ) {
      setFeedback({ type: 'err', msg: 'Use uma URL válida iniciada por https:// ou selecione um dos avatares abaixo.' });
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile({ displayName: trimmedName, photoURL: finalPhoto });
      setFeedback({
        type: 'ok',
        msg: 'Perfil e avatar atualizados no Firestore e sincronizados com o Ranking Global.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Erro ao atualizar perfil.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Profile & Level Header Card */}
      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <ProfileAvatar
              name={displayName || userAccount.displayName}
              photoURL={customUrl.trim() || selectedPhoto}
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

        {/* XP Progress Bar */}
        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 space-y-2.5">
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
          <div className="w-full h-2.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
              style={{ width: `${levelInfo.progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-zinc-400">
            <span>{formatPoints(levelInfo.currentFloorXp)} XP</span>
            <span>{levelInfo.progressPct}%</span>
            <span>{levelInfo.nextLevelXp !== null ? `${formatPoints(levelInfo.nextLevelXp)} XP` : 'Máximo'}</span>
          </div>
        </div>
      </section>

      {/* Edit Avatar & Display Name + Level Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">Personalizar Perfil e Avatar</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Escolha um avatar oficial do Earn Easy, use sua foto do Google ou informe uma URL
              </p>
            </div>
            <UserCheck className="w-5 h-5 text-slate-400 dark:text-zinc-500 shrink-0" />
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Avatares Disponíveis
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
                      className={`p-3 rounded-xl border text-center space-y-2 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/35'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                      }`}
                    >
                      <img
                        src={preset.previewSrc}
                        alt={`Avatar ${preset.label}`}
                        className="w-16 h-16 rounded-full object-cover mx-auto border border-slate-200 dark:border-zinc-700"
                      />
                      <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">{preset.label}</div>
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
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  Sem palavrões ou termos ofensivos — violação gera banimento imediato.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  URL de Avatar Personalizado (opcional)
                </label>
                <input
                  type="url"
                  maxLength={500}
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                />
              </div>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
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
              disabled={saving}
              className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando perfil...' : 'Salvar Perfil e Avatar'}
            </button>
          </form>
        </section>

        {/* Levels Progression List */}
        <section className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">Sistema de Níveis</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Cada ponto ganho (+1 XP) e cada partida concluída (+25 XP) aumentam seu nível
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {PLAYER_LEVELS.map((tier) => {
              const unlocked = levelInfo.xp >= tier.minXp;
              const isCurrent = levelInfo.level === tier.level;
              return (
                <div
                  key={tier.level}
                  className={`py-3 flex items-start justify-between gap-3 ${
                    isCurrent ? 'bg-emerald-50/60 dark:bg-emerald-950/35 -mx-3 px-3 rounded-lg' : ''
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                      Nível {tier.level} · {tier.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">{tier.perk}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-zinc-300">
                      {formatPoints(tier.minXp)} XP
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        unlocked ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-600'
                      }`}
                    >
                      {isCurrent ? 'Atual' : unlocked ? 'Desbloqueado' : 'Bloqueado'}
                    </div>
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

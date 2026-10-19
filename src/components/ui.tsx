import type { AvatarConfig } from '@/types';
import { getAvatarVisual } from '@/constants';
import { hashStringToIndex, pickRandom } from '@/utils';

const FUN_EMOJIS = ['😎', '🤓', '🥳', '🤠', '🧐', '🤯', '🤩', '😎', '🦸', '🧙'];

export function Avatar({ av, name, size = 40, ring }: { av: AvatarConfig; name?: string; size?: number; ring?: boolean }) {
  const v = getAvatarVisual(av);
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';

  if (v.emoji) {
    return (
      <div
        className={`bg-gradient-to-br ${v.bg} flex items-center justify-center rounded-full ${ring ? 'ring-2 ring-accent-500/60' : ''}`}
        style={{ width: size, height: size }}
      >
        <span style={{ fontSize: size * 0.5 }}>{v.emoji}</span>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold text-white ${ring ? 'ring-2 ring-accent-500/60' : ''}`}
      style={{ width: size, height: size, background: v.color || '#3b95f6', fontSize: size * 0.42 }}
    >
      {av.type === 'color' ? FUN_EMOJIS[hashStringToIndex(name || v.color || 'x', FUN_EMOJIS.length)] : initial}
    </div>
  );
}

export function OnlineDot({ online, size = 10 }: { online: boolean; size?: number }) {
  return (
    <span
      className={`inline-block rounded-full ${online ? 'bg-success' : 'bg-slate-500'} ${online ? 'animate-pulse-ring' : ''}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Spinner({ size = 220, rotation, spinning }: { size?: number; rotation: number; spinning: boolean }) {
  const players = 8;
  const colors = [
    '#3b95f6', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
    '#fb7185', '#22d3ee', '#84cc16',
  ];
  const radius = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full border-8 border-bg-border shadow-2xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'none' : 'transform 4.2s cubic-bezier(0.18, 0.9, 0.2, 1)',
          background: `conic-gradient(${colors
            .map((c, i) => `${c} ${(i / players) * 360}deg ${((i + 1) / players) * 360}deg`)
            .join(', ')})`,
        }}
      />
      <div
        className="absolute rounded-full bg-bg-base flex items-center justify-center"
        style={{ width: size * 0.32, height: size * 0.32, left: size * 0.34, top: size * 0.34 }}
      >
        <span className="text-xs font-semibold text-slate-300">SPIN</span>
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: -8 }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: '18px solid #fbbf24',
          }}
        />
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} card p-5 animate-scale-in shadow-2xl`}>
        {title && <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; text: string; kind: 'info' | 'success' | 'warning' }[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`animate-slide-in cursor-pointer rounded-lg px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
            t.kind === 'success'
              ? 'bg-success/20 border border-success/40 text-success'
              : t.kind === 'warning'
              ? 'bg-warning/20 border border-warning/40 text-warning'
              : 'bg-bg-card border border-bg-border text-slate-200'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
      <div className="mb-1 opacity-70">{icon}</div>
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export { pickRandom };

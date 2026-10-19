import type { AvatarConfig } from './types';

export const AVATAR_PRESETS: { id: string; emoji: string; label: string; bg: string }[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox', bg: 'from-orange-400 to-rose-500' },
  { id: 'panda', emoji: '🐼', label: 'Panda', bg: 'from-slate-400 to-slate-700' },
  { id: 'frog', emoji: '🐸', label: 'Frog', bg: 'from-green-400 to-emerald-600' },
  { id: 'owl', emoji: '🦉', label: 'Owl', bg: 'from-amber-400 to-yellow-700' },
  { id: 'lion', emoji: '🦁', label: 'Lion', bg: 'from-yellow-400 to-orange-600' },
  { id: 'cat', emoji: '🐱', label: 'Cat', bg: 'from-pink-400 to-fuchsia-600' },
  { id: 'dog', emoji: '🐶', label: 'Dog', bg: 'from-amber-300 to-amber-600' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin', bg: 'from-sky-400 to-slate-700' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn', bg: 'from-violet-400 to-pink-500' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon', bg: 'from-emerald-400 to-teal-700' },
  { id: 'bee', emoji: '🐝', label: 'Bee', bg: 'from-yellow-300 to-amber-500' },
  { id: 'ghost', emoji: '👻', label: 'Ghost', bg: 'from-indigo-300 to-slate-600' },
  { id: 'robot', emoji: '🤖', label: 'Robot', bg: 'from-cyan-400 to-blue-600' },
  { id: 'alien', emoji: '👽', label: 'Alien', bg: 'from-lime-400 to-green-600' },
  { id: 'monkey', emoji: '🐵', label: 'Monkey', bg: 'from-amber-500 to-yellow-800' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus', bg: 'from-pink-400 to-rose-700' },
];

export const AVATAR_COLORS = [
  '#3b95f6', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#fb7185', '#22d3ee', '#84cc16', '#f97316', '#e879f9',
];

export const ANON_NAMES = [
  'Shadow Fox', 'Midnight Owl', 'Quiet River', 'Lone Wolf', 'Hidden Star',
  'Silent Echo', 'Mystic Moon', 'Phantom Wave', 'Veiled Sky', 'Secret Pine',
];

export function avatarToConfig(presetId: string): AvatarConfig {
  return { type: 'preset', preset: presetId };
}

export function getAvatarVisual(av: AvatarConfig): { emoji: string; bg: string; color: string } {
  if (av.type === 'preset' && av.preset) {
    const found = AVATAR_PRESETS.find((p) => p.id === av.preset);
    if (found) return { emoji: found.emoji, bg: found.bg, color: '' };
  }
  if (av.type === 'color' && av.color) {
    return { emoji: '', bg: '', color: av.color };
  }
  const def = AVATAR_PRESETS[0];
  return { emoji: def.emoji, bg: def.bg, color: '' };
}

export const TRUTH_PROMPTS = [
  'What is a secret talent nobody in class knows about?',
  'If you could swap seats with anyone for a day, who would it be and why?',
  "What's the most embarrassing song on your playlist?",
  'What is your most-used emoji and what does it say about you?',
  'If you had to teach a class on any topic right now, what would it be?',
  "What's the funniest thing that ever happened during a class?",
  'Which teacher would you want as a roommate for a week?',
  'What is your go-to excuse when you forget your homework?',
  'If you could redo one school day, which would it be?',
  'What is the weirdest food combination you actually enjoy?',
  "What's a small thing that always makes your day better?",
  'If your notebook could talk, what would it say about you?',
  'Which class would you happily take twice and why?',
  "What's the most adventurous thing on your bucket list?",
  'If you could instantly master one skill, what would it be?',
  "What's a TV show you pretend not to watch but secretly love?",
  'If you could invite any historical figure to class, who would it be?',
  "What's your most-used keyboard shortcut?",
  'Which planet would you visit if space travel were free?',
  'What is the kindest thing a classmate has done for you?',
  "If you had to give a 5-minute speech right now, what topic would you pick?",
  "What's a habit you wish you started earlier in life?",
];

export const DARE_PROMPTS = [
  'Speak in an accent for the next two turns.',
  'Send a funny GIF in the chat right now.',
  'Do your best impression of a teacher and let the room guess who it is.',
  'Write a haiku about the last person who took a turn.',
  'Stand up and do 10 jumping jacks.',
  'Sing the chorus of any song out loud.',
  'Tell a joke. If no one laughs, do it again louder.',
  'Text (or pretend to text) a compliment to someone in the room.',
  'Do your best robot dance for 15 seconds.',
  'Compliment every player in the room in one sentence each.',
  'Imitate a cat for 30 seconds without breaking character.',
  'Draw your avatar on paper and show the camera.',
  'Describe your day so far using only movie titles.',
  'Speak in rhyme for your next three messages.',
  'Do an impression of a news anchor announcing this game.',
  'Balance an object on your head for 15 seconds.',
  'Tell a story in exactly 30 words.',
  'Act like you just won an award and give an acceptance speech.',
  'Make the silliest face you can and hold it for 10 seconds.',
  'Whisper your next message dramatically.',
  'Invent a new handshake with the player to your left.',
  'Recite the alphabet backwards as fast as you can.',
];

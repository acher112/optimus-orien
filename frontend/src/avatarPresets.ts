/**
 * OPTIMUS ORIEN - Default & Selectable Avatar Presets
 * High-resolution SVG data-URI avatars providing instant defaults and user choice.
 */

function svgToUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export interface AvatarPreset {
  id: string;
  name: string;
  roleHint: string;
  dataUri: string;
  isDefault?: boolean;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'default',
    name: 'Optimus Scholar (Default)',
    roleHint: 'System Default • Aqua Cyan',
    isDefault: true,
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_default" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#0891b2" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_default)" />
        <ellipse cx="60" cy="52" rx="22" ry="24" fill="#fde68a" />
        <path d="M38 52 C38 36 82 36 82 52 C82 38 78 30 60 30 C42 30 38 38 38 52 Z" fill="#1e293b" />
        <polygon points="60,20 90,32 60,42 30,32" fill="#0f172a" />
        <polygon points="60,22 84,32 60,40 36,32" fill="#06b6d4" />
        <line x1="84" y1="32" x2="88" y2="48" stroke="#f59e0b" stroke-width="2" />
        <circle cx="88" cy="49" r="3" fill="#f59e0b" />
        <circle cx="53" cy="52" r="2.5" fill="#1e293b" />
        <circle cx="67" cy="52" r="2.5" fill="#1e293b" />
        <path d="M54 62 Q60 67 66 62" stroke="#d97706" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M26 108 C26 84 42 76 60 76 C78 76 94 84 94 108 Z" fill="#0f172a" />
        <polygon points="60,76 52,90 60,94 68,90" fill="#ffffff" />
        <polygon points="60,82 57,98 60,104 63,98" fill="#06b6d4" />
      </svg>
    `),
  },
  {
    id: 'leader',
    name: 'Executive Leader',
    roleHint: 'Leadership & Governance',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_leader" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#0369a1" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_leader)" />
        <ellipse cx="60" cy="50" rx="20" ry="22" fill="#fcd34d" />
        <path d="M40 44 C40 30 80 30 80 44 C80 32 74 26 60 26 C46 26 40 32 40 44 Z" fill="#334155" />
        <circle cx="53" cy="50" r="2.2" fill="#1e293b" />
        <circle cx="67" cy="50" r="2.2" fill="#1e293b" />
        <circle cx="53" cy="50" r="5.5" stroke="#334155" stroke-width="1.5" fill="none" />
        <circle cx="67" cy="50" r="5.5" stroke="#334155" stroke-width="1.5" fill="none" />
        <line x1="58.5" y1="50" x2="61.5" y2="50" stroke="#334155" stroke-width="1.5" />
        <path d="M55 60 Q60 64 65 60" stroke="#b45309" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M26 110 C26 82 42 72 60 72 C78 72 94 82 94 110 Z" fill="#1e293b" />
        <polygon points="60,72 50,88 60,92 70,88" fill="#ffffff" />
        <polygon points="60,78 57,98 60,105 63,98" fill="#ef4444" />
      </svg>
    `),
  },
  {
    id: 'educator_stem',
    name: 'STEM Specialist',
    roleHint: 'Science & Mathematics',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_stem" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#047857" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_stem)" />
        <ellipse cx="60" cy="50" rx="20" ry="22" fill="#fed7aa" />
        <path d="M38 48 C36 32 84 32 82 48 C82 30 74 24 60 24 C46 24 38 30 38 48 Z" fill="#475569" />
        <circle cx="53" cy="50" r="2.2" fill="#1e293b" />
        <circle cx="67" cy="50" r="2.2" fill="#1e293b" />
        <path d="M55 60 Q60 64 65 60" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M26 110 C26 84 40 74 60 74 C80 74 94 84 94 110 Z" fill="#0f766e" />
        <path d="M46 76 L60 94 L74 76 Z" fill="#f8fafc" />
        <circle cx="60" cy="100" r="3" fill="#38bdf8" />
      </svg>
    `),
  },
  {
    id: 'educator_female',
    name: 'Lead Educator',
    roleHint: 'Faculty & Pedagogy',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_edu_f" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#6d28d9" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_edu_f)" />
        <ellipse cx="60" cy="52" rx="20" ry="22" fill="#fde68a" />
        <path d="M36 50 C34 26 86 26 84 50 C84 66 82 72 78 72 C78 54 74 38 60 38 C46 38 42 54 42 72 C38 72 36 66 36 50 Z" fill="#451a03" />
        <circle cx="54" cy="51" r="2.2" fill="#1e293b" />
        <circle cx="66" cy="51" r="2.2" fill="#1e293b" />
        <path d="M55 61 Q60 65 65 61" stroke="#b45309" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M28 110 C28 84 42 74 60 74 C78 74 92 84 92 110 Z" fill="#7c3aed" />
        <polygon points="60,74 54,86 60,90 66,86" fill="#f8fafc" />
        <circle cx="60" cy="98" r="3" fill="#f59e0b" />
      </svg>
    `),
  },
  {
    id: 'student_boy',
    name: 'Junior Scholar',
    roleHint: 'Learner • Primary/Middle',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_stud_b" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6" />
            <stop offset="100%" stop-color="#1d4ed8" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_stud_b)" />
        <ellipse cx="60" cy="52" rx="20" ry="21" fill="#fde68a" />
        <path d="M40 44 C42 28 78 28 80 44 C80 32 74 24 60 24 C46 24 40 32 40 44 Z" fill="#78350f" />
        <path d="M38 32 C48 20 72 20 82 32 L88 34 C80 26 72 18 60 18 C48 18 40 26 32 34 Z" fill="#f59e0b" />
        <circle cx="53" cy="52" r="2.5" fill="#1e293b" />
        <circle cx="67" cy="52" r="2.5" fill="#1e293b" />
        <path d="M54 62 Q60 68 66 62" stroke="#b45309" stroke-width="2.2" fill="none" stroke-linecap="round" />
        <path d="M28 110 C28 86 42 75 60 75 C78 75 92 86 92 110 Z" fill="#2563eb" />
        <circle cx="60" cy="78" r="7" fill="#f8fafc" />
        <path d="M56 86 L60 92 L64 86" stroke="#93c5fd" stroke-width="2" fill="none" />
      </svg>
    `),
  },
  {
    id: 'student_girl',
    name: 'Senior Scholar',
    roleHint: 'Learner • Secondary',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_stud_g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ec4899" />
            <stop offset="100%" stop-color="#be185d" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_stud_g)" />
        <ellipse cx="60" cy="52" rx="19" ry="21" fill="#fde68a" />
        <path d="M38 52 C36 30 84 30 82 52 C82 68 84 76 80 80 C80 62 76 40 60 40 C44 40 40 62 40 80 C36 76 38 68 38 52 Z" fill="#1e293b" />
        <path d="M42 34 C48 26 72 26 78 34" stroke="#f43f5e" stroke-width="3" fill="none" stroke-linecap="round" />
        <circle cx="54" cy="52" r="2.3" fill="#1e293b" />
        <circle cx="66" cy="52" r="2.3" fill="#1e293b" />
        <path d="M55 62 Q60 67 65 62" stroke="#b45309" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M28 110 C28 86 42 76 60 76 C78 76 92 86 92 110 Z" fill="#db2777" />
        <polygon points="60,76 53,88 60,92 67,88" fill="#ffffff" />
      </svg>
    `),
  },
  {
    id: 'chancellor',
    name: 'Institutional Chancellor',
    roleHint: 'Executive Campus Head',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_chan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#4338ca" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_chan)" />
        <ellipse cx="60" cy="50" rx="20" ry="22" fill="#fed7aa" />
        <path d="M38 48 C36 34 84 34 82 48 C82 32 76 26 60 26 C44 26 38 32 38 48 Z" fill="#94a3b8" />
        <circle cx="53" cy="50" r="2.2" fill="#1e293b" />
        <circle cx="67" cy="50" r="2.2" fill="#1e293b" />
        <circle cx="53" cy="50" r="5.2" stroke="#475569" stroke-width="1.3" fill="none" />
        <circle cx="67" cy="50" r="5.2" stroke="#475569" stroke-width="1.3" fill="none" />
        <line x1="58.2" y1="50" x2="61.8" y2="50" stroke="#475569" stroke-width="1.3" />
        <path d="M55 60 Q60 64 65 60" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M26 110 C26 82 42 72 60 72 C78 72 94 82 94 110 Z" fill="#312e81" />
        <path d="M42 78 Q60 92 78 78" stroke="#f59e0b" stroke-width="2.5" fill="none" />
        <polygon points="60,72 54,86 60,90 66,86" fill="#f8fafc" />
      </svg>
    `),
  },
  {
    id: 'crest',
    name: 'Optimus Orien Crest',
    roleHint: 'Institutional Emblem',
    dataUri: svgToUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="bg_crest" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#020617" />
          </linearGradient>
          <linearGradient id="crest_grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#22d3ee" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bg_crest)" />
        <circle cx="60" cy="60" r="44" stroke="#1e293b" stroke-width="2" fill="none" />
        <polygon points="60,26 84,60 60,94 36,60" fill="url(#crest_grad)" opacity="0.9" />
        <polygon points="60,34 78,60 60,86 42,60" fill="#0f172a" />
        <circle cx="60" cy="60" r="8" fill="#f59e0b" />
        <circle cx="60" cy="60" r="4" fill="#ffffff" />
      </svg>
    `),
  },
];

export const DEFAULT_AVATAR_URI = AVATAR_PRESETS[0].dataUri;

export function getEffectiveAvatar(avatarImage?: string | null): string {
  if (avatarImage && avatarImage.trim().length > 0) {
    return avatarImage;
  }
  return DEFAULT_AVATAR_URI;
}

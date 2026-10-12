import type { ReactNode, SVGProps } from 'react';

const base = (children: ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
        {children}
      </svg>
    );
  };

export const IconCode = base(<><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /><path d="M14 4l-4 16" /></>);
export const IconTable = base(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>);
export const IconCopy = base(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></>);
export const IconDownload = base(<><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconUpload = base(<><path d="M12 16V5" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></>);
export const IconTrash = base(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>);
export const IconPlus = base(<><path d="M12 5v14M5 12h14" /></>);
export const IconUp = base(<><path d="M6 14l6-6 6 6" /></>);
export const IconDown = base(<><path d="M6 10l6 6 6-6" /></>);
export const IconLeft = base(<><path d="M14 6l-6 6 6 6" /></>);
export const IconRight = base(<><path d="M10 6l6 6-6 6" /></>);
export const IconDuplicate = base(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>);
export const IconSave = base(<><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>);
export const IconReset = base(<><path d="M4 12a8 8 0 108-8" /><path d="M4 4v5h5" /></>);
export const IconPlay = base(<><path d="M7 5l12 7-12 7z" /></>);
export const IconShield = base(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>);
export const IconSun = base(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>);
export const IconMoon = base(<><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></>);
export const IconAlert = base(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>);
export const IconInfo = base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" /></>);
export const IconError = base(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>);
export const IconCheck = base(<><path d="M5 12l5 5 9-10" /></>);
export const IconX = base(<><path d="M6 6l12 12M18 6L6 18" /></>);
export const IconFile = base(<><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></>);
export const IconHome = base(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>);
export const IconArrow = base(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>);
export const IconFolder = base(<><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></>);
export const IconMenu = base(<><path d="M4 7h16M4 12h16M4 17h16" /></>);

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M12 10l-5 6 5 6M20 10l5 6-5 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 8.5l-3 15" stroke="#bff3e5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

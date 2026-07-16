import React, { type SVGProps } from 'react';

export type IconName =
  | 'bird'
  | 'home'
  | 'explore'
  | 'bell'
  | 'mail'
  | 'bookmark'
  | 'list'
  | 'user'
  | 'more'
  | 'moreCircle'
  | 'search'
  | 'settings'
  | 'feather'
  | 'reply'
  | 'retweet'
  | 'heart'
  | 'share'
  | 'image'
  | 'gif'
  | 'poll'
  | 'emoji'
  | 'calendar'
  | 'back'
  | 'close'
  | 'check'
  | 'chevron'
  | 'globe'
  | 'lock'
  | 'link'
  | 'location'
  | 'sparkle'
  | 'plus'
  | 'camera'
  | 'trash'
  | 'topic'
  | 'moment'
  | 'external'
  | 'warning'
  | 'people'
  | 'eye';

const paths: Partial<Record<IconName, React.ReactNode>> = {
  home: (
    <path d="M3 10.6 12 3l9 7.6v9.1a1.3 1.3 0 0 1-1.3 1.3h-5.2v-6.7h-5V21H4.3A1.3 1.3 0 0 1 3 19.7v-9.1Z" />
  ),
  explore: <path d="M9.5 3 7.2 21M16.8 3l-2.3 18M4 9h16M3 15h16" />,
  bell: (
    <path d="M18.5 9.7c0-3.7-2-6.2-6.5-6.2S5.5 6 5.5 9.7c0 6.3-2.3 6.3-2.3 7.8h17.6c0-1.5-2.3-1.5-2.3-7.8ZM9.4 20.2h5.2" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  bookmark: <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z" />,
  list: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  moreCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  feather: (
    <>
      <path d="M20.5 3.5c-6-.3-11.3 2.8-13.8 7.5-.8 1.5-1.2 3.1-1.2 4.7L3 21l5.3-2.5c1.6 0 3.2-.4 4.7-1.2 4.7-2.5 7.8-7.8 7.5-13.8Z" />
      <path d="M6 18 16.5 7.5M9.8 14.2H15v-5.1" />
    </>
  ),
  reply: (
    <path d="M20.5 15.5c0 1.5-.8 2.8-2.1 3.6-.6.4-1.3.6-2 .6l-4.4 2-4.4-2c-2.3-.1-4.1-1.9-4.1-4.2V9c0-2.4 1.9-4.3 4.3-4.3h8.4c2.4 0 4.3 1.9 4.3 4.3v6.5Z" />
  ),
  retweet: (
    <>
      <path d="m7 7 3-3 3 3M10 4v11H6a3 3 0 0 0-3 3v1" />
      <path d="m17 17-3 3-3-3m3 3V9h4a3 3 0 0 0 3-3V5" />
    </>
  ),
  heart: <path d="M12 21s-8-4.8-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 6.2-8 11-8 11Z" />,
  share: (
    <>
      <path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5" />
      <path d="M6 12v7h12v-7" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
    </>
  ),
  gif: <rect x="3" y="5" width="18" height="14" rx="2" />,
  poll: (
    <>
      <path d="M5 4v16M12 8v12M19 12v8" />
      <circle cx="5" cy="4" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="19" cy="12" r="2" />
    </>
  ),
  emoji: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4 4 0 0 0 7 0M8.5 9h.01M15.5 9h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  back: <path d="m14.5 5-7 7 7 7" />,
  close: <path d="M5 5l14 14M19 5 5 19" />,
  check: <path d="m4 12 5 5L20 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18m0-18a14 14 0 0 0 0 18" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  link: (
    <>
      <path d="m10 14 4-4" />
      <path
        d="M7.5 16.5 5 19a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 7.5 19 5a3.5 3.5 0 1 1 5 5l-4 4a3.5 3.5 0 0 1-5 0"
        transform="translate(-1 -1)"
      />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  sparkle: (
    <path d="m12 2 1.3 5.2L18 9l-4.7 1.8L12 16l-1.3-5.2L6 9l4.7-1.8L12 2Zm7 12 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 14l.8 2.7L8.5 18l-2.7.8L5 21.5l-.8-2.7L1.5 18l2.7-1.3L5 14Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="m8 6 1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M10 11v6m4-6v6" />
    </>
  ),
  topic: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  moment: <path d="M13 2 5 13h6l-1 9 9-12h-6V2Z" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5H5V5h5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0m0-6a5 5 0 0 1 6 5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

const activePaths: Partial<Record<IconName, React.ReactNode>> = {
  home: (
    <path d="M22.5 8.2 12.6 1.7a1.1 1.1 0 0 0-1.2 0L1.5 8.2a1 1 0 0 0-.5.9v11.4c0 .6.4 1 1 1h6.2v-7h7.6v7H22c.6 0 1-.4 1-1V9.1a1 1 0 0 0-.5-.9Z" />
  ),
  explore: (
    <path d="M8.8 2 8.1 7H3.5v2.4h4.3l-.8 5.2H2.5V17h4.2L6 22h2.4l.7-5h5.1l-.7 5h2.4l.7-5h4.6v-2.4h-4.3l.8-5.2h4.5V7H18l.7-5h-2.4l-.7 5h-5.1l.7-5H8.8Zm1.3 7.4h5.1l-.7 5.2H9.3l.8-5.2Z" />
  ),
  bell: (
    <path d="M20.7 16.3c-1.2-1.4-1.8-2.6-1.8-6 0-4-2.6-7-6.1-7.5V1h-1.6v1.8c-3.5.5-6.1 3.5-6.1 7.5 0 3.4-.6 4.6-1.8 6A2.1 2.1 0 0 0 4.9 20h4.6a2.6 2.6 0 0 0 5 0h4.6a2.1 2.1 0 0 0 1.6-3.7Z" />
  ),
  mail: (
    <path d="M20.5 4h-17A2.5 2.5 0 0 0 1 6.5v11A2.5 2.5 0 0 0 3.5 20h17a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 20.5 4Zm-.6 2L12 11.6 4.1 6h15.8Z" />
  ),
  bookmark: <path d="M18 2H6a2 2 0 0 0-2 2v18l8-5.2 8 5.2V4a2 2 0 0 0-2-2Z" />,
  list: (
    <path d="M19.5 2h-15A2.5 2.5 0 0 0 2 4.5v15A2.5 2.5 0 0 0 4.5 22h15a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 19.5 2ZM7 7h10v2H7V7Zm0 4h10v2H7v-2Zm0 4h7v2H7v-2Z" />
  ),
  user: (
    <path d="M12 12.1a5.1 5.1 0 1 0 0-10.2 5.1 5.1 0 0 0 0 10.2Zm0 1.9c-5.4 0-9.8 3.3-9.8 7.3 0 .4.3.7.7.7h18.2c.4 0 .7-.3.7-.7 0-4-4.4-7.3-9.8-7.3Z" />
  ),
};

export function Icon({
  name,
  size = 24,
  active = false,
  ...props
}: { name: IconName; size?: number; active?: boolean } & SVGProps<SVGSVGElement>) {
  if (name === 'bird') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        fill="currentColor"
        {...props}
      >
        <path d="M23.3 4.7c-.8.4-1.7.6-2.6.7.9-.6 1.7-1.5 2-2.5-.9.5-1.9.9-3 1.1a4.6 4.6 0 0 0-8 4.2A13.2 13.2 0 0 1 2.2 3.4a4.6 4.6 0 0 0 1.4 6.2c-.8 0-1.5-.2-2.1-.6v.1a4.6 4.6 0 0 0 3.7 4.5c-.4.1-.8.2-1.2.2-.3 0-.6 0-.9-.1a4.6 4.6 0 0 0 4.3 3.2 9.3 9.3 0 0 1-5.7 2c-.4 0-.7 0-1.1-.1a13.1 13.1 0 0 0 7.1 2.1c8.5 0 13.2-7.1 13.2-13.2v-.6c.9-.7 1.7-1.5 2.4-2.4Z" />
      </svg>
    );
  }
  if (active && activePaths[name]) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        fill="currentColor"
        {...props}
      >
        {activePaths[name]}
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {name === 'gif' && (
        <text x="5.5" y="15" fill="currentColor" stroke="none" fontSize="8.5" fontWeight="800">
          GIF
        </text>
      )}
      {paths[name]}
    </svg>
  );
}

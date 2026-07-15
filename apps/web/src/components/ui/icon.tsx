import type { SVGProps } from 'react';

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
  explore: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3 5.3-2.3Z" />
    </>
  ),
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

export function Icon({
  name,
  size = 24,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
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

import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/components/providers/app-providers';
import '@/styles/globals.css';
import '@/styles/providers.css';
import '@/styles/ui.css';
import '@/styles/shell.css';
import '@/styles/timeline.css';
import '@/styles/auth.css';
import '@/styles/home.css';

export const metadata: Metadata = {
  title: { default: 'Twitter', template: '%s / Twitter' },
  description: 'See what’s happening in the world right now.',
  applicationName: 'Twitter',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#15202b' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

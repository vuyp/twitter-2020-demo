import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'enabled', 'yes']);
let warnedStateFile = '';

type MaintenanceEnvironment = Record<string, string | undefined>;

export function isMaintenanceMode(
  environment: MaintenanceEnvironment = process.env,
  readState: (path: string, encoding: BufferEncoding) => string = readFileSync,
): boolean {
  if (ENABLED_VALUES.has((environment.MAINTENANCE_MODE || '').trim().toLowerCase())) return true;

  const stateFile =
    environment.MAINTENANCE_STATE_FILE || resolve(process.cwd(), '../../.runtime/maintenance');
  try {
    return ENABLED_VALUES.has(readState(stateFile, 'utf8').trim().toLowerCase());
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && warnedStateFile !== stateFile) {
      warnedStateFile = stateFile;
      console.warn('Maintenance state file could not be read', { stateFile, code });
    }
    return false;
  }
}

export function maintenanceHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#1da1f2">
  <title>Something is technically wrong / Twitter</title>
  <style>
    *{box-sizing:border-box}
    html{min-height:100%;background:#1da1f2}
    body{min-height:100vh;margin:0;padding:60px 20px 34px;font:14px/18px Arial,sans-serif;color:#fff}
    a{color:inherit;text-decoration:none;outline:0}
    a:hover,a:focus{text-decoration:underline}
    .topbar{position:fixed;z-index:10;top:0;right:0;left:0;height:46px;border-bottom:1px solid rgba(0,0,0,.15);background:#fff;color:#66757f}
    .topbar-inner{display:flex;max-width:1190px;height:46px;align-items:center;justify-content:space-between;margin:0 auto;padding:0 28px}
    .bird{display:block;width:23px;height:19px;color:#1da1f2}
    .home{font-size:13px;font-weight:500}
    .content{max-width:865px;margin:0 auto;text-align:center;text-shadow:0 1px 1px rgba(0,0,0,.2)}
    .robot{position:relative;display:block;width:min(520px,50vw);max-width:50%;height:auto;margin:22px auto 0}
    h1{position:relative;z-index:2;margin:30px 0 0;font-size:40px;font-weight:200;line-height:1;text-rendering:optimizeLegibility;text-shadow:0 1px 2px rgba(0,0,0,.2)}
    p{position:relative;z-index:2;margin:10px 0 20px;color:#e0eff6;font-size:18px;font-weight:300;line-height:25px;text-rendering:optimizeLegibility}
    .footer{margin:30px 10% 0;text-align:center;font-size:11px}
    .footer ul{margin:0;padding:0;list-style:none}
    .footer li{display:inline;margin:0 5px;color:#e4f0f5;line-height:20px}
    .footer a:hover,.footer a:focus{color:#fff}
    @media (min-width:640px) and (min-height:700px){.canvas{position:absolute;right:0;bottom:10%;left:0}.robot{max-width:50%}}
    @media (max-width:639px){body{padding-top:70px}.topbar-inner{padding:0 18px}.robot{width:min(360px,86vw);max-width:86%;margin-top:28px}h1{font-size:30px;line-height:34px}p{font-size:16px;line-height:23px}.footer{margin-top:22px}}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a href="/" aria-label="Twitter home">
        <svg class="bird" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M23.3 4.7c-.8.4-1.7.6-2.6.7.9-.6 1.7-1.5 2-2.5-.9.5-1.9.9-3 1.1a4.6 4.6 0 0 0-8 4.2A13.2 13.2 0 0 1 2.2 3.4a4.6 4.6 0 0 0 1.4 6.2c-.8 0-1.5-.2-2.1-.6v.1a4.6 4.6 0 0 0 3.7 4.5c-.4.1-.8.2-1.2.2-.3 0-.6 0-.9-.1a4.6 4.6 0 0 0 4.3 3.2 9.3 9.3 0 0 1-5.7 2c-.4 0-.7 0-1.1-.1a13.1 13.1 0 0 0 7.1 2.1c8.5 0 13.2-7.1 13.2-13.2v-.6c.9-.7 1.7-1.5 2.4-2.4Z"/></svg>
      </a>
      <a class="home" href="/">Home →</a>
    </div>
  </header>
  <main class="content">
    <div class="canvas"><img class="robot" src="/maintenance-robot.png" alt="A broken Twitter robot"></div>
    <h1>Something is technically wrong.</h1>
    <p>Thanks for noticing—we're going to fix it up and have things back to normal soon.</p>
  </main>
  <footer class="footer">
    <ul><li>© 2020 Twitter</li><li><a href="https://help.twitter.com/">Help</a></li><li><a href="https://status.twitterstat.us/">Status</a></li></ul>
  </footer>
</body>
</html>`;
}

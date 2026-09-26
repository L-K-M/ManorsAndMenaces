// The server's own small pages: the ones behind email links and, on an
// invite-only server, the invite pages. Plain HTML with inline styles, since
// they are served with a CSP that allows nothing else.

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface PageOptions {
  /** A button that posts back to the page's own address. */
  button?: string;
  link?: { href: string; label: string };
}

export function htmlPage(title: string, body: string, opts: PageOptions = {}): string {
  const form = opts.button ? `<form method="post"><button>${escapeHtml(opts.button)}</button></form>` : "";
  const link = opts.link ? `<p><a href="${escapeHtml(opts.link.href)}">${escapeHtml(opts.link.label)}</a></p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 17px/1.5 Georgia, serif; background: #efe4c8; color: #2b2116; }
main { max-width: 30rem; margin: 1rem; padding: 1.4rem 1.6rem; background: #fbf5e6; border: 3px solid #8a7650; border-radius: 16px; }
h1 { margin-top: 0; font-size: 1.4rem; }
button { font: inherit; padding: 0.5rem 1.2rem; border-radius: 10px; border: 2px solid #5b4a2c; background: #7a5a2e; color: #fff; cursor: pointer; }
a { color: #5b3f12; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${form}${link}
</main>
</body>
</html>
`;
}

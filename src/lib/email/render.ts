/**
 * HTML escaping and email layout helpers.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeText(value: string): string {
  return value.replace(/[\r\n]+/g, '\n').trim();
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function wrapBrandedEmail(input: {
  previewText: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  /** Prefer a plain text-style link over a large button (better for Outlook inbox). */
  ctaStyle?: 'button' | 'link';
  /**
   * `card` = bordered white panel (legacy).
   * `plain` = minimal HTML closer to a normal inbox message (better for Hotmail).
   */
  layout?: 'card' | 'plain';
}): string {
  const preview = escapeHtml(input.previewText);
  const heading = escapeHtml(input.heading);
  const ctaStyle = input.ctaStyle ?? 'button';
  const layout = input.layout ?? 'card';
  const cta =
    input.ctaLabel && input.ctaUrl
      ? ctaStyle === 'link'
        ? `<p style="margin:20px 0 8px;font-size:16px;line-height:1.5">
            <a href="${escapeHtml(input.ctaUrl)}" style="color:#0B1F33;font-weight:600">
              ${escapeHtml(input.ctaLabel)}
            </a>
          </p>
          <p style="margin:0;font-size:14px;color:#5B6B7C;word-break:break-all">
            ${escapeHtml(input.ctaUrl)}
          </p>`
        : `<p style="margin:28px 0 8px">
          <a href="${escapeHtml(input.ctaUrl)}"
             style="display:inline-block;background:#0B1F33;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600;font-size:16px">
            ${escapeHtml(input.ctaLabel)}
          </a>
        </p>
        <p style="margin:0;font-size:13px;color:#5B6B7C;word-break:break-all">
          Or open: ${escapeHtml(input.ctaUrl)}
        </p>`
      : '';
  const footer = escapeHtml(
    input.footerNote ||
      'Che Xu Studio · This is a transactional message about your project. Reply to this email if you have questions.',
  );

  if (layout === 'plain') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0B1F33;font-family:${FONT_STACK}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div>
  <div style="max-width:560px;margin:0;padding:20px 16px;font-size:16px;line-height:1.55;color:#243447">
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0B1F33">Che Xu Studio</p>
    <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#0B1F33">${heading}</p>
    ${input.bodyHtml}
    ${cta}
    <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#5B6B7C">${footer}</p>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F8;color:#0B1F33;font-family:${FONT_STACK}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6F8;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #D8DEE6;border-radius:8px">
          <tr>
            <td style="padding:28px 24px 8px">
              <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#1F6FEB;font-weight:700">
                Che Xu Studio
              </p>
              <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;font-weight:700;color:#0B1F33">
                ${heading}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 28px;font-size:16px;line-height:1.55;color:#243447">
              ${input.bodyHtml}
              ${cta}
            </td>
          </tr>
        </table>
        <p style="max-width:560px;margin:16px 0 0;font-size:12px;line-height:1.5;color:#5B6B7C;text-align:center">
          ${footer}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px">${escapeHtml(text)}</p>`;
}

export function strongLine(label: string, value: string): string {
  return `<p style="margin:0 0 8px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

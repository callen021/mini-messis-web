/**
 * vCard 3.0 export for contacts (D57). Pure builders; `deliverVcf` touches the DOM. vCard 3.0
 * rather than 4.0 because iOS Contacts, Android and Outlook all import it without surprises.
 */

export interface VCardInput {
  name: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  /** The child the contact belongs to, for the note and the group name. */
  childName: string;
  teamName: string;
}

const esc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** "Pat Example" → N:Example;Pat;;; (last name is whatever follows the first word). */
function nameParts(full: string): string {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? '';
  const last = parts.join(' ');
  return `${esc(last)};${esc(first)};;;`;
}

export function buildVCard(c: VCardInput): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${nameParts(c.name)}`, `FN:${esc(c.name.trim())}`];
  if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  lines.push(`ORG:${esc(c.teamName)}`);
  const note = `${c.relationship ? `${c.relationship} of ` : 'Contact for '}${c.childName} (${c.teamName})`;
  lines.push(`NOTE:${esc(note)}`, `CATEGORIES:${esc(c.teamName)}`, 'END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/** Several cards in one file ("Add all to contacts"). */
export function buildVCards(list: readonly VCardInput[]): string {
  return list.map(buildVCard).join('');
}

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Hand a .vcf to the device. Desktop and Android download it; iOS (Safari and the installed app)
 * ignores `download` for blobs, so the page navigates to the blob and Safari shows the contact
 * card with "Create New Contact" / "Add All Contacts".
 */
export function deliverVcf(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (isIOS()) {
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, '-');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

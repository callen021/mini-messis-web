import { fmtDate } from '@/games/format';
import { formatPhone } from '@/lib/phone';
import { shirtSizeLabel, type TeamSheetRow } from '@/players/api';

/** CSV with one row per contact (a player with no contacts still gets a row). Pure. */
export function teamSheetCsv(rows: readonly TeamSheetRow[]): string {
  const cell = (v: string | null | undefined) => {
    const s = v ?? '';
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [
      'Player',
      'Number',
      'Birthdate',
      'Shirt size',
      'Contact',
      'Relationship',
      'Phone',
      'Email',
      'Shared with team',
    ].join(','),
  ];
  for (const r of rows) {
    const base = [
      `${r.first_name}${r.last_name ? ` ${r.last_name}` : ''}`,
      r.jersey_number,
      r.birthdate,
      shirtSizeLabel(r.shirt_size),
    ];
    if (!r.contacts.length) lines.push([...base, '', '', '', '', ''].map(cell).join(','));
    for (const c of r.contacts)
      lines.push(
        [
          ...base,
          c.name,
          c.relationship,
          c.phone ? formatPhone(c.phone) : '',
          c.email,
          c.share_with_team ? 'yes' : 'no',
        ]
          .map(cell)
          .join(','),
      );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Tab-separated text for pasting into a spreadsheet or a message. Pure. */
export function teamSheetText(rows: readonly TeamSheetRow[]): string {
  return rows
    .map((r) => {
      const who = `${r.first_name}${r.last_name ? ` ${r.last_name}` : ''}${r.jersey_number ? ` #${r.jersey_number}` : ''}`;
      const facts = [r.birthdate ? fmtDate(r.birthdate, true) : '', shirtSizeLabel(r.shirt_size)]
        .filter(Boolean)
        .join(' · ');
      const people = r.contacts
        .map((c) =>
          [c.name, c.relationship, c.phone ? formatPhone(c.phone) : '', c.email].filter(Boolean).join(' · '),
        )
        .join('\n  ');
      return `${who}${facts ? `\t${facts}` : ''}${people ? `\n  ${people}` : ''}`;
    })
    .join('\n');
}

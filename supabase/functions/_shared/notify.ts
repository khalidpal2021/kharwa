// >>> shared: notify
// -----------------------------------------------------------------------------
// What every Kharwa notification says, in one place: prayer reminders,
// nudges and notes, real or test. This block is the same in send-reminders,
// send-nudge and send-message. Edit it in supabase/functions/_shared/notify.ts
// only, then run `node supabase/functions/sync-shared.mjs` to copy it into the
// three functions (`--check` fails if a copy has drifted). Each function stays
// one file, so it can still be pasted into the dashboard editor.
//
// Every notification is title-only: everything is in the title and the body
// is empty, so iOS shows one bold line with "from Kharwa" under it. Titles
// are kept short enough not to be cut off.
//
// Tags: a prayer's reminder and a nudge for it share one tag per day
// (kharwaPrayerTag), so a later one replaces the earlier instead of piling
// up, and logging the prayer can close it. `renotify` makes a replacement
// alert again.
// -----------------------------------------------------------------------------

const NOTIFY_TZ = 'America/Los_Angeles';
const notifyClock = new Intl.DateTimeFormat('en-US', { timeZone: NOTIFY_TZ, hour: 'numeric', minute: '2-digit' });

/** "How I'm feeling": a mood note carries one of these ids. */
const MOOD_TEXT: Record<string, string> = {
  stressed: 'I’m stressed',
  sad: 'I’m sad',
  tired: 'I’m tired',
  happy: 'I’m happy',
  grateful: 'I’m grateful',
};

/** The longest a title is let run before it is trimmed, on a word, with "…". */
const NOTIFY_TITLE_MAX = 90;

/** The first `n` characters, on a word boundary, with an ellipsis if cut. */
function notifyClip(text: string, n: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 15)).trim()}…`;
}

/** One tag per prayer per day, shared by its reminder and any nudge. */
function kharwaPrayerTag(day: string, prayer: string): string {
  return `kharwa-prayer-${day}-${prayer}`;
}

type NotifyPayload = { title: string; body: string; url: string; tag: string; renotify?: boolean; badge?: number };

type NotifyNote = {
  id?: number | null; type: string; body: string;
  ref?: { surah?: number; ayah?: number; ayah_to?: number; name?: string; book?: string; number?: number } | null;
  note?: string | null;
};

const Notify = {
  /** "Asr · 4:55 PM", or "Asr in 10 minutes · 4:55 PM". Opens Prayer. */
  reminder(label: string, time: Date, before: number, tag: string): NotifyPayload {
    const at = notifyClock.format(time);
    return {
      title: before ? `${label} in ${before} minutes · ${at}` : `${label} · ${at}`,
      body: '',
      url: '/#/prayer',
      tag,
      renotify: true,
    };
  },

  /** "Marwa nudged you to pray Isha". Opens Prayer. */
  nudge(sender: string, label: string, tag: string): NotifyPayload {
    return { title: `${sender} nudged you to pray ${label}`, body: '', url: '/#/prayer', tag, renotify: true };
  },

  /** A note in the Us tab, as one line. Opens Us, at the note when it has an id.
      "Marwa: I love you ❤️", "Marwa is feeling stressed",
      "Marwa: <note> (94:5–6)" or "Marwa shared an ayah (94:5–6)". */
  note(sender: string, m: NotifyNote, tag: string): NotifyPayload {
    const url = m.id ? `/#/us/${m.id}` : '/#/us';
    const line = (title: string) => ({ title: notifyClip(title, NOTIFY_TITLE_MAX), body: '', url, tag });

    if (m.type === 'text') return line(`${sender}: ${notifyClip(m.body, Math.max(30, NOTIFY_TITLE_MAX - sender.length - 2))}`);
    if (m.type === 'mood') {
      const word = (MOOD_TEXT[m.body] ?? '').replace(/^I’m /, '') || m.body;
      return line(`${sender} is feeling ${word}`);
    }
    const where = m.type === 'ayah'
      ? (m.ref?.ayah_to && m.ref.ayah_to !== m.ref.ayah
        ? `${m.ref?.surah}:${m.ref?.ayah}–${m.ref.ayah_to}`
        : `${m.ref?.surah}:${m.ref?.ayah}`)
      : `${m.ref?.name ?? 'Hadith'} ${m.ref?.number}`;
    const what = m.type === 'ayah' ? 'an ayah' : 'a hadith';
    if (!m.note) return line(`${sender} shared ${what} (${where})`);
    // the note is what gives way, so the reference always shows
    const room = Math.max(20, NOTIFY_TITLE_MAX - sender.length - where.length - 5);
    return line(`${sender}: ${notifyClip(m.note, room)} (${where})`);
  },
};
// <<< shared: notify

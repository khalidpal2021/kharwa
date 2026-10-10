// >>> shared: notify
// -----------------------------------------------------------------------------
// What every Kharwa notification says, in one place: prayer reminders,
// nudges and notes, real or test. This block is the same in send-reminders,
// send-nudge and send-message. Edit it in supabase/functions/_shared/notify.ts
// only, then run `node supabase/functions/sync-shared.mjs` to copy it into the
// three functions (`--check` fails if a copy has drifted). Each function stays
// one file, so it can still be pasted into the dashboard editor.
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

/** The first `n` characters, on a word boundary, with an ellipsis if cut. */
function notifyClip(text: string, n: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 15)).trim()}…`;
}

type NotifyPayload = { title: string; body: string; url: string; tag: string };

type NotifyNote = {
  id?: number | null; type: string; body: string;
  ref?: { surah?: number; ayah?: number; ayah_to?: number; name?: string; book?: string; number?: number } | null;
  note?: string | null;
};

const Notify = {
  /** "Asr · 4:55 PM" / "Time for Asr." (or "Asr in 10 minutes."). Opens Prayer. */
  reminder(label: string, time: Date, before: number, tag: string): NotifyPayload {
    return {
      title: `${label} · ${notifyClock.format(time)}`,
      body: before ? `${label} in ${before} minutes.` : `Time for ${label}.`,
      url: '/#/prayer',
      tag,
    };
  },

  /** "Khalid nudged you" / "Time to pray Isha 🤲". Opens Prayer. */
  nudge(sender: string, label: string, tag: string): NotifyPayload {
    return { title: `${sender} nudged you`, body: `Time to pray ${label} 🤲`, url: '/#/prayer', tag };
  },

  /** A note in the Us tab. Opens Us, at the note when it has an id. Small on
      purpose: the app loads the rest. */
  note(sender: string, m: NotifyNote, tag: string): NotifyPayload {
    const url = m.id ? `/#/us/${m.id}` : '/#/us';
    if (m.type === 'text') return { title: sender, body: notifyClip(m.body, 140), url, tag };
    if (m.type === 'mood') return { title: sender, body: MOOD_TEXT[m.body] ?? m.body, url, tag };
    const what = m.type === 'ayah' ? 'an ayah' : 'a hadith';
    const range = m.ref?.ayah_to && m.ref.ayah_to !== m.ref.ayah ? `${m.ref.ayah}–${m.ref.ayah_to}` : `${m.ref?.ayah}`;
    const where = m.type === 'ayah'
      ? `${m.ref?.name ?? 'Quran'} ${m.ref?.surah}:${range}`
      : `${m.ref?.name ?? 'Hadith'} ${m.ref?.number}`;
    return {
      title: m.note ? `${sender}: ${notifyClip(m.note, 60)}` : `${sender} shared ${what}`,
      body: `${notifyClip(m.body, 90)} (${where})`,
      url,
      tag,
    };
  },
};
// <<< shared: notify

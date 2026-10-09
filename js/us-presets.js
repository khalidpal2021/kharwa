/* ===========================================================================
   us-presets.js — "Ayahs for the moment", in the Us tab.

   Ayahs grouped by feeling, to send the right one quickly. Only references
   live here: the Arabic and the translation are always loaded from the
   Al-Quran Cloud API, the same as the Quran tab, never written into the
   source. `theme` is our own one-line summary of the ayah, so the list can be
   scanned; it is not a translation. A range (94:5–6) is sent as one card.

   `note` is the gentle default put in the note field when sending one from
   that mood; it can be edited or cleared. `feeling` marks the moods that
   have an "I'm …" chip, sent as a mood card the other can answer with an
   ayah.

   Ayahs added from the Quran tab ("+ Add to this mood") are kept in the
   us_presets table and shown after these.
   =========================================================================== */

const US_MOODS = [
  {
    id: 'stressed',
    label: 'Stressed',
    feeling: 'I’m stressed',
    note: 'For when it feels like too much 🤍',
    ayahs: [
      { s: 13, a: 28, theme: 'Hearts find rest in remembering Allah' },
      { s: 94, a: 5, to: 6, theme: 'With hardship comes ease' },
      { s: 2, a: 286, theme: 'No soul is burdened beyond what it can bear' },
      { s: 65, a: 3, theme: 'Whoever relies on Allah, He is enough for them' },
      { s: 3, a: 173, theme: 'Allah is sufficient for us, the best to rely on' },
    ],
  },
  {
    id: 'sad',
    label: 'Sad',
    feeling: 'I’m sad',
    note: 'Allah is close. So am I 🤍',
    ayahs: [
      { s: 93, a: 3, theme: 'Your Lord has not left you, nor is He displeased' },
      { s: 9, a: 40, theme: 'Do not grieve: Allah is with us' },
      { s: 12, a: 86, theme: 'Yaqub took his grief to Allah alone' },
      { s: 39, a: 53, theme: 'Never despair of Allah’s mercy' },
      { s: 2, a: 155, to: 157, theme: 'Good news for those who are patient when tested' },
    ],
  },
  {
    id: 'tired',
    label: 'Tired',
    feeling: 'I’m tired',
    note: 'Rest a little. You’re doing enough 🤍',
    ayahs: [
      { s: 2, a: 286, theme: 'No soul is burdened beyond what it can bear' },
      { s: 94, a: 5, to: 6, theme: 'With hardship comes ease' },
      { s: 65, a: 7, theme: 'After hardship, Allah will bring ease' },
      { s: 2, a: 153, theme: 'Seek help through patience and prayer' },
    ],
  },
  {
    id: 'afraid',
    label: 'Worried',
    note: 'You’re not alone in this 🤍',
    ayahs: [
      { s: 20, a: 46, theme: '“Do not fear, I am with you, hearing and seeing”' },
      { s: 2, a: 186, theme: 'Allah is near, and answers when called' },
      { s: 3, a: 139, theme: 'Do not lose heart, and do not grieve' },
    ],
  },
  {
    id: 'patience',
    label: 'Patience',
    note: 'Hold on. It’s coming 🤍',
    ayahs: [
      { s: 2, a: 153, theme: 'Allah is with those who are patient' },
      { s: 39, a: 10, theme: 'The patient are rewarded without measure' },
      { s: 16, a: 127, theme: 'Be patient: your patience is through Allah' },
    ],
  },
  {
    id: 'forgiveness',
    label: 'Forgiveness',
    note: 'His mercy is bigger 🤍',
    ayahs: [
      { s: 39, a: 53, theme: 'Allah forgives all sins: do not despair' },
      { s: 3, a: 135, theme: 'Those who remember Allah and ask forgiveness' },
      { s: 4, a: 110, theme: 'Ask forgiveness and find Allah forgiving' },
    ],
  },
  {
    id: 'decision',
    label: 'Deciding',
    note: 'Trust Him with it 🤍',
    ayahs: [
      { s: 2, a: 216, theme: 'What you dislike may be good for you' },
      { s: 65, a: 2, to: 3, theme: 'Allah makes a way out, and provides unexpectedly' },
    ],
  },
  {
    id: 'grateful',
    label: 'Grateful',
    note: 'Alhamdulillah, for this and for you 🤍',
    ayahs: [
      { s: 14, a: 7, theme: 'Be grateful, and Allah will give you more' },
      { s: 16, a: 18, theme: 'His favours are too many to count' },
      { s: 55, a: 13, theme: 'Which of your Lord’s favours would you deny?' },
    ],
  },
  {
    id: 'love',
    label: 'Love',
    note: 'This one is about us 🤍',
    ayahs: [
      { s: 30, a: 21, theme: 'Spouses made for tranquillity, love and mercy' },
      { s: 2, a: 187, theme: 'You are a garment for each other' },
      { s: 25, a: 74, theme: 'A prayer for spouses who are the comfort of our eyes' },
    ],
  },
];

const US_MOOD = Object.fromEntries(US_MOODS.map((m) => [m.id, m]));

/* ===========================================================================
   learn-content.js — the words and the pictures for the Learn section.

   FIQH: Hanafi throughout, since ISOT is Hanafi. Where another school commonly
   differs, the step carries a short `note`; the main instruction stays Hanafi.

   ===========================================================================
   TO REVIEW WITH IMAM
   ---------------------------------------------------------------------------
   Everything in LEARN_RECITATIONS below was written out here rather than
   fetched, so it is the part most worth checking. The Qur'anic text in the
   Learn section is NOT here: it is pulled from the same Al-Quran Cloud API the
   Quran tab uses, so it does not depend on this file being right.

   Please check with the imam:
     - the Arabic wording and vowelling of each recitation
     - the English meanings
     - the repetition counts
     - the madhhab notes on each position
     - the rak'ah breakdowns in LEARN_PRAYERS, especially which rak'ahs are
       aloud and which are silent
   ===========================================================================*/

const LEARN_DISCLAIMER =
  'Learning guide. Check with your local imam if you’re unsure about anything.';

/* --------------------------------------------------------- recitations --- */

const LEARN_RECITATIONS = {
  takbir: {
    label: 'Takbir',
    ar: 'اللَّهُ أَكْبَرُ',
    tr: 'Allāhu akbar',
    en: 'Allah is the Greatest.',
    times: 1,
  },

  thana: {
    label: 'Thana (opening praise)',
    ar: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلَا إِلَهَ غَيْرُكَ',
    tr: 'Subḥānaka-llāhumma wa bi-ḥamdika, wa tabāraka-smuka, wa taʿālā jadduka, wa lā ilāha ghayruk',
    en: 'Glory be to You, O Allah, and all praise is Yours. Blessed is Your name, and exalted is Your majesty. There is no god but You.',
    times: 1,
  },

  taawwudh: {
    label: 'Taʿawwudh (seeking refuge)',
    ar: 'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ',
    tr: 'Aʿūdhu bi-llāhi mina-sh-shayṭāni-r-rajīm',
    en: 'I seek refuge with Allah from Satan, the rejected.',
    times: 1,
    note: 'Said quietly, in the first rakʿah only.',
  },

  tasmiyah: {
    label: 'Tasmiyah (Bismillah)',
    ar: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
    tr: 'Bismi-llāhi-r-raḥmāni-r-raḥīm',
    en: 'In the name of Allah, the Most Gracious, the Most Merciful.',
    times: 1,
    note: 'Said quietly before Al-Fātiḥah in every rakʿah.',
  },

  rukuTasbih: {
    label: 'Tasbīḥ of rukūʿ',
    ar: 'سُبْحَانَ رَبِّيَ الْعَظِيمِ',
    tr: 'Subḥāna rabbiya-l-ʿaẓīm',
    en: 'Glory be to my Lord, the Most Great.',
    times: 3,
    note: 'Three times is the sunnah; more is good, in odd numbers.',
  },

  tasmi: {
    label: 'Tasmīʿ (rising)',
    ar: 'سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ',
    tr: 'Samiʿa-llāhu li-man ḥamidah',
    en: 'Allah hears the one who praises Him.',
    times: 1,
  },

  tahmid: {
    label: 'Taḥmīd (standing)',
    ar: 'رَبَّنَا لَكَ الْحَمْدُ',
    tr: 'Rabbanā laka-l-ḥamd',
    en: 'Our Lord, all praise is Yours.',
    times: 1,
  },

  sujoodTasbih: {
    label: 'Tasbīḥ of sujūd',
    ar: 'سُبْحَانَ رَبِّيَ الْأَعْلَى',
    tr: 'Subḥāna rabbiya-l-aʿlā',
    en: 'Glory be to my Lord, the Most High.',
    times: 3,
    note: 'Three times is the sunnah; more is good, in odd numbers.',
  },

  jalsaDua: {
    label: 'Between the two sajdahs',
    ar: 'رَبِّ اغْفِرْ لِي',
    tr: 'Rabbi-ghfir lī',
    en: 'My Lord, forgive me.',
    times: 1,
    note: 'Recommended, not required, in the Hanafi school.',
  },

  tashahhud: {
    label: 'Tashahhud',
    ar: 'التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ، السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ، السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',
    tr: 'At-taḥiyyātu li-llāhi wa-ṣ-ṣalawātu wa-ṭ-ṭayyibāt. As-salāmu ʿalayka ayyuha-n-nabiyyu wa raḥmatu-llāhi wa barakātuh. As-salāmu ʿalaynā wa ʿalā ʿibādi-llāhi-ṣ-ṣāliḥīn. Ash-hadu an lā ilāha illa-llāh, wa ash-hadu anna Muḥammadan ʿabduhū wa rasūluh',
    en: 'All greetings, prayers and good things are for Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings. Peace be upon us and upon the righteous servants of Allah. I bear witness that there is no god but Allah, and I bear witness that Muhammad is His servant and His Messenger.',
    times: 1,
    note: 'At "lā ilāha" the right index finger is raised, and lowered at "illa-llāh".',
  },

  salawat: {
    label: 'Ṣalawāt Ibrāhīmiyyah',
    ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ. اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ',
    tr: 'Allāhumma ṣalli ʿalā Muḥammadin wa ʿalā āli Muḥammad, kamā ṣallayta ʿalā Ibrāhīma wa ʿalā āli Ibrāhīm, innaka ḥamīdun majīd. Allāhumma bārik ʿalā Muḥammadin wa ʿalā āli Muḥammad, kamā bārakta ʿalā Ibrāhīma wa ʿalā āli Ibrāhīm, innaka ḥamīdun majīd',
    en: 'O Allah, send grace upon Muhammad and upon the family of Muhammad, as You sent grace upon Ibrahim and upon the family of Ibrahim. You are indeed Praiseworthy, Glorious. O Allah, bless Muhammad and the family of Muhammad, as You blessed Ibrahim and the family of Ibrahim. You are indeed Praiseworthy, Glorious.',
    times: 1,
    note: 'In the final sitting only.',
  },

  duaBeforeSalam: {
    label: 'Duʿā before the salām',
    ar: 'اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا، وَلَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ، فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ وَارْحَمْنِي، إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ',
    tr: 'Allāhumma innī ẓalamtu nafsī ẓulman kathīran, wa lā yaghfiru-dh-dhunūba illā ant, fa-ghfir lī maghfiratan min ʿindika wa-rḥamnī, innaka anta-l-ghafūru-r-raḥīm',
    en: 'O Allah, I have wronged myself greatly, and none forgives sins but You. So forgive me with forgiveness from You, and have mercy on me. You are indeed the Forgiving, the Merciful.',
    times: 1,
    note: 'Any duʿā may be made here. This one is commonly taught.',
  },

  salam: {
    label: 'Salām',
    ar: 'السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ',
    tr: 'As-salāmu ʿalaykum wa raḥmatu-llāh',
    en: 'Peace be upon you, and the mercy of Allah.',
    times: 2,
    note: 'Once turning the head to the right, once to the left.',
  },

  qunut: {
    label: 'Duʿā Qunūt (Witr)',
    ar: 'اللَّهُمَّ إِنَّا نَسْتَعِينُكَ وَنَسْتَغْفِرُكَ وَنُؤْمِنُ بِكَ وَنَتَوَكَّلُ عَلَيْكَ وَنُثْنِي عَلَيْكَ الْخَيْرَ، وَنَشْكُرُكَ وَلَا نَكْفُرُكَ، وَنَخْلَعُ وَنَتْرُكُ مَنْ يَفْجُرُكَ. اللَّهُمَّ إِيَّاكَ نَعْبُدُ وَلَكَ نُصَلِّي وَنَسْجُدُ، وَإِلَيْكَ نَسْعَى وَنَحْفِدُ، نَرْجُو رَحْمَتَكَ وَنَخْشَى عَذَابَكَ، إِنَّ عَذَابَكَ بِالْكُفَّارِ مُلْحِقٌ',
    tr: 'Allāhumma innā nastaʿīnuka wa nastaghfiruka wa nuʾminu bika wa natawakkalu ʿalayka wa nuthnī ʿalayka-l-khayr, wa nashkuruka wa lā nakfuruk, wa nakhlaʿu wa natruku man yafjuruk. Allāhumma iyyāka naʿbudu wa laka nuṣallī wa nasjud, wa ilayka nasʿā wa naḥfid, narjū raḥmataka wa nakhshā ʿadhābak, inna ʿadhābaka bi-l-kuffāri mulḥiq',
    en: 'O Allah, we seek Your help and Your forgiveness, we believe in You and rely on You, and we praise You well. We thank You and are not ungrateful to You, and we forsake and leave whoever disobeys You. O Allah, You alone we worship, and to You we pray and prostrate, and to You we strive and hasten. We hope for Your mercy and fear Your punishment. Your punishment will surely reach the disbelievers.',
    times: 1,
    note: 'In the third rakʿah of Witr, after the surah, before rukūʿ. A takbīr is said first, raising the hands.',
  },
};

/* --------------------------------------------------------------- surahs --- */

/* Short surahs commonly learnt first. The text is fetched from the Qur'an API
   by surah number — nothing of the Qur'an is written in this file. */
const LEARN_SURAHS = [
  { n: 1,   name: 'Al-Fātiḥah', meaning: 'The Opening',       ayahs: 7, note: 'In every rakʿah of every prayer.' },
  { n: 112, name: 'Al-Ikhlāṣ',  meaning: 'Sincerity',         ayahs: 4 },
  { n: 113, name: 'Al-Falaq',   meaning: 'The Daybreak',      ayahs: 5 },
  { n: 114, name: 'An-Nās',     meaning: 'Mankind',           ayahs: 6 },
  { n: 108, name: 'Al-Kawthar', meaning: 'Abundance',         ayahs: 3 },
  { n: 103, name: 'Al-ʿAṣr',    meaning: 'The Declining Day', ayahs: 3 },
];

/* ----------------------------------------------------------------- wudu --- */

const LEARN_WUDU = {
  steps: [
    { fig: 'hands',  title: 'Wash the hands',   times: 3, body: 'Up to and including the wrists, between the fingers.' },
    { fig: 'mouth',  title: 'Rinse the mouth',  times: 3, body: 'A handful of water each time, swirled around the mouth.' },
    { fig: 'nose',   title: 'Rinse the nose',   times: 3, body: 'Draw water into the nose with the right hand, blow it out with the left.' },
    { fig: 'face',   title: 'Wash the face',    times: 3, body: 'From the hairline to under the chin, and from ear to ear.' },
    { fig: 'arms',   title: 'Wash the arms',    times: 3, body: 'Right arm first, then the left, up to and including the elbows.' },
    { fig: 'head',   title: 'Wipe the head',    times: 1, body: 'With wet hands, over the head once. This is a wipe, not a wash.' },
    { fig: 'ears',   title: 'Wipe the ears',    times: 1, body: 'Index fingers inside, thumbs behind, with the same water as the head.' },
    { fig: 'feet',   title: 'Wash the feet',    times: 3, body: 'Right foot first, then the left, up to and including the ankles, between the toes.' },
  ],

  /* Hanafi. TO REVIEW WITH IMAM. */
  breaks: [
    'Using the toilet, or anything else leaving the body that way',
    'Passing wind',
    'Deep sleep lying down, or sleeping leaning on something',
    'Losing consciousness',
    'Vomiting a mouthful',
    'Blood or pus flowing from a wound far enough to run',
  ],

  note: 'Washing the face, arms, wiping the head and washing the feet are the obligatory parts. The rest is sunnah, and the order above is how it is normally done.',
};

/* ------------------------------------------------------------ positions --- */

/* `says` holds keys into LEARN_RECITATIONS. `surah: true` means Al-Fātiḥah and
   then a surah are recited here — their text comes from the Qur'an API. */
const LEARN_POSITIONS = [
  {
    id: 'takbir',
    name: 'Takbīr',
    sub: 'Opening the prayer',
    fig: 'takbir',
    body: [
      'Stand facing the qibla, feet about four fingers apart, eyes on the place of prostration.',
      'Raise both hands to the earlobes, palms forward, thumbs level with the lobes.',
      'Say the takbīr, then fold the hands.',
    ],
    note: 'Hanafi: hands to the earlobes. Shāfiʿī and Ḥanbalī raise them to the shoulders.',
    says: ['takbir'],
  },
  {
    id: 'qiyam',
    name: 'Qiyām',
    sub: 'Standing',
    fig: 'qiyam',
    body: [
      'Place the right hand over the left, below the navel.',
      'Keep the eyes on the place of prostration.',
      'Say the opening praise, then seek refuge, then Bismillah, then recite.',
    ],
    note: 'Hanafi: hands below the navel. Shāfiʿī and Ḥanbalī fold them on the chest; Mālikī commonly let them hang.',
    says: ['thana', 'taawwudh', 'tasmiyah'],
    surah: true,
  },
  {
    id: 'ruku',
    name: 'Rukūʿ',
    sub: 'Bowing',
    fig: 'ruku',
    body: [
      'Say the takbīr and bow.',
      'Grip the knees with the fingers spread, arms straight, back flat.',
      'Keep the head level with the back, eyes on the feet.',
    ],
    note: 'Hanafi: the hands are not raised going into rukūʿ. Shāfiʿī and Ḥanbalī raise them.',
    says: ['takbir', 'rukuTasbih'],
  },
  {
    id: 'qawmah',
    name: 'Qawmah',
    sub: 'Rising from rukūʿ',
    fig: 'standing',
    body: [
      'Rise until standing fully upright, arms at the sides.',
      'Be still here before going down; do not rush through it.',
    ],
    says: ['tasmi', 'tahmid'],
  },
  {
    id: 'sujood',
    name: 'Sujūd',
    sub: 'Prostration',
    fig: 'sujood',
    body: [
      'Say the takbīr and go down: knees first, then hands, then the nose and forehead.',
      'Seven parts touch the ground: the forehead with the nose, both palms, both knees, and the toes of both feet.',
      'Keep the arms off the ground and away from the sides, toes pointing towards the qibla.',
    ],
    says: ['takbir', 'sujoodTasbih'],
  },
  {
    id: 'jalsa',
    name: 'Jalsa',
    sub: 'Sitting between the two sajdahs',
    fig: 'jalsa',
    body: [
      'Say the takbīr and sit up on the left foot, laid flat.',
      'Keep the right foot upright, toes towards the qibla.',
      'Hands rest on the thighs, fingers towards the knees. Be still before the second sajdah.',
    ],
    says: ['takbir', 'jalsaDua'],
  },
  {
    id: 'sujood2',
    name: 'Second sajdah',
    sub: 'The second prostration',
    fig: 'sujood',
    body: [
      'Say the takbīr and prostrate a second time, exactly as the first.',
      'Rising from here begins the next rakʿah, or the sitting if the rakʿah was the second or the last.',
    ],
    says: ['takbir', 'sujoodTasbih'],
  },
  {
    id: 'tashahhud',
    name: 'Tashahhud',
    sub: 'The sitting',
    fig: 'tashahhud',
    body: [
      'Sit as you did between the sajdahs, hands on the thighs.',
      'At "lā ilāha" raise the right index finger, and lower it at "illa-llāh".',
      'In the final sitting, follow the tashahhud with the ṣalawāt and a duʿā.',
    ],
    says: ['tashahhud', 'salawat', 'duaBeforeSalam'],
  },
  {
    id: 'salam',
    name: 'Salām',
    sub: 'Closing the prayer',
    fig: 'salam',
    body: [
      'Turn the head to the right far enough to see the shoulder, and give salām.',
      'Turn to the left and give salām again. The prayer is complete.',
    ],
    says: ['salam'],
  },
];

/* ---------------------------------------------------------- how to pray --- */

/* "How to pray": one rakʿah, one step per screen. `does` is the single line
   of what to do; everything else about the step (the detail, the madhhab
   note) is in `more`, shown in the ⓘ. `says` holds keys into
   LEARN_RECITATIONS; `surah` is a surah number, or 'pick' for the one chosen
   from LEARN_SURAHS. Pray-along still walks LEARN_POSITIONS. */
const LEARN_STEPS = [
  {
    id: 'takbir', name: 'Takbīr', fig: 'takbir',
    does: 'Raise your hands to your earlobes, palms facing forward.',
    says: ['takbir'],
    more: [
      'Stand facing the qibla, feet about four fingers apart, eyes on the place of prostration.',
      'Thumbs level with the earlobes. Say the takbīr, then fold the hands.',
      'Hanafi: hands to the earlobes. Shāfiʿī and Ḥanbalī raise them to the shoulders.',
    ],
  },
  {
    id: 'thana', name: 'Thanāʾ', fig: 'qiyam',
    does: 'Fold your right hand over your left, below the navel, and praise Allah quietly.',
    says: ['thana'],
    more: [
      'Keep the eyes on the place of prostration.',
      'Said in the first rakʿah only.',
      'Hanafi: hands below the navel. Shāfiʿī and Ḥanbalī fold them on the chest; Mālikī commonly let them hang.',
    ],
  },
  {
    id: 'fatiha', name: 'Al-Fātiḥah', fig: 'qiyam',
    does: 'Seek refuge quietly, then recite Al-Fātiḥah.',
    says: ['taawwudh'],
    surah: 1,
    more: [
      'The taʿawwudh is said in the first rakʿah only; Bismillah is said quietly before Al-Fātiḥah in every rakʿah.',
      'Al-Fātiḥah is recited in every rakʿah of every prayer.',
      'After it, say “Āmīn” quietly.',
    ],
  },
  {
    id: 'surah', name: 'A short surah', fig: 'qiyam',
    does: 'In the first two rakʿahs, recite a short surah after Al-Fātiḥah.',
    surah: 'pick',
    more: [
      'In the third and fourth rakʿahs of a fard prayer, Al-Fātiḥah alone is enough.',
      'Any surah will do, or at least three short ayahs. These are the ones usually learnt first.',
    ],
  },
  {
    id: 'ruku', name: 'Rukūʿ', fig: 'ruku',
    does: 'Say the takbīr and bow, hands gripping your knees, back flat.',
    says: ['rukuTasbih'],
    more: [
      'Fingers spread, arms straight, the head level with the back, eyes on the feet.',
      'Three times is the sunnah; more is good, in odd numbers.',
      'Hanafi: the hands are not raised going into rukūʿ. Shāfiʿī and Ḥanbalī raise them.',
    ],
  },
  {
    id: 'qawmah', name: 'Rising', fig: 'standing',
    does: 'Stand up straight, arms at your sides, and be still for a moment.',
    says: ['tasmi', 'tahmid'],
    more: [
      'Samiʿa-llāhu li-man ḥamidah is said while rising; Rabbanā laka-l-ḥamd once standing.',
      'Be still here before going down; do not rush through it.',
    ],
  },
  {
    id: 'sujood', name: 'Sujūd', fig: 'sujood',
    does: 'Say the takbīr and go down: knees, then hands, then nose and forehead.',
    says: ['sujoodTasbih'],
    more: [
      'Seven parts touch the ground: the forehead with the nose, both palms, both knees, and the toes of both feet.',
      'Keep the arms off the ground and away from the sides, toes pointing towards the qibla.',
      'Three times is the sunnah; more is good, in odd numbers.',
    ],
  },
  {
    id: 'jalsa', name: 'Jalsa', fig: 'jalsa',
    does: 'Say the takbīr and sit up on your left foot, the right foot upright.',
    says: ['jalsaDua'],
    more: [
      'Hands rest on the thighs, fingers towards the knees. Be still before the second sajdah.',
      'The duʿā is recommended, not required, in the Hanafi school.',
    ],
  },
  {
    id: 'sujood2', name: 'Second sajdah', fig: 'sujood',
    does: 'Say the takbīr and prostrate again, exactly as before.',
    says: ['sujoodTasbih'],
    more: [
      'Rising from here begins the next rakʿah, or the sitting if the rakʿah was the second or the last.',
    ],
  },
  {
    id: 'tashahhud', name: 'Tashahhud', fig: 'tashahhud',
    does: 'Sit as in jalsa, and raise your right index finger at “lā ilāha”.',
    says: ['tashahhud'],
    more: [
      'Lower the finger again at “illa-llāh”.',
      'Said in every sitting: after the second rakʿah, and in the last.',
    ],
  },
  {
    id: 'salawat', name: 'Ṣalawāt', fig: 'tashahhud',
    does: 'In the last sitting, send blessings on the Prophet ﷺ.',
    says: ['salawat'],
    more: ['In the final sitting only. In a middle sitting, stand up after the tashahhud.'],
  },
  {
    id: 'dua', name: 'Duʿā', fig: 'tashahhud',
    does: 'Still sitting, ask Allah before you end the prayer.',
    says: ['duaBeforeSalam'],
    more: ['Any duʿā may be made here. This one is commonly taught.'],
  },
  {
    id: 'salam', name: 'Salām', fig: 'salam',
    does: 'Turn your head to the right and give salām, then to the left.',
    says: ['salam'],
    more: [
      'Turn far enough to see the shoulder. After the second salām the prayer is complete.',
    ],
  },
];

/* -------------------------------------------------------------- prayers --- */

/* Hanafi rakʿah structure. TO REVIEW WITH IMAM, especially aloud vs silent.
   Each unit: kind, rakʿahs, and per-rakʿah { surah, aloud, sit }. */
const LEARN_PRAYERS = {
  fajr: {
    name: 'Fajr',
    summary: '2 sunnah, then 2 fard.',
    units: [
      { kind: 'sunnah', label: '2 sunnah', stress: 'Strongly emphasised — rarely left.',
        rakahs: [{ surah: true, aloud: false }, { surah: true, aloud: false, sit: true }] },
      { kind: 'fard', label: '2 fard',
        rakahs: [{ surah: true, aloud: true }, { surah: true, aloud: true, sit: true }] },
    ],
  },
  dhuhr: {
    name: 'Dhuhr',
    summary: '4 sunnah, then 4 fard, then 2 sunnah.',
    units: [
      { kind: 'sunnah', label: '4 sunnah',
        rakahs: [{ surah: true }, { surah: true, sit: true }, { surah: true }, { surah: true, sit: true }] },
      { kind: 'fard', label: '4 fard',
        rakahs: [{ surah: true }, { surah: true, sit: true }, {}, { sit: true }] },
      { kind: 'sunnah', label: '2 sunnah',
        rakahs: [{ surah: true }, { surah: true, sit: true }] },
    ],
  },
  asr: {
    name: 'Asr',
    summary: '4 fard.',
    units: [
      { kind: 'fard', label: '4 fard',
        rakahs: [{ surah: true }, { surah: true, sit: true }, {}, { sit: true }] },
    ],
  },
  maghrib: {
    name: 'Maghrib',
    summary: '3 fard, then 2 sunnah.',
    units: [
      { kind: 'fard', label: '3 fard',
        rakahs: [{ surah: true, aloud: true }, { surah: true, aloud: true, sit: true }, { sit: true }] },
      { kind: 'sunnah', label: '2 sunnah',
        rakahs: [{ surah: true }, { surah: true, sit: true }] },
    ],
  },
  isha: {
    name: 'Isha',
    summary: '4 fard, then 2 sunnah, then 3 Witr.',
    units: [
      { kind: 'fard', label: '4 fard',
        rakahs: [{ surah: true, aloud: true }, { surah: true, aloud: true, sit: true }, {}, { sit: true }] },
      { kind: 'sunnah', label: '2 sunnah',
        rakahs: [{ surah: true }, { surah: true, sit: true }] },
      { kind: 'witr', label: '3 Witr', stress: 'Wājib in the Hanafi school — not to be left.',
        rakahs: [{ surah: true, aloud: true }, { surah: true, aloud: true, sit: true }, { surah: true, aloud: true, qunut: true, sit: true }] },
    ],
  },
};

/* ------------------------------------------------------------- pictures -- */

/* One picture per position, in assets/learn/, named by position so a photo
   can take the place of a drawing: save it under the same name (or change
   the extension here). Side on, facing the qibla to the left, so the right
   hand, the right foot and the right index finger are the ones in view.
   Salam is seen from the qibla instead, to show the head turning. */
/* Each picture's own size (its viewBox), so the page keeps its room while
   the picture is still loading. */
const LEARN_PICTURE_SIZE = {
  takbir: { w: 400, h: 300 }, qiyam: { w: 400, h: 300 }, ruku: { w: 400, h: 228 },
  standing: { w: 400, h: 300 }, sujood: { w: 400, h: 160 }, jalsa: { w: 400, h: 218 },
  tashahhud: { w: 400, h: 260 }, salam: { w: 400, h: 300 },
};

const LEARN_PICTURES = Object.fromEntries([
  ['takbir',    'Takbīr: hands raised beside the ears, palms towards the qibla, thumbs at the earlobes'],
  ['qiyam',     'Qiyām: standing, the right hand over the left below the navel'],
  ['ruku',      'Rukūʿ: back flat and level with the head, hands gripping the knees with the fingers spread'],
  ['standing',  'Qawmah: standing upright, arms at the sides'],
  ['sujood',    'Sujūd: forehead and nose on the ground, palms flat beside the head, elbows raised off the ground, toes bent towards the qibla'],
  ['jalsa',     'Jalsa: sitting on the left foot, the right foot upright, hands on the thighs'],
  ['tashahhud', 'Tashahhud: sitting as in jalsa, the right index finger raised'],
  ['salam',     'Salām: the head turned to the right, then to the left'],
].map(([id, alt]) => [id, { src: `assets/learn/${id}.svg`, alt, ...LEARN_PICTURE_SIZE[id] }]));

/* ------------------------------------------------------- wudu drawings -- */

/* Small line drawings for the wudu steps. The stroke colour comes from CSS;
   gold picks out the part of the body the step is about. */
const LEARN_FIGURES = {
  hands: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <path class="fig-line" d="M38 70 C38 52 46 44 54 44 L54 30 M54 44 C62 44 70 52 70 70 Z"/>
    <path class="fig-line" d="M58 44 L58 28 M64 46 L65 32"/>
    <path class="fig-gold" d="M46 24 L46 34 M54 18 L54 26 M62 22 L62 32"/>
  </svg>`,

  mouth: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <circle class="fig-line" cx="60" cy="50" r="24"/>
    <path class="fig-gold" d="M48 58 Q60 68 72 58"/>
  </svg>`,

  nose: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <path class="fig-line" d="M70 26 C58 26 50 36 50 48 C50 62 58 74 70 74"/>
    <path class="fig-gold" d="M50 46 L40 54 L50 58"/>
  </svg>`,

  face: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <ellipse class="fig-line" cx="60" cy="50" rx="20" ry="26"/>
    <path class="fig-gold" d="M40 34 L80 34 M40 66 L80 66"/>
  </svg>`,

  arms: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <path class="fig-line" d="M34 62 L62 40 L86 34"/>
    <path class="fig-line" d="M34 62 L40 70 L68 48"/>
    <path class="fig-gold" d="M62 40 L66 48"/>
  </svg>`,

  head: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <path class="fig-line" d="M38 62 A22 22 0 0 1 82 62"/>
    <path class="fig-gold" d="M36 54 C50 40 70 40 84 54"/>
  </svg>`,

  ears: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <circle class="fig-line" cx="60" cy="50" r="22"/>
    <path class="fig-gold" d="M72 42 C80 44 80 58 72 60"/>
    <path class="fig-gold" d="M48 42 C40 44 40 58 48 60"/>
  </svg>`,

  feet: `<svg viewBox="0 0 120 100" class="fig" aria-hidden="true" focusable="false">
    <path class="fig-line" d="M42 44 L42 68 C42 74 48 78 56 78 L74 78 C80 78 82 74 78 70 L54 54 L54 44 Z"/>
    <path class="fig-gold" d="M48 28 L48 38 M58 24 L58 34 M68 30 L68 40"/>
  </svg>`,
};

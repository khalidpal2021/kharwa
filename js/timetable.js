/* ===========================================================================
   timetable.js — official timetables from the Islamic Society of Tracy.
   Keyed "YYYY-MM", then day of month. Times are 24-hour "HH:MM", local to
   America/Los_Angeles. A month present here is used exactly as published;
   any other month falls back to the calculated times in times.js.
   =========================================================================== */

const TIMETABLE = {
  '2026-10': {
     1: { fajr: '05:50', sunrise: '07:02', dhuhr: '12:56', asr: '17:05', maghrib: '18:52', isha: '20:00' },
     2: { fajr: '05:51', sunrise: '07:02', dhuhr: '12:56', asr: '17:04', maghrib: '18:50', isha: '19:59' },
     3: { fajr: '05:51', sunrise: '07:03', dhuhr: '12:56', asr: '17:02', maghrib: '18:49', isha: '19:57' },
     4: { fajr: '05:52', sunrise: '07:04', dhuhr: '12:55', asr: '17:01', maghrib: '18:47', isha: '19:56' },
     5: { fajr: '05:53', sunrise: '07:05', dhuhr: '12:55', asr: '17:00', maghrib: '18:46', isha: '19:54' },
     6: { fajr: '05:54', sunrise: '07:06', dhuhr: '12:55', asr: '16:58', maghrib: '18:44', isha: '19:53' },
     7: { fajr: '05:55', sunrise: '07:07', dhuhr: '12:55', asr: '16:57', maghrib: '18:43', isha: '19:51' },
     8: { fajr: '05:56', sunrise: '07:08', dhuhr: '12:54', asr: '16:56', maghrib: '18:41', isha: '19:50' },
     9: { fajr: '05:57', sunrise: '07:09', dhuhr: '12:54', asr: '16:55', maghrib: '18:40', isha: '19:48' },
    10: { fajr: '05:58', sunrise: '07:10', dhuhr: '12:54', asr: '16:53', maghrib: '18:38', isha: '19:47' },
    11: { fajr: '05:59', sunrise: '07:11', dhuhr: '12:53', asr: '16:52', maghrib: '18:37', isha: '19:46' },
    12: { fajr: '06:00', sunrise: '07:12', dhuhr: '12:53', asr: '16:51', maghrib: '18:35', isha: '19:44' },
    13: { fajr: '06:00', sunrise: '07:12', dhuhr: '12:53', asr: '16:49', maghrib: '18:34', isha: '19:43' },
    14: { fajr: '06:01', sunrise: '07:13', dhuhr: '12:53', asr: '16:48', maghrib: '18:32', isha: '19:41' },
    15: { fajr: '06:02', sunrise: '07:14', dhuhr: '12:53', asr: '16:47', maghrib: '18:31', isha: '19:40' },
    16: { fajr: '06:03', sunrise: '07:15', dhuhr: '12:52', asr: '16:46', maghrib: '18:30', isha: '19:39' },
    17: { fajr: '06:04', sunrise: '07:16', dhuhr: '12:52', asr: '16:44', maghrib: '18:28', isha: '19:38' },
    18: { fajr: '06:05', sunrise: '07:17', dhuhr: '12:52', asr: '16:43', maghrib: '18:27', isha: '19:36' },
    19: { fajr: '06:06', sunrise: '07:18', dhuhr: '12:52', asr: '16:42', maghrib: '18:26', isha: '19:35' },
    20: { fajr: '06:07', sunrise: '07:19', dhuhr: '12:52', asr: '16:41', maghrib: '18:24', isha: '19:34' },
    21: { fajr: '06:08', sunrise: '07:20', dhuhr: '12:51', asr: '16:39', maghrib: '18:23', isha: '19:32' },
    22: { fajr: '06:09', sunrise: '07:21', dhuhr: '12:51', asr: '16:38', maghrib: '18:22', isha: '19:31' },
    23: { fajr: '06:10', sunrise: '07:22', dhuhr: '12:51', asr: '16:37', maghrib: '18:20', isha: '19:30' },
    24: { fajr: '06:10', sunrise: '07:23', dhuhr: '12:51', asr: '16:36', maghrib: '18:19', isha: '19:29' },
    25: { fajr: '06:11', sunrise: '07:24', dhuhr: '12:51', asr: '16:35', maghrib: '18:18', isha: '19:28' },
    26: { fajr: '06:12', sunrise: '07:25', dhuhr: '12:51', asr: '16:34', maghrib: '18:17', isha: '19:27' },
    27: { fajr: '06:13', sunrise: '07:26', dhuhr: '12:51', asr: '16:32', maghrib: '18:16', isha: '19:26' },
    28: { fajr: '06:14', sunrise: '07:27', dhuhr: '12:51', asr: '16:31', maghrib: '18:14', isha: '19:24' },
    29: { fajr: '06:15', sunrise: '07:28', dhuhr: '12:50', asr: '16:30', maghrib: '18:13', isha: '19:23' },
    30: { fajr: '06:16', sunrise: '07:29', dhuhr: '12:50', asr: '16:29', maghrib: '18:12', isha: '19:22' },
    31: { fajr: '06:17', sunrise: '07:30', dhuhr: '12:50', asr: '16:28', maghrib: '18:11', isha: '19:21' },
  },
};

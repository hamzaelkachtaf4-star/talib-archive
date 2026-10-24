// Calendar-date helpers on YYYY-MM-DD strings (no timezone math: the server decides "today" in Africa/Casablanca).
const UTC = (s) => Date.parse(`${s}T00:00:00Z`);
export const addDays = (s, n) => new Date(UTC(s) + n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = (s) => ((new Date(UTC(s)).getUTCDay() + 6) % 7) + 1; // 1 = Monday
export const mondayOf = (s) => addDays(s, 1 - weekdayOf(s));
export const todayCasablanca = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());

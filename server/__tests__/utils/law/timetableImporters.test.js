const I = require("../../../utils/law/timetable/importers");
const { toCandidates, toCandidate, normalizeTime, inferKind, stripKind } = I.candidate;
const { localDate, localTime } = require("../../../utils/law/time");

const ics = (events, extra = "") => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${extra}${events.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT\r\n`).join("")}END:VCALENDAR\r\n`;

describe("candidate rules", () => {
  const ok = { weekday: 2, startTime: "8h30", endTime: "10:00", subjectName: "  Droit   civil ", kind: "TD" };
  test("normalises times and text, keeps kind, defaults the rest", () => {
    expect(toCandidate(ok).slot).toMatchObject({ weekday: 2, startTime: "08:30", endTime: "10:00", subjectName: "Droit civil", kind: "TD", room: null, professor: null, groupLabel: null });
    expect(toCandidate({ ...ok, kind: "weird" }).slot.kind).toBe("amphi");
    expect(toCandidate({ ...ok, kind: "TP" }).slot.kind).toBe("TP");
  });
  test("each defect has its own code", () => {
    const code = (o) => toCandidate({ ...ok, ...o }).error;
    expect(code({ weekday: 0 })).toBe("invalid_weekday");
    expect(code({ weekday: 8 })).toBe("invalid_weekday");
    expect(code({ weekday: "x" })).toBe("invalid_weekday");
    expect(code({ startTime: "25:00" })).toBe("invalid_time");
    expect(code({ endTime: "" })).toBe("invalid_time");
    expect(code({ startTime: "11:00", endTime: "10:00" })).toBe("start_after_end");
    expect(code({ startTime: "10:00", endTime: "10:00" })).toBe("start_after_end");
    expect(code({ subjectName: "   " })).toBe("missing_subject");
    expect(code({ activeFrom: "2026-02-30" })).toBe("invalid_activeFrom");
    expect(code({ activeFrom: "2026-12-01", activeTo: "2026-11-01" })).toBe("range_reversed");
    expect(toCandidate(null).error).toBe("invalid_row");
  });
  test("duplicates collapse, order is weekday then time, junk is reported with its index, size is capped", () => {
    const r = toCandidates([ok, { ...ok }, { ...ok, weekday: 1 }, { ...ok, startTime: "99:99" }, "x"]);
    expect(r.slots.map((s) => s.weekday)).toEqual([1, 2]);
    expect(r.rejected).toEqual([{ index: 3, reason: "invalid_time" }, { index: 4, reason: "invalid_row" }]);
    const many = toCandidates(Array.from({ length: 150 }, (_, i) => ({ ...ok, subjectName: `م${i}` })), { max: 100 });
    expect(many.slots).toHaveLength(100);
    expect(many.truncated).toBe(true);
    expect(toCandidates(null)).toMatchObject({ slots: [], rejected: [] });
  });
  test("time, kind and title helpers", () => {
    expect(["8h30", "08:30", "8:30", "08.30", "14h", "9"].map(normalizeTime)).toEqual(["08:30", "08:30", "08:30", "08:30", "14:00", "09:00"]);
    expect([normalizeTime("24:00"), normalizeTime("8h61"), normalizeTime(""), normalizeTime("abc")]).toEqual([null, null, null, null]);
    expect(["Droit civil - TD", "TP Informatique", "أعمال موجهة", "Droit civil", "TDX"].map(inferKind)).toEqual(["TD", "TP", "TD", "amphi", "amphi"]);
    expect(stripKind("Droit civil - TD")).toBe("Droit civil");
    expect(stripKind("TD Droit civil")).toBe("Droit civil");
    expect(stripKind("القانون المدني أعمال موجهة")).toBe("القانون المدني");
  });
});

describe("ICS import", () => {
  test("a weekly event with BYDAY and UNTIL becomes one candidate per day, limited to its range", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Droit civil\\, S3\r\nDTSTART;TZID=Africa/Casablanca:20261012T083000\r\nDTEND;TZID=Africa/Casablanca:20261012T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z\r\nLOCATION:Amphi 3\r\nDESCRIPTION:Professeur: Dr. Alami"]) });
    expect(r.slots.map((s) => [s.weekday, s.startTime, s.endTime, s.subjectName, s.room, s.professor, s.activeFrom])).toEqual([[1, "08:30", "10:00", "Droit civil, S3", "Amphi 3", "Dr. Alami", "2026-10-12"], [3, "08:30", "10:00", "Droit civil, S3", "Amphi 3", "Dr. Alami", "2026-10-12"]]);
    expect(r.slots[0].activeTo).toBe("2026-12-31");
  });
  test("UTC times are converted with the zone rules, not a fixed offset", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Cours\r\nDTSTART:20261014T073000Z\r\nDTEND:20261014T090000Z"]) });
    const asUtc = new Date("2026-10-14T07:30:00Z");
    expect(r.slots[0].startTime).toBe(localTime(asUtc));
    expect(r.slots[0].activeFrom).toBe(localDate(asUtc));
  });
  test("another zone is converted to Casablanca local time", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Cours\r\nDTSTART;TZID=Europe/Paris:20261014T093000\r\nDTEND;TZID=Europe/Paris:20261014T110000"]) });
    const paris = new Date("2026-10-14T07:30:00Z"); // 09:30 CEST
    expect(r.slots[0].startTime).toBe(localTime(paris));
    expect(r.slots[0].endTime).toBe(localTime(new Date("2026-10-14T09:00:00Z")));
  });
  test("floating times are read as Casablanca local time; one-off events are limited to their day", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Soutenance\r\nDTSTART:20261014T140000\r\nDTEND:20261014T153000"]) });
    expect(r.slots[0]).toMatchObject({ weekday: 3, startTime: "14:00", endTime: "15:30", activeFrom: "2026-10-14", activeTo: "2026-10-14" });
  });
  test("COUNT bounds the range; kind is read from the title", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Procédure civile - TD\r\nDTSTART:20261014T080000\r\nDTEND:20261014T093000\r\nRRULE:FREQ=WEEKLY;COUNT=4"]) });
    expect(r.slots[0]).toMatchObject({ kind: "TD", subjectName: "Procédure civile", activeFrom: "2026-10-14", activeTo: "2026-11-10" });
  });
  test("folded lines are joined; unsupported recurrences become a single occurrence with a warning; all-day and broken events are reported", () => {
    const r = I.ics.parse({ content: ics([
      "SUMMARY:Un titre très\r\n  long\r\nDTSTART:20261014T080000\r\nDTEND:20261014T090000\r\nRRULE:FREQ=DAILY",
      "SUMMARY:Férié\r\nDTSTART;VALUE=DATE:20261015",
      "SUMMARY:Sans fin\r\nDTSTART:20261016T080000",
      "DTSTART:20261016T080000\r\nDTEND:20261016T090000",
    ]) });
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].subjectName).toBe("Un titre très long");
    expect(r.warnings).toContain("unsupported_recurrence");
    expect(r.rejected.map((x) => x.reason).sort()).toEqual(["all_day_event", "invalid_end", "missing_subject"]);
  });
  test("input checks", () => {
    expect(I.ics.parse({ content: "" }).error).toBe("empty_file");
    expect(I.ics.parse({ content: "hello" }).error).toBe("not_a_calendar");
    expect(I.ics.parse({ content: `BEGIN:VCALENDAR\n${"x".repeat(1024 * 1024 + 1)}` }).error).toBe("file_too_large");
    expect(I.ics.parse({ content: "BEGIN:VCALENDAR\nEND:VCALENDAR" })).toMatchObject({ slots: [], rejected: [] });
    expect(I.ics.parse({}).error).toBe("empty_file");
  });
  test("an event spanning midnight is refused rather than split", () => {
    const r = I.ics.parse({ content: ics(["SUMMARY:Nuit\r\nDTSTART:20261014T230000\r\nDTEND:20261015T010000"]) });
    expect(r.slots).toEqual([]);
    expect(r.rejected[0].reason).toBe("invalid_end");
  });
});

describe("CSV import", () => {
  test("French headers, semicolon delimiter, quoted fields, day names, kind from the title", () => {
    const csv = 'Jour;Début;Fin;Matière;Salle;Professeur;Groupe\nlundi;8h30;10h;"Droit civil; obligations";Amphi 3;Dr. Alami;G01\nMercredi;14:00;15:30;Procédure - TD;Salle 12;;G02\n';
    const r = I.csv.parse({ content: csv });
    expect(r.rejected).toEqual([]);
    expect(r.slots).toEqual([
      { weekday: 1, startTime: "08:30", endTime: "10:00", subjectName: "Droit civil; obligations", kind: "amphi", room: "Amphi 3", professor: "Dr. Alami", groupLabel: "G01", activeFrom: null, activeTo: null },
      { weekday: 3, startTime: "14:00", endTime: "15:30", subjectName: "Procédure", kind: "TD", room: "Salle 12", professor: null, groupLabel: "G02", activeFrom: null, activeTo: null },
    ]);
  });
  test("Arabic headers and day names, comma delimiter, BOM, CRLF", () => {
    const csv = '﻿اليوم,من,إلى,المادة,القاعة\r\nالاثنين,08:30,10:00,القانون المدني,مدرج 3\r\nالأربعاء,10:15,11:45,القانون الجنائي,\r\n';
    const r = I.csv.parse({ content: csv });
    expect(r.slots.map((s) => [s.weekday, s.subjectName, s.room])).toEqual([[1, "القانون المدني", "مدرج 3"], [3, "القانون الجنائي", null]]);
  });
  test("English headers, tab delimiter, numeric weekdays, a type column", () => {
    const r = I.csv.parse({ content: "day\tstart\tend\tsubject\ttype\n5\t09:00\t10:30\tCompany law\tTP\n" });
    expect(r.slots[0]).toMatchObject({ weekday: 5, kind: "TP", subjectName: "Company law" });
  });
  test("bad rows are reported by spreadsheet line and never guessed", () => {
    const csv = "day,start,end,subject\nfunday,08:30,10:00,A\nmonday,25:00,10:00,B\nmonday,11:00,10:00,C\nmonday,08:00,09:00,\ntuesday,08:00,09:00,Good\n";
    const r = I.csv.parse({ content: csv });
    expect(r.slots.map((s) => s.subjectName)).toEqual(["Good"]);
    expect(r.rejected).toEqual([{ line: 2, reason: "invalid_weekday" }, { line: 3, reason: "invalid_time" }, { line: 4, reason: "start_after_end" }, { line: 5, reason: "missing_subject" }]);
  });
  test("missing required columns are named; empty and oversize input are refused", () => {
    expect(I.csv.parse({ content: "day,start,subject\nmonday,08:00,A\n" })).toMatchObject({ error: "missing_columns", missing: ["end"] });
    expect(I.csv.parse({ content: "" }).error).toBe("empty_file");
    expect(I.csv.parse({ content: "day,start,end,subject\n" }).error).toBe("no_rows");
    expect(I.csv.parse({ content: `day,start,end,subject\n${"a,".repeat(300000)}` }).error).toBe("file_too_large");
  });
  test("escaped quotes and embedded newlines survive", () => {
    const r = I.csv.parse({ content: 'day,start,end,subject,room\nmonday,08:00,09:00,"Le ""Code"" civil",\n' });
    expect(r.slots[0].subjectName).toBe('Le "Code" civil');
    const multi = I.csv.splitRows('a,"b\nc",d\n1,2,3', ",");
    expect(multi).toEqual([["a", "b\nc", "d"], ["1", "2", "3"]]);
  });
  test("duplicate rows collapse", () => {
    const r = I.csv.parse({ content: "day,start,end,subject\nmonday,08:00,09:00,A\nMonday,08:00,09:00,A\nmonday,08:00,09:00,B\n" });
    expect(r.slots.map((s) => s.subjectName)).toEqual(["A", "B"]);
  });
});

describe("manual and adapters", () => {
  test("manual rows go through the same rules", () => {
    const r = I.manual.parse({ rows: [{ weekday: 1, startTime: "08:00", endTime: "09:00", subjectName: "A" }, { weekday: 9 }] });
    expect(r.slots).toHaveLength(1);
    expect(r.rejected).toEqual([{ index: 1, reason: "invalid_weekday" }]);
  });
  test("no importer scrapes a faculty site or takes a student login (the supported inputs are manual, CSV, ICS and photo)", () => {
    expect(Object.keys(I).sort()).toEqual(["candidate", "csv", "ics", "image", "manual"]);
  });
});

describe("hardening (critic findings)", () => {
  const ev = (lines) => ics([lines.join("\r\n")]);
  const base = ["SUMMARY:Droit civil", "DTSTART:20261014T080000", "DTEND:20261014T090000"];
  test("a hostile long subject is bounded and fast", () => {
    const t = Date.now();
    const r = I.ics.parse({ content: ev(["SUMMARY:" + "(TD ".repeat(20000), "DTSTART:20261014T080000", "DTEND:20261014T090000"]) });
    I.csv.parse({ content: "day,start,end,subject\nmonday,08:00,09:00," + "a ".repeat(100000) + "\n" });
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.slots.every((s) => s.subjectName.length <= 400)).toBe(true);
  });
  test("RRULE COUNT is clamped and BYDAY is case-insensitive", () => {
    const r = I.ics.parse({ content: ev([...base, "RRULE:FREQ=WEEKLY;COUNT=999999999;BYDAY=mo,we"]) });
    expect(r.slots.map((s) => s.weekday).sort()).toEqual([1, 3]);
    expect(r.slots[0].activeTo <= "2028-12-31").toBe(true);
  });
  test("an event with only invalid BYDAY is rejected by event number, and does not lose the others", () => {
    const r = I.ics.parse({ content: ics([[...base, "RRULE:FREQ=WEEKLY;BYDAY=XX"].join("\r\n"), base.join("\r\n")]) });
    expect(r.slots).toHaveLength(1);
    expect(r.rejected).toEqual([{ index: 0, event: 1, reason: "invalid_recurrence" }]);
  });
  test("quoted TZID is understood; other zones, EXDATE and overrides are warned about", () => {
    const r = I.ics.parse({ content: ev(["SUMMARY:A", 'DTSTART;TZID="Europe/Paris":20261014T080000', 'DTEND;TZID="Europe/Paris":20261014T090000', "RRULE:FREQ=WEEKLY", "EXDATE:20261021T080000"]) });
    expect(r.warnings).toEqual(expect.arrayContaining(["times_follow_first_week", "exdate_ignored"]));
    const o = I.ics.parse({ content: ev([...base, "RECURRENCE-ID:20261014T080000"]) });
    expect(o.slots).toHaveLength(0);
    expect(o.warnings).toContain("override_ignored");
    const u = I.ics.parse({ content: ev(["SUMMARY:A", "DTSTART;TZID=Nowhere/Land:20261014T080000", "DTEND;TZID=Nowhere/Land:20261014T090000"]) });
    expect(u.warnings).toContain("unknown_timezone");
  });
  test("CSV rejections carry the real file line", () => {
    const r = I.csv.parse({ content: 'day,start,end,subject\n\n\nfoo,1,2,x\nmonday,08:00,09:00,"a\nb"\nbar,1,2,y\n' });
    expect(r.rejected.map((x) => x.line)).toEqual([4, 7]);
  });
});

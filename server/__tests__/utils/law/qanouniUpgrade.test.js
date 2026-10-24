// Pure pieces of the Qanouni upgrade: password policy (server and the frontend mirror agree), XP levels,
// timetable parsing helpers, static asset caching / pre-compression, and the compression filter.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkPassword } = require("../../../utils/law/passwordPolicy");
const { LawProgress } = require("../../../models/lawProgress");
const { normalizeTime, cleanSlots, matchSubject, imagePart } = require("../../../utils/law/timetableParse");
const { cacheControlFor, pickEncoding, precompressed } = require("../../../utils/law/staticAssets");
const { shouldCompress } = require("../../../utils/law/compressionMiddleware");

describe("password policy", () => {
  test.each([
    ["Motdepasse-1", []],
    ["Ab1!", ["length"]],
    ["abcdefg1!", ["upper"]],
    ["ABCDEFG1!", ["lower"]],
    ["Abcdefgh!", ["digit"]],
    ["Abcdefgh1", ["special"]],
    [`Aa1!${"x".repeat(61)}`, ["length"]],
    ["", ["length", "upper", "lower", "digit", "special"]],
  ])("%s", (pw, failed) => {
    expect(checkPassword(pw).failed).toEqual(failed);
  });

  test("the frontend checklist uses the same rules", async () => {
    const file = path.resolve(__dirname, "../../../../frontend/src/components/LawOS/lib/passwordPolicy.js");
    const src = fs.readFileSync(file, "utf8").replace(/export /g, "");
    // eslint-disable-next-line no-new-func
    const front = new Function(`${src}; return checkPassword;`)();
    for (const pw of ["Motdepasse-1", "Ab1!", "abcdefg1!", "ABCDEFG1!", "Abcdefgh!", "Abcdefgh1", "", `Aa1!${"x".repeat(61)}`, "Ünïcødé-Pass1"])
      expect(front(pw).failed).toEqual(checkPassword(pw).failed);
  });
});

describe("levels", () => {
  test.each([
    [0, 1],
    [200, 1],
    [201, 2],
    [500, 2],
    [501, 3],
    [1000, 3],
    [1001, 4],
    [2500, 4],
    [2501, 5],
    [5000, 5],
    [5001, 6],
  ])("%i XP → level %i", (xp, level) => {
    expect(LawProgress.levelFor(xp).level).toBe(level);
  });

  test("progress toward the next level", () => {
    expect(LawProgress.levelFor(350)).toMatchObject({ min: 201, next: 501, title: "ممارس واعد" });
    expect(LawProgress.levelFor(350).progress).toBeCloseTo(149 / 300);
    expect(LawProgress.levelFor(6000).title).toBe("قاضي / محام مقيد بالجدول");
  });

  test("day start instant is local midnight", () => {
    const { localDate } = require("../../../utils/law/time");
    const t = LawProgress.dayStartInstant("2026-10-12");
    expect(localDate(t)).toBe("2026-10-12");
    expect(localDate(new Date(t.getTime() - 1))).toBe("2026-10-11");
  });
});

describe("timetable parsing helpers", () => {
  test("times", () => {
    expect(["8h30", "8:30", "08.30", "14h", "14H00", " 9 h 05 ", "25:00", "8h75", "abc"].map(normalizeTime)).toEqual([
      "08:30",
      "08:30",
      "08:30",
      "14:00",
      "14:00",
      "09:05",
      null,
      null,
      null,
    ]);
  });

  test("subject matching is exact first, then unambiguous partial", () => {
    const subjects = [
      { id: "a", name: "القانون المدني", nameFr: "Droit civil" },
      { id: "b", name: "القانون الجنائي", nameFr: "Droit pénal général" },
      { id: "c", name: "المسطرة المدنية", nameFr: "Procédure civile" },
    ];
    expect(matchSubject("DROIT CIVIL", subjects)?.id).toBe("a");
    expect(matchSubject("القانون المدنى", subjects)?.id).toBe("a"); // ى / ي normalised
    expect(matchSubject("Droit pénal", subjects)?.id).toBe("b");
    expect(matchSubject("Droit", subjects)).toBeNull();
    expect(matchSubject("", subjects)).toBeNull();
  });

  test("invalid and duplicate slots are dropped, at most 50", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({
      weekday: (i % 6) + 1,
      startTime: `${8 + (i % 10)}:00`,
      endTime: `${9 + (i % 10)}:00`,
      subjectName: `S${i}`,
    }));
    expect(cleanSlots(raw, [])).toHaveLength(50);
    expect(cleanSlots([{ weekday: 0, startTime: "8h", endTime: "9h", subjectName: "x" }], [])).toEqual([]);
    expect(cleanSlots("nope", [])).toEqual([]);
  });

  test("images: type and size checks", () => {
    expect(imagePart("data:image/png;base64,iVBORw0KGgo=").part.inlineData.mimeType).toBe("image/png");
    expect(imagePart("aGVsbG8=", "image/jpeg").part.inlineData.data).toBe("aGVsbG8=");
    expect(imagePart("data:application/pdf;base64,JVBE").error).toBe("unsupported_image");
    expect(imagePart("<script>", "image/jpeg").error).toBe("invalid_image");
    expect(imagePart("A".repeat(12 * 1024 * 1024), "image/jpeg").error).toBe("image_too_large");
  });
});

describe("static delivery", () => {
  test("cache policy", () => {
    expect(cacheControlFor("/assets/Today-1a2b3c.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlFor("/index.js")).toBe("no-cache");
    expect(cacheControlFor("/lawos-sw.js")).toBe("no-cache");
    expect(cacheControlFor("/manifest.json")).toBe("no-cache");
    expect(cacheControlFor("/lawos/icons/icon-192.png")).toBe("public, max-age=86400");
  });

  test("encoding negotiation", () => {
    expect(pickEncoding("gzip, deflate, br")).toEqual(["br", ".br"]);
    expect(pickEncoding("gzip")).toEqual(["gzip", ".gz"]);
    expect(pickEncoding("identity")).toBeNull();
    expect(pickEncoding(undefined)).toBeNull();
  });

  test("serves the .br sibling, refuses path traversal, falls through otherwise", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-static-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets/app-1.js"), "x");
    fs.writeFileSync(path.join(dir, "assets/app-1.js.br"), "BR");
    const mw = precompressed(dir);
    const run = (url, enc = "br") =>
      new Promise((resolve) => {
        const headers = {};
        const res = {
          setHeader: (k, v) => (headers[k.toLowerCase()] = v),
          sendFile: (file) => resolve({ file, headers }),
        };
        mw({ method: "GET", path: url, headers: { "accept-encoding": enc } }, res, () => resolve({ next: true }));
      });
    const hit = await run("/assets/app-1.js");
    expect(hit.file).toBe(path.join(dir, "assets/app-1.js.br"));
    expect(hit.headers).toMatchObject({
      "content-encoding": "br",
      "content-type": "application/javascript; charset=UTF-8",
      "cache-control": "public, max-age=31536000, immutable",
      vary: "Accept-Encoding",
    });
    expect(await run("/assets/app-1.js", "gzip")).toEqual({ next: true }); // no .gz written
    expect(await run("/assets/../../etc/passwd.js")).toEqual({ next: true });
    expect(await run("/assets/missing.js")).toEqual({ next: true });
    expect(await run("/logo.png")).toEqual({ next: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("server-sent events are never compressed", () => {
    const res = (type) => ({ getHeader: () => type });
    expect(shouldCompress({ headers: {} }, res("text/event-stream"))).toBe(false);
    expect(shouldCompress({ headers: { accept: "text/event-stream" } }, res("application/json"))).toBe(false);
    expect(shouldCompress({ headers: {} }, res("application/json"))).toBe(true);
  });
});

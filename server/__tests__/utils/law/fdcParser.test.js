// Parser tests against real 2026-27 Automne PDFs from www.fdc.ma (fixtures in __tests__/fixtures/fdc).
const fs = require("fs");
const path = require("path");
const { parseFdcPdf, parseFdcText, inferMeta, isLawFile, splitSubjectProfessor, normalizeArabic } = require("../../../utils/law/timetable/parseFdcPdf");
const { listLawPdfs } = require("../../../utils/law/timetable/fetchSources");
const { parseTimetableCsv } = require("../../../utils/law/timetable/csv");

const fx = (n) => fs.readFileSync(path.join(__dirname, "../../fixtures/fdc", n));

describe("FDC PDF parser", () => {
  test("S3 Droit privé (arabe): 3 groups x 7 courses, exact first rows", async () => {
    const { rows, rejected } = await parseFdcPdf(fx("s3_prive_ar.pdf"), inferMeta("SEMESTRE 3 DROIT PRIVE  EN ARABE.pdf"));
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(21);
    expect(rows[0]).toEqual({ semester: "S3", track: "PRIVE", language: "AR", parcours: "", groupCode: "G01", dayOfWeek: 1, startTime: "11:00", endTime: "13:15", subject: "القانون الجنائي الخاص", kind: "COURS", room: "2", professor: "ELYOUSFI" });
    // room edge cases: letter suffix, multi-token, and the last row has no footer text glued on
    expect(rows[2]).toMatchObject({ subject: "النشاط الإداري", startTime: "16:00", endTime: "18:15", room: "1C", professor: "KHARRAT MIMOUN" });
    expect(rows[4]).toMatchObject({ dayOfWeek: 3, room: "500 B" });
    expect(rows[6].room).toBe("SALLES 600 / 700");
    expect(rows.at(-1).room).toBe("14");
    for (const g of ["G01", "G02", "G03"]) expect(rows.filter((r) => r.groupCode === g)).toHaveLength(7);
    // Persian yeh / heh forms from the PDF are normalized to standard Arabic
    expect(rows.every((r) => !/[یھ]/.test(r.subject))).toBe(true);
    expect(rows.find((r) => r.subject.includes("المسؤولية"))).toBeTruthy();
  });

  test("French section: Latin subjects split from upper-case professors", async () => {
    const { rows } = await parseFdcPdf(fx("s3_prive_fr.pdf"), inferMeta("SEMESTRE 3 DROIT PRIVE  EN FRANCAIS.pdf"));
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ language: "FR", subject: "Droit pénal spécial", professor: "AZDDOU", room: "SALLE 02", dayOfWeek: 2 });
    expect(rows[5]).toMatchObject({ subject: "Finances publiques", professor: "ABOULHOUDA WIAM", room: "6B", dayOfWeek: 5 });
  });

  test("S1 Droit public: row whose label and subject sit on different lines", async () => {
    const { rows } = await parseFdcPdf(fx("s1_public_ar.pdf"), inferMeta("SEMESTRE 1 DROIT PUBLIC  EN ARABE.pdf"));
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.subject === "المدخل لعلم السياسة")).toMatchObject({ professor: "MOUQTADER", room: "6A", dayOfWeek: 4 });
    expect(rows.find((r) => r.professor === "ZAHROU/ADLI OTHMAN")).toBeTruthy();
  });

  test("S5 parcours variants are kept apart; non-slot times survive", async () => {
    const { rows } = await parseFdcPdf(fx("s5_prive_ar.pdf"), inferMeta("SEMESTRE 5 DROIT PRIVE EN ARABE.pdf"));
    expect(new Set(rows.map((r) => r.parcours))).toEqual(new Set(["CARR JURID", "DRT AFF"]));
    expect(rows.find((r) => r.subject === "قانون صعوبات المقاولة")).toMatchObject({ startTime: "14:30", endTime: "16:30", room: "3" });
  });

  test("an unsupported layout yields no rows and a reason, never guesses", async () => {
    const out = await parseFdcPdf(fx("s1_methodo.pdf"), {});
    expect(out.rows).toEqual([]);
    expect(out.reason).toMatch(/CSV/);
  });

  test("split rows are counted, not silently dropped", () => {
    const text = "SEMESTRE 3 TC DROIT PRIVE ARABEالقانون الجنائيELYOUSFIG01LUNDI11H-13H152\nالمالية العامةACHEHBARG01JEUDI13H30-15H4514\n";
    const { rows, rejected } = parseFdcText(text, { track: "PRIVE", language: "AR" });
    expect(rows).toHaveLength(1);
    expect(rejected.join(" ")).toMatch(/1 timetable line\(s\) could not be attached/);
  });

  test("economics/management rows are filtered out (allowlist)", () => {
    const text = "SEMESTRE 3 TC ECONOMIE ARABEالاقتصادELYOUSFIG01LUNDI11H-13H152\n";
    expect(parseFdcText(text, {}).rows).toEqual([]);
    expect(isLawFile("SEMESTRE 3 ECONOMIE.pdf")).toBe(false);
    expect(isLawFile("SEMESTRE 1 BUSINESS ADMINISTRATION.pdf")).toBe(false);
    expect(isLawFile("SEMESTRE 3 DROIT PRIVE  EN ARABE.pdf")).toBe(true);
    expect(inferMeta("SEMESTRE 1 DROIT PUBLIC EN FRANCAIS.pdf")).toEqual({ semester: "S1", track: "PUBLIC", language: "FR" });
  });

  test("helpers", () => {
    expect(splitSubjectProfessor("Droit socialMONJID")).toEqual({ subject: "Droit social", professor: "MONJID" });
    expect(splitSubjectProfessor("المحاسبة")).toEqual({ subject: "المحاسبة", professor: null });
    expect(normalizeArabic("منھجیة")).toBe("منهجية");
  });
});

describe("index scraping", () => {
  test("lists only the season's law PDFs (no economics, no management, no business)", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../fixtures/fdc/index-automne.html"), "utf8");
    const urls = listLawPdfs(html, "https://www.fdc.ma/FDC/emploiFDC/emplois_temps.php", "AUTOMNE");
    expect(urls.length).toBeGreaterThanOrEqual(10);
    expect(urls.every((u) => /DROIT/i.test(decodeURIComponent(u)))).toBe(true);
    expect(urls.some((u) => /ECON|GESTION|BUSINESS/i.test(u))).toBe(false);
    expect(urls[0]).toMatch(/^https:\/\/www\.fdc\.ma\/FDC\/emploiFDC\/Emp\/2026-2027\/Automne26\//);
    expect(listLawPdfs(html, "https://www.fdc.ma/x.php", "PRINTEMPS")).toEqual([]);
  });
});

describe("CSV import grammar", () => {
  const H = "semester,track,language,groupCode,dayOfWeek,startTime,endTime,subject,kind,room,professor\n";
  test("valid rows, quotes and CRLF", () => {
    const r = parseTimetableCsv(H.replace("\n", "\r\n") + 'S3,PRIVE,AR,G01,1,08:30,10:45,"قانون, الأسرة",COURS,"A ""1""",BOUCHRIKA\r\n');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ subject: "قانون, الأسرة", room: 'A "1"', parcours: "" });
  });
  test.each([
    ["S9,PRIVE,AR,G01,1,08:30,10:45,x,COURS,,", "invalid_semester"],
    ["S3,PRIVE,AR,G1,1,08:30,10:45,x,COURS,,", "invalid_groupCode"],
    ["S3,PRIVE,AR,G01,8,08:30,10:45,x,COURS,,", "invalid_dayOfWeek"],
    ["S3,PRIVE,AR,G01,1,8:30,10:45,x,COURS,,", "invalid_startTime"],
    ["S3,PRIVE,AR,G01,1,10:45,08:30,x,COURS,,", "invalid_endTime"],
    ["S3,PRIVE,AR,G01,1,08:30,10:45,,COURS,,", "invalid_subject"],
    ["S3,PRIVE,AR,G01,1,08:30,10:45,x,LAB,,", "invalid_kind"],
  ])("rejects %s", (line, err) => {
    expect(parseTimetableCsv(H + line + "\n").errors).toEqual([{ line: 2, error: err }]);
  });
  test("one bad line rejects the file; missing columns and empty input are reported", () => {
    expect(parseTimetableCsv(H + "S3,PRIVE,AR,G01,1,08:30,10:45,x,COURS,,\nS9,PRIVE,AR,G01,1,08:30,10:45,x,COURS,,\n").rows).toBeUndefined();
    expect(parseTimetableCsv("a,b\n1,2\n").errors[0].error).toMatch(/^missing_columns/);
    expect(parseTimetableCsv("").errors[0].error).toBe("empty_file");
  });
});

// Old exact routes -> new hub routes. Old APKs and shared links keep working. Deep routes
// (/law/subjects/:id, /law/hub/notes/:id, ...) keep working too, so only exact paths are listed here.
export const LEGACY_REDIRECTS = [
  ["subjects", "/law/path"],
  ["method", "/law/path"],
  ["review", "/law/exam"],
  ["review/weak-spots", "/law/exam/weak-spots"],
  ["schedule", "/law/timetable"],
  ["today/timetable", "/law/timetable"],
  ["squad", "/law/community/squads"],
  ["hub", "/law/community/hub"],
  ["corpus", "/law/library/corpus"],
  ["library/courses", "/law/path/courses"],
];

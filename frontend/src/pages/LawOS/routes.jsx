import { Navigate, useParams } from "react-router-dom";
import RouteError from "@/components/LawOS/RouteError";
import { i18nReady, dictPrefetcher } from "@/components/LawOS/lib/i18n";
import { LEGACY_REDIRECTS } from "@/navigation/legacyRedirects";

// LAW-OS route table, spread into the upstream router in main.jsx (one touchpoint).
// Every page is its own lazy chunk; `lawPrefetchers` lets the shell pull them all into the
// service-worker cache so every tab works offline.

// LAW-OS owns "/" unless the build explicitly opts out (VITE_LAWOS_HIDE_UPSTREAM=false).
export const lawosOwnsHome =
  import.meta.env.VITE_LAWOS_HIDE_UPSTREAM !== "false";

const pages = {
  today: () => import("./Today"),
  timetable: () => import("./Timetable"),
  notifications: () => import("./Notifications"),
  welcome: () => import("./Welcome"),
  path: () => import("./Path"),
  "path/m/:id": () => import("./ModulePath"),
  "path/subjects": () => import("./Subjects"),
  "path/modules/:id/print": () => import("./PathPrint"),
  library: () => import("./Library"),
  "library/corpus": () => import("./Corpus"),
  "library/graph": () => import("./LegalGraph"),
  "path/courses": () => import("./Courses"),
  "path/courses/:id": () => import("./Course"),
  "library/chat": () => import("./Chat"),
  community: () => import("./Community"),
  "community/hub": () => import("./Hub"),
  "community/friends": () => import("./Friends"),
  "community/hub/requests": () => import("./HubRequests"),
  "community/hub/requests/:id": () => import("./ChangeRequest"),
  "admin/moderation": () => import("./ModerationQueue"),
  "community/squads": () => import("./Squad"),
  "community/campus": () => import("./Campus"),
  "community/campus/:id": () => import("./Campus"),
  "squad/docs": () => import("./SquadDocs"),
  "squad/docs/:id": () => import("./SquadDoc"),
  "squad/change-requests/:id": () => import("./SquadChangeRequest"),
  "subjects/:id": () => import("./SubjectView"),
  capture: () => import("./Capture"),
  "method/attempt/:id": () => import("./CaseAttempt"),
  "method/dissertation/:id": () => import("./DissertationEditor"),
  exam: () => import("./ExamCenter"),
  "exam/cards": () => import("./Review"),
  "exam/weak-spots": () => import("./WeakSpots"),
  memory: () => import("./Memory"),
  "admin/corrections": () => import("./AdminCorrections"),
  "admin/concepts": () => import("./AdminConcepts"),
  settings: () => import("./Settings"),
  profile: () => import("./Profile"),
  "qr/:token": () => import("./QrApprove"),
  legal: () => import("./Legal"),
  "squad/w/:id": () => import("./SquadWorkspace"),
  "squad/w/:workspaceId/new": () => import("./SquadNote"),
  "squad/notes/:id": () => import("./SquadNote"),
  "hub/notes/:id": () => import("./HubNote"),
  "u/:userId": () => import("./StudentProfile"),
  recap: () => import("./Recap"),
  "corpus/a/:canonicalId": () => import("./CorpusArticle"),
  "corpus/import/:id": () => import("./CorpusImportReview"),
};

/** Old links to a course (/law/library/courses/:id) keep working: the notebooks live under the study path now. */
function CourseRedirect() {
  const { id } = useParams();
  return <Navigate to={`/law/path/courses/${encodeURIComponent(id)}`} replace />;
}

export const lawPrefetchers = [...Object.values(pages), ...(dictPrefetcher ? [dictPrefetcher] : [])];

export const lawRoute = {
  path: "/law",
  errorElement: <RouteError />,
  lazy: async () => {
    await i18nReady;
    const { default: LawOSLayout } = await import("./index");
    return { element: <LawOSLayout /> };
  },
  children: [
    { index: true, element: <Navigate to="today" replace /> },
    ...LEGACY_REDIRECTS.map(([from, to]) => ({ path: from, element: <Navigate to={to} replace /> })),
    { path: "library/courses/:id", element: <CourseRedirect /> },
    ...Object.entries(pages).map(([path, load]) => ({
      path,
      lazy: async () => {
        await i18nReady;
        return { Component: (await load()).default };
      },
    })),
    { path: "*", element: <Navigate to="today" replace /> },
  ],
};

// Public Qanouni screens (outside the /law guard). Spread into the upstream router next to lawRoute.
export const lawAuthRoutes = [
  ["/portal", () => import("./Portal")],
  ["/law/portal", () => import("./Portal")],
  ["/law/login", () => import("./Login")],
  ["/law/register", () => import("./Register")],
  ["/law/setup", () => import("./Setup")],
  ["/law/forgot", () => import("./Forgot")],
].map(([path, load]) => ({
  path,
  errorElement: <RouteError />,
  lazy: async () => {
    await i18nReady;
    return { Component: (await load()).default };
  },
}));

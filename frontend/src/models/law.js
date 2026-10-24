import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

// Client for /api/law. Every call resolves (never throws) so offline screens can render.
async function call(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(`${API_BASE}/law${path}`, {
      method,
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, offline: false };
  } catch {
    return { ok: false, status: 0, data: null, offline: true };
  }
}

const qs = (params = {}) => {
  const p = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  ).toString();
  return p ? `?${p}` : "";
};

/** Uploads a chat attachment as raw bytes (Content-Type = the file's mime); resolves like call(). */
async function uploadChatAttachment(file) {
  try {
    const res = await fetch(`${API_BASE}/law/chat/attachments`, { method: "POST", headers: { ...baseHeaders(), "Content-Type": file.type }, body: file });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null), offline: false };
  } catch {
    return { ok: false, status: 0, data: null, offline: true };
  }
}

const Law = {
  uploadChatAttachment,
  // Qanouni accounts
  authConfig: () => call("/auth/config"),
  setup: (body) => call("/auth/setup", { method: "POST", body }),
  register: (body) => call("/auth/register", { method: "POST", body }),
  verifyRegistration: (body) =>
    call("/auth/register/verify", { method: "POST", body }),
  resendRegistration: (email) =>
    call("/auth/register/resend", { method: "POST", body: { email } }),
  forgotPassword: (email) =>
    call("/auth/password/forgot", { method: "POST", body: { email } }),
  resetPassword: (body) =>
    call("/auth/password/reset", { method: "POST", body }),
  qrGenerate: () =>
    call("/auth/qr/generate", {
      method: "POST",
      body: { origin: window.location.origin },
    }),
  qrStatus: async (qrToken, pollSecret) => {
    // The poll secret goes in a header (never in the URL or logs).
    try {
      const res = await fetch(`${API_BASE}/law/auth/qr/status/${qrToken}`, {
        headers: { "x-qr-secret": pollSecret },
      });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => null), offline: false };
    } catch {
      return { ok: false, status: 0, data: null, offline: true };
    }
  },
  qrInspect: (qrToken) =>
    call("/auth/qr/inspect", { method: "POST", body: { qrToken } }),
  qrAuthorize: (qrToken, approve = true) =>
    call("/auth/qr/authorize", { method: "POST", body: { qrToken, approve } }),

  consent: () => call("/auth/consent"),
  acceptConsent: (body) => call("/auth/consent", { method: "POST", body }),

  // Qanouni Collab: squads, module workspaces, master notes, squad decks
  mySquad: () => call("/squads/my"),
  createSquad: (body) => call("/squads/create", { method: "POST", body }),
  joinSquad: (code) => call("/squads/join", { method: "POST", body: { code } }),
  leaveSquad: () => call("/squads/leave", { method: "POST" }),
  removeSquadMember: (userId) => call(`/squads/members/${userId}`, { method: "DELETE" }),
  squadWorkspaces: () => call("/squads/workspaces"),
  createWorkspace: (body) => call("/squads/workspaces", { method: "POST", body }),
  deleteWorkspace: (id) => call(`/squads/workspaces/${id}`, { method: "DELETE" }),
  masterNotes: (workspaceId) => call(`/squads/workspaces/${workspaceId}/notes`),
  createMasterNote: (workspaceId, body) =>
    call(`/squads/workspaces/${workspaceId}/notes`, { method: "POST", body }),
  masterNote: (id) => call(`/squads/notes/${id}`),
  updateMasterNote: (id, body) => call(`/squads/notes/${id}`, { method: "PATCH", body }),
  deleteMasterNote: (id) => call(`/squads/notes/${id}`, { method: "DELETE" }),
  squadCards: (workspaceId) => call(`/squads/workspaces/${workspaceId}/cards`),
  createSquadCard: (workspaceId, body) =>
    call(`/squads/workspaces/${workspaceId}/cards`, { method: "POST", body }),
  subscribeSquadDeck: (workspaceId) =>
    call(`/squads/workspaces/${workspaceId}/cards/subscribe`, { method: "POST" }),
  updateSquadCard: (id, body) => call(`/squads/cards/${id}`, { method: "PATCH", body }),
  deleteSquadCard: (id) => call(`/squads/cards/${id}`, { method: "DELETE" }),

  // Qanouni Collab Phase B: Faculty Hub, forks, endorsements, public profiles
  hubNotes: (params) => call(`/hub/notes${qs(params)}`),
  hubProjects: () => call("/hub/projects"),
  sharedExams: () => call("/exam/shared"),
  shareExam: (drillId) => call("/exam/shared", { method: "POST", body: { drillId } }),
  trySharedExam: (id, moduleId) => call(`/exam/shared/${id}/try`, { method: "POST", body: { moduleId } }),
  helpfulSharedExam: (id) => call(`/exam/shared/${id}/helpful`, { method: "POST" }),
  removeSharedExam: (id) => call(`/exam/shared/${id}`, { method: "DELETE" }),
  hubFacets: (cohort) => call(`/hub/facets${qs({ cohort })}`),
  hubNote: (id) => call(`/hub/notes/${id}`),
  forkNote: (id, workspaceId) => call(`/notes/${id}/fork`, { method: "POST", body: workspaceId ? { workspaceId } : {} }),
  endorseNote: (id) => call(`/notes/${id}/endorse`, { method: "POST" }),
  setPublicProfile: (publicProfile) => call("/profile/public", { method: "PATCH", body: { publicProfile } }),
  studentProfile: (userId) => call(`/students/${userId}`),

  referrals: () => call("/referrals"),
  sessionSources: (workspaceId, n) => call(`/squads/workspaces/${workspaceId}/sessions/${n}/sources`),
  addSessionSource: (workspaceId, n, body) =>
    call(`/squads/workspaces/${workspaceId}/sessions/${n}/sources`, { method: "POST", body }),
  deleteSessionSource: (id) => call(`/squads/sources/${id}`, { method: "DELETE" }),
  synthesizeSession: (workspaceId, n) =>
    call(`/squads/workspaces/${workspaceId}/sessions/${n}/synthesize`, { method: "POST" }),
  profile: () => call("/profile"),
  myPreferences: () => call("/me/preferences"),
  updatePreferences: (body) => call("/me/preferences", { method: "PATCH", body }),
  faculties: () => call("/faculties"),
  myAcademic: () => call("/me/academic"),
  updateAcademic: (body) => call("/me/academic", { method: "PATCH", body }),
  onboarding: () => call("/onboarding"),
  onboardingStep: (step, data) => call("/onboarding/step", { method: "POST", body: { step, data } }),
  onboardingComplete: () => call("/onboarding/complete", { method: "POST" }),
  ttCatalog: (q) => call(`/timetable/catalog${qs(q)}`),
  ttSubscription: () => call("/timetable/subscription"),
  ttSubscribe: (body) => call("/timetable/subscription", { method: "PUT", body }),
  ttWeek: (weekStart) => call(`/timetable/me${qs({ weekStart })}`),
  ttCreateOverride: (body) => call("/timetable/overrides", { method: "POST", body }),
  ttUpdateOverride: (id, body) => call(`/timetable/overrides/${id}`, { method: "PATCH", body }),
  ttDeleteOverride: (id) => call(`/timetable/overrides/${id}`, { method: "DELETE" }),
  codeTree: (slug) => call(`/corpus/codes/${encodeURIComponent(slug)}/tree`),
  bookmarks: () => call("/corpus/bookmarks"),
  addBookmark: (id) => call(`/corpus/bookmarks/${encodeURIComponent(id)}`, { method: "PUT" }),
  removeBookmark: (id) => call(`/corpus/bookmarks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  moduleArticles: (moduleId) => call(`/modules/${encodeURIComponent(moduleId)}/articles`),
  linkArticle: (moduleId, id) => call(`/modules/${encodeURIComponent(moduleId)}/articles/${encodeURIComponent(id)}`, { method: "PUT" }),
  unlinkArticle: (moduleId, id) => call(`/modules/${encodeURIComponent(moduleId)}/articles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  corpusCatalog: (params) => call(`/corpus/catalog${qs(params)}`),
  codes: () => call("/corpus/codes"),
  exportCode: (slug) => call(`/corpus/codes/${encodeURIComponent(slug)}/export`),
  chatQuota: () => call("/chat/quota"),
  chatSuggested: () => call("/chat/suggested-scope"),
  chatThreads: () => call("/chat/threads"),
  chatCreate: (scope) => call("/chat/threads", { method: "POST", body: { scope } }),
  chatThread: (id) => call(`/chat/threads/${id}`),
  chatScope: (id, scope) => call(`/chat/threads/${id}/scope`, { method: "PATCH", body: { scope } }),
  chatDelete: (id) => call(`/chat/threads/${id}`, { method: "DELETE" }),
  chatSend: (id, body) => call(`/chat/threads/${id}/messages`, { method: "POST", body }),
  adminQuota: () => call("/admin/ai-quota"),
  setAdminQuota: (limit) => call("/admin/ai-quota", { method: "PUT", body: { limit } }),
  setUserAiLimit: (id, limit) => call(`/admin/users/${id}/ai-limit`, { method: "PUT", body: { limit } }),
  socialFollow: (id) => call(`/social/follow/${id}`, { method: "POST" }),
  socialUnfollow: (id) => call(`/social/follow/${id}`, { method: "DELETE" }),
  socialRequests: () => call("/social/requests"),
  socialDecide: (id, accept) => call(`/social/requests/${id}/${accept ? "accept" : "reject"}`, { method: "POST" }),
  socialBlock: (id) => call(`/social/block/${id}`, { method: "POST" }),
  socialUnblock: (id) => call(`/social/block/${id}`, { method: "DELETE" }),
  socialBlocked: () => call("/social/blocked"),
  socialFriends: () => call("/social/friends"),
  socialSuggestions: () => call("/social/suggestions"),
  socialFind: (q) => call(`/social/find${qs({ q })}`),
  socialConfig: () => call("/social/config"),
  socialMatch: (numbers) => call("/social/contacts/match", { method: "POST", body: { numbers } }),
  socialSetPhone: (phone) => call("/social/phone", { method: "POST", body: { phone } }),
  socialRemovePhone: () => call("/social/phone", { method: "DELETE" }),
  notifications: () => call("/notifications"),
  todos: () => call("/todos"),
  // RC3 module workspace
  // RC3 exam center
  examDates: () => call("/exam/dates"),
  examCountdown: () => call("/exam/countdown"),
  examDateAdd: (body) => call("/exam/dates", { method: "POST", body }),
  examDatesImport: (body) => call("/exam/dates/import", { method: "POST", body }),
  examDateEdit: (id, body) => call(`/exam/dates/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  examDateConfirm: (id, body = {}) => call(`/exam/dates/${encodeURIComponent(id)}/confirm`, { method: "POST", body }),
  examDateDelete: (id) => call(`/exam/dates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  examReadiness: (semester) => call(`/exam/readiness${qs({ semester })}`),
  examSuggest: (moduleId) => call(`/exam/modules/${encodeURIComponent(moduleId)}/suggest`),
  examDrills: (moduleId) => call(`/exam/modules/${encodeURIComponent(moduleId)}/drills`),
  examDrillCreate: (moduleId, body) => call(`/exam/modules/${encodeURIComponent(moduleId)}/drills`, { method: "POST", body }),
  examDrillGet: (id) => call(`/exam/drills/${encodeURIComponent(id)}`),
  examDrillCheck: (id, index, choice) => call(`/exam/drills/${encodeURIComponent(id)}/check`, { method: "POST", body: { index, choice } }),
  examDrillSubmit: (id, body) => call(`/exam/drills/${encodeURIComponent(id)}/submit`, { method: "POST", body }),
  examDrillDelete: (id) => call(`/exam/drills/${encodeURIComponent(id)}`, { method: "DELETE" }),
  moduleList: (semester) => call(`/modules${qs({ semester })}`),
  moduleAdd: (body) => call("/modules", { method: "POST", body }),
  moduleEdit: (id, body) => call(`/modules/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  moduleDelete: (id) => call(`/modules/${encodeURIComponent(id)}`, { method: "DELETE" }),
  moduleProfile: (id) => call(`/modules/${encodeURIComponent(id)}/profile`),
  moduleProfileSave: (id, body) => call(`/modules/${encodeURIComponent(id)}/profile`, { method: "PUT", body }),
  moduleProfessor: (id) => call(`/modules/${encodeURIComponent(id)}/professor`),
  moduleProfessorSave: (id, body) => call(`/modules/${encodeURIComponent(id)}/professor`, { method: "PUT", body }),
  moduleTree: (id) => call(`/modules/${encodeURIComponent(id)}/tree`),
  moduleNodeAdd: (id, body) => call(`/modules/${encodeURIComponent(id)}/nodes`, { method: "POST", body }),
  moduleNodeEdit: (id, nid, body) => call(`/modules/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nid)}`, { method: "PATCH", body }),
  moduleMemory: (id) => call(`/modules/${encodeURIComponent(id)}/memory`),
  moduleMemoryAdd: (id, body) => call(`/modules/${encodeURIComponent(id)}/memory`, { method: "POST", body }),
  moduleMemoryDelete: (id, noteId) => call(`/modules/${encodeURIComponent(id)}/memory/${encodeURIComponent(noteId)}`, { method: "DELETE" }),
  moduleNodeReport: (id, nid, body) => call(`/modules/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nid)}/report`, { method: "POST", body }),
  moduleNodeDelete: (id, nid) => call(`/modules/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nid)}`, { method: "DELETE" }),
  moduleSources: (id) => call(`/modules/${encodeURIComponent(id)}/sources`),
  moduleSourceAdd: (id, body) => call(`/modules/${encodeURIComponent(id)}/sources`, { method: "POST", body }),
  moduleSource: (id, sid) => call(`/modules/${encodeURIComponent(id)}/sources/${encodeURIComponent(sid)}`),
  moduleSourceEdit: (id, sid, text) => call(`/modules/${encodeURIComponent(id)}/sources/${encodeURIComponent(sid)}`, { method: "PATCH", body: { text } }),
  moduleSourceDelete: (id, sid) => call(`/modules/${encodeURIComponent(id)}/sources/${encodeURIComponent(sid)}`, { method: "DELETE" }),
  moduleRecap: (id) => call(`/modules/${encodeURIComponent(id)}/recap`),
  moduleMentor: (id, body) => call(`/modules/${encodeURIComponent(id)}/mentor`, { method: "POST", body }),
  moduleProposals: (id, status) => call(`/modules/${encodeURIComponent(id)}/proposals${qs({ status })}`),
  moduleProposalAccept: (id, pid) => call(`/modules/${encodeURIComponent(id)}/proposals/${encodeURIComponent(pid)}/accept`, { method: "POST" }),
  moduleProposalReject: (id, pid) => call(`/modules/${encodeURIComponent(id)}/proposals/${encodeURIComponent(pid)}/reject`, { method: "POST" }),
  syncTodos: (items) => call("/todos/sync", { method: "POST", body: { items } }),
  readNotifications: (ids) => call("/notifications/read", { method: "POST", body: { ids } }),
  readNotification: (id) => call(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  readAllNotifications: () => call("/notifications/read-all", { method: "POST" }),
  hubRevisions: (id) => call(`/hub/notes/${id}/revisions`),
  hubPropose: (id, body) => call(`/hub/notes/${id}/change-requests`, { method: "POST", body }),
  hubCRs: (role) => call(`/hub/change-requests${qs({ role })}`),
  hubCR: (id) => call(`/hub/change-requests/${id}`),
  hubCRAction: (id, action, body = {}) => call(`/hub/change-requests/${id}/${action}`, { method: "POST", body }),
  hubReport: (id, reason, detail) => call(`/hub/notes/${id}/report`, { method: "POST", body: { reason, detail } }),
  hubAppeal: (id) => call(`/hub/notes/${id}/appeal`, { method: "POST" }),
  modQueue: () => call("/admin/moderation/queue"),
  modDecide: (id, decision) => call(`/admin/moderation/${id}/decide`, { method: "POST", body: { decision } }),
  pathModules: (semester) => call(`/path/semesters/${semester}/modules`),
  pathGraph: (id) => call(`/path/modules/${id}/graph`),
  pathProgress: (nodeId, state) => call(`/path/nodes/${nodeId}/progress`, { method: "POST", body: { state } }),
  pathPin: (nodeId, noteId) => call(`/path/nodes/${nodeId}/attach-hub-doc`, { method: "POST", body: { noteId } }),
  pathUnpin: (nodeId, noteId) => call(`/path/nodes/${nodeId}/attach-hub-doc/${noteId}`, { method: "DELETE" }),
  // Student courses (imported notebooks) and the gap radar
  courses: () => call("/courses"),
  coursePreview: (assetId) => call("/courses/preview", { method: "POST", body: { assetId } }),
  courseImport: (body) => call("/courses/import", { method: "POST", body }),
  courseOutline: (id) => call(`/courses/${encodeURIComponent(id)}`),
  courseTopic: (id, topicId) => call(`/courses/${encodeURIComponent(id)}/topics/${encodeURIComponent(topicId)}`),
  courseSearch: (q, courseId) => call(`/courses/search${qs({ q, courseId })}`),
  courseDelete: (id) => call(`/courses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  gapsAnalyze: (id, codes) => call(`/courses/${encodeURIComponent(id)}/gaps/analyze`, { method: "POST", body: codes ? { codes } : {} }),
  gaps: (id, status) => call(`/courses/${encodeURIComponent(id)}/gaps${qs({ status })}`),
  gapSetStatus: (id, gapId, status) => call(`/courses/${encodeURIComponent(id)}/gaps/${encodeURIComponent(gapId)}`, { method: "PATCH", body: { status } }),
  gapReadiness: (id, limit) => call(`/courses/${encodeURIComponent(id)}/readiness${qs({ limit })}`),
  brainMe: () => call("/brain/me"),
  brainDismiss: (id) => call(`/brain/me/${id}`, { method: "PATCH", body: { status: "DISMISSED" } }),
  brainDelete: (id) => call(`/brain/me/${id}`, { method: "DELETE" }),
  brainReset: () => call("/brain/me", { method: "DELETE" }),
  brainExport: () => call("/brain/me/export"),
  brainToday: () => call("/brain/today"),
  brainDrills: () => call("/brain/drills"),
  brainAnswer: (id, optionIndex) => call(`/brain/drills/${id}/answer`, { method: "POST", body: { optionIndex } }),
  brainGenerate: (pairId) => call("/brain/drills/generate", { method: "POST", body: { pairId } }),
  brainReportDrill: (id) => call(`/brain/drills/${id}/report`, { method: "POST" }),
  brainTaxonomy: () => call("/brain/taxonomy"),
  reportAiMistake: (messageId, body) => call(`/ai/messages/${messageId}/corrections`, { method: "POST", body }),
  adminCorrections: (status) => call(`/admin/corrections${qs({ status })}`),
  adminDecide: (id, body) => call(`/admin/corrections/${id}/decide`, { method: "POST", body }),
  adminConcepts: () => call("/admin/concepts"),
  adminConceptUpdate: (id, body) => call(`/admin/concepts/${id}`, { method: "PATCH", body }),
  adminPairUpdate: (id, body) => call(`/admin/confusion-pairs/${id}`, { method: "PATCH", body }),
  adminDrillItems: () => call("/admin/drill-items"),
  adminDrillUpdate: (id, body) => call(`/admin/drill-items/${id}`, { method: "PATCH", body }),
  adminBrainAggregates: (semester) => call(`/admin/brain/aggregates${qs({ semester })}`),
  myProfile: () => call("/me/profile"),
  updateMyProfile: (body) => call("/me/profile", { method: "PATCH", body }),
  // RC3 Phase 7: friend share code, squad work documents + change requests + roles, campus wall
  friendCode: (message) => call(`/friends/code${qs({ message })}`),
  extractSquadDocFile: (file) => call("/squads/docs/extract", { method: "POST", body: { file } }),
  squadDocs: (type) => call(`/squads/docs${qs({ type })}`),
  createSquadDoc: (body) => call("/squads/docs", { method: "POST", body }),
  squadDoc: (id) => call(`/squads/docs/${id}`),
  editSquadDoc: (id, body) => call(`/squads/docs/${id}`, { method: "PATCH", body }),
  deleteSquadDoc: (id) => call(`/squads/docs/${id}`, { method: "DELETE" }),
  squadDocRevisions: (id) => call(`/squads/docs/${id}/revisions`),
  proposeSquadDoc: (id, body) => call(`/squads/docs/${id}/change-requests`, { method: "POST", body }),
  squadCRs: (params) => call(`/squads/change-requests${qs(params)}`),
  squadCR: (id) => call(`/squads/change-requests/${id}`),
  squadCRAction: (id, action, body = {}) => call(`/squads/change-requests/${id}/${action}`, { method: "POST", body }),
  updateSquadSettings: (body) => call("/squads/settings", { method: "PATCH", body }),
  publicSquads: (q) => call(`/squads/public${qs({ q })}`),
  joinPublicSquad: (id) => call(`/squads/public/${encodeURIComponent(id)}/join`, { method: "POST" }),
  setSquadRole: (userId, role) => call(`/squads/members/${userId}/role`, { method: "PATCH", body: { role } }),
  transferSquad: (userId) => call(`/squads/transfer/${userId}`, { method: "POST" }),
  campusPosts: (params) => call(`/campus/posts${qs(params)}`),
  campusPost: (id) => call(`/campus/posts/${id}`),
  createCampusPost: (body) => call("/campus/posts", { method: "POST", body }),
  deleteCampusPost: (id) => call(`/campus/posts/${id}`, { method: "DELETE" }),
  reportCampusPost: (id, reason) => call(`/campus/posts/${id}/report`, { method: "POST", body: { reason } }),
  campusQueue: () => call("/admin/campus/queue"),
  campusDecide: (id, decision) => call(`/admin/campus/${id}/decide`, { method: "POST", body: { decision } }),
  friends: () => call("/friends"),
  addFriend: (code) => call("/friends", { method: "POST", body: { code } }),
  respondFriend: (id, accept) =>
    call(`/friends/${id}/respond`, { method: "POST", body: { accept } }),
  removeFriend: (id) => call(`/friends/${id}`, { method: "DELETE" }),
  login: (body) => call("/auth/login", { method: "POST", body }),
  googleSignIn: (credential) => {
    // Phase C: an invite code remembered from /law/register?ref=… also applies to a Google sign-up.
    let referralCode;
    try {
      referralCode = sessionStorage.getItem("qanouni_ref") || undefined;
    } catch {}
    return call("/auth/google", { method: "POST", body: { credential, ...(referralCode ? { referralCode } : {}) } });
  },
  facebookSignIn: (accessToken) => {
    let referralCode;
    try {
      referralCode = sessionStorage.getItem("qanouni_ref") || undefined;
    } catch {}
    return call("/auth/facebook", {
      method: "POST",
      body: { accessToken, ...(referralCode ? { referralCode } : {}) },
    });
  },
  me: () => call("/auth/me"),
  updateMe: (body) => call("/auth/me", { method: "PATCH", body }),
  changePassword: (body) => call("/auth/password", { method: "POST", body }),
  adminUsers: () => call("/admin/users"),
  adminUpdateUser: (id, body) =>
    call(`/admin/users/${id}`, { method: "PATCH", body }),

  health: () => call("/health"),
  settings: () => call("/settings"),
  updateSettings: (updates) =>
    call("/settings", { method: "PATCH", body: updates }),

  today: () => call("/today"),
  registerDevice: (body) => call("/devices", { method: "POST", body }),

  subjects: (params) => call(`/subjects${qs(params)}`),
  subject: (id) => call(`/subjects/${id}`),
  createSubject: (body) => call("/subjects", { method: "POST", body }),
  updateSubject: (id, body) =>
    call(`/subjects/${id}`, { method: "PATCH", body }),

  timetableImport: (body) => call("/timetable/import", { method: "POST", body }),
  timetableReminders: () => call("/timetable/reminders"),
  saveTimetableReminders: (body) => call("/timetable/reminders", { method: "PUT", body }),
  timetableTomorrow: () => call("/timetable/tomorrow"),
  timetable: () => call("/timetable"),
  saveTimetable: (slots) =>
    call("/timetable", { method: "PUT", body: { slots } }),
  parseTimetableAi: (body) =>
    call("/schedule/parse-ai", { method: "POST", body }),

  sessions: (params) => call(`/sessions${qs(params)}`),

  offlinePack: () => call("/cards/offline-pack"),
  cards: (params) => call(`/cards${qs(params)}`),
  cardStats: () => call("/cards/stats"),
  createCard: (body) => call("/cards", { method: "POST", body }),
  updateCard: (id, body) => call(`/cards/${id}`, { method: "PATCH", body }),
  deleteCard: (id) => call(`/cards/${id}`, { method: "DELETE" }),
  submitReviews: (body) => call("/reviews/batch", { method: "POST", body }),
  streak: () => call("/streak"),

  inbox: () => call("/inbox"),
  jobs: (params) => call(`/jobs${qs(params)}`),
  retryJob: (id) => call(`/jobs/${id}/retry`, { method: "POST" }),
  derivative: (id) => call(`/derivatives/${id}`),
  updateDerivative: (id, body) =>
    call(`/derivatives/${id}`, { method: "PATCH", body }),
  aiUsage: (month) => call(`/ai/usage${qs({ month })}`),

  searchCorpus: (params) => call(`/corpus/search${qs(params)}`),
  article: (canonicalId, at) =>
    call(`/corpus/articles/${encodeURIComponent(canonicalId)}${qs({ at })}`),
  // Legal graph: conditional GET so a warm offline copy costs a 304.
  graphBundle: async (etag) => {
    try {
      const res = await fetch(`${API_BASE}/law/graph/bundle`, { headers: { ...baseHeaders(), ...(etag ? { "If-None-Match": etag } : {}) } });
      if (res.status === 304) return { ok: true, notModified: true, status: 304, data: null, etag, offline: false };
      return { ok: res.ok, notModified: false, status: res.status, data: res.ok ? await res.json().catch(() => null) : null, etag: res.headers.get("ETag"), offline: false };
    } catch {
      return { ok: false, notModified: false, status: 0, data: null, etag: null, offline: true };
    }
  },
  graphAutoLink: (limit) => call("/graph/auto-link", { method: "POST", body: { limit } }),
  resolve: (ids, at) =>
    call(`/corpus/resolve${qs({ ids: ids.join(","), at })}`),
  imports: () => call("/corpus/import"),
  createImport: (body) => call("/corpus/import", { method: "POST", body }),
  getImport: (id) => call(`/corpus/import/${id}`),
  saveImport: (id, body) =>
    call(`/corpus/import/${id}`, { method: "PATCH", body }),
  decisions: (params) => call(`/decisions${qs(params)}`),
  createDecision: (body) => call("/decisions", { method: "POST", body }),
  updateDecision: (id, body) =>
    call(`/decisions/${id}`, { method: "PATCH", body }),
  doctrine: (params) => call(`/doctrine${qs(params)}`),
  createDoctrine: (body) => call("/doctrine", { method: "POST", body }),
  updateDoctrine: (id, body) =>
    call(`/doctrine/${id}`, { method: "PATCH", body }),
  createLink: (body) => call("/links", { method: "POST", body }),

  subjectContent: (id, mode) => call(`/subjects/${id}/content${qs({ mode })}`),
  atoms: (params) => call(`/atoms${qs(params)}`),
  createAtom: (body) => call("/atoms", { method: "POST", body }),
  updateAtom: (id, body) => call(`/atoms/${id}`, { method: "PATCH", body }),
  deleteAtom: (id) => call(`/atoms/${id}`, { method: "DELETE" }),
  acceptAtoms: (derivativeId, body) =>
    call(`/derivatives/${derivativeId}/accept-atoms`, { method: "POST", body }),
  updateBatch: (id, body) => call(`/batches/${id}`, { method: "PATCH", body }),

  cases: (params) => call(`/cases${qs(params)}`),
  createCase: (body) => call("/cases", { method: "POST", body }),
  getCase: (id) => call(`/cases/${id}`),
  startAttempt: (caseId, body) =>
    call(`/cases/${caseId}/attempts`, { method: "POST", body }),
  attempt: (id) => call(`/attempts/${id}`),
  saveAttempt: (id, phases) =>
    call(`/attempts/${id}`, { method: "PATCH", body: { phases } }),
  submitAttempt: (id) => call(`/attempts/${id}/submit`, { method: "POST" }),
  modelAnswer: (id) => call(`/attempts/${id}/model-answer`, { method: "POST" }),
  acceptAttemptCard: (id, index) =>
    call(`/attempts/${id}/cards`, { method: "POST", body: { index } }),
  dissertations: () => call("/dissertations"),
  createDissertation: (body) =>
    call("/dissertations", { method: "POST", body }),
  dissertation: (id) => call(`/dissertations/${id}`),
  saveDissertation: (id, body) =>
    call(`/dissertations/${id}`, { method: "PATCH", body }),
  checkDissertation: (id) =>
    call(`/dissertations/${id}/check`, { method: "POST" }),
  critiqueDissertation: (id) =>
    call(`/dissertations/${id}/critique`, { method: "POST" }),
  drills: (params) => call(`/drills/next${qs(params)}`),
  reforms: () => call("/reforms"),
  updateReform: (id, body) => call(`/reforms/${id}`, { method: "PATCH", body }),
  sourcesStatus: () => call("/sources/status"),
  scanSources: () => call("/sources/scan", { method: "POST" }),
  enableSource: (sourceId) =>
    call(`/sources/config/${sourceId}/enable`, { method: "POST" }),
  importSource: (id, body) =>
    call(`/sources/${id}/import`, { method: "POST", body }),
  dismissSource: (id) => call(`/sources/${id}/dismiss`, { method: "POST" }),
  latestRecap: () => call("/recaps/latest"),
  recapViewed: (id) => call(`/recaps/${id}/viewed`, { method: "POST" }),
  pushKey: () => call("/push/key"),
  pushSubscribe: (body) => call("/push/subscribe", { method: "POST", body }),
  pushUnsubscribe: (endpoint) =>
    call("/push/unsubscribe", { method: "POST", body: { endpoint } }),
  answerDrill: (cardId, answer) =>
    call(`/drills/${cardId}/answer`, { method: "POST", body: { answer } }),
};

export default Law;

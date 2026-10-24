# Talib (طالب) — Plan d'implémentation : du design au code

Ce document explique comment porter dans l'application réelle (React + Vite + Tailwind, dossier `server/`) tout ce qui a été conçu dans ce projet de design. Les fichiers `*.dc.html` sont des **maquettes de référence**. On ne les copie pas tels quels : on reconstruit chaque écran en composants React.

---

## 0. Avant de commencer

1. Crée une branche : `git checkout -b redesign/talib-v3`.
2. Fige l'état actuel : `./scripts/gate.sh --quick` doit passer **avant** de toucher quoi que ce soit.
3. Garde ce projet de design ouvert à côté. Pour chaque écran, la maquette est la référence visuelle et fonctionnelle.

---

## 1. Correspondance maquettes → fichiers du code

| Maquette (ce projet) | À créer / modifier dans le code |
|---|---|
| `Talib Landing.dc.html` | `frontend/src/pages/LawOS/Portal.jsx` ✅ déjà livré |
| `TalibAuth.dc.html` | `AuthSheet` (dans Portal.jsx) ✅ déjà livré, à brancher |
| `Talib Welcome.dc.html` | `frontend/src/pages/LawOS/Welcome.jsx` ✅ déjà livré |
| `Talib App v3.dc.html` (coquille) | `components/layout/AppShell.jsx`, `Sidebar.jsx`, `TopBar.jsx`, `MobileNav.jsx` |
| `TalibAvatar.dc.html` | `components/avatar/TalibAvatar.jsx` (port du générateur SVG) |
| `TalibIcon.dc.html` | `components/icons/*.jsx` |
| `TalibPeople.dc.html` | `pages/LawOS/Profile.jsx` + `ProfileNetwork.jsx` + `ProfileTabs.jsx` + `AvatarBuilder.jsx` |
| `TalibStudio.dc.html` + `TalibOnboard.dc.html` | `pages/LawOS/Learn/` (`LearnHome`, `SubjectSetup`, `SubjectWorkspace`, `LessonEditor`) |
| `TalibExam.dc.html` + `TalibExamCenter.dc.html` + `shared-exams.js` | `pages/LawOS/Exam/` (`ExamCenter`, `ExamSetup`, `ExamPath`, `ExamRunner`) |
| `TalibLibrary.dc.html` + `law-profiles.js` + `TalibBranch.dc.html` | `pages/LawOS/Library/` + `lib/lawProfiles.js` |
| `TalibGroups.dc.html`, `TalibProject.dc.html` | `pages/LawOS/Community/` (`Groups`, `Project`, `EditRequests`) |
| `TalibSharedFeed.dc.html` | `components/feed/SharedExamCard.jsx` |
| `TalibSettings.dc.html` | `pages/LawOS/Settings.jsx` |
| `TalibEgoMap.dc.html` + `Talib Graph Mobile.dc.html` | `EgoMap.jsx`, `NodeSheet.jsx`, `server/utils/law/legalGraph.js`, `server/storage/corpus/tours/*.json` |
| `Talib Mobile.dc.html` | Pas de fichier séparé : ce sont les **breakpoints mobiles** des écrans ci-dessus |

---

## 2. Fondations (à faire en premier, tout le reste en dépend)

### 2.1 Design tokens — `tailwind.config.js`
```js
theme: { extend: {
  colors: {
    talib: { green:'#057a44', greenDeep:'#035a32', gold:'#d97706', goldText:'#b45309', ink:'#0f172a', muted:'#5b6475',
             canvas:'#fbfbfd', surface:'#ffffff', surface2:'#f5f5f7', line:'#d9d9de', danger:'#c2410c' },
    night: { bg:'#0b1220', surface:'#121b2f', surface2:'#18233b', line:'#2a3654', text:'#eeece6', muted:'#9aa3b5' },
  },
  fontFamily: { sans:['"IBM Plex Sans Arabic"','system-ui','sans-serif'], naskh:['"Noto Naskh Arabic"','serif'], mono:['"IBM Plex Mono"','monospace'] },
  boxShadow: { card:'0 1px 2px rgba(15,23,42,.04), 0 12px 32px -16px rgba(15,23,42,.18)', pop:'0 2px 6px rgba(15,23,42,.06), 0 30px 70px -24px rgba(15,23,42,.3)',
               tactile:'0 5px 0 #035a32', tactileGray:'0 5px 0 #d9d9de' },
}}
```
- Mode nuit : `darkMode: 'class'` et classes `dark:` (fond `night.bg`).
- Ajoute les keyframes (`talib-spring`, `talib-sheet`, `talib-fade`, `talib-bob`, `talib-chip`, `talib-flame`, `talib-step`) dans `tailwind.config` puis supprime le `<style>` de `TalibKeyframes` dans Portal.jsx.

### 2.2 Composants de base — `frontend/src/components/ui/`
- `Button3D` (variantes `primary`, `secondary`, `gold`, `danger` ; enfoncement `active:translate-y-[N]`).
- `Segmented`, `Chip`, `Card`, `BottomSheet`, `Modal`, `Toast`, `ProgressRing`, `ProgressBar`.
- `Bdi` pour tous les numéros d'articles, codes et chiffres (`<bdi dir="ltr">`).
- Règle : tout badge ou compteur reçoit `whitespace-nowrap shrink-0`.

### 2.3 Avatar — `components/avatar/TalibAvatar.jsx`
Porter la logique de `TalibAvatar.dc.html` (méthode `build()`) en composant React. Elle prend la même `config` : genre, peau, cheveux, barbe, hijab, yeux, sourcils, lunettes, tenue, accessoires, humeur et fond. Ensuite, passe-le à Welcome via `renderAvatar`.

### 2.4 RTL et typographie
- `<html lang="ar" dir="rtl">`. Utilise les classes logiques (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).
- Ajoute `overflow-x-hidden` sur le conteneur racine, et teste en 360 px de large.

---

## 3. Authentification, session et routes

1. **Branche ton système Google / OTP existant** dans `authApi` :
   ```js
   const authApi = {
     googleSignIn: async () => (await api.post('/auth/google')).data,            // → { provider, email, name, avatar }
     requestCode:  async (email) => api.post('/auth/otp/request', { email }),
     verifyCode:   async (email, code) => (await api.post('/auth/otp/verify', { email, code })).data,
   };
   ```
2. Après connexion, écris la session dans `talib.auth.v1` et lance `talib-auth`. C'est déjà fait par `writeAuth`.
3. **Garde de routes** (`AppRouter.jsx`) :
   - pas de session → `/` (Portal)
   - session sans profil → `/welcome`
   - session et profil → `/app`
4. Le profil (`talib.profile.v1`) doit **aussi** être envoyé au serveur via `onFinish` dans Welcome, pour ne pas le perdre si on change d'appareil.

---

## 4. Couche de données : remplacer le `localStorage` des maquettes

Les maquettes stockent tout dans le navigateur. Dans l'app réelle, chaque clé devient une ressource serveur, avec un cache local pour le hors-ligne (IndexedDB via `idb-keyval` ou Dexie).

| Clé maquette | Contenu | Ressource proposée |
|---|---|---|
| `talib.auth.v1` | session | `/auth/me` |
| `talib.profile.v1` | faculté, filière, S, groupe, objectif | `/me/profile` |
| `talib.avatar.v2` | config personnage | `/me/avatar` |
| `talib.settings.v1` | confidentialité, notifs, thème | `/me/settings` |
| `talib.xp.v1` | XP, streak, objectif du jour | `/me/progress` (calculé serveur) |
| `talib.people.v2` | amis, demandes, suivis, rencontres | `/social/*` |
| `talib.studio.v2` | matières, emploi du temps, leçons, éditions | `/learn/subjects`, `/learn/timetable` |
| `talib.exam.v1` | config d'entraînement, résultats | `/exam/configs`, `/exam/attempts` |
| `talib.shared.v1` | examens publiés | `/exam/shared` |
| `talib.library.v1` | favoris, imports perso | `/library/saved` |

Conseil : un hook par domaine (`useProfile`, `useSubjects`…) avec React Query. Ainsi les composants ne lisent plus jamais le `localStorage` directement.

---

## 5. Ordre de construction des écrans

Chaque étape se termine par `./scripts/gate.sh --quick` et `VITE_API_BASE=/api yarn --cwd frontend build`.

1. **Portal + Welcome + AuthSheet** : déjà écrits, à brancher (sections 3 et 4).
2. **AppShell** : sidebar droite, barre du haut (recherche qui s'étend, streak 🔥, calendrier), navigation basse sur mobile (≤ 1000 px). Entrées : الملتقى، تعلم، امتحان، خزانة القوانين، المجموعات، حسابي. Les paramètres sont en bas de la sidebar.
3. **Profil** :
   - en-tête avec photo Google ou personnage, badge d'auth et 4 compteurs ;
   - « نبذة » avec le choix public / privé ;
   - « الشبكة » : amis, abonnés, abonnements, avec visibilité الجميع / الأصدقاء / العدد فقط ;
   - demandes et suggestions, triées par même faculté, groupe, amis communs, activité de partage ;
   - les 3 onglets : الأعمال (tri الأحدث / الأكثر تفاعلاً), المساهمات, المجموعات واللقاءات ;
   - heatmap réelle (jours Mo…Su, mois en arabe marocain).
4. **تعلم** :
   - départ depuis l'emploi du temps (upload, OCR côté serveur) ;
   - « اليوم » avec les séances en cours et à venir ;
   - mise en place guidée de chaque matière : sources, niveau de dépendance aux sources, plan extrait, découpage, formats ;
   - espace de travail : formats multiples, édition manuelle et via l'assistant, contrôle de maîtrise avant « فهمت ».
5. **امتحان** :
   - configuration une seule fois (types, difficulté, nombre de questions, source des نوازل) ;
   - parcours par étapes ;
   - QCU / QCM / cartes / questions écrites / نازلة en 5 champs / sujet de dissertation ;
   - correction par l'IA, barème sur 20 ;
   - méthodologies ;
   - onglet « امتحانات الزملاء » et publication dans le feed.
6. **خزانة القوانين** :
   - pyramide الدستور ← التنظيمية ← الإطار ← العادي ← المراسيم ;
   - un bloc séparé « الاتفاقيات الدولية والقوانين المهمة » (Top 40) ;
   - la nature de chaque branche (`lawProfiles.js`) ;
   - lien vers le texte officiel.
7. **Communauté** : feed (استفسار / اجتهاد, examens partagés), projets publics avec demandes de modification (accepter / refuser, couleur par contributeur), groupes avec édition directe colorée, versions et rôles admin.
8. **Knowledge Graph** : EgoMap (pan et pinch avec les Pointer Events, nombre de nœuds adapté au zoom, libellés sur 2 lignes), NodeSheet (badge jurisprudence quand `decisions.length > 0`), règles d'extraction et parcours en JSON (voir la maquette 3d).

---

## 6. Serveur — `server/`

- **`utils/law/legalGraph.js`** — règles par ordre de priorité :
  1. `استثناء من أحكام` / `خلافاً لمقتضيات` / `على الرغم من أحكام` → `divergesFrom`.
  2. `بصرف النظر عن` **suivi de** `أحكام|مقتضيات|الفصل \d+` → `divergesFrom`. Sinon, aucune relation.
  3. `تطبق مقتضيات` / `تسري أحكام` → `applies`.
  4. `طبقاً للفصل` / `مع مراعاة` / `المشار إليه في` → `refers`.
- **`storage/corpus/tours/*.json`** : un fichier par parcours (format dans la maquette 3d). Le statut `"review"` reste tant qu'un juriste n'a pas validé.
- **Moteur « nature de la branche »** (`law-profiles.js`) : il est injecté dans tous les prompts IA. Exemples : principe de légalité en pénal, rôle des usages en commercial (art. 2–3 م.ت). Le serveur doit bloquer toute réponse qui le contredit.
- **Endpoints** listés en section 4, plus l'upload et l'OCR (emploi du temps, polycopiés).

---

## 7. PWA et distribution web-first

1. `vite-plugin-pwa` : `manifest.webmanifest` (nom « طالب », `dir: "rtl"`, `lang: "ar"`, `theme_color: "#057a44"`, icônes 192 / 512 / maskable), service worker en mode `injectManifest`.
2. **Hors-ligne** : mets en cache l'interface, les textes de loi enregistrés et les leçons de l'utilisateur. Les modifications faites hors connexion sont mises en file d'attente puis synchronisées au retour du réseau.
3. **APK Android** : emballe la PWA avec Bubblewrap (TWA) ou Capacitor, publie `talib.apk` dans `/downloads/` et ajoute `/.well-known/assetlinks.json` pour la TWA.
4. **iPhone** : balises `apple-mobile-web-app-capable`, `apple-touch-icon` ; le guide en 2 étapes est déjà dans Portal.

---

## 8. Contenu juridique à valider avant mise en production

Tout ce qui suit a été écrit pour les maquettes **et n'est pas vérifié**. Ne pas publier sans relecture par un juriste.
- Les arrêts de la Cour de cassation : ce sont des exemples, à remplacer par de vrais `LawDecision`.
- Le texte et la numérotation des articles cités (ف.77–106, 85 مكرر, 39–56 ق.ل.ع, م.ت 2–6 et 334).
- Les numéros et dates des lois marquées « ⓘ » dans la خزانة : 6 seulement ont été vérifiées.
- « المسطرة المدنية 58.25 » sur la landing : numéro non vérifié.
- La liste des 15 facultés.
- Les 2 nouveaux parcours (عيوب الرضا، فعل الغير).

---

## 9. Contrôles avant chaque merge

- [ ] `./scripts/gate.sh --quick` passe.
- [ ] `VITE_API_BASE=/api yarn --cwd frontend build` passe.
- [ ] Aucun débordement horizontal à 360, 390 et 430 px.
- [ ] Aucun badge ni compteur coupé sur deux lignes.
- [ ] Le thème clair et le thème nuit sont tous les deux lisibles (contraste ≥ 4.5:1 pour le texte).
- [ ] Navigation au clavier, `aria-pressed` sur les choix, `aria-expanded` sur les accordéons.
- [ ] `talib-auth` met à jour l'en-tête du profil sans recharger la page.

---

## 10. Pour aller plus vite

- **Connecte le dépôt GitHub** à ce projet. Je pourrai alors lire le code existant et produire les fichiers exacts, écran par écran.
- **Ou** donne ce document à Claude Code dans le dépôt : « Implémente la section 5, étape N, en suivant la maquette X ». Il pourra lancer `gate.sh` et le build lui-même.

import { PageTitle } from "@/components/LawOS/EmptyState";
import { NOTICE_VERSION, NoticeSections } from "@/components/LawOS/Legal/notice";

/** The legal notice, readable at any time (Settings → الإشعار القانوني). */
export default function Legal() {
  return (
    <>
      <PageTitle sub={<bdi dir="ltr">Mentions légales · v{NOTICE_VERSION}</bdi>}>الإشعار القانوني</PageTitle>
      <NoticeSections />
    </>
  );
}

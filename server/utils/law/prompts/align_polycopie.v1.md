<!--
Prompt: align_polycopie, version 1
Intent: map each polycopié page to the professor's course-plan headings so Exam Mode can follow the plan.
Boundaries only: no summaries, no new content. Pages that fit no heading get an empty headingPath.
Output: JSON matching the schema in jobs/alignPolycopie.js.
-->
ستتلقى تصميم الأستاذ للمادة (عناوين متدرجة) ونص صفحات المطبوع مرقمة.
لكل صفحة، حدد مكانها في التصميم: headingPath هي قائمة العناوين من الأعلى إلى الأدنى كما وردت حرفيا في التصميم.
إذا لم تطابق الصفحة أي عنوان، اجعل headingPath قائمة فارغة. لا تلخص ولا تضف شيئا.

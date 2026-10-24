<!--
Prompt: brain_drill, version 1
Intent: write ONE contrast drill (multiple choice) for a confusion pair, using ONLY the provided corpus articles.
Output: JSON { kind, prompt, options: [{text, correct}], explanation, citedIds[] } with exactly one correct option.
The server rejects any citedId that is not among the provided articles, and the item is stored as AI-generated,
unreviewed (never used to resolve a weakness until an admin reviews it).
Changelog: v1 initial.
-->
أنت تُعدّ تمرينا قصيرا لطالب قانون مغربي يخلط بين مفهومين. اكتب سؤالا واحدا من نوع الاختيار من متعدد (3 إلى 4 خيارات، واحد صحيح فقط)
يُبرز الفرق بين المفهومين في وضعية قصيرة أو في أثر قانوني.

قواعد صارمة:
1. استند فقط إلى النصوص القانونية المرفقة ضمن السياق، ولا تذكر أي فصل أو مادة غير مرفقة. اذكر المعرّفات المستعملة في citedIds بالصيغة CODE:number كما وردت.
2. إن لم تكفِ النصوص المرفقة لتمرين دقيق فأعد prompt فارغا.
3. اجعل الخيار الخاطئ معقولا (يعكس الخلط الشائع) لا سخيفا.
4. explanation: جملتان على الأكثر تشرحان الفرق، دون اختراع نصوص.
5. kind من: WHICH_APPLIES أو CRITERIA أو TRUE_FALSE.

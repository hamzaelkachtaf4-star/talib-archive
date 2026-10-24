# Prompts (spec §7.3)

System prompts are versioned files under `server/utils/law/prompts/`. They are written in Arabic, with an
English comment header explaining intent, and are never inlined in route handlers. They're loaded by
`server/utils/law/prompts.js`, and each AI call logs a hash of the prompt id, version and text in
`LawAiCall.promptHash`. To change a prompt, add a new version file and switch the job to it; never edit a
version that has already shipped.

| File | Purpose | Provider (default) | Version |
|---|---|---|---|
| `ocr_photo_batch.v1.md` | Verbatim OCR of lecture pages, illegible spans marked, headings and French terms extracted | Gemini multimodal | 1 |
| `transcribe_audio.v1.md` | Timestamped transcript of an audio part of 10 min or less; uncertain words marked; no student names | Gemini multimodal | 1 |
| `segment_transcript.v1.md` | Topic boundaries aligned with the professor's course plan, in their own terminology | Gemini fast → DeepSeek | 1 |
| `extract_pdf_vision.v1.md` | OCR of scanned polycopié pages only | Gemini multimodal | 1 |
| `candidate_atoms.v1.md` | Selective PROF atom proposals (definitions, elements, deadlines, emphasis) from verified lecture text | Gemini fast → DeepSeek | 1 |
| `align_polycopie.v1.md` | Map polycopié pages to course-plan headings | Gemini fast → DeepSeek | 1 |
| `case_critique.v1.md` | Grounded critique of a submitted 5-phase cas pratique (no model answer) | DeepSeek → Gemini | 1 |
| `dissertation_critique.v1.md` | Grounded critique of a dissertation draft against the professor's rules | DeepSeek → Gemini | 1 |
| `qualification_drill.v1.md` | Judge a qualification answer against the card's reference answer | DeepSeek → Gemini | 1 |
| `model_answer.v1.md` | Reference solution, only after critique and on explicit request | DeepSeek → Gemini | 1 |
| `weekly_recap.v1.md` | 2–3 sentence encouraging summary of the week's numbers (optional, non-fatal) | Gemini fast → DeepSeek | 1 |

import { useState } from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import TactileButton from "./TactileButton";

const OPTIONS = [
  ["أ", "يجوز لأحد الأطراف تعديل العقد منفرداً."],
  ["ب", "العقد ملزم للطرفين ولا ينقض إلا باتفاقهما أو بالحالات القانونية."],
  ["ج", "القاضي يلغي العقد متى شاء."],
];
const CORRECT = 1;

/** One playable question: instant feedback, a calm confirmation on success and a CTA to sign up. */
export default function MiniQuizWidget({ onSignup }) {
  const [picked, setPicked] = useState(null);
  const [shake, setShake] = useState(0);
  const solved = picked === CORRECT;

  const choose = (i) => {
    if (solved) return;
    setPicked(i);
    if (i !== CORRECT) setShake((n) => n + 1);
  };

  return (
    <section id="try" className="portal-section" aria-labelledby="portal-quiz-title">
      <div className="portal-play">
        <div className="portal-quiz">
          <h2 id="portal-quiz-title">{tr("اختبر فهمك القانوني الآن في 10 ثوانٍ")}</h2>
          <p className="portal-quiz-q">{tr("في القانون المدني المغربي (ق.ل.ع)، العقد شريعة المتعاقدين يعني:")}</p>
          <div className="portal-quiz-opts" role="group" aria-label={tr("خيارات الإجابة")}>
            {OPTIONS.map(([k, text], i) => {
              const state = picked === i ? (i === CORRECT ? "is-right" : "is-wrong") : "";
              return (
                <button
                  key={i}
                  type="button"
                  className={`portal-quiz-opt ${state}${state === "is-wrong" ? (shake % 2 ? " shake-a" : " shake-b") : ""}`}
                  onClick={() => choose(i)}
                  disabled={solved && i !== CORRECT}
                  aria-pressed={picked === i}
                >
                  <span className="portal-quiz-key">{state === "is-right" ? <CheckCircle size={20} weight="fill" /> : state === "is-wrong" ? <XCircle size={20} weight="fill" /> : tr(k)}</span>
                  <span>{tr(text)}</span>
                </button>
              );
            })}
          </div>
          <div className="portal-quiz-feedback" role="status" aria-live="polite">
            {solved && (
              <div className="portal-quiz-win">
                <strong>{tr("إجابة صحيحة. ابدأ الآن تحضيرك للامتحانات.")}</strong>
                <TactileButton variant="primary" block onClick={onSignup}>{tr("ابدأ الآن")}</TactileButton>
              </div>
            )}
            {picked !== null && !solved && <p className="portal-quiz-miss">{tr("حاول مجدداً، القانون يحتاج تركيزاً وسرعة بديهة!")}</p>}
          </div>
        </div>
        <FlashFlip />
      </div>
    </section>
  );
}

/** Flashcard that flips 180° (via an overlay button) to show the exam summary; the hidden face is aria-hidden. */
export function FlashFlip() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`portal-flip${flipped ? " is-flipped" : ""}`}>
      <div className="portal-flip-inner">
        <div className="portal-flip-face" aria-hidden={flipped}>
          <span className="portal-chip">{tr("بطاقة مراجعة")}</span>
          <strong>{tr("الفصل 230 من قانون الالتزامات والعقود")}</strong>
          <span className="portal-flip-hint">{tr("انقر لقلب البطاقة")}</span>
        </div>
        <div className="portal-flip-face portal-flip-back" aria-hidden={!flipped}>
          <span>{tr("الالتزامات التعاقدية المنشأة على وجه صحيح تقوم مقام القانون بالنسبة إلى منشئيها...")}</span>
          <ul>
            <li>{tr("العقد ملزم لأطرافه كالقانون.")}</li>
            <li>{tr("لا يُعدَّل ولا يُنقض إلا باتفاقهم أو في الحالات المقررة قانوناً.")}</li>
            <li>{tr("هذه هي قاعدة القوة الملزمة للعقد.")}</li>
          </ul>
        </div>
      </div>
      <button type="button" className="portal-flip-btn" aria-pressed={flipped} aria-label={tr("قلب البطاقة")} onClick={() => setFlipped((f) => !f)} />
    </div>
  );
}

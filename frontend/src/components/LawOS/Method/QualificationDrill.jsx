import { useEffect, useState } from "react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Textarea, Notice } from "../ui";
import CitationPanel from "./CitationPanel";
import { tr } from "@/components/LawOS/lib/i18n";

const VERDICT = {
  correct: [tr("صحيح"), "var(--law-ok)"],
  partial: [tr("ناقص"), "var(--law-warn)"],
  wrong: [tr("خطأ"), "var(--law-danger)"],
};

/** Quick "which offence / which regime?" rounds from qualification cards (spec §10.2). Answer first. */
export default function QualificationDrill() {
  const [cards, setCards] = useState(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Law.drills().then((r) => setCards(r.ok ? r.data.cards : []));
  }, []);

  async function submit() {
    setBusy(true);
    const r = await Law.answerDrill(cards[i].id, answer);
    setBusy(false);
    if (r.ok) setResult(r.data);
    else
      setMsg(
        r.status === 402
          ? tr("المساعد القانوني الذكي غير متاح مؤقتاً.")
          : r.data?.error || tr("تعذر التصحيح")
      );
  }

  if (!cards) return null;
  if (!cards.length)
    return (
      <EmptyState title={tr("لا بطاقات تكييف بعد")}>
        {tr(
          "أنشئ بطاقات من نوع «تكييف» (وقائع في الوجه، التكييف والعناصر في الظهر) لتتدرب هنا."
        )}
      </EmptyState>
    );
  const card = cards[i];
  return (
    <div className="flex flex-col gap-3">
      <span className="law-muted text-xs">
        <bdi dir="ltr">
          {i + 1}/{cards.length}
        </bdi>
      </span>
      <Card className="p-4">
        <p className="whitespace-pre-wrap leading-8">{card.front}</p>
      </Card>
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={!!result}
        placeholder={tr("ما التكييف القانوني؟")}
      />
      {msg && <Notice tone="warn">{msg}</Notice>}
      {!result ? (
        <Button onClick={submit} disabled={busy || answer.trim().length < 3}>
          {tr("تحقق")}
        </Button>
      ) : (
        <Card className="flex flex-col gap-2 p-4">
          <span
            className="text-lg font-bold"
            style={{ color: VERDICT[result.verdict][1] }}
          >
            {VERDICT[result.verdict][0]}
          </span>
          <CitationPanel check={result.citationCheck} />
          <p className="leading-8">{result.explanation}</p>
          <p className="law-muted text-sm">
            {tr("الجواب المرجعي:")} {result.reference}
          </p>
          <Button
            onClick={() => {
              setI((x) => (x + 1) % cards.length);
              setAnswer("");
              setResult(null);
            }}
          >
            {tr("التالي")}
          </Button>
        </Card>
      )}
    </div>
  );
}

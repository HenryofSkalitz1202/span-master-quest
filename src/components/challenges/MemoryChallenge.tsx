import { useEffect, useMemo, useRef, useState } from "react";
import { createChallenge, ChallengeItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = { onComplete: (score: number) => void; onBack: () => void };
type Mapping = Record<string, string>;

const ICONS: Record<string, string> = {
  house: "🏠",
  tree: "🌳",
  car: "🚗",
  shop: "🏬",
  bench: "🪑",
  lamp: "💡",
  school: "🏫",
  tower: "🗼",
  boat: "⛵",
};

const MEMORIZE_SEC = 20;
const ANSWER_SEC = 10;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function MemoryChallenge({ onComplete, onBack }: Props) {
  const [items, setItems] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ix, setIx] = useState(0);
  const [score, setScore] = useState(0);

  const [phase, setPhase] = useState<"memorize" | "answer">("memorize");

  // timers
  const [memLeft, setMemLeft] = useState(MEMORIZE_SEC);
  const [ansLeft, setAnsLeft] = useState(ANSWER_SEC);
  const memIntRef = useRef<number | null>(null);
  const ansIntRef = useRef<number | null>(null);

  // state jawaban
  const [mapping, setMapping] = useState<Mapping>({});
  const [seqInputs, setSeqInputs] = useState<number[]>([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const doc = await createChallenge("memory", "medium", true);
        setItems(doc.items || []);
      } catch (e: any) {
        toast.error(e?.message || "Gagal memuat tantangan");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // mulai ulang fase & timer tiap pindah soal
  useEffect(() => {
    if (!items[ix]) return;

    // reset input
    setMapping({});
    setSeqInputs([]);
    setSelectedText(null);

    // bersihkan interval lama
    if (memIntRef.current) window.clearInterval(memIntRef.current);
    if (ansIntRef.current) window.clearInterval(ansIntRef.current);

    // set fase memorize 20s
    setPhase("memorize");
    setMemLeft(MEMORIZE_SEC);
    setAnsLeft(ANSWER_SEC);

    memIntRef.current = window.setInterval(() => {
      setMemLeft((s) => {
        if (s <= 1) {
          // selesai memorize -> masuk fase jawab
          if (memIntRef.current) window.clearInterval(memIntRef.current);
          startAnswerTimer();
          setPhase("answer");
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (memIntRef.current) window.clearInterval(memIntRef.current);
      if (ansIntRef.current) window.clearInterval(ansIntRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ix, items]);

  function startAnswerTimer() {
    if (ansIntRef.current) window.clearInterval(ansIntRef.current);
    setAnsLeft(ANSWER_SEC);
    ansIntRef.current = window.setInterval(() => {
      setAnsLeft((s) => {
        if (s <= 1) {
          if (ansIntRef.current) window.clearInterval(ansIntRef.current);
          // auto-submit saat waktu habis
          submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  const it = items[ix];

  const lexiconChoices = useMemo(() => {
    if (!it || it.variant !== "lexicon_match") return {};
    const pairs: { term: string; definition: string }[] = it.render?.pairs || [];
    const pool = [...pairs.map((p) => p.definition), ...(it.render?.distractors || [])];
    const byTerm: Record<string, string[]> = {};
    pairs.forEach((p) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      byTerm[p.term] = shuffled;
    });
    return byTerm;
  }, [it]);

  function next() {
    if (ix + 1 < items.length) setIx(ix + 1);
    else onComplete(score);
  }

  function submit(auto = false) {
    if (!it) return;

    let ok = false;

    if (it.variant === "lexicon_match") {
      const pairs: { term: string; definition: string }[] = it.render?.pairs || [];
      ok = pairs.length > 0 && pairs.every((p) => mapping[p.term] === p.definition);
    }

    if (it.variant === "sequence_missing") {
      const seq: number[] = it.render?.sequence || [];
      const mask: number[] = it.render?.maskIndices || [];
      ok = mask.length > 0 && mask.every((m, j) => Number(seqInputs[j]) === Number(seq[m]));
    }

    if (it.variant === "scene_recall") {
      const change = it.render?.change;
      const expect =
        change?.type === "removed"
          ? change?.targetId
          : change?.type === "moved"
          ? `${change?.targetId}@${change?.to?.[0]}-${change?.to?.[1]}`
          : null;
      ok = !!expect && selectedText === expect;
    }

    // skor: hanya saat jawaban benar (auto-submit yang kosong = salah)
    setScore((s) => s + (ok ? 1000 : 0));
    next();
  }

  if (loading) return <div className="p-6">Memuat…</div>;
  if (!items.length || !it) return <div className="p-6">Tidak ada soal.</div>;

  return (
    <div className="container max-w-3xl mx-auto py-6">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Kembali</Button>
        <div className="text-sm text-muted-foreground">
          Soal {ix + 1} / {items.length} • Skor: {score}
        </div>
      </div>

      {/* timer header */}
      <div className="mb-3 text-sm">
        {phase === "memorize" ? (
          <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1">
            <span className="font-medium">Waktu menghafal</span>
            <span className="tabular-nums">{fmt(memLeft)}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1">
            <span className="font-medium">Waktu menjawab</span>
            <span className="tabular-nums">{fmt(ansLeft)}</span>
          </div>
        )}
      </div>

      {/* 1) LEXICON MATCH */}
      {it.variant === "lexicon_match" && (
        <Card>
          <CardHeader><CardTitle>{it.prompt}</CardTitle></CardHeader>
          <CardContent>
            {phase === "memorize" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(it.render?.pairs || []).map((p: any) => (
                  <div key={p.term} className="p-3 border rounded-lg flex justify-between">
                    <span className="font-medium">{p.term}</span>
                    <span className="text-muted-foreground">{p.definition}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(it.render?.pairs || []).map((p: any) => (
                  <div key={p.term} className="p-3 border rounded-lg">
                    <div className="mb-2 font-medium">{p.term}</div>
                    <select
                      className="w-full border rounded-md p-2 bg-background"
                      value={mapping[p.term] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [p.term]: e.target.value }))}
                    >
                      <option value="">— pilih definisi —</option>
                      {(lexiconChoices[p.term] || []).map((d: string) => (
                        <option key={`${p.term}:${d}`} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2) SEQUENCE MISSING */}
      {it.variant === "sequence_missing" && (
        <Card>
          <CardHeader><CardTitle>{it.prompt}</CardTitle></CardHeader>
          <CardContent>
            {phase === "memorize" ? (
              <div className="flex flex-wrap gap-2">
                {(it.render?.sequence || []).map((n: number, i: number) => (
                  <div key={i} className="px-3 py-2 rounded-lg border bg-muted">{n}</div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(it.render?.sequence || []).map((n: number, i: number) => {
                  const mask = (it.render?.maskIndices || []) as number[];
                  const at = mask.indexOf(i);
                  if (at >= 0) {
                    return (
                      <Input
                        key={i}
                        type="number"
                        inputMode="numeric"
                        className="w-16 text-center"
                        placeholder="?"
                        value={seqInputs[at] ?? ""}
                        onChange={(e) => {
                          const arr = [...seqInputs];
                          arr[at] = Number(e.target.value);
                          setSeqInputs(arr);
                        }}
                      />
                    );
                  }
                  return <div key={i} className="px-3 py-2 rounded-lg border bg-muted">{n}</div>;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3) SCENE RECALL */}
      {it.variant === "scene_recall" && (
        <Card>
          <CardHeader><CardTitle>{it.prompt}</CardTitle></CardHeader>
          <CardContent>
            {phase === "memorize" && (
              <div
                className="grid border rounded-lg"
                style={{ gridTemplateColumns: `repeat(${it.render?.grid || 4}, 48px)`, gap: 4, padding: 4 }}
              >
                {Array.from({ length: (it.render?.grid || 4) ** 2 }, (_, k) => {
                  const r = Math.floor(k / (it.render?.grid || 4));
                  const c = k % (it.render?.grid || 4);
                  const obj = (it.render?.objects || []).find((o: any) => o.pos?.[0] === r && o.pos?.[1] === c);
                  return (
                    <div key={k} className="h-12 w-12 border rounded-md flex items-center justify-center bg-muted/40">
                      {obj ? (ICONS[obj.icon] || "⬛") : ""}
                    </div>
                  );
                })}
              </div>
            )}

            {phase === "answer" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {((it.answerSpec?.options || it.options || []) as string[]).map((opt) => (
                  <button
                    key={opt}
                    className={`p-3 border rounded-lg text-left hover:shadow ${selectedText === opt ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedText(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* controls */}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => (phase === "memorize" ? undefined : next())} disabled={phase === "memorize"}>
          Lewati
        </Button>
        <Button onClick={() => submit(false)} disabled={phase === "memorize"}>
          Kirim Jawaban
        </Button>
      </div>
    </div>
  );
}

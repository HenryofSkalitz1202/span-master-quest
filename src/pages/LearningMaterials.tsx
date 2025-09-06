// src/pages/LearningMaterials.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Upload,
  FileText,
  Sparkles,
  Download,
  Check,
  X,
  RefreshCcw,
  Play,
} from "lucide-react";

// ---------- Types ----------
type ApiQuizItem = {
  id?: string;
  pertanyaan: string;
  opsi: string[];
  jawaban: "A" | "B" | "C" | "D";
  penjelasan?: string;
};

type ApiQuizResponse = {
  items: ApiQuizItem[];
  meta: Record<string, any>;
  quiz_id?: string;
};

type UIQuestion = {
  id: number;
  qid: string;
  question: string;
  options: string[]; // sudah di-acak & dibersihkan dari prefix huruf
  correct: number;   // index benar pada URUTAN TAMPILAN (0..3)
  order: number[];   // mapping index tampil -> index asli (0..3)
  explanation?: string;
};

type AttemptAnswer = {
  question_id: string;
  chosen_index: number; // 0..3, -1 = tidak menjawab
  order: number[];
  time_sec: number;
};

type StoredQuiz = {
  id: string;
  createdAt: number;
  n: number;
  difficulty: string;
  language: string;
  includeExplanation: boolean;
  fileName?: string;
  items: UIQuestion[];
};

type StoredAttempt = {
  quizId: string;
  playerName?: string;
  score: number;
  correctCount: number;
  total: number;
  startedAt: number;
  endedAt: number;
  answers: AttemptAnswer[];
};

// ---------- Consts ----------
const API_BASE = "/api"; // via Vite proxy
const LANGS = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];
const EXPLAIN_DELAY_SEC = 5;
const MAX_TIME = 20; // detik per soal
const LS_LAST_QUIZ = "matea.lastQuiz";
const LS_HISTORY = "matea.history";

// ---------- Utils ----------
const letterToIndex = (c: string): number => {
  const k = (c || "").trim().toUpperCase();
  return k === "B" ? 1 : k === "C" ? 2 : k === "D" ? 3 : 0;
};
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

// Hapus awalan "A. ", "B) ", "C - " pada teks opsi
const stripOptionPrefix = (s: string) =>
  (s ?? "").replace(/^\s*[A-Da-d]\s*[\.\)\-:]\s*/u, "").trim();

// Rapikan Markdown dari model (opsional tapi membantu)
const normalizeMd = (s: string) =>
  (s || "")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/^\s*\*\*(.+?)\*\*:/gm, "## $1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Siapkan soal: acak opsi & simpan order (untuk penilaian konsisten)
function prepareQuestions(items: ApiQuizItem[]): UIQuestion[] {
  return items.map((raw, idx) => {
    const baseCorrect = letterToIndex(raw.jawaban);
    const pairs = (raw.opsi || ["A", "B", "C", "D"]).map((text, i) => ({
      text: stripOptionPrefix(text),
      i,
    }));
    // Fisher-Yates shuffle
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const order = pairs.map((p) => p.i);
    const correct = Math.max(0, order.indexOf(baseCorrect));
    return {
      id: idx + 1,
      qid: raw.id || `q${idx + 1}`,
      question: raw.pertanyaan ?? "",
      options: pairs.map((p) => p.text),
      correct,
      order,
      explanation: raw.penjelasan || "",
    };
  });
}

// localStorage helpers
const saveLastQuiz = (q: StoredQuiz) =>
  localStorage.setItem(LS_LAST_QUIZ, JSON.stringify(q));
const loadHistory = (): StoredAttempt[] =>
  JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
const pushHistory = (a: StoredAttempt) => {
  const arr = loadHistory();
  arr.unshift(a);
  localStorage.setItem(LS_HISTORY, JSON.stringify(arr.slice(0, 50)));
};

// ---------- Component ----------
const LearningMaterials = () => {
  // builder form
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [n, setN] = useState<number>(10);
  const [difficulty, setDifficulty] =
    useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [language, setLanguage] = useState<string>("id");
  const [playerName, setPlayerName] = useState<string>("");

  // load/generate
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<UIQuestion[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);

  // summary (opsional)
  const [summary, setSummary] = useState<string>("");
  const [showSummary, setShowSummary] = useState(false);

  // play state
  const [isPlaying, setIsPlaying] = useState(false);
  const [curr, setCurr] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [score, setScore] = useState(0);

  // timers
  const [timeLeft, setTimeLeft] = useState(MAX_TIME);
  const timerRef = useRef<number | null>(null);

  // timer jeda pembahasan
  const [explainLeft, setExplainLeft] = useState(0);
  const explainRef = useRef<number | null>(null);

  // jawaban & waktu
  const answersRef = useRef<AttemptAnswer[]>([]);
  const pushedRef = useRef<boolean>(false);
  const startedAtRef = useRef<number>(0);

  // history lokal
  const [history, setHistory] = useState<StoredAttempt[]>([]);

  // progress
  const progress = useMemo(
    () => (questions.length ? (curr / questions.length) * 100 : 0),
    [curr, questions.length]
  );

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // ---- file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Hanya mendukung PDF untuk saat ini.");
      return;
    }
    setError(null);
    setUploadedFile(f);

    // reset
    setQuestions([]);
    setQuizId(null);
    setIsPlaying(false);
    setSummary("");
    setShowSummary(false);
  };

  // ---- fetch quiz
  const fetchQuestions = async () => {
    if (!uploadedFile) return;
    setIsGenerating(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("files", uploadedFile, uploadedFile.name);
      const qs = new URLSearchParams({
        n: String(n),
        difficulty,
        include_explanation: String(includeExplanation),
        output_language: language,
      }).toString();
      const res = await fetch(`${API_BASE}/quiz/from-files?${qs}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Gagal (HTTP ${res.status})`);
      }
      const data = (await res.json()) as ApiQuizResponse;
      const prepared = prepareQuestions(data.items || []);
      const newQuizId = data.quiz_id || `local-${Date.now()}`;

      setQuestions(prepared);
      setQuizId(newQuizId);

      // simpan draft/hasil generate ke localStorage
      saveLastQuiz({
        id: newQuizId,
        createdAt: Date.now(),
        n,
        difficulty,
        language,
        includeExplanation,
        fileName: uploadedFile?.name,
        items: prepared,
      });

      // reset play state
      setCurr(0);
      setSelected(null);
      setReveal(false);
      setScore(0);
      setIsPlaying(false);
      answersRef.current = [];
      pushedRef.current = false;
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan saat membuat soal.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- ringkasan (opsional)
  const fetchSummary = async () => {
    if (!uploadedFile) return;
    setIsSummarizing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("files", uploadedFile, uploadedFile.name);
      const qs = new URLSearchParams({
        output_language: language,
        max_chars: "1000",
      }).toString();
      const res = await fetch(`${API_BASE}/summary/from-files?${qs}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Gagal ringkas (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSummary(normalizeMd(data.summary || ""));
      setShowSummary(true);
    } catch (e: any) {
      setError(e?.message || "Gagal membuat ringkasan.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // ---- timer soal
  useEffect(() => {
    if (!isPlaying) return;
    setTimeLeft(MAX_TIME);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (!pushedRef.current) {
            const q = questions[curr];
            answersRef.current.push({
              question_id: q.qid,
              chosen_index: -1,
              order: q.order,
              time_sec: MAX_TIME,
            });
            pushedRef.current = true;
          }
          if (timerRef.current) window.clearInterval(timerRef.current);
          setReveal(true);
          startExplainCountdown();
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, curr]);

  // ---- countdown jeda pembahasan
  const startExplainCountdown = () => {
    setExplainLeft(EXPLAIN_DELAY_SEC);
    if (explainRef.current) window.clearInterval(explainRef.current);
    explainRef.current = window.setInterval(() => {
      setExplainLeft((s) => {
        if (s <= 1) {
          if (explainRef.current) window.clearInterval(explainRef.current);
          handleNext(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000) as unknown as number;
  };

  // ---- pilih jawaban
  const choose = (idx: number) => {
    if (reveal || pushedRef.current) return;
    setSelected(idx);
    setReveal(true);

    if (timerRef.current) window.clearInterval(timerRef.current);

    const q = questions[curr];
    const spent = MAX_TIME - timeLeft;
    answersRef.current.push({
      question_id: q.qid,
      chosen_index: idx,
      order: q.order,
      time_sec: Math.max(0, spent),
    });
    pushedRef.current = true;

    // skor
    const correct = idx === q.correct;
    if (correct) {
      const base = 700;
      const bonus = Math.round((timeLeft / MAX_TIME) * 300);
      setScore((s) => s + base + bonus);
    }

    startExplainCountdown();
  };

  // ---- next / selesai
  const handleNext = (_ignored: boolean) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (explainRef.current) window.clearInterval(explainRef.current);

    if (curr + 1 < questions.length) {
      setCurr((c) => c + 1);
      setSelected(null);
      setReveal(false);
      setTimeLeft(MAX_TIME);
      setExplainLeft(0);
      pushedRef.current = false;
    } else {
      setIsPlaying(false);
      setReveal(true);

      // simpan attempt ke localStorage
      const correctCount = answersRef.current.reduce((acc, a, i) => {
        const q = questions[i];
        const chosen = a.chosen_index;
        return acc + (chosen >= 0 && chosen === q.correct ? 1 : 0);
      }, 0);

      const attempt: StoredAttempt = {
        quizId: quizId || "local",
        playerName: playerName || undefined,
        score,
        correctCount,
        total: questions.length,
        startedAt: startedAtRef.current || Date.now(),
        endedAt: Date.now(),
        answers: answersRef.current,
      };
      pushHistory(attempt);
      setHistory(loadHistory());
    }
  };

  const startQuiz = () => {
    if (!questions.length) return;
    setIsPlaying(true);
    setCurr(0);
    setSelected(null);
    setReveal(false);
    setScore(0);
    setTimeLeft(MAX_TIME);
    setExplainLeft(0);
    answersRef.current = [];
    pushedRef.current = false;
    startedAtRef.current = Date.now();
  };

  // ---- export CSV
  const exportCSV = () => {
    if (!questions.length) return;
    const header = ["No", "Question", "A", "B", "C", "D", "Answer", "Explanation"];
    const rows = questions.map((q, i) =>
      [
        i + 1,
        `"${q.question.replace(/"/g, '""')}"`,
        `"${(q.options[0] || "").replace(/"/g, '""')}"`,
        `"${(q.options[1] || "").replace(/"/g, '""')}"`,
        `"${(q.options[2] || "").replace(/"/g, '""')}"`,
        `"${(q.options[3] || "").replace(/"/g, '""')}"`,
        ["A", "B", "C", "D"][q.correct] || "A",
        `"${(q.explanation || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- UI helpers
  const ProgressBar = ({ value }: { value: number }) => (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${clamp(value, 0, 100)}%` }}
      />
    </div>
  );

  const renderOption = (text: string, idx: number) => {
    const q = questions[curr];
    const isCorrect = idx === q.correct;
    const isChosen = selected === idx;
    const showCorrect = reveal && isCorrect;
    const showWrong = reveal && isChosen && !isCorrect;

    return (
      <button
        key={idx}
        onClick={() => choose(idx)}
        disabled={reveal}
        className={cx(
          "w-full min-h-[56px] rounded-xl border px-4 py-3 text-left transition",
          "bg-card hover:shadow active:scale-[.99]",
          "whitespace-normal break-words text-pretty leading-relaxed",
          "flex items-start gap-3",
          showCorrect && "border-green-500 bg-green-50",
          showWrong && "border-red-500 bg-red-50",
          !reveal && "hover:border-primary"
        )}
      >
        <span
          className={cx(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-semibold",
            showCorrect
              ? "bg-green-500 text-white border-green-500"
              : showWrong
              ? "bg-red-500 text-white border-red-500"
              : "bg-muted"
          )}
        >
          {String.fromCharCode(65 + idx)}
        </span>
        <span className="block">{text}</span>
        {showCorrect && <Check className="ml-auto mt-1 h-5 w-5 text-green-600" />}
        {showWrong && <X className="ml-auto mt-1 h-5 w-5 text-red-600" />}
      </button>
    );
  };

  const resetQuiz = () => {
    setQuestions([]);
    setQuizId(null);
    setIsPlaying(false);
    setReveal(false);
    setScore(0);
    setTimeLeft(MAX_TIME);
    setExplainLeft(0);
    answersRef.current = [];
    pushedRef.current = false;
  };

  // ---------- RENDER ----------
  return (
    <div className="min-h-screen bg-background pt-20 p-6">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Materi Pembelajaran AI
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload PDF & buat kuis interaktif ala Quizizz
          </p>
        </div>

        {/* Builder */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Buat Kuis dari PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="pdf-upload">Pilih file PDF</Label>
                  <Input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="n">Jumlah Soal</Label>
                  <Input
                    id="n"
                    type="number"
                    min={1}
                    max={50}
                    value={n}
                    onChange={(e) => setN(Number(e.target.value || 10))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="difficulty">Tingkat</Label>
                  <select
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="language">Bahasa Output</Label>
                  <select
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="player">Nama (opsional)</Label>
                  <Input
                    id="player"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Mis. Andi"
                    className="mt-2"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <input
                    id="include_explanation"
                    type="checkbox"
                    checked={includeExplanation}
                    onChange={(e) => setIncludeExplanation(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="include_explanation">Sertakan penjelasan</Label>
                </div>
              </div>

              {uploadedFile && (
                <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg">
                  <FileText className="h-4 w-4 text-accent" />
                  <span className="text-sm">{uploadedFile.name}</span>
                  <Badge variant="secondary">
                    {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                  </Badge>
                </div>
              )}

              {error && (
                <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* CTA Area — tidak dobel */}
              <div className="flex flex-wrap gap-3">
                {!questions.length ? (
                  <>
                    <Button
                      onClick={fetchQuestions}
                      disabled={!uploadedFile || isGenerating}
                      className="bg-gradient-primary hover:bg-gradient-primary/90"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isGenerating ? "Membuat Soal..." : "Buat Soal dengan AI"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={fetchSummary}
                      disabled={!uploadedFile || isSummarizing}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {isSummarizing ? "Meringkas..." : "Ringkas Materi"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={startQuiz}>
                      <Play className="h-4 w-4 mr-2" />
                      Kerjakan Soal
                    </Button>
                    <Button variant="outline" onClick={exportCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Soal
                    </Button>
                    <Button variant="ghost" onClick={resetQuiz}>
                      <RefreshCcw className="h-4 w-4 mr-2" />
                      Buat Ulang
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RINGKASAN MATERI (Markdown + GFM) */}
        {summary && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ringkasan Materi</CardTitle>
                <Button variant="ghost" onClick={() => setShowSummary((v) => !v)}>
                  {showSummary ? "Sembunyikan" : "Tampilkan"}
                </Button>
              </div>
            </CardHeader>
            {showSummary && (
              <CardContent>
                <div className="text-sm leading-relaxed
                                [&_ul]:list-disc [&_ul]:pl-5
                                [&_ol]:list-decimal [&_ol]:pl-5
                                [&_h2]:text-base [&_h2]:font-semibold
                                [&_h3]:text-sm [&_h3]:font-semibold">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summary}
                  </ReactMarkdown>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* READY CARD */}
        {questions.length > 0 && !isPlaying && (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Kuis siap 🎯</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
                <Badge variant="outline">{questions.length} soal</Badge>
                <span>• Tingkat: <b>{difficulty}</b></span>
                <span>• Bahasa: <b>{language.toUpperCase()}</b></span>
                <span>• Estimasi: ~{Math.ceil((questions.length * MAX_TIME) / 60)} menit</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={startQuiz}
                  className="bg-gradient-accent hover:bg-gradient-accent/90"
                >
                  Kerjakan Soal
                </Button>
                <Button variant="outline" onClick={exportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PLAY MODE */}
        {questions.length > 0 && isPlaying && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Soal {curr + 1} dari {questions.length}
                </CardTitle>
                <Badge variant="outline">{questions.length} soal</Badge>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex-1">
                  <ProgressBar value={progress} />
                </div>
                <div
                  className={cx(
                    "w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-semibold",
                    timeLeft <= 5 ? "bg-red-100 text-red-600" : "bg-muted"
                  )}
                >
                  {timeLeft}s
                </div>
                <div className="px-3 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium">
                  Skor: {score}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-5">
                <div className="text-lg font-medium">
                  {questions[curr].question}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {questions[curr].options.map((opt, i) => renderOption(opt, i))}
                </div>

                {reveal && (
                  <div className="mt-1 p-3 bg-muted/50 rounded text-sm flex items-start justify-between gap-3">
                    <div>
                      {questions[curr].explanation ? (
                        <>
                          <strong>Penjelasan:</strong> {questions[curr].explanation}
                        </>
                      ) : (
                        <em>Tidak ada penjelasan.</em>
                      )}
                    </div>
                    <div className="text-muted-foreground whitespace-nowrap">
                      Lanjut otomatis: <b>{explainLeft}s</b>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <div className="text-sm text-muted-foreground">
                    {curr + 1}/{questions.length}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (timerRef.current) window.clearInterval(timerRef.current);
                        if (explainRef.current) window.clearInterval(explainRef.current);
                        setIsPlaying(false);
                      }}
                    >
                      Keluar
                    </Button>
                    <Button
                      onClick={() => {
                        if (!reveal) {
                          // treat tidak menjawab
                          const q = questions[curr];
                          if (!pushedRef.current) {
                            answersRef.current.push({
                              question_id: q.qid,
                              chosen_index: -1,
                              order: q.order,
                              time_sec: MAX_TIME - timeLeft,
                            });
                            pushedRef.current = true;
                          }
                          setReveal(true);
                          if (timerRef.current) window.clearInterval(timerRef.current);
                          startExplainCountdown();
                        } else {
                          handleNext(false);
                        }
                      }}
                    >
                      {curr + 1 < questions.length ? "Lanjut" : "Selesai"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Result banner (selesai) */}
              {!isPlaying && reveal && curr + 1 === questions.length && (
                <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">Selesai! 🎉</div>
                      <div className="text-sm text-muted-foreground">
                        Skor akhir:{" "}
                        <span className="font-semibold text-primary">
                          {score}
                        </span>{" "}
                        • Benar:{" "}
                        <span className="font-semibold">
                          {
                            answersRef.current.filter(
                              (a, i) => a.chosen_index >= 0 && a.chosen_index === questions[i].correct
                            ).length
                          }/{questions.length}
                        </span>{" "}
                        (tersimpan di perangkat)
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={startQuiz}>
                        Main Lagi
                      </Button>
                      <Button variant="outline" onClick={exportCSV}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Riwayat terbaru */}
        {history.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Riwayat Terbaru</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {history.slice(0, 5).map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {new Date(h.endedAt).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        Quiz: {h.quizId} • Pemain: {h.playerName || "-"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div>
                        Skor: <b>{h.score}</b>
                      </div>
                      <div className="text-muted-foreground">
                        Benar {h.correctCount}/{h.total}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LearningMaterials;

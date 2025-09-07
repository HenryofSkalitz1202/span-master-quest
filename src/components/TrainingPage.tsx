import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Brain, Calculator, Compass, Sparkles, Flame, Target, Trophy, Clock, Info } from "lucide-react";
import { useTrainingStore, calcLevel, DAILY_GOAL_XP } from "@/lib/trainingStore";
import { useNav } from "@/context/NavContext";

import MemoryChallenge from "@/components/challenges/MemoryChallenge";
import SpatialChallenge from "@/components/challenges/SpatialChallenge";
import NumericalChallenge from "@/components/challenges/NumericalChallenge";

type ChallengeId = "memory" | "spatial" | "numerical";
type Preview = { title: string; sample: string; hint: string };

const PREVIEWS: Record<ChallengeId, Preview> = {
  memory: { title: "Contoh: Urutan Angka", sample: "3 • 8 • 1 • 6 → ulangi urutan.", hint: "Gunakan chunk (38 | 16)." },
  spatial: { title: "Contoh: Pola & Rotasi", sample: "Pilih bentuk setelah diputar 90°.", hint: "Cari sudut/sisi jangkar." },
  numerical: { title: "Contoh: Aritmetika Cepat", sample: "27 × 4 – 18 ÷ 3 = ?", hint: "Prioritaskan operasi, jaga ritme." },
};

const isChallengeId = (v: any): v is ChallengeId =>
  v === "memory" || v === "spatial" || v === "numerical";

export default function TrainingPage() {
  const [selected, setSelected] = useState<ChallengeId | null>(null);
  const [adaptive, setAdaptive] = useState(true);
  const [showPreviewFor, setShowPreviewFor] = useState<ChallengeId | null>(null);
  const [quickDuration, setQuickDuration] = useState<5 | 10 | 15>(10);

  const { data, addSession, dailyXPToday } = useTrainingStore();
  const { level, xpInLevel, progress, toNext } = calcLevel(data.xp);
  const dailyProgress = Math.min(100, Math.round((Math.min(dailyXPToday, DAILY_GOAL_XP) / DAILY_GOAL_XP) * 100));
  const nav = useNav();

  const challenges = useMemo(
    () => [
      { id: "memory" as const, title: "Tantangan Memori", description: "Ingat urutan angka", icon: Brain, difficulty: "Mudah", estimatedTime: "5–10 m", color: "from-blue-400 to-blue-600" },
      { id: "spatial" as const, title: "Tantangan Spasial", description: "Pola & ruang", icon: Compass, difficulty: "Sedang", estimatedTime: "8–15 m", color: "from-green-400 to-green-600" },
      { id: "numerical" as const, title: "Tantangan Numerik", description: "Hitung & logika", icon: Calculator, difficulty: "Menantang", estimatedTime: "10–20 m", color: "from-orange-400 to-orange-600" },
    ],
    []
  );

  const dailyChallenge: ChallengeId = useMemo(() => {
    const ids: ChallengeId[] = ["memory", "spatial", "numerical"];
    return ids[new Date().getDate() % ids.length];
  }, []);

  // >>> Auto-open jika datang dari Dashboard
  useEffect(() => {
    const pending = localStorage.getItem("matea.pendingChallenge");
    if (pending && isChallengeId(pending)) {
      setSelected(pending);
      localStorage.removeItem("matea.pendingChallenge");
    }
  }, []);

  // kompatibel: onComplete(score) atau onComplete(score, success)
  const handleComplete = (rawScore: number) => {
    if (!selected) return;
    const bonus = (new Date().getDate() % 3 === ["memory","spatial","numerical"].indexOf(selected)) ? 2 : 1; // sama spt dailyChallenge
    const score = Number.isFinite(rawScore) ? rawScore : 10;

    addSession({
      challengeId: selected,
      score,
      durationMin: quickDuration,
      bonusMultiplier: bonus,
      adaptive,
    });

    setSelected(null);
    nav.go("dashboard"); // lihat progres naik
  };

  // keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected) return;
      if (e.key.toLowerCase() === "m") setSelected("memory");
      if (e.key.toLowerCase() === "s") setSelected("spatial");
      if (e.key.toLowerCase() === "n") setSelected("numerical");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // render detail challenge (tanpa props ekstra supaya TS aman)
  if (selected === "memory")
    return <MemoryChallenge onComplete={handleComplete} onBack={() => setSelected(null)} />;
  if (selected === "spatial")
    return <SpatialChallenge onComplete={handleComplete} onBack={() => setSelected(null)} />;
  if (selected === "numerical")
    return <NumericalChallenge onComplete={handleComplete} onBack={() => setSelected(null)} />;

  const quickStart = () => {
    if (adaptive) {
      const pick: ChallengeId = xpInLevel < 35 ? "memory" : xpInLevel < 70 ? "spatial" : "numerical";
      setSelected(pick);
    } else {
      const ids: ChallengeId[] = ["memory", "spatial", "numerical"];
      setSelected(ids[Math.floor(Math.random() * ids.length)]);
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background pt-20 p-6">
        <div className="container mx-auto max-w-5xl">
          {/* Header metrik */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                  Latihan Perhatian
                </h1>
                <p className="text-muted-foreground">Bangun fokus & kecepatan berpikir lewat sesi singkat.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Level</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-bold">{level}</div>
                    <Badge variant="secondary">{`${(data.xp % 100)}/100 XP`}</Badge>
                  </div>
                  <Progress value={progress} className="h-2 mt-2" />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Daily Goal</div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <div className="text-sm">{dailyProgress}%</div>
                  </div>
                  <Progress value={dailyProgress} className="h-2 mt-2" />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Streak</div>
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    <div className="text-xl font-semibold">{data.streak}</div>
                    <span className="text-xs text-muted-foreground">hari</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Daily + Quick */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" /> Tantangan Harian
                </CardTitle>
                <Badge className="bg-gradient-primary">XP 2×</Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Hari ini fokus pada:</div>
                  <div className="text-xl font-semibold capitalize">
                    {dailyChallenge === "memory" && "Memori"}
                    {dailyChallenge === "spatial" && "Spasial"}
                    {dailyChallenge === "numerical" && "Numerik"}
                  </div>
                  <div className="text-sm text-muted-foreground">Selesaikan sekali untuk bonus XP ganda.</div>
                </div>
                <Button onClick={() => setSelected(dailyChallenge)}>Mulai Sekarang</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-emerald-600" /> Quick Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-3">Bangun sesi cepat sesuai waktu luangmu.</div>
                <div className="flex items-center gap-2 mb-4">
                  {[5, 10, 15].map((m) => (
                    <Button
                      key={m}
                      variant={quickDuration === m ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setQuickDuration(m as 5 | 10 | 15)}
                    >
                      {m} menit
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={adaptive} onCheckedChange={setAdaptive} />
                    <div>
                      <div className="text-sm font-medium">Adaptive Mode</div>
                      <div className="text-xs text-muted-foreground">Kesulitan menyesuaikan performa</div>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left">Pilih tantangan otomatis berdasar progres level.</TooltipContent>
                  </Tooltip>
                </div>
                <Button className="w-full" onClick={quickStart}>Mulai Quick Session</Button>
                {/* tombol dev opsional untuk memastikan store bekerja */}
                {import.meta?.env?.DEV && (
                  <Button variant="outline" className="w-full mt-2" onClick={() => handleComplete(20, true)}>
                    Dev: Tambah +XP (uji simpan progres)
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* List tantangan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {challenges.map((c) => {
              const Icon = c.icon;
              const isDaily = dailyChallenge === c.id;
              return (
                <Card key={c.id} className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${c.color} flex items-center justify-center mb-4`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{c.title}</CardTitle>
                      {isDaily && <Badge>Daily</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{c.description}</p>
                    <div className="space-y-2 mb-5">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Kesulitan:</span><span className="font-medium">{c.difficulty}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Estimasi:</span><span className="font-medium">{c.estimatedTime}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setSelected(c.id)} className="flex-1 bg-gradient-primary hover:bg-gradient-primary/90 group-hover:scale-105 transition-transform">
                        Mulai Tantangan
                      </Button>
                      <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setShowPreviewFor(c.id); }}>
                        Preview
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Achievements */}
          <Card className="mt-8">
            <CardHeader><CardTitle>Pencapaian</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg flex items-center justify-between">
                <div><div className="font-medium flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Focus Starter</div><div className="text-xs text-muted-foreground">Selesaikan 1 sesi</div></div>
                <Badge variant="secondary">{data.sessions.length > 0 ? "Unlocked" : "Locked"}</Badge>
              </div>
              <div className="p-3 border rounded-lg flex items-center justify-between opacity-90">
                <div><div className="font-medium flex items-center gap-2"><Flame className="h-4 w-4 text-orange-500" /> 7-Day Streak</div><div className="text-xs text-muted-foreground">Pertahankan 7 hari</div></div>
                <Badge variant="outline">{Math.min(7, data.streak)}/7</Badge>
              </div>
              <div className="p-3 border rounded-lg flex items-center justify-between opacity-90">
                <div><div className="font-medium flex items-center gap-2"><Brain className="h-4 w-4 text-blue-600" /> Next Level</div><div className="text-xs text-muted-foreground">Butuh {toNext} XP lagi</div></div>
                <Badge variant="outline">{progress}%</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview modal */}
        <Dialog open={!!showPreviewFor} onOpenChange={() => setShowPreviewFor(null)}>
          <DialogContent>
            {showPreviewFor && (
              <>
                <DialogHeader>
                  <DialogTitle>{PREVIEWS[showPreviewFor].title}</DialogTitle>
                  <DialogDescription>{PREVIEWS[showPreviewFor].hint}</DialogDescription>
                </DialogHeader>
                <div className="p-4 rounded-md border bg-muted/30 text-sm">{PREVIEWS[showPreviewFor].sample}</div>
                <div className="flex justify-end">
                  <Button onClick={() => { setSelected(showPreviewFor); setShowPreviewFor(null); }}>
                    Coba Sekarang
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

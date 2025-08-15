import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Brain, Timer, Award, RotateCcw } from "lucide-react";

interface MemoryChallengeProps {
  onComplete: (score: number, success: boolean) => void;
  onBack: () => void;
}

const MemoryChallenge = ({ onComplete, onBack }: MemoryChallengeProps) => {
  const [gameState, setGameState] = useState<"waiting" | "playing" | "completed">("waiting");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [sequence, setSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [showingSequence, setShowingSequence] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);

  const generateSequence = (length: number) => {
    const newSequence = [];
    for (let i = 0; i < length; i++) {
      newSequence.push(Math.floor(Math.random() * 9) + 1);
    }
    return newSequence;
  };

  const startChallenge = () => {
    const sequenceLength = 3 + currentLevel;
    const newSequence = generateSequence(sequenceLength);
    setSequence(newSequence);
    setUserSequence([]);
    setGameState("playing");
    setShowingSequence(true);
    setCurrentSequenceIndex(0);
    setTimeLeft(30);
  };

  const handleNumberClick = (number: number) => {
    if (showingSequence || gameState !== "playing") return;
    
    const newUserSequence = [...userSequence, number];
    setUserSequence(newUserSequence);

    if (newUserSequence.length === sequence.length) {
      const isCorrect = newUserSequence.every((num, index) => num === sequence[index]);
      if (isCorrect) {
        const newScore = score + 10 * currentLevel;
        setScore(newScore);
        setCurrentLevel(currentLevel + 1);
        setGameState("completed");
        onComplete(newScore, true);
      } else {
        setGameState("completed");
        onComplete(score, false);
      }
    }
  };

  useEffect(() => {
    if (showingSequence && currentSequenceIndex < sequence.length) {
      const timer = setTimeout(() => {
        setCurrentSequenceIndex(currentSequenceIndex + 1);
      }, 800);
      return () => clearTimeout(timer);
    } else if (showingSequence && currentSequenceIndex >= sequence.length) {
      setTimeout(() => {
        setShowingSequence(false);
      }, 500);
    }
  }, [showingSequence, currentSequenceIndex, sequence.length]);

  useEffect(() => {
    if (gameState === "playing" && !showingSequence && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === "playing") {
      setGameState("completed");
      onComplete(score, false);
    }
  }, [gameState, showingSequence, timeLeft]);

  const resetChallenge = () => {
    setGameState("waiting");
    setCurrentLevel(1);
    setScore(0);
    setSequence([]);
    setUserSequence([]);
    setShowingSequence(false);
    setCurrentSequenceIndex(0);
  };

  const renderNumberGrid = () => {
    return (
      <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
          <Button
            key={number}
            variant={
              showingSequence && sequence[currentSequenceIndex - 1] === number
                ? "default"
                : userSequence.includes(number)
                ? "secondary"
                : "outline"
            }
            size="lg"
            className={`h-16 w-16 text-xl font-bold transition-all duration-200 ${
              showingSequence && sequence[currentSequenceIndex - 1] === number
                ? "bg-gradient-primary text-primary-foreground shadow-glow scale-110"
                : ""
            }`}
            onClick={() => handleNumberClick(number)}
            disabled={showingSequence}
          >
            {number}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Kembali
        </Button>
        <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Tantangan Memori
        </h2>
        <div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              Level
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentLevel}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-warning" />
              Waktu Tersisa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{timeLeft}d</div>
            <Progress value={(timeLeft / 30) * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-success" />
              Skor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{score}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center">
            {gameState === "waiting" && "Siap untuk memulai?"}
            {gameState === "playing" && showingSequence && "Perhatikan urutan angka..."}
            {gameState === "playing" && !showingSequence && "Ulangi urutan angka"}
            {gameState === "completed" && "Tantangan Selesai!"}
          </CardTitle>
          {gameState === "playing" && (
            <CardDescription className="text-center">
              {showingSequence 
                ? `Menampilkan ${currentSequenceIndex}/${sequence.length}` 
                : `Masukkan ${userSequence.length}/${sequence.length} angka`
              }
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {gameState === "waiting" && (
            <div className="text-center">
              <p className="text-muted-foreground mb-6">
                Anda akan melihat urutan angka. Ingat dan klik dengan urutan yang sama.
              </p>
              <Button 
                onClick={startChallenge}
                size="lg"
                className="bg-gradient-primary hover:bg-gradient-primary/90"
              >
                Mulai Tantangan
              </Button>
            </div>
          )}

          {gameState === "playing" && renderNumberGrid()}

          {gameState === "completed" && (
            <div className="text-center space-y-4">
              {userSequence.every((num, index) => num === sequence[index]) ? (
                <div>
                  <Badge variant="outline" className="mb-4 text-success border-success">
                    Sempurna! +{10 * (currentLevel - 1)} poin
                  </Badge>
                  <p className="text-muted-foreground mb-6">
                    Kerja bagus! Lanjut ke level {currentLevel}
                  </p>
                  <Button 
                    onClick={startChallenge}
                    size="lg"
                    className="mr-4 bg-gradient-primary hover:bg-gradient-primary/90"
                  >
                    Level Selanjutnya
                  </Button>
                </div>
              ) : (
                <div>
                  <Badge variant="outline" className="mb-4 text-destructive border-destructive">
                    Coba Lagi
                  </Badge>
                  <p className="text-muted-foreground mb-6">
                    Jangan khawatir, latihan membuat sempurna!
                  </p>
                  <Button 
                    onClick={startChallenge}
                    size="lg"
                    className="mr-4 bg-gradient-primary hover:bg-gradient-primary/90"
                  >
                    Ulangi Level
                  </Button>
                </div>
              )}
              <Button 
                onClick={resetChallenge}
                variant="outline"
                size="lg"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Game
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MemoryChallenge;
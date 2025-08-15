import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Compass, Timer, Award, RotateCcw } from "lucide-react";

interface SpatialChallengeProps {
  onComplete: (score: number, success: boolean) => void;
  onBack: () => void;
}

const SpatialChallenge = ({ onComplete, onBack }: SpatialChallengeProps) => {
  const [gameState, setGameState] = useState<"waiting" | "playing" | "completed">("waiting");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(45);
  const [score, setScore] = useState(0);
  const [targetPattern, setTargetPattern] = useState<boolean[]>([]);
  const [userPattern, setUserPattern] = useState<boolean[]>([]);
  const [showingPattern, setShowingPattern] = useState(false);

  const generatePattern = (size: number) => {
    const pattern = new Array(16).fill(false);
    const positions = [];
    for (let i = 0; i < 16; i++) positions.push(i);
    
    // Shuffle and take first 'size' positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    positions.slice(0, size).forEach(pos => pattern[pos] = true);
    return pattern;
  };

  const startChallenge = () => {
    const patternSize = 3 + currentLevel;
    const newPattern = generatePattern(Math.min(patternSize, 8));
    setTargetPattern(newPattern);
    setUserPattern(new Array(16).fill(false));
    setGameState("playing");
    setShowingPattern(true);
    setTimeLeft(45);
    
    setTimeout(() => setShowingPattern(false), 3000);
  };

  const handleCellClick = (index: number) => {
    if (showingPattern) return;
    
    const newUserPattern = [...userPattern];
    newUserPattern[index] = !newUserPattern[index];
    setUserPattern(newUserPattern);
  };

  const checkAnswer = () => {
    const isCorrect = targetPattern.every((cell, index) => cell === userPattern[index]);
    if (isCorrect) {
      const newScore = score + 15 * currentLevel;
      setScore(newScore);
      setCurrentLevel(currentLevel + 1);
      setGameState("completed");
      onComplete(newScore, true);
    } else {
      setGameState("completed");
      onComplete(score, false);
    }
  };

  useEffect(() => {
    if (gameState === "playing" && !showingPattern && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === "playing") {
      setGameState("completed");
      onComplete(score, false);
    }
  }, [gameState, showingPattern, timeLeft]);

  const resetChallenge = () => {
    setGameState("waiting");
    setCurrentLevel(1);
    setScore(0);
    setTargetPattern([]);
    setUserPattern([]);
    setShowingPattern(false);
  };

  const renderGrid = () => {
    return (
      <div className="grid grid-cols-4 gap-2 max-w-xs mx-auto">
        {Array.from({ length: 16 }, (_, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className={`h-16 w-16 transition-all duration-200 ${
              showingPattern && targetPattern[index]
                ? "bg-gradient-primary text-primary-foreground shadow-glow"
                : userPattern[index]
                ? "bg-accent text-accent-foreground"
                : ""
            }`}
            onClick={() => handleCellClick(index)}
            disabled={showingPattern}
          >
            {showingPattern && targetPattern[index] ? "●" : userPattern[index] ? "●" : ""}
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
          Tantangan Spasial
        </h2>
        <div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Compass className="h-4 w-4 text-accent" />
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
            <Progress value={(timeLeft / 45) * 100} className="mt-2" />
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
            {gameState === "waiting" && "Siap untuk tantangan spasial?"}
            {gameState === "playing" && showingPattern && "Ingat pola yang ditampilkan..."}
            {gameState === "playing" && !showingPattern && "Klik kotak untuk membuat pola yang sama"}
            {gameState === "completed" && "Tantangan Selesai!"}
          </CardTitle>
          {gameState === "playing" && (
            <CardDescription className="text-center">
              {showingPattern 
                ? "Perhatikan pola dengan seksama" 
                : "Klik kotak untuk menandai posisi yang benar"
              }
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {gameState === "waiting" && (
            <div className="text-center">
              <p className="text-muted-foreground mb-6">
                Anda akan melihat pola dalam grid 4x4. Ingat posisinya dan buat ulang pola yang sama.
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

          {gameState === "playing" && (
            <div className="space-y-4">
              {renderGrid()}
              {!showingPattern && (
                <div className="text-center">
                  <Button 
                    onClick={checkAnswer}
                    className="bg-gradient-success hover:bg-gradient-success/90"
                  >
                    Periksa Jawaban
                  </Button>
                </div>
              )}
            </div>
          )}

          {gameState === "completed" && (
            <div className="text-center space-y-4">
              {targetPattern.every((cell, index) => cell === userPattern[index]) ? (
                <div>
                  <Badge variant="outline" className="mb-4 text-success border-success">
                    Sempurna! +{15 * (currentLevel - 1)} poin
                  </Badge>
                  <p className="text-muted-foreground mb-6">
                    Luar biasa! Lanjut ke level {currentLevel}
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
                    Terus berlatih untuk meningkatkan kemampuan spasial!
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

export default SpatialChallenge;
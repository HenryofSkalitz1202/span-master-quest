import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calculator, Timer, Award, RotateCcw } from "lucide-react";

interface NumericalChallengeProps {
  onComplete: (score: number, success: boolean) => void;
  onBack: () => void;
}

const NumericalChallenge = ({ onComplete, onBack }: NumericalChallengeProps) => {
  const [gameState, setGameState] = useState<"waiting" | "playing" | "completed">("waiting");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [currentProblem, setCurrentProblem] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [problemsCompleted, setProblemsCompleted] = useState(0);
  const [problemsTotal] = useState(5);

  const generateProblem = () => {
    const operations = ['+', '-', '*'];
    const maxNum = 10 + currentLevel * 5;
    
    let num1 = Math.floor(Math.random() * maxNum) + 1;
    let num2 = Math.floor(Math.random() * maxNum) + 1;
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    // Ensure subtraction doesn't result in negative numbers
    if (operation === '-' && num2 > num1) {
      [num1, num2] = [num2, num1];
    }
    
    // For division, ensure clean division and no division by zero
    if (operation === '*' && currentLevel > 2) {
      // Sometimes use division instead
      if (Math.random() < 0.3) {
        const result = num1 * num2;
        setCurrentProblem(`${result} ÷ ${num2}`);
        setCorrectAnswer(num1);
        return;
      }
    }
    
    let answer: number;
    switch (operation) {
      case '+':
        answer = num1 + num2;
        break;
      case '-':
        answer = num1 - num2;
        break;
      case '*':
        answer = num1 * num2;
        break;
      default:
        answer = num1 + num2;
    }
    
    setCurrentProblem(`${num1} ${operation} ${num2}`);
    setCorrectAnswer(answer);
  };

  const startChallenge = () => {
    setGameState("playing");
    setTimeLeft(60);
    setProblemsCompleted(0);
    generateProblem();
  };

  const handleSubmitAnswer = () => {
    const isCorrect = parseInt(userAnswer) === correctAnswer;
    
    if (isCorrect) {
      const newScore = score + 5 * currentLevel;
      setScore(newScore);
      setProblemsCompleted(problemsCompleted + 1);
      
      if (problemsCompleted + 1 >= problemsTotal) {
        setCurrentLevel(currentLevel + 1);
        setGameState("completed");
        onComplete(newScore, true);
      } else {
        generateProblem();
        setUserAnswer("");
      }
    } else {
      setGameState("completed");
      onComplete(score, false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && userAnswer.trim() !== '') {
      handleSubmitAnswer();
    }
  };

  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === "playing") {
      setGameState("completed");
      onComplete(score, false);
    }
  }, [gameState, timeLeft]);

  const resetChallenge = () => {
    setGameState("waiting");
    setCurrentLevel(1);
    setScore(0);
    setProblemsCompleted(0);
    setUserAnswer("");
    setCurrentProblem("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Kembali
        </Button>
        <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Tantangan Numerik
        </h2>
        <div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calculator className="h-4 w-4 text-accent" />
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
            <Progress value={(timeLeft / 60) * 100} className="mt-2" />
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
            {gameState === "waiting" && "Siap untuk tantangan matematika?"}
            {gameState === "playing" && "Selesaikan perhitungan berikut"}
            {gameState === "completed" && "Tantangan Selesai!"}
          </CardTitle>
          {gameState === "playing" && (
            <CardDescription className="text-center">
              Soal {problemsCompleted + 1} dari {problemsTotal}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {gameState === "waiting" && (
            <div className="text-center">
              <p className="text-muted-foreground mb-6">
                Selesaikan {problemsTotal} soal matematika dengan cepat dan akurat. 
                Tingkat kesulitan akan meningkat setiap level.
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
            <div className="text-center space-y-6">
              <div className="text-4xl font-bold mb-4">
                {currentProblem} = ?
              </div>
              <div className="max-w-xs mx-auto">
                <Input
                  type="number"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Masukkan jawaban..."
                  className="text-center text-xl"
                  autoFocus
                />
              </div>
              <Button 
                onClick={handleSubmitAnswer}
                disabled={userAnswer.trim() === ''}
                className="bg-gradient-success hover:bg-gradient-success/90"
              >
                Kirim Jawaban
              </Button>
              <Progress 
                value={(problemsCompleted / problemsTotal) * 100} 
                className="max-w-xs mx-auto"
              />
            </div>
          )}

          {gameState === "completed" && (
            <div className="text-center space-y-4">
              {problemsCompleted >= problemsTotal ? (
                <div>
                  <Badge variant="outline" className="mb-4 text-success border-success">
                    Sempurna! +{5 * (currentLevel - 1) * problemsTotal} poin
                  </Badge>
                  <p className="text-muted-foreground mb-6">
                    Hebat! Semua soal berhasil diselesaikan. Lanjut ke level {currentLevel}
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
                    Terus berlatih untuk meningkatkan kemampuan matematika!
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

export default NumericalChallenge;
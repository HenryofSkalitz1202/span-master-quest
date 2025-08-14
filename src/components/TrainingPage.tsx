import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Brain, Timer, Award, RotateCcw } from "lucide-react";

const TrainingPage = () => {
  const [gameState, setGameState] = useState<"waiting" | "playing" | "completed">("waiting");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [sequence, setSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [showingSequence, setShowingSequence] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);

  // Memory Challenge Logic
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

    // Check if sequence is complete
    if (newUserSequence.length === sequence.length) {
      const isCorrect = newUserSequence.every((num, index) => num === sequence[index]);
      if (isCorrect) {
        setScore(score + 10 * currentLevel);
        setCurrentLevel(currentLevel + 1);
        setGameState("completed");
      } else {
        setGameState("completed");
      }
    }
  };

  // Show sequence animation
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

  // Game timer
  useEffect(() => {
    if (gameState === "playing" && !showingSequence && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === "playing") {
      setGameState("completed");
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
    <div className="min-h-screen bg-background pt-20 p-6">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Memory Challenge
          </h1>
          <p className="text-muted-foreground text-lg">
            Remember the sequence and repeat it back
          </p>
        </div>

        {/* Game Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
                Time Left
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{timeLeft}s</div>
              <Progress value={(timeLeft / 30) * 100} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="h-4 w-4 text-success" />
                Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{score}</div>
            </CardContent>
          </Card>
        </div>

        {/* Game Area */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-center">
              {gameState === "waiting" && "Ready to start?"}
              {gameState === "playing" && showingSequence && "Watch the sequence..."}
              {gameState === "playing" && !showingSequence && "Repeat the sequence"}
              {gameState === "completed" && "Challenge Complete!"}
            </CardTitle>
            {gameState === "playing" && (
              <CardDescription className="text-center">
                {showingSequence 
                  ? `Showing ${currentSequenceIndex}/${sequence.length}` 
                  : `Enter ${userSequence.length}/${sequence.length} numbers`
                }
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            {gameState === "waiting" && (
              <div className="text-center">
                <p className="text-muted-foreground mb-6">
                  You'll see a sequence of numbers. Remember them and click in the same order.
                </p>
                <Button 
                  onClick={startChallenge}
                  size="lg"
                  className="bg-gradient-primary hover:bg-gradient-primary/90"
                >
                  Start Challenge
                </Button>
              </div>
            )}

            {gameState === "playing" && renderNumberGrid()}

            {gameState === "completed" && (
              <div className="text-center space-y-4">
                {userSequence.every((num, index) => num === sequence[index]) ? (
                  <div>
                    <Badge variant="outline" className="mb-4 text-success border-success">
                      Perfect! +{10 * (currentLevel - 1)} points
                    </Badge>
                    <p className="text-muted-foreground mb-6">
                      Excellent work! Moving to level {currentLevel}
                    </p>
                    <Button 
                      onClick={startChallenge}
                      size="lg"
                      className="mr-4 bg-gradient-primary hover:bg-gradient-primary/90"
                    >
                      Next Level
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Badge variant="outline" className="mb-4 text-destructive border-destructive">
                      Try Again
                    </Badge>
                    <p className="text-muted-foreground mb-6">
                      Don't worry, practice makes perfect!
                    </p>
                    <Button 
                      onClick={startChallenge}
                      size="lg"
                      className="mr-4 bg-gradient-primary hover:bg-gradient-primary/90"
                    >
                      Retry Level
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

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Play</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Watch carefully as numbers light up in sequence</li>
              <li>• After the sequence ends, click the numbers in the same order</li>
              <li>• Each level adds one more number to remember</li>
              <li>• You have 30 seconds to complete each level</li>
              <li>• Score points based on your current level</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrainingPage;
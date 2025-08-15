import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Calculator, Compass, ArrowLeft } from "lucide-react";
import MemoryChallenge from "./challenges/MemoryChallenge";
import SpatialChallenge from "./challenges/SpatialChallenge";
import NumericalChallenge from "./challenges/NumericalChallenge";

const TrainingPage = () => {
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null);
  const [userScore, setUserScore] = useState(0);

  const challenges = [
    {
      id: "memory",
      title: "Tantangan Memori",
      description: "Tes kemampuan mengingat urutan angka",
      icon: Brain,
      difficulty: "Mudah",
      estimatedTime: "5-10 menit",
      color: "from-blue-400 to-blue-600"
    },
    {
      id: "spatial",
      title: "Tantangan Spasial", 
      description: "Tes kemampuan memahami pola dan ruang",
      icon: Compass,
      difficulty: "Sedang",
      estimatedTime: "8-15 menit",
      color: "from-green-400 to-green-600"
    },
    {
      id: "numerical",
      title: "Tantangan Numerik",
      description: "Tes kemampuan menghitung dan logika matematika",
      icon: Calculator,
      difficulty: "Menantang",
      estimatedTime: "10-20 menit", 
      color: "from-orange-400 to-orange-600"
    }
  ];

  const handleChallengeComplete = (score: number, success: boolean) => {
    setUserScore(prev => prev + score);
    // Additional logic for tracking progress
  };

  if (selectedChallenge === "memory") {
    return (
      <MemoryChallenge 
        onComplete={handleChallengeComplete}
        onBack={() => setSelectedChallenge(null)}
      />
    );
  }

  if (selectedChallenge === "spatial") {
    return (
      <SpatialChallenge 
        onComplete={handleChallengeComplete}
        onBack={() => setSelectedChallenge(null)}
      />
    );
  }

  if (selectedChallenge === "numerical") {
    return (
      <NumericalChallenge 
        onComplete={handleChallengeComplete}
        onBack={() => setSelectedChallenge(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 p-6">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Latihan Perhatian
          </h1>
          <p className="text-muted-foreground text-lg">
            Pilih jenis tantangan untuk melatih kemampuan fokus dan perhatian Anda
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {challenges.map((challenge) => {
            const IconComponent = challenge.icon;
            return (
              <Card key={challenge.id} className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${challenge.color} flex items-center justify-center mb-4`}>
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{challenge.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">{challenge.description}</p>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tingkat Kesulitan:</span>
                      <span className="font-medium">{challenge.difficulty}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimasi Waktu:</span>
                      <span className="font-medium">{challenge.estimatedTime}</span>
                    </div>
                  </div>

                  <Button 
                    onClick={() => setSelectedChallenge(challenge.id)}
                    className="w-full bg-gradient-primary hover:bg-gradient-primary/90 group-hover:scale-105 transition-transform"
                  >
                    Mulai Tantangan
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Panduan Latihan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-blue-500" />
                  Tantangan Memori
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Meningkatkan daya ingat jangka pendek</li>
                  <li>• Melatih konsentrasi visual</li>
                  <li>• Cocok untuk pemula</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Compass className="h-4 w-4 text-green-500" />
                  Tantangan Spasial
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Meningkatkan pemahaman ruang</li>
                  <li>• Melatih visualisasi mental</li>
                  <li>• Cocok untuk level menengah</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-orange-500" />
                  Tantangan Numerik
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Meningkatkan logika matematika</li>
                  <li>• Melatih kecepatan berpikir</li>
                  <li>• Cocok untuk level lanjutan</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrainingPage;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Calculator, 
  Grid3X3, 
  Flame, 
  Target, 
  Trophy,
  Calendar,
  Timer
} from "lucide-react";
import memoryIcon from "@/assets/memory-icon.jpg";

const Dashboard = () => {
  // Mock data - in real app this would come from state/API
  const currentLevel = 12;
  const currentSpan = 45; // seconds
  const streak = 7;
  const todayChallenge = false;
  const nextLevelProgress = 75;

  const challenges = [
    {
      id: 1,
      type: "memory",
      title: "Memory Challenge",
      description: "Memorize and recall sequences",
      icon: memoryIcon,
      difficulty: "Medium",
      estimatedTime: "5-8 min",
      completed: false
    },
    {
      id: 2,
      type: "numerical",
      title: "Numerical Challenge",
      description: "Mathematical sequences and patterns",
      icon: Calculator,
      difficulty: "Hard",
      estimatedTime: "8-12 min",
      completed: false
    },
    {
      id: 3,
      type: "spatial",
      title: "Spatial Challenge",
      description: "Visual-spatial reasoning tasks",
      icon: Grid3X3,
      difficulty: "Easy",
      estimatedTime: "3-5 min",
      completed: false
    }
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Focus Dashboard</h1>
            <p className="text-muted-foreground text-lg">Track your attention training progress</p>
          </div>
          
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <Badge variant="outline" className="px-4 py-2">
              <Flame className="w-4 h-4 mr-2 text-accent" />
              {streak} day streak
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              Level {currentLevel}
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Target className="w-4 h-4 mr-2" />
                Current Span
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{currentSpan}s</div>
              <p className="text-sm text-success">+5s this week</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Trophy className="w-4 h-4 mr-2" />
                Level Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary mb-2">{nextLevelProgress}%</div>
              <Progress value={nextLevelProgress} className="h-2" />
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Calendar className="w-4 h-4 mr-2" />
                Challenges Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">0/3</div>
              <p className="text-sm text-warning">Complete to maintain streak</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Timer className="w-4 h-4 mr-2" />
                Weekly Goal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">5/7</div>
              <p className="text-sm text-success">2 days remaining</p>
            </CardContent>
          </Card>
        </div>

        {/* Daily Challenges */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <Brain className="w-6 h-6 mr-3 text-primary" />
              Today's Challenges
            </CardTitle>
            <p className="text-muted-foreground">
              Complete all challenges to increase your attention span and maintain your streak
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {challenges.map((challenge) => (
                <Card key={challenge.id} className="border-2 border-border hover:border-primary/30 transition-all duration-300">
                  <CardHeader className="text-center pb-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                      {typeof challenge.icon === 'string' ? (
                        <img 
                          src={challenge.icon} 
                          alt={`${challenge.title} icon`}
                          className="w-10 h-10 object-cover rounded-full"
                        />
                      ) : (
                        <challenge.icon className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <CardTitle className="text-lg">{challenge.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{challenge.description}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex justify-between items-center mb-4">
                      <Badge variant="outline" className="text-xs">
                        {challenge.difficulty}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {challenge.estimatedTime}
                      </span>
                    </div>
                    
                    <Button 
                      variant="challenge" 
                      className="w-full"
                      disabled={challenge.completed}
                    >
                      {challenge.completed ? "Completed" : "Start Challenge"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
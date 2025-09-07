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
	Timer,
	ArrowRight,
} from "lucide-react";
import memoryIcon from "@/assets/memory-icon.jpg";
import { useTrainingStore, calcLevel } from "@/lib/trainingStore";
import { useNav } from "@/context/NavContext";

type ChallengeId = "memory" | "spatial" | "numerical";

export default function Dashboard() {
	const { data, completedCountToday, focusMinutesToday, weeklyActiveDays } =
		useTrainingStore();
	const { level, progress } = calcLevel(data.xp);
	const nav = useNav();

	const challenges: Array<{
		id: ChallengeId;
		title: string;
		description: string;
		icon: any;
		difficulty: string;
		estimatedTime: string;
	}> = [
		{
			id: "memory",
			title: "Memory Challenge",
			description: "Memorize and recall sequences",
			icon: memoryIcon,
			difficulty: "Medium",
			estimatedTime: "5–8 min",
		},
		{
			id: "numerical",
			title: "Numerical Challenge",
			description: "Mathematical sequences and patterns",
			icon: Calculator,
			difficulty: "Hard",
			estimatedTime: "8–12 min",
		},
		{
			id: "spatial",
			title: "Spatial Challenge",
			description: "Visual-spatial reasoning tasks",
			icon: Grid3X3,
			difficulty: "Easy",
			estimatedTime: "3–5 min",
		},
	];

	const totalToday = 3;
	const weeklyGoal = 7;
	const recent = [...data.sessions]
		.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1))
		.slice(0, 5);

	const startFromDashboard = (id: ChallengeId) => {
		localStorage.setItem("matea.pendingChallenge", id); // biar Training auto-buka
		nav.go("training");
	};

	return (
		<div className="min-h-screen bg-background p-6 mt-20">
			<div className="container mx-auto max-w-6xl">
				{/* Header */}
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
					<div>
						<h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
							Focus Dashboard
						</h1>
						<p className="text-muted-foreground text-lg">
							Track your attention training progress
						</p>
					</div>
					<div className="flex items-center gap-4 mt-4 md:mt-0">
						<Badge variant="outline" className="px-4 py-2">
							<Flame className="w-4 h-4 mr-2 text-orange-500" />
							{data.streak} day streak
						</Badge>
						<Badge variant="secondary" className="px-4 py-2">
							Level {level}
						</Badge>
					</div>
				</div>

				{/* Stats */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
					<Card className="shadow-md">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
								<Timer className="w-4 h-4 mr-2" /> Focus Today
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-primary">
								{focusMinutesToday}m
							</div>
							<p className="text-sm text-emerald-600">
								Keep it up!
							</p>
						</CardContent>
					</Card>

					<Card className="shadow-md">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
								<Trophy className="w-4 h-4 mr-2" /> Level
								Progress
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-primary mb-2">
								{progress}%
							</div>
							<Progress value={progress} className="h-2" />
						</CardContent>
					</Card>

					<Card className="shadow-md">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
								<Calendar className="w-4 h-4 mr-2" /> Challenges
								Today
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-primary">
								{completedCountToday}/{totalToday}
							</div>
							<p
								className={`text-sm ${
									completedCountToday < totalToday
										? "text-amber-600"
										: "text-emerald-600"
								}`}
							>
								{completedCountToday < totalToday
									? "Complete to maintain streak"
									: "Great job!"}
							</p>
						</CardContent>
					</Card>

					<Card className="shadow-md">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
								<Target className="w-4 h-4 mr-2" /> Weekly Goal
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-primary">
								{weeklyActiveDays}/{weeklyGoal}
							</div>
							<p className="text-sm text-muted-foreground">
								{weeklyGoal - weeklyActiveDays} days remaining
							</p>
						</CardContent>
					</Card>
				</div>

				{/* Today’s Challenges */}
				<Card className="shadow-lg">
					<CardHeader>
						<CardTitle className="text-2xl flex items-center">
							<Brain className="w-6 h-6 mr-3 text-primary" />{" "}
							Today's Challenges
						</CardTitle>
						<p className="text-muted-foreground">
							Complete all challenges to increase your attention
							and maintain your streak
						</p>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							{challenges.map((c) => {
								const completed = data.completedToday[c.id];
								const isImage = typeof c.icon === "string";
								return (
									<Card
										key={c.id}
										className={`border-2 border-border hover:border-primary/30 transition-all duration-300 ${
											completed ? "opacity-80" : ""
										}`}
									>
										<CardHeader className="text-center pb-4">
											<div className="w-16 h-16 mx-auto mb-4 rounded-full overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
												{isImage ? (
													<img
														src={c.icon}
														alt={`${c.title} icon`}
														className="w-10 h-10 object-cover rounded-full"
													/>
												) : (
													<c.icon className="w-8 h-8 text-primary" />
												)}
											</div>
											<CardTitle className="text-lg">
												{c.title}
											</CardTitle>
											<p className="text-sm text-muted-foreground">
												{c.description}
											</p>
										</CardHeader>
										<CardContent className="pt-0">
											<div className="flex justify-between items-center mb-4">
												<Badge
													variant="outline"
													className="text-xs"
												>
													{c.difficulty}
												</Badge>
												<span className="text-sm text-muted-foreground">
													{c.estimatedTime}
												</span>
											</div>
											<Button
												className="w-full"
												disabled={completed}
												onClick={() =>
													startFromDashboard(c.id)
												}
											>
												{completed
													? "Completed"
													: "Start Challenge"}
											</Button>
										</CardContent>
									</Card>
								);
							})}
						</div>
					</CardContent>
				</Card>

				{/* Recent Activity */}
				<Card className="mt-8">
					<CardHeader className="flex items-center justify-between">
						<CardTitle className="text-xl">
							Recent Activity
						</CardTitle>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => nav.go("training")}
						>
							Go to Training{" "}
							<ArrowRight className="w-4 h-4 ml-2" />
						</Button>
					</CardHeader>
					<CardContent>
						{recent.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No sessions yet. Try one today!
							</p>
						) : (
							<div className="space-y-3">
								{recent.map((s) => (
									<div
										key={s.id}
										className="p-3 border rounded-lg flex items-center justify-between"
									>
										<div className="flex items-center gap-3">
											<Badge
												variant="outline"
												className="capitalize"
											>
												{s.challengeId}
											</Badge>
											<div className="text-sm text-muted-foreground">
												{new Date(
													s.dateISO
												).toLocaleString()}
											</div>
										</div>
										<div className="text-sm">
											+
											{Math.max(
												5,
												Math.round(
													s.score * s.bonusMultiplier
												)
											)}{" "}
											XP • {s.durationMin}m{" "}
											{s.adaptive ? "• Adaptive" : ""}
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

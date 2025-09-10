import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, Target, Trophy } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";
import { useNav } from "@/context/NavContext";

const Hero = () => {
	const nav = useNav();
	return (
		<section className="relative min-h-screen flex items-center justify-center overflow-hidden">
			{/* Background with overlay */}
			<div className="absolute inset-0">
				<img
					src={heroImage}
					alt="Focus and concentration visualization"
					className="w-full h-full object-cover"
				/>
				<div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/80 to-accent/90"></div>
			</div>

			{/* Content */}
			<div className="relative z-10 container mx-auto px-4 text-center text-white">
				<div className="max-w-4xl mx-auto">
					<h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">
						Focus. Unlock. Achieve.
						<span className="block bg-gradient-to-r from-accent-light to-white bg-clip-text text-transparent">
							With Matea.
						</span>
					</h1>

					<p className="text-xl md:text-2xl mb-8 text-white/90 max-w-2xl mx-auto leading-relaxed">
						Build focus, improve concentration, and unlock your
						mental potential with AI-powered daily challenges
					</p>

					<div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
						<Button
							variant="hero"
							size="lg"
							className="text-lg px-8 py-4"
							onClick={() => nav.go("training")}
						>
							Start Training
							<ArrowRight className="ml-2" />
						</Button>
					</div>

					{/* Feature highlights */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
						<div className="flex flex-col items-center text-center">
							<div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
								<Brain className="w-8 h-8" />
							</div>
							<h3 className="text-xl font-semibold mb-2">
								Memory Challenges
							</h3>
							<p className="text-white/80">
								Strengthen your memory with engaging cognitive
								exercises
							</p>
						</div>

						<div className="flex flex-col items-center text-center">
							<div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
								<Target className="w-8 h-8" />
							</div>
							<h3 className="text-xl font-semibold mb-2">
								Focus Training
							</h3>
							<p className="text-white/80">
								Build sustained attention through targeted
								exercises
							</p>
						</div>

						<div className="flex flex-col items-center text-center">
							<div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
								<Trophy className="w-8 h-8" />
							</div>
							<h3 className="text-xl font-semibold mb-2">
								Level System
							</h3>
							<p className="text-white/80">
								Track progress and unlock achievements as you
								improve
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Hero;

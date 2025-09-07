import { Button } from "@/components/ui/button";
import {
	Brain,
	Home,
	BarChart3,
	Settings,
	User,
	FileText,
	Bot,
} from "lucide-react";
import LanguageSelector from "./LanguageSelector";
import { View } from "@/context/NavContext";

type NavigationProps = {
	currentView: View;
	onViewChange: (view: View) => void;
};

const navItems: Array<{ id: View; label: string; icon: any }> = [
	{ id: "home", label: "Beranda", icon: Home },
	{ id: "dashboard", label: "Dashboard", icon: BarChart3 },
	{ id: "training", label: "Latihan", icon: Brain },
	{ id: "materials", label: "Materi AI", icon: FileText },
	{ id: "assistant", label: "Asisten AI", icon: Bot },
	{ id: "profile", label: "Profil", icon: User },
	// kalau nanti butuh:
	// { id: "settings", label: "Pengaturan", icon: Settings },
];

const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
	return (
		<nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
			<div className="container mx-auto px-4">
				<div className="flex items-center justify-between h-16">
					{/* Logo */}
					<div className="flex items-center space-x-2">
						<img
							src="/matea-logo.jpg"
							alt="Matea"
							className="w-10 h-10 rounded-lg"
						/>
						<span className="text-xl font-bold bg-gradient-primary bg-clip-text text-[#151d53] ">
							MateaApp
						</span>
					</div>

					{/* Desktop nav */}
					<div className="hidden md:flex items-center space-x-1">
						{navItems.map((item) => (
							<Button
								key={item.id}
								variant={
									currentView === item.id
										? "default"
										: "ghost"
								}
								size="sm"
								onClick={() => onViewChange(item.id)}
								className="flex items-center space-x-2"
							>
								<item.icon className="w-4 h-4" />
								<span>{item.label}</span>
							</Button>
						))}
						<LanguageSelector />
					</div>

					{/* Mobile menu icon (opsional) */}
					<div className="md:hidden">
						<Button variant="ghost" size="sm">
							<Settings className="w-5 h-5" />
						</Button>
					</div>
				</div>
			</div>

			{/* Mobile nav */}
			<div className="md:hidden border-t border-border bg-card">
				<div className="flex justify-around py-2">
					{navItems.map((item) => (
						<Button
							key={item.id}
							variant={
								currentView === item.id ? "default" : "ghost"
							}
							size="sm"
							onClick={() => onViewChange(item.id)}
							className="flex flex-col items-center space-y-1 h-auto py-2"
						>
							<item.icon className="w-4 h-4" />
							<span className="text-xs">{item.label}</span>
						</Button>
					))}
				</div>
			</div>
		</nav>
	);
};

export default Navigation;

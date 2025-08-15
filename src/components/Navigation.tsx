import { Button } from "@/components/ui/button";
import { Brain, Home, BarChart3, Settings, User, FileText, Bot } from "lucide-react";
import LanguageSelector from "./LanguageSelector";

interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const navItems = [
    { id: "home", label: "Beranda", icon: Home },
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "training", label: "Latihan", icon: Brain },
    { id: "materials", label: "Materi AI", icon: FileText },
    { id: "assistant", label: "Asisten AI", icon: Bot },
    { id: "profile", label: "Profil", icon: User }
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <img src="/src/assets/matea-logo.png" alt="Matea" className="w-8 h-8" />
            <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">MateaApp</span>
          </div>
          
          {/* Navigation Items */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={currentView === item.id ? "default" : "ghost"}
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
          
          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button variant="ghost" size="sm">
              <BarChart3 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-border bg-card">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={currentView === item.id ? "default" : "ghost"}
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
import { useState } from "react";
import Hero from "@/components/Hero";
import Dashboard from "@/components/Dashboard";
import Navigation from "@/components/Navigation";

const Index = () => {
  const [currentView, setCurrentView] = useState("home");

  const renderContent = () => {
    switch (currentView) {
      case "home":
        return <Hero />;
      case "dashboard":
        return <Dashboard />;
      case "profile":
        return (
          <div className="min-h-screen bg-background pt-20 p-6">
            <div className="container mx-auto max-w-4xl">
              <h1 className="text-4xl font-bold mb-8">Profile</h1>
              <p className="text-muted-foreground">Profile features coming soon...</p>
            </div>
          </div>
        );
      case "settings":
        return (
          <div className="min-h-screen bg-background pt-20 p-6">
            <div className="container mx-auto max-w-4xl">
              <h1 className="text-4xl font-bold mb-8">Settings</h1>
              <p className="text-muted-foreground">Settings panel coming soon...</p>
            </div>
          </div>
        );
      default:
        return <Hero />;
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
      {renderContent()}
    </div>
  );
};

export default Index;

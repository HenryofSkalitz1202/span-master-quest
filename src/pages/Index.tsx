// import { useState } from "react";
// import Hero from "@/components/Hero";
// import Dashboard from "@/components/Dashboard";
// import Navigation from "@/components/Navigation";
// import TrainingPage from "@/components/TrainingPage";
// import LearningMaterials from "./LearningMaterials";
// import AIAssistant from "./AIAssistant";

// const Index = () => {
//   const [currentView, setCurrentView] = useState("home");

//   const renderContent = () => {
//     switch (currentView) {
//       case "home":
//         return <Hero />;
//       case "dashboard":
//         return <Dashboard />;
//       case "training":
//         return <TrainingPage />;
//       case "materials":
//         return <LearningMaterials />;
//       case "assistant":
//         return <AIAssistant />;
//       case "profile":
//         return (
//           <div className="min-h-screen bg-background pt-20 p-6">
//             <div className="container mx-auto max-w-4xl">
//               <h1 className="text-4xl font-bold mb-8">Profile</h1>
//               <p className="text-muted-foreground">Profile features coming soon...</p>
//             </div>
//           </div>
//         );
//       case "settings":
//         return (
//           <div className="min-h-screen bg-background pt-20 p-6">
//             <div className="container mx-auto max-w-4xl">
//               <h1 className="text-4xl font-bold mb-8">Settings</h1>
//               <p className="text-muted-foreground">Settings panel coming soon...</p>
//             </div>
//           </div>
//         );
//       default:
//         return <Hero />;
//     }
//   };

//   return (
//     <div className="min-h-screen">
//       <Navigation currentView={currentView} onViewChange={setCurrentView} />
//       {renderContent()}
//     </div>
//   );
// };

// export default Index;

import { useState } from "react";
import Hero from "@/components/Hero";
import Dashboard from "@/components/Dashboard";
import Navigation from "@/components/Navigation";
import TrainingPage from "@/components/TrainingPage";
import LearningMaterials from "./LearningMaterials";
import AIAssistant from "./AIAssistant";
import { NavProvider, View } from "@/context/NavContext";

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("home");

  const renderContent = () => {
    switch (currentView) {
      case "home": return <Hero />;
      case "dashboard": return <Dashboard />;
      case "training": return <TrainingPage />;
      case "materials": return <LearningMaterials />;
      case "assistant": return <AIAssistant />;
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
      default: return <Hero />;
    }
  };

  return (
    <div className="min-h-screen">
      <NavProvider view={currentView} go={setCurrentView}>
        <Navigation currentView={currentView} onViewChange={setCurrentView} />
        {renderContent()}
      </NavProvider>
    </div>
  );
};

export default Index;

# Matea App - Focus. Unlock. Achieve.

An AI-powered cognitive training application that helps build focus, improve concentration, and unlock mental potential through gamified daily challenges and interactive learning materials.

## Features

### 🧠 Cognitive Training
- **Memory Challenges**: Lexicon matching, sequence recall, scene memory
- **Spatial Challenges**: Map rotation, route navigation, mirror reflection
- **Numerical Challenges**: 24-game, number mazes, equation filling
- **Adaptive Difficulty**: AI adjusts challenge complexity based on performance

### 📚 AI Learning Materials
- **PDF-to-Quiz Generation**: Upload PDFs and generate interactive quizzes
- **Smart Summarization**: AI-powered content summaries
- **Multi-language Support**: 11 languages including Indonesian, English, Spanish, etc.
- **Interactive Quiz Interface**: Quizizz-style gameplay with timers and explanations

### 🤖 AI Assistant
- **Voice-Enabled Chat**: Speak and listen to AI responses
- **Multiple Avatars**: Choose from teacher, tutor, professor personas
- **Voice Selection**: Different AI voices for personalized experience
- **Educational Focus**: Specialized in explaining learning materials

### 📊 Progress Tracking
- **XP System**: Earn experience points and level up
- **Streak Tracking**: Maintain daily training streaks
- **Performance Analytics**: Track focus time, accuracy, and improvement
- **Achievement System**: Unlock badges and milestones

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite build tool
- Tailwind CSS + shadcn/ui components
- React Router for navigation
- Zustand for state management

**Backend:**
- Python FastAPI
- Google Gemini AI integration
- File upload handling (PDF processing)
- Local storage + optional MongoDB

## Prerequisites

- Node.js 18+ & npm
- Python 3.8+
- Google Gemini API key ([Get here](https://makersuite.google.com/app/apikey))

## Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd matea-app
```

### 2. Environment Setup

Create `.env` in project root:
```env
VITE_API_PROXY_TARGET=http://localhost:8000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-pro
MONGO_URL=mongodb://localhost:27017
MONGO_DB=matea
ALLOW_ORIGINS=http://localhost:8080
```

Create `.env` in `custom-ai/` directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Backend Setup
```bash
cd custom-ai
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend Setup
```bash
# In project root
npm install
npm run dev
```

The app will be available at `http://localhost:8080`

## Usage

### Getting Started
1. Open the app and navigate to **Dashboard**
2. Complete daily challenges to build your streak
3. Upload PDFs in **Learning Materials** to generate quizzes
4. Chat with the **AI Assistant** for help with concepts
5. Track your progress and level up through consistent training

### Creating Quizzes
1. Go to **Learning Materials**
2. Upload a PDF file
3. Configure quiz settings (number of questions, difficulty, language)
4. Click "Generate Quiz with AI"
5. Take the interactive quiz or export as CSV

### Training Challenges
1. Visit **Training** section
2. Choose from Memory, Spatial, or Numerical challenges
3. Complete adaptive difficulty sessions
4. Earn XP and maintain your streak

## API Endpoints

Key backend endpoints:
- `POST /quiz/from-files` - Generate quiz from uploaded files
- `POST /summary/from-files` - Create content summaries
- `POST /v1/challenges/new` - Create cognitive challenges
- `POST /quiz/attempts` - Submit quiz results
- `GET /health` - Health check

## Project Structure

```
matea-app/
├── src/
│   ├── components/          # React components
│   │   ├── challenges/      # Cognitive challenge components
│   │   └── ui/             # Reusable UI components
│   ├── pages/              # Main page components
│   ├── lib/                # Utilities and API clients
│   └── context/            # React context providers
├── custom-ai/              # Python FastAPI backend
│   ├── main.py            # FastAPI application
│   └── requirements.txt   # Python dependencies
└── public/                # Static assets
```

## Development

### Frontend Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
```

### Backend Development
```bash
cd custom-ai
uvicorn main:app --reload    # Auto-reload on changes
```

### Adding New Challenges
1. Create challenge generator in `custom-ai/main.py`
2. Add frontend component in `src/components/challenges/`
3. Update challenge types in `src/lib/api.ts`

## Configuration

### Challenge Settings
- Modify difficulty algorithms in backend challenge generators
- Adjust scoring formulas in `src/lib/trainingStore.ts`
- Configure timers and XP values in component constants

### AI Integration
- Update Gemini model in environment variables
- Modify prompts in backend for different AI behaviors
- Add new languages to supported language list



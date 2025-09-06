import { useCallback, useEffect, useMemo, useState } from "react";

export type ChallengeId = "memory" | "spatial" | "numerical";

export type Session = {
  id: string;
  dateISO: string;
  challengeId: ChallengeId;
  score: number;
  durationMin: number;
  bonusMultiplier: number;
  adaptive: boolean;
};

export type TrainingData = {
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  completedToday: Record<ChallengeId, boolean>;
  sessions: Session[];
};

const KEY = "matea.training.v1";
const SIGNAL = "matea-training-updated"; // custom event utk same-tab sync
export const LEVEL_SIZE = 100;
export const DAILY_GOAL_XP = 50;

const defaultData: TrainingData = {
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completedToday: { memory: false, spatial: false, numerical: false },
  sessions: [],
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / 86400000);
}
function ensureDaily(data: TrainingData): TrainingData {
  const today = todayStr();
  if (!data.lastActiveDate) {
    data.lastActiveDate = today;
    data.completedToday = { memory: false, spatial: false, numerical: false };
    return data;
  }
  const d = daysBetween(data.lastActiveDate, today);
  if (d === 0) return data;
  if (d === 1) {
    data.completedToday = { memory: false, spatial: false, numerical: false };
    data.lastActiveDate = today;
    return data;
  }
  data.streak = 0;
  data.completedToday = { memory: false, spatial: false, numerical: false };
  data.lastActiveDate = today;
  return data;
}
function load(): TrainingData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultData };
    const parsed = JSON.parse(raw) as TrainingData;
    return ensureDaily(parsed);
  } catch {
    return { ...defaultData };
  }
}
function save(data: TrainingData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function calcLevel(xp: number) {
  const level = Math.floor(xp / LEVEL_SIZE) + 1;
  const xpInLevel = xp % LEVEL_SIZE;
  return {
    level,
    xpInLevel,
    toNext: LEVEL_SIZE - xpInLevel,
    progress: Math.round((xpInLevel / LEVEL_SIZE) * 100),
  };
}

export function useTrainingStore() {
  const [data, setData] = useState<TrainingData>(() => ensureDaily(load()));

  // NB: tetap simpan lewat effect untuk kasus update lain
  useEffect(() => { save(data); }, [data]);

  // Dengarkan perubahan dari tab lain
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try { setData(ensureDaily(JSON.parse(e.newValue) as TrainingData)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);

    // Dengarkan perubahan dalam tab yang sama (custom event)
    const onSignal = () => setData(ensureDaily(load()));
    window.addEventListener(SIGNAL, onSignal);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SIGNAL, onSignal);
    };
  }, []);

  const addSession = useCallback(
    (payload: Omit<Session, "id" | "dateISO">) => {
      setData((prev) => {
        const base = ensureDaily({ ...prev });
        const nowISO = new Date().toISOString();
        const today = todayStr();
        const hadSessionToday = prev.sessions.some(
          (s) => s.dateISO.slice(0, 10) === today
        );

        const session: Session = {
          id: (crypto as any)?.randomUUID?.() || String(Date.now()),
          dateISO: nowISO,
          ...payload,
        };

        const gainedXP = Math.max(5, Math.round(payload.score * payload.bonusMultiplier));

        base.sessions = [...base.sessions, session];
        base.xp += gainedXP;
        base.completedToday[payload.challengeId] = true;

        if (!hadSessionToday) {
          if (prev.lastActiveDate && daysBetween(prev.lastActiveDate, today) === 1) {
            base.streak = Math.max(1, prev.streak + 1);
          } else {
            base.streak = 1;
          }
        }
        base.lastActiveDate = today;

        // ✅ persist SEKARANG + broadcast same-tab
        save(base);
        window.dispatchEvent(new Event(SIGNAL));

        return base;
      });
    },
    []
  );

  const completedCountToday = useMemo(
    () => Object.values(data.completedToday).filter(Boolean).length,
    [data.completedToday]
  );

  const dailyXPToday = useMemo(() => {
    const ts = todayStr();
    return data.sessions
      .filter((s) => s.dateISO.slice(0, 10) === ts)
      .reduce((sum, s) => sum + Math.max(5, Math.round(s.score * s.bonusMultiplier)), 0);
  }, [data.sessions]);

  const focusMinutesToday = useMemo(() => {
    const ts = todayStr();
    return data.sessions
      .filter((s) => s.dateISO.slice(0, 10) === ts)
      .reduce((sum, s) => sum + s.durationMin, 0);
  }, [data.sessions]);

  const weeklyActiveDays = useMemo(() => {
    const now = Date.now();
    const days = new Set<string>();
    for (const s of data.sessions) {
      const t = Date.parse(s.dateISO);
      if (now - t <= 6 * 86400000) days.add(s.dateISO.slice(0, 10));
    }
    return days.size;
  }, [data.sessions]);

  return {
    data,
    addSession,
    completedCountToday,
    dailyXPToday,
    focusMinutesToday,
    weeklyActiveDays,
  };
}

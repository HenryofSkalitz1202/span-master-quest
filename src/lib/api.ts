// src/lib/api.ts
export const API_BASE = import.meta.env.VITE_API_URL || "/api";

export type ChallengeType = "memory" | "spatial" | "numerical";

export interface ChallengeOption {
	optionId?: string; // untuk spatial (A/B/C/D)
	render?: { kind?: string; svg?: string };
}

export interface ChallengeItem {
	itemId: string;
	variant: string;
	prompt: string;
	render: any;
	options?: ChallengeOption[] | string[]; // memory/scene_recall: array string kandidat
	answerSpec?: any;
	metadata?: any;
	answerHash?: string; // disediakan server (hash solusi), tidak dipakai klien
}

export interface ChallengeDoc {
	challengeId: string;
	type: ChallengeType;
	difficulty?: string | null;
	generatedAt: string;
	items: ChallengeItem[];
	scoring?: any;
}

export async function createChallenge(
	type: ChallengeType,
	difficulty: string | null = "medium",
	useLLM = true,
	seed?: number
): Promise<ChallengeDoc> {
	const res = await fetch(`${API_BASE}/v1/challenges/new`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			type,
			difficulty,
			count: 5,
			adaptive: true,
			use_llm: useLLM,
			seed,
			locale: "id-ID",
			timeBudgetSec: 600,
		}),
	});
	if (!res.ok) {
		const txt = await res.text();
		throw new Error(`createChallenge failed: ${res.status} ${txt}`);
	}
	return res.json();
}

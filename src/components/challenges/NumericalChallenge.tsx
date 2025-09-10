// src/components/challenges/NumericalChallenge.tsx
import { useEffect, useRef, useState } from "react";
import { createChallenge, ChallengeItem, ChallengeOption } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { safeEval, usesExactly } from "./shared";
import { EmptyState, LoadingState } from "./State";

type Props = { onComplete: (score: number) => void; onBack: () => void };

const MEMORIZE_SEC = 20;
const ANSWER_SEC = 10;
const fmt = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
		2,
		"0"
	)}`;

function clampPath(path: [number, number][], grid: number) {
	return path.map(
		([r, c]) =>
			[
				Math.max(0, Math.min(grid - 1, r)),
				Math.max(0, Math.min(grid - 1, c)),
			] as [number, number]
	);
}
function toTuple2(v: any): [number, number] {
	const a = Array.isArray(v) ? v : [0, 0];
	return [Number(a?.[0] ?? 0), Number(a?.[1] ?? 0)];
}

/** ==== 24-game builder types & helpers ==== */
type NumToken = { type: "num"; value: string; srcIndex: number };
type OpToken = { type: "op"; value: "+" | "-" | "×" | "÷" };
type ParToken = { type: "paren"; value: "(" | ")" };
type Token = NumToken | OpToken | ParToken;

function last<T>(arr: T[]): T | undefined {
	return arr[arr.length - 1];
}
function isNum(t?: Token): t is NumToken {
	return !!t && t.type === "num";
}
function isOp(t?: Token): t is OpToken {
	return !!t && t.type === "op";
}
function isParen(t?: Token): t is ParToken {
	return !!t && t.type === "paren";
}
function compose(tokens: Token[]) {
	return tokens.map((t) => t.value).join("");
}
function canAddToken(tokens: Token[], t: Token, openParens: number) {
	const L = last(tokens);
	// terlalu banyak token? batasi agar tidak absurd (opsional; akan dibatasi slots jika ada)
	if (tokens.length >= 64) return false;

	if (t.type === "num") {
		// awal atau setelah operator atau "("
		if (!L || isOp(L) || (isParen(L) && L.value === "(")) return true;
		return false;
	}
	if (t.type === "op") {
		// tidak boleh di awal, dan hanya setelah angka atau ")"
		if (L && (isNum(L) || (isParen(L) && L.value === ")"))) return true;
		return false;
	}
	// parenthesis
	if (t.type === "paren") {
		if (t.value === "(") {
			// boleh di awal, setelah operator, atau setelah "("
			if (!L || isOp(L) || (isParen(L) && L.value === "(")) return true;
			return false;
		} else {
			// ")"—hanya jika ada yang terbuka & sebelumnya angka atau ")"
			if (
				openParens > 0 &&
				L &&
				(isNum(L) || (isParen(L) && L.value === ")"))
			)
				return true;
			return false;
		}
	}
	return false;
}
function recomputeOpenParens(tokens: Token[]) {
	let k = 0;
	for (const t of tokens) {
		if (t.type === "paren") k += t.value === "(" ? 1 : -1;
	}
	return k;
}

export default function NumericalChallenge({ onComplete, onBack }: Props) {
	const [items, setItems] = useState<ChallengeItem[]>([]);
	const [ix, setIx] = useState(0);
	const [loading, setLoading] = useState(true);
	const [score, setScore] = useState(0);

	// phases & timers
	const [phase, setPhase] = useState<"memorize" | "answer">("memorize");
	const [memLeft, setMemLeft] = useState(MEMORIZE_SEC);
	const [ansLeft, setAnsLeft] = useState(ANSWER_SEC);
	const memIntRef = useRef<number | null>(null);
	const ansIntRef = useRef<number | null>(null);

	// ==== per-variant states ====
	// 24-game builder
	const [tokens, setTokens] = useState<Token[]>([]);
	const [numUsed, setNumUsed] = useState<boolean[]>([]);
	const [openParens, setOpenParens] = useState(0);

	// equation_fill keypad
	const [digits, setDigits] = useState<string[]>([]);
	const [focusBlank, setFocusBlank] = useState<number>(0);

	// free numeric / function machine
	const [free, setFree] = useState<string>("");

	// number_maze path
	const [path, setPath] = useState<[number, number][]>([]);

	useEffect(() => {
		(async () => {
			try {
				const doc = await createChallenge("numerical", "medium", true);
				setItems(doc.items);
			} catch (e: any) {
				toast.error(e.message || "Gagal memuat tantangan");
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	// reset per soal + timer
	useEffect(() => {
		if (!items[ix]) return;

		// reset all
		setTokens([]);
		setNumUsed([]);
		setOpenParens(0);
		setDigits([]);
		setFocusBlank(0);
		setFree("");
		setPath([]);

		if (memIntRef.current) window.clearInterval(memIntRef.current);
		if (ansIntRef.current) window.clearInterval(ansIntRef.current);

		setPhase("memorize");
		setMemLeft(MEMORIZE_SEC);
		setAnsLeft(ANSWER_SEC);

		// siapkan flag numUsed utk 24-game
		const it = items[ix];
		if (it.variant === "target_24") {
			const nums: number[] =
				it.render?.numbers || it.metadata?.numbers || [];
			setNumUsed(new Array(nums.length).fill(false));
		}

		memIntRef.current = window.setInterval(() => {
			setMemLeft((s) => {
				if (s <= 1) {
					if (memIntRef.current)
						window.clearInterval(memIntRef.current);
					startAnswerTimer();
					setPhase("answer");
					return 0;
				}
				return s - 1;
			});
		}, 1000);

		return () => {
			if (memIntRef.current) window.clearInterval(memIntRef.current);
			if (ansIntRef.current) window.clearInterval(ansIntRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ix, items]);

	function startAnswerTimer() {
		if (ansIntRef.current) window.clearInterval(ansIntRef.current);
		setAnsLeft(ANSWER_SEC);
		ansIntRef.current = window.setInterval(() => {
			setAnsLeft((s) => {
				if (s <= 1) {
					if (ansIntRef.current)
						window.clearInterval(ansIntRef.current);
					submit(true);
					return 0;
				}
				return s - 1;
			});
		}, 1000);
	}

	function next() {
		if (ix + 1 < items.length) setIx(ix + 1);
		else onComplete(score);
	}

	/** ====== 24-game builder logic ====== */
	const it = items[ix];
	const isMem = phase === "memorize";
	const isAns = phase === "answer";
	const nums24: number[] =
		it?.variant === "target_24"
			? it?.render?.numbers || it?.metadata?.numbers || []
			: [];

	const maxSlots = it?.variant === "target_24" ? it?.render?.slots || 7 : 7;

	function pushToken(t: Token) {
		setTokens((prev) => {
			const open = recomputeOpenParens(prev);
			if (!canAddToken(prev, t, open)) return prev;
			if (prev.length >= maxSlots) return prev; // hormati batas slot
			const next = [...prev, t];
			setOpenParens(recomputeOpenParens(next));
			return next;
		});
	}
	function addNumber(idx: number) {
		if (isMem) return;
		if (numUsed[idx]) return;
		const t: NumToken = {
			type: "num",
			value: String(nums24[idx]),
			srcIndex: idx,
		};
		setTokens((prev) => {
			const open = recomputeOpenParens(prev);
			if (!canAddToken(prev, t, open)) return prev;
			if (prev.length >= maxSlots) return prev;
			const next = [...prev, t];
			setOpenParens(recomputeOpenParens(next));
			setNumUsed((flags) => {
				const f = [...flags];
				f[idx] = true;
				return f;
			});
			return next;
		});
	}
	function addOp(op: OpToken["value"]) {
		if (isMem) return;
		pushToken({ type: "op", value: op });
	}
	function addParen(p: "(" | ")") {
		if (isMem) return;
		pushToken({ type: "paren", value: p });
	}
	function backspace() {
		if (isMem) return;
		setTokens((prev) => {
			if (!prev.length) return prev;
			const popped = prev[prev.length - 1];
			const next = prev.slice(0, -1);
			if (popped.type === "num") {
				setNumUsed((flags) => {
					const f = [...flags];
					f[popped.srcIndex] = false;
					return f;
				});
			}
			setOpenParens(recomputeOpenParens(next));
			return next;
		});
	}
	function clearAll() {
		if (isMem) return;
		setTokens([]);
		setOpenParens(0);
		setNumUsed((flags) => flags.map(() => false));
	}
	function removeAt(i: number) {
		if (isMem) return;
		setTokens((prev) => {
			const popped = prev[i];
			const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
			if (popped?.type === "num") {
				setNumUsed((flags) => {
					const f = [...flags];
					f[popped.srcIndex] = false;
					return f;
				});
			}
			setOpenParens(recomputeOpenParens(next));
			return next;
		});
	}

	const expr24 = compose(tokens);
	let evalVal: number | null = null;
	let evalErr = "";
	if (it?.variant === "target_24" && expr24 && isAns) {
		try {
			evalVal = Number(safeEval(expr24));
		} catch (e: any) {
			evalErr = e?.message || "invalid";
			evalVal = null;
		}
	}
	const usesAll =
		it?.variant === "target_24" ? usesExactly(expr24, nums24) : false;
	const eqTarget =
		it?.variant === "target_24"
			? evalVal !== null &&
			  Math.abs(evalVal - (it?.render?.target || 24)) < 1e-6
			: false;

	/** ====== equation_fill keypad ====== */
	function typeDigit(d: string) {
		if (isMem || it?.variant !== "equation_fill") return;
		const blanks = it?.render?.blanks || 2;
		setDigits((prev) => {
			const arr = [...prev];
			// isi posisi fokus; kalau sudah terisi, geser fokus
			let i = focusBlank;
			if (!arr[i]) {
				arr[i] = d;
			} else {
				// cari slot kosong berikutnya
				const nxt = Math.min(blanks - 1, i + 1);
				if (!arr[nxt]) {
					i = nxt;
					arr[i] = d;
				} else {
					// kalau semua penuh, timpa slot fokus
					arr[i] = d;
				}
			}
			return arr.slice(0, blanks);
		});
	}
	function eraseDigit() {
		if (isMem || it?.variant !== "equation_fill") return;
		const blanks = it?.render?.blanks || 2;
		setDigits((prev) => {
			const arr = [...prev];
			if (arr[focusBlank]) arr[focusBlank] = "";
			else {
				// hapus slot sebelumnya yang terisi
				for (let i = blanks - 1; i >= 0; i--) {
					if (arr[i]) {
						arr[i] = "";
						setFocusBlank(i);
						break;
					}
				}
			}
			return arr.slice(0, blanks);
		});
	}
	function clearDigits() {
		if (isMem || it?.variant !== "equation_fill") return;
		const blanks = it?.render?.blanks || 2;
		setDigits(new Array(blanks).fill(""));
		setFocusBlank(0);
	}

	/** ====== submit ====== */
	function submit(auto = false) {
		const cur = items[ix];
		if (!cur) return;

		let ok = false;

		if (cur.variant === "target_24") {
			// gunakan expr24 dari builder
			try {
				const v = safeEval(expr24 || "");
				ok =
					Math.abs(v - (cur.render?.target || 24)) < 1e-6 &&
					usesExactly(expr24, nums24) &&
					openParens === 0 &&
					(isNum(last(tokens)) ||
						(isParen(last(tokens)) && last(tokens)?.value === ")"));
			} catch {
				ok = false;
			}
		}

		if (cur.variant === "number_maze") {
			const grid: number = cur.render?.grid || 3;
			const cells: number[][] = cur.render?.cells || [];
			const edgesH: string[][] = cur.render?.edges?.h || [];
			const edgesV: string[][] = cur.render?.edges?.v || [];
			const start = toTuple2(cur.render?.start);
			const maxSteps: number = cur.render?.maxSteps || 4;
			const target: number = cur.render?.target;

			const p = clampPath([start, ...path], grid).slice(0, maxSteps + 1);
			let val = cells[start[0]][start[1]];
			for (let i = 1; i < p.length; i++) {
				const [r0, c0] = p[i - 1];
				const [r1, c1] = p[i];
				const dr = r1 - r0,
					dc = c1 - c0;
				let op = "+";
				if (dr === 0 && Math.abs(dc) === 1) {
					const cc = Math.min(c0, c1);
					op = edgesH[r0][cc];
				} else if (dc === 0 && Math.abs(dr) === 1) {
					const rr = Math.min(r0, r1);
					op = edgesV[rr][c0];
				}
				const b = cells[r1][c1];
				if (op === "+") val = val + b;
				else if (op === "-") val = val - b;
				else if (op === "×") val = val * b;
				else if (op === "÷") {
					if (b === 0 || val % b !== 0) {
						ok = false;
						break;
					}
					val = Math.floor(val / b);
				}
			}
			ok = val === target;
		}

		if (cur.variant === "equation_fill") {
			const left: string = cur.render?.expressionLeft || "";
			const right: string = cur.render?.expressionRight || "";
			const blanks = cur.render?.blanks || 2;
			let L = "",
				R = "",
				idx = 0;
			for (const ch of left) L += ch === "□" ? digits[idx++] || "" : ch;
			for (const ch of right) R += ch === "□" ? digits[idx++] || "" : ch;
			try {
				ok =
					idx === blanks &&
					Math.abs(safeEval(L) - safeEval(R)) < 1e-9;
			} catch {
				ok = false;
			}
		}

		if (cur.variant === "function_machine") {
			const want = Number(free);
			if (Number.isFinite(want)) {
				try {
					const f = cur.render?.functions?.f as string;
					const g = cur.render?.functions?.g as string;
					const x = Number(
						(cur.render?.query as string)?.match(
							/\(([-\d.]+)\)/
						)?.[1] || "NaN"
					);
					// eslint-disable-next-line no-new-func
					const evalStr = (def: string, val: number) =>
						Function(
							"x",
							`"use strict"; return (${def
								.replace(/×/g, "*")
								.replace(/÷/g, "/")
								.replace(/\^/g, "**")});`
						)(val);
					const gx = evalStr(g, x);
					const fgx = evalStr(f, gx);
					ok = Math.abs(want - fgx) < 1e-9;
				} catch {
					ok = false;
				}
			}
		}

		if (
			["modular_arith", "base_convert", "prob_ratio"].includes(
				cur.variant
			)
		) {
			const want = Number(free);
			if (Number.isFinite(want)) {
				if (cur.variant === "base_convert") {
					const bin = cur.prompt.match(/Ubah\s+([01]+)₂/i)?.[1] || "";
					ok = want === parseInt(bin, 2);
				} else if (cur.variant === "modular_arith") {
					const m = Number(cur.metadata?.mod ?? NaN);
					const nums = (
						cur.prompt.match(/(\d+)\s*×\s*(\d+)\s*\+\s*(\d+)/) || []
					)
						.slice(1)
						.map(Number);
					ok =
						nums.length === 3 &&
						Number.isFinite(m) &&
						want === (nums[0] * nums[1] + nums[2]) % m;
				} else if (cur.variant === "prob_ratio") {
					const [num, den] = (cur.metadata?.fraction as [
						number,
						number
					]) || [0, 1];
					ok = Math.abs(want - num / den) < 1e-6;
				}
			} else ok = false;
		}

		setScore((s) => s + (ok ? 1000 : 0));
		next();
	}

	if (loading) return <LoadingState />;
	if (!items.length || !it) return <EmptyState />;

	return (
		<div className="container max-w-3xl mx-auto py-6">
			<div className="mb-4 flex items-center justify-between">
				<Button variant="ghost" onClick={onBack}>
					← Kembali
				</Button>
				<div className="text-sm text-muted-foreground">
					Soal {ix + 1} / {items.length} • Skor: {score}
				</div>
			</div>

			{/* timer bar */}
			<div className="mb-3 text-sm">
				{phase === "memorize" ? (
					<div className="inline-flex items-center gap-2 rounded-md border px-3 py-1">
						<span className="font-medium">Waktu menghafal</span>
						<span className="tabular-nums">{fmt(memLeft)}</span>
					</div>
				) : (
					<div className="inline-flex items-center gap-2 rounded-md border px-3 py-1">
						<span className="font-medium">Waktu menjawab</span>
						<span className="tabular-nums">{fmt(ansLeft)}</span>
					</div>
				)}
			</div>

			{/** ================= 24-GAME (interactive builder) ================= */}
			{it?.variant === "target_24" && (
				<Card>
					<CardHeader>
						<CardTitle>{it.prompt}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="text-sm text-muted-foreground">
							Gunakan <b>semua</b> angka berikut tepat sekali.
							Target: <b>{it.render?.target || 24}</b> • Slot
							tersedia: {it.render?.slots || 7}
						</div>

						{/* Ekspresi rakitan */}
						<div className="p-3 border rounded-lg bg-muted/40">
							<div className="flex flex-wrap gap-2 min-h-[40px]">
								{tokens.length === 0 && (
									<span className="text-muted-foreground">
										Bangun ekspresimu di sini…
									</span>
								)}
								{tokens.map((t, i) => (
									<button
										key={i}
										className={`px-2.5 py-1.5 rounded-md text-sm border bg-background hover:bg-muted transition ${
											t.type === "num"
												? "font-semibold"
												: "opacity-90"
										}`}
										onClick={() => removeAt(i)}
										title="Klik untuk hapus token ini"
									>
										{t.value}
									</button>
								))}
							</div>
							{/* Status/preview */}
							<div className="mt-3 text-sm">
								<div className="flex items-center gap-3 flex-wrap">
									<span className="font-mono break-all">
										{compose(tokens) || "…"}
									</span>
									<span className="text-muted-foreground">
										•
									</span>
									<span>
										{openParens === 0
											? "()"
											: `(${openParens} terbuka)`}
									</span>
									<span className="text-muted-foreground">
										•
									</span>
									{(() => {
										if (!isAns)
											return <span>Memorize dulu…</span>;
										if (expr24 && evalVal !== null)
											return (
												<span>
													Nilai = <b>{evalVal}</b>
												</span>
											);
										if (expr24 && evalErr)
											return (
												<span className="text-red-500">
													Ekspresi tidak valid
												</span>
											);
										return <span>—</span>;
									})()}
									<span className="text-muted-foreground">
										•
									</span>
									<span
										className={`${
											usesAll
												? "text-emerald-600"
												: "text-amber-600"
										}`}
									>
										{usesAll
											? "Angka terpakai semua"
											: "Angka belum terpakai semua"}
									</span>
									{evalVal !== null && (
										<>
											<span className="text-muted-foreground">
												•
											</span>
											<span
												className={`${
													eqTarget
														? "text-emerald-600"
														: "text-rose-600"
												}`}
											>
												{eqTarget
													? "✅ Tepat sasaran!"
													: "Belum sama target"}
											</span>
										</>
									)}
								</div>
							</div>
						</div>

						{/* Angka chips */}
						<div>
							<div className="text-xs text-muted-foreground mb-1">
								Angka
							</div>
							<div className="flex flex-wrap gap-2">
								{nums24.map((n, i) => (
									<button
										key={`${n}-${i}`}
										disabled={isMem || numUsed[i]}
										onClick={() => addNumber(i)}
										className={`px-3 py-1.5 rounded-md border text-sm font-semibold transition ${
											numUsed[i]
												? "opacity-50 cursor-not-allowed bg-muted"
												: "bg-background hover:bg-muted"
										}`}
									>
										{n}
									</button>
								))}
							</div>
						</div>

						{/* Keypad operator + parens + controls */}
						<div>
							<div className="text-xs text-muted-foreground mb-1">
								Operator & Tanda Kurung
							</div>
							<div className="flex flex-wrap gap-2">
								{(["+", "-", "×", "÷"] as const).map((op) => (
									<Button
										key={op}
										size="sm"
										variant="secondary"
										onClick={() => addOp(op)}
										disabled={isMem}
									>
										{op}
									</Button>
								))}
								<Button
									size="sm"
									variant="secondary"
									onClick={() => addParen("(")}
									disabled={isMem}
								>
									(
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={() => addParen(")")}
									disabled={isMem}
								>
									)
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={backspace}
									disabled={isMem}
								>
									⌫
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={clearAll}
									disabled={isMem}
								>
									Clear
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/** ================= NUMBER MAZE ================= */}
			{it?.variant === "number_maze" && (
				<Card>
					<CardHeader>
						<CardTitle>{it.prompt}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-2 text-sm text-muted-foreground">
							Klik jalur {it.render?.maxSteps || 4} langkah dari
							sel awal.
						</div>
						<div
							className="grid"
							style={{
								gridTemplateColumns: `repeat(${
									it.render?.grid || 3
								}, minmax(0, 1fr))`,
								gap: 8,
							}}
						>
							{(it.render?.cells || []).flatMap(
								(row: number[], r: number) =>
									row.map((val: number, c: number) => {
										const start = toTuple2(
											it.render?.start
										);
										const pathCells: [number, number][] = [
											start,
											...path,
										];
										const lastPt =
											pathCells[pathCells.length - 1];
										const here = pathCells.findIndex(
											(p) => p[0] === r && p[1] === c
										);
										const isStart =
											r === start[0] && c === start[1];
										const canStep =
											Math.abs(lastPt[0] - r) +
												Math.abs(lastPt[1] - c) ===
												1 &&
											path.length <
												(it.render?.maxSteps || 4) &&
											isAns;
										return (
											<button
												key={`${r}-${c}`}
												className={`h-14 rounded-lg border flex items-center justify-center ${
													isStart
														? "bg-primary/10 border-primary"
														: "bg-muted"
												} ${
													here >= 0
														? "ring-2 ring-primary"
														: ""
												} ${
													canStep
														? "hover:bg-primary/5"
														: "opacity-70"
												}`}
												onClick={() => {
													if (canStep)
														setPath((p) => [
															...p,
															[r, c],
														]);
												}}
												disabled={isMem}
											>
												{val}
											</button>
										);
									})
							)}
						</div>
						<div className="mt-3 text-sm">
							{(() => {
								const start = toTuple2(it.render?.start);
								const pts: [number, number][] = [
									start,
									...path,
								];
								return (
									<>
										Jalur:{" "}
										{pts
											.map((p) => `(${p[0]},${p[1]})`)
											.join(" → ")}
									</>
								);
							})()}
						</div>
						<Button
							className="mt-3"
							variant="outline"
							onClick={() => setPath([])}
							disabled={isMem}
						>
							Reset Jalur
						</Button>
					</CardContent>
				</Card>
			)}

			{/** ================= EQUATION FILL (keypad) ================= */}
			{it?.variant === "equation_fill" && (
				<Card>
					<CardHeader>
						<CardTitle>{it.prompt}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="text-xl font-mono">
							{it.render?.expressionLeft} ={" "}
							{it.render?.expressionRight}
						</div>
						<div className="flex gap-2">
							{Array.from(
								{ length: it.render?.blanks || 2 },
								(_, i) => (
									<button
										key={i}
										className={`h-10 w-12 border rounded-md text-lg font-mono ${
											focusBlank === i
												? "ring-2 ring-primary"
												: ""
										} ${
											isMem
												? "opacity-70"
												: "bg-background"
										}`}
										onClick={() => setFocusBlank(i)}
										disabled={isMem}
										title="Klik untuk fokus kotak ini"
									>
										{digits[i] ?? ""}
									</button>
								)
							)}
						</div>
						<div className="grid grid-cols-5 gap-2 max-w-xs">
							{[
								"1",
								"2",
								"3",
								"4",
								"5",
								"6",
								"7",
								"8",
								"9",
								"0",
							].map((d) => (
								<Button
									key={d}
									size="sm"
									onClick={() => typeDigit(d)}
									disabled={isMem}
								>
									{d}
								</Button>
							))}
							<Button
								size="sm"
								variant="outline"
								onClick={eraseDigit}
								disabled={isMem}
							>
								⌫
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={clearDigits}
								disabled={isMem}
							>
								Clear
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/** ================= FUNCTION MACHINE & lainnya (numeric input) ================= */}
			{[
				"function_machine",
				"modular_arith",
				"base_convert",
				"prob_ratio",
			].includes(it?.variant || "") && (
				<Card>
					<CardHeader>
						<CardTitle>{it?.prompt}</CardTitle>
					</CardHeader>
					<CardContent>
						<Input
							value={free}
							onChange={(e) => setFree(e.target.value)}
							placeholder="jawaban numerik"
							disabled={isMem}
						/>
					</CardContent>
				</Card>
			)}

			<div className="flex justify-end gap-2 mt-4">
				<Button
					variant="secondary"
					onClick={() => (phase === "memorize" ? undefined : next())}
					disabled={phase === "memorize"}
				>
					Lewati
				</Button>
				<Button
					onClick={() => submit(false)}
					disabled={phase === "memorize"}
				>
					Kirim Jawaban
				</Button>
			</div>
		</div>
	);
}

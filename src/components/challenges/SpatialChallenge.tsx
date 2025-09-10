import { useEffect, useRef, useState } from "react";
import { createChallenge, ChallengeItem, ChallengeOption } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
	PAD,
	CELL,
	getMarkerCellFromSvg,
	getLandmarkCentersFromSvg,
	gridToPixelCenters,
	rotateGridPoints,
	sameCenters,
} from "./shared";
import { EmptyState, LoadingState } from "./State";

type Props = { onComplete: (score: number) => void; onBack: () => void };

const MEMORIZE_SEC = 20;
const ANSWER_SEC = 10;
const fmt = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
		2,
		"0"
	)}`;

// --- mini renderer utk peta dasar (selaras dengan server) ---
function line(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	stroke = "#1f2937",
	sw = 1
) {
	return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" />`;
}
function circle(cx: number, cy: number, r: number, fill: string) {
	return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
}
function rect(x: number, y: number, w: number, h: number, fill: string) {
	return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" />`;
}

function renderBaseMapSvg(
	grid: number,
	base: any,
	opts?: { marker?: [number, number]; axis?: any }
) {
	const size = CELL * grid;
	const pad = PAD;
	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
	);
	parts.push(
		`<rect width="${size}" height="${size}" fill="#0B1020" rx="12" ry="12" />`
	);

	// grid
	for (let i = 0; i <= grid; i++) {
		parts.push(line(pad, pad + i * CELL, size - pad, pad + i * CELL));
		parts.push(line(pad + i * CELL, pad, pad + i * CELL, size - pad));
	}

	// roads
	(base?.roads || []).forEach((seg: [[number, number], [number, number]]) => {
		const [[r1, c1], [r2, c2]] = seg;
		const x1 = pad + c1 * CELL + CELL / 2,
			y1 = pad + r1 * CELL + CELL / 2;
		const x2 = pad + c2 * CELL + CELL / 2,
			y2 = pad + r2 * CELL + CELL / 2;
		parts.push(line(x1, y1, x2, y2, "#64748b", 6));
	});

	// river
	const rv = base?.river || [];
	if (rv.length >= 2) {
		const pts = rv
			.map(
				([r, c]: [number, number]) =>
					`${pad + c * CELL + CELL / 2},${pad + r * CELL + CELL / 2}`
			)
			.join(" ");
		parts.push(
			`<polyline points="${pts}" fill="none" stroke="#38bdf8" stroke-width="6" opacity="0.9" />`
		);
	}

	// axis (refleksi)
	const axis = opts?.axis;
	if (axis?.type === "vertical") {
		const x = pad + axis.x * CELL + CELL / 2;
		parts.push(line(x, pad, x, size - pad, "#22c55e", 2));
	} else if (axis?.type === "horizontal") {
		const y = pad + axis.y * CELL + CELL / 2;
		parts.push(line(pad, y, size - pad, y, "#22c55e", 2));
	}

	// landmarks
	(base?.landmarks || []).forEach((lm: any) => {
		const [r, c] = lm.pos || [0, 0];
		const cx = pad + c * CELL + CELL / 2;
		const cy = pad + r * CELL + CELL / 2;
		const icon = lm.icon || "square";
		const col = "#eab308";
		if (icon === "circle") parts.push(circle(cx, cy, 12, col));
		else if (icon === "triangle")
			parts.push(
				`<polygon points="${cx},${cy - 14} ${cx - 12},${cy + 10} ${
					cx + 12
				},${cy + 10}" fill="${col}" />`
			);
		else parts.push(rect(cx - 12, cy - 12, 24, 24, col));
		parts.push(
			`<text x="${cx}" y="${
				cy + 28
			}" fill="#cbd5e1" font-size="12" text-anchor="middle">${
				lm.name ?? ""
			}</text>`
		);
	});

	// start/marker (merah)
	if (opts?.marker) {
		const [r, c] = opts.marker;
		const x = pad + c * CELL + CELL / 2,
			y = pad + r * CELL + CELL / 2;
		parts.push(circle(x, y, 8, "#ef4444"));
	}

	parts.push(`</svg>`);
	return parts.join("");
}

export default function SpatialChallenge({ onComplete, onBack }: Props) {
	const [items, setItems] = useState<ChallengeItem[]>([]);
	const [ix, setIx] = useState(0);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<string | null>(null);
	const [score, setScore] = useState(0);

	// phases & timers
	const [phase, setPhase] = useState<"memorize" | "answer">("memorize");
	const [memLeft, setMemLeft] = useState(MEMORIZE_SEC);
	const [ansLeft, setAnsLeft] = useState(ANSWER_SEC);
	const memIntRef = useRef<number | null>(null);
	const ansIntRef = useRef<number | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const doc = await createChallenge("spatial", "medium", true);
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

		setSelected(null);

		if (memIntRef.current) window.clearInterval(memIntRef.current);
		if (ansIntRef.current) window.clearInterval(ansIntRef.current);

		setPhase("memorize");
		setMemLeft(MEMORIZE_SEC);
		setAnsLeft(ANSWER_SEC);

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
					submit(); // auto submit
					return 0;
				}
				return s - 1;
			});
		}, 1000);
	}

	function next() {
		setSelected(null);
		if (ix + 1 < items.length) setIx(ix + 1);
		else onComplete(score);
	}

	function check(): boolean {
		const it = items[ix];
		if (!it) return false;

		if (it.variant === "route_nav") {
			const grid: number = it.render?.grid ?? 5;
			const steps: [string, number][] = it.render?.action?.steps ?? [];
			const startName = it.render?.action?.from;
			const startPos = (it.render?.base?.landmarks || []).find(
				(lm: any) => lm.name === startName
			)?.pos || [0, 0];

			const dir: Record<string, [number, number]> = {
				N: [-1, 0],
				S: [1, 0],
				E: [0, 1],
				W: [0, -1],
			};
			let [r, c] = startPos;
			for (const [d, n] of steps) {
				const [dr, dc] = dir[d];
				for (let i = 0; i < n; i++) {
					r = Math.max(0, Math.min(grid - 1, r + dr));
					c = Math.max(0, Math.min(grid - 1, c + dc));
				}
			}
			const final: [number, number] = [r, c];

			const correct = (it.options as ChallengeOption[])?.find((o) => {
				const cell = getMarkerCellFromSvg(o.render?.svg || "", grid);
				return cell && cell[0] === final[0] && cell[1] === final[1];
			})?.optionId;

			return selected != null && selected === correct;
		}

		if (it.variant === "mirror_reflect") {
			const grid: number = it.render?.grid ?? 5;
			const axis = it.render?.action?.axis;
			const target =
				(it.render?.base?.landmarks || []).find(
					(lm: any) => lm.name === "Pasar"
				) || (it.render?.base?.landmarks || [])[0];
			const pos: [number, number] = target?.pos || [0, 0];

			let reflected: [number, number] = pos;
			if (axis?.type === "vertical") {
				const x = axis.x;
				reflected = [pos[0], x - (pos[1] - x)] as [number, number];
			} else {
				const y = axis.y;
				reflected = [y - (pos[0] - y), pos[1]] as [number, number];
			}

			const correct = (it.options as ChallengeOption[])?.find((o) => {
				const cell = getMarkerCellFromSvg(o.render?.svg || "", grid);
				return (
					cell && cell[0] === reflected[0] && cell[1] === reflected[1]
				);
			})?.optionId;

			return selected != null && selected === correct;
		}

		if (it.variant === "map_rotate") {
			const grid: number = it.render?.grid ?? 4;
			const baseLms: [number, number][] = (
				it.render?.base?.landmarks || []
			).map((lm: any) => [lm.pos[0], lm.pos[1]]);
			const centersExpected = gridToPixelCenters(
				rotateGridPoints(baseLms, grid, it.render?.action?.deg || 90)
			);

			const correct = (it.options as ChallengeOption[])?.find((o) => {
				const centersGot = getLandmarkCentersFromSvg(
					o.render?.svg || ""
				);
				return sameCenters(centersGot, centersExpected);
			})?.optionId;

			return selected != null && selected === correct;
		}

		return false;
	}

	function submit() {
		const ok = check();
		setScore((s) => s + (ok ? 1000 : 0));
		next();
	}

	if (loading) return <LoadingState />;
	if (!items.length || !items) return <EmptyState />;

	const it = items[ix];

	// SVG peta dasar untuk fase memorize
	let baseSvg = "";
	if (it?.render?.base) {
		if (it.variant === "route_nav") {
			const startName = it.render?.action?.from;
			const startPos = (it.render?.base?.landmarks || []).find(
				(lm: any) => lm.name === startName
			)?.pos || [0, 0];
			baseSvg = renderBaseMapSvg(it.render?.grid ?? 5, it.render?.base, {
				marker: startPos,
			});
		} else if (it.variant === "mirror_reflect") {
			baseSvg = renderBaseMapSvg(it.render?.grid ?? 5, it.render?.base, {
				axis: it.render?.action?.axis,
			});
		} else {
			// map_rotate
			baseSvg = renderBaseMapSvg(it.render?.grid ?? 4, it.render?.base);
		}
	}

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

			{/* timer */}
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

			<Card>
				<CardHeader>
					<CardTitle>{it.prompt}</CardTitle>
				</CardHeader>
				<CardContent>
					{phase === "memorize" ? (
						<div className="rounded-lg border overflow-hidden">
							<div className="p-2 text-sm font-medium">
								Peta dasar (hafalkan)
							</div>
							<Separator />
							<div
								className="p-2"
								dangerouslySetInnerHTML={{ __html: baseSvg }}
							/>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-4">
							{(it.options as ChallengeOption[])?.map((o) => (
								<button
									key={o.optionId}
									className={`rounded-lg border overflow-hidden hover:shadow ${
										selected === o.optionId
											? "ring-2 ring-primary"
											: ""
									}`}
									onClick={() => setSelected(o.optionId!)}
								>
									<div className="p-2 text-left text-sm font-medium">
										Opsi {o.optionId}
									</div>
									<Separator />
									<div
										className="p-2"
										dangerouslySetInnerHTML={{
											__html: o.render?.svg || "",
										}}
									/>
								</button>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<div className="flex justify-end gap-2 mt-4">
				<Button
					variant="secondary"
					onClick={() => (phase === "memorize" ? undefined : next())}
					disabled={phase === "memorize"}
				>
					Lewati
				</Button>
				<Button onClick={submit} disabled={phase === "memorize"}>
					Kirim Jawaban
				</Button>
			</div>
		</div>
	);
}

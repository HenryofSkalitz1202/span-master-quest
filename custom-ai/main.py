import os, io, json, time, tempfile, uuid
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import google.generativeai as genai
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import re
import math, random, ast, base64, hashlib, hmac
from typing import Any, Dict, Tuple
# ====== ENV ======
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
ALLOW_ORIGINS = [o.strip() for o in os.getenv("ALLOW_ORIGINS", "http://localhost:8080").split(",")]
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent / "data"))

if not API_KEY:
    raise RuntimeError("Set GEMINI_API_KEY")

genai.configure(api_key=API_KEY)

GEN_CONFIG = {"response_mime_type": "application/json", "temperature": 0.2}
model = genai.GenerativeModel(model_name=MODEL_NAME, generation_config=genai.GenerationConfig(**GEN_CONFIG))

app = FastAPI(title="Quiz Generator via Gemini")
app.add_middleware(CORSMiddleware, allow_origins=ALLOW_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# siapkan folder data
QUIZ_DIR = DATA_DIR / "quizzes"
ATTEMPT_DIR = DATA_DIR / "attempts"
for d in (QUIZ_DIR, ATTEMPT_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ====== Constants & prompts ======
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png", "image/webp"}

QUIZ_SYSTEM_PROMPT = """Anda adalah generator soal profesional.
Keluarkan hasil PERSIS sebagai JSON array tanpa teks tambahan.
Schema (kunci harus Bahasa Indonesia):
{
  "pertanyaan": "...",
  "opsi": ["A ...","B ...","C ...","D ..."],
  "jawaban": "A"|"B"|"C"|"D",
  "penjelasan": "..."
}
- Gunakan 1 jawaban benar + 3 distraktor masuk akal (tidak ambigu).
- Tulis isi (pertanyaan, opsi, penjelasan) dalam bahasa YANG DIMINTA pengguna.
"""

LANG_NAME = {
  "id":"Bahasa Indonesia","en":"English","ms":"Bahasa Melayu","es":"Spanish",
  "fr":"French","de":"German","hi":"Hindi","ar":"Arabic","zh":"Chinese",
  "ja":"Japanese","ko":"Korean"
}

def lang_display(code: str) -> str:
    return LANG_NAME.get((code or "").lower(), code)

def build_user_prompt(n:int, difficulty:str, include_explanation:bool, topic_filter:Optional[str], out_lang:str):
    expl = "sertakan 'penjelasan' singkat" if include_explanation else "tanpa penjelasan"
    tf = f"Tema khusus: {topic_filter}." if topic_filter else ""
    return (
        f"Buat {n} soal pilihan ganda (A-D). Tingkat kesulitan: {difficulty}. {tf} "
        f"Tulis seluruh isi dalam bahasa: {lang_display(out_lang)}. "
        f"Kunci JSON tetap: pertanyaan, opsi, jawaban, penjelasan. Output HARUS JSON array. {expl}"
    )

def parse_json_or_fallback(text: str):
    # normalisasi key en -> id
    def normalize(item: dict):
        if "pertanyaan" not in item and "question" in item: item["pertanyaan"] = item.pop("question")
        if "opsi" not in item and "options" in item:       item["opsi"] = item.pop("options")
        if "jawaban" not in item and "answer" in item:      item["jawaban"] = item.pop("answer")
        if "penjelasan" not in item and "explanation" in item: item["penjelasan"] = item.pop("explanation")
        return item
    try:
        data = json.loads(text)
        if isinstance(data, dict): data = [data]
        normed = [normalize(d) for d in data]
        for i, it in enumerate(normed, 1):
            it.setdefault("id", f"q{i}")
            it.setdefault("opsi", ["A", "B", "C", "D"])
        return normed
    except Exception:
        return [{
            "id":"q1","pertanyaan":"Gagal parse JSON dari model.","opsi":["A","B","C","D"],"jawaban":"A",
            "penjelasan": (text[:600] + ("..." if len(text) > 600 else "")),
        }]

def upload_to_gemini(upload: UploadFile):
    if upload.content_type not in ALLOWED_MIME:
        raise ValueError(f"mime tidak didukung: {upload.content_type}")
    suffix = os.path.splitext(upload.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(upload.file.read())
        tmp_path = tmp.name
    try:
        return genai.upload_file(path=tmp_path, mime_type=upload.content_type, display_name=upload.filename)
    finally:
        try: os.remove(tmp_path)
        except OSError: pass

def wait_until_active(files: List[genai.types.File], timeout_sec=60, poll=1.5):
    def norm(st):  # enum -> "ACTIVE", string -> as-is
        try: return st.name
        except AttributeError: return str(st)
    states = {f.name: norm(getattr(f, "state", None)) for f in files}
    if all(s == "ACTIVE" for s in states.values()):
        return True, states
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        states = {}
        all_active = True
        for f in files:
            info = genai.get_file(f.name)
            st = norm(getattr(info, "state", None))
            states[info.name] = st
            if st != "ACTIVE": all_active = False
        if all_active: return True, states
        time.sleep(poll)
    return False, states

# ====== Local store helpers ======
def _now_iso():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def _atomic_write(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def _read_json(path: Path) -> Optional[dict]:
    if not path.exists(): return None
    return json.loads(path.read_text(encoding="utf-8"))

def save_quiz_local(items: list, meta: dict) -> str:
    qid = uuid.uuid4().hex[:12]
    doc = {
        "_id": qid,
        "created_at": _now_iso(),
        "model": MODEL_NAME,
        "items": items,
        "meta": meta,
    }
    _atomic_write(QUIZ_DIR / f"{qid}.json", doc)
    return qid

def load_quiz_local(qid: str) -> Optional[dict]:
    return _read_json(QUIZ_DIR / f"{qid}.json")

def save_attempt_local(attempt: dict) -> str:
    aid = uuid.uuid4().hex[:12]
    attempt["_id"] = aid
    attempt["created_at"] = _now_iso()
    _atomic_write(ATTEMPT_DIR / f"{aid}.json", attempt)
    return aid

# ====== scoring helpers ======
def letter_to_index(letter: str) -> int:
    k = (letter or "A").strip().upper()
    return 1 if k == "B" else 2 if k == "C" else 3 if k == "D" else 0

# ====== Pydantic for attempts ======
class AnswerIn(BaseModel):
    question_id: str
    chosen_index: int = -1          # -1 = tidak menjawab
    order: List[int] = Field(default_factory=list)  # mapping index tampil -> index asli (0..3)
    time_sec: int = 0

class AttemptIn(BaseModel):
    quiz_id: str
    max_time_sec: int = 20
    player_name: Optional[str] = None
    answers: List[AnswerIn]

# ====== Endpoints ======
@app.get("/health")
def health(): return {"status":"ok","model":MODEL_NAME, "storage":"local-files"}

@app.post("/quiz/from-files")
async def quiz_from_files(
    files: List[UploadFile] = File(...),
    n: int = 10,
    difficulty: str = "mixed",
    include_explanation: bool = True,
    topic_filter: Optional[str] = Form(None),
    output_language: str = "id",
):
    if not files:
        return JSONResponse({"error": "unggah minimal satu file"}, status_code=400)
    try:
        uploaded = [upload_to_gemini(f) for f in files]
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    ok, states = wait_until_active(uploaded)
    if not ok:
        return JSONResponse({"error": "file belum ACTIVE di Gemini", "states": states}, status_code=503)

    file_parts = [{"file_data": {"file_uri": f.uri, "mime_type": f.mime_type}} for f in uploaded]
    text_part = "\n\n".join([QUIZ_SYSTEM_PROMPT, build_user_prompt(n, difficulty, include_explanation, topic_filter, output_language)])

    resp = model.generate_content(file_parts + [text_part], request_options={"timeout": 180})
    items = parse_json_or_fallback(resp.text)
    for i, it in enumerate(items, 1):
        it.setdefault("id", f"q{i}")
        if "opsi" in it and isinstance(it["opsi"], list):
            it["opsi"] = (it["opsi"] + ["", "", "", ""])[:4]

    quiz_id = save_quiz_local(items, {
        "source":"files", "file_count": len(files), "difficulty": difficulty, "n": n,
        "language": output_language, "include_explanation": include_explanation, "topic_filter": topic_filter
    })

    return {"quiz_id": quiz_id, "items": items, "meta": {"model": MODEL_NAME}}

@app.post("/quiz/from-text")
async def quiz_from_text(
    text: str = Form(...),
    n: int = 10,
    difficulty: str = "mixed",
    include_explanation: bool = True,
    topic_filter: Optional[str] = Form(None),
    output_language: str = "id",
):
    prompt = "\n\n".join([
        QUIZ_SYSTEM_PROMPT,
        f"Materi:\n{text[:120000]}",
        build_user_prompt(n, difficulty, include_explanation, topic_filter, output_language),
    ])
    resp = model.generate_content([prompt])
    items = parse_json_or_fallback(resp.text)
    for i, it in enumerate(items, 1):
        it.setdefault("id", f"q{i}")
        if "opsi" in it and isinstance(it["opsi"], list):
            it["opsi"] = (it["opsi"] + ["", "", "", ""])[:4]

    quiz_id = save_quiz_local(items, {
        "source":"text", "chars": len(text), "difficulty": difficulty, "n": n,
        "language": output_language, "include_explanation": include_explanation, "topic_filter": topic_filter
    })

    return {"quiz_id": quiz_id, "items": items, "meta": {"model": MODEL_NAME}}

@app.post("/quiz/attempts")
async def save_attempt(payload: AttemptIn):
    # load quiz
    quiz = load_quiz_local(payload.quiz_id)
    if not quiz:
        return JSONResponse({"error":"quiz_id tidak ditemukan"}, status_code=404)

    items = quiz.get("items", [])
    by_id = {str(it.get("id", "")): it for it in items}

    total_score = 0
    correct_count = 0
    wrong_count = 0
    duration = 0

    answers_out = []
    for ans in payload.answers:
        q = by_id.get(ans.question_id)
        if not q:
            continue
        orig_correct = letter_to_index(q.get("jawaban", "A"))

        # jika ada "order" (urutan opsi tampil -> indeks asli), map
        if ans.order and len(ans.order) == 4:
            try:
                correct_display_index = ans.order.index(orig_correct)
            except ValueError:
                correct_display_index = orig_correct
        else:
            correct_display_index = orig_correct

        is_correct = (ans.chosen_index == correct_display_index)
        if is_correct:
            base = 700
            bonus = max(0, int(round((payload.max_time_sec - ans.time_sec) / payload.max_time_sec * 300)))
            total_score += base + bonus
            correct_count += 1
        else:
            wrong_count += 1

        duration += max(0, int(ans.time_sec))
        answers_out.append({
            "question_id": ans.question_id,
            "chosen_index": ans.chosen_index,
            "correct_index": correct_display_index,
            "order": ans.order,
            "time_sec": ans.time_sec,
            "is_correct": is_correct,
        })

    attempt_doc = {
        "quiz_id": payload.quiz_id,
        "player": {"name": payload.player_name} if payload.player_name else {},
        "score": {"total": total_score, "correct": correct_count, "wrong": wrong_count},
        "duration_sec": duration,
        "max_time_sec": payload.max_time_sec,
        "answers": answers_out,
        "meta": quiz.get("meta", {}),
        "model": quiz.get("model", MODEL_NAME),
    }

    attempt_id = save_attempt_local(attempt_doc)
    return {
        "attempt_id": attempt_id,
        "quiz_id": payload.quiz_id,
        "score": attempt_doc["score"],
        "duration_sec": duration,
        "answers": answers_out,
    }
SUMMARY_SYSTEM_PROMPT_MD = """Anda adalah asisten ringkasan materi.

KELUARKAN PERSIS SEBAGAI JSON:
{
  "summary": "<MARKDOWN>"
}

Ketentuan penulisan MARKDOWN:
- Bahasa keluaran sesuai instruksi pengguna.
- Gunakan heading level-2 (##) untuk bagian: "Tujuan", "Konsep Kunci", "Proses/Rumus", "Catatan" (hanya yang relevan).
- Gunakan bullet list dengan tanda minus: "- " (bukan "*", "•", atau angka).
- Hindari tabel, tautan, code fence, dan kutipan panjang.
- Maksimal panjang mendekati 'max_chars'.
"""

def cleanup_markdown(md: str) -> str:
    # Samakan bullet ke "- ", rapikan baris kosong
    md = re.sub(r"^\s*[*•]\s+", "- ", md, flags=re.M)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip()

def build_summary_prompt(output_language: str, max_chars: int, fmt: str):
    if fmt == "plain":
        return "\n\n".join([
            "Anda adalah asisten ringkasan materi.",
            'KELUARKAN PERSIS SEBAGAI JSON: {"summary":"..."}',
            f"Ringkas dalam bahasa: {lang_display(output_language)}.",
            "Tanpa markdown/bold/italic, gunakan bullet dengan awalan '- ' bila perlu.",
            f"Maksimal panjang mendekati {max_chars} karakter."
        ])
    # default markdown
    return "\n\n".join([
        SUMMARY_SYSTEM_PROMPT_MD,
        f"Ringkas dalam bahasa: {lang_display(output_language)}.",
        f"max_chars: {max_chars}."
    ])

def parse_summary_response(text: str) -> str:
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "summary" in data:
            return str(data["summary"])
        if isinstance(data, list):
            return "\n\n".join(str(it.get("summary","")) for it in data if isinstance(it, dict))
    except Exception:
        pass
    return text

@app.post("/summary/from-files")
async def summary_from_files(
    files: List[UploadFile] = File(..., description="PDF / JPG / PNG / WEBP"),
    output_language: str = "id",
    max_chars: int = 1000,
    format: str = "markdown",  # "markdown" | "plain"
):
    if not files:
        return JSONResponse({"error": "unggah minimal satu file"}, status_code=400)
    try:
        uploaded = [upload_to_gemini(f) for f in files]
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    ok, states = wait_until_active(uploaded)
    if not ok:
        return JSONResponse({"error": "file belum ACTIVE di Gemini", "states": states}, status_code=503)

    prompt = build_summary_prompt(output_language, max_chars, format)
    file_parts = [{"file_data": {"file_uri": f.uri, "mime_type": f.mime_type}} for f in uploaded]
    resp = model.generate_content(file_parts + [prompt], request_options={"timeout": 180})

    summary = parse_summary_response(resp.text).strip()
    if format == "markdown":
        summary = cleanup_markdown(summary)

    # # guard: potong aman di batas karakter
    # if len(summary) > max_chars:
    #     summary = summary[:max_chars].rsplit(" ", 1)[0] + "..."

    return {
        "summary": summary,
        "format": format,
        "meta": {"model": MODEL_NAME, "file_count": len(files), "language": output_language}
    }



# ============================================
# == COMPLETION BLOCK: Local Generators & IO ==
# ============================================
import math, random, ast, base64, hashlib, hmac
from typing import List, Optional, Tuple, Dict, Any

# ---------- Directories (pakai DATA_DIR existing) ----------
CHALLENGE_DIR = DATA_DIR / "challenges"
SUBMISSION_DIR = DATA_DIR / "submissions"
for d in (CHALLENGE_DIR, SUBMISSION_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ---------- Storage helpers (jika belum ada) ----------
if 'save_challenge_local' not in globals():
    def save_challenge_local(doc: dict) -> str:
        cid = uuid.uuid4().hex[:12]
        doc = dict(doc)
        doc["_id"] = cid
        doc["created_at"] = _now_iso()
        _atomic_write(CHALLENGE_DIR / f"{cid}.json", doc)
        return cid

if 'load_challenge_local' not in globals():
    def load_challenge_local(cid: str) -> Optional[dict]:
        return _read_json(CHALLENGE_DIR / f"{cid}.json")

if 'save_submission_local' not in globals():
    def save_submission_local(doc: dict) -> str:
        sid = uuid.uuid4().hex[:12]
        doc = dict(doc)
        doc["_id"] = sid
        doc["created_at"] = _now_iso()
        _atomic_write(SUBMISSION_DIR / f"{sid}.json", doc)
        return sid

# ---------- Answer hashing for client (anti-bocor) ----------
SERVER_SALT = os.getenv("SERVER_SALT", "PLEASE_CHANGE_THIS_TO_A_RANDOM_LONG_SECRET")

def _answer_hash(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    digest = hmac.new(SERVER_SALT.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")

def sanitize_items(items: List[dict]) -> List[dict]:
    out = []
    for it in items:
        it2 = {k: v for k, v in it.items() if k != "solution"}
        if "solution" in it:
            it2["answerHash"] = _answer_hash({"itemId": it["itemId"], "solution": it["solution"]})
        out.append(it2)
    return out

# ==========================================================
# ================== MEMORY (LOCAL FALLBACK) ===============
# ==========================================================
_LEXICON_BANK = {
    "Sunda": [
        ("punten","permisi"), ("neda","makan"), ("teu","tidak"),
        ("leumpang","berjalan"), ("duka","tidak tahu"), ("hatur nuhun","terima kasih")
    ],
    "Jawa": [
        ("mangan","makan"), ("mlaku","berjalan"), ("ora","tidak"),
        ("suwun","terima kasih"), ("tulung","tolong"), ("pamit","permisi")
    ],
    "Minang": [
        ("makan","makan"), ("indak","tidak"), ("pai","pergi"),
        ("ciek","satu"), ("bapikir","berpikir"), ("tibo","jatuh")
    ],
    "Bugis": [
        ("mammio","belajar"), ("malllempa","jalan"), ("iyye","iya"),
        ("de’na","tidak"), ("sipulung","berkumpul"), ("accera","membaca")
    ],
    "Batak": [
        ("mangan","makan"), ("marsak","susah"), ("mauliate","terima kasih"),
        ("adong","ada"), ("ndang","tidak"), ("marsogot","cepat")
    ],
    "Bali": [
        ("nampiin","membereskan"), ("meli","membeli"), ("ulung","meminjam"),
        ("sing","tidak"), ("titiang","saya"), ("suksma","terima kasih")
    ],
}

def _pick_pairs_for_region(rnd: random.Random, region: str, k: int) -> List[Tuple[str,str]]:
    bank = _LEXICON_BANK.get(region, [])
    rnd.shuffle(bank)
    return bank[:k] if len(bank) >= k else bank

def _gen_memory_lexicon(rnd: random.Random, idx: int, region: Optional[str], pairs_count: int = 4) -> dict:
    region = region or rnd.choice(list(_LEXICON_BANK.keys()))
    pairs = _pick_pairs_for_region(rnd, region, pairs_count)
    if len(pairs) < pairs_count:
        other_regions = [r for r in _LEXICON_BANK.keys() if r != region]
        for r in other_regions:
            if len(pairs) >= pairs_count: break
            for p in _LEXICON_BANK[r]:
                if p not in pairs:
                    pairs.append(p)
                if len(pairs) >= pairs_count: break

    terms = [t for t,_ in pairs]
    defs  = [d for _,d in pairs]
    # distraktor definisi dari region lain
    distractors = []
    for r in _LEXICON_BANK.keys():
        if r == region: continue
        for _,d in _LEXICON_BANK[r]:
            if d not in defs and d not in distractors:
                distractors.append(d)
            if len(distractors) >= 2: break
        if len(distractors) >= 2: break

    solution = {t:d for (t,d) in pairs}
    return {
        "itemId": f"mem_lx_{idx}",
        "variant": "lexicon_match",
        "prompt": f"Ingat pasangan istilah {region} berikut, lalu pasangkan definisinya.",
        "render": {
            "kind": "match",
            "pairs": [{"term":t,"definition":d,"region":region} for (t,d) in pairs],
            "distractors": distractors,
            "displayMs": 12000,
            "revealMode": "sequential"
        },
        "answerSpec": {"mode": "mapping", "leftKeys": terms, "rightOptions": defs + distractors},
        "solution": solution,
        "metadata": {"region": region, "pairsCount": pairs_count}
    }

def _gen_memory_sequence_missing(rnd: random.Random, idx: int, length: int = 7, mask_cnt: int = 2) -> dict:
    seq = [rnd.randrange(0,10) for _ in range(length)]
    mask_idx = sorted(rnd.sample(range(length), k=min(mask_cnt, max(1, length//3))))
    solution = [seq[i] for i in mask_idx]
    return {
        "itemId": f"mem_seq_{idx}",
        "variant": "sequence_missing",
        "prompt": "Tonton urutan lalu isi bagian yang hilang.",
        "render": {"kind": "sequence", "sequence": seq, "displayMs": 500, "gapMs": 200, "maskIndices": mask_idx},
        "answerSpec": {"mode": "sequence_fill", "dataType": "number[]"},
        "solution": solution,
        "metadata": {"length": length, "masked": len(mask_idx)}
    }

_SCENE_ICONS = ["house","tree","car","shop","bench","lamp","school","tower","boat"]
def _gen_memory_scene_recall(rnd: random.Random, idx: int, grid: int = 4, obj_cnt: int = 3) -> dict:
    coords = [(r,c) for r in range(grid) for c in range(grid)]
    rnd.shuffle(coords)
    objects = []
    for i in range(obj_cnt):
        objects.append({
            "id": f"obj{i+1}",
            "pos": list(coords[i]),
            "icon": rnd.choice(_SCENE_ICONS),
            "color": rnd.choice(["#3B82F6","#10B981","#EF4444","#F59E0B","#8B5CF6"])
        })
    change_type = rnd.choice(["removed","moved"])
    if change_type == "removed":
        target = rnd.choice(objects)
        solution = target["id"]
        change = {"type":"removed","targetId":solution}
        options = [o["id"] for o in objects]
    else:
        target = rnd.choice(objects)
        new_pos = coords[obj_cnt]
        solution = f'{target["id"]}@{new_pos[0]}-{new_pos[1]}'
        change = {"type":"moved","targetId":target["id"],"to":list(new_pos)}
        options = [f'{o["id"]}@{o["pos"][0]}-{o["pos"][1]}' for o in objects] + [solution]
        options = options[:4] if len(options)>=4 else options
    return {
        "itemId": f"mem_sc_{idx}",
        "variant": "scene_recall",
        "prompt": "Satu objek pada scene berubah. Pilih perubahan yang benar.",
        "render": {"kind":"scene","grid": grid,"objects": objects,"change": change},
        "answerSpec": {"mode":"single_choice", "options": options},
        "solution": solution,
        "metadata": {"grid": grid, "objects": obj_cnt, "change": change_type}
    }

def generate_memory_bundle(rnd: random.Random, difficulty: Optional[str]) -> List[dict]:
    if (difficulty or "").lower() in ("hard","sulit"):
        pairs = [5,5]; length_mask = [(9,3),(9,3)]; grid_obj = (5,4)
    elif (difficulty or "").lower() in ("medium","sedang"):
        pairs = [4,4]; length_mask = [(7,2),(7,2)]; grid_obj = (4,3)
    else:
        pairs = [3,3]; length_mask = [(6,2),(6,1)]; grid_obj = (4,3)
    items = []
    regions = list(_LEXICON_BANK.keys()); rnd.shuffle(regions)
    items.append(_gen_memory_lexicon(rnd, 1, regions[0], pairs_count=pairs[0]))
    items.append(_gen_memory_lexicon(rnd, 2, regions[1] if len(regions)>1 else None, pairs_count=pairs[1]))
    items.append(_gen_memory_sequence_missing(rnd, 3, *length_mask[0]))
    items.append(_gen_memory_sequence_missing(rnd, 4, *length_mask[1]))
    items.append(_gen_memory_scene_recall(rnd, 5, grid=grid_obj[0], obj_cnt=grid_obj[1]))
    return items

# ==========================================================
# ================== SPATIAL (LOCAL FALLBACK) ==============
# ==========================================================
def _svg_rect(x,y,w,h,fill,rx=2,ry=2):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" ry="{ry}" fill="{fill}" />'

def _svg_circle(cx,cy,r,fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" />'

def _svg_line(x1,y1,x2,y2,stroke="#94a3b8",sw=2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" />'

def _render_map_svg(grid:int, roads:List[List[List[int]]], river:List[List[int]], landmarks:List[dict],
                    north:str="up", marker: Optional[List[int]]=None, axis: Optional[dict]=None) -> str:
    size = 56 * grid
    pad = 6
    cell = 56
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">']
    parts.append(f'<rect width="{size}" height="{size}" fill="#0B1020" rx="12" ry="12" />')
    for i in range(grid+1):
        parts.append(_svg_line(pad, pad+i*cell, size-pad, pad+i*cell, "#1f2937", 1))
        parts.append(_svg_line(pad+i*cell, pad, pad+i*cell, size-pad, "#1f2937", 1))
    for seg in roads or []:
        (r1,c1),(r2,c2) = seg
        x1,y1 = pad + c1*cell + cell//2, pad + r1*cell + cell//2
        x2,y2 = pad + c2*cell + cell//2, pad + r2*cell + cell//2
        parts.append(_svg_line(x1,y1,x2,y2,"#64748b",6))
    if river and len(river)>=2:
        pts = []
        for (r,c) in river:
            x,y = pad + c*cell + cell//2, pad + r*cell + cell//2
            pts.append(f"{x},{y}")
        parts.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#38bdf8" stroke-width="6" opacity="0.9" />')
    if axis:
        if axis.get("type")=="vertical":
            x = pad + axis["x"]*cell + cell//2
            parts.append(_svg_line(x,pad,x,size-pad,"#22c55e",2))
        elif axis.get("type")=="horizontal":
            y = pad + axis["y"]*cell + cell//2
            parts.append(_svg_line(pad,y,size-pad,y,"#22c55e",2))
    for lm in landmarks or []:
        r,c = lm["pos"]
        cx,cy = pad + c*cell + cell//2, pad + r*cell + cell//2
        icon = lm.get("icon","square")
        col = "#eab308"
        if icon == "circle":
            parts.append(_svg_circle(cx,cy,12,col))
        elif icon == "triangle":
            parts.append(f'<polygon points="{cx},{cy-14} {cx-12},{cy+10} {cx+12},{cy+10}" fill="{col}" />')
        else:
            parts.append(_svg_rect(cx-12,cy-12,24,24,col,4,4))
        parts.append(f'<text x="{cx}" y="{cy+28}" fill="#cbd5e1" font-size="12" text-anchor="middle">{lm.get("name","")}</text>')
    if marker:
        r,c = marker
        x,y = pad + c*cell + cell//2, pad + r*cell + cell//2
        parts.append(_svg_circle(x,y,8,"#ef4444"))
    parts.append("</svg>")
    return "".join(parts)

def _rot90(pos:Tuple[int,int], n:int) -> Tuple[int,int]:
    r,c = pos
    return (c, n-1-r)

def _apply_rotate_to_map(base:dict, deg:int, n:int) -> dict:
    times = (deg//90) % 4
    def rot(p):
        rr,cc = p
        for _ in range(times):
            rr,cc = _rot90((rr,cc), n)
        return [rr,cc]
    return {
        "roads": [ [ rot(tuple(a)), rot(tuple(b)) ] for (a,b) in base.get("roads",[]) ],
        "river": [ rot(tuple(p)) for p in base.get("river",[]) ],
        "landmarks": [{"name":lm["name"],"pos":rot(tuple(lm["pos"])),"icon":lm.get("icon","square")} for lm in base.get("landmarks",[])],
        "north": base.get("north","up")
    }

def _gen_spatial_map_base(rnd: random.Random, grid:int) -> dict:
    roads = []
    for _ in range(2):
        r1,c1 = rnd.randrange(0,grid), rnd.randrange(0,grid)
        r2,c2 = rnd.randrange(0,grid), rnd.randrange(0,grid)
        roads.append([[r1,c1],[r2,c2]])
    river = [[0, rnd.randrange(0,grid)], [grid-1, rnd.randrange(0,grid)]]
    names = ["Sekolah","Pasar","Rumah"]
    icons = ["square","circle","triangle"]
    coords = [(r,c) for r in range(grid) for c in range(grid)]
    rnd.shuffle(coords)
    landmarks = []
    for i in range(min(3, grid)):
        landmarks.append({"name": names[i%len(names)], "pos": list(coords[i]), "icon": icons[i%len(icons)]})
    return {"roads": roads, "river": river, "landmarks": landmarks, "north": "up"}

def _gen_spatial_rotate(rnd: random.Random, idx:int, grid:int=4, deg:int=90) -> dict:
    base = _gen_spatial_map_base(rnd, grid)
    option_letters = ["A","B","C","D"]
    correct_letter = rnd.choice(option_letters)
    options = []
    for L in option_letters:
        d = deg if L == correct_letter else rnd.choice([90,180,270])
        rotated = _apply_rotate_to_map(base, d, grid)
        svg = _render_map_svg(grid, rotated["roads"], rotated["river"], rotated["landmarks"], rotated["north"])
        options.append({"optionId": L, "render": {"kind": "svg", "svg": svg}})
    return {
        "itemId": f"sp_rot_{idx}",
        "variant": "map_rotate",
        "prompt": f"Setelah peta diputar {deg}° searah jarum jam, pilih peta yang benar.",
        "render": {"kind":"map-svg","grid":grid,"base":base,"action":{"type":"rotate","deg":deg}},
        "options": options,
        "answerSpec": {"mode":"single_choice","options": option_letters},
        "solution": correct_letter,
        "metadata": {"theme":"rotate","grid":grid,"deg":deg}
    }

def _gen_spatial_route(rnd: random.Random, idx:int, grid:int=5, steps:int=4) -> dict:
    base = _gen_spatial_map_base(rnd, grid)
    start = base["landmarks"][0]["pos"]
    dirs = {"N":(-1,0),"S":(1,0),"E":(0,1),"W":(0,-1)}
    cur = tuple(start)
    path_cmd = []
    for _ in range(steps):
        cand = []
        r,c = cur
        if r>0: cand.append(("N",(r-1,c)))
        if r<grid-1: cand.append(("S",(r+1,c)))
        if c<grid-1: cand.append(("E",(r,c+1)))
        if c>0: cand.append(("W",(r,c-1)))
        d,nxt = rnd.choice(cand)
        path_cmd.append([d,1])
        cur = nxt
    final = list(cur)
    option_letters = ["A","B","C","D"]
    deltas = [(0,0),(1,0),(0,1),(-1,0),(0,-1)]
    rnd.shuffle(deltas)
    coords = []
    for dx,dy in deltas[:4]:
        r = max(0, min(grid-1, final[0]+dx))
        c = max(0, min(grid-1, final[1]+dy))
        coords.append([r,c])
    rnd.shuffle(option_letters)
    options = []
    sol_letter = None
    for i,L in enumerate(option_letters):
        pos = coords[i]
        svg = _render_map_svg(grid, base["roads"], base["river"], base["landmarks"], base["north"], marker=pos)
        options.append({"optionId": L, "render": {"kind":"svg","svg": svg}})
        if pos == final: sol_letter = L
    return {
        "itemId": f"sp_nav_{idx}",
        "variant": "route_nav",
        "prompt": f"Dari {base['landmarks'][0]['name']}, ikuti langkah {steps} langkah. Dimana posisi akhir?",
        "render": {"kind":"map-svg","grid": grid, "base": base, "action": {"type":"path","from": base['landmarks'][0]['name'], "start": start, "steps": path_cmd}},
        "options": options,
        "answerSpec": {"mode":"single_choice","options":["A","B","C","D"]},
        "solution": sol_letter,
        "metadata": {"theme":"path","grid":grid,"steps":path_cmd}
    }

def _gen_spatial_reflect(rnd: random.Random, idx:int, grid:int=5) -> dict:
    base = _gen_spatial_map_base(rnd, grid)
    axis = rnd.choice([{"type":"vertical","x": rnd.randrange(0,grid)}, {"type":"horizontal","y": rnd.randrange(0,grid)}])
    target = rnd.choice(base["landmarks"])
    def _reflect_point(pos:Tuple[int,int], axis:dict, n:int) -> Tuple[int,int]:
        r,c = pos
        if axis.get("type")=="vertical":
            x = axis["x"]; return (r, x - (c - x))
        y = axis["y"]; return (y - (r - y), c)
    reflected = list(_reflect_point(tuple(target["pos"]), axis, grid))
    option_letters = ["A","B","C","D"]
    coords = [reflected]
    while len(coords)<4:
        r = rnd.randrange(0,grid); c = rnd.randrange(0,grid)
        if [r,c] not in coords: coords.append([r,c])
    rnd.shuffle(coords)
    options = []
    sol_letter = None
    for i,L in enumerate(option_letters):
        svg = _render_map_svg(grid, base["roads"], base["river"], base["landmarks"], base["north"], marker=coords[i], axis=axis)
        options.append({"optionId": L, "render": {"kind":"svg","svg": svg}})
        if coords[i]==reflected: sol_letter = L
    return {
        "itemId": f"sp_ref_{idx}",
        "variant": "mirror_reflect",
        "prompt": f"Tentukan posisi cermin '{target['name']}' terhadap " + ("x="+str(axis.get("x")) if axis.get("type")=="vertical" else "y="+str(axis.get("y"))),
        "render": {"kind":"map-svg","grid":grid,"base":base,"action":{"type":"reflect","target":target["name"],"axis":axis}},
        "options": options,
        "answerSpec": {"mode":"single_choice","options":["A","B","C","D"]},
        "solution": sol_letter,
        "metadata": {"theme":"reflect","grid":grid,"axis":axis}
    }

def generate_spatial_bundle(rnd: random.Random, difficulty: Optional[str]) -> List[dict]:
    if (difficulty or "").lower() in ("hard","sulit"):
        grids = [5,5,5,5,5]; steps = [5,6]
    elif (difficulty or "").lower() in ("medium","sedang"):
        grids = [4,4,4,4,5]; steps = [4,5]
    else:
        grids = [3,3,4,4,4]; steps = [3,4]
    items = []
    items.append(_gen_spatial_rotate(rnd, 1, grid=grids[0], deg=random.choice([90,180,270])))
    items.append(_gen_spatial_route(rnd, 2, grid=grids[1], steps=random.choice(steps)))
    items.append(_gen_spatial_rotate(rnd, 3, grid=grids[2], deg=random.choice([90,180,270])))
    items.append(_gen_spatial_route(rnd, 4, grid=grids[3], steps=random.choice(steps)))
    items.append(_gen_spatial_reflect(rnd, 5, grid=grids[4]))
    return items

# ==========================================================
# ================= NUMERICAL (LOCAL FALLBACK) =============
# ==========================================================
# safe eval untuk 24
_ALLOWED_NODES = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub, ast.UAdd, ast.Pow, ast.Load)
def _safe_eval_expr(expr: str) -> float:
    expr = expr.replace("×","*").replace("÷","/").replace("^","**")
    if not re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s]*", expr):
        raise ValueError("invalid characters")
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("node not allowed")
    return eval(compile(tree, "<expr>", "eval"), {"__builtins__":{}})

def _extract_int_literals(expr: str) -> List[int]:
    expr = expr.replace("×","*").replace("÷","/")
    tokens = re.findall(r"\d+", expr)
    return [int(t) for t in tokens]

def _verify_24_expression(expr: str, nums: List[int], target: int = 24) -> bool:
    try:
        val = _safe_eval_expr(expr)
        if not math.isclose(val, target, rel_tol=1e-6, abs_tol=1e-6):
            return False
        lits = _extract_int_literals(expr)
        counts_expr = {}
        for x in lits: counts_expr[x] = counts_expr.get(x,0)+1
        counts_req = {}
        for x in nums: counts_req[x] = counts_req.get(x,0)+1
        return counts_expr == counts_req
    except Exception:
        return False

# V1: 24-mini (target 24)
_KNOWN_24 = [
    [3,3,8,8], [1,3,4,6], [2,2,6,6], [4,4,10,10], [1,5,5,5], [1,1,2,12], [2,7,7,7],
    [2,3,4,6], [2,2,8,8], [5,5,5,5]
]
def _gen_num_24(rnd: random.Random, idx:int) -> dict:
    nums = rnd.choice(_KNOWN_24)
    target = 24
    fallback = "(8 / (3 - 8/3))" if nums==[3,3,8,8] else None
    return {
        "itemId": f"num_24_{idx}",
        "variant": "target_24",
        "prompt": "Susun ekspresi dari keempat angka agar bernilai 24.",
        "render": {"kind":"build-expression","numbers": nums, "operators": ["+","-","×","÷"], "target": target, "slots": 7},
        "answerSpec": {"mode":"expression","alphabet": ["0-9","+","-","×","÷","(",")"]},
        "solution": {"numbers": nums, "target": target, "oneSolution": fallback},
        "metadata": {"mustUseAllNumbers": True, "allowParentheses": True, "difficulty": "easy"}
    }

# V2: Number Maze (path ke target)
def _apply_op(a:int, b:int, op:str) -> Optional[int]:
    if op == "+": return a + b
    if op == "-": return a - b
    if op == "×": return a * b
    if op == "÷":
        if b == 0: return None
        if a % b == 0: return a // b
        return None
    return None

def _gen_num_maze(rnd: random.Random, idx:int, grid:int=3, max_steps:int=4) -> dict:
    cells = [[rnd.randrange(1,10) for _ in range(grid)] for _ in range(grid)]
    start = [rnd.randrange(0,grid), rnd.randrange(0,grid)]
    cur = tuple(start)
    steps = []
    dirs = {"N":(-1,0),"S":(1,0),"E":(0,1),"W":(0,-1)}
    path_cells = [list(cur)]
    for _ in range(max_steps):
        cand = []
        r,c = cur
        if r>0: cand.append(("N",(r-1,c)))
        if r<grid-1: cand.append(("S",(r+1,c)))
        if c<grid-1: cand.append(("E",(r,c+1)))
        if c>0: cand.append(("W",(r,c-1)))
        d,nxt = rnd.choice(cand)
        steps.append([d,1])
        cur = nxt
        path_cells.append([cur[0],cur[1]])
    ops = ["+","-","×","÷"]
    edges_h = [[rnd.choice(ops) for _ in range(grid-1)] for _ in range(grid)]
    edges_v = [[rnd.choice(ops) for _ in range(grid)] for _ in range(grid-1)]
    value = cells[start[0]][start[1]]
    cur_r, cur_c = start
    for (d,_len) in steps:
        dr,dc = dirs[d]
        nr,nc = cur_r+dr, cur_c+dc
        if d in ("E","W"):
            cc = min(cur_c, nc)
            op = edges_h[cur_r][cc]
        else:
            rr = min(cur_r, nr)
            op = edges_v[rr][cur_c]
        val_next = _apply_op(value, cells[nr][nc], op)
        if val_next is None:
            op = "+"
            if d in ("E","W"):
                edges_h[cur_r][cc] = op
            else:
                edges_v[rr][cur_c] = op
            val_next = value + cells[nr][nc]
        value = val_next
        cur_r,cur_c = nr,nc
    target = value
    return {
        "itemId": f"num_maze_{idx}",
        "variant": "number_maze",
        "prompt": f"Mulai dari nilai sel awal. Pilih jalur agar nilai akhir = {target}.",
        "render": {"kind":"path-grid","grid":grid,"cells":cells,"edges":{"h":edges_h,"v":edges_v},"start": start,"target": target,"maxSteps": max_steps},
        "answerSpec": {"mode":"path","encoding":"cells"},
        "solution": {"pathCells": path_cells},
        "metadata": {"difficulty": "easy" if grid==3 else "medium", "maxSteps": max_steps}
    }

# V3: Equation Fill (lokal)
def _gen_num_equation_fill(rnd: random.Random, idx:int, level:str="medium") -> dict:
    a = rnd.randrange(12,89); b = rnd.randrange(12,89)
    c = a + b
    left = f"{a} + {b}"
    right = f"{c}"
    def mask_digits(s: str, k: int) -> Tuple[str, List[int], List[str]]:
        positions = [i for i,ch in enumerate(s) if ch.isdigit()]
        pick = rnd.sample(positions, k=min(k,len(positions)))
        sol = [s[i] for i in pick]
        s_list = list(s)
        for i in pick: s_list[i] = "□"
        return "".join(s_list), pick, sol
    left_m, left_pos, left_sol = mask_digits(left, 1 if level=="easy" else 2)
    right_m, right_pos, right_sol = mask_digits(right, 1)
    blanks = len(left_sol)+len(right_sol)
    return {
        "itemId": f"num_eq_{idx}",
        "variant": "equation_fill",
        "prompt": "Isi kotak agar persamaan benar.",
        "render": {"kind":"fill-blanks","expressionLeft": left_m,"expressionRight": right_m,"blanks": blanks,"constraints":{"distinct": False}},
        "answerSpec": {"mode":"digits","count": blanks},
        "solution": left_sol + right_sol,
        "metadata": {"difficulty": level, "original": {"left": left, "right": right}}
    }

# V4: Function Machine (lokal)
def _gen_num_function_machine(rnd: random.Random, idx:int) -> dict:
    a,b,c = rnd.randrange(2,5), rnd.randrange(1,6), rnd.randrange(2,6)
    x = rnd.randrange(8,30)
    f = f"{a}x + {b}"
    g = f"x / {c}"
    gval = x / c
    fval = a*gval + b
    return {
        "itemId": f"num_fn_{idx}",
        "variant": "function_machine",
        "prompt": f"Diberikan f(x)={f} dan g(x)={g}. Hitung f(g({x})).",
        "render": {"kind":"text","functions":{"f":f,"g":g},"query":f"f(g({x}))"},
        "answerSpec": {"mode":"free","dataType":"number"},
        "solution": fval,
        "metadata": {"steps":[f"g({x})={gval}", f"f({gval})={fval}"], "difficulty":"medium"}
    }

# V5: Modular Arithmetic (hard)
def _gen_num_modular(rnd: random.Random, idx:int) -> dict:
    m = rnd.choice([17,19,23,26,29,31])
    a = rnd.randrange(50,160)
    b = rnd.randrange(10,60)
    c = rnd.randrange(5,40)
    val = (a*b + c) % m
    return {
        "itemId": f"num_mod_{idx}",
        "variant": "modular_arith",
        "prompt": f"Hitung ({a} × {b} + {c}) mod {m}.",
        "render": {"kind":"text"},
        "answerSpec": {"mode":"free","dataType":"number"},
        "solution": val,
        "metadata": {"difficulty":"hard","mod":m}
    }

# V6: Base Conversion (hard)
def _gen_num_base_convert(rnd: random.Random, idx:int) -> dict:
    n = rnd.randrange(25,127)
    return {
        "itemId": f"num_base_{idx}",
        "variant": "base_convert",
        "prompt": f"Ubah {bin(n)[2:]}₂ ke basis 10.",
        "render": {"kind":"text"},
        "answerSpec": {"mode":"free","dataType":"number"},
        "solution": n,
        "metadata": {"fromBase":2,"toBase":10,"difficulty":"hard"}
    }

# V7: Probability / Ratio (hard)
def _gen_num_prob_ratio(rnd: random.Random, idx:int) -> dict:
    r = rnd.randrange(4,8); b = rnd.randrange(3,6); g = rnd.randrange(2,5)
    total = r+b+g
    num = r * (r-1)
    den = total * (total-1)
    val = num/den
    return {
        "itemId": f"num_prob_{idx}",
        "variant": "prob_ratio",
        "prompt": f"Dalam tas ada {r} merah, {b} biru, {g} hijau. Ambil 2 tanpa pengembalian. Peluang keduanya merah?",
        "render": {"kind":"text"},
        "answerSpec": {"mode":"free","dataType":"number"},
        "solution": val,
        "metadata": {"difficulty":"hard","accept":["fraction","decimal"],"fraction":[num,den]}
    }

def generate_numerical_bundle(rnd: random.Random, difficulty_hint: Optional[str]) -> List[dict]:
    items = []
    items.append(_gen_num_24(rnd, 1))                                   # Easy
    items.append(_gen_num_maze(rnd, 2, grid=3, max_steps=4))            # Easy
    items.append(_gen_num_equation_fill(rnd, 3, level="medium"))        # Medium
    items.append(_gen_num_function_machine(rnd, 4))                     # Medium
    items.append(random.choice([_gen_num_modular, _gen_num_base_convert, _gen_num_prob_ratio])(rnd, 5))  # Hard
    return items

if '_llm_json' not in globals():
    def _llm_json(prompt: str, timeout_sec: int = 45) -> Any:
        sys = (
            "KELUARKAN PERSIS JSON VALID tanpa teks lain, tanpa markdown, tanpa komentar. "
            "Pastikan JSON bisa di-parse Python."
        )
        resp = model.generate_content([sys, prompt], request_options={"timeout": timeout_sec})
        txt = (resp.text or "").strip()
        return json.loads(txt)

# --- helper: sembunyikan solusi untuk klien ---
if '_answer_hash' not in globals():
    SERVER_SALT = os.getenv("SERVER_SALT", "PLEASE_CHANGE_THIS_TO_A_RANDOM_LONG_SECRET")
    import base64, hashlib, hmac
    def _answer_hash(payload: Any) -> str:
        raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        digest = hmac.new(SERVER_SALT.encode("utf-8"), raw, hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

if '_sanitize_items_llm' not in globals():
    def _sanitize_items_llm(items: list) -> list:
        clean = []
        for it in items:
            it2 = {k: v for k, v in it.items() if k != "solution"}
            if "solution" in it:
                it2["answerHash"] = _answer_hash({"itemId": it["itemId"], "solution": it["solution"]})
            clean.append(it2)
        return clean

# ========= MEMORY via LLM =========
_ALLOWED_REGIONS = ["Sunda","Jawa","Minang","Bugis","Batak","Bali"]

def _mem_llm_lexicon_item(rnd: random.Random, idx: int, pairs_count: int = 4) -> dict:
    prompt = f"""
Buat pasangan istilah bahasa daerah dan definisinya.
Output JSON:
{{
  "variant": "lexicon_match",
  "region": "<daerah>",
  "pairs": [{{"term":"...","definition":"..."}}, ...],
  "distractors": ["...","..."]
}}
Ketentuan:
- region salah satu dari {_ALLOWED_REGIONS}.
- {pairs_count} pasangan, istilah ≤ 12 karakter, definisi ≤ 6 kata.
- 2 distraktor definisi yang masuk akal namun tidak cocok.
- Bahasa Indonesia. Tanpa teks di luar JSON.
"""
    data = _llm_json(prompt)
    reg = data.get("region") or rnd.choice(_ALLOWED_REGIONS)
    if reg not in _ALLOWED_REGIONS:
        reg = rnd.choice(_ALLOWED_REGIONS)
    pairs = list(data.get("pairs") or [])[:pairs_count]
    if len(pairs) < max(3, pairs_count-1):
        raise RuntimeError("LLM lexicon: pairs kurang")

    terms, defs = [], []
    for p in pairs:
        t = str(p.get("term","")).strip()
        d = str(p.get("definition","")).strip()
        if t and d and t not in terms:
            terms.append(t); defs.append(d)

    dis = [str(x).strip() for x in (data.get("distractors") or []) if str(x).strip()]
    while len(dis) < 2:
        dis.append(f"dummy_{rnd.randrange(100,999)}")

    solution = {t:d for t,d in zip(terms, defs)}
    return {
        "itemId": f"mem_lx_{idx}",
        "variant": "lexicon_match",
        "prompt": f"Ingat pasangan istilah {reg} berikut, lalu pasangkan definisinya.",
        "render": {"kind":"match","pairs":[{"term":t,"definition":solution[t],"region":reg} for t in terms],"distractors":dis[:2],"displayMs":12000,"revealMode":"sequential"},
        "answerSpec": {"mode":"mapping","leftKeys": terms, "rightOptions": defs + dis[:2]},
        "solution": solution,
        "metadata": {"region": reg, "pairsCount": len(terms)}
    }

def _mem_llm_sequence_item(rnd: random.Random, idx: int, length: int = 7, masked: int = 2) -> dict:
    prompt = f"""
Buat urutan angka bermakna untuk memory (aritmetika/geometri/pola sederhana).
Output JSON:
{{
  "variant": "sequence_missing",
  "sequence": [angka, ...],
  "maskIndices": [indeks0_based, ...]
}}
Ketentuan:
- Panjang {length}. maskIndices {masked} posisi unik dalam 0..{length-1}.
- Nilai integer non-negatif. Tanpa teks lain.
"""
    data = _llm_json(prompt)
    seq = data.get("sequence") or []
    mask = data.get("maskIndices") or []
    if not (isinstance(seq,list) and len(seq)==length): raise RuntimeError("LLM seq: panjang salah")
    mask = sorted(list({int(i) for i in mask if 0 <= int(i) < length}))[:masked]
    if len(mask) != masked: raise RuntimeError("LLM seq: mask salah")
    solution = [seq[i] for i in mask]
    return {
        "itemId": f"mem_seq_{idx}",
        "variant": "sequence_missing",
        "prompt": "Tonton urutan lalu isi bagian yang hilang.",
        "render": {"kind":"sequence","sequence": seq, "displayMs": 500, "gapMs": 200, "maskIndices": mask},
        "answerSpec": {"mode":"sequence_fill","dataType":"number[]"},
        "solution": solution,
        "metadata": {"length": length, "masked": masked}
    }

def _mem_llm_scene_item(rnd: random.Random, idx: int, grid: int = 4, obj_cnt: int = 3) -> dict:
    prompt = f"""
Buat skenario scene sederhana untuk memory recall.
Output JSON:
{{
  "variant": "scene_recall",
  "grid": {grid},
  "objects": [{{"id":"...","icon":"house|tree|car|shop","pos":[r,c],"color":"#RRGGBB"}}, ...],
  "change": {{"type":"removed"|"moved","targetId":"id", "to":[r,c] (optional untuk moved)}}
}}
Ketentuan:
- Tepat {obj_cnt} objek dengan id & posisi unik dalam grid {grid}x{grid}.
- Jika "moved", "to" ≠ posisi semula. Hanya JSON.
"""
    data = _llm_json(prompt)
    objs = data.get("objects") or []
    if len(objs) != obj_cnt: raise RuntimeError("LLM scene: jumlah objek salah")
    ids = [o.get("id") for o in objs]
    if len(set(ids)) != obj_cnt: raise RuntimeError("LLM scene: id duplikat")
    change = data.get("change") or {}
    ctype = change.get("type")
    target = change.get("targetId")
    if ctype not in ("removed","moved") or target not in ids:
        raise RuntimeError("LLM scene: change invalid")

    if ctype == "removed":
        solution = target
        options = ids
    else:
        to = change.get("to")
        if not (isinstance(to,list) and len(to)==2): raise RuntimeError("LLM scene: to invalid")
        solution = f"{target}@{to[0]}-{to[1]}"
        options = [f"{o['id']}@{o['pos'][0]}-{o['pos'][1]}" for o in objs] + [solution]
        options = list(dict.fromkeys(options))[:4] if len(options)>=4 else options

    return {
        "itemId": f"mem_sc_{idx}",
        "variant": "scene_recall",
        "prompt": "Satu objek pada scene berubah. Pilih perubahan yang benar.",
        "render": {"kind":"scene","grid": data.get("grid",grid), "objects": objs, "change": change},
        "answerSpec": {"mode":"single_choice","options": options},
        "solution": solution,
        "metadata": {"grid": data.get("grid",grid), "objects": obj_cnt, "change": ctype}
    }

def generate_memory_bundle_llm(rnd: random.Random, difficulty: Optional[str]) -> List[dict]:
    if (difficulty or "").lower() in ("hard","sulit"):
        pairs = [5,5]; seqs = [(9,3),(9,3)]; grid_obj=(5,4)
    elif (difficulty or "").lower() in ("medium","sedang"):
        pairs = [4,4]; seqs = [(7,2),(7,2)]; grid_obj=(4,3)
    else:
        pairs = [3,3]; seqs = [(6,2),(6,1)]; grid_obj=(4,3)
    return [
        _mem_llm_lexicon_item(rnd, 1, pairs[0]),
        _mem_llm_lexicon_item(rnd, 2, pairs[1]),
        _mem_llm_sequence_item(rnd, 3, *seqs[0]),
        _mem_llm_sequence_item(rnd, 4, *seqs[1]),
        _mem_llm_scene_item(rnd, 5, grid_obj[0], grid_obj[1]),
    ]

# ========= SPATIAL via LLM =========
# butuh renderer & rotator. Jika belum ada (dari fallback), definisikan cepat.
if '_render_map_svg' not in globals():
    def _render_map_svg(grid, roads, river, landmarks, north="up", marker=None, axis=None):
        # minimal stub agar tidak error (sebaiknya pakai versi lengkap di fallback)
        return "<svg/>"

if '_apply_rotate_to_map' not in globals():
    def _apply_rotate_to_map(base:dict, deg:int, n:int) -> dict:
        times = (deg//90) % 4
        def rot(p):
            r,c = p
            for _ in range(times):
                r,c = (c, n-1-r)
            return [r,c]
        return {
            "roads": [ [ rot(tuple(a)), rot(tuple(b)) ] for (a,b) in base.get("roads",[]) ],
            "river": [ rot(tuple(p)) for p in base.get("river",[]) ],
            "landmarks": [{"name":lm["name"],"pos":rot(tuple(lm["pos"])),"icon":lm.get("icon","square")} for lm in base.get("landmarks",[])],
            "north": base.get("north","up")
        }

def _sp_llm_rotate_item(rnd: random.Random, idx:int, grid:int=4, deg:int=90) -> dict:
    prompt = f"""
Buat skenario peta grid untuk rotasi.
Output JSON:
{{
  "variant":"map_rotate",
  "grid": {grid},
  "base": {{
    "roads": [ [[r1,c1],[r2,c2]], ... ],
    "river": [ [r,c], [r,c] ],
    "landmarks": [{{"name":"Sekolah|Pasar|Rumah","pos":[r,c],"icon":"square|circle|triangle"}}],
    "north": "up"
  }},
  "action": {{"type":"rotate","deg": {deg} }}
}}
Ketentuan: koordinat 0..{grid-1}, landmark 2-3 buah unik. JSON only.
"""
    data = _llm_json(prompt)
    base = data.get("base") or {}
    if not base.get("landmarks"): raise RuntimeError("LLM rot: landmarks kosong")

    letters = ["A","B","C","D"]
    correct = rnd.choice(letters)
    options = []
    for L in letters:
        d = deg if L == correct else rnd.choice([90,180,270])
        rotated = _apply_rotate_to_map(base, d, grid)
        svg = _render_map_svg(grid, rotated.get("roads",[]), rotated.get("river",[]), rotated.get("landmarks",[]), rotated.get("north","up"))
        options.append({"optionId": L, "render": {"kind":"svg","svg": svg}})

    return {
        "itemId": f"sp_rot_{idx}",
        "variant": "map_rotate",
        "prompt": f"Setelah peta diputar {deg}° searah jarum jam, pilih peta yang benar.",
        "render": {"kind":"map-svg","grid": grid, "base": base, "action":{"type":"rotate","deg":deg}},
        "options": options,
        "answerSpec": {"mode":"single_choice","options": letters},
        "solution": correct,
        "metadata": {"theme":"rotate","grid":grid,"deg":deg}
    }

def _sp_llm_route_item(rnd: random.Random, idx:int, grid:int=5, step_len:int=4) -> dict:
    prompt = f"""
Buat peta untuk navigasi rute.
Output JSON:
{{
  "variant":"route_nav",
  "grid": {grid},
  "base": {{
    "roads": [ [[r1,c1],[r2,c2]], ... ],
    "river": [ [r,c], [r,c] ],
    "landmarks": [{{"name":"Sekolah|Pasar|Rumah","pos":[r,c],"icon":"square|circle|triangle"}}],
    "north": "up"
  }},
  "action": {{"type":"path","from":"<nama_landmark>","steps":[["N|S|E|W",1], ...]}}
}}
Ketentuan: steps {step_len}, tidak keluar grid {grid}x{grid}. JSON only.
"""
    data = _llm_json(prompt)
    base = data.get("base") or {}
    action = data.get("action") or {}
    start_name = action.get("from")
    lms = {lm["name"]: lm["pos"] for lm in base.get("landmarks",[]) if "name" in lm and "pos" in lm}
    if start_name not in lms: raise RuntimeError("LLM route: start tidak valid")
    start = lms[start_name]

    dirs = {"N":(-1,0),"S":(1,0),"E":(0,1),"W":(0,-1)}
    r,c = start
    for d, n in action.get("steps", []):
        dr,dc = dirs[str(d)]
        for _ in range(int(n)):
            r = max(0, min(grid-1, r+dr))
            c = max(0, min(grid-1, c+dc))
    final = [r,c]

    letters = ["A","B","C","D"]
    candidates = [final]
    while len(candidates)<4:
        rr = max(0, min(grid-1, final[0] + rnd.choice([-1,0,1])))
        cc = max(0, min(grid-1, final[1] + rnd.choice([-1,0,1])))
        if [rr,cc] not in candidates:
            candidates.append([rr,cc])

    rnd.shuffle(letters); rnd.shuffle(candidates)
    sol_letter = None; options = []
    for i,L in enumerate(letters):
        pos = candidates[i]
        svg = _render_map_svg(grid, base.get("roads",[]), base.get("river",[]), base.get("landmarks",[]), base.get("north","up"), marker=pos)
        options.append({"optionId": L, "render": {"kind":"svg","svg": svg}})
        if pos == final: sol_letter = L

    return {
        "itemId": f"sp_nav_{idx}",
        "variant": "route_nav",
        "prompt": f"Dari {start_name}, ikuti langkah di peta. Dimana posisi akhir?",
        "render": {"kind":"map-svg","grid":grid,"base":base,"action":action},
        "options": options,
        "answerSpec": {"mode":"single_choice","options":["A","B","C","D"]},
        "solution": sol_letter,
        "metadata": {"theme":"path","grid":grid,"steps": action.get("steps",[])}
    }

def _sp_llm_reflect_item(rnd: random.Random, idx:int, grid:int=5) -> dict:
    prompt = f"""
Buat peta untuk refleksi terhadap sumbu.
Output JSON:
{{
  "variant":"mirror_reflect",
  "grid": {grid},
  "base": {{
    "roads": [],
    "river": [],
    "landmarks": [{{"name":"Pasar","pos":[r,c],"icon":"circle"}}],
    "north": "up"
  }},
  "action": {{"type":"reflect","target":"Pasar","axis":{{"type":"vertical","x":2}}}}
}}
Ketentuan: axis vertical x atau horizontal y dalam 0..{grid-1}. JSON only.
"""
    data = _llm_json(prompt)
    base = data.get("base") or {}
    axis = data.get("action",{}).get("axis")

    # hitung refleksi
    def _ref(pos, axis):
        r,c = pos
        if axis.get("type")=="vertical":
            x = int(axis["x"]); dc = c - x; return [r, x - dc]
        y = int(axis["y"]); dr = r - y; return [y - dr, c]

    target = [lm for lm in base.get("landmarks",[]) if lm.get("name")=="Pasar"][0]
    reflected = _ref(target["pos"], axis)

    letters = ["A","B","C","D"]
    coords = [reflected]
    while len(coords)<4:
        rr = rnd.randrange(0,grid); cc = rnd.randrange(0,grid)
        if [rr,cc] not in coords: coords.append([rr,cc])

    rnd.shuffle(coords)
    options = []; sol_letter = None
    for i,L in enumerate(letters):
        svg = _render_map_svg(grid, base.get("roads",[]), base.get("river",[]), base.get("landmarks",[]), base.get("north","up"), marker=coords[i], axis=axis)
        options.append({"optionId": L, "render": {"kind":"svg","svg": svg}})
        if coords[i]==reflected: sol_letter = L

    return {
        "itemId": f"sp_ref_{idx}",
        "variant": "mirror_reflect",
        "prompt": f"Tentukan posisi cermin 'Pasar' terhadap " + ("x="+str(axis.get("x")) if axis.get("type")=="vertical" else "y="+str(axis.get("y"))),
        "render": {"kind":"map-svg","grid":grid,"base":base,"action":{"type":"reflect","target":"Pasar","axis":axis}},
        "options": options,
        "answerSpec": {"mode":"single_choice","options":["A","B","C","D"]},
        "solution": sol_letter,
        "metadata": {"theme":"reflect","grid":grid,"axis":axis}
    }

def generate_spatial_bundle_llm(rnd: random.Random, difficulty: Optional[str]) -> List[dict]:
    if (difficulty or "").lower() in ("hard","sulit"):
        grids = [5,5,5,5,5]; steps = [5,6]
    elif (difficulty or "").lower() in ("medium","sedang"):
        grids = [4,4,4,4,5]; steps = [4,5]
    else:
        grids = [3,3,4,4,4]; steps = [3,4]
    return [
        _sp_llm_rotate_item(rnd, 1, grid=grids[0], deg=random.choice([90,180,270])),
        _sp_llm_route_item(rnd, 2, grid=grids[1], step_len=random.choice(steps)),
        _sp_llm_rotate_item(rnd, 3, grid=grids[2], deg=random.choice([90,180,270])),
        _sp_llm_route_item(rnd, 4, grid=grids[3], step_len=random.choice(steps)),
        _sp_llm_reflect_item(rnd, 5, grid=grids[4]),
    ]

# ========= NUMERICAL via LLM =========
# safe eval untuk validasi hasil LLM
if '_safe_eval_expr' not in globals():
    _ALLOWED_NODES = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub, ast.UAdd, ast.Pow, ast.Load)
    def _safe_eval_expr(expr: str) -> float:
        expr = expr.replace("×","*").replace("÷","/").replace("^","**")
        if not re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s]*", expr):
            raise ValueError("invalid characters")
        tree = ast.parse(expr, mode="eval")
        for node in ast.walk(tree):
            if not isinstance(node, _ALLOWED_NODES):
                raise ValueError("node not allowed")
        return eval(compile(tree, "<expr>", "eval"), {"__builtins__":{}})

def _verify_24(expr: str, nums: list, target: int = 24) -> bool:
    try:
        val = _safe_eval_expr(expr)
        if abs(val - target) > 1e-6: return False
        lits = [int(x) for x in re.findall(r"\d+", expr)]
        need = {}; got = {}
        for v in nums: need[v] = need.get(v,0)+1
        for v in lits: got[v] = got.get(v,0)+1
        return need == got
    except Exception:
        return False

def _num_llm_24_item(rnd: random.Random, idx:int) -> dict:
    prompt = """
Buat puzzle 24 yang solvable.
Output JSON:
{
  "variant":"target_24",
  "numbers":[n1,n2,n3,n4],
  "target":24,
  "oneSolution":"ekspresi menggunakan keempat angka"
}
Syarat: numbers 1..13 (boleh berulang), oneSolution valid mencapai 24. JSON only.
"""
    data = _llm_json(prompt)
    nums = list(data.get("numbers") or [])
    if len(nums) != 4: raise RuntimeError("LLM 24: angka != 4")
    sol = str(data.get("oneSolution","")).strip()
    if not _verify_24(sol, nums, 24):
        raise RuntimeError("LLM 24: solusi tidak valid")
    return {
        "itemId": f"num_24_{idx}",
        "variant": "target_24",
        "prompt": "Susun ekspresi dari keempat angka agar bernilai 24.",
        "render": {"kind":"build-expression","numbers": nums, "operators": ["+","-","×","÷"], "target": 24, "slots": 7},
        "answerSpec": {"mode":"expression","alphabet": ["0-9","+","-","×","÷","(",")"]},
        "solution": {"numbers": nums, "target": 24, "oneSolution": sol},
        "metadata": {"mustUseAllNumbers": True, "allowParentheses": True, "difficulty": "easy"}
    }

def _num_llm_equation_fill_item(rnd: random.Random, idx:int, level:str="medium") -> dict:
    prompt = f"""
Buat persamaan dengan kotak kosong ('□') yang harus diisi digit agar benar.
Output JSON:
{{
  "variant":"equation_fill",
  "left":"<ekspresi kiri>",
  "right":"<ekspresi kanan>",
  "solutions": [digit,...]
}}
Ketentuan: {1 if level=='easy' else 2}–3 kotak, + - × ÷ boleh, tanpa leading zero ilegal. JSON only.
"""
    data = _llm_json(prompt)
    left = str(data.get("left","")).strip()
    right = str(data.get("right","")).strip()
    sols = [str(x) for x in (data.get("solutions") or [])]

    def _apply(boxed: str, digits: list) -> str:
        out = []; it = iter(digits)
        for ch in boxed:
            out.append(next(it) if ch=="□" else ch)
        return "".join(out)

    le = _apply(left, sols).replace("×","*").replace("÷","/")
    ri = _apply(right, sols).replace("×","*").replace("÷","/")
    try:
        ok = abs(eval(le) - eval(ri)) < 1e-9
    except Exception:
        ok = False
    if not ok: raise RuntimeError("LLM eq: tidak seimbang")

    return {
        "itemId": f"num_eq_{idx}",
        "variant": "equation_fill",
        "prompt": "Isi kotak agar persamaan benar.",
        "render": {"kind":"fill-blanks","expressionLeft": left, "expressionRight": right, "blanks": len(sols), "constraints":{"distinct": False}},
        "answerSpec": {"mode":"digits","count": len(sols)},
        "solution": sols,
        "metadata": {"difficulty": level, "original": {"left": le, "right": ri}}
    }

def _num_llm_function_machine_item(rnd: random.Random, idx:int) -> dict:
    prompt = """
Buat soal komposisi fungsi sederhana.
Output JSON:
{
  "variant":"function_machine",
  "functions": {"f":"2x+3","g":"x/2"},
  "query":"f(g(14))",
  "steps": ["g(14)=7","f(7)=17"],
  "answer": 17
}
Ketentuan: f,g linear/sederhana; steps konsisten dengan answer. JSON only.
"""
    data = _llm_json(prompt)
    fdef = data.get("functions",{}).get("f","")
    gdef = data.get("functions",{}).get("g","")
    query = data.get("query","")
    ans = data.get("answer", None)
    if ans is None: raise RuntimeError("LLM fn: answer kosong")

    import re as _re
    nums = _re.findall(r"\d+", query)
    x_in = int(nums[0]) if nums else 0

    def _eval_str(defn: str, x):
        s = defn.replace("x", f"({x})").replace("×","*").replace("÷","/").replace("^","**")
        return eval(s)

    gx = _eval_str(gdef, x_in)
    val = _eval_str(fdef, gx)
    if abs(float(val) - float(ans)) > 1e-6:
        raise RuntimeError("LLM fn: mismatch evaluasi")

    return {
        "itemId": f"num_fn_{idx}",
        "variant": "function_machine",
        "prompt": f"Diberikan f(x)={fdef} dan g(x)={gdef}. Hitung {query}.",
        "render": {"kind":"text","functions":{"f":fdef,"g":gdef},"query": query},
        "answerSpec": {"mode":"free","dataType":"number"},
        "solution": ans,
        "metadata": {"steps": data.get("steps",[]), "difficulty":"medium"}
    }

def generate_numerical_bundle_llm(rnd: random.Random, difficulty_hint: Optional[str]) -> List[dict]:
    return [
        _num_llm_24_item(rnd, 1),                              # Easy (LLM)
        _gen_num_maze(rnd, 2, grid=3, max_steps=4),            # Easy (lokal stabil)
        _num_llm_equation_fill_item(rnd, 3, level="medium"),   # Medium (LLM)
        _num_llm_function_machine_item(rnd, 4),                # Medium (LLM)
        random.choice([_gen_num_modular, _gen_num_base_convert, _gen_num_prob_ratio])(rnd, 5)  # Hard (lokal)
    ]

# ========= Endpoint baru yang memanggil LLM / fallback =========
class ChallengeCreateInLLM(BaseModel):
    type: str                         # "memory" | "spatial" | "numerical"
    difficulty: Optional[str] = None
    count: int = 5
    adaptive: bool = True
    seed: Optional[int] = None
    locale: str = "id-ID"
    timeBudgetSec: Optional[int] = 600
    use_llm: bool = True
    variantMix: Optional[List[str]] = None
    numerical_mix: Optional[List[str]] = None

@app.post("/v1/challenges/new")
def create_challenge_upgraded(payload: ChallengeCreateInLLM):
    seed = payload.seed if payload.seed is not None else int(time.time()*1000) % (2**31-1)
    rnd = random.Random(seed)
    t = (payload.type or "").lower()
    if t not in ("memory","spatial","numerical"):
        return JSONResponse({"error":"type harus 'memory'|'spatial'|'numerical'"}, status_code=400)

    use_llm = bool(payload.use_llm)

    try:
        if t == "memory":
            items = generate_memory_bundle_llm(rnd, payload.difficulty) if use_llm else generate_memory_bundle(rnd, payload.difficulty)
        elif t == "spatial":
            items = generate_spatial_bundle_llm(rnd, payload.difficulty) if use_llm else generate_spatial_bundle(rnd, payload.difficulty)
        else:
            items = generate_numerical_bundle_llm(rnd, payload.difficulty) if use_llm else generate_numerical_bundle(rnd, payload.difficulty)
    except Exception as e:
        if t == "memory":
            items = generate_memory_bundle(rnd, payload.difficulty)
        elif t == "spatial":
            items = generate_spatial_bundle(rnd, payload.difficulty)
        else:
            items = generate_numerical_bundle(rnd, payload.difficulty)

    # paksa 5 item
    if len(items) != 5:
        items = (items + items[:5])[:5]

    doc = {
        "type": t, "difficulty": payload.difficulty, "count": 5,
        "adaptive": payload.adaptive, "seed": seed, "locale": payload.locale,
        "timeBudgetSec": payload.timeBudgetSec, "items": items,
        "model": MODEL_NAME if use_llm else "local-procedural", "llm_used": use_llm
    }
    if 'save_challenge_local' in globals():
        cid = save_challenge_local(doc)
    else:
        cid = save_quiz_local(items, {"source":"challenge","type":t,"difficulty":payload.difficulty})

    return {
        "challengeId": cid,
        "type": t,
        "difficulty": payload.difficulty,
        "generatedAt": _now_iso(),
        "items": _sanitize_items_llm(items),
        "scoring": {"perCorrect": 10, "perWrong": 0, "timeBonus": {"enabled": True}}
    }

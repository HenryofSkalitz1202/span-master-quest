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
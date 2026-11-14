"""Daily Georgian TikTok video generator (free stack).

Script (from scripts/bank.json, or Claude API if ANTHROPIC_API_KEY is set)
 -> Azure Georgian voice per scene
 -> free stock footage (Pixabay or Pexels): 2-3 fast cuts per scene, different angles
 -> word-by-word pop-up captions, hook title, zoom punches, whoosh sounds
 -> 1080x1920 MP4 -> Telegram

Every service is optional so the run never fully fails:
  no PIXABAY_API_KEY / PEXELS_API_KEY -> animated gradient backgrounds
  no AZURE_SPEECH_KEY  -> silent video, captions timed to reading speed
  no TELEGRAM_*        -> video only saved to output/ (and the GitHub run)

Usage: python generate.py [--script S005] [--niche facts] [--no-send]
"""

import argparse
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path

import requests
from PIL import Image, ImageFilter

ROOT = Path(__file__).parent
FONTS = ROOT / "assets/fonts"
FONT_NAME = "TikTokGeo"
BANK = ROOT / "scripts/bank.json"
HISTORY = ROOT / "data/history.json"
OUT = ROOT / "output"
CACHE = OUT / "cache"
W, H, FPS = 1080, 1920, 30
TBILISI = dt.timezone(dt.timedelta(hours=4))
VOICES = ["ka-GE-EkaNeural", "ka-GE-GiorgiNeural"]


def log(msg):
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def run(cmd, cwd=None):
    subprocess.run([str(c) for c in cmd], check=True, cwd=cwd)


# -------------------------------------------------------------------- script

def pick_script(history, script_id=None, niche=None):
    """Next unused script; the niche with the fewest videos so far goes first."""
    bank = json.loads(BANK.read_text())
    if script_id:
        return next(s for s in bank if s["id"] == script_id), bank
    used = {h.get("script_id") for h in history}
    niche = niche or os.getenv("LOCK_NICHE") or None
    fresh = [s for s in bank if s["id"] not in used and (not niche or s["niche"] == niche)]
    if not fresh:
        return None, bank
    count = {}
    for h in history:
        count[h["niche"]] = count.get(h["niche"], 0) + 1
    low = min(count.get(s["niche"], 0) for s in fresh)
    return random.choice([s for s in fresh if count.get(s["niche"], 0) == low]), bank


def claude_script(niche, history):
    """Optional: only used when ANTHROPIC_API_KEY is set and the bank is empty."""
    import anthropic
    example = json.loads(BANK.read_text())[0]
    recent = [h["title"] for h in history[-60:]]
    prompt = (
        "Write one new Georgian TikTok script as JSON in exactly the same format as this example:\n"
        f"{json.dumps(example, ensure_ascii=False)}\n\n"
        f"niche: {niche}. Rules: natural spoken Georgian, 45-65 words total, 5 scenes, scene 1 is a scroll-stopping hook, "
        "mark 1-2 key words per scene with *asterisks*, 'shots' are 2 short English Pexels stock-video search queries "
        "for generic filmable things, true facts only, end with a question or call to action. Output only the JSON.\n"
        f"Do not repeat: {json.dumps(recent, ensure_ascii=False)}"
    )
    client = anthropic.Anthropic()
    resp = client.beta.messages.create(
        model="claude-opus-5-5", max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        output_config={"effort": "high"},
        messages=[{"role": "user", "content": prompt}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("Claude declined the request")
    text = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(text[text.find("{"): text.rfind("}") + 1])
    data["id"] = f"C{len(history) + 1:03d}"
    data["niche"] = niche
    return data


# --------------------------------------------------------------------- voice

def clean(text):
    return text.replace("*", "")


def tts(text, voice, path):
    key = os.getenv("AZURE_SPEECH_KEY")
    if not key:
        return False
    region = os.getenv("AZURE_SPEECH_REGION") or "westeurope"
    safe = clean(text).replace("&", "და").replace("<", "").replace(">", "")
    ssml = (f"<speak version='1.0' xml:lang='ka-GE'><voice name='{voice}'>"
            f"<prosody rate='+12%'>{safe}</prosody></voice></speak>")
    r = requests.post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
                 "User-Agent": "tiktok-generator"},
        data=ssml.encode("utf-8"), timeout=60)
    r.raise_for_status()
    path.write_bytes(r.content)
    return True


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


# ------------------------------------------------------------------- footage

def download(url, path):
    if not path.exists():
        with requests.get(url, stream=True, timeout=180) as d:
            d.raise_for_status()
            with open(path, "wb") as f:
                for chunk in d.iter_content(1 << 20):
                    f.write(chunk)
    return path


def pixabay_video(query, used, min_len):
    key = os.getenv("PIXABAY_API_KEY")
    if not key:
        return None
    r = requests.get("https://pixabay.com/api/videos/", timeout=30, params={
        "key": key, "q": query[:100], "per_page": 30, "safesearch": "true", "order": "popular"})
    r.raise_for_status()
    hits = [h for h in r.json().get("hits", []) if h["id"] not in used and h.get("duration", 0) >= min_len]
    top = hits[:8]
    random.shuffle(top)
    for h in top:
        sizes = h.get("videos", {})
        # Cropping a horizontal clip to 9:16 keeps only a narrow strip, so it must be ~4K to stay sharp.
        # Pick the smallest version that is sharp after the crop, else the biggest one available.
        options = [sizes[k] for k in ("medium", "large", "small") if sizes.get(k, {}).get("url")]

        def sharp(v):
            return v["width"] >= 1080 if v["height"] > v["width"] else v["height"] >= 1900
        options.sort(key=lambda v: (not sharp(v), v["width"] * v["height"] * (1 if sharp(v) else -1)))
        if not options:
            continue
        used.add(h["id"])
        path = download(options[0]["url"], CACHE / f"pixabay_{h['id']}_{options[0]['height']}.mp4")
        return path, float(h["duration"]), h.get("user", "")
    return None


def stock_video(query, used, min_len):
    """Try every configured free footage source, simplest query last."""
    for q in dict.fromkeys([query, " ".join(query.split()[-2:]), query.split()[-1]]):
        for source in (pexels_video, pixabay_video):
            try:
                got = source(q, used, min_len)
            except requests.RequestException as e:
                log(f"{source.__name__} failed for '{q}': {e}")
                got = None
            if got:
                return got
    return None


def pexels_video(query, used, min_len):
    key = os.getenv("PEXELS_API_KEY")
    if not key:
        return None
    for orientation in ("portrait", None):
        params = {"query": query, "per_page": 15, "size": "medium"}
        if orientation:
            params["orientation"] = orientation
        r = requests.get("https://api.pexels.com/videos/search", params=params,
                         headers={"Authorization": key}, timeout=30)
        r.raise_for_status()
        vids = [v for v in r.json().get("videos", []) if v["id"] not in used and v["duration"] >= min_len]
        if not vids:
            continue
        v = random.choice(vids[:6])
        files = [f for f in v["video_files"]
                 if f.get("height") and f.get("width") and f.get("file_type") == "video/mp4"]
        # prefer portrait, then the size closest to 1920 px
        files.sort(key=lambda f: (f["height"] < f["width"], abs(max(f["height"], f["width"]) - 1920)))
        if not files:
            continue
        used.add(v["id"])
        path = download(files[0]["link"], CACHE / f"pexels_{v['id']}_{files[0]['height']}.mp4")
        return path, v["duration"], v.get("user", {}).get("name", "")
    return None


PALETTES = [((255, 61, 104), (255, 179, 71)), ((58, 123, 213), (0, 210, 255)),
            ((131, 58, 180), (253, 29, 29)), ((17, 153, 142), (56, 239, 125)),
            ((252, 70, 107), (63, 94, 251)), ((15, 32, 39), (44, 83, 100))]


def gradient(path, seed):
    a, b = PALETTES[seed % len(PALETTES)]
    small = Image.new("RGB", (8, 64))
    small.putdata([tuple(int(a[i] + (b[i] - a[i]) * (y / 63 * 0.75 + x / 7 * 0.25)) for i in range(3))
                   for y in range(64) for x in range(8)])
    small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30)).save(path)


def motion(kind, frames):
    """Camera-move presets so consecutive shots never feel the same."""
    center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    zp = f":d=1:s={W}x{H}:fps={FPS}"
    if kind == "punch":   # fast zoom-out hit on every scene start
        return f"zoompan=z='if(lt(on,9),1.28-0.031*on,1)':{center}{zp}"
    if kind == "push":    # slow push-in
        return f"zoompan=z='1+{0.12 / frames:.5f}*on':{center}{zp}"
    if kind == "pull":    # slow pull-out
        return f"zoompan=z='1.12-{0.12 / frames:.5f}*on':{center}{zp}"
    if kind == "drift":   # sideways pan
        return f"zoompan=z=1.12:x='(iw-iw/zoom)*on/{frames}':y='ih/2-(ih/zoom/2)'{zp}"
    return "null"


def make_shot(src, length, kind, out, is_image=False, src_len=0.0):
    frames = max(1, int(round(length * FPS)))
    cover = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
    if is_image:
        inp = ["-loop", "1", "-framerate", FPS, "-t", f"{length + 0.2:.3f}", "-i", src]
        vf = f"{cover},{motion('push' if kind == 'static' else kind, frames)}"
    else:  # random section of the stock clip, so reused clips look different
        start = random.uniform(0.3, src_len - length - 0.3) if src_len > length + 0.6 else 0
        inp = ["-ss", f"{start:.2f}", "-t", f"{length + 0.3:.3f}", "-i", src]
        vf = f"fps={FPS},{cover},{motion(kind, frames)}"
    run(["ffmpeg", "-y", "-loglevel", "error", *inp, "-vf", f"{vf},setsar=1,format=yuv420p",
         "-frames:v", frames, "-r", FPS, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out])


# ------------------------------------------------------------------ captions

def ass_time(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def caption_groups(narration, start, length):
    """Split narration into 1-3 word chunks timed proportionally to word length."""
    tokens = []
    for i, part in enumerate(narration.split("*")):
        for w in part.split():
            tokens.append((w, i % 2 == 1))
    groups, cur = [], []
    for w, emph in tokens:
        cur.append((w, emph))
        chars = sum(len(x[0]) for x in cur)
        if len(cur) == 3 or chars > 14 or w[-1] in ".,!?:":
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    weights = [sum(len(w) + 2 for w, _ in g) for g in groups]
    total, t, out = sum(weights), start, []
    for g, wgt in zip(groups, weights):
        d = length * wgt / total
        out.append((t, t + d, g))
        t += d
    return out


def build_ass(script, timings, path):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{FONT_NAME},112,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,7,4,5,70,70,0,1
Style: Hook,{FONT_NAME},88,&H00000000,&H00000000,&H0000E6FF,&H00000000,0,0,0,0,100,100,0,0,3,22,0,8,90,90,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    # Hook title on a yellow box at the top for the whole first scene
    lines.append(f"Dialogue: 1,{ass_time(0)},{ass_time(timings[0][1])},Hook,,0,0,0,,"
                 r"{\fscx60\fscy60\t(0,180,\fscx106\fscy106)\t(180,260,\fscx100\fscy100)}"
                 + script["hook_text"])
    pop = r"{\pos(540,1180)\fscx70\fscy70\t(0,90,\fscx108\fscy108)\t(90,150,\fscx100\fscy100)}"
    for (st, en), sc in zip(timings, script["scenes"]):
        for a, b, group in caption_groups(sc["narration"], st, en - st):
            text = " ".join(r"{\c&H00E6FF&}" + w + r"{\c&HFFFFFF&}" if e else w for w, e in group)
            lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{pop}{text}")
    path.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


# --------------------------------------------------------------------- sound

def sfx(work):
    whoosh, hit = work / "whoosh.wav", work / "hit.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
         "anoisesrc=d=0.45:c=pink:a=0.6,highpass=f=500,lowpass=f=5000,"
         "afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.25,volume=0.45", "-ar", "44100", whoosh])
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
         "sine=f=55:d=0.6,afade=t=out:st=0.03:d=0.55,volume=3", "-ar", "44100", hit])
    return whoosh, hit


def mix_audio(voice_parts, timings, total, work):
    whoosh, hit = sfx(work)
    args, filters, labels = [], [], []

    def add(path, delay, label, extra=(), vol=None):
        idx = len(labels)
        args.extend([*extra, "-i", path])
        f = f"[{idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={int(delay * 1000)}:all=1"
        filters.append(f + (f",volume={vol}" if vol else "") + f"[{label}]")
        labels.append(f"[{label}]")

    for i, (p, (st, _)) in enumerate(zip(voice_parts, timings)):
        if p:
            add(p, st, f"v{i}")
    add(hit, 0, "hit")
    for j, (st, _) in enumerate(timings[1:]):
        add(whoosh, max(0.0, st - 0.2), f"w{j}")
    music = sorted((ROOT / "assets/music").glob("*.mp3"))
    if music:
        add(random.choice(music), 0, "m", extra=("-stream_loop", "-1"), vol=0.10)
    filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,"
                   f"apad,atrim=0:{total:.3f},alimiter=limit=0.95[out]")
    out = work / "audio.m4a"
    run(["ffmpeg", "-y", "-loglevel", "error", *args, "-filter_complex", ";".join(filters),
         "-map", "[out]", "-c:a", "aac", "-b:a", "160k", out])
    return out


# ------------------------------------------------------------------ telegram

def telegram(method, data, files=None):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return False
    r = requests.post(f"https://api.telegram.org/bot{token}/{method}",
                      data={"chat_id": chat, **data}, files=files, timeout=300)
    r.raise_for_status()
    return True


def send_telegram(video, info_text, caption):
    if not telegram("sendMessage", {"text": info_text}):
        log("No Telegram credentials - skipping delivery")
        return False
    with open(video, "rb") as f:
        telegram("sendVideo", {"supports_streaming": "true", "width": W, "height": H}, files={"video": f})
    telegram("sendMessage", {"text": caption})  # separate message = one tap to copy
    return True


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script")
    ap.add_argument("--niche")
    ap.add_argument("--no-send", action="store_true")
    args = ap.parse_args()

    history = json.loads(HISTORY.read_text())
    script, bank = pick_script(history, args.script, args.niche)
    if script is None:
        if os.getenv("ANTHROPIC_API_KEY"):
            script = claude_script(args.niche or random.choice(sorted({s["niche"] for s in bank})), history)
        else:
            telegram("sendMessage", {"text": "⚠️ სცენარები დამთავრდა - დაამატე ახალი scripts/bank.json-ში"})
            sys.exit("Script bank is empty - add new scripts to scripts/bank.json")
    used_ids = {h.get("script_id") for h in history} | {script["id"]}
    left = len([s for s in bank if s["id"] not in used_ids])

    vcount = {v: sum(1 for h in history if h.get("voice") == v) for v in VOICES}
    voice = min(VOICES, key=lambda v: (vcount[v], random.random()))
    vid = f"V{len(history) + 1:03d}"
    today = dt.datetime.now(TBILISI).date().isoformat()
    log(f"{vid}: {script['id']} '{script['title']}' niche={script['niche']} "
        f"hook={script['hook_type']} voice={voice}")

    work = OUT / f"{today}_{vid}"
    work.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)

    # 1. voice per scene -> scene timings
    voice_parts, timings, t, has_voice = [], [], 0.0, False
    for i, sc in enumerate(script["scenes"]):
        a = work / f"voice{i}.mp3"
        try:
            ok = tts(sc["narration"], voice, a)
        except requests.RequestException as e:
            log(f"TTS failed: {e}")
            ok = False
        if ok:
            has_voice = True
            d = duration(a) + 0.12
        else:
            a = None
            d = max(2.0, len(clean(sc["narration"]).split()) * 0.42 + 0.4)
        voice_parts.append(a)
        timings.append((t, t + d))
        t += d
    total = t + 0.4

    # 2. footage: each scene is cut into up to 3 shots with different camera moves
    used, clips, credits, real = set(), [], set(), 0
    moves, k = ["push", "drift", "pull", "static"], 0
    for i, ((st, en), sc) in enumerate(zip(timings, script["scenes"])):
        end = total if i == len(timings) - 1 else en
        queries = sc["shots"]
        n = max(1, min(3, int((end - st) // 1.2)))
        length = (end - st) / n
        for j in range(n):
            out = work / f"shot{i}_{j}.mp4"
            kind = "punch" if j == 0 else moves[k % len(moves)]
            k += 1
            got = None
            try:
                got = stock_video(queries[j % len(queries)], used, length + 0.6)
            except requests.RequestException as e:
                log(f"Footage search failed for '{queries[j % len(queries)]}': {e}")
            if got:
                path, src_len, author = got
                make_shot(path, length, kind, out, src_len=src_len)
                credits.add(author)
                real += 1
            else:
                bg = work / f"bg{i}_{j}.png"
                gradient(bg, i * 3 + j + len(history))
                make_shot(bg, length, kind, out, is_image=True)
            clips.append(out)
        log(f"  scene {i + 1}: {end - st:.1f}s, {n} shots")

    # 3. join shots, burn captions, add voice + sound effects
    (work / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt",
         "-c", "copy", "joined.mp4"], cwd=work)
    build_ass(script, timings, work / "captions.ass")
    mix_audio(voice_parts, timings, total, work)
    final = (OUT / f"{today}_{vid}.mp4").resolve()
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", "joined.mp4", "-i", "audio.m4a",
         "-vf", f"subtitles=captions.ass:fontsdir={FONTS.resolve()}",
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
         "-pix_fmt", "yuv420p", "-c:a", "copy", "-t", f"{total:.3f}", "-movflags", "+faststart",
         final], cwd=work)
    log(f"Video ready: {final} ({total:.1f}s, {len(clips)} shots, {real} with real footage)")

    # 4. deliver
    caption = f"{script['caption']}\n\n{' '.join(script['hashtags'])}"
    info = (f"🎬 {vid} | {today}\n"
            f"თემა: {script['niche']} | ჰუკი: {script['hook_type']} | "
            f"ხმა: {voice.split('-')[2].replace('Neural', '')}\n"
            f"„{script['title']}“ · {total:.0f} წმ · {len(clips)} კადრი\n"
            + ("" if has_voice else "🔇 ხმის გარეშე (Azure გასაღები არ არის)\n")
            + ("" if real else "🎨 ვიდეო-კადრები ვერ მოიძებნა (Pixabay გასაღები?) - ფონები გრადიენტია\n")
            + f"📚 დარჩენილი სცენარები: {left}\n"
            + f"📊 2 დღეში ჩაწერე ნახვები data/results.csv-ში (ID: {vid})")
    sent = False if args.no_send else send_telegram(final, info, caption)
    if left <= 5:
        telegram("sendMessage", {"text": f"⚠️ მხოლოდ {left} სცენარი დარჩა - სთხოვე Claude-ს ახლების დაწერა"})

    history.append({"id": vid, "date": today, "script_id": script["id"], "niche": script["niche"],
                    "hook_type": script["hook_type"], "voice": voice if has_voice else None,
                    "title": script["title"], "seconds": round(total, 1), "shots": len(clips),
                    "real_footage": real, "credits": sorted(c for c in credits if c), "sent": sent})
    HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
    log("Done")


if __name__ == "__main__":
    main()

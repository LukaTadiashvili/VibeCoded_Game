# Daily Georgian TikTok videos (free)

Every morning around **07:20 Tbilisi time**, GitHub Actions makes one 20-30 second vertical video and sends it to your **Telegram** before 08:00. You post it to TikTok yourself.

**What each video contains**
- **Hook:** a yellow title box at the top plus a zoom hit and bass sound in the first second
- **Real stock footage from Pixabay** (or Pexels): a new shot every 1.5-2 seconds (12-15 shots per video), each with a different camera move (punch-in, push, pull, pan)
- **Georgian voiceover** (Azure, alternating the Eka and Giorgi voices)
- **Word-by-word pop-up captions** with the key words in yellow
- **Whoosh sounds** on scene changes, plus optional music from `assets/music/`

Everything here is free: GitHub Actions, the Pixabay API, the Azure Speech free tier and the Telegram bot.

## Scripts
`scripts/bank.json` holds ready-made Georgian scripts, written by Claude in chat. The job uses one per day and picks the topic with the fewest videos so far. When 5 or fewer are left, the bot warns you in Telegram. Then ask Claude: *"write 30 more scripts for the TikTok bank"*.

Format of one script:
```json
{"id": "S025", "niche": "facts", "hook_type": "shock", "title": "...", "hook_text": "on-screen hook",
 "scenes": [{"narration": "Georgian text, *key words* in asterisks", "shots": ["english stock-video query", "another angle"]}],
 "caption": "...", "hashtags": ["#..."]}
```

## Experiment: find what works
Each video has an ID such as `V007`, shown in the Telegram message. About 48 hours after posting, add a line to `data/results.csv`:
```
V007,2026-11-20,1520,130,12,4,9      (id, date, views, likes, comments, shares, saves)
```
Then run `python analyze.py` to see averages by **topic**, **hook type** (shock, question, mistake, story) and **voice**. When a topic clearly wins, set the repo variable `LOCK_NICHE` (for example `facts`).

## One-time setup (about 15 min)
Go to GitHub repo **Settings, then Secrets and variables, then Actions, then New repository secret**:

| Secret | How to get it (all free) |
|---|---|
| `TELEGRAM_BOT_TOKEN` | In Telegram, message **@BotFather**, send `/newbot`, and copy the token |
| `TELEGRAM_CHAT_ID` | Send "hi" to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the number in `"chat":{"id":...}` |
| `PIXABAY_API_KEY` | Sign up at pixabay.com, then open pixabay.com/api/docs and copy the green key shown under **Parameters** next to `key` |
| `AZURE_SPEECH_KEY` | portal.azure.com, then create a resource, then **Speech**, then pricing tier **Free F0**, then Keys and Endpoint, then Key 1 |

Then add a **Variable** (the Variables tab, next to Secrets): `AZURE_SPEECH_REGION` = the region you picked for the Speech resource, such as `westeurope`.

The workflow file must be on the repo's **default branch** for the daily schedule to run.

**Test:** open the Actions tab, then **Daily TikTok video**, then **Run workflow**. A video arrives in Telegram within about 5-10 minutes.

## Tips when posting
- In TikTok, add a **trending sound** at low volume. This gives a big reach boost.
- Post at the same time every day. In Georgia, 12:00-14:00 or 19:00-22:00 usually work best.
- Copy the caption from the last Telegram message.

## Run locally
```bash
pip install -r requirements.txt     # needs ffmpeg
python generate.py --script S001 --no-send
```

Footage: Pixabay / Pexels (free licenses). Optional `PEXELS_API_KEY` works too if you have one. Font: Noto Sans and Noto Sans Georgian (SIL OFL, `assets/fonts/OFL.txt`).

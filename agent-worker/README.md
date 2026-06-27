# Type 6 LiveKit Turn-Detector Worker

Optional Python worker that adds an audio-native **end-of-turn** signal to the
Type 6 (`natural2`) interview. It runs the LiveKit Turn Detector v1
(`livekit.agents.inference.TurnDetector`), which listens to the interviewee's
audio directly (acoustic + semantic fusion, **no STT/transcript needed**) and
publishes its decision to the browser over the room data channel.

> The older text-based `livekit-plugins-turn-detector` (`MultilingualModel`) is
> deprecated; this worker uses the bundled audio model in `livekit-agents`
> (>= 1.6.1).

## How it fits in

```
browser mic ──publish──▶ LiveKit room ──▶ this worker (TurnDetector)
                                              │
        data(topic="turn") {end_of_turn,ts}  ▼
browser  ◀───────────────────────────────────┘
   └─▶ Human State Engine fuses it with VAD + audio energy
```

- `end_of_turn: 0.0` is published when the interviewee starts speaking.
- `end_of_turn: 1.0` is published when the detector judges the turn complete.

**Graceful degradation:** if this worker is not running, the browser never
receives `turn` messages and the Human State Engine falls back to VAD + audio
energy only. The interview still works; turn-taking is just a little less
precise. Nothing in the web app blocks on this worker.

## Setup

```bash
cd agent-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your LiveKit Cloud credentials
python worker.py download-files   # one-time model download
```

The `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` must match the
values the Next.js app uses for `/api/livekit-token`.

## Run

```bash
python worker.py dev     # local development
# python worker.py start # production
```

With automatic agent dispatch (the default for LiveKit agents), the worker is
dispatched into each new Type 6 room as the browser joins it — no manual room
naming required.

## Notes / caveats

- The v1 detector runs on LiveKit Cloud inference, so Cloud credentials are
  expected (every plan includes a free monthly inference quota).
- This worker is intentionally passive: no LLM and no TTS. Question wording
  comes from GPT-5.5 in the web app and speech from Fish Audio; the worker only
  contributes the turn-detection signal.
- The `user_state_changed` → `end_of_turn` mapping should be validated against a
  live deployment and tuned (e.g. via the detector's threshold) for Japanese
  conversational pacing.

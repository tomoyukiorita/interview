"""Type 6 LiveKit turn-detector worker.

Joins each Type 6 interview room (via automatic agent dispatch), listens to the
interviewee's published mic track, and runs the audio-native LiveKit Turn
Detector v1 (`livekit.agents.inference.TurnDetector`) to decide when the
interviewee has finished a turn. Each decision is pushed back to the browser
over the room data channel on topic ``turn`` as::

    {"end_of_turn": <0.0|1.0>, "ts": <epoch_ms>}

The Next.js client fuses this with its own VAD + audio-energy signals in the
Human State Engine. If this worker is not running (or LiveKit is not
configured), the client simply never receives ``turn`` messages and degrades
gracefully to VAD + audio only — so this worker is an *optional enhancer*, not
a hard dependency.

Why the audio model: the v1 detector fuses acoustic (prosody/timing) and
semantic signals directly from audio, so it needs no transcript/STT. The older
text-based ``livekit-plugins-turn-detector`` (MultilingualModel) is deprecated
in favor of this.

Run:
    python worker.py download-files   # one-time model download
    python worker.py dev              # or `start` in production

Requires LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in the environment
(see .env.example). The v1 detector runs on LiveKit Cloud inference, so Cloud
credentials are expected.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents.inference import TurnDetector
from livekit.plugins import silero

load_dotenv()

logger = logging.getLogger("type6-turn-detector")
logging.basicConfig(level=logging.INFO)

TURN_TOPIC = "turn"
# How often to republish the current end-of-turn value. The client weights the
# LiveKit signal by freshness (stale after ~3s), so transition-only publishing
# made the signal flicker on/off; a steady heartbeat keeps the current state
# continuously fresh and the client's "LiveKit ON" indicator meaningful.
HEARTBEAT_INTERVAL_S = 0.8

# Strong references to background tasks so the event loop does not GC them after
# the entrypoint returns (the job keeps running in the background).
_BG_TASKS: set[asyncio.Task] = set()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    logger.info("connected to room %s", ctx.room.name)

    # Current end-of-turn estimate (0.0 = mid-turn, 1.0 = turn complete). Held in
    # a container so both the event handler and the heartbeat can mutate/read it.
    state = {"eot": 0.0}

    async def publish_eot(value: float) -> None:
        payload = json.dumps(
            {"end_of_turn": value, "ts": int(time.time() * 1000)}
        ).encode("utf-8")
        try:
            await ctx.room.local_participant.publish_data(payload, topic=TURN_TOPIC)
        except Exception:  # noqa: BLE001 - never let publishing crash the loop
            logger.exception("failed to publish turn data")

    # No LLM / TTS: this agent never speaks. The reasoning brain (GPT-5.5) and
    # Fish TTS live in the web app; here we only want the turn-detector signal.
    #
    # Reflective interviewees pause 2-3s mid-thought, and a single answer often
    # arrives as several ASR segments split on those pauses. A short min_delay
    # made the detector commit end-of-turn (EOT=1.0) the instant a sentence
    # finished cleanly, cutting in before the next segment. Raise min_delay so a
    # ~1.5s mid-answer pause keeps the turn "open" (EOT=0.0): this both prevents
    # the cut-in at the source and lets the client's `pausedMidTurn` thinking
    # cue (which needs LiveKit < 0.5) engage. The delay still scales with the
    # detector's confidence between min and max. `turn_detection` lives inside
    # turn_handling here (the top-level `turn_detection=` kwarg is deprecated in
    # livekit-agents 1.6).
    session = AgentSession(
        vad=silero.VAD.load(),
        turn_handling={
            "turn_detection": TurnDetector(),
            "endpointing": {"mode": "dynamic", "min_delay": 1.5, "max_delay": 5.0},
        },
    )

    @session.on("user_state_changed")
    def _on_user_state(ev) -> None:  # noqa: ANN001 - SDK event type
        # new_state transitions are gated by the turn detector:
        #   speaking  -> interviewee is mid-utterance (definitely not done)
        #   listening -> the detector judged the turn complete (end-of-turn)
        new_state = getattr(ev, "new_state", None)
        old_state = getattr(ev, "old_state", None)
        logger.info("user_state_changed: %s -> %s", old_state, new_state)
        if new_state == "speaking":
            state["eot"] = 0.0
            asyncio.create_task(publish_eot(0.0))  # immediate, low-latency
        elif new_state == "listening":
            state["eot"] = 1.0
            asyncio.create_task(publish_eot(1.0))

    async def _heartbeat() -> None:
        # Republish the current state so the client always has a fresh value,
        # even during a long sustained utterance (no transition for seconds).
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)
            await publish_eot(state["eot"])

    await session.start(agent=Agent(instructions=""), room=ctx.room)

    hb = asyncio.create_task(_heartbeat())
    _BG_TASKS.add(hb)
    hb.add_done_callback(_BG_TASKS.discard)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

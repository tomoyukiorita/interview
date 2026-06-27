# Type 6 LiveKit turn-detector worker (Railway / any container host).
#
# The worker connects OUT to LiveKit Cloud and is dispatched into Type 6 rooms
# automatically; it exposes no HTTP port. Set LIVEKIT_URL / LIVEKIT_API_KEY /
# LIVEKIT_API_SECRET in the host's environment (same values as the Next.js app).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# onnxruntime (used by the silero VAD plugin) needs libgomp1 at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY worker.py ./

# Bake model files (silero VAD + turn-detector assets) into the image so the
# first interview does not wait on a cold model download at startup.
RUN python worker.py download-files

# Long-running worker: registers with LiveKit Cloud and stays alive. No port.
CMD ["python", "worker.py", "start"]

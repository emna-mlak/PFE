from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv()

    from plate_ocr_mvp.voice_cloud import CloudVoiceSession, CommandMatcher, OpenAIWhisperCloud

    parser = argparse.ArgumentParser(
        description="Local/Cloud STT + French commands. Set VOICE_STT_PROVIDER=local|openai|gemini.",
    )
    parser.add_argument(
        "--mode",
        choices=("fixed", "vad"),
        default="fixed",
        help="fixed: durée fixe (défaut, plus fiable); vad: arrêt après silence de fin de phrase",
    )
    parser.add_argument(
        "--seconds",
        type=float,
        default=8.0,
        help="Durée d'enregistrement (mode fixed)",
    )
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=20.0,
        help="Durée max d'un énoncé (mode vad)",
    )
    parser.add_argument(
        "--silence-seconds",
        type=float,
        default=1.0,
        help="Silence consécutif pour fin de phrase (mode vad)",
    )
    parser.add_argument(
        "--max-wait",
        type=float,
        default=30.0,
        help="Temps max d'attente avant de parler (mode vad)",
    )
    parser.add_argument(
        "--vad-voice-blocks",
        type=int,
        default=5,
        help="Blocs consécutifs (~50ms chacun) au-dessus du seuil pour démarrer (mode vad)",
    )
    parser.add_argument(
        "--vad-min-speech-blocks",
        type=int,
        default=14,
        help="Durée min d'enregistrement avant d'accepter la fin sur silence (mode vad)",
    )
    parser.add_argument("--fuzzy", type=float, default=0.72, help="Min fuzzy score for a command")
    parser.add_argument(
        "--api-key",
        default=None,
        help="Override OPENAI_API_KEY for this run",
    )
    parser.add_argument("--model", default=None, help="Override VOICE_OPENAI_MODEL / whisper-1")
    args = parser.parse_args()

    import os

    model = args.model or os.environ.get("VOICE_OPENAI_MODEL", "whisper-1")
    matcher = CommandMatcher(fuzzy_threshold=args.fuzzy)
    if args.api_key:
        stt = OpenAIWhisperCloud(api_key=args.api_key, model=model)
        session = CloudVoiceSession(stt=stt, matcher=matcher)
    else:
        session = CloudVoiceSession(matcher=matcher)

    if args.mode == "vad":
        print(
            "VAD : parlez clairement quelques instants pour lancer l'enregistrement, "
            "puis terminez votre phrase — arrêt après ~1 s de silence.",
            file=sys.stderr,
            flush=True,
        )
        result = session.listen_until_silence(
            max_duration_s=args.max_seconds,
            silence_duration_s=args.silence_seconds,
            max_wait_voice_s=args.max_wait,
            voice_start_blocks=args.vad_voice_blocks,
            min_speech_blocks=args.vad_min_speech_blocks,
        )
    else:
        result = session.listen_once_fixed(args.seconds)
    print(json.dumps(asdict(result), ensure_ascii=False))


if __name__ == "__main__":
    main()

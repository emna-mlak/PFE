# Voice data & adaptation (cloud STT)

## Dataset layout (for your own records / fine-tuning elsewhere)

Use one JSON Lines file, one utterance per line:

```json
{"audio_path": "clips/u001.wav", "text": "prendre photo", "locale": "fr"}
{"audio_path": "clips/u002.wav", "text": "infraction stationnement", "locale": "fr"}
```

Export clips as 16-bit WAV (mono preferred). Fine-tuning or custom models are **provider-specific** (OpenAI account features, Google Speech adaptation, etc.).

## This project’s cloud layer

- **STT**: `plate_ocr_mvp.voice_cloud.stt_providers` — `OpenAIWhisperCloud`, `GeminiSpeechToText`, or implement `CloudSpeechToText` and register it in `create_stt_from_env()` (`VOICE_STT_PROVIDER=openai|gemini`).
- **Commands**: `plate_ocr_mvp.voice_cloud.commands.CommandMatcher` — extend `DEFAULT_COMMAND_PHRASES` so stable IDs (`take_photo`, `parking_infraction`) stay aligned with your handlers.

Keeping ASR in the cloud and command logic in-repo lets you change providers or add adaptation without touching the plate OCR pipeline.

# Privacy

Translate Clipboard Plus processes data only when a related feature is enabled or explicitly invoked.

## Clipboard and selected text

Clipboard monitoring is disabled by default. When enabled, the extension reads GNOME's primary selection and sends eligible text to the translation engine configured by the user. The manual selected-text shortcut also reads the primary selection.

## Screenshot OCR

Screenshot translation starts only from the configured shortcut or the **Screenshot and translate** top-bar menu item. The selected area is encoded as PNG in memory and sent to the configured vision endpoint. The extension does not save the screenshot to a temporary file.

The recognized text is subsequently sent to the selected translation engine.

## Translation providers

Depending on the user's settings, text may be sent to Google Translate, OpenRouter, OpenAI, Gemini, DeepSeek, Ollama, or a custom OpenAI-compatible endpoint. Users are responsible for reviewing the privacy policy of the provider they configure.

## Text-to-speech

Pressing a playback button sends that section's text to Microsoft Edge's online speech synthesis service. Returned MP3 data is decoded and played locally through GStreamer. Speech synthesis is not performed offline.

## Credentials

Translation-provider API keys use the system Secret Service where supported. The vision API-key setting is stored in GSettings; the default local configuration uses the non-secret value `dummy`. Do not place a sensitive remote credential there on a shared account.

## Local-first configuration

Users can keep screenshot recognition and LLM translation on their own machine by configuring local OpenAI-compatible endpoints. No telemetry or analytics are included in this extension.

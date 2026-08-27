export const Fields = {
    ENABLE_TRANS: 'enable-trans',
    ENABLE_SELECTION: 'enable-selection',
    BRIEF_MODE: 'brief-mode',
    AUTO_CLOSE: 'auto-close',
    AUTO_HIDE_MODE: 'auto-hide-mode',
    FROM: 'from',
    TO: 'to',
    TO_PRIMARY: 'to-primary',
    TO_SECONDARY: 'to-secondary',
    TRANS_SELECTED: 'translate-selected-text',
    TRANS_SCREENSHOT: 'translate-screenshot',
    VISION_ENDPOINT: 'vision-endpoint',
    VISION_MODEL: 'vision-model',
    VISION_API_KEY: 'vision-api-key',
    TTS_ENGINE: 'voice',
    PROXY: 'proxy',
    ENGINE: 'engine',
    LLM_PROVIDER: 'llm-provider',
    PROVIDER_SETTINGS: 'provider-settings',
    PANEL_PINNED: 'panel-pinned',
    PANEL_X: 'panel-x',
    PANEL_Y: 'panel-y',
    PANEL_MONITOR: 'panel-monitor'
};

export const defaultConfig = {
    'endpoint': '',
    'model': '',
    'prompt': 'Translate the following text into {destination_language}. Provide brief explanations for specialized terms in the source text, and include pronunciations for complex words:\n{selected_text}'
};

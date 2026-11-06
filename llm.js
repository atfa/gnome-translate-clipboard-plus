import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

import * as Languages from './languages.js';
import * as Utils from './utils.js';
import {gettext as _} from './utils.js';

/**
 * Mark a string for extraction by xgettext without translating it.
 *
 * The provider `name` values are shown in the preferences provider dropdown,
 * which translates them at display time (prefs.js). A plain `_(name)` call
 * cannot be used there: xgettext only extracts string literals, so a variable
 * msgid would never reach the .po files and gettext would silently return the
 * source text. N_() makes the literal visible to the extractor while staying a
 * no-op at runtime.
 */
const N_ = s => s;

// The whole prompt the availability probe sends. One word keeps the request as
// cheap as a `GET /models` call on providers that bill by the token.
const PROBE_TEXT = 'ping';

export const providers = {
    /*
    "huggingface": {
        name: "Hugging Face",
        providers: [
            "novita",
        ],
        models: [
            "deepseek-ai/DeepSeek-V3-0324",
        ],
        endpoint: "https://api-inference.huggingface.co",
        getUrl: function(endpoint, model) {
            return `${endpoint}/models/${model}/v1/chat/completions`;
        },
        signup: "https://huggingface.co",
        getApiKey: function() {
            return GLib.getenv("HUGGINGFACE_API_KEY");
        }
    },
    */
    "openrouter": {
        name: N_("OpenRouter"),
        models: [
            "google/gemini-3.1-flash-lite",
            "google/gemini-3.5-flash",
            "~google/gemini-pro-latest",
            "~google/gemini-flash-latest",
            "google/gemma-4-26b-a4b-it:free",
            "deepseek/deepseek-v4-flash",
            "deepseek/deepseek-v4-pro",
            "openai/gpt-chat-latest",
            "~openai/gpt-latest",
            "openai/gpt-5.4-nano",
            "x-ai/grok-4.3",
            "anthropic/claude-opus-4.8-fast",
            "anthropic/claude-sonnet-4",
            "anthropic/claude-opus-4",
            "anthropic/claude-3.7-sonnet",
            "anthropic/claude-3.5-sonnet",
            "moonshotai/kimi-k2.6",
            "~moonshotai/kimi-latest",
            "z-ai/glm-5.1",
            "qwen/qwen3.6-flash",
            "qwen/qwen3.7-plus",
            "qwen/qwen3.5-flash-02-23",
            "minimax/minimax-m3",
            "stepfun/step-3.7-flash",
            "xiaomi/mimo-v2.5",
            "xiaomi/mimo-v2.5-pro",
        ],
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        getUrl: function (endpoint) {
            return endpoint;
        },
        signup: "https://openrouter.ai/",
        modelsUri: "https://openrouter.ai/models",
        getApiKey: function () {
            return GLib.getenv("OPENROUTER_API_KEY");
        }
    },
    "gemini": {
        name: N_("Google Gemini"),
        models: [
            "gemini-3.1-pro-preview",
            "gemini-3.5-flash",
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-3-flash-preview",
            "gemini-3.1-flash-lite"
        ],
        endpoint: "",
        getUrl: function (endpoint, model, api_key) {
            return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${api_key}`;
        },
        signup: "https://ai.google.dev/tutorials/web_quickstart#set-up-api-key",
        getApiKey: function () {
            return GLib.getenv("GEMINI_API_KEY");
        },
        parseOutput(output) {
            if (output.candidates && output.candidates[0].content)
                return output.candidates[0].content.parts[0].text;
            return output;
        },
        probeBody: function (_model) {
            return JSON.stringify({
                "contents": [
                    { "role": "user", "parts": [{ "text": PROBE_TEXT }] }
                ],
                // Thinking models reject a budget below their thinking floor,
                // and a probe body must not be the thing that fails.
                "generationConfig": { "maxOutputTokens": 64 }
            });
        }
    },
    "openai": {
        name: N_("OpenAI"),
        models: [
            "o1-mini",
            "o1-preview",
            "o1",
            "o3-mini",
            "gpt-3.5-turbo",
            "gpt-4",
            "gpt-4o-mini",
            "gpt-4o",
            "chatgpt-4o-latest",
        ],
        endpoint: "https://api.openai.com/v1/chat/completions",
        signup: "https://platform.openai.com/api-keys",
        getApiKey: function () {
            return GLib.getenv("OPENAI_API_KEY");
        }
    },
    "deepseek": {
        name: N_("DeepSeek"),
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        endpoint: "https://api.deepseek.com/chat/completions",
        signup: "https://platform.deepseek.com/api_keys",
        getApiKey: function () {
            return GLib.getenv("DEEPSEEK_API_KEY");
        }
    },
    /*
    "xai":{
        name: "xAI",
        models: ["grok-beta"],
        endpoint: "https://api.x.ai/v1/chat/completions",
        signup: "https://x.ai",
        getApiKey: function() {
            return GLib.getenv("XAI_API_KEY");
        }
    },
    */
    "ollama": {
        name: N_("Ollama"),
        models: [
            "7shi/llama-translate:8b-q4_K_M",
            "icky/translate:latest",
            "qwen3:0.6b",
            "qwen3:1.7b",
            "deepseek-r1:1.5b",
        ],
        endpoint: "http://localhost:11434/api/chat",
        getUrl: function (endpoint) {
            return endpoint;
        },
        signup: "",
        getApiKey: function () {
            return GLib.getenv("OLLAMA_API_KEY");
        },
        createMessage: function (model, _from, _to, text) {
            return JSON.stringify({
                "model": model,
                "messages": [
                    { "role": "user", "content": text }
                ],
                "stream": false
            });
        },
        parseOutput(output) {
            if (output.message)
                return output.message.content;
            return output;
        }
    },
    "custom": {
        name: N_("Custom (compatible with OpenAI)"),
        models: [],
        endpoint: "http://127.0.0.1:4000/v1/chat/completions",
        signup: "",
        getApiKey: function () {
            return GLib.getenv("CUSTOM_API_KEY");
        }
    }
};

export var AiTranslator = GObject.registerClass({
    Signals: {
        'completed': {
            param_types: [GObject.TYPE_STRING],
            accumulator: GObject.signal_accumulator_true_handled
        },
        'thinking': {
            flags: GObject.SignalFlags.RUN_FIRST,
            param_types: [GObject.TYPE_STRING]
        },
        'error': {
            flags: GObject.SignalFlags.RUN_FIRST,
            param_types: [GObject.TYPE_STRING]
        }
    },
}, class AiTranslator extends GObject.Object {
    _init(params) {
        super._init();
        if (params) {
            this._provider = providers[params.provider];
            this._providerName = params.provider;
            this._schema = params.schema;
            this._model = params.model;
            this._prompt = params.prompt;
            // The endpoint the user typed in the preferences. Without it the
            // provider's built-in endpoint is used, so a custom endpoint was
            // saved, shown in the UI, and then ignored by every request.
            this._endpoint = params.endpoint;
        }
        if (!this._provider)
            this._provider = providers['openrouter'];
        if (!this._model)
            this._model = this._provider.models[0];
        if (!this._prompt)
            this.setPrompt(null);
    }
    setProvider(provider) {
        this._provider = providers[provider];
        if (!this._provider)
            this._provider = providers['openrouter'];
    }

    setModel(model) {
        this._model = model;
    }

    getModels(provider) {
        return providers[provider].models;
    }

    setPrompt(prompt) {
        if (prompt)
            this._prompt = prompt;
        else
            this._prompt = 'Translate from {origin_language} to {destination_language}, the text:\n{selected_text}\nResponse only with the text translated and nothing more.';
    }

    getPrompt() {
        return this._prompt;
    }

    _buildMessageBody(from, to, text) {
        let destLang = Languages.isoLangs[to].name;
        let prompt = this._prompt.replaceAll('{destination_language}', destLang)
            .replace('{selected_text}', text);
        if (from != 'auto') {
            let origLang = Languages.isoLangs[from].name;
            prompt = prompt.replaceAll('{origin_language}', origLang);
        }

        if (this._provider.createMessage) {
            return this._provider.createMessage(this._model, from, to, prompt);
        }
        let body = JSON.stringify({
            "model": this._model,
            "messages": [
                { "role": "system", "content": "You are a helpfull assistant." },
                { "role": "user", "content": prompt }
            ],
            "stream": false
        });
        //log(body);
        return body;
    }

    translate(from, to, proxy, text) {
        if (!this._session)
            this._session = new Soup.Session();
        else
            this._session.abort();

        //session.set_timeout(10);
        if ((proxy != null) && (proxy != '')) {
            let proxyResolver = Gio.SimpleProxyResolver.new(proxy, null);
            if (proxyResolver)
                this._session.set_proxy_resolver(proxyResolver);
            else
                this.emit('error', _('Invalid proxy protocol'));
        }

        Utils.getApiKey(this._schema, this._providerName,
            (apiKey) => {
                const _apiKey = apiKey || this._provider.getApiKey() || '';
                const endpoint = this._endpoint || this._provider.endpoint;
                let url = this._provider.getUrl ? this._provider.getUrl(endpoint, this._model, _apiKey) : endpoint;
                let request = Soup.Message.new('POST', url);
                if (!request) {
                    this.emit('error', _('Unable to create request for: ') + url);
                }
                request.request_headers.append('Authorization', `Bearer ${_apiKey}`);
                request.request_headers.append('Content-type', 'application/json');
                let bytes = GLib.Bytes.new(new TextEncoder().encode(this._buildMessageBody(from, to, text)));
                request.set_request_body_from_bytes('application/json', bytes);

                try {
                    this._session.send_and_read_async(request, GLib.PRIORITY_DEFAULT, null,
                        (session, result, error) => {
                            if (error) {
                                this.emit('error', _('Failed to connect: ') + error.message);
                            }
                            else {
                                this._processMessage(session, result, request.status_code);
                            }
                        }
                    );
                } catch (error) {
                    this.emit('error', _('Unable to send libsoup json message: ') + error.message);
                }
            },
            (error) => {
                this.emit('error', error);
            }
        );
    }

    _parseError(data) {
        let error = JSON.parse(data);
        if (error && this._provider.parseError)
            return this._provider.parseError(error);
        if (error && error.error)
            return error.error.message;
        return data;
    }

    _parseMessage(data) {
        let message = JSON.parse(data);
        if (message && this._provider.parseOutput)
            return this._provider.parseOutput(message);
        if (message && message.choices && message.choices[0].message)
            return message.choices[0].message.content;
        return message;
    }

    _processMessage(session, message, status) {
        try {
            const decoder = new TextDecoder();
            let data = decoder.decode(session.send_and_read_finish(message).get_data());
            //log('status: ' + status + ', data: ' + data);
            if (status != 200)
                this.emit('error', this._parseError(data));
            else
                this.emit('completed', this._parseMessage(data));
        } catch (error) {
            this.emit('error', error.message);
        }
    }

    cleanup() {
        if (this._session)
            this._session.abort();
    }
});

/**
 * Send one minimal request to a chat endpoint to find out whether an endpoint,
 * a model and an API key work together.
 *
 * AiTranslator is deliberately not reused here. It posts to the endpoint baked
 * into the provider (`this._provider.endpoint`) and ignores the endpoint the
 * user typed in the preferences, it looks the key up under an undefined
 * provider name, and it builds a full translation prompt — so a probe through
 * it would test the wrong URL and spend real translation tokens.
 *
 * The prober takes every value from the caller, so the preferences window can
 * probe exactly what is on screen, and it never writes settings: a failing
 * probe is information, not a gate on saving.
 */
export const ModelProber = GObject.registerClass({
    Signals: {
        'completed': {param_types: [GObject.TYPE_STRING]},
        'error': {param_types: [GObject.TYPE_STRING]},
    },
}, class ModelProber extends GObject.Object {
    _init() {
        super._init();
        this._session = null;
        this._provider = providers['openrouter'];
    }

    /**
     * @param {object} params - provider key, endpoint, model, api key, proxy
     */
    probe(params) {
        this.cleanup();

        this._provider = providers[params.provider] ?? providers['openrouter'];
        const endpoint = (params.endpoint ?? '').trim();
        const model = (params.model ?? '').trim();
        const apiKey = params.apiKey ?? '';

        // Providers that build the URL themselves (Gemini) have no endpoint of
        // their own, so an empty endpoint is normal for them, not an error.
        if (!this._provider.getUrl && endpoint === '') {
            this.emit('error', _('An endpoint is required to check the model.'));
            return;
        }

        this._session = new Soup.Session();
        // Soup3 has no set_timeout(); timeout is a property.
        this._session.timeout = 15;

        if ((params.proxy ?? '') !== '') {
            const proxyResolver = Gio.SimpleProxyResolver.new(params.proxy, null);
            if (!proxyResolver) {
                this._session = null;
                this.emit('error', _('Invalid proxy protocol'));
                return;
            }
            this._session.set_proxy_resolver(proxyResolver);
        }

        const url = this._provider.getUrl
            ? this._provider.getUrl(endpoint, model, apiKey)
            : this._normalizeEndpoint(endpoint);
        const request = Soup.Message.new('POST', url);
        if (!request) {
            this.emit('error', _('Unable to create request for: ') + url);
            return;
        }
        request.request_headers.append('Authorization', `Bearer ${apiKey}`);
        request.request_headers.append('Content-type', 'application/json');
        request.set_request_body_from_bytes('application/json',
            GLib.Bytes.new(new TextEncoder().encode(this._buildProbeBody(model))));

        try {
            const session = this._session;
            this._session.send_and_read_async(request, GLib.PRIORITY_DEFAULT, null,
                (_source, result) => {
                    // cleanup() nulls the session and probe() replaces it, so a
                    // callback that outlived its probe is dropped silently.
                    if (this._session !== session)
                        return;
                    let data;
                    try {
                        const bytes = session.send_and_read_finish(result).get_data();
                        data = new TextDecoder().decode(bytes);
                    } catch (error) {
                        this.emit('error', this._connectError(error));
                        return;
                    }
                    this._session = null;
                    if (request.status_code !== Soup.Status.OK) {
                        this.emit('error', this._parseError(data, request.status_code));
                        return;
                    }
                    // A 200 means the endpoint, the model and the key all worked
                    // together, even when the reply body cannot be parsed.
                    this.emit('completed', this._parseReply(data));
                });
        } catch (error) {
            this.emit('error', _('Unable to send libsoup json message: ') + error.message);
        }
    }

    /**
     * libsoup3 reports a timeout as a cancelled operation, which reads like a
     * bug. Say what the user can act on: the endpoint did not answer.
     */
    _connectError(error) {
        const timedOut = error.domain === Gio.IOErrorEnum.DOMAIN
            && (error.code === Gio.IOErrorEnum.TIMED_OUT
                || error.code === Gio.IOErrorEnum.CANCELLED);
        if (timedOut)
            return _('The request timed out. Check the endpoint and your network.');
        return _('Failed to connect: ') + error.message;
    }

    _normalizeEndpoint(endpoint) {
        const trimmed = endpoint.replace(/\/+$/, '');
        if (trimmed.endsWith('/chat/completions'))
            return trimmed;
        return `${trimmed}/chat/completions`;
    }

    _buildProbeBody(model) {
        if (this._provider.probeBody)
            return this._provider.probeBody(model);
        if (this._provider.createMessage)
            return this._provider.createMessage(model, 'en', 'en', PROBE_TEXT);
        return JSON.stringify({
            "model": model,
            "messages": [
                { "role": "user", "content": PROBE_TEXT }
            ],
            "stream": false
        });
    }

    _parseReply(data) {
        try {
            const message = JSON.parse(data);
            if (message && this._provider.parseOutput)
                return `${this._provider.parseOutput(message)}`.trim();
            const content = message?.choices?.[0]?.message?.content;
            return content ? `${content}`.trim() : '';
        } catch {
            return '';
        }
    }

    _parseError(data, status) {
        // libsoup3 exposes the reason phrase as Soup.Status.get_phrase(); the
        // older soup_status_reason_phrase() name is gone.
        const reason = Soup.Status.get_phrase ? `${Soup.Status.get_phrase(status) ?? ''}` : '';
        const prefix = `${status} ${reason}`.trim();
        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch {
            const text = `${prefix}: ${this._shorten(data)}`;
            const nonJsonHint = this._hint(status);
            return nonJsonHint ? `${text} - ${nonJsonHint}` : text;
        }
        let message;
        try {
            if (this._provider.parseError)
                message = this._provider.parseError(parsed);
        } catch {
            message = null;
        }
        if (!message)
            message = parsed?.error?.message ?? parsed?.message ?? data;
        const hint = this._hint(status);
        const text = `${prefix}: ${this._shorten(`${message}`)}`;
        return hint ? `${text} - ${hint}` : text;
    }

    /**
     * Name the thing the user can act on. A bare 401 and a bare 404 ask for
     * opposite fixes, and the raw provider text does not always say so.
     */
    _hint(status) {
        if (status === Soup.Status.UNAUTHORIZED || status === Soup.Status.FORBIDDEN)
            return _('The API key was rejected.');
        if (status === Soup.Status.NOT_FOUND)
            return _('The model name was not found at this endpoint.');
        if (status === Soup.Status.TOO_MANY_REQUESTS)
            return _('The service is rate limiting this key.');
        if (status >= 500)
            return _('The service reported an internal error.');
        return '';
    }

    _shorten(text) {
        const oneLine = `${text}`.replace(/\s+/g, ' ').trim();
        return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
    }

    cleanup() {
        if (this._session)
            this._session.abort();
        this._session = null;
    }
});

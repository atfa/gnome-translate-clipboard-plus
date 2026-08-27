import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';

const OCR_PROMPT = `Read all visible text in this screenshot exactly as written.
Preserve the natural reading order and line breaks.
Return only the recognized text, without Markdown fences, commentary, translation, or labels.`;

export const VisionRecognizer = GObject.registerClass({
    Signals: {
        'completed': {param_types: [GObject.TYPE_STRING]},
        'error': {param_types: [GObject.TYPE_STRING]},
    },
}, class VisionRecognizer extends GObject.Object {
    _init(settings) {
        super._init();
        this._settings = settings;
        this._session = null;
    }

    recognize(pngBytes) {
        this._session?.abort();
        this._session = new Soup.Session();

        const endpoint = this._settings.get_string('vision-endpoint').trim();
        const model = this._settings.get_string('vision-model').trim();
        const apiKey = this._settings.get_string('vision-api-key');
        if (!endpoint || !model) {
            this.emit('error', 'Vision endpoint and model are required.');
            return;
        }

        const url = endpoint.endsWith('/chat/completions')
            ? endpoint
            : `${endpoint.replace(/\/$/, '')}/chat/completions`;
        const imageData = GLib.base64_encode(pngBytes.get_data());
        const body = JSON.stringify({
            model,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {url: `data:image/png;base64,${imageData}`},
                    },
                    {type: 'text', text: OCR_PROMPT},
                ],
            }],
            temperature: 0,
            max_tokens: 4096,
            stream: false,
        });

        const request = Soup.Message.new('POST', url);
        if (!request) {
            this.emit('error', `Unable to create vision request for: ${url}`);
            return;
        }
        request.request_headers.append('Authorization', `Bearer ${apiKey}`);
        request.request_headers.append('Content-Type', 'application/json');
        request.set_request_body_from_bytes(
            'application/json',
            GLib.Bytes.new(new TextEncoder().encode(body)));

        this._session.send_and_read_async(
            request, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const responseBytes = session.send_and_read_finish(result);
                    const data = new TextDecoder().decode(responseBytes.get_data());
                    const response = JSON.parse(data);
                    if (request.status_code !== Soup.Status.OK) {
                        const message = response?.error?.message || data;
                        this.emit('error', message);
                        return;
                    }
                    const text = response?.choices?.[0]?.message?.content?.trim();
                    if (!text)
                        this.emit('error', 'No text was recognized in the screenshot.');
                    else
                        this.emit('completed', text);
                } catch (error) {
                    this.emit('error', error.message || String(error));
                }
            });
    }

    cleanup() {
        this._session?.abort();
        this._session = null;
    }
});

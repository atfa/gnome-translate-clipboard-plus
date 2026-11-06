'use strict'

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Voices from './config/voices.js';
import {Fields, defaultConfig} from './config/constants.js';
import {providers as Providers, ModelProber} from './llm.js';
import * as Utils from './utils.js';
import * as Languages from './languages.js';

const SOURCE_URL = 'https://github.com/atfa/gnome-translate-clipboard-plus';
const ISSUES_URL = `${SOURCE_URL}/issues`;
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;
const EXTENSION_PAGE_URL = 'https://extensions.gnome.org/extension/4097/translate-clipboard/';

/**
 * Fill positional `%1$s`/`%2$s` placeholders in a translated string.
 *
 * GJS has no `String.prototype.format`, and concatenating a translated prefix
 * with a value locks the word order to English, so translatable results are
 * written as one message with positional placeholders and filled here.
 *
 * @param {string} template - text marked for translation
 * @param {...string} args - values for `%1$s`, `%2$s`, ...
 * @returns {string} the text with every placeholder replaced
 */
function fill(template, ...args) {
    return args.reduce(
        (text, arg, index) => text.replaceAll(`%${index + 1}$s`, `${arg}`),
        template);
}

class GeneralPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    _init(settings) {
        super._init({
            title: _('General'),
            icon_name: 'emblem-system-symbolic',
            name: 'GeneralPage'
        });
        this._settings = settings;

        this._miscGroup = new Adw.PreferencesGroup();
        this.add(this._miscGroup);
        this._visionGroup = new Adw.PreferencesGroup({
            title: _('Screenshot translation'),
            description: _('Recognize screenshot text with an OpenAI-compatible vision model, then translate it with the selected translation engine.')
        });
        this.add(this._visionGroup);

        this._addSwitch({key : 'enable-trans',
                        label : _('Enable or disable translation'),
                        description : _('Whether to automatically translate selected text')
        });
        this._addSwitch({key : 'brief-mode',
                        label : _('Brief mode'),
                        description: null,
        });
        this._addSwitch({key : 'auto-close',
                        label : _('Auto hide'),
                        description: null,
        });
        this._addAutoHideModeRow();

        this._addKeybindingRow();
        this._addVisionSettingsRows();

        this._addLanguageSettingsRow();
        this._addVoicesRow();
        this._addProxyRow();
        this._addEnginesRow();
    }
    _addSwitch(params){
        let sw = new Gtk.Switch({halign : Gtk.Align.END, valign : Gtk.Align.CENTER});
        let row = new Adw.ActionRow({
            title: params.label,
            activatable_widget: sw,
            subtitle: params.description
        });
        this._settings.bind(params.key, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(sw);
        this._miscGroup.add(row);
    }

    _editShortcut(key, row, shortcutLabel) {
        const dialog = new Adw.Dialog({
            title: _('Set Shortcut'),
        });

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            show_start_title_buttons: false,
            show_end_title_buttons: false,
        });
        const cancelButton = new Gtk.Button({ label: _("Cancel") });
        headerBar.pack_start(cancelButton);

        const applyButton = new Gtk.Button({
            label: _("Apply"),
            css_classes: ['suggested-action'],
        });
        headerBar.pack_end(applyButton);
        applyButton.set_sensitive(false);

        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top:12,
            margin_bottom:12,
            margin_start:12,
            margin_end:12
        });
        vbox.append(new Gtk.Label({
            label: _("Press the desired shortcut keys.\nPress Esc to cancel, Backspace to clear current input."),
            halign: Gtk.Align.CENTER,
            justify: Gtk.Justification.CENTER,
            margin_bottom: 12,
            css_classes: ['dim-label'],
        }));

        const currentKey = this._settings.get_strv(key)[0];
        let currentKeyLabel = new Gtk.ShortcutLabel({
            accelerator: currentKey || '',
            disabled_text: _("Press a key..."),
            halign: Gtk.Align.CENTER,
        });
        vbox.append(currentKeyLabel);

        toolbarView.add_top_bar(headerBar);
        toolbarView.set_content(vbox);
        dialog.set_child(toolbarView);
        dialog.present(this.get_root());

        cancelButton.connect('clicked', () => {
            dialog.close();
        });

        applyButton.connect('clicked', () => {
            if (capturedAccel !== null)
                this._settings.set_strv(key, [capturedAccel]);
            shortcutLabel.set_label(capturedAccel || _('Disabled'));
            dialog.close();
        });

        let capturedAccel = null;
        const controller = new Gtk.EventControllerKey();
        dialog.add_controller(controller);
        controller.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (keyval === Gdk.KEY_Control_L || keyval === Gdk.KEY_Control_R ||
                keyval === Gdk.KEY_Alt_L     || keyval === Gdk.KEY_Alt_R ||
                keyval === Gdk.KEY_Shift_L   || keyval === Gdk.KEY_Shift_R ||
                keyval === Gdk.KEY_Super_L   || keyval === Gdk.KEY_Super_R ||
                keyval === Gdk.KEY_Meta_L    || keyval === Gdk.KEY_Meta_R) {
                return Gdk.EVENT_PROPAGATE;
            }
            if (keyval === Gtk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace) {
                capturedAccel = "";
                currentKeyLabel.set_accelerator("");
                currentKeyLabel.set_disabled_text(_("Cleared (Press Apply)"));
                applyButton.set_sensitive(true);
                return Gdk.EVENT_STOP;
            }
            if (Gtk.accelerator_valid(keyval, state)) {
                let accel = Gtk.accelerator_name(keyval, state);
                const lastGT = accel.lastIndexOf('>');
                let keyPart = accel.substring(lastGT + 1);
                if (keyPart.length === 1 && keyPart >= 'a' && keyPart <= 'z') {
                    keyPart = keyPart.toUpperCase();
                    accel = accel.substring(0, lastGT + 1) + keyPart;
                }
                capturedAccel = accel;
                currentKeyLabel.set_accelerator(accel);
                applyButton.set_sensitive(true);
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        dialog.connect('close-attempt', () => {
            return false;
        });
    }

    _addKeybindingRow(){
        const current = this._settings.get_strv(Fields.TRANS_SELECTED)[0];
        const [ok, key, mods] = Gtk.accelerator_parse(current);
        const accelString = ok ? Gtk.accelerator_name(key, mods) : "";
        const shortcutLabel = new Gtk.Label({
            label: accelString,
            halign : Gtk.Align.END,
            valign : Gtk.Align.CENTER,
        });
        const editButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            valign: Gtk.Align.CENTER
        });

        let row = new Adw.ActionRow({
            title: _('Translate the selected text'),
            subtitle: _('Shortcut keys for translating selected text')
        });

        editButton.connect('clicked', () => {
            this._editShortcut(Fields.TRANS_SELECTED, row, shortcutLabel);
        });
        row.add_suffix(shortcutLabel);
        row.add_suffix(editButton);
        this._miscGroup.add(row);

        this._addShortcutRow(
            Fields.TRANS_SCREENSHOT,
            _('Screenshot and translate'),
            _('Drag to select an area, recognize its text, and translate it.'),
            this._visionGroup);
    }

    _addShortcutRow(field, title, subtitle, group) {
        const current = this._settings.get_strv(field)[0] || '';
        const [ok, key, mods] = Gtk.accelerator_parse(current);
        const shortcutLabel = new Gtk.Label({
            label: ok ? Gtk.accelerator_name(key, mods) : _('Disabled'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });
        const editButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            valign: Gtk.Align.CENTER,
        });
        const row = new Adw.ActionRow({title, subtitle});
        editButton.connect('clicked', () => {
            this._editShortcut(field, row, shortcutLabel);
        });
        row.add_suffix(shortcutLabel);
        row.add_suffix(editButton);
        group.add(row);
    }

    _addVisionSettingsRows() {
        const endpointRow = new Adw.EntryRow({
            title: _('Vision endpoint'),
            text: this._settings.get_string(Fields.VISION_ENDPOINT),
        });
        const modelRow = new Adw.EntryRow({
            title: _('Vision model'),
            text: this._settings.get_string(Fields.VISION_MODEL),
        });
        const apiKeyRow = new Adw.PasswordEntryRow({
            title: _('Vision API key'),
            text: this._settings.get_string(Fields.VISION_API_KEY),
        });
        this._settings.bind(
            Fields.VISION_ENDPOINT, endpointRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind(
            Fields.VISION_MODEL, modelRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind(
            Fields.VISION_API_KEY, apiKeyRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._visionGroup.add(endpointRow);
        this._visionGroup.add(modelRow);
        this._visionGroup.add(apiKeyRow);
    }

    _getShortName(name){
        let shortName = name.replace('Microsoft ', '');
        shortName = shortName.replace(' Online', '').replace('(Natural)', '');
        return shortName;
    }
    _addVoicesRow(){
        let row = new Adw.ComboRow({
            title: _('TTS Voice'),
            subtitle: _('Text-to-speech'),
        });
        row.add_css_class('voices-row');
        this._miscGroup.add(row);

        const voiceList  = new Gtk.StringList;
        Voices.voices.forEach((v) => {
            voiceList.append(this._getShortName(v.FriendlyName));
        });

        row.set_model(voiceList);
        this._onVoiceChanged(row);

        this._settings.connect('changed::voice', (settings, key) => {
            this._onVoiceChanged(row);
        });
        row.connect('notify::selected', () => {
            this._settings.set_string('voice', Voices.voices[row.get_selected()].Name);
        });
    }

    _onVoiceChanged(row){
        let index = Voices.voices.map(e => e.Name).indexOf(this._settings.get_string('voice'));
        if (index == -1)
            index = 0;
        row.set_selected(index);
    }

    _addAutoHideModeRow(){
        let row = new Adw.ComboRow({
            title: _('Auto hide mode'),
            subtitle: _('How to auto hide the translation window')
        });
        this._miscGroup.add(row);

        const modeList = new Gtk.StringList;
        modeList.append(_('Timeout'));
        modeList.append(_('Click outside'));
        modeList.append(_('Both'));

        row.set_model(modeList);
        this._onAutoHideModeChanged(row);

        this._settings.connect('changed::auto-hide-mode', (settings, key) => {
            this._onAutoHideModeChanged(row);
        });
        row.connect('notify::selected', () => {
            const modes = ['timeout', 'click', 'both'];
            this._settings.set_string('auto-hide-mode', modes[row.get_selected()]);
        });
    }

    _onAutoHideModeChanged(row){
        const mode = this._settings.get_string('auto-hide-mode') || 'timeout';
        const modes = ['timeout', 'click', 'both'];
        const index = modes.indexOf(mode);
        row.set_selected(index >= 0 ? index : 0);
    }

    _addProxyRow(){
        let proxy = new Gtk.Entry({text: '',
                                  placeholder_text: 'protocol://host:port',
                                  halign : Gtk.Align.END,
                                  valign : Gtk.Align.CENTER,
                                  width_chars: 25
        });

        let row = new Adw.ActionRow({
            title: _('Network proxy'),
        });
        row.add_suffix(proxy);
        this._miscGroup.add(row);
        this._settings.bind('proxy', proxy, 'text', Gio.SettingsBindFlags.DEFAULT);
    }

    _addEnginesRow(){
        let row = new Adw.ComboRow({
            title: _('Engine'),
            subtitle: _('Translation engine')
        });
        this._miscGroup.add(row);

        const engineList  = new Gtk.StringList;
        engineList.append("Google");
        engineList.append("LLM");

        row.set_model(engineList);
        this._onEngineChanged(row);

        this._settings.connect('changed::engine', (settings, key) => {
            this._onEngineChanged(row);
        });
        row.connect('notify::selected', () => {
            this._settings.set_string('engine', engineList.get_string(row.get_selected()));
        });
    }
    _onEngineChanged(row){
        let engine = this._settings.get_string('engine');
        this._engine = engine;
        row.set_selected(engine != 'Google');
    }

    _addLanguageSettingsRow(){
        const langList = new Gtk.StringList();
        const langCodes = [];

        langList.append(_('Auto'));
        langCodes.push('auto');

        const isoLangs = Languages.isoLangs;
        const sortedKeys = Object.keys(isoLangs).sort((a, b) => {
            const nameA = isoLangs[a].nativeName.toLowerCase();
            const nameB = isoLangs[b].nativeName.toLowerCase();
            return nameA.localeCompare(nameB);
        });

        for (const langCode of sortedKeys) {
            const lang = isoLangs[langCode];
            langList.append(`${lang.nativeName} (${langCode})`);
            langCodes.push(langCode);
        }

        let fromRow = new Adw.ComboRow({
            title: _('Source language'),
            subtitle: _('Language code (e.g., en, zh, auto for auto-detect)')
        });
        fromRow.set_model(langList);
        this._miscGroup.add(fromRow);
        this._onLanguageChanged(fromRow, Fields.FROM, langCodes, true);

        this._settings.connect('changed::' + Fields.FROM, (settings, key) => {
            this._onLanguageChanged(fromRow, Fields.FROM, langCodes, true);
        });
        fromRow.connect('notify::selected', () => {
            const selectedIndex = fromRow.get_selected();
            if (selectedIndex >= 0 && selectedIndex < langCodes.length) {
                this._settings.set_string(Fields.FROM, langCodes[selectedIndex]);
            }
        });

        let toPrimaryRow = new Adw.ComboRow({
            title: _('Primary target language'),
            subtitle: _('Primary target language code (higher priority)')
        });
        toPrimaryRow.set_model(langList);
        this._miscGroup.add(toPrimaryRow);
        this._onLanguageChanged(toPrimaryRow, Fields.TO_PRIMARY, langCodes, true);

        this._settings.connect('changed::' + Fields.TO_PRIMARY, (settings, key) => {
            this._onLanguageChanged(toPrimaryRow, Fields.TO_PRIMARY, langCodes, true);
        });
        toPrimaryRow.connect('notify::selected', () => {
            const selectedIndex = toPrimaryRow.get_selected();
            if (selectedIndex >= 0 && selectedIndex < langCodes.length) {
                this._settings.set_string(Fields.TO_PRIMARY, langCodes[selectedIndex]);
            }
        });

        const secondaryLangList = new Gtk.StringList();
        const secondaryLangCodes = [];
        
        secondaryLangList.append(_('None'));
        secondaryLangCodes.push('');
        
        for (const langCode of sortedKeys) {
            const lang = isoLangs[langCode];
            secondaryLangList.append(`${lang.name} (${langCode})`);
            secondaryLangCodes.push(langCode);
        }

        let toSecondaryRow = new Adw.ComboRow({
            title: _('Secondary target language'),
            subtitle: _('Secondary target language code (lower priority, optional)')
        });
        toSecondaryRow.set_model(secondaryLangList);
        this._miscGroup.add(toSecondaryRow);
        this._onLanguageChanged(toSecondaryRow, Fields.TO_SECONDARY, secondaryLangCodes, false);
        
        this._settings.connect('changed::' + Fields.TO_SECONDARY, (settings, key) => {
            this._onLanguageChanged(toSecondaryRow, Fields.TO_SECONDARY, secondaryLangCodes, false);
        });
        toSecondaryRow.connect('notify::selected', () => {
            const selectedIndex = toSecondaryRow.get_selected();
            if (selectedIndex >= 0 && selectedIndex < secondaryLangCodes.length) {
                this._settings.set_string(Fields.TO_SECONDARY, secondaryLangCodes[selectedIndex]);
            }
        });
    }

    _onLanguageChanged(row, field, langCodes, hasAuto) {
        const currentValue = this._settings.get_string(field) || (hasAuto ? 'auto' : '');
        let index = langCodes.indexOf(currentValue);
        if (index === -1) {
            if (hasAuto && currentValue === '') {
                index = langCodes.indexOf('auto');
            } else {
                index = 0;
            }
        }
        if (index >= 0 && index < langCodes.length) {
            row.set_selected(index);
        }
    }
}

class AiPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    _init(settings) {
        super._init({
            title: _('LLM'),
            icon_name: '',
            name: 'LLM'
        });
        this._settings = settings;
        // Create widget for setting provider, model, apikey, prompt
        this._aiGroup = new Adw.PreferencesGroup();
        this.add(this._aiGroup);

        // Provider
        const providerList = new Gtk.StringList();
        Object.values(Providers).forEach(p => {
            // Display only: the value stored in gsettings and compared in
            // _onProviderChanged() stays the untranslated `p.name`.
            providerList.append(_(p.name));
        });
        const providerRow = new Adw.ComboRow({
            title: _('Provider'),
            subtitle: _('LLM service provider')
        });
        providerRow.set_model(providerList);
        this._aiGroup.add(providerRow);

        const endpointRow = new Adw.EntryRow({
            title: _('Endpoint'),
            tooltip_text: _('Endpoint for the LLM service'),
            text: ''
        });
        this._resetEndpoint = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Undo'),
        });
        endpointRow.add_suffix(this._resetEndpoint);
        this._aiGroup.add(endpointRow);
        this._endpointRow = endpointRow;

        // Model selection
        const modelRow = new Adw.EntryRow({
            title: _('Model'),
            tooltip_text: _('Model name/identifier for the LLM service'),
            text: ''
        });
        this._nextButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Next model'),
        });
        this._moreButton = new Gtk.Button({
            icon_name: 'view-more-horizontal-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('More models'),
        });
        this._probeButton = new Gtk.Button({
            icon_name: 'network-server-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Check whether the model is available'),
        });
        modelRow.add_suffix(this._nextButton);
        modelRow.add_suffix(this._moreButton);
        modelRow.add_suffix(this._probeButton);
        this._aiGroup.add(modelRow);
        this._modelRow = modelRow;

        // API Key
        const apiKeyRow = new Adw.PasswordEntryRow({
            title: _('API Key'),
            text: ''
        });
        this._signupButton = new Gtk.LinkButton({
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
            uri: '',
            label: _('New'),
            tooltip_text: _('Signup'),
        });
        apiKeyRow.add_suffix(this._signupButton);
        this._aiGroup.add(apiKeyRow);
        this._apiKeyRow = apiKeyRow;

        // Availability probe. Informational only: nothing here gates saving, a
        // model that fails the probe can still be saved and used.
        this._prober = new ModelProber();
        this._probeRow = new Adw.ActionRow({
            title: _('Model availability'),
            subtitle: _('Send one minimal request to check the endpoint, model and API key. Saving is never blocked by the result.'),
        });
        this._probeIcon = new Gtk.Image({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        this._probeSpinner = new Gtk.Spinner({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        this._probeRow.add_prefix(this._probeIcon);
        this._probeRow.add_suffix(this._probeSpinner);
        this._aiGroup.add(this._probeRow);
        this._probeIdleSubtitle = this._probeRow.get_subtitle();

        // Prompt.
        this._extraGroup = new Adw.PreferencesGroup({
            title: _('Prompt template'),
        });
        this.add(this._extraGroup);
        const promptScrolled = new Gtk.ScrolledWindow({
            height_request: 100,
            hexpand: false,
        });
        const promptRow = new Adw.PreferencesRow({});
        const promptView = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD,
        });
        const promptBuffer = promptView.get_buffer();
        promptBuffer.set_text('', -1);
        promptScrolled.set_child(promptView);
        promptRow.set_child(promptScrolled);
        this._extraGroup.add(promptRow);
        this._promptBuffer = promptBuffer;

        // Reset
        const resetButton = new Gtk.Button({
            label: _('Reset All Settings'),
            halign: Gtk.Align.CENTER,
            margin_top: 12,
            margin_bottom: 12
        });
        resetButton.get_style_context().add_class('destructive-action');

        resetButton.connect('clicked', () => {
            const schema = this._settings.schema_id;
            Utils.removeApiKey(schema, this._provider, () => {
                this._apiKeyRow.set_text('');
                const currentProvider = this._provider;
                this._settings.reset('llm-provider');
                this._settings.reset('provider-settings');
                if (currentProvider == this._provider)
                    this._refresh();
            });
        });
        const resetGroup = new Adw.PreferencesGroup({
            header_suffix: resetButton
        });
        this.add(resetGroup);

        this._onProviderChanged(providerRow);
        this._settings.connect('changed::llm-provider', (settings, key) => {
            this._onProviderChanged(providerRow);
        });
        providerRow.connect('notify::selected', () => {
            this._settings.set_string('llm-provider',
                Object.values(Providers)[providerRow.get_selected()].name);
        });
        this._bindSettings();
    }

    _onProviderChanged(row) {
        const provider = this._settings.get_string('llm-provider');
        let index = 0;
        for (const p in Providers) {
            if (Providers[p].name == provider) {
                row.set_selected(index);
                this._provider = p;
                this._refresh();
                break;
            }
            index++;
        }
    }

    _bindSettings() {
        this._endpointRow.connect('changed', (row) => { this._writeSettings(); });
        this._modelRow.connect('changed', (row) => { this._writeSettings(); });
        this._apiKeyRow.connect('changed', (row) => {
            if (this._isReadFromSecret) {
                this._isReadFromSecret = false;
                return;
            }
            const apiKey = this._apiKeyRow.get_text();
            const schema = this._settings.schema_id;
            Utils.removeApiKey(schema, this._provider, () => {
                Utils.storeApiKey(schema, this._provider, apiKey);
            });
        });
        this._promptBuffer.connect('changed', () => { this._writeSettings(); });

        this._resetEndpoint.connect('clicked', () => {
            const endpoint = Providers[this._provider].endpoint;
            this._endpointRow.set_text(endpoint);
        });

        this._nextButton.connect('clicked', () => {
            const models = Providers[this._provider].models;
            const model = this._modelRow.get_text();
            const current = models.indexOf(model);
            const next = current !== -1 && current < models.length - 1
                ? current + 1
                : 0;
            this._modelRow.set_text(models[next] || model);
        });

        this._moreButton.connect('clicked', () => {
            const modelsUri = Providers[this._provider].modelsUri;
            const launcher = new Gtk.UriLauncher({ uri: modelsUri ?? '' });
            launcher.launch(null, null, null, null);
        });

        this._probeButton.connect('clicked', () => { this._probeModel(); });
        this._prober.connect('completed', (_prober, reply) => {
            this._finishProbe(true, reply);
        });
        this._prober.connect('error', (_prober, message) => {
            this._finishProbe(false, message);
        });
        this.connect('destroy', () => this._prober.cleanup());
    }

    /**
     * Probe the endpoint, model and key currently on screen.
     *
     * Nothing is written and nothing is gated: the probe reports, the user
     * saves whatever they like.
     */
    _probeModel() {
        const endpoint = this._endpointRow.get_text().trim();
        const model = this._modelRow.get_text().trim();
        if (model === '') {
            this._showProbeResult(false, _('A model name is required to check the model.'));
            return;
        }

        const apiKey = this._apiKeyRow.get_text()
            || Providers[this._provider].getApiKey() || '';
        this._probeModelName = model;
        this._probeStarted = GLib.get_monotonic_time();
        this._probeButton.set_sensitive(false);
        this._probeIcon.set_visible(false);
        this._probeSpinner.set_visible(true);
        this._probeSpinner.start();
        this._probeRow.set_subtitle(_('Checking the model…'));
        this._prober.probe({
            provider: this._provider,
            endpoint,
            model,
            apiKey,
            proxy: this._settings.get_string(Fields.PROXY),
        });
    }

    _finishProbe(available, detail) {
        this._probeSpinner.stop();
        this._probeSpinner.set_visible(false);
        this._probeButton.set_sensitive(true);

        if (available) {
            const elapsed = Math.round((GLib.get_monotonic_time() - this._probeStarted) / 1000);
            this._showProbeResult(true,
                fill(_('Model is available: %1$s (%2$s ms)'), this._probeModelName, elapsed));
        } else {
            this._showProbeResult(false,
                fill(_('Model is not available: %1$s'), detail));
        }
    }

    _showProbeResult(available, text) {
        this._probeRow.remove_css_class('success');
        this._probeRow.remove_css_class('error');
        this._probeIcon.remove_css_class('success');
        this._probeIcon.remove_css_class('error');
        this._probeRow.set_subtitle(text);
        if (available === null) {
            this._probeIcon.set_visible(false);
            return;
        }
        this._probeIcon.set_from_icon_name(
            available ? 'object-select-symbolic' : 'process-stop-symbolic');
        this._probeIcon.add_css_class(available ? 'success' : 'error');
        this._probeRow.add_css_class(available ? 'success' : 'error');
        this._probeIcon.set_visible(true);
    }

    _resetProbe() {
        this._prober.cleanup();
        this._probeSpinner.stop();
        this._probeSpinner.set_visible(false);
        this._probeButton.set_sensitive(true);
        this._probeIcon.set_visible(false);
        this._showProbeResult(null, this._probeIdleSubtitle);
    }

    _writeSettings() {
        const configs = Utils.readConfig(this._settings, 'provider-settings');
        let [start, end] = this._promptBuffer.get_bounds();
        let text = this._promptBuffer.get_text(start, end, false);
        const params = {
            endpoint: this._endpointRow.get_text(),
            model: this._modelRow.get_text(),
            prompt: text,
        };
        configs[this._provider] = params;
        // For compatibility with previous versions
        for (const [provider, config] of Object.entries(configs)) {
            if (!config.endpoint)
                config.endpoint = Providers[provider].endpoint;
        }
        Utils.writeConfig(this._settings, 'provider-settings', configs);
    }

    _refresh() {
        this._resetProbe();
        const configs = Utils.readConfig(this._settings, 'provider-settings');
        const params = configs[this._provider] ?? {};
        const endpoint = params.endpoint || Providers[this._provider].endpoint;
        const model = params.model || Providers[this._provider].models[0] || '';
        const prompt = params.prompt ?? defaultConfig.prompt;

        const schema = this._settings.schema_id;
        Utils.getApiKey(schema, this._provider,
            (apiKey) => {
                this._isReadFromSecret = !!apiKey;
                this._apiKeyRow.set_text(apiKey || Providers[this._provider].getApiKey() || '');
            },
            (error) => {
                log(error);
            }
        );

        this._endpointRow.set_text(endpoint);
        this._modelRow.set_text(model);
        this._promptBuffer.set_text(prompt, -1);

        const signupUri = Providers[this._provider].signup;
        if (signupUri) {
            this._signupButton.set_uri(signupUri);
            this._signupButton.set_sensitive(true);
        } else {
            this._signupButton.set_sensitive(false);
            this._signupButton.set_uri('');
        }
    }
}

class AboutPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    _init(metadata) {
        super._init({
            title: _('About'),
            icon_name: 'help-about-symbolic',
            name: 'AboutPage'
        });
        this._metadata = metadata ?? {};

        const aboutGroup = new Adw.PreferencesGroup({
            title: this._metadata.name || _('Translate Clipboard Plus'),
            description: _('Clipboard translation, screenshot OCR, and reverse checks.')
        });
        this.add(aboutGroup);

        this._addInfoRow(aboutGroup, _('Privacy Notice'), _('This extension needs clipboard access and may send clipboard contents to third-party translation, text-to-speech, or LLM services.'));
        this._addInfoRow(aboutGroup, _('Credits'), _('Forked from Translate Clipboard by lsnow and extended by atfa.'));

        const linksGroup = new Adw.PreferencesGroup();
        this.add(linksGroup);

        const sourceUrl = this._metadata.url || SOURCE_URL;
        this._addLinkRow(linksGroup, _('Extension Page'), EXTENSION_PAGE_URL);
        this._addLinkRow(linksGroup, _('Source Code'), sourceUrl);
        this._addLinkRow(linksGroup, _('Report an Issue'), ISSUES_URL);
        this._addLinkRow(linksGroup, _('License'), LICENSE_URL, _('GNU General Public License v3.0'));
    }

    _addInfoRow(group, title, value) {
        const row = new Adw.ActionRow({
            title,
            subtitle: value
        });
        group.add(row);
    }

    _addLinkRow(group, title, uri, subtitle = uri) {
        const row = new Adw.ActionRow({
            title,
            subtitle
        });
        const linkButton = new Gtk.LinkButton({
            uri,
            label: _('Open'),
            valign: Gtk.Align.CENTER
        });
        row.add_suffix(linkButton);
        group.add(row);
    }
}

export default class TranslateClipboardExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let provider = new Gtk.CssProvider();
        provider.load_from_path(this.dir.get_path() + '/prefs.css');
        Gtk.StyleContext.add_provider_for_display(
                                                  Gdk.Display.get_default(),
                                                  provider,
                                                  Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        const settings = this.getSettings();
        const generalPage = new GeneralPage(settings);
        const aiPage = new AiPage(settings);
        const aboutPage = new AboutPage(this.metadata);

        window.add(generalPage);
        window.add(aiPage);
        window.add(aboutPage);
    }
}

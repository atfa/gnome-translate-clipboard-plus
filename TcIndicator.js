import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {SelectArea} from 'resource:///org/gnome/shell/ui/screenshot.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Button } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { notify } from 'resource:///org/gnome/shell/ui/main.js';

import * as Utils from './utils.js';
import * as Languages from './languages.js';
import { AzureTTS } from './tts.js';
import { GoogleTranslator } from './google.js';
import { providers as Providers, AiTranslator } from './llm.js';
import { Fields, defaultConfig } from './config/constants.js';
import { TranslateWindow } from './TranslateWindow.js';
import {VisionRecognizer} from './vision.js';

const IndicatorName = 'Translate Clipboard';

export const TcIndicator = GObject.registerClass(
    class TcIndicator extends Button {
        _init(ext) {
            super._init(0.0, IndicatorName, false);

            this._extension = ext;
            this._settings = this._extension.getSettings();
            this._trans_cmd = ext.path + '/trans';

            this._enabled = true;
            this._oldtext = null;
            this._showOriginalPhonetics = true;
            this._autoClose = this._settings.get_boolean(Fields.AUTO_CLOSE);
            this._autoHideMode = this._settings.get_string(Fields.AUTO_HIDE_MODE) || 'timeout';
            this._engine = this._settings.get_string(Fields.ENGINE);
            this._dump = true;
            this._ttsEngine = this._settings.get_string(Fields.TTS_ENGINE);
            this._proxy = this._settings.get_string(Fields.PROXY);
            this._briefMode = this._settings.get_boolean(Fields.BRIEF_MODE);
            this._activeRequest = null;
            this._primaryContext = null;
            this._visionRequestActive = false;
            this._keybindingsRegistered = false;

            this._locale = this._getLocale();

            this._icon = new St.Icon({
                style_class: 'system-status-icon',
            });
            this._icon.gicon = Gio.icon_new_for_string(`${this._extension.path}/icons/translator-symbolic.svg`);
            let box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
            box.add_child(this._icon);
            this.add_child(box);

            this._fromSelector = this._createLanguageSelector(Fields.FROM, _("Source language"), 'auto');
            this._toPrimarySelector = this._createLanguageSelector(Fields.TO_PRIMARY, _("Primary target language"), 'auto');
            this._toSecondarySelector = this._createLanguageSelector(Fields.TO_SECONDARY, _("Secondary target language"), '');

            let item = new PopupMenu.PopupSwitchMenuItem(_('Monitor the clipboard'), true, null);
            item.connect('toggled', () => {
                this._enabled = item.state;
                this._settings.set_boolean(Fields.ENABLE_TRANS, this._enabled);
            });
            this.menu.addMenuItem(item);
            this._enableTransItem = item;

            let item1 = new PopupMenu.PopupSwitchMenuItem(_('Brief mode'), false, null);
            item1.connect('toggled', () => {
                this._briefMode = item1.state;
                this._settings.set_boolean(Fields.BRIEF_MODE, this._briefMode);
            });
            this.menu.addMenuItem(item1);
            this._briefModeItem = item1;

            let screenshotItem = new PopupMenu.PopupMenuItem(_('Screenshot and translate'));
            screenshotItem.connect('activate', () => this._translateScreenshot());
            this.menu.addMenuItem(screenshotItem);

            let keybind = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false
            });
            keybind.add_child(new St.Label({
                text: "Translate selected",
                x_align: Clutter.ActorAlign.START
            }));
            let key0 = this._settings.get_strv(Fields.TRANS_SELECTED)[0];
            this._selectedKeyLabel = new St.Label({
                text: key0,
                x_expand: true,
                x_align: Clutter.ActorAlign.END
            });
            keybind.add_child(this._selectedKeyLabel);

            this.menu.addMenuItem(keybind);

            let screenshotKeybind = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false
            });
            screenshotKeybind.add_child(new St.Label({
                text: _('Screenshot translation'),
                x_align: Clutter.ActorAlign.START
            }));
            this._screenshotKeyLabel = new St.Label({
                text: this._settings.get_strv(Fields.TRANS_SCREENSHOT)[0] || _('Disabled'),
                x_expand: true,
                x_align: Clutter.ActorAlign.END
            });
            screenshotKeybind.add_child(this._screenshotKeyLabel);
            this.menu.addMenuItem(screenshotKeybind);

            let settingsItem = new PopupMenu.PopupMenuItem('Settings');
            this.menu.addMenuItem(settingsItem);
            settingsItem.connect('activate', this._openPrefs.bind(this));

            this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
                if (key.startsWith('panel-'))
                    return;
                if (key === Fields.CHECK_ENABLED || key === Fields.LIGHT_MODE) {
                    this._translateWindow?.updateSettings({});
                    return;
                }
                this._settingsChanged();
            });
            this._tts = new AzureTTS(null);
            this._tts.engine = this._ttsEngine;
            this._visionRecognizer = new VisionRecognizer(this._settings);
            this._visionCompletedId = this._visionRecognizer.connect(
                'completed', this._onVisionCompleted.bind(this));
            this._visionErrorId = this._visionRecognizer.connect(
                'error', this._onVisionError.bind(this));
            
            this._translateWindow = new TranslateWindow({
                extension: this._extension,
                tts: this._tts,
                engine: this._engine,
                briefMode: this._briefMode,
                dump: this._dump,
                autoClose: this._autoClose,
                autoHideMode: this._autoHideMode,
                locale: this._locale,
                settings: this._settings,
                translateCallback: (text) => {
                    this._translate(text);
                },
                checkCallback: () => {
                    this._translateCheck();
                },
                isRtl: (code) => {
                    return this._isRtl(code);
                }
            });
            
            this._settingsChanged();
            this._watchClipboard();
        }

        destroy() {
            this._removeKeybindings();
            this._selection.disconnect(this._ownerChangedId);
            this._settings.disconnect(this._settingsChangedId);
            this._disconnectTranslator();
            this._translator?.cleanup?.();
            if (this._visionRecognizer) {
                if (this._visionCompletedId)
                    this._visionRecognizer.disconnect(this._visionCompletedId);
                if (this._visionErrorId)
                    this._visionRecognizer.disconnect(this._visionErrorId);
                this._visionRecognizer.cleanup();
                this._visionRecognizer = null;
            }
            if (this._translateWindow) {
                this._translateWindow.destroy();
                this._translateWindow = null;
            }
            this._tts.cleanup();

            super.destroy();
        }

        _openPrefs() {
            this._extension.openPreferences();
        }

        _settingsChanged() {
            this._oldtext = null;
            this._enableTransItem.setToggleState(this._settings.get_boolean(Fields.ENABLE_TRANS));
            this._briefModeItem.setToggleState(this._settings.get_boolean(Fields.BRIEF_MODE));
            this._enabled = this._enableTransItem.state;
            this._briefMode = this._briefModeItem.state;
            this._autoClose = this._settings.get_boolean(Fields.AUTO_CLOSE);
            this._autoHideMode = this._settings.get_string(Fields.AUTO_HIDE_MODE) || 'timeout';
            this._ttsEngine = this._settings.get_string(Fields.TTS_ENGINE);
            this._tts.engine = this._ttsEngine;
            this._proxy = this._settings.get_string(Fields.PROXY);
            this._engine = this._settings.get_string(Fields.ENGINE);
            this._selectedKeyLabel.text =
                this._settings.get_strv(Fields.TRANS_SELECTED)[0] || _('Disabled');
            this._screenshotKeyLabel.text =
                this._settings.get_strv(Fields.TRANS_SCREENSHOT)[0] || _('Disabled');

            if (this._translateWindow) {
                this._translateWindow.updateSettings({
                    engine: this._engine,
                    briefMode: this._briefMode,
                    dump: this._dump,
                    autoClose: this._autoClose,
                    autoHideMode: this._autoHideMode,
                    locale: this._locale
                });
            }

            let from = this._settings.get_string(Fields.FROM);
            let to = this._settings.get_string(Fields.TO);
            let toPrimary = this._settings.get_string(Fields.TO_PRIMARY);
            let toSecondary = this._settings.get_string(Fields.TO_SECONDARY);

            let isoLangs = Languages.isoLangs;

            if (from == '')
                from = 'auto';
            else if (from.toLowerCase() != 'auto')
                from = this._getCode(from);

            if (to == '' || to.toLowerCase() == 'auto')
                to = this._getCode(this.locale);
            else
                to = this._getCode(to);

            if (toPrimary == '' || toPrimary.toLowerCase() == 'auto')
                toPrimary = this._getCode(this.locale);
            else
                toPrimary = this._getCode(toPrimary);

            if (toSecondary == '' || toSecondary.toLowerCase() == 'auto')
                toSecondary = '';
            else
                toSecondary = this._getCode(toSecondary);

            this._toPrimary = toPrimary;
            this._toSecondary = toSecondary;

            // Update the language selector value display
            if (this._fromSelector && this._fromSelector._valueLabel) {
                this._updateLanguageSelectorValue(this._fromSelector._valueLabel, from);
                if (this._fromSelector.menuItems) {
                    this._updateMenuSelection(this._fromSelector.menuItems, from);
                }
            }
            if (this._toPrimarySelector && this._toPrimarySelector._valueLabel) {
                this._updateLanguageSelectorValue(this._toPrimarySelector._valueLabel, toPrimary);
                if (this._toPrimarySelector.menuItems) {
                    this._updateMenuSelection(this._toPrimarySelector.menuItems, toPrimary);
                }
            }

            this._removeKeybindings();
            this._setupKeybindings();
            
            this._disconnectTranslator();
            this._translator?.cleanup?.();
            
            if (this._engine != 'Google')
                this._onProviderChanged();
            else
                this._translator = new GoogleTranslator();
            this._translateCompleted = this._translator.connect('completed',
                this._onCompleted.bind(this));
            this._translateError = this._translator.connect('error',
                this._onTranslationError.bind(this));
        }

        _disconnectTranslator() {
            if (!this._translator)
                return;
            if (this._translateCompleted) {
                this._translator.disconnect(this._translateCompleted);
                this._translateCompleted = null;
            }
            if (this._translateError) {
                this._translator.disconnect(this._translateError);
                this._translateError = null;
            }
        }

        _onProviderChanged() {
            let provider = this._settings.get_string(Fields.LLM_PROVIDER);
            // workaround
            if (provider == 'DeekSeek')
                provider = 'DeepSeek';
            try {
                for (const p in Providers) {
                    if (Providers[p].name == provider) {
                        let providerSettings = Utils.readConfig(this._settings, Fields.PROVIDER_SETTINGS)[p] ?? defaultConfig;
                        providerSettings.provider = p;
                        providerSettings.schema = this._settings.schema_id;
                        this._translator = new AiTranslator(providerSettings);
                        break;
                    }
                }
            } catch (e) {
                this._engine = 'Google';
                this._translator = new GoogleTranslator();
            }
        }

        _removeKeybindings() {
            if (!this._keybindingsRegistered)
                return;
            Main.wm.removeKeybinding('translate-selected-text');
            Main.wm.removeKeybinding('translate-screenshot');
            this._keybindingsRegistered = false;
        }

        _setupKeybindings() {
            Main.wm.addKeybinding('translate-selected-text',
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL |
                Shell.ActionMode.POPUP,
                this._translateSelected.bind(this));
            Main.wm.addKeybinding('translate-screenshot',
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL |
                Shell.ActionMode.POPUP,
                this._translateScreenshot.bind(this));
            this._keybindingsRegistered = true;
        }

        async _translateScreenshot() {
            if (this._visionRequestActive)
                return;

            const panelWasVisible = this._translateWindow?.hideForCapture() || false;
            try {
                const area = await new SelectArea().selectAsync();
                if (!area || area.width < 2 || area.height < 2) {
                    this._translateWindow?.restoreAfterCancelledCapture(panelWasVisible);
                    return;
                }

                this._x = area.x + area.width / 2;
                this._y = area.y + area.height / 2;

                const stream = Gio.MemoryOutputStream.new_resizable();
                const screenshot = new Shell.Screenshot();
                await screenshot.screenshot_area(
                    area.x, area.y, area.width, area.height, stream);
                stream.close(null);

                this._translateWindow?.showRecognitionLoading(this._x, this._y);
                this._visionRequestActive = true;
                this._visionRecognizer.recognize(stream.steal_as_bytes());
            } catch (error) {
                this._visionRequestActive = false;
                if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    this._translateWindow?.restoreAfterCancelledCapture(panelWasVisible);
                } else {
                    const message = error.message || String(error);
                    const [x, y] = global.get_pointer();
                    this._translateWindow?.showRecognitionLoading(x, y);
                    notify(IndicatorName, message);
                    this._translateWindow?.showTranslationError(message);
                }
            }
        }

        _onVisionCompleted(recognizer, text) {
            if (!this._visionRequestActive)
                return;
            this._visionRequestActive = false;
            const recognizedText = text.trim();
            if (!recognizedText) {
                this._onVisionError(recognizer, _('No text was recognized in the screenshot.'));
                return;
            }
            this._oldtext = recognizedText;
            this._translateWindow?.showLoading(this._x, this._y, recognizedText);
            this._translate(recognizedText);
        }

        _onVisionError(recognizer, error) {
            this._visionRequestActive = false;
            const message = _('Screenshot recognition failed: ') +
                (error?.message || String(error));
            notify(IndicatorName, message);
            this._translateWindow?.showTranslationError(message);
        }

        _translateSelected() {
            let [x, y, mods] = global.get_pointer();
            [this._x, this._y] = [x, y];
            this._clipboard.get_text(St.ClipboardType.PRIMARY,
                (clipboard, text) => {
                    if (text && text != '' &&
                        text[0] != '/' &&
                        !Util.findUrls(text).length &&
                        !RegExp(/^[\.\s\d\-]+$/).exec(text)) {
                        this._oldtext = text;
                        if (this._translateWindow) {
                            this._translateWindow.showLoading(this._x, this._y, text);
                        }
                        this._translate(text);
                    } else {
                        if (this._translateWindow && this._translateWindow._actor) {
                            this._translateWindow._close();
                        }
                    }
                });
        }

        _watchClipboard() {
            this._selection = global.display.get_selection();
            this._clipboard = St.Clipboard.get_default();
            this._ownerChangedId = this._selection.connect('owner-changed',
                (selection, selectionType) => {
                    if (selectionType !== Meta.SelectionType.SELECTION_PRIMARY)
                        return;
                    if (this._enabled) {
                        let [x, y, mods] = global.get_pointer();
                        let buttonMask = Clutter.ModifierType.BUTTON1_MASK |
                            Clutter.ModifierType.BUTTON2_MASK |
                            Clutter.ModifierType.BUTTON3_MASK |
                            Clutter.ModifierType.SHIFT_MASK |
                            Clutter.ModifierType.CONTROL_MASK |
                            Clutter.ModifierType.SUPER_MASK;
                        if (buttonMask & mods)
                            return;
                        this._clipboardChanged();
                    }
                }
            );
        }

        _clipboardChanged() {
            [this._x, this._y] = global.get_pointer();
            this._clipboard.get_text(St.ClipboardType.PRIMARY,
                (clipboard, text) => {
                    if (text === this._oldtext)
                        return;
                    if (text && text != '' &&
                        text[0] != '/' &&
                        //RegExp(/\S+/).exec(text) &&
                        !Util.findUrls(text).length &&
                        !RegExp(/^[\.\s\d\-]+$/).exec(text)) {
                        this._oldtext = text;
                        if (this._translateWindow) {
                            this._translateWindow.showLoading(this._x, this._y, text);
                        }
                        this._translate(text);
                    } else {
                        if (this._translateWindow && this._translateWindow._actor) {
                            this._translateWindow._close();
                        }
                    }
                });
        }

        _onCompleted(emitter, result) {
            if (!this._activeRequest)
                return;

            let request = this._activeRequest;
            let summary;
            try {
                summary = this._engine === 'Google'
                    ? this._extractGoogleSummary(result)
                    : { translatedText: result, detectedLanguage: null };
            } catch (error) {
                this._onTranslationError(emitter, error.message || String(error));
                return;
            }

            if (request.kind === 'primary' &&
                this._engine === 'Google' &&
                request.sourceLanguage === null &&
                summary.detectedLanguage &&
                summary.detectedLanguage === request.targetLanguage &&
                this._toSecondary &&
                this._toSecondary !== request.targetLanguage &&
                !request.retargeted) {
                request.sourceLanguage = summary.detectedLanguage;
                request.targetLanguage = this._toSecondary;
                request.retargeted = true;
                this._translator.translate(
                    request.sourceLanguage,
                    request.targetLanguage,
                    this._proxy,
                    request.originalText);
                return;
            }

            if (request.kind === 'check') {
                this._activeRequest = null;
                this._translateWindow?.showCheckResult(
                    summary.translatedText,
                    request.targetLanguage);
                return;
            }

            request.sourceLanguage = request.sourceLanguage || summary.detectedLanguage;
            request.mainText = summary.translatedText;
            request.rawResult = result;
            request.checkTargetLanguage = this._getCheckTargetLanguage(request);
            this._primaryContext = request;
            this._activeRequest = null;

            this._translateWindow?.showResult(result, this._x, this._y, request);
            if (this._settings.get_boolean(Fields.CHECK_ENABLED) &&
                request.checkTargetLanguage)
                this._translateCheck();
        }

        _extractGoogleSummary(result) {
            let json = JSON.parse(result);
            if (!json?.[0] || !Array.isArray(json[0]))
                throw new Error(_('Invalid translation result format.'));

            let translatedText = json[0]
                .filter(item => Array.isArray(item) && item[0])
                .map(item => item[0].replace(/\n/g, ''))
                .join('\n');
            if (!translatedText)
                throw new Error(_('No translation result.'));

            return {
                translatedText,
                detectedLanguage: json[2] || null
            };
        }

        _getCheckTargetLanguage(context) {
            if (context.sourceLanguage && context.sourceLanguage !== 'auto')
                return context.sourceLanguage;
            if (context.targetLanguage === this._toPrimary && this._toSecondary)
                return this._toSecondary;
            if (context.targetLanguage === this._toSecondary && this._toPrimary)
                return this._toPrimary;
            return null;
        }

        _translateCheck() {
            let context = this._primaryContext;
            if (!context?.mainText || !context.checkTargetLanguage)
                return;

            this._activeRequest = {
                kind: 'check',
                originalText: context.mainText,
                sourceLanguage: context.targetLanguage || 'auto',
                targetLanguage: context.checkTargetLanguage
            };
            this._translateWindow?.showCheckLoading();
            this._translator.translate(
                this._activeRequest.sourceLanguage,
                this._activeRequest.targetLanguage,
                this._proxy,
                this._activeRequest.originalText);
        }

        _onTranslationError(emitter, error) {
            let message = error?.message || String(error);
            if (this._activeRequest?.kind === 'check')
                this._translateWindow?.showCheckError(message);
            else {
                notify(IndicatorName, message);
                this._translateWindow?.showTranslationError(message);
            }
            this._activeRequest = null;
        }

        _getLocale() {
            this.locale = GLib.get_language_names()[0];

            if (this.locale == 'C')
                this.locale = 'en';
            this.locale = this.locale.replace('_', '-');
            return this.locale;
        }

        _getCode(lang) {
            let isoLangs = Languages.isoLangs;
            lang = lang.replace('_', '-');
            let code = isoLangs[lang];
            if (code == undefined) {
                let codes = [lang, lang.split('-')[0]];
                for (let [i, c] of codes.entries()) {
                    let l = Object.keys(isoLangs).find(key =>
                      (key.startsWith(c) ||
                        isoLangs[key].name.startsWith(c) ||
                        isoLangs[key].nativeName.startsWith(c)));
                    if (l != undefined)
                        return l;
                }
                return 'en';
            }
            else {
                return lang;
            }
        }

        _isRtl(code) {
            var rtlCodes = ['ar', 'he', 'ps', 'fa', 'sd', 'ur', 'yi', 'ug'];
            return rtlCodes.indexOf(code) != -1;
        }

        _createLanguageSelector(field, label, defaultValue) {
            let isoLangs = Languages.isoLangs;
            let currentValue = this._settings.get_string(field) || defaultValue;

            let subMenu = new PopupMenu.PopupSubMenuMenuItem(label);
            this.menu.addMenuItem(subMenu);

            let subMenuItem = subMenu.actor;

            let valueLabel = new St.Label({
                text: '',
                x_align: Clutter.ActorAlign.START,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'tc-language-value'
            });

            subMenuItem.insert_child_at_index(valueLabel, subMenuItem.get_n_children() - 1);

            let menuItems = {};

            if (field === Fields.FROM || field === Fields.TO_PRIMARY) {
                let autoItem = new PopupMenu.PopupMenuItem(_("Auto"));
                autoItem.connect('activate', () => {
                    this._settings.set_string(field, 'auto');
                    this._updateLanguageSelectorValue(valueLabel, 'auto');
                    this._updateMenuSelection(menuItems, 'auto');
                    subMenu.menu.close();
                });
                subMenu.menu.addMenuItem(autoItem);
                menuItems['auto'] = autoItem;
            }

            if (field === Fields.TO_SECONDARY) {
                let noneItem = new PopupMenu.PopupMenuItem(_("None"));
                noneItem.connect('activate', () => {
                    this._settings.set_string(field, '');
                    this._updateLanguageSelectorValue(valueLabel, '');
                    this._updateMenuSelection(menuItems, '');
                    subMenu.menu.close();
                });
                subMenu.menu.addMenuItem(noneItem);
                menuItems[''] = noneItem;
            }

            if (field === Fields.FROM || field === Fields.TO_PRIMARY || field === Fields.TO_SECONDARY) {
                subMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            let langKeys = Object.keys(isoLangs).sort((a, b) => {
                let nameA = isoLangs[a].name.toLowerCase();
                let nameB = isoLangs[b].name.toLowerCase();
                return nameA.localeCompare(nameB);
            });

            for (let langCode of langKeys) {
                let lang = isoLangs[langCode];
                let displayName = `${lang.nativeName} (${langCode})`;
                let langItem = new PopupMenu.PopupMenuItem(displayName);
                langItem.connect('activate', () => {
                    this._settings.set_string(field, langCode);
                    this._updateLanguageSelectorValue(valueLabel, langCode);
                    this._updateMenuSelection(menuItems, langCode);
                    subMenu.menu.close();
                });
                subMenu.menu.addMenuItem(langItem);
                menuItems[langCode] = langItem;
            }

            subMenu._valueLabel = valueLabel;
            this._updateLanguageSelectorValue(valueLabel, currentValue);
            this._updateMenuSelection(menuItems, currentValue);
            return subMenu;
        }

        _updateMenuSelection (menuItems, selectedValue) {
            // The selector label already shows the active value. Keeping this
            // method as a no-op avoids expensive ornament updates on long menus.
        }

        _updateLanguageSelectorValue(valueLabel, value) {
            let displayValue = '';
            if (value === '' || value === null) {
                displayValue = _("None");
            } else if (value === 'auto') {
                displayValue = _("Auto");
            } else {
                let isoLangs = Languages.isoLangs;
                let lang = isoLangs[value];
                if (lang) {
                    displayValue = lang.name;
                } else {
                    displayValue = value;
                }
            }

            valueLabel.text = displayValue;
        }

        _translate(text) {
            let from = this._settings.get_string(Fields.FROM) || 'auto';
            let targetLanguage = this._toPrimary || this._toSecondary ||
                this._settings.get_string(Fields.TO) || this._locale;

            this._primaryContext = null;
            this._activeRequest = {
                kind: 'primary',
                originalText: text,
                sourceLanguage: from === 'auto' ? null : this._getCode(from),
                targetLanguage,
                retargeted: false
            };
            this._translator.translate(from, targetLanguage, this._proxy, text);
        }
    });

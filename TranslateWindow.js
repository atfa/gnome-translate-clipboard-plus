import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {notify} from 'resource:///org/gnome/shell/ui/main.js';

const IndicatorName = 'Translate Clipboard';
const PANEL_WIDTH = 400;
const PANEL_MARGIN = 12;

export const TranslateWindow = GObject.registerClass(
    class TranslateWindow extends GObject.Object {
        _init(params) {
            super._init();

            this._extension = params.extension;
            this._tts = params.tts;
            this._engine = params.engine || 'Google';
            this._briefMode = params.briefMode || false;
            this._dump = params.dump !== undefined ? params.dump : true;
            this._autoClose = params.autoClose !== undefined ? params.autoClose : true;
            this._autoHideMode = params.autoHideMode || 'timeout';
            this._locale = params.locale || 'en';
            this._settings = params.settings;
            this._translateCallback = params.translateCallback;
            this._checkCallback = params.checkCallback;
            this._isRtl = params.isRtl;

            this._actor = null;
            this._scroll = null;
            this._contentBox = null;
            this._searchEntry = null;
            this._checkButton = null;
            this._pinButton = null;
            this._pinIcon = null;
            this._resultBox = null;
            this._checkSection = null;
            this._loadingLabel = null;
            this._loadingAnimationId = 0;
            this._clickHandlerId = null;
            this._popupTimeoutId = 0;
            this._resultContext = null;
            this._monitorIndex = 0;
            this._pinned = this._settings.get_boolean('panel-pinned');
        }

        destroy() {
            this._removeClickHandler();
            this._clearTimeouts();
            this._actor?.destroy();
            this._actor = null;
        }

        hideForCapture() {
            const wasVisible = Boolean(this._actor?.visible);
            this._removeClickHandler();
            this._actor?.hide();
            return wasVisible;
        }

        restoreAfterCancelledCapture(wasVisible) {
            if (!wasVisible || !this._actor)
                return;
            this._actor.show();
            this._updateHideBehavior();
        }

        showLoading(x, y, text) {
            this._showLoading(x, y, text, _('Translating ...'));
        }

        showRecognitionLoading(x, y) {
            this._showLoading(x, y, '', _('Recognizing screenshot text ...'));
        }

        _showLoading(x, y, text, message) {
            if (!this._actor)
                this._createWindow();

            this._searchEntry.set_text(text || '');

            this._resultContext = null;
            this._clearResultContent();
            this._setButtonEnabled(this._checkButton, false);

            this._loadingLabel = this._createWrappedLabel(
                message, 'tc-loading-text');
            this._loadingMessage = message.replace(/\.*$/, '').trim();
            this._loadingLabel.x_align = Clutter.ActorAlign.CENTER;
            this._contentBox.add_child(this._loadingLabel);
            this._startLoadingAnimation();

            this._placeForShow(x, y);
            this._actor.show();
            this._updateHideBehavior();
        }

        showResult(result, x, y, context) {
            if (!this._actor)
                this._createWindow();

            this._clearResultContent();
            this._resultContext = context;
            this._parseResult(result, context);
            this._setButtonEnabled(
                this._checkButton,
                Boolean(context.mainText && context.checkTargetLanguage));

            if (!this._actor.visible)
                this._placeForShow(x, y);
            this._actor.show();
            this._refreshGeometry();
            this._clampCurrentPosition();
            this._updateHideBehavior();
        }

        showCheckLoading() {
            if (!this._resultBox)
                return;
            this._removeCheckSection();
            this._checkSection = this._createResultSection(
                _('Check result'), _('Checking ...'), null, false, false);
            this._resultBox.add_child(this._checkSection);
            this._setButtonEnabled(this._checkButton, false);
            this._refreshGeometry();
        }

        showCheckResult(text, languageCode) {
            if (!this._resultBox || !this._resultContext)
                return;
            this._removeCheckSection();
            this._checkSection = this._createResultSection(
                _('Check result'), text, languageCode, this._engine !== 'Google');
            this._resultBox.add_child(this._checkSection);
            this._setButtonEnabled(this._checkButton, true);
            this._refreshGeometry();
            this._clampCurrentPosition();
            this._updateHideBehavior();
        }

        showCheckError(message) {
            if (!this._resultBox)
                return;
            this._removeCheckSection();
            this._checkSection = this._createResultSection(
                _('Check result'), _('Check failed: ') + message, null, false, false,
                'tc-check-error');
            this._resultBox.add_child(this._checkSection);
            this._setButtonEnabled(this._checkButton, true);
            this._refreshGeometry();
            this._updateHideBehavior();
        }

        showTranslationError(message) {
            if (!this._actor)
                return;
            this._clearResultContent();
            this._resultBox = new St.BoxLayout({
                vertical: true,
                style_class: 'tc-result-box'
            });
            this._contentBox.add_child(this._resultBox);
            this._resultBox.add_child(this._createResultSection(
                _('Error'), message, null, false, false, 'tc-check-error'));
            this._setButtonEnabled(this._checkButton, false);
            this._refreshGeometry();
            this._updateHideBehavior();
        }

        updateSettings(params) {
            if (params.engine !== undefined)
                this._engine = params.engine;
            if (params.briefMode !== undefined)
                this._briefMode = params.briefMode;
            if (params.dump !== undefined)
                this._dump = params.dump;
            if (params.autoClose !== undefined)
                this._autoClose = params.autoClose;
            if (params.autoHideMode !== undefined)
                this._autoHideMode = params.autoHideMode;
            if (params.locale !== undefined)
                this._locale = params.locale;

            if (this._actor?.visible)
                this._updateHideBehavior();
        }

        _createWindow() {
            this._actor = new St.BoxLayout({
                style_class: 'translate-window',
                vertical: true,
                reactive: true,
                visible: false,
                width: PANEL_WIDTH
            });

            let toolbar = new St.BoxLayout({
                style_class: 'tc-toolbar',
                x_expand: true
            });
            let dragHandle = new St.Label({
                text: _('Translate Clipboard'),
                style_class: 'tc-toolbar-title',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                reactive: true
            });
            toolbar.add_child(dragHandle);

            this._checkButton = this._createToolButton(
                'object-flip-horizontal-symbolic', _('Check translation'),
                () => this._checkCallback?.());
            this._pinButton = this._createToolButton(
                'view-pin-symbolic', _('Pin panel'), () => this._togglePinned());
            this._pinIcon = this._pinButton.child;
            let closeButton = this._createToolButton(
                'window-close-symbolic', _('Close'), () => this._close());

            toolbar.add_child(this._checkButton);
            toolbar.add_child(this._pinButton);
            toolbar.add_child(closeButton);
            this._actor.add_child(toolbar);

            this._dragGesture = new Clutter.PanGesture({
                min_n_points: 1,
                max_n_points: 1,
                required_button: 1
            });
            dragHandle.add_action(this._dragGesture);
            this._dragGesture.connect('pan-update', gesture => {
                    let delta = gesture.get_delta_abs();
                    let [currentX, currentY] = this._actor.get_position();
                    this._moveTo(
                        currentX + delta.get_x(),
                        currentY + delta.get_y());
                });
            this._dragGesture.connect('end', () => {
                if (this._pinned)
                    this._savePosition();
            });

            this._scroll = new St.ScrollView({
                style_class: 'translate-scroll',
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC,
                x_expand: true
            });
            this._actor.add_child(this._scroll);

            this._contentBox = new St.BoxLayout({
                style_class: 'translate-box',
                vertical: true,
                x_expand: true
            });
            this._scroll.set_child(this._contentBox);

            let searchBox = new St.BoxLayout({style_class: 'tc-search-box'});
            this._searchEntry = new St.Entry({
                hint_text: _('Enter the text to query ...'),
                style_class: 'tc-search-entry',
                x_expand: true
            });
            this._searchEntry.set_primary_icon(new St.Icon({
                gicon: Gio.icon_new_for_string(
                    `${this._extension.path}/icons/translator-symbolic.svg`),
                style_class: 'popup-menu-icon'
            }));
            this._searchEntry.set_secondary_icon(new St.Icon({
                gicon: Gio.icon_new_for_string(`${this._extension.path}/icons/search.svg`),
                style_class: 'popup-menu-icon'
            }));
            this._searchEntry.connect('primary-icon-clicked', () => this._onSearchTranslate());
            this._searchEntry.connect('secondary-icon-clicked', () => this._onSearchTranslate());
            this._searchEntry.clutter_text.connect('activate', () => this._onSearchTranslate());
            searchBox.add_child(this._searchEntry);
            this._contentBox.add_child(searchBox);

            this._updatePinAppearance();
            this._setButtonEnabled(this._checkButton, false);
            Main.layoutManager.addChrome(this._actor);
        }

        _createToolButton(iconName, accessibleName, callback) {
            let button = new St.Button({
                style_class: 'tc-tool-button',
                child: new St.Icon({icon_name: iconName, icon_size: 16}),
                reactive: true,
                can_focus: true,
                accessible_name: accessibleName
            });
            button.connect('clicked', callback);
            return button;
        }

        _setButtonEnabled(button, enabled) {
            if (!button)
                return;
            button.reactive = enabled;
            button.can_focus = enabled;
            button.opacity = enabled ? 255 : 96;
        }

        _copyText(text) {
            if (!text)
                return;
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
            notify(IndicatorName, _('Text copied to clipboard.'));
        }

        _togglePinned() {
            this._pinned = !this._pinned;
            this._settings.set_boolean('panel-pinned', this._pinned);
            if (this._pinned)
                this._savePosition();
            this._updatePinAppearance();
            this._updateHideBehavior();
        }

        _updatePinAppearance() {
            if (!this._pinIcon)
                return;
            this._pinIcon.icon_name = 'view-pin-symbolic';
            if (this._pinned)
                this._pinButton.add_style_pseudo_class('checked');
            else
                this._pinButton.remove_style_pseudo_class('checked');
        }

        _savePosition() {
            if (!this._actor)
                return;
            let [x, y] = this._actor.get_position();
            this._settings.set_int('panel-x', Math.round(x));
            this._settings.set_int('panel-y', Math.round(y));
            this._settings.set_int('panel-monitor', this._monitorIndex);
        }

        _placeForShow(triggerX, triggerY) {
            let triggerMonitor = this._findMonitorForPoint(triggerX, triggerY);
            if (this._pinned) {
                let savedMonitor = this._settings.get_int('panel-monitor');
                this._monitorIndex = this._validMonitorIndex(savedMonitor)
                    ? savedMonitor
                    : triggerMonitor;
                this._refreshGeometry();
                this._moveTo(
                    this._settings.get_int('panel-x'),
                    this._settings.get_int('panel-y'));
                return;
            }

            this._monitorIndex = triggerMonitor;
            this._refreshGeometry();
            let workArea = this._getWorkArea(this._monitorIndex);
            this._actor.set_position(
                workArea.x + workArea.width - PANEL_WIDTH - PANEL_MARGIN,
                workArea.y + PANEL_MARGIN);
        }

        _refreshGeometry() {
            if (!this._actor || !this._scroll)
                return;
            let workArea = this._getWorkArea(this._monitorIndex);
            let toolbarHeight = 44;
            let maxScrollHeight = Math.max(160,
                workArea.height - toolbarHeight - PANEL_MARGIN * 2);
            this._actor.set_width(PANEL_WIDTH);
            this._scroll.set_style(`max-height: ${maxScrollHeight}px;`);
        }

        _moveTo(x, y) {
            let monitorIndex = this._findMonitorForPoint(
                x + PANEL_WIDTH / 2, y + 24, this._monitorIndex);
            this._monitorIndex = monitorIndex;
            this._refreshGeometry();
            let workArea = this._getWorkArea(monitorIndex);
            let height = this._actor.get_height() || 160;
            let maxX = workArea.x + workArea.width - PANEL_WIDTH;
            let maxY = workArea.y + workArea.height - Math.min(height, workArea.height);
            this._actor.set_position(
                Math.max(workArea.x, Math.min(Math.round(x), maxX)),
                Math.max(workArea.y, Math.min(Math.round(y), maxY)));
        }

        _clampCurrentPosition() {
            if (!this._actor)
                return;
            let [x, y] = this._actor.get_position();
            this._moveTo(x, y);
        }

        _findMonitorForPoint(x, y, fallback = 0) {
            let monitors = Main.layoutManager.monitors;
            let index = monitors.findIndex(monitor =>
                x >= monitor.x && x < monitor.x + monitor.width &&
                y >= monitor.y && y < monitor.y + monitor.height);
            if (index >= 0)
                return index;
            return this._validMonitorIndex(fallback) ? fallback : 0;
        }

        _validMonitorIndex(index) {
            return index >= 0 && index < Main.layoutManager.monitors.length;
        }

        _getWorkArea(index) {
            let validIndex = this._validMonitorIndex(index) ? index : 0;
            return Main.layoutManager.getWorkAreaForMonitor(validIndex);
        }

        _clearResultContent() {
            this._clearTimeouts();
            this._loadingLabel?.destroy();
            this._loadingLabel = null;
            this._resultBox?.destroy();
            this._resultBox = null;
            this._checkSection = null;
        }

        _clearTimeouts() {
            if (this._loadingAnimationId) {
                GLib.source_remove(this._loadingAnimationId);
                this._loadingAnimationId = 0;
            }
            if (this._popupTimeoutId) {
                GLib.source_remove(this._popupTimeoutId);
                this._popupTimeoutId = 0;
            }
        }

        _startLoadingAnimation() {
            let dotCount = 0;
            this._loadingAnimationId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 500, () => {
                    if (!this._loadingLabel?.get_parent()) {
                        this._loadingAnimationId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    dotCount = (dotCount + 1) % 4;
                    this._loadingLabel.text = this._loadingMessage + '.'.repeat(dotCount);
                    return GLib.SOURCE_CONTINUE;
                });
            GLib.Source.set_name_by_id(
                this._loadingAnimationId,
                '[gnome-shell] TranslateWindow.loadingAnimation');
        }

        _close() {
            this._removeClickHandler();
            this._clearResultContent();
            this._resultContext = null;
            this._actor?.hide();
        }

        _updateHideBehavior() {
            this._removeClickHandler();
            if (this._popupTimeoutId) {
                GLib.source_remove(this._popupTimeoutId);
                this._popupTimeoutId = 0;
            }
            if (this._pinned || !this._actor?.visible)
                return;

            if (this._autoHideMode === 'click' || this._autoHideMode === 'both')
                this._setupClickHandler();
            if (this._autoClose &&
                (this._autoHideMode === 'timeout' || this._autoHideMode === 'both'))
                this._updatePopupTimeout(5000);
        }

        _isPointerInsideWindow() {
            if (!this._actor?.visible)
                return false;
            let [x, y] = global.get_pointer();
            let [actorX, actorY] = this._actor.get_transformed_position();
            let [width, height] = this._actor.get_transformed_size();
            return x > actorX && y > actorY && x < actorX + width && y < actorY + height;
        }

        _updatePopupTimeout(timeout) {
            if (this._popupTimeoutId)
                GLib.source_remove(this._popupTimeoutId);
            this._popupTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, timeout, () => {
                    if (this._isPointerInsideWindow()) {
                        this._popupTimeoutId = 0;
                        this._updatePopupTimeout(1000);
                        return GLib.SOURCE_REMOVE;
                    }
                    this._popupTimeoutId = 0;
                    this._close();
                    return GLib.SOURCE_REMOVE;
                });
        }

        _setupClickHandler() {
            if (!this._clickHandlerId) {
                this._clickHandlerId = global.display.connect(
                    'focus-window', () => {
                        if (!this._pinned && !this._isPointerInsideWindow())
                            this._close();
                    });
            }
        }

        _removeClickHandler() {
            if (this._clickHandlerId) {
                global.display.disconnect(this._clickHandlerId);
                this._clickHandlerId = null;
            }
        }

        _createWrappedLabel(text, styleClass, useMarkup = false) {
            let label = new St.Label({
                text: useMarkup ? '' : text,
                style_class: styleClass,
                x_expand: true,
                y_align: Clutter.ActorAlign.START
            });
            label.clutter_text.set_line_wrap(true);
            label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            if (useMarkup)
                label.clutter_text.set_markup(this._md2pango(text));
            return label;
        }

        _createCopyButton(text) {
            let button = new St.Button({
                style_class: 'tc-result-action-button',
                child: new St.Icon({
                    icon_name: 'edit-copy-symbolic',
                    icon_size: 16
                }),
                x_expand: false,
                y_expand: false,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                accessible_name: _('Copy text')
            });
            button.connect('clicked', () => this._copyText(text));
            return button;
        }

        _createPlayButton(text) {
            let button = new St.Button({
                style_class: 'tc-result-action-button',
                child: new St.Icon({
                    gicon: Gio.icon_new_for_string(`${this._extension.path}/icons/play.svg`),
                    style_class: 'popup-menu-icon',
                    icon_size: 16
                }),
                x_expand: false,
                y_expand: false,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                accessible_name: _('Play audio')
            });
            button.connect('clicked', () => this._tts.playAudio(text));
            return button;
        }

        _createResultSection(title, text, languageCode, useMarkup = false,
            showActions = true, extraClass = '', copyText = text) {
            let section = new St.BoxLayout({
                vertical: true,
                style_class: `tc-result-section ${extraClass}`.trim(),
                x_expand: true
            });
            section.add_child(this._createWrappedLabel(title, 'tc-result-heading'));

            let label = this._createWrappedLabel(text, 'tc-title-label', useMarkup);
            if (languageCode && this._isRtl(languageCode))
                label.add_style_pseudo_class('rtl');
            section.add_child(label);

            if (showActions && text) {
                let actions = new St.BoxLayout({
                    style_class: 'tc-result-actions',
                    x_align: Clutter.ActorAlign.END,
                    x_expand: false,
                    y_expand: false
                });
                actions.add_child(this._createCopyButton(copyText));
                actions.add_child(this._createPlayButton(text));
                section.add_child(actions);
            }
            return section;
        }

        _removeCheckSection() {
            this._checkSection?.destroy();
            this._checkSection = null;
        }

        _parseResult(result, context) {
            this._resultBox = new St.BoxLayout({
                vertical: true,
                style_class: 'tc-result-box',
                x_expand: true
            });
            this._contentBox.add_child(this._resultBox);

            try {
                let json = null;
                let sourcePhonetic = null;
                let targetPhonetic = null;
                if (this._engine === 'Google') {
                    json = JSON.parse(result);
                    sourcePhonetic = json?.[0]?.[1]?.[3] || null;
                    targetPhonetic = json?.[0]?.[1]?.[2] || null;
                }

                let originalDisplay = context.originalText +
                    (sourcePhonetic ? `\n/${sourcePhonetic}/` : '');
                let translationDisplay = context.mainText +
                    (targetPhonetic ? `\n(${targetPhonetic})` : '');

                this._resultBox.add_child(this._createResultSection(
                    _('Original'), originalDisplay, context.sourceLanguage,
                    false, true, '', context.originalText));
                this._resultBox.add_child(this._createResultSection(
                    _('Translation'), translationDisplay, context.targetLanguage,
                    this._engine !== 'Google', true, '', context.mainText));

                if (this._engine === 'Google' && !this._briefMode)
                    this._appendGoogleDetails(json, context);
            } catch (error) {
                console.error(`Translate Clipboard: ${error.message}\n${error.stack}`);
                notify(IndicatorName, _('Translation result could not be displayed.'));
                this._resultBox.add_child(this._createResultSection(
                    _('Error'), error.message || String(error), null, false, false,
                    'tc-check-error'));
            }
        }

        _appendGoogleDetails(json, context) {
            let details = json?.[1];
            if (!Array.isArray(details))
                return;

            for (let part of details) {
                if (!part)
                    continue;
                this._resultBox.add_child(this._createWrappedLabel(
                    part[0] || '', 'tc-section-label'));
                let examples = Array.isArray(part[2]) ? part[2] : [];
                for (let example of examples) {
                    if (!Array.isArray(example))
                        continue;
                    let original = example[0] || '';
                    let translations = Array.isArray(example[1])
                        ? example[1].join(', ')
                        : '';
                    let text = `${original} : ${translations}`;
                    let label = this._createWrappedLabel(text, 'tc-normal-label');
                    if (this._isRtl(context.targetLanguage))
                        label.add_style_pseudo_class('rtl');
                    this._resultBox.add_child(label);
                }
            }
        }

        _md2pango(origin) {
            if (!origin || typeof origin !== 'string')
                return origin;
            let result = origin
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            result = result.replace(/^### (.*)$/gm, '<b>$1</b>');
            result = result.replace(/^## (.*)$/gm, '<big><b>$1</b></big>');
            result = result.replace(/^# (.*)$/gm, '<span size="large"><b>$1</b></span>');
            result = result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            result = result.replace(/__(.*?)__/g, '<b>$1</b>');
            result = result.replace(/\*(.*?)\*/g, '<i>$1</i>');
            return result;
        }

        _onSearchTranslate() {
            let text = this._searchEntry.text.trim();
            if (!text)
                return;
            let [x, y] = global.get_pointer();
            this.showLoading(x, y, text);
            this._translateCallback?.(text);
        }
    });

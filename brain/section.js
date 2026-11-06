(() => {
  // node_modules/@openchamber/sdk/dist/api-version.js
  var OPENCHAMBER_SDK_CHANNEL = "openchamber.sdk";
  var OPENCHAMBER_SDK_API_VERSION = 1;

  // node_modules/@openchamber/sdk/dist/scrollbar-style.js
  var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
  var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
  function installGuestScrollbarActivity(doc) {
    const root = doc.documentElement;
    if (root.hasAttribute("data-oc-scrollbar-activity"))
      return;
    root.setAttribute("data-oc-scrollbar-activity", "");
    const timers = /* @__PURE__ */ new WeakMap();
    doc.addEventListener("scroll", (event) => {
      const target = event.target === doc ? root : event.target;
      if (!(target instanceof Element))
        return;
      if (!target.hasAttribute("data-oc-scrolling"))
        target.setAttribute("data-oc-scrolling", "");
      const pending = timers.get(target);
      if (pending !== void 0)
        clearTimeout(pending);
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        target.removeAttribute("data-oc-scrolling");
      }, 1e3));
    }, { capture: true, passive: true });
  }
  var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;

  // node_modules/@openchamber/sdk/dist/workspace.js
  var GUEST_STORAGE_KEY_MAX = 128;
  var GUEST_STORAGE_VALUE_BYTES = 65536;

  // node_modules/@openchamber/sdk/dist/shells.js
  var GUEST_SHELL_ID_MAX = 128;
  var GUEST_SHELL_OUTPUT_TAIL_MAX = 65536;

  // node_modules/@openchamber/sdk/dist/status-controls.js
  var GUEST_STATUS_CONTROLS_MAX = 4;
  var GUEST_STATUS_CONTROL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  var GUEST_STATUS_CONTROL_LABEL_MAX = 60;
  var GUEST_STATUS_CONTROL_OPTIONS_MAX = 16;
  var GUEST_STATUS_CONTROL_VALUE_MAX = 80;
  var isControlObject = (value) => Object(value) === value && !Array.isArray(value);
  var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
  var isLabel = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_LABEL_MAX;
  var isValue = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_VALUE_MAX;
  var isGuestStatusControls = (controls) => {
    if (!Array.isArray(controls) || controls.length > GUEST_STATUS_CONTROLS_MAX)
      return false;
    const ids = /* @__PURE__ */ new Set();
    for (const control of controls) {
      if (!isControlObject(control) || !GUEST_STATUS_CONTROL_ID.test(control.id) || !isLabel(control.label))
        return false;
      if (control.disabled !== void 0 && control.disabled !== true && control.disabled !== false)
        return false;
      if (ids.has(control.id))
        return false;
      ids.add(control.id);
      if (control.kind === "button") {
        if (!hasOnlyKeys(control, ["kind", "id", "label", "disabled"]))
          return false;
        continue;
      }
      if (control.kind !== "select" || !hasOnlyKeys(control, ["kind", "id", "label", "value", "options", "disabled"]))
        return false;
      if (!isValue(control.value) || !Array.isArray(control.options) || control.options.length < 1 || control.options.length > GUEST_STATUS_CONTROL_OPTIONS_MAX)
        return false;
      const values = /* @__PURE__ */ new Set();
      for (const option of control.options) {
        if (!isControlObject(option) || !hasOnlyKeys(option, ["value", "label"]) || !isValue(option.value) || !isLabel(option.label) || values.has(option.value))
          return false;
        values.add(option.value);
      }
      if (!values.has(control.value))
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/manifest.js
  var TRACKER_URL_TOKENS = ["{id}", "{segment}", "{segments+}"];
  var TRACKER_URL_TOKEN_SET = new Set(TRACKER_URL_TOKENS);

  // node_modules/@openchamber/sdk/dist/session-events.js
  var GUEST_SESSION_EVENT_TYPES = ["turn-finished", "turn-failed", "permission-asked", "question-asked"];
  var SESSION_EVENTS_IDLE_MS = 10 * 6e4;
  var EVENT_TYPES = new Set(GUEST_SESSION_EVENT_TYPES);

  // node_modules/@openchamber/sdk/dist/file-editor.js
  var GUEST_FILE_EDITOR_CONTENT_MAX = 2e7;
  var GUEST_FILE_EDITOR_VERSION_MAX = 256;
  var fileEditorPayloadSize = (value) => "bytes" in value ? value.bytes.byteLength : value.content.length;
  var sameFileEditorDocument = (left, right) => {
    if (left.path !== right.path || left.readOnly !== right.readOnly)
      return false;
    if (left.encoding === "text" || right.encoding === "text") {
      return left.encoding === "text" && right.encoding === "text" && left.content === right.content;
    }
    if (left.bytes.byteLength !== right.bytes.byteLength)
      return false;
    for (let index = 0; index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index])
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/popover.js
  var GUEST_POPOVER_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var GUEST_POPOVER_COORDINATE_MAX = 1e5;
  var GUEST_POPOVER_WIDTH_MIN = 160;
  var GUEST_POPOVER_WIDTH_MAX = 640;
  var GUEST_POPOVER_HEIGHT_MIN = 48;
  var GUEST_POPOVER_HEIGHT_MAX = 480;
  var GUEST_POPOVER_DATA_MAX = 16e3;
  var GUEST_POPOVER_DATA_DEPTH_MAX = 32;
  var GUEST_POPOVER_SIDES = ["left", "right", "top", "bottom"];
  var hasBoundedJsonTree = (value, depth = 0, budget = { remaining: GUEST_POPOVER_DATA_MAX }) => {
    if (--budget.remaining < 0 || depth >= GUEST_POPOVER_DATA_DEPTH_MAX)
      return false;
    if (value === null)
      return true;
    const children = Array.isArray(value) ? value : Object(value) === value ? Object.values(value) : [];
    for (const item of children) {
      if (!hasBoundedJsonTree(item, depth + 1, budget))
        return false;
    }
    return true;
  };
  var isFiniteJson = (value) => {
    if (value === null || value === true || value === false)
      return true;
    if (Array.isArray(value))
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) && value.every(isFiniteJson);
    if (Object(value) === value) {
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype) && Object.values(value).every(isFiniteJson);
    }
    return String(value) === value || Number.isFinite(value);
  };
  var isGuestPopoverRequest = (request) => {
    try {
      if (String(request.id) !== request.id || !GUEST_POPOVER_ID.test(request.id) || !Number.isFinite(request.anchor.x) || Math.abs(request.anchor.x) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.y) || Math.abs(request.anchor.y) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.width) || !Number.isFinite(request.anchor.height) || request.anchor.width <= 0 || request.anchor.height <= 0 || request.anchor.width > GUEST_POPOVER_COORDINATE_MAX || request.anchor.height > GUEST_POPOVER_COORDINATE_MAX || !Number.isInteger(request.width) || request.width < GUEST_POPOVER_WIDTH_MIN || request.width > GUEST_POPOVER_WIDTH_MAX || !Number.isInteger(request.height) || request.height < GUEST_POPOVER_HEIGHT_MIN || request.height > GUEST_POPOVER_HEIGHT_MAX || request.side !== void 0 && !GUEST_POPOVER_SIDES.includes(request.side) || request.focus !== void 0 && request.focus !== true && request.focus !== false || !hasBoundedJsonTree(request.data) || !isFiniteJson(request.data))
        return false;
      return JSON.stringify(request.data).length <= GUEST_POPOVER_DATA_MAX;
    } catch {
      return false;
    }
  };

  // node_modules/@openchamber/sdk/dist/contract.js
  var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
  var isStartSessionResult = (value) => Boolean(value && "sessionId" in value);
  var isPromptResult = (value) => Boolean(value && "sent" in value && !("sessionId" in value));
  var GUEST_COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
  var isGuestCommitSha = (value) => GUEST_COMMIT_SHA.test(value);
  var GUEST_TOAST_MAX = 500;
  var GUEST_CLIPBOARD_TEXT_MAX = 32e3;
  var GUEST_COMPOSE_TEXT_MAX = 16e3;
  var GUEST_ATTACH_ID_MAX = 128;
  var GUEST_ATTACH_TITLE_MAX = 200;
  var GUEST_ATTACH_URL_MAX = 2e3;
  var GUEST_ATTACH_TEXT_MAX = 16e3;
  var GUEST_ATTACH_AUTHOR_MAX = 80;
  var GUEST_ATTACH_BRANCH_MAX = 200;
  var GUEST_ATTACH_DATA_MAX = 16e3;
  var GUEST_REQUEST_PATH_MAX = 2e3;
  var GUEST_REQUEST_TIMEOUT_MS = 2e4;
  var GUEST_FILE_PATH_MAX = 1024;
  var GUEST_FILE_CONTENT_MAX = 2e6;
  var GUEST_GENERATE_PROMPT_MAX = 64e3;
  var GUEST_GENERATE_SYSTEM_MAX = 8e3;
  var GUEST_GENERATE_OUTPUT_TOKENS_MAX = 4e3;
  var GUEST_GENERATE_TIMEOUT_MS = 96e4;
  var GUEST_GENERATE_LATE_KEEP_MS = 60 * 6e4;
  var GUEST_BADGE_MAX = 999;
  var GUEST_FRAME_HEIGHT_MAX = 1e4;
  var GUEST_RESOLVE_ERROR_MAX = 500;
  var HOST_REQUEST_ERROR_CODES = [
    "HOST_UNAVAILABLE",
    "HOST_TIMEOUT",
    "HOST_REJECTED",
    "DISCONNECTED",
    "DISABLED",
    "BAD_PATH",
    "NO_INTEGRATION",
    "NO_SERVICE",
    "SERVICE_FAILED",
    "REQUEST_FAILED",
    "RESPONSE_TOO_LARGE",
    "NO_SESSION",
    "SESSION_BUSY",
    "NOT_GRANTED",
    "NO_DIRECTORY",
    "NOT_FOUND",
    "FILE_TOO_LARGE",
    "DENIED",
    "NO_MODEL",
    "MODEL_FAILED",
    "UNSUPPORTED"
  ];
  var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
  var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
  var isHostRequestErrorCode = (value) => hostRequestErrorCodeSet.has(value);
  var resolveHostRequestErrorCode = (value) => value && isHostRequestErrorCode(value) ? value : "HOST_REJECTED";
  var isJsonValue = (value) => {
    if (value === void 0)
      return false;
    if (value === null || value === true || value === false)
      return true;
    if (String(value) === value)
      return true;
    if (Number(value) === value)
      return Number.isFinite(value);
    if (Array.isArray(value))
      return value.every(isJsonValue);
    if (Object(value) === value)
      return Object.values(value).every(isJsonValue);
    return false;
  };
  var isAttachData = (value) => isJsonValue(value) && JSON.stringify(value).length <= GUEST_ATTACH_DATA_MAX;
  var clampBranch = (value) => value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? "";
  var clampAttachRequest = (request) => {
    const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
    const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
    const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
    const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
    const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
    const kind = request.kind === "pull" ? "pull" : "issue";
    const next = {
      providerId: request.providerId.trim(),
      id,
      title: title || id,
      url,
      kind
    };
    if (text) {
      next.text = text;
    }
    if (author) {
      next.author = author;
    }
    if (kind === "pull") {
      const head = clampBranch(request.branches?.head);
      const base = clampBranch(request.branches?.base);
      if (head && base) {
        next.branches = { head, base };
      }
    }
    if (isAttachData(request.data)) {
      next.data = request.data;
    }
    return next;
  };
  var clampStartSessionRequest = (request) => {
    const next = clampAttachRequest(request);
    if (request.projectId)
      next.projectId = request.projectId;
    if (request.navigation)
      next.navigation = request.navigation;
    if (request.worktree) {
      next.worktree = request.worktree;
    }
    return next;
  };
  var clampPromptRequest = (request) => {
    const next = {
      text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX)
    };
    if (request.send) {
      next.send = true;
    }
    return next;
  };
  var clampBadgeCount = (count) => {
    if (count === null || !Number.isFinite(count))
      return null;
    return Math.min(GUEST_BADGE_MAX, Math.max(0, Math.round(count)));
  };
  var clampFrameHeight = (height) => {
    if (!Number.isFinite(height))
      return 0;
    return Math.min(GUEST_FRAME_HEIGHT_MAX, Math.max(0, Math.ceil(height)));
  };
  var isGuestFilePath = (value) => value.length > 0 && value.length <= GUEST_FILE_PATH_MAX && !value.includes("\0") && !value.includes("\\");
  var isGuestRequestPath = (value) => {
    if (!value.startsWith("/") || value.includes("\0") || value.includes("\\") || value.includes("://")) {
      return false;
    }
    if (value.length > GUEST_REQUEST_PATH_MAX) {
      return false;
    }
    const segments = value.split("/");
    return !segments.some((segment) => segment === "." || segment === "..");
  };
  var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
  var isServiceStatusResult = (value) => Boolean(value && "status" in value && serviceStatusSet.has(String(value.status)) && !("body" in value));
  var isGuestRequestResult = (value) => Boolean(value && "status" in value && "body" in value && Number.isInteger(value.status));
  var isFileReadResult = (value) => Boolean(value && "content" in value && String(value.content) === value.content);
  var isFileWriteResult = (value) => Boolean(value && "written" in value && value.written === true);
  var isFileListResult = (value) => Boolean(value && "entries" in value && Array.isArray(value.entries));
  var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
  var isFileStatResult = (value) => Boolean(value && "kind" in value && "size" in value && fileStatKindSet.has(String(value.kind)) && Number.isFinite(value.size));
  var isGenerateResult = (value) => Boolean(value && "text" in value && String(value.text) === value.text && !("status" in value));
  var HOST_PUSH_TYPES = /* @__PURE__ */ new Set([
    "workspace",
    "shells",
    "ready",
    "directory",
    "session",
    "connection",
    "settings",
    "session-lifecycle",
    "item",
    "resolve",
    "action",
    "status-control-event",
    "popover-closed",
    "file-open",
    "file-snapshot",
    "file-saved",
    "generate-late"
  ]);
  var asWireRecord = (data) => Object(data) === data ? data : null;
  var isNonEmptyString = (value) => String(value) === value && value.length > 0;
  var readResultMessage = (wire) => {
    if (!isNonEmptyString(wire.id))
      return null;
    if (wire.ok === true) {
      const message = {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: true
      };
      if (Object(wire.payload) === wire.payload) {
        message.payload = wire.payload;
      }
      return message;
    }
    if (wire.ok === false && isNonEmptyString(wire.error)) {
      return {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: false,
        error: wire.error,
        code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : void 0)
      };
    }
    return null;
  };
  var readHostMessage = (data) => {
    const wire = asWireRecord(data);
    if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION)
      return null;
    if (wire.type === "result")
      return readResultMessage(wire);
    if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload)
      return null;
    return wire;
  };

  // node_modules/@openchamber/sdk/dist/host.js
  var isKeyEvent = (event) => "key" in event && "metaKey" in event && "ctrlKey" in event;
  var isSaveShortcut = (event) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
  var HostRequestError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "HostRequestError";
      this.code = code;
    }
  };
  var rejectBadPath = () => Promise.reject(new HostRequestError("BAD_PATH", 'Request path must start with "/" and stay on the declared origin.'));
  var rejectBadFilePath = () => Promise.reject(new HostRequestError("BAD_PATH", `File path must be 1 to ${GUEST_FILE_PATH_MAX} characters without NUL or backslash.`));
  var deviceStorageScope = (options) => {
    if (options === void 0)
      return void 0;
    if (Object(options) !== options || Array.isArray(options) || options.scope !== void 0 && options.scope !== "instance" && options.scope !== "device") {
      throw new HostRequestError("HOST_REJECTED", 'Storage scope must be "instance" or "device".');
    }
    return options.scope === "device" ? "device" : void 0;
  };
  var nextId = (n) => {
    n.value += 1;
    return `oc-${n.value}`;
  };
  var connectHost = (options = {}) => {
    const target = options.target ?? ("window" in globalThis ? window : null);
    if (!target) {
      throw new HostRequestError("HOST_UNAVAILABLE", "No window. connectHost runs in a browser frame.");
    }
    const acceptSource = options.acceptSource ?? ((source) => source === target.parent);
    const requestTimeoutMs = options.requestTimeoutMs ?? GUEST_REQUEST_TIMEOUT_MS;
    const readyListeners = /* @__PURE__ */ new Set();
    const directoryListeners = /* @__PURE__ */ new Set();
    const sessionListeners = /* @__PURE__ */ new Set();
    const lifecycleListeners = /* @__PURE__ */ new Set();
    const connectionListeners = /* @__PURE__ */ new Set();
    const settingsListeners = /* @__PURE__ */ new Set();
    const itemListeners = /* @__PURE__ */ new Set();
    const statusControlListeners = /* @__PURE__ */ new Set();
    const popoverClosedListeners = /* @__PURE__ */ new Set();
    const lateGenerateListeners = /* @__PURE__ */ new Set();
    const unclaimedLateGenerate = [];
    let resolveHandler = null;
    let actionHandler = null;
    const fileOpenListeners = /* @__PURE__ */ new Set();
    const fileSavedListeners = /* @__PURE__ */ new Set();
    let fileSnapshotHandler = null;
    let lastFile = null;
    let saveShortcutInstalled = false;
    const pending = /* @__PURE__ */ new Map();
    const workspaceListeners = /* @__PURE__ */ new Map();
    const shellsListeners = /* @__PURE__ */ new Map();
    let disposed = false;
    const ids = { value: 0 };
    let lastReady = null;
    let lastLifecycle = null;
    let popoverPointerActive = false;
    let popoverFocusActive = false;
    let popoverActivityReported = null;
    const lifecycleFromSession = (session) => {
      if (!session)
        return null;
      return {
        sessionId: session.id,
        phase: session.busy ? "started" : "completed"
      };
    };
    const post = (message) => {
      target.parent.postMessage(message, "*");
    };
    const listenForLateGenerate = () => {
      if (disposed || target.parent === target || lateGenerateListeners.size === 0 || lastReady?.features?.lateGenerateResults !== true)
        return;
      post({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: "generate-late-listen" });
    };
    const emit = (listeners, value) => {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    };
    const onMessage = (event) => {
      if (!(event instanceof MessageEvent))
        return;
      if (!acceptSource(event.source))
        return;
      const message = readHostMessage(event.data);
      if (!message)
        return;
      if (message.type === "workspace") {
        const listener = workspaceListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "shells") {
        const listener = shellsListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "ready") {
        lastReady = message.payload;
        lastLifecycle = lifecycleFromSession(message.payload.session);
        emit(readyListeners, message.payload);
        emit(directoryListeners, message.payload.directory);
        emit(sessionListeners, message.payload.session);
        if (lastLifecycle) {
          emit(lifecycleListeners, lastLifecycle);
        }
        emit(connectionListeners, message.payload.connection);
        emit(settingsListeners, message.payload.settings);
        emit(itemListeners, message.payload.item);
        listenForLateGenerate();
        return;
      }
      if (message.type === "generate-late") {
        if (lateGenerateListeners.size === 0)
          unclaimedLateGenerate.push(message.payload);
        else
          emit(lateGenerateListeners, message.payload);
        return;
      }
      if (message.type === "directory") {
        if (lastReady) {
          lastReady = { ...lastReady, directory: message.payload.directory };
        }
        emit(directoryListeners, message.payload.directory);
        return;
      }
      if (message.type === "session") {
        if (lastReady) {
          lastReady = { ...lastReady, session: message.payload.session };
        }
        if (!message.payload.session) {
          lastLifecycle = null;
        } else if (lastLifecycle?.sessionId !== message.payload.session.id) {
          lastLifecycle = lifecycleFromSession(message.payload.session);
        }
        emit(sessionListeners, message.payload.session);
        return;
      }
      if (message.type === "session-lifecycle") {
        lastLifecycle = message.payload;
        emit(lifecycleListeners, message.payload);
        return;
      }
      if (message.type === "connection") {
        if (lastReady) {
          lastReady = { ...lastReady, connection: message.payload.connection };
        }
        emit(connectionListeners, message.payload.connection);
        return;
      }
      if (message.type === "settings") {
        if (lastReady) {
          lastReady = { ...lastReady, settings: message.payload.settings };
        }
        emit(settingsListeners, message.payload.settings);
        return;
      }
      if (message.type === "item") {
        if (lastReady) {
          lastReady = { ...lastReady, item: message.payload.item };
        }
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "status-control-event") {
        emit(statusControlListeners, message.payload);
        return;
      }
      if (message.type === "popover-closed") {
        emit(popoverClosedListeners, message.payload);
        return;
      }
      if (message.type === "action") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "action-result",
              id: message.id,
              payload
            });
        };
        const handler = actionHandler;
        if (!handler) {
          answer({ ok: false, error: "This extension does not handle background actions." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then(() => answer({ ok: true }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ ok: false, error: (text || "Action failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      if (message.type === "file-open") {
        const next = message.payload;
        if (lastFile && sameFileEditorDocument(lastFile, next))
          return;
        lastFile = next;
        emit(fileOpenListeners, message.payload);
        return;
      }
      if (message.type === "file-saved") {
        emit(fileSavedListeners, message.payload.version);
        return;
      }
      if (message.type === "file-snapshot") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "file-snapshot-result",
              id: message.id,
              payload
            });
        };
        const fail = (text) => answer({ error: (text.trim() || "Could not read the edited file.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        const handler = fileSnapshotHandler;
        if (!handler) {
          fail("This extension does not edit files.");
          return;
        }
        Promise.resolve().then(() => handler(message.payload.purpose)).then((snapshot) => {
          if (fileEditorPayloadSize(snapshot) > GUEST_FILE_EDITOR_CONTENT_MAX) {
            fail(`The file is over ${GUEST_FILE_EDITOR_CONTENT_MAX} ${"bytes" in snapshot ? "bytes" : "characters"}.`);
            return;
          }
          if (snapshot.version.length > GUEST_FILE_EDITOR_VERSION_MAX) {
            fail(`The snapshot version is over ${GUEST_FILE_EDITOR_VERSION_MAX} characters.`);
            return;
          }
          answer({ snapshot: "bytes" in snapshot ? { bytes: snapshot.bytes, version: snapshot.version } : { content: snapshot.content, version: snapshot.version } });
        }, (error) => fail(error instanceof Error ? error.message : String(error)));
        return;
      }
      if (message.type === "resolve") {
        const answer = (payload) => {
          post({
            channel: OPENCHAMBER_SDK_CHANNEL,
            v: OPENCHAMBER_SDK_API_VERSION,
            type: "resolve-result",
            id: message.id,
            payload
          });
        };
        const handler = resolveHandler;
        if (!handler) {
          answer({ error: "This extension does not resolve commands." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then((item) => answer({ item: item ? clampAttachRequest(item) : null }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ error: (text || "Command failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter)
        return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.payload);
        return;
      }
      waiter.reject(new HostRequestError(message.code, message.error));
    };
    target.addEventListener("message", onMessage);
    post({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: "hello"
    });
    const send = (message, timeoutMs = requestTimeoutMs) => {
      if (disposed || target.parent === target) {
        return Promise.reject(new HostRequestError("HOST_UNAVAILABLE", "No host frame. This page is not in an iframe."));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new HostRequestError("HOST_TIMEOUT", "Host did not answer in time."));
        }, timeoutMs);
        pending.set(message.id, { resolve, reject, timer });
        post(message);
      });
    };
    const request = (message) => send(message).then(() => void 0);
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION };
    const notify = (message) => {
      if (!disposed && target.parent !== target)
        post(message);
    };
    const requestFileSave = () => notify({ ...envelope, type: "file-save" });
    const onSaveShortcut = (event) => {
      if (!isKeyEvent(event) || !isSaveShortcut(event))
        return;
      event.preventDefault();
      requestFileSave();
    };
    const onPopoverEscape = (event) => {
      if (!isKeyEvent(event) || event.key !== "Escape" || lastReady?.surface !== "popover" || !lastReady.popover)
        return;
      event.preventDefault();
      void closePopover(lastReady.popover.id, "escape").catch(() => void 0);
    };
    const reportPopoverActivity = () => {
      const popover = lastReady?.surface === "popover" ? lastReady.popover : void 0;
      if (!popover)
        return;
      const active2 = popoverPointerActive || popoverFocusActive;
      if (popoverActivityReported === active2)
        return;
      popoverActivityReported = active2;
      void setPopoverAnchorActive(popover.id, active2).catch(() => void 0);
    };
    const onPopoverPointerOver = () => {
      if (lastReady?.surface !== "popover" || popoverPointerActive)
        return;
      popoverPointerActive = true;
      reportPopoverActivity();
    };
    const onPopoverPointerOut = (event) => {
      if (lastReady?.surface !== "popover" || event.relatedTarget !== null || !popoverPointerActive)
        return;
      popoverPointerActive = false;
      reportPopoverActivity();
    };
    const onPopoverFocus = () => {
      if (lastReady?.surface !== "popover" || popoverFocusActive)
        return;
      popoverFocusActive = true;
      reportPopoverActivity();
    };
    const onPopoverBlur = () => {
      if (lastReady?.surface !== "popover" || !popoverFocusActive)
        return;
      popoverFocusActive = false;
      reportPopoverActivity();
    };
    const requireIdentity = (value, maximum = 1024) => {
      if (!value.trim() || value.length > maximum)
        throw new HostRequestError("HOST_REJECTED", `Identity must contain 1 to ${maximum} characters.`);
    };
    const readWorkspace = async (query) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const result = await send({ ...envelope, type: "workspace-read", id: nextId(ids), payload: query });
      if (!result || !("kind" in result) || !("state" in result) || result.kind !== query.kind) {
        throw new HostRequestError("HOST_REJECTED", "Host did not return workspace data.");
      }
      return result;
    };
    const subscribeWorkspace = async (query, listener) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const subscriptionId = nextId(ids);
      workspaceListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "workspace-subscribe", id: nextId(ids), payload: { subscriptionId, query } });
      } catch (error) {
        workspaceListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!workspaceListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const subscribeShells = async (scope, listener) => {
      if (scope.kind === "session")
        requireIdentity(scope.sessionId);
      if (scope.kind === "project")
        requireIdentity(scope.projectId);
      const subscriptionId = nextId(ids);
      shellsListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "shells-subscribe", id: nextId(ids), payload: { subscriptionId, scope } });
      } catch (error) {
        shellsListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!shellsListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const storage = async (payload) => {
      if ("key" in payload && (payload.key.length === 0 || payload.key.length > GUEST_STORAGE_KEY_MAX)) {
        throw new HostRequestError("HOST_REJECTED", "Storage key must contain 1 to 128 characters.");
      }
      if (payload.op === "set" && !isJsonValue(payload.value)) {
        throw new HostRequestError("HOST_REJECTED", "Storage values must be JSON.");
      }
      if (payload.op === "set" && new TextEncoder().encode(JSON.stringify(payload.value)).length > GUEST_STORAGE_VALUE_BYTES) {
        throw new HostRequestError("HOST_REJECTED", "Storage value exceeds 64 KiB.");
      }
      if (payload.scope === "device" && lastReady?.features?.deviceStorage !== true) {
        throw new HostRequestError("UNSUPPORTED", "This host does not support device storage.");
      }
      const result = await send({ ...envelope, type: "storage", id: nextId(ids), payload });
      if (!result || !("storage" in result) || result.op !== payload.op)
        throw new HostRequestError("HOST_REJECTED", "Host did not return storage data.");
      return result;
    };
    const closePopover = (id, reason) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-close", id: nextId(ids), payload: reason ? { id, reason } : { id } });
    const setPopoverAnchorActive = (id, active2) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-anchor", id: nextId(ids), payload: { id, active: active2 } });
    target.addEventListener("keydown", onPopoverEscape, true);
    target.addEventListener("pointerover", onPopoverPointerOver);
    target.addEventListener("pointermove", onPopoverPointerOver);
    target.addEventListener("pointerout", onPopoverPointerOut);
    target.addEventListener("focus", onPopoverFocus);
    target.addEventListener("blur", onPopoverBlur);
    return {
      onAction: (handler) => {
        actionHandler = handler;
        return () => {
          if (actionHandler === handler)
            actionHandler = null;
        };
      },
      listProjects: async () => {
        const result = await readWorkspace({ kind: "projects" });
        if (result.kind !== "projects")
          throw new HostRequestError("HOST_REJECTED", "Expected projects.");
        return result;
      },
      listWorktrees: async (projectId) => {
        const result = await readWorkspace({ kind: "worktrees", projectId });
        if (result.kind !== "worktrees")
          throw new HostRequestError("HOST_REJECTED", "Expected worktrees.");
        return result;
      },
      listSessions: async (projectId) => {
        const result = await readWorkspace({ kind: "sessions", projectId });
        if (result.kind !== "sessions")
          throw new HostRequestError("HOST_REJECTED", "Expected sessions.");
        return result;
      },
      onProjects: (listener) => subscribeWorkspace({ kind: "projects" }, (snapshot) => {
        if (snapshot.kind === "projects")
          listener(snapshot);
      }),
      onWorktrees: (projectId, listener) => subscribeWorkspace({ kind: "worktrees", projectId }, (snapshot) => {
        if (snapshot.kind === "worktrees")
          listener(snapshot);
      }),
      onSessions: (projectId, listener) => subscribeWorkspace({ kind: "sessions", projectId }, (snapshot) => {
        if (snapshot.kind === "sessions")
          listener(snapshot);
      }),
      onRunningShells: (scope, listener) => subscribeShells(scope, listener),
      readShellOutput: async (shellId, options2) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const cursor = options2?.cursor;
        if (cursor !== void 0 && (!Number.isInteger(cursor) || cursor < 0)) {
          throw new HostRequestError("HOST_REJECTED", "Shell output cursor must be a non-negative integer.");
        }
        const tailBytes = options2?.tailBytes;
        if (tailBytes !== void 0 && (!Number.isInteger(tailBytes) || tailBytes < 1 || tailBytes > GUEST_SHELL_OUTPUT_TAIL_MAX)) {
          throw new HostRequestError("HOST_REJECTED", `Shell output tailBytes must be an integer between 1 and ${GUEST_SHELL_OUTPUT_TAIL_MAX}.`);
        }
        const result = await send({ ...envelope, type: "shell-output", id: nextId(ids), payload: { shellId, cursor, tailBytes } });
        const output = result;
        if (!output || typeof output.output !== "string" || !Number.isFinite(output.cursor)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return shell output.");
        }
        return output;
      },
      stopShell: async (shellId) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const result = await send({ ...envelope, type: "shell-stop", id: nextId(ids), payload: { shellId } });
        if (result?.stopped !== true)
          throw new HostRequestError("HOST_REJECTED", "Host did not stop the shell.");
        return { stopped: true };
      },
      openSession: async (sessionId) => {
        requireIdentity(sessionId);
        await request({ ...envelope, type: "open-session", id: nextId(ids), payload: { sessionId } });
      },
      storage: {
        get: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "get", key };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          return result.op === "get" && result.found ? result.value : void 0;
        },
        set: async (key, value, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "set", key, value };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        delete: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "delete", key };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        keys: async (options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "keys" };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          if (result.op !== "keys")
            throw new HostRequestError("HOST_REJECTED", "Expected storage keys.");
          return result.keys;
        }
      },
      onReady: (listener) => {
        readyListeners.add(listener);
        if (lastReady)
          listener(lastReady);
        return () => {
          readyListeners.delete(listener);
        };
      },
      onDirectory: (listener) => {
        directoryListeners.add(listener);
        if (lastReady)
          listener(lastReady.directory);
        return () => {
          directoryListeners.delete(listener);
        };
      },
      onSession: (listener) => {
        sessionListeners.add(listener);
        if (lastReady)
          listener(lastReady.session);
        return () => {
          sessionListeners.delete(listener);
        };
      },
      onSessionLifecycle: (listener) => {
        lifecycleListeners.add(listener);
        if (lastLifecycle)
          listener(lastLifecycle);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onConnection: (listener) => {
        connectionListeners.add(listener);
        if (lastReady)
          listener(lastReady.connection);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      onSettings: (listener) => {
        settingsListeners.add(listener);
        if (lastReady)
          listener(lastReady.settings);
        return () => {
          settingsListeners.delete(listener);
        };
      },
      onItem: (listener) => {
        itemListeners.add(listener);
        if (lastReady)
          listener(lastReady.item);
        return () => {
          itemListeners.delete(listener);
        };
      },
      onStatusControl: (listener) => {
        statusControlListeners.add(listener);
        return () => {
          statusControlListeners.delete(listener);
        };
      },
      onPopoverClosed: (listener) => {
        popoverClosedListeners.add(listener);
        return () => {
          popoverClosedListeners.delete(listener);
        };
      },
      setStatusControls: (controls) => {
        if (lastReady?.features?.statusControls !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support status controls."));
        }
        if (!isGuestStatusControls(controls)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Status controls must have unique bounded ids and valid selected options."));
        }
        return request({ ...envelope, type: "status-controls", id: nextId(ids), payload: { controls } });
      },
      openPopover: (payload) => {
        if (lastReady?.features?.popovers !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers."));
        }
        if (!isGuestPopoverRequest(payload)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Popover requests need bounded geometry and JSON data."));
        }
        return request({ ...envelope, type: "popover-open", id: nextId(ids), payload });
      },
      closePopover,
      setPopoverAnchorActive,
      onResolve: (handler) => {
        resolveHandler = handler;
        return () => {
          if (resolveHandler === handler)
            resolveHandler = null;
        };
      },
      toast: (payload) => {
        const message = payload.message.trim();
        if (!message || message.length > GUEST_TOAST_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast message must contain 1 to ${GUEST_TOAST_MAX} characters.`));
        }
        if (payload.copy && payload.copy !== true && (!payload.copy.text.length || payload.copy.text.length > GUEST_CLIPBOARD_TEXT_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast copy text must contain 1 to ${GUEST_CLIPBOARD_TEXT_MAX} characters.`));
        }
        return request({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "toast",
          id: nextId(ids),
          payload: { ...payload, message }
        });
      },
      openUrl: (url) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-url",
        id: nextId(ids),
        payload: { url }
      }),
      openCommit: (sha) => isGuestCommitSha(sha) ? request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-commit",
        id: nextId(ids),
        payload: { sha }
      }) : Promise.reject(new HostRequestError("HOST_REJECTED", "Commit id must be 7 to 64 hex characters.")),
      openSurface: (surfaceId) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-surface",
        id: nextId(ids),
        payload: { surfaceId }
      }),
      writeClipboard: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "clipboard-write",
        id: nextId(ids),
        payload: { text }
      }),
      compose: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "compose",
        id: nextId(ids),
        payload
      }),
      attach: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "attach",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      startSession: async (payload) => {
        if (payload.projectId !== void 0)
          requireIdentity(payload.projectId);
        const worktree = payload.worktree;
        if (worktree && worktree !== true) {
          if (worktree.kind === "existing")
            requireIdentity(worktree.directory);
          else {
            if (worktree.name !== void 0)
              requireIdentity(worktree.name, 200);
            if (worktree.baseBranch !== void 0)
              requireIdentity(worktree.baseBranch, 200);
          }
        }
        const result = await send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "start-session",
          id: nextId(ids),
          payload: clampStartSessionRequest(payload)
        }, options.requestTimeoutMs ?? 18e4);
        if (!isStartSessionResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a session.");
        }
        return result;
      },
      prompt: (payload) => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "prompt",
        id: nextId(ids),
        payload: clampPromptRequest(payload)
      }).then((result) => {
        if (!isPromptResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a prompt result.");
        }
        return result;
      }),
      sessionLink: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "session-link",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      close: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "close",
        id: nextId(ids)
      }),
      oauthStart: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-start",
        id: nextId(ids)
      }),
      oauthDisconnect: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-disconnect",
        id: nextId(ids)
      }),
      request: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host request result was empty.");
        }
        return result;
      }),
      serviceRequest: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host service request result was empty.");
        }
        return result;
      }),
      serviceStatus: () => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-status",
        id: nextId(ids)
      }).then((result) => {
        if (!isServiceStatusResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return service status.");
        }
        return result;
      }),
      readFile: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-read",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileReadResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file content.");
        }
        return result;
      }),
      writeFile: (path, content) => {
        if (!isGuestFilePath(path)) {
          return rejectBadFilePath();
        }
        if (content.length > GUEST_FILE_CONTENT_MAX) {
          return Promise.reject(new HostRequestError("FILE_TOO_LARGE", `Content is over ${GUEST_FILE_CONTENT_MAX} characters.`));
        }
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "file-write",
          id: nextId(ids),
          payload: { path, content }
        }).then((result) => {
          if (!isFileWriteResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not confirm the write.");
          }
          return result;
        });
      },
      listDir: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-list",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileListResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return directory entries.");
        }
        return result;
      }),
      stat: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-stat",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileStatResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file status.");
        }
        return result;
      }),
      generate: (input) => {
        const prompt = input.prompt.trim();
        const system = input.system?.trim();
        if (prompt.length === 0 || prompt.length > GUEST_GENERATE_PROMPT_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Prompt must be 1 to ${GUEST_GENERATE_PROMPT_MAX} characters.`));
        }
        if (system !== void 0 && (system.length === 0 || system.length > GUEST_GENERATE_SYSTEM_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `System prompt must be 1 to ${GUEST_GENERATE_SYSTEM_MAX} characters.`));
        }
        const maxOutputTokens = input.maxOutputTokens === void 0 ? void 0 : Math.min(GUEST_GENERATE_OUTPUT_TOKENS_MAX, Math.max(1, Math.floor(input.maxOutputTokens)));
        if (maxOutputTokens !== void 0 && !Number.isFinite(maxOutputTokens)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "maxOutputTokens must be a number."));
        }
        const payload = { prompt };
        if (system !== void 0)
          payload.system = system;
        if (maxOutputTokens !== void 0)
          payload.maxOutputTokens = maxOutputTokens;
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "generate",
          id: nextId(ids),
          payload
        }, options.requestTimeoutMs ?? GUEST_GENERATE_TIMEOUT_MS).then((result) => {
          if (!isGenerateResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not return generated text.");
          }
          return result;
        });
      },
      onLateGenerateResult: (listener) => {
        lateGenerateListeners.add(listener);
        for (const result of unclaimedLateGenerate.splice(0))
          emit([listener], result);
        listenForLateGenerate();
        return () => {
          lateGenerateListeners.delete(listener);
        };
      },
      setBadge: (count) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "badge",
        id: nextId(ids),
        payload: { count: clampBadgeCount(count) }
      }),
      setHeight: (height) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "resize",
        id: nextId(ids),
        payload: { height: clampFrameHeight(height) }
      }),
      onFileOpen: (listener) => {
        fileOpenListeners.add(listener);
        if (!saveShortcutInstalled) {
          saveShortcutInstalled = true;
          target.addEventListener("keydown", onSaveShortcut, true);
        }
        if (lastFile)
          listener(lastFile);
        return () => {
          fileOpenListeners.delete(listener);
        };
      },
      onFileSnapshot: (handler) => {
        fileSnapshotHandler = handler;
        return () => {
          if (fileSnapshotHandler === handler)
            fileSnapshotHandler = null;
        };
      },
      onFileSaved: (listener) => {
        fileSavedListeners.add(listener);
        return () => {
          fileSavedListeners.delete(listener);
        };
      },
      reportFileChange: (change) => notify({ ...envelope, type: "file-change", payload: { dirty: change.dirty, edited: change.edited } }),
      requestFileSave,
      reportFileUnsupported: () => notify({ ...envelope, type: "file-unsupported" }),
      dispose: () => {
        for (const subscriptionId of workspaceListeners.keys()) {
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        workspaceListeners.clear();
        for (const subscriptionId of shellsListeners.keys()) {
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        shellsListeners.clear();
        disposed = true;
        resolveHandler = null;
        actionHandler = null;
        fileSnapshotHandler = null;
        fileOpenListeners.clear();
        fileSavedListeners.clear();
        if (saveShortcutInstalled)
          target.removeEventListener("keydown", onSaveShortcut, true);
        target.removeEventListener("message", onMessage);
        target.removeEventListener("keydown", onPopoverEscape, true);
        target.removeEventListener("pointerover", onPopoverPointerOver);
        target.removeEventListener("pointermove", onPopoverPointerOver);
        target.removeEventListener("pointerout", onPopoverPointerOut);
        target.removeEventListener("focus", onPopoverFocus);
        target.removeEventListener("blur", onPopoverBlur);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new HostRequestError("HOST_UNAVAILABLE", "Host client was disposed."));
        }
        pending.clear();
        readyListeners.clear();
        directoryListeners.clear();
        sessionListeners.clear();
        lifecycleListeners.clear();
        connectionListeners.clear();
        settingsListeners.clear();
        itemListeners.clear();
        statusControlListeners.clear();
        popoverClosedListeners.clear();
        lateGenerateListeners.clear();
        unclaimedLateGenerate.length = 0;
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/service-providers.js
  var BROWSER_CONTROL_ACTIONS = [
    "browser.open",
    "browser.snapshot",
    "browser.click",
    "browser.type",
    "browser.select",
    "browser.scroll",
    "browser.back",
    "browser.forward",
    "browser.inspect",
    "browser.capture",
    "browser.resize",
    "browser.close"
  ];
  var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
  var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
  var SOURCE_CONTROL_PROVIDER_IDLE_MS = 10 * 6e4;
  var NOTIFICATIONS_PROVIDER_IDLE_MS = 10 * 6e4;
  var TRACKER_PROVIDER_IDLE_MS = 10 * 6e4;

  // node_modules/@openchamber/sdk/dist/service-surface.js
  var SURFACE_CONTROLLERS = ["none", "agent", "user"];
  var CONTROLLERS = new Set(SURFACE_CONTROLLERS);

  // node_modules/@openchamber/sdk/dist/ui/theme.js
  var TOKEN_VARS = [
    ["--oc-bg", "background"],
    ["--oc-elevated", "elevated"],
    ["--oc-fg", "foreground"],
    ["--oc-muted", "muted"],
    ["--oc-subtle", "subtle"],
    ["--oc-border", "border"],
    ["--oc-hover", "hover"],
    ["--oc-selection", "selection"],
    ["--oc-focus", "focus"],
    ["--oc-primary", "primary"],
    ["--oc-muted-surface", "mutedSurface"],
    ["--oc-elevated-fg", "elevatedForeground"],
    ["--oc-active", "active"],
    ["--oc-selection-fg", "selectionForeground"],
    ["--oc-primary-fg", "primaryForeground"],
    ["--oc-primary-text", "primaryText"],
    ["--oc-success-text", "successText"],
    ["--oc-warning-text", "warningText"],
    ["--oc-error-text", "errorText"],
    ["--oc-info-text", "infoText"],
    ["--oc-success", "success"],
    ["--oc-warning", "warning"],
    ["--oc-error", "error"],
    ["--oc-info", "info"],
    ["--oc-font", "font"],
    ["--oc-mono", "mono"],
    ["--oc-radius", "radius"],
    ["--surface-background", "background"],
    ["--surface-elevated", "elevated"],
    ["--surface-foreground", "foreground"],
    ["--surface-muted-foreground", "muted"],
    ["--surface-subtle", "subtle"],
    ["--interactive-border", "border"],
    ["--interactive-hover", "hover"],
    ["--interactive-selection", "selection"],
    ["--interactive-focus-ring", "focus"],
    ["--primary", "primary"],
    ["--surface-muted", "mutedSurface"],
    ["--surface-elevated-foreground", "elevatedForeground"],
    ["--interactive-active", "active"],
    ["--interactive-selection-foreground", "selectionForeground"],
    ["--primary-foreground", "primaryForeground"],
    ["--primary-text", "primaryText"],
    ["--success-text", "successText"],
    ["--warning-text", "warningText"],
    ["--error-text", "errorText"],
    ["--info-text", "infoText"],
    ["--status-success", "success"],
    ["--status-warning", "warning"],
    ["--status-error", "error"],
    ["--status-info", "info"],
    ["--font-sans", "font"],
    ["--font-mono", "mono"],
    ["--radius", "radius"]
  ];
  var SYNTAX_TOKEN_VARS = [
    ["--oc-syntax-keyword", "--syntax-keyword", "syntaxKeyword"],
    ["--oc-syntax-string", "--syntax-string", "syntaxString"],
    ["--oc-syntax-number", "--syntax-number", "syntaxNumber"],
    ["--oc-syntax-function", "--syntax-function", "syntaxFunction"],
    ["--oc-syntax-type", "--syntax-type", "syntaxType"],
    ["--oc-syntax-comment", "--syntax-comment", "syntaxComment"],
    ["--oc-syntax-variable", "--syntax-variable", "syntaxVariable"],
    ["--oc-syntax-operator", "--syntax-operator", "syntaxOperator"]
  ];
  var applyHostTheme = (theme, root) => {
    root.style.colorScheme = theme.mode;
    for (const [name, key] of TOKEN_VARS) {
      root.style.setProperty(name, theme.tokens[key]);
    }
    for (const [alias, hostName, key] of SYNTAX_TOKEN_VARS) {
      const value = theme.tokens[key] ?? "";
      root.style.setProperty(alias, value);
      root.style.setProperty(hostName, value);
    }
    root.style.setProperty("font-family", theme.tokens.font);
    root.style.setProperty("font-size", "0.875rem");
    root.style.setProperty("line-height", "1.45");
    root.style.setProperty("color", theme.tokens.foreground);
  };
  var applyHostReady = (ctx, root) => {
    applyHostTheme(ctx.theme, root);
    if (root.dataset) {
      root.dataset.ocSurface = ctx.surface;
      root.dataset.ocTheme = ctx.theme.mode;
    }
  };

  // node_modules/@openchamber/sdk/dist/ui/style.js
  var OC_ALIAS = {
    "surface-background": "bg",
    "surface-elevated": "elevated",
    "surface-elevated-foreground": "elevated-fg",
    "surface-foreground": "fg",
    "surface-muted-foreground": "muted",
    "surface-muted": "muted-surface",
    "surface-subtle": "subtle",
    "interactive-border": "border",
    "interactive-hover": "hover",
    "interactive-active": "active",
    "interactive-selection": "selection",
    "interactive-selection-foreground": "selection-fg",
    "interactive-focus-ring": "focus",
    "primary": "primary",
    "primary-foreground": "primary-fg",
    "primary-text": "primary-text",
    "success-text": "success-text",
    "warning-text": "warning-text",
    "error-text": "error-text",
    "info-text": "info-text",
    "status-success": "success",
    "status-warning": "warning",
    "status-error": "error",
    "status-info": "info",
    "font-sans": "font",
    "font-mono": "mono",
    "radius": "radius"
  };
  var v = (name, fallback) => `var(--${name}, var(--oc-${OC_ALIAS[name]}, ${fallback}))`;
  var bg = v("surface-background", "transparent");
  var elevated = v("surface-elevated", "transparent");
  var elevatedFg = v("surface-elevated-foreground", "inherit");
  var fg = v("surface-foreground", "inherit");
  var muted = v("surface-muted-foreground", "gray");
  var secondary = v("surface-muted", "transparent");
  var border = v("interactive-border", "currentColor");
  var hover = v("interactive-hover", "transparent");
  var active = v("interactive-active", "transparent");
  var selection = v("interactive-selection", "transparent");
  var selectionFg = v("interactive-selection-foreground", "inherit");
  var primary = v("primary", "currentColor");
  var primaryText = v("primary-text", "inherit");
  var errorText = v("error-text", "inherit");
  var font = v("font-sans", "inherit");
  var mono = v("font-mono", "monospace");
  var radius = v("radius", "9px");
  var controlRadius = `calc(${radius} - 2px)`;
  var smallRadius = `calc(${radius} - 4px)`;
  var mix = (color, pct, base = "transparent") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  var focusFill = `background-image: linear-gradient(${hover}, ${hover});`;
  var field = (edge, width = "0.5px") => `box-shadow: inset 0 0 0 ${width} ${edge}, var(--oc-sdk-field-lift);`;
  var raised = "border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);";
  var litButton = "box-shadow: var(--oc-sdk-lit);";
  var darkLift = `inset 0 0.5px 0 0 ${mix(fg, 8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`;
  var THEME_VARS = `
:root {
  --oc-sdk-edge: ${mix(fg, 16)};
  --oc-sdk-field-bg: ${elevated};
  --oc-sdk-raised-bg: ${bg};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${mix(fg, 14)};
  --oc-sdk-field-bg: ${mix(bg, 50, elevated)};
  --oc-sdk-raised-bg: ${elevated};
  --oc-sdk-field-lift: ${darkLift};
  --oc-sdk-raised-lift: ${darkLift};
  --oc-sdk-lit: ${darkLift};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`;
  var tone = (name) => {
    const color = v(`status-${name}`, "currentColor");
    return `
.oc-sdk[data-tone="${name}"], .oc-sdk [data-tone="${name}"] { --oc-sdk-tone: ${color}; --oc-sdk-tone-text: ${v(`${name}-text`, "inherit")}; }`;
  };
  var UI_SIZE_CSS = `
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: 2px; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`;
  var GUEST_UI_LOOK_CSS = `${THEME_VARS}
.oc-sdk { color: ${fg}; font-family: ${font}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${focusFill} }
.oc-sdk-mono { font-family: ${mono}; }
.oc-sdk-muted { color: ${muted}; }
${tone("success")}${tone("warning")}${tone("error")}${tone("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${primary}; --oc-sdk-tone-text: ${primaryText}; }

.oc-sdk-btn { border-radius: ${controlRadius}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${smallRadius}; }
.oc-sdk-btn[data-variant="default"] { color: ${primaryText}; background: ${mix(primary, 10, bg)}; border-color: ${mix(primary, 12)}; ${litButton} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${mix(primary, 16, bg)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${mix(primary, 22, bg)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${secondary}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${active}, ${active}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${hover}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${active}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error", "red")}; color: ${errorText}; background: ${mix("var(--oc-sdk-tone)", 7, bg)}; border-color: ${mix("var(--oc-sdk-tone)", 12)}; ${litButton} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${mix("var(--oc-sdk-tone)", 9, bg)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${mix("var(--oc-sdk-tone)", 11, bg)}; box-shadow: none; }

.oc-sdk-field-note { color: ${muted}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${errorText}; }
.oc-sdk-input { border-radius: ${controlRadius}; background: var(--oc-sdk-field-bg); color: ${elevatedFg}; ${field("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${muted}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${field(mix(fg, 26), "1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${field(v("status-error", "red"), "1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${mono}; }

.oc-sdk-search-icon { color: ${muted}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${primary}; }
.oc-sdk-search-clear { border-radius: ${smallRadius}; color: ${muted}; }
.oc-sdk-search-clear:hover { background: ${hover}; color: ${fg}; }

.oc-sdk-trigger { border-radius: ${controlRadius}; background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${muted}; }
.oc-sdk-trigger-chevron { color: ${muted}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${elevatedFg}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${elevated}; background-clip: padding-box; color: ${elevatedFg}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${hover}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-option-check { color: ${fg}; }
.oc-sdk-option[data-destructive="true"] { color: ${errorText}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${mix(v("status-error", "red"), 10)}; }
.oc-sdk-option-hint { color: ${muted}; }
.oc-sdk-popup-empty { color: ${muted}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${border}; border-radius: 4px; color: ${fg}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${mix(fg, 60, border)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${border}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${bg}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${primary}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${focusFill} }
.oc-sdk-check-desc { color: ${muted}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${mix(fg, 4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${muted}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${fg}; }
.oc-sdk-tab[aria-selected="true"] { color: ${selectionFg}; background: ${selection}; border-color: ${border}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${elevatedFg}; background: var(--oc-sdk-raised-bg); ${raised} }
.oc-sdk-tab-count { color: ${muted}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${mix(fg, 6)}; color: ${muted}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${mix("var(--oc-sdk-tone)", 15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${hover}; }
.oc-sdk-row[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-row-lead { font-family: ${mono}; color: ${muted}; }
.oc-sdk-row-sub { color: ${muted}; }
.oc-sdk-row-meta { color: ${muted}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${muted}; }

.oc-sdk-empty-body { color: ${muted}; }

.oc-sdk-spinner { color: ${muted}; }
.oc-sdk-spinner-ring { border-color: ${border}; border-top-color: ${primary}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${mix("var(--oc-sdk-tone)", 10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${muted}; }

.oc-sdk-separator { color: ${muted}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${mix(border, 40)}; }

.oc-sdk-progress-label { color: ${muted}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${mix(fg, 6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${primary}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${v("status-success", "currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${v("success-text", "inherit")}; }

.oc-sdk-text a { color: ${primaryText}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${mix(border, 60)}; }
`;
  var UI_CSS = `
${GUEST_SCROLLBAR_CSS}
${UI_SIZE_CSS}
${GUEST_UI_LOOK_CSS}`;

  // src/brainpane.js
  var createBrainPane = (host, root) => {
    const nodes = {
      project: root.querySelector("#project"),
      refresh: root.querySelector("#refresh"),
      error: root.querySelector("#error"),
      list: root.querySelector("#list"),
      actions: root.querySelector("#actions"),
      foot: root.querySelector("#foot")
    };
    const missing = Object.entries(nodes).filter(([, node]) => !node).map(([name]) => name);
    if (missing.length) {
      const fallback = nodes.list || root;
      fallback.textContent = `Brain pane markup is missing: ${missing.join(", ")}`;
      return;
    }
    const state = {
      vaultPath: "D:\\brain",
      baseFolder: "20-\u7B14\u8BB0/\u9879\u76EE",
      directory: null,
      vaultProjects: [],
      ocProjects: [],
      projectName: "",
      projectDirectory: "",
      ocProjectId: "",
      ocProjectName: "",
      bound: false,
      followHost: true,
      sessions: 0,
      tasks: [],
      selectedPath: "",
      busy: false,
      refreshing: false,
      rerun: false,
      ready: false,
      freshProject: "",
      freshOcProject: null,
      taskCreate: false,
      taskCreateFocus: false,
      notice: "",
      error: null,
      activity: "\u5C31\u7EEA\u3002"
    };
    const STATUSES = ["todo", "running", "blocked", "done"];
    const STATUS_LABEL = { todo: "\u5F85\u529E", running: "\u8FDB\u884C\u4E2D", blocked: "\u963B\u585E", done: "\u5DF2\u5B8C\u6210" };
    const STATUS_RANK = { running: 0, todo: 1, blocked: 2, done: 3 };
    const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const el2 = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== void 0) node.textContent = text;
      return node;
    };
    const messageOf = (error) => error instanceof Error ? error.message : String(error || "\u672A\u77E5\u9519\u8BEF");
    const basename = (value) => {
      const parts = String(value || "").trim().replace(/[\\/]+$/, "").split(/[\\/]/);
      return parts[parts.length - 1] || "";
    };
    const pathKey = (value) => String(value || "").trim().replace(/[\\/]+/g, "\\").replace(/\\+$/, "").toLowerCase();
    const stamp = () => {
      const now = /* @__PURE__ */ new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    };
    const api = async (path, body) => {
      const result = await host.serviceRequest({
        method: "POST",
        path,
        body: JSON.stringify(body ?? {})
      });
      let parsed = null;
      try {
        parsed = result.body ? JSON.parse(result.body) : null;
      } catch {
      }
      if (result.status < 200 || result.status >= 300) {
        const error = new Error(parsed?.error || `\u670D\u52A1\u8FD4\u56DE ${result.status}`);
        error.status = result.status;
        throw error;
      }
      if (parsed && parsed.ok === false) throw new Error(parsed.error || "\u8BF7\u6C42\u5931\u8D25");
      return parsed;
    };
    const rest = (route, body) => api(`/obsidian/rest/${route}`, { vaultPath: state.vaultPath, ...body });
    let serviceBase = "";
    const noteUrl = async (notePath) => {
      if (!serviceBase) {
        try {
          const info = await rest("service-info", {});
          if (typeof info?.base === "string" && /^http:\/\/127\.0\.0\.1:\d+$/.test(info.base)) serviceBase = info.base;
        } catch {
        }
      }
      if (!serviceBase) return "https://obsidian.md";
      const vault = basename(state.vaultPath);
      return `${serviceBase}/obsidian/open?vault=${encodeURIComponent(vault)}&path=${encodeURIComponent(notePath)}`;
    };
    const projectFolder = () => state.projectName ? `${state.baseFolder}/${state.projectName}` : "";
    const taskFolder = () => projectFolder() ? `${projectFolder()}/\u4EFB\u52A1` : "";
    const archiveFolder = () => `\u4F1A\u8BDD\u8BB0\u5F55/${state.projectName || "\u672A\u5F52\u7C7B"}`;
    const taskStatus = (task) => {
      const value = String(task?.frontmatter?.status || "");
      return STATUSES.includes(value) ? value : "todo";
    };
    const taskTitle = (task) => {
      const title = String(task?.frontmatter?.title || "").trim();
      if (title) return title;
      const heading = String(task?.content || "").match(/^\s*#\s+(.+)$/m);
      return heading ? heading[1].trim() : `\u672A\u547D\u540D\u4EFB\u52A1 \xB7 ${basename(task?.path).replace(/\.md$/i, "")}`;
    };
    const sortTasks = (tasks) => tasks.slice().sort((left, right) => {
      const leftStatus = STATUS_RANK[taskStatus(left)] ?? 9;
      const rightStatus = STATUS_RANK[taskStatus(right)] ?? 9;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      const leftPriority = PRIORITY_RANK[String(left?.frontmatter?.priority || "P9")] ?? 9;
      const rightPriority = PRIORITY_RANK[String(right?.frontmatter?.priority || "P9")] ?? 9;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left?.path || "").localeCompare(String(right?.path || ""), "zh");
    });
    const saveSettings = async () => {
      try {
        const saved = await host.storage.get("settings");
        const base = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
        await host.storage.set("settings", {
          ...base,
          vaultPath: state.vaultPath,
          baseFolder: state.baseFolder,
          projectName: state.projectName,
          ocProjectId: state.ocProjectId
        });
      } catch {
      }
    };
    const loadSettings = async () => {
      try {
        const saved = await host.storage.get("settings");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          if (typeof saved.vaultPath === "string" && saved.vaultPath.trim()) state.vaultPath = saved.vaultPath.trim();
          if (typeof saved.baseFolder === "string" && saved.baseFolder.trim()) {
            state.baseFolder = saved.baseFolder.trim().replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "");
          }
          if (typeof saved.projectName === "string" && saved.projectName.trim()) state.projectName = saved.projectName.trim();
          if (typeof saved.ocProjectId === "string" && saved.ocProjectId.trim()) state.ocProjectId = saved.ocProjectId.trim();
        }
      } catch {
      }
    };
    const checkProject = async () => {
      state.bound = false;
      state.projectDirectory = "";
      if (!state.projectName) return;
      try {
        const result = await rest("note", { notePath: `${projectFolder()}/index.md` });
        state.bound = true;
        const pathValue = result?.note?.frontmatter?.path;
        if (typeof pathValue === "string" && pathValue.trim()) state.projectDirectory = pathValue.trim();
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    };
    const resolveProject = () => {
      const hostProject = state.followHost && state.directory ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory)) : null;
      const byId = !hostProject && state.ocProjectId ? state.ocProjects.find((project) => project.id === state.ocProjectId) : null;
      const byName = !hostProject && !byId && state.projectName ? state.ocProjects.find((project) => project.name === state.projectName) : null;
      const byDirectory = !hostProject && !byId && !byName && state.directory && state.projectName === "" ? state.ocProjects.find((project) => pathKey(project.directory) === pathKey(state.directory)) : null;
      const selected = hostProject || byId || byName || byDirectory || null;
      if (selected) {
        state.ocProjectId = selected.id;
        state.ocProjectName = selected.name;
        state.projectName = selected.name;
        state.projectDirectory = selected.directory;
        return;
      }
      state.ocProjectId = "";
      state.ocProjectName = "";
      if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
        state.projectName = "";
        state.projectDirectory = "";
      }
      if (!state.projectName && state.ocProjects.length) {
        const first = state.ocProjects[0];
        state.ocProjectId = first.id;
        state.ocProjectName = first.name;
        state.projectName = first.name;
        state.projectDirectory = first.directory;
      } else if (!state.projectName && state.vaultProjects.length === 1) {
        state.projectName = state.vaultProjects[0];
      }
    };
    const loadProjects = async () => {
      const result = await rest("projects", { baseFolder: state.baseFolder });
      state.vaultProjects = Array.isArray(result?.projects) ? result.projects : [];
      try {
        const snapshot = await host.listProjects();
        state.ocProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
      } catch {
      }
      if (state.freshProject) {
        if (!state.vaultProjects.includes(state.freshProject)) state.vaultProjects.push(state.freshProject);
        state.freshProject = "";
      }
      if (state.freshOcProject && !state.ocProjects.some((project) => project.id === state.freshOcProject.id)) {
        state.ocProjects.push(state.freshOcProject);
      }
      if (state.projectName && !state.vaultProjects.includes(state.projectName)) {
        state.vaultProjects.push(state.projectName);
      }
      resolveProject();
    };
    const loadTasks = async () => {
      if (!state.projectName || !state.bound) {
        state.tasks = [];
        return;
      }
      const result = await rest("tasks", { folder: taskFolder(), limit: 150 });
      const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
      state.tasks = sortTasks(tasks.filter((task) => task?.frontmatter?.type === "AgentTask"));
      if (state.selectedPath && !state.tasks.some((task) => task.path === state.selectedPath)) {
        state.selectedPath = "";
      }
    };
    const loadSessions = async () => {
      if (!state.ready || !state.ocProjectId) {
        state.sessions = 0;
        return;
      }
      try {
        const snapshot = await host.listSessions(state.ocProjectId);
        const records = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
        state.sessions = records.filter((session) => !session.archivedAt).length;
      } catch {
        state.sessions = 0;
      }
    };
    const refresh = async () => {
      if (state.refreshing) {
        state.rerun = true;
        return;
      }
      state.refreshing = true;
      state.error = null;
      render();
      try {
        await loadProjects();
        await checkProject();
        await loadSessions();
        await loadTasks();
        state.activity = state.projectName ? `${state.tasks.length} \u4E2A\u4EFB\u52A1${state.sessions ? ` \xB7 ${state.sessions} \u4E2A\u4F1A\u8BDD` : ""}` : "\u9009\u62E9\u4E00\u4E2A\u9879\u76EE";
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.refreshing = false;
        render();
        if (state.rerun) {
          state.rerun = false;
          void refresh();
        }
        void autoArchive();
      }
    };
    let autoArchiveRunning = false;
    let lastAutoArchiveAt = 0;
    const autoArchive = async () => {
      if (autoArchiveRunning || state.busy || state.refreshing || !state.bound) return;
      if (Date.now() - lastAutoArchiveAt < 6e4) return;
      const candidates = state.tasks.filter((task) => {
        const frontmatter = task?.frontmatter || {};
        if (!String(frontmatter.session_id || "").trim()) return false;
        return !(frontmatter.auto_archive === false || frontmatter.auto_archive === "off");
      });
      if (!candidates.length) return;
      lastAutoArchiveAt = Date.now();
      autoArchiveRunning = true;
      let changed = false;
      try {
        for (const task of candidates) {
          try {
            const result = await rest("session/archive", {
              sessionId: String(task.frontmatter.session_id).trim(),
              notePath: task.path,
              project: state.projectName,
              folder: archiveFolder(),
              auto: true
            });
            if (result && !result.skipped && result.path) {
              changed = true;
              state.activity = `\u5DF2\u81EA\u52A8\u5F52\u6863 ${taskTitle(task)}`;
              state.notice = `\u4F1A\u8BDD\u8BB0\u5F55\u5DF2\u5199\u5165 ${result.path}`;
            }
          } catch {
          }
        }
      } finally {
        autoArchiveRunning = false;
      }
      if (changed) {
        try {
          await loadTasks();
        } catch {
        }
        render();
      }
    };
    const archiveTask = async (task, { force = true } = {}) => {
      const sessionId = String(task?.frontmatter?.session_id || "").trim();
      if (!sessionId) {
        state.error = "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u5173\u8054\u4F1A\u8BDD\uFF0C\u8BF7\u5148\u70B9\u300C\u6D3E\u53D1\u5230 Agent\u300D\u3002";
        render();
        return;
      }
      if (state.busy) return;
      state.busy = true;
      state.error = null;
      render();
      try {
        const result = await rest("session/archive", {
          sessionId,
          notePath: task.path,
          project: state.projectName,
          folder: archiveFolder(),
          force
        });
        if (result?.skipped) {
          state.activity = `\u4F1A\u8BDD\u6CA1\u6709\u65B0\u5185\u5BB9\uFF08${result.path || "\u672A\u5199\u5165"}\uFF09`;
          if (result.path) state.notice = `\u4F1A\u8BDD\u8BB0\u5F55\uFF1A${result.path}`;
        } else {
          state.activity = `\u5DF2\u5F52\u6863 ${result?.messageCount ?? 0} \u6761\u6D88\u606F`;
          if (result?.path) state.notice = `\u4F1A\u8BDD\u8BB0\u5F55\u5DF2\u5199\u5165 ${result.path}`;
          await loadTasks();
        }
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
        render();
      }
    };
    const COPY_MODES = [
      { mode: "id", label: "\u590D\u5236\u4F1A\u8BDD ID", done: "\u4F1A\u8BDD ID" },
      { mode: "link", label: "\u590D\u5236\u4F1A\u8BDD\u94FE\u63A5", done: "\u4F1A\u8BDD\u94FE\u63A5" },
      { mode: "markdown", label: "\u590D\u5236\u4F1A\u8BDD Markdown", done: "\u4F1A\u8BDD Markdown" },
      { mode: "plain", label: "\u590D\u5236\u7EAF\u6587\u672C", done: "\u7EAF\u6587\u672C\u4F1A\u8BDD" },
      { mode: "last-answer", label: "\u590D\u5236\u6700\u540E\u56DE\u7B54", done: "\u6700\u540E\u4E00\u6761\u56DE\u7B54" },
      { mode: "last-turn", label: "\u590D\u5236\u6700\u540E\u4E00\u8F6E", done: "\u6700\u540E\u4E00\u8F6E\u5BF9\u8BDD" }
    ];
    const copyToClipboard = async (text) => {
      if (typeof host?.writeClipboard === "function") {
        await host.writeClipboard(text);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5199\u5165\u526A\u8D34\u677F");
    };
    const copySession = async (task, mode) => {
      const sessionId = String(task?.frontmatter?.session_id || "").trim();
      if (!sessionId || state.busy) return;
      const entry = COPY_MODES.find((item) => item.mode === mode);
      state.busy = true;
      state.error = null;
      render();
      try {
        const result = await rest("session/export", {
          sessionId,
          mode,
          project: state.projectName,
          includeTools: mode === "markdown"
        });
        await copyToClipboard(String(result?.text || ""));
        const detail = mode === "markdown" || mode === "plain" ? `\uFF08${result?.messageCount ?? 0} \u6761\u6D88\u606F / ${result?.turnCount ?? 0} \u8F6E\uFF09` : "";
        state.activity = `\u5DF2\u590D\u5236${entry?.done || "\u4F1A\u8BDD\u5185\u5BB9"}${detail}`;
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
        render();
      }
    };
    const buildCopyMenu = (task, sessionId) => {
      const wrap = el2("div", "copy-wrap");
      const button2 = el2("button", "btn", "\u590D\u5236 \u25BE");
      button2.type = "button";
      button2.disabled = state.busy || !sessionId;
      button2.title = sessionId ? "\u590D\u5236\u4F1A\u8BDD\u5185\u5BB9\uFF08\u5BF9\u9F50 OpenChamber \u7684\u590D\u5236\u9009\u9879\uFF09" : "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u5173\u8054\u4F1A\u8BDD\uFF0C\u5148\u6D3E\u53D1\u5230 Agent";
      const menu = el2("div", "copy-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      let detach = null;
      const closeMenu = () => {
        menu.hidden = true;
        if (detach) {
          document.removeEventListener("pointerdown", detach, true);
          detach = null;
        }
      };
      for (const item of COPY_MODES) {
        const option = el2("button", "copy-item", item.label);
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.addEventListener("click", () => {
          closeMenu();
          void copySession(task, item.mode);
        });
        menu.append(option);
      }
      button2.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!menu.hidden) {
          closeMenu();
          return;
        }
        menu.hidden = false;
        detach = (event2) => {
          if (!wrap.contains(event2.target)) closeMenu();
        };
        document.addEventListener("pointerdown", detach, true);
      });
      wrap.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });
      wrap.append(button2, menu);
      return wrap;
    };
    const bindProject = async () => {
      if (state.busy || !state.projectName) return;
      state.busy = true;
      state.error = null;
      render();
      try {
        await rest("project/init", {
          baseFolder: state.baseFolder,
          project: state.projectName,
          projectPath: state.projectDirectory || ""
        });
        if (!state.vaultProjects.includes(state.projectName)) state.vaultProjects.push(state.projectName);
        state.activity = `\u5DF2\u521D\u59CB\u5316 ${state.projectName}`;
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
      }
      await refresh();
    };
    let projectOptionsSignature = "";
    const renderProjects = () => {
      const linked = new Set(state.ocProjects.map((project) => project.name));
      const vaultOnly = state.vaultProjects.filter((name) => !linked.has(name));
      const signature = JSON.stringify({
        oc: state.ocProjects.map((project) => [project.id, project.name, project.directory || ""]),
        vault: vaultOnly
      });
      if (signature !== projectOptionsSignature) {
        projectOptionsSignature = signature;
        const options = [];
        const placeholder = el2("option", "", state.ocProjects.length || vaultOnly.length ? "\u9009\u62E9\u9879\u76EE\u2026" : "\u8FD8\u6CA1\u6709\u9879\u76EE");
        placeholder.value = "";
        options.push(placeholder);
        if (state.ocProjects.length) {
          const group = el2("optgroup");
          group.label = "OpenChamber \u9879\u76EE";
          for (const project of state.ocProjects) {
            const option = el2("option", "", project.name);
            option.value = `oc:${project.id}`;
            option.title = project.directory;
            group.append(option);
          }
          options.push(group);
        }
        if (vaultOnly.length) {
          const group = el2("optgroup");
          group.label = "\u4EC5\u77E5\u8BC6\u5E93";
          for (const name of vaultOnly) {
            const option = el2("option", "", name);
            option.value = `vault:${name}`;
            group.append(option);
          }
          options.push(group);
        }
        const createOption2 = el2("option", "", "\uFF0B \u65B0\u5EFA\u9879\u76EE\u2026");
        createOption2.value = "__new__";
        options.push(createOption2);
        nodes.project.replaceChildren(...options);
      }
      const value = state.ocProjectId ? `oc:${state.ocProjectId}` : state.projectName ? `vault:${state.projectName}` : "";
      if (nodes.project.value !== value) nodes.project.value = value;
      if (nodes.project.disabled !== state.busy) nodes.project.disabled = state.busy;
    };
    const emptyBlock = (text, actionLabel, action) => {
      const wrap = el2("div", "empty");
      wrap.append(el2("span", "", text));
      if (actionLabel && action) {
        const button2 = el2("button", "btn", actionLabel);
        button2.type = "button";
        button2.addEventListener("click", action);
        wrap.append(document.createElement("br"), button2);
      }
      return wrap;
    };
    const openTaskForm = () => {
      if (state.busy) return;
      state.taskCreate = true;
      state.taskCreateFocus = true;
      render();
    };
    const buildTaskForm = () => {
      const form = el2("div", "empty");
      const input = el2("input");
      input.type = "text";
      input.placeholder = "\u4EFB\u52A1\u6807\u9898";
      input.style.cssText = inputStyle;
      const ok = el2("button", "btn primary", "\u521B\u5EFA");
      ok.type = "button";
      const cancel = el2("button", "btn", "\u53D6\u6D88");
      cancel.type = "button";
      const submit = async () => {
        const title = input.value.trim();
        if (!title || state.busy) return;
        state.busy = true;
        state.error = null;
        render();
        try {
          await rest("task/create", { folder: taskFolder(), title, project: state.projectName });
          state.taskCreate = false;
          state.taskCreateFocus = false;
          await loadTasks();
          state.activity = `\u5DF2\u521B\u5EFA\u4EFB\u52A1 ${title}`;
        } catch (error) {
          state.error = messageOf(error);
        } finally {
          state.busy = false;
          render();
        }
      };
      ok.addEventListener("click", () => void submit());
      cancel.addEventListener("click", () => {
        state.taskCreate = false;
        render();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          state.taskCreate = false;
          render();
        }
      });
      form.append(input, ok, cancel);
      if (state.taskCreateFocus) {
        state.taskCreateFocus = false;
        try {
          input.focus({ preventScroll: true });
        } catch {
        }
      }
      return form;
    };
    const buildAddTask = () => {
      const wrap = el2("div", "task-add");
      const button2 = el2("button", "btn", "\uFF0B \u65B0\u5EFA\u4EFB\u52A1");
      button2.type = "button";
      button2.addEventListener("click", openTaskForm);
      wrap.append(button2);
      return wrap;
    };
    const renderList = () => {
      if (!state.projectName) {
        nodes.list.replaceChildren(emptyBlock("\u8FD8\u6CA1\u6709\u53EF\u7528\u7684\u9879\u76EE\u3002\u8BF7\u5728 OpenChamber \u91CC\u6DFB\u52A0\u9879\u76EE\uFF0C\u6216\u5728\u5B8C\u6574 Brain \u9875\u9762\u65B0\u5EFA\u77E5\u8BC6\u5E93\u9879\u76EE\u3002"));
        return;
      }
      if (!state.bound) {
        nodes.list.replaceChildren(emptyBlock(`${projectFolder()} \u8FD8\u6CA1\u6709\u521D\u59CB\u5316\u3002`, "\u521D\u59CB\u5316\u9879\u76EE", () => void bindProject()));
        return;
      }
      const parts = [];
      if (state.taskCreate) parts.push(buildTaskForm());
      if (state.tasks.length) {
        parts.push(...state.tasks.map((task) => {
          const status = taskStatus(task);
          const row = el2("button", "row");
          row.type = "button";
          row.dataset.path = task.path;
          row.setAttribute("aria-selected", String(task.path === state.selectedPath));
          const dot = el2("span", "dot");
          dot.dataset.status = status;
          row.append(
            dot,
            el2("span", "title", taskTitle(task)),
            el2("span", "prio", String(task?.frontmatter?.priority || "P1"))
          );
          return row;
        }));
        if (!state.taskCreate) parts.push(buildAddTask());
      } else if (!state.taskCreate) {
        parts.push(emptyBlock("\u8FD9\u4E2A\u9879\u76EE\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002", "\uFF0B \u65B0\u5EFA\u4EFB\u52A1", openTaskForm));
      }
      nodes.list.replaceChildren(...parts);
    };
    const renderActions = () => {
      const task = state.tasks.find((item) => item.path === state.selectedPath);
      nodes.actions.hidden = !task;
      if (!task) return;
      const status = taskStatus(task);
      const label = el2("span", "label", taskTitle(task));
      const statusSelect = el2("select");
      statusSelect.setAttribute("aria-label", "\u4EFB\u52A1\u72B6\u6001");
      for (const value of STATUSES) {
        const option = el2("option", "", STATUS_LABEL[value]);
        option.value = value;
        statusSelect.append(option);
      }
      statusSelect.value = status;
      statusSelect.disabled = state.busy;
      statusSelect.addEventListener("change", () => void setStatus(task.path, statusSelect.value));
      const dispatchButton = el2("button", "btn primary", "\u6D3E\u53D1\u5230 Agent");
      dispatchButton.type = "button";
      dispatchButton.disabled = state.busy;
      dispatchButton.title = state.ocProjectId ? `\u5728 ${state.ocProjectName} \u65B0\u5EFA\u4F1A\u8BDD\u5E76\u6253\u5F00` : "\u65B0\u5EFA\u4F1A\u8BDD\uFF1B\u8FD9\u4E2A\u77E5\u8BC6\u5E93\u9879\u76EE\u6CA1\u6709\u5339\u914D\u7684 OpenChamber \u9879\u76EE\uFF0C\u4F1A\u5728\u5F53\u524D\u76EE\u5F55\u6253\u5F00";
      dispatchButton.addEventListener("click", () => void dispatch(task));
      const sessionId = String(task?.frontmatter?.session_id || "").trim();
      const archivedPath = String(task?.frontmatter?.archive_path || "").trim();
      const archiveButton = el2("button", "btn", archivedPath ? "\u66F4\u65B0\u5F52\u6863" : "\u5F52\u6863\u4F1A\u8BDD");
      archiveButton.type = "button";
      archiveButton.disabled = state.busy || !sessionId;
      archiveButton.title = sessionId ? `\u628A\u4F1A\u8BDD\u8BB0\u5F55\u5199\u5165 ${archiveFolder()}\uFF0C\u5E76\u56DE\u5199\u4EFB\u52A1\u5361` : "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u5173\u8054\u4F1A\u8BDD\uFF0C\u5148\u6D3E\u53D1\u5230 Agent";
      archiveButton.addEventListener("click", () => void archiveTask(task, { force: true }));
      const archiveOpenButton = archivedPath ? el2("button", "btn", "\u6253\u5F00\u5F52\u6863") : null;
      if (archiveOpenButton) {
        archiveOpenButton.type = "button";
        archiveOpenButton.disabled = state.busy;
        archiveOpenButton.addEventListener("click", () => void openNote(archivedPath));
      }
      const copyMenu = buildCopyMenu(task, sessionId);
      const composeButton = el2("button", "btn", "\u5199\u5165\u5BF9\u8BDD");
      composeButton.type = "button";
      composeButton.disabled = state.busy;
      composeButton.addEventListener("click", () => void compose(task));
      const openButton = el2("button", "btn", "\u6253\u5F00");
      openButton.type = "button";
      openButton.disabled = state.busy;
      openButton.addEventListener("click", () => void openNote(task.path));
      nodes.actions.replaceChildren(
        label,
        statusSelect,
        dispatchButton,
        archiveButton,
        ...archiveOpenButton ? [archiveOpenButton] : [],
        copyMenu,
        composeButton,
        openButton
      );
    };
    const render = () => {
      nodes.error.hidden = !state.error;
      nodes.error.textContent = state.error || "";
      nodes.refresh.disabled = state.busy;
      nodes.refresh.classList.toggle("spin", state.busy || state.refreshing);
      renderProjects();
      renderList();
      renderActions();
      if (notice) {
        notice.hidden = !state.notice;
        notice.textContent = state.notice;
      }
      const parts = [state.activity];
      if (state.ocProjectId) parts.push(`\u4F1A\u8BDD ${state.sessions}`);
      nodes.foot.textContent = parts.filter(Boolean).join(" \xB7 ");
      nodes.foot.title = nodes.foot.textContent;
    };
    const buildBrief = (task) => {
      const body = String(task?.content || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
      const heading = taskTitle(task);
      return [
        `Obsidian \u4EFB\u52A1\uFF1A${task.path}\uFF08\u77E5\u8BC6\u5E93 ${state.vaultPath}\uFF09`,
        `\u9879\u76EE\uFF1A${state.projectName}`,
        "\u6309\u77E5\u8BC6\u5E93 AGENTS.md \u7684\u89C4\u5219\u5199\u5165\u7B14\u8BB0\u3002",
        "",
        `# ${heading}`,
        "",
        body.slice(0, 12e3),
        "",
        "\u73B0\u5728\u6267\u884C\u8FD9\u4E2A\u4EFB\u52A1\u3002\u5B8C\u6210\u540E\u628A\u4EFB\u52A1 frontmatter \u7684 status \u6539\u4E3A done \u6216 blocked\uFF0C\u5E76\u5728\u300C## Agent Execution Log\u300D\u4E0B\u8FFD\u52A0\u4E00\u6761\u7B80\u77ED\u7ED3\u679C\u3002"
      ].join("\n").slice(0, 15e3);
    };
    const setStatus = async (taskPath, value) => {
      if (state.busy || !taskPath || !STATUSES.includes(value)) return;
      state.busy = true;
      render();
      try {
        await rest("frontmatter", { notePath: taskPath, key: "status", value });
        await rest("frontmatter", { notePath: taskPath, key: "updated_at", value: stamp() });
        await rest("append", {
          notePath: taskPath,
          heading: "Agent Execution Log",
          content: `- [${stamp()}] status \u2192 ${value} (Brain \u4FA7\u680F)`
        });
        await loadTasks();
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
        render();
      }
    };
    const dispatch = async (task) => {
      if (state.busy || !task) return;
      state.busy = true;
      state.error = null;
      render();
      try {
        const result = await host.startSession({
          providerId: "obsidian",
          id: task.path,
          title: taskTitle(task),
          url: await noteUrl(task.path),
          text: buildBrief(task),
          ...state.ocProjectId ? { projectId: state.ocProjectId } : {},
          navigation: "open"
        });
        if (!result?.sessionId) {
          throw new Error(result?.failure ? `\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25\uFF1A${result.failure}` : "\u4F1A\u8BDD\u672A\u521B\u5EFA");
        }
        await rest("frontmatter", { notePath: task.path, key: "status", value: "running" });
        await rest("frontmatter", { notePath: task.path, key: "session_id", value: result.sessionId });
        await rest("frontmatter", { notePath: task.path, key: "updated_at", value: stamp() });
        await rest("append", {
          notePath: task.path,
          heading: "Agent Execution Log",
          content: `- [${stamp()}] \u5DF2\u6D3E\u53D1\u5230\u4F1A\u8BDD ${result.sessionId}\uFF08Brain \u4FA7\u680F\uFF09`
        });
        state.activity = `\u5DF2\u6D3E\u53D1\u5230\u4F1A\u8BDD ${result.sessionId}`;
        try {
          await host.toast({ kind: "success", message: `\u5DF2\u6D3E\u53D1\u5230\u4F1A\u8BDD ${result.sessionId}` });
        } catch {
        }
        await loadTasks();
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
        render();
      }
    };
    const compose = async (task) => {
      if (state.busy || !task) return;
      try {
        await host.prompt({ text: buildBrief(task), send: false });
        state.activity = "\u4EFB\u52A1\u7B80\u62A5\u5DF2\u5199\u5165\u5F53\u524D\u8F93\u5165\u6846";
        render();
      } catch (error) {
        state.error = messageOf(error);
        render();
      }
    };
    const openNote = async (notePath) => {
      try {
        await rest("open", { notePath, newLeaf: true });
        state.activity = "\u5DF2\u5728 Obsidian \u4E2D\u6253\u5F00";
        render();
      } catch (error) {
        state.error = messageOf(error);
        render();
      }
    };
    const selectProject = (value) => {
      if (state.busy) return;
      if (value === "__new__") {
        showCreate();
        renderProjects();
        return;
      }
      state.followHost = false;
      if (value.startsWith("oc:")) {
        const project = state.ocProjects.find((item) => item.id === value.slice(3));
        if (!project) return;
        state.ocProjectId = project.id;
        state.ocProjectName = project.name;
        state.projectName = project.name;
        state.projectDirectory = project.directory;
      } else if (value.startsWith("vault:")) {
        state.ocProjectId = "";
        state.ocProjectName = "";
        state.projectName = value.slice(6);
        state.projectDirectory = "";
      } else {
        state.ocProjectId = "";
        state.ocProjectName = "";
        state.projectName = "";
        state.projectDirectory = "";
      }
      state.selectedPath = "";
      state.notice = "";
      void saveSettings();
      void refresh();
    };
    const inputStyle = "flex:1;min-width:0;padding:3px 6px;border:1px solid var(--oc-border, rgba(127,127,127,.35));border-radius:4px;background:var(--oc-elevated, transparent);color:inherit;font:inherit;";
    const createRow = el2("div", "create-row");
    createRow.style.cssText = "display:none;flex-direction:column;gap:4px;padding:4px 8px;";
    const createNameRow = el2("div");
    createNameRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const createInput = el2("input");
    createInput.type = "text";
    createInput.placeholder = "\u65B0\u9879\u76EE\u540D\u79F0";
    createInput.style.cssText = inputStyle;
    const createOk = el2("button", "btn primary", "\u521B\u5EFA");
    createOk.type = "button";
    const createCancel = el2("button", "btn", "\u53D6\u6D88");
    createCancel.type = "button";
    createNameRow.append(createInput, createOk, createCancel);
    const createDirInput = el2("input");
    createDirInput.type = "text";
    createDirInput.placeholder = "\u9879\u76EE\u76EE\u5F55\uFF08\u7559\u7A7A\u7528\u77E5\u8BC6\u5E93\u6587\u4EF6\u5939\uFF09";
    createDirInput.style.cssText = inputStyle;
    createRow.append(createNameRow, createDirInput);
    if (nodes.project.parentElement) nodes.project.parentElement.insertAdjacentElement("afterend", createRow);
    const notice = el2("div", "notice-line");
    notice.style.cssText = "padding:2px 8px 4px;font-size:11px;line-height:1.45;opacity:.72;";
    notice.hidden = true;
    if (createRow.parentElement) createRow.insertAdjacentElement("afterend", notice);
    else root.append(notice);
    const hideCreate = () => {
      createRow.style.display = "none";
    };
    const showCreate = () => {
      createRow.style.display = "flex";
      createInput.value = "";
      createDirInput.value = "";
      try {
        createInput.focus({ preventScroll: true });
      } catch {
      }
    };
    const joinPath = (...parts) => parts.map((part) => String(part || "").trim()).filter(Boolean).map((part, index) => index === 0 ? part.replace(/[\\/]+$/, "") : part.replace(/^[\\/]+|[\\/]+$/g, "").replace(/[\\/]+/g, "\\")).join("\\");
    const createProject = async () => {
      const name = createInput.value.trim();
      if (!name || state.busy) return;
      const directory = (createDirInput.value.trim() || joinPath(state.vaultPath, state.baseFolder, name)).replace(/\//g, "\\");
      state.busy = true;
      state.error = null;
      render();
      try {
        await rest("project/init", { baseFolder: state.baseFolder, project: name, projectPath: directory });
        if (!state.vaultProjects.includes(name)) state.vaultProjects.push(name);
        let registered = null;
        try {
          registered = await rest("project/register", { directory, label: name });
        } catch (error) {
          state.error = `\u9879\u76EE\u5DF2\u521B\u5EFA\uFF0C\u4F46\u540C\u6B65\u5230 OpenChamber \u5931\u8D25\uFF1A${messageOf(error)}`;
        }
        const project = registered?.project || null;
        if (project?.id) {
          state.freshOcProject = { id: project.id, name: project.label || name, directory: project.path || directory };
          if (!state.ocProjects.some((item) => item.id === project.id)) state.ocProjects.push(state.freshOcProject);
        }
        state.followHost = false;
        state.ocProjectId = project?.id || "";
        state.ocProjectName = project?.label || name;
        state.projectName = name;
        state.freshProject = name;
        state.projectDirectory = directory;
        state.selectedPath = "";
        state.taskCreate = false;
        state.notice = project ? "\u5DF2\u5199\u5165 OpenChamber \u9879\u76EE\u5217\u8868\uFF1A\u6309 Ctrl+R \u5237\u65B0\u540E\u51FA\u73B0\u5728\u5DE6\u4FA7\uFF0C\u5E76\u4FDD\u6301\u5F53\u524D\u9009\u4E2D\u3002" : "";
        await saveSettings();
        hideCreate();
        state.activity = project ? `\u5DF2\u521B\u5EFA ${name}\uFF0C\u5DF2\u52A0\u5165 OpenChamber \u9879\u76EE` : `\u5DF2\u521B\u5EFA ${name}`;
      } catch (error) {
        state.error = messageOf(error);
      } finally {
        state.busy = false;
        render();
      }
      await refresh();
    };
    createOk.addEventListener("click", () => void createProject());
    createCancel.addEventListener("click", hideCreate);
    createInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void createProject();
      } else if (event.key === "Escape") {
        event.preventDefault();
        hideCreate();
      }
    });
    nodes.project.addEventListener("change", () => selectProject(nodes.project.value));
    nodes.list.addEventListener("click", (event) => {
      const row = event.target.closest(".row");
      if (!row?.dataset.path) return;
      state.selectedPath = row.dataset.path === state.selectedPath ? "" : row.dataset.path;
      render();
    });
    nodes.refresh.addEventListener("click", () => void refresh());
    let readyTimer = 0;
    let readyTries = 0;
    const nudgeHost = () => {
      if (state.ready || !window.parent || window.parent === window) return;
      if (readyTries >= 60) {
        if (readyTimer) {
          window.clearInterval(readyTimer);
          readyTimer = 0;
        }
        return;
      }
      readyTries += 1;
      try {
        window.parent.postMessage({ channel: "openchamber.sdk", v: 1, type: "hello" }, "*");
      } catch {
      }
    };
    nudgeHost();
    readyTimer = window.setInterval(() => {
      if (state.ready) {
        window.clearInterval(readyTimer);
        readyTimer = 0;
        return;
      }
      nudgeHost();
    }, 600);
    host.onReady((context) => {
      state.directory = context?.directory || null;
      state.ready = true;
      if (readyTimer) {
        window.clearInterval(readyTimer);
        readyTimer = 0;
      }
      try {
        applyHostReady(context, document.documentElement);
      } catch {
      }
      render();
      void refresh();
    });
    host.onDirectory((directory) => {
      state.directory = directory || null;
      if (state.followHost && state.ready) void refresh();
    });
    window.addEventListener("focus", () => {
      void refresh();
    });
    window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 1e4);
    render();
    void loadSettings().then(() => refresh());
    void refresh();
  };

  // src/section.js
  createBrainPane(connectHost(), document);
})();

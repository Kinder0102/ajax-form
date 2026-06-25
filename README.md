# ajax-form

> A declarative, lifecycle-driven AJAX form library that transforms standard HTML `<form>` elements into fully dynamic, AJAX-powered experiences — with zero JavaScript wiring for common use cases.

**ajax-form** is an extensible form enhancement framework built on the [js-common](https://github.com/Kinder0102/js-common) utility library. It provides a complete lifecycle pipeline, pluggable handler architecture, middleware system, built-in validation, file upload with progress tracking, pagination support, and automatic CSRF protection — all configurable through HTML `data-*` attributes.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Lifecycle Pipeline](#lifecycle-pipeline)
- [Data Attributes Reference](#data-attributes-reference)
- [CSS Class Reference](#css-class-reference)
- [JavaScript API](#javascript-api)
- [Configuration](#configuration)
- [Built-in Handlers](#built-in-handlers)
  - [Submit Handlers](#submit-handlers)
  - [Success Handlers](#success-handlers)
  - [Trigger Handlers](#trigger-handlers)
  - [Reset Handlers](#reset-handlers)
- [Middleware System](#middleware-system)
- [Validation System](#validation-system)
- [Plugin System](#plugin-system)
- [File Upload](#file-upload)
- [Pagination](#pagination)
- [Events Reference](#events-reference)
- [Advanced Usage](#advanced-usage)
- [Build](#build)
- [License](#license)

---

## Installation

```bash
npm install github:Kinder0102/ajax-form
```

The library depends on `js-common` (`github:Kinder0102/js-common`), which is installed automatically.

### Direct Import (ESM)

```js
import 'ajax-form';           // auto-initializes all .ajax-form elements
import AjaxForm from 'ajax-form';  // access the class for programmatic use
```

### Script Tag (UMD Bundle)

```html
<script src="dist/ajax-form.min.js"></script>
```

The bundled UMD script at `dist/ajax-form.min.js` exposes `AjaxForm` on `window`.

---

## Quick Start

### Minimal Example

```html
<form class="ajax-form" action="/api/submit">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <button>Submit</button>
</form>
```

That is all it takes. The form submits via AJAX instead of a full page reload. The default HTTP method is `POST`, and the `Content-Type` is `application/json`.

### With Success and Error Messages

```html
<form class="ajax-form" action="/api/contact">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <button>Send</button>

  <span class="ajax-form-message-success" hidden>Message sent!</span>
  <span class="ajax-form-message-error" hidden></span>
</form>
```

### With Redirect After Success

```html
<form class="ajax-form" action="/api/login"
      data-af-success-redirect="target:/dashboard">
  <input type="text" name="username">
  <input type="password" name="password">
  <button>Login</button>
</form>
```

### File Upload

```html
<form class="ajax-form" action="/api/upload" enctype="multipart/form-data">
  <input type="file" name="attachment" required>
  <button>Upload</button>
  <progress class="ajax-form-progress" value="0" max="100" hidden></progress>
</form>
```

---

## Architecture

ajax-form is built on a modular, handler-driven architecture. Each subsystem has a well-defined responsibility:

```
┌──────────────────────────────────────────────────────────┐
│                       AjaxForm                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Trigger    │  │   Submit     │  │   Success        │ │
│  │  Handler    │  │   Handler    │  │   Handler        │ │
│  │             │  │              │  │                  │ │
│  │ auto        │  │  ajax (XHR)  │  │ redirect         │ │
│  │ click       │  │  bypass      │  │ display (DOM)    │ │
│  │ change      │  │  download    │  │ querystring      │ │
│  │ (extensible)│  │  mock        │  │ storage          │ │
│  │             │  │ (extensible) │  │ event            │ │
│  └─────────────┘  └──────────────┘  │ apply/trigger    │ │
│                                     │ reset            │ │
│  ┌─────────────┐  ┌──────────────┐  │ (extensible)     │ │
│  │  Middleware │  │   Plugin     │  └──────────────────┘ │
│  │  Factory    │  │   Host       │                       │
│  │             │  │              │  ┌──────────────────┐ │
│  │ debug/show  │  │  registers   │  │   Reset          │ │
│  │ hide/alert  │  │  custom      │  │   Handler        │ │
│  │ confirm     │  │  plugins     │  │                  │ │
│  │ prompt/error│  │              │  │ clear / submit   │ │
│  │ (extensible)│  │              │  │ (extensible)     │ │
│  └─────────────┘  └──────────────┘  └──────────────────┘ │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Request    │  │   DOM        │  │  Configuration   │ │
│  │  Helper     │  │   Helper     │  │  (createConfig)  │ │
│  │  (XHR)      │  │  (rendering) │  │  3-layer merge   │ │
│  └─────────────┘  └──────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Aspect | Approach |
|--------|----------|
| **Initialization** | Automatic via `MutationObserver` on `DOMContentLoaded` |
| **Configuration** | Three-layer merge: per-form opts → `AjaxForm.config` global → `DEFAULT_CONFIG` |
| **Parameter Resolution** | Priority: JS opts object → `data-af-*` attribute → plain HTML attribute → default |
| **Data Construction** | Inputs are grouped into `data`/`query`/`header` categories via `data-af-to` |
| **Extensibility** | All handler types support `static add()` for custom registration |
| **State Management** | Lifecycle state flows through the promise chain; `#with` object tracks append/page/querystring/apply contexts |

---

## Lifecycle Pipeline

Every form submission passes through a 6-stage pipeline. Each stage has hooks for middleware, success handlers, and plugin broadcasting.

```
submit()
  │
  ▼
┌──────────┐   1. Wait for plugins to become ready
│  BEFORE  │   2. Run 'before' middleware
└────┬─────┘   3. Broadcast 'ajax-form:before' to plugins
     │         4. Reset UI controls (hide success/error, re-enable fields)
     │         5. Invoke successHandlers for 'before' lifecycle
     ▼
┌──────────┐   1. Collect grouped validation rules (data-af-validation)
│VALIDATION│   2. Run 'validation' middleware
└────┬─────┘   3. Check HTML5 Constraint Validation API (reportValidity)
     │         4. If invalid: broadcast 'ajax-form:invalid', show message, throw
     ▼
┌──────────┐   1. Resolve submit handler type, method, URL, enctype, CSRF
│ REQUEST  │   2. Apply artificial delay (config.delay)
└────┬─────┘   3. Toggle UI controls (enable/disable, show/hide)
     │         4. Run 'request' middleware
     │         5. Broadcast 'ajax-form:request' to plugins
     │         6. Execute submit handler (e.g. XHR request)
     ▼
┌──────────┐   1. Run 'response' middleware
│ RESPONSE │   2. Check response via config.response.checkResponse
└────┬─────┘   3. Extract data and page via config.response.getData/getPage
     │         4. Broadcast 'ajax-form:response' to plugins
     │         5. Fire 'ajax-form:upload-stop' on progress elements
     │         6. Reset UI controls
     │         7. Invoke successHandlers for 'response' lifecycle
     ▼
┌──────────┐   1. Run 'after' middleware
│  AFTER   │   2. Broadcast 'ajax-form:after' to plugins
└────┬─────┘   3. Show success message elements
     │         4. Invoke successHandlers for 'after' lifecycle
     ▼
  Promise resolved with { request, response, page }
```

### Error Handling

```
  .catch(error)
     │
     ├── error.message === 'VALIDATION'  →  silently return (no further action)
     ├── error.message === 'CONFIRM'     →  reset UI controls, return
     │
     └── other errors:
          1. Normalize error via config.response.getError
          2. Broadcast 'ajax-form:after' with { error }
          3. Fire 'ajax-form:upload-stop'
          4. Reset UI controls
          5. Run 'error' middleware
          6. Display in .ajax-form-message-error OR global error middleware
```

---

## Data Attributes Reference

All attributes use the configurable prefix (default: `af`), producing `data-af-*`. The prefix can be changed via `AjaxForm.config.prefix`.

### Form-Level Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-af-type` | `"ajax"` | Submit handler type. Built-in: `ajax`, `bypass`, `download`, `mock`. |
| `data-af-delay` | `0` | Artificial delay (ms) before sending the request. |
| `data-af-config` | — | Per-form configuration overrides (merged with `AjaxForm.config` and defaults). |
| `data-af-input` | — | CSS selector for additional input elements outside the form. |
| `data-af-plugin` | — | CSS selector for plugin elements. |

### Input-Level Attributes

| Attribute | Applies To | Description |
|-----------|------------|-------------|
| `data-af-to` | any input | Map the input value to a data group. Syntax: `type:groupName` or just the group name. Built-in types: `data` (request body, default), `query` (query string), `header` (request header). |
| `data-af-from` | any input | Transform the input value before submission. Syntax: `sourceType:pattern`. Supported sources: `global` (read from `window`), `localStorage` (read from `localStorage`). The pattern uses `{value}` as placeholder for the raw input value. |
| `data-af-type` | any input | Override the input's HTML type for value extraction. Supported: `month`, `date`, `datetime-local` (converted to Unix timestamp), `file`, `select-multiple`, `checkbox`, `radio`. |

### Handler Configuration Attributes

| Attribute | Description |
|-----------|-------------|
| `data-af-trigger-auto` | Auto-submit on init. Supports `with` sub-property for data sources. |
| `data-af-trigger-{eventName}` | CSS selector for elements that trigger submission on event. |
| `data-af-success-{handlerName}` | redirect, display, querystring... |
| `data-af-reset` | Reset handler types: `clear`, `submit`. |

### Middleware Attributes

| Attribute | Description |
|-----------|-------------|
| `data-af-middleware-before` | Middleware pipeline for the `before` stage. |
| `data-af-middleware-validation` | Middleware pipeline for the `validation` stage. |
| `data-af-middleware-request` | Middleware pipeline for the `request` stage. |
| `data-af-middleware-response` | Middleware pipeline for the `response` stage. |
| `data-af-middleware-after` | Middleware pipeline for the `after` stage. |
| `data-af-middleware-error` | Middleware pipeline for the `error` stage. |

Middleware values follow the DSL property syntax: `type:{middlewareName}|{paramName}:value|skip:condition`.

---

## CSS Class Reference

### Initialization Classes

| Class | Description |
|-------|-------------|
| `ajax-form` | Marks a `<form>` for AJAX enhancement. Auto-detected on `DOMContentLoaded`. |
| `ajax-form-initialized` | Added automatically after initialization. Prevents double-initialization. |

### UI Control Classes

These control element visibility and state during the request lifecycle. Elements automatically toggle back after each phase completes.

| Class | Behavior |
|-------|----------|
| `ajax-form-enable` | **Enabled** during the request (useful for buttons that should be clickable while waiting). |
| `ajax-form-disable` | **Disabled** during the request. Submit buttons and trigger-click targets are automatically added here. |
| `ajax-form-show` | **Shown** (`display` restored) during the request. |
| `ajax-form-hide` | **Hidden** (`display: none`) during the request. |
| `ajax-form-progress` | Receives `ajax-form:upload-start` and `ajax-form:upload-stop` custom events with progress data. |
| `ajax-form-message-validation` | Shown when validation fails. |
| `ajax-form-message-success` | Shown after a successful submission (`after` stage). |
| `ajax-form-message-error` | Shown on error; its content is populated with the error message via `DOMHelper`. |
| `ajax-form-abort` | Clicking this element aborts the current in-flight request. |

---

## JavaScript API

### Static Members

| Member | Type | Description |
|--------|------|-------------|
| `AjaxForm.config` | `object` | Global default configuration. Merged with per-form configs. |
| `AjaxForm.submitHandler` | `SubmitHandler` | Registry for submit handler types. Use `.add(name, callback, wrapResponse?)` to register. |
| `AjaxForm.successHandler` | `SuccessHandler` | Registry for success handler types. Use `.add(name, callback)` to register. |
| `AjaxForm.resetHandler` | `ResetHandler` | Registry for reset handler types. Use `.add(name, callback, after?)` to register. |
| `AjaxForm.domHelper` | `DOMHelper` | DOM rendering utility from `js-common`. |
| `AjaxForm.middleware` | `MiddlewareFactory` | Global middleware registry. Use `.add(name, callback)` and `.get(name)`. |
| `AjaxForm.instance` | `InstanceMap` | Singleton manager. Use `.get(el)` to retrieve or `.create(el)` to instantiate an `AjaxForm` instance for a DOM element. |

### Instance Methods

#### `submit(opts)`

Programmatically submit the form. Returns a `Promise` that resolves with `{ request, response, page }`.

```js
const form = AjaxForm.instance.get(document.querySelector('.ajax-form'));
form.submit({
  url: '/api/alternate-endpoint',
  with: ['querystring'],
  middleware: {
    before: 'type:confirm'
  },
  success: {
    display: 'target:#result'
  }
  header: { 'X-Custom': 'value' }
}).then(result => {
  console.log('Response data:', result.response);
  console.log('Page info:', result.page);
}).catch(error => {
  console.error('Submission failed:', error);
});
```

**Parameters:**

| Property | Type | Description |
|----------|------|-------------|
| `data` | `object` | Additional data to merge with form input data. |
| `url` | `string` | Override the request URL. |
| `method` | `string` | Override the HTTP method. |
| `type` | `string` | Override the submit handler type. |
| `enctype` | `string` | Override the encoding type. |
| `header` | `object` | Additional request headers. |
| `with` | `string[]` | Data sources to include: `"append"`, `"page"`, `"querystring"`. (`"apply"` is always included.) |

#### `submitSync(opts)`

Same as `submit()` but swallows errors (fire-and-forget). Useful for event handlers where you don't need the result.

```js
form.submitSync({ with: ['querystring'] });
```

### Registering Custom Handlers

#### Custom Submit Handler

```js
AjaxForm.submitHandler.add('graphql', async (opts, input, requestParams) => {
  const res = await fetch(requestParams.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: input.query, variables: input.variables })
  });
  return res.json();
}, /* wrapResponse */ true);
```

Use with: `data-af-type="graphql"`

The callback receives:
- `opts` — merged payload (`prefix`, `basePath`, `createResponse`, `handleProgress`, plus per-submit overrides)
- `input` — the request data object built from form inputs
- `requestParams` — `{ method, url, enctype, csrf, headers }`

If `wrapResponse` is `true` and the callback returns a non-Promise value, it will be wrapped via `config.response.create()`.

#### Custom Success Handler

A success handler can hook into any lifecycle stage:

```js
AjaxForm.successHandler.add('analytics', {
  request: (data, props, opts) => {
    // data: { request }
    ga('send', 'event', 'form', 'submit', props.category[0]);
  },
  after: (data, props, opts) => {
    // data: { request, response, page }
    ga('send', 'event', 'form', 'success');
  }
});
```

Use with: `data-af-success-analytics="category:signup"`

Or as a simple function (defaults to `after` lifecycle):

```js
AjaxForm.successHandler.add('toast', (data, props, opts) => {
  showToast('Success: ' + JSON.stringify(data.response));
});
```

Callback signature: `(data, props, opts)`
- `data` — the lifecycle data object (shape depends on the stage)
- `props` — parsed DSL properties from the data attribute
- `opts` — `{ root, domHelper, datasetHelper, prefix, basePath, ...submitOpts }`

#### Custom Reset Handler

```js
AjaxForm.resetHandler.add('reset-selects', (formEl) => {
  formEl.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);
});
// Or as an after-reset hook:
AjaxForm.resetHandler.add('refocus', (formEl) => {
  formEl.querySelector('input')?.focus();
}, /* after */ true);
```

Use with: `data-af-reset="clear|reset-selects|submit|refocus"`

#### Custom Middleware

```js
AjaxForm.middleware.add('log', (params, data, opts) => {
  console.log('[Middleware log]', { params, data, root: opts.root });
});

AjaxForm.middleware.add('disable-until-done', (params, data, opts) => {
  // Return a promise that resolves when some async condition is met
  return new Promise(resolve => {
    setTimeout(() => resolve(data), 1000);
  });
});
```

Use with: `data-af-middleware-before="type:{log|disable-until-done}"`

---

## Configuration

### Default Configuration

```js
AjaxForm.config = {
  prefix: 'af',
  basePath: '/',
  delay: 0,
  pagination: {
    page: 'page',
    size: 'size',
  },
  request: {
    from: {
      global: key => globalThis[key] ?? key,
      localStorage: key => localStorage.getItem(key) ?? key,
    },
  },
  response: {
    create: value => ({ code: 200, data: { item: value?.data, page: value?.page } }),
    checkResponse: res => res?.code === 200,
    getData: res => res?.data?.item,
    getPage: res => res?.data?.page,
    getError: (error = {}) => (
      AjaxForm.config.i18n?.code?.[error.code] ||
      AjaxForm.config.i18n?.status?.[error.status] ||
      error.message || error.code || error.status || error
    ),
  },
  getCsrfToken: () => ({
    header: document.querySelector('meta[name="_csrf_header"]')?.content || 'X-CSRF-TOKEN',
    token: document.querySelector('meta[name="_csrf"]')?.content || '',
  }),
};
```

### Configuration Merge Strategy

Config is resolved via a three-layer merge (latter overrides former):

1. `DEFAULT_CONFIG` (hardcoded)
2. `AjaxForm.config` (global, set by you)
3. Per-form config from `data-af-config` and constructor `opts.config`

### Customizing Response Handling

The `response` config defines how the library interprets server responses:

```js
AjaxForm.config.response = {
  // Wrap raw submit handler results into a normalized shape
  create: value => ({ code: 200, data: { item: value?.data, page: value?.page } }),

  // Determine if the response is successful (controls the promise chain)
  checkResponse: res => res?.code === 200,

  // Extract the payload data
  getData: res => res?.data?.item,

  // Extract pagination metadata
  getPage: res => res?.data?.page,

  // Convert error objects to human-readable messages
  getError: (error = {}) => error.message || error.code || error.status || error,
};
```

### i18n Configuration

```js
AjaxForm.config.i18n = {
  validation: {
    contact: 'Please provide at least one contact method',
    payment: 'All payment fields are required when any is filled',
  },
  code: {
    1001: 'Invalid credentials',
    1002: 'Account locked',
  },
  status: {
    401: 'Please log in again',
    403: 'You do not have permission',
    500: 'Internal server error',
  },
};
```

### CSRF Configuration

By default, CSRF tokens are read from `<meta name="_csrf">` and `<meta name="_csrf_header">`. Customize:

```js
AjaxForm.config.getCsrfToken = () => ({
  header: 'X-XSRF-TOKEN',
  token: document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || '',
});
```

---

## Built-in Handlers

### Submit Handlers

Submit handlers are responsible for executing the actual request. Type is set via `data-af-type`.

#### `ajax` (default)

Sends an XMLHttpRequest with automatic content-type detection:

| Condition | Content-Type | Body |
|-----------|-------------|------|
| File upload or `multipart/form-data` enctype | `multipart/form-data` (auto) | `FormData` |
| `application/x-www-form-urlencoded` enctype | `application/x-www-form-urlencoded` | URL-encoded string |
| Default (POST/PUT/PATCH) | `application/json;charset=utf-8` | JSON string |
| GET/DELETE | — | Query string appended to URL |

Features:
- **URL template**: `action="/api/users/{id}"` — `{id}` is replaced with the form field value for `id`
- **CSRF**: Automatically attaches CSRF token to headers
- **Progress**: Fires `progress` events on both `xhr.upload` and `xhr` for upload tracking
- **Redirect following**: If the server responds with a redirect, the browser navigates to the new URL
- **Abort support**: Controlled via `AbortController` (click `.ajax-form-abort` or dispatch `ajax-form:abort`)

#### `bypass`

Returns input directly without making a network request. Useful for testing or custom processing pipelines.

```html
<form class="ajax-form" data-af-type="bypass" data-af-success-display="target:#output">
  <input name="message" value="Hello">
</form>
```

The response will be `{ data: { message: "Hello" } }`.

#### `download`

Triggers a file download by creating a hidden `<a>` element and clicking it. The URL is constructed by appending query string parameters.

```html
<form class="ajax-form" action="/api/export" data-af-type="download">
  <input name="format" value="csv">
  <button>Download</button>
</form>
```

#### `mock`

Returns mock paginated data for development and testing:

```html
<form class="ajax-form" data-af-type="mock">
  <input name="size" value="20">
  <input name="page" value="0">
</form>
```

Response: `{ data: [{}, {}, ...], page: { size: 20, number: 0, totalElements: 500, totalPages: 25 } }`

### Success Handlers

Success handlers execute at specific lifecycle stages. They are configured via `data-af-success-{name}` attributes using DSL syntax.

#### `redirect`

Navigates the browser after a successful submission.

**DSL attribute:** `data-af-success-redirect`

| Key | Description |
|-----|-------------|
| `target` | Target URL (supports `{field}` substitution). Empty = reload. |
| `type` | `""` (default, navigate), `"back"` (history.back()), `"anchor"` (scroll to element or top) |
| `param` | Field keys for URL template substitution from request and response |

```html
<!-- Navigate to a detail page using the response ID -->
<form action="/api/items" data-af-success-redirect="target:/items/{id}:param:id">
</form>

<!-- Go back after deletion -->
<form action="/api/items/42" data-af-method="delete"
      data-af-success-redirect="type:back">
      <input type="hidden" name="method" value="delete" data-af-to="property">
</form>

<!-- Scroll to #confirmation anchor -->
<form action="/api/submit" data-af-success-redirect="type:anchor:target:#confirmation">
</form>

<!-- refresh page -->
<form action="/api/submit" data-af-success-redirect>
</form>
```

#### `display`

Renders response data into DOM elements.

Configured via `data-af-success-display`. Uses DSL syntax with key `target`.

| DSL Key | Description |
|---------|-------------|
| `target` | CSS selector for the target container element(s). |

**Lifecycle behavior:**

| Stage | Action |
|-------|--------|
| `before` | Clears the target element (unless `append` mode). |
| `request` | Renders skeleton/loading placeholders (if `data-af-template` specifies a `skeleton` template). |
| `response` | Clears skeletons, renders the actual response data. |

Target elements support `data-af-template` for custom rendering and `data-af-value` to extract a specific key from the response.

```html
<form class="ajax-form" action="/api/search" data-af-success-display="target:#results">
  <input name="q" placeholder="Search...">
</form>
<div id="results"></div>
```

#### `querystring`

Syncs form field values to the URL query string using `history.replaceState`.

| Attribute | Description |
|-----------|-------------|
| `data-af-success-querystring` | DSL attribute. Supported keys: `add` (field names to include), `remove` (field names to exclude), `value` (alias for `add`). |

```html
<form class="ajax-form" action="/api/search" data-af-success-querystring="add:q,category,page">
  <input name="q">
  <select name="category">...</select>
  <input name="_timestamp" type="hidden">
</form>
```

#### `storage`

Persists response data to `localStorage`.

| Attribute | Description |
|-----------|-------------|
| `data-af-success-storage` | Key: `value` — field names to persist. Special value: `"timestamp"` stores `Date.now()`. |

Keys are prefixed with `{prefix}-{formId|formName}-`.

```html
<form class="ajax-form" action="/api/settings" data-af-success-storage="value:theme,lang,timestamp">
</form>
<!-- Stores: af-myForm-theme, af-myForm-lang, af-myForm-timestamp -->
```

#### `event`

Dispatches custom DOM events to target elements. Configured via `data-af-success-event`. Uses DSL syntax.

| DSL Key | Description |
|---------|-------------|
| `target` | CSS selector for target elements. |
| `event` | Custom event name(s) to dispatch. Multiple events separated by comma. |

```html
<form class="ajax-form" action="/api/cart/add"
      data-af-success-event="target:#cart-counter:event:cart\:updated">
</form>
```

#### `apply` (built-in, always active)

Maps response data back to form inputs. Fields marked with `data-af-applied="{key}"` receive the corresponding value from the response or request.

#### `trigger` (built-in, always active)

Applies response data to inputs (same as `apply`), then re-submits the form with the applied data. Enables chained form workflows.

#### `reset` (built-in, always active)

Triggers form reset after successful submission.

### Trigger Handlers

Configured via `data-af-trigger-{type}` attributes.

| Type | Behavior |
|------|----------|
| `auto` | Submits the form immediately on initialization. Supports `with` to specify data sources. |
| `click` | Submits the form when matching elements are clicked. Value is a CSS selector. |
| `change` | Submits the form when matching elements change. Value is a CSS selector. |

```html
<!-- Auto-submit on page load with pagination -->
<form class="ajax-form" action="/api/list"
      data-af-trigger-auto="with:page">
  <input name="page" value="0" type="hidden">
  <input name="size" value="20" type="hidden">
</form>

<!-- Submit on external button click or filter change -->
<form class="ajax-form" action="/api/save" data-af-trigger-click="#save-btn"
data-af-trigger-change="#category-select" >...</form>
```

### Reset Handlers

Configured via `data-af-reset`. Multiple handlers can be chained with `|`.

| Type | Phase | Behavior |
|------|-------|----------|
| `clear` | Before | Resets all named fields to their default values (including checkboxes, radios, selects). |
| `submit` | After | Triggers `ajax-form:submit` event after reset. |
| `empty` | — | (Built-in) Invokes `successHandler.before()` to clear displayed response data. |

```html
<form class="ajax-form" action="/api/search" data-af-reset="clear|submit">
</form>
```

Custom reset handlers receive the form element and can be registered as before-reset or after-reset:

```js
AjaxForm.resetHandler.add('log', el => console.log('Resetting', el.id));
AjaxForm.resetHandler.add('focus', el => el.querySelector('input')?.focus(), true);
```

---

## Middleware System

Middleware functions are executed sequentially at the specified lifecycle stage. Each middleware receives `(params, data, opts)` and can either return a value synchronously or return a `Promise`.

### Built-in Middlewares

| Name | Behavior | Typical Use |
|------|----------|-------------|
| `debug` | `console.log(...)` the data | Development debugging |
| `show` | Show target elements (`params.target`) | Conditional UI reveal |
| `hide` | Hide target elements | Conditional UI conceal |
| `alert` | `alert(params.text)` | Warning before destructive action |
| `confirm` | `confirm(params.text)` → rejects with `ERROR_CONFIRM` if cancelled | Confirmation dialogs |
| `prompt` | `prompt(params.text)` → resolves with `{ [params.name]: result }` | User input collection |
| `error` | Calls `alert({ text: err.message })` | Global fallback error display |

### Chaining and Skip Conditions

Middlewares are chained with `|`. Each can have parameters and a `skip` condition:

```
data-af-middleware-before="confirm|debug"
data-af-middleware-before="confirm:text=Are you sure?"
data-af-middleware-before="confirm:text=Delete?:skip=isAdmin"
```

The `skip` value can be:
- A truthy/falsy string (`"true"`, `"false"`)
- A global function name on `window` — the function is called with `(params, data, opts)` and should return a boolean or Promise

### Middleware Data Flow

Each middleware receives the data object. If the callback returns an object, it replaces `data` for the next middleware in the chain.

```js
AjaxForm.middleware.add('enrich', (params, data, opts) => {
  return { ...data, enriched: true, timestamp: Date.now() };
});
```

### Abort Awareness

Middleware operations are wrapped with `abortable()`, meaning they respect the form's `AbortController`. If the form is aborted, pending middleware promises are rejected.

---

## Validation System

ajax-form combines HTML5 Constraint Validation API with custom group-conditional validation.

### HTML5 Native Validation

Standard HTML5 validation attributes work out of the box:

```html
<input name="email" type="email" required>
<input name="age" type="number" min="18" max="120">
<input name="username" required pattern="[a-zA-Z0-9]{3,20}">
```

Native validation errors are reported via `form.reportValidity()`.

### Group-Conditional Validation

When multiple fields share a `data-af-validation` value and are marked `required`, they form a **validation group**:

**Rule:** If **any** field in the group has a value, then **all** fields in the group become required. If no field has a value, the group passes validation.

```html
<!-- Contact group: at least one method, but if one is filled, both are required -->
<input name="phone" data-af-validation="contact" required
       placeholder="Phone number">
<input name="email" data-af-validation="contact" required
       placeholder="Email address">
```

**How it works internally:**
1. Fields with a value disable their empty siblings (so native `required` validation doesn't trigger on them)
2. If no field in the group has a value, a custom validity message is set on the first field
3. After validation, all fields are re-enabled
4. `form.reportValidity()` is called to display native browser validation UI

**Custom messages:**

```js
AjaxForm.config.i18n = {
  validation: {
    contact: 'Please provide a phone number or email address',
  }
};
```

---

## Plugin System

Plugins are custom elements that participate in the form lifecycle. They register with the `PluginHost` via the `js-plugin:register` custom event.

### Creating a Plugin

```js
class MyPlugin extends HTMLElement {
  connectedCallback() {
    this.dispatchEvent(new CustomEvent('js-plugin:register', {
      detail: { pluginName: 'my-plugin', pluginRoot: this },
      bubbles: true,
    }));
  }
}
customElements.define('my-plugin', MyPlugin);
```

### Using a Plugin

```html
<form class="ajax-form" action="/api/submit">
  <my-plugin></my-plugin>
</form>
```

Or reference via selector:

```html
<form class="ajax-form" data-af-plugin="#my-plugin">
</form>
<div id="my-plugin"></div>
```

### Lifecycle Integration

The `PluginHost`:

- **`ready()`**: Returns a Promise that resolves when all plugins have registered. Called in the `before` stage — the form waits for plugins before proceeding.
- **`broadcast(eventName, data)`**: Sends a custom event to all registered plugin roots. Called at each lifecycle stage.

Plugins can listen for these broadcast events:

```js
this.addEventListener('ajax-form:before', e => { /* e.detail = { request } */ });
this.addEventListener('ajax-form:request', e => { /* e.detail = { request } */ });
this.addEventListener('ajax-form:response', e => { /* e.detail = { request, response, page } */ });
this.addEventListener('ajax-form:after', e => { /* e.detail = { request, response, page } or { error } */ });
this.addEventListener('ajax-form:invalid', () => { /* validation failed */ });
```

---

## File Upload

### Basic Upload

```html
<form class="ajax-form" action="/api/upload" enctype="multipart/form-data">
  <input type="file" name="file" required>
  <button>Upload</button>
</form>
```

### Multi-File Upload

```html
<form class="ajax-form" action="/api/upload" enctype="multipart/form-data">
  <input type="file" name="attachments" multiple required>
  <button>Upload</button>
</form>
```

### Progress Tracking

```html
<form class="ajax-form" action="/api/upload" enctype="multipart/form-data">
  <input type="file" name="file" required>
  <button>Upload</button>

  <div class="ajax-form-progress" hidden>
    <progress value="0" max="100"></progress>
    <span class="percent">0%</span>
  </div>
</form>

<script>
  document.querySelector('.ajax-form').addEventListener('ajax-form:upload-start', e => {
    const [percent] = e.detail;
    document.querySelector('progress').value = percent;
    document.querySelector('.percent').textContent = percent + '%';
  });
</script>
```

**Progress details:**
- The progress percentage is capped at 90% during upload (the remaining 10% accounts for response processing)
- `ajax-form:upload-start` fires with `detail: [percent]`
- `ajax-form:upload-stop` fires when complete or on error

### Aborting Uploads

```html
<button class="ajax-form-abort">Cancel Upload</button>
```

Or programmatically:

```js
formEl.dispatchEvent(new CustomEvent('ajax-form:abort'));
```

### Behind the Scenes

When `data-af-enctype="multipart/form-data"` is set (or a file input is detected), the library:
1. Constructs a `FormData` object from all form inputs
2. Sets no `Content-Type` header (browser auto-sets with boundary)
3. Sends via `XMLHttpRequest`
4. Tracks `xhr.upload.progress` events

---

## Pagination

ajax-form has built-in pagination support via the `ajax-form:page-update` event.

### Configuration

```js
AjaxForm.config.pagination = {
  page: 'page',   // field name for page number
  size: 'size',   // field name for page size
};
```

### Usage

```html
<form class="ajax-form" action="/api/items"
      data-af-success-display="target:#item-list">
  <input type="hidden" name="page" value="0">
  <input type="hidden" name="size" value="20">
</form>

<div id="item-list"></div>

<nav>
  <button onclick="goToPage(1)">Page 2</button>
  <button onclick="goToPage(2)">Page 3</button>
</nav>

<script>
  function goToPage(page) {
    const form = document.querySelector('.ajax-form');
    form.dispatchEvent(new CustomEvent('ajax-form:page-update', {
      detail: { page, size: 20 }
    }));
  }
</script>
```

The `page-update` event handler:
1. Updates `this.#with.page.data` with the new page/size values
2. Re-submits with `['page', ...detail.with]` data sources

---

## Events Reference

### Form-Level Custom Events

All events are dispatched on the `<form>` element. Listen with `addEventListener`.

| Event | `detail` Shape | When |
|-------|---------------|------|
| `ajax-form:submit` | — | Form submitted (also listens to native `submit`). |
| `ajax-form:before` | `{ request }` | After plugins ready, before validation. |
| `ajax-form:invalid` | — | Validation failed. |
| `ajax-form:request` | `{ request }` | Request is about to be sent. |
| `ajax-form:response` | `{ request, response, page }` | Response received and parsed successfully. |
| `ajax-form:after` | `{ request, response, page }` or `{ error }` | All post-processing complete (success or error). |
| `ajax-form:error` | `{ error }` | Dispatched in `#handleError` before middleware. |
| `ajax-form:abort` | — | Abort requested. |
| `ajax-form:apply` | `{ detail: { request, response } }` | Response-to-input mapping requested. |
| `ajax-form:trigger` | `{ detail: { props: { with } } }` | Form triggered via trigger handler. |
| `ajax-form:page-update` | `{ page, size, with? }` | Pagination state changed. |
| `ajax-form:upload-start` | `[percent]` (array) | Upload progress update (0–90). |
| `ajax-form:upload-stop` | — | Upload complete or aborted. |
| `reset` | — | Form reset lifecycle initiated. |

---

## Advanced Usage

### Nested Object Data

Use dot or bracket notation in input names to construct nested data objects:

```html
<form class="ajax-form" action="/api/profile">
  <input name="user.name" value="John">
  <input name="user.address.city" value="New York">
  <input name="user.address.zip" value="10001">
  <input name="tags[0]" value="developer">
  <input name="tags[1]" value="designer">
</form>
```

Submits: `{ user: { name: "John", address: { city: "New York", zip: "10001" } }, tags: ["developer", "designer"] }`

### Array Inputs with `[]` Suffix

Input names ending with `[]` are automatically collected into arrays:

```html
<input name="hobbies[]" value="reading">
<input name="hobbies[]" value="coding">
<input name="hobbies[]" value="gaming">
```

Submits: `{ hobbies: ["reading", "coding", "gaming"] }`

### Data Group Segmentation

Use `data-af-to` to send inputs to different parts of the request:

```html
<form class="ajax-form" action="/api/search">
  <!-- Goes to request body (default) -->
  <input name="keyword" value="test">

  <!-- Goes to query string -->
  <input name="filter" value="active" data-af-to="querystring">

  <!-- Goes to request header -->
  <input name="X-Tenant-Id" value="tenant-123" data-af-to="header">
</form>
```

Results in:
- Body: `{ keyword: "test" }`
- URL: `/api/search?filter=active`
- Header: `X-Tenant-Id: tenant-123`

### Value Transformation with `data-af-from`

```html
<!-- Read from localStorage before submission -->
<input name="token" data-af-from="localStorage:auth_token">

<!-- Read from global variable -->
<input name="userId" data-af-from="global:currentUser.id">
```

### Custom `data-af-to` Type

```html
<input name="extra" data-af-to="customGroup:extra">
```

This puts the value into a custom data group, accessible in the submitted data as `data.customGroup.extra` (though the default `ajax` submit handler only processes `data`, `query`, and `header` groups — custom groups would need a custom submit handler).

### URL Template Placeholders

```html
<form class="ajax-form" action="/api/users/{userId}/posts/{postId}">
  <input name="userId" value="42">
  <input name="postId" value="7">
</form>
```

The URL becomes: `/api/users/42/posts/7`

### Programmatic Instantiation (No Auto-Init)

```js
import AjaxForm from 'ajax-form';

const form = new AjaxForm({
  root: document.querySelector('#my-form'),
  config: {
    basePath: '/api/v2',
    delay: 300,
  },
  trigger: {
    auto: { with: ['page'] },
  },
  success: {
    redirect: { target: '/dashboard' },
    storage: { value: ['lastLogin'] },
  },
  middleware: {
    before: 'confirm:text=Submit this form?',
  },
  plugin: ['#custom-plugin'],
  input: ['#external-input'],
});

form.submitSync();
```

### Multiple Forms on One Page

Each form is independently managed via `AjaxForm.instance`:

```js
document.querySelectorAll('.ajax-form').forEach(el => {
  AjaxForm.instance.create(el);
});

// Later:
const searchForm = AjaxForm.instance.get(document.querySelector('#search-form'));
const loginForm = AjaxForm.instance.get(document.querySelector('#login-form'));

searchForm.submit({ with: ['querystring'] });
```

---


## Build

```bash
npm run build
```

Uses [esbuild](https://esbuild.github.io/) to produce a minified bundle with source map:

```
dist/ajax-form.min.js
dist/ajax-form.min.js.map
```

---

## Repository

[https://github.com/Kinder0102/ajax-form](https://github.com/Kinder0102/ajax-form)

## License

[ISC](https://opensource.org/licenses/ISC) © Kinder0102

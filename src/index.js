import {
  ARRAY,
  OBJECT,
  STRING_NON_BLANK,
  HTML_CHECKBOX,
  HTML_RADIO,
  ERROR_CONFIRM,
  ERROR_VALIDATION
} from 'js-common/js-constant'

import {
  assert,
  hasValue,
  isArray,
  isInteger,
  isNotBlank,
  isObject,
  isElement,
  endsWith,
  delay,
  formatString,
  toCamelCase,
  toKebabCase,
  toArray,
  objectEntries
} from 'js-common/js-utils'

import {
  elementIs,
  hasClass,
  addClass,
  querySelector,
  registerMutationObserver,
  registerEvent,
  triggerEvent,
  stopDefaultEvent,
  showElements,
  hideElements,
  enableElements,
  disableElements
} from 'js-common/js-dom-utils'

import { createProperty } from 'js-common/js-dsl-factory'
import { createDatasetHelper } from 'js-common/js-dataset-helper'
import { createInstanceMap } from 'js-common/js-cache'
import { createConfig } from 'js-common/js-config'
import { PluginHost } from 'js-common/js-plugin'
import DOMHelper from 'js-common/js-dom-helper'

import TriggerHandler from './ajax-form-trigger-handler.js'
import SubmitHandler from './ajax-form-submit-handler.js'
import SuccessHandler, { handleEvent } from './ajax-form-success-handler.js'
import ResetHandler from './ajax-form-reset-handler.js'
import requestHelper from './js-request-helper.js'
import MiddlewareFactory from './js-middleware-factory.js'

const FORM_CLASS_NAME = 'ajax-form'
const FORM_INIT_CLASS_NAME = `${FORM_CLASS_NAME}-initialized`
const FORM_APPLY_CLASS_NAME = `${FORM_CLASS_NAME}-apply`

const EVENT_SUBMIT = `submit`
const EVENT_RESET = `reset`
const EVENT_LIFECYCLE_BEFORE = `${FORM_CLASS_NAME}:before`
const EVENT_LIFECYCLE_INVALID = `${FORM_CLASS_NAME}:invalid`
const EVENT_LIFECYCLE_REQUEST = `${FORM_CLASS_NAME}:request`
const EVENT_LIFECYCLE_RESPONSE = `${FORM_CLASS_NAME}:response`
const EVENT_LIFECYCLE_AFTER = `${FORM_CLASS_NAME}:after`
const EVENT_LIFECYCLE_ERROR = `${FORM_CLASS_NAME}:error`
const EVENT_ABORT = `${FORM_CLASS_NAME}:abort`
const EVENT_APPLY = `${FORM_CLASS_NAME}:apply`
const EVENT_TRIGGER = `${FORM_CLASS_NAME}:trigger`
const EVENT_PAGE_UPDATE = `${FORM_CLASS_NAME}:page-update`
const EVENT_UPLOAD_START = `${FORM_CLASS_NAME}:upload-start`
const EVENT_UPLOAD_STOP = `${FORM_CLASS_NAME}:upload-stop`

const TRIGGER_CLICKABLE = ['button', 'a']

const UI_CONTROLS = {
  enable: { name: `${FORM_CLASS_NAME}-enable`, enable: true },
  disable: { name: `${FORM_CLASS_NAME}-disable`, enable: false },
  show: { name: `${FORM_CLASS_NAME}-show`, show: true },
  hide: { name: `${FORM_CLASS_NAME}-hide`, show: false },
  progress: { name: `${FORM_CLASS_NAME}-progress`, show: true },
  messageValidation: { name: `${FORM_CLASS_NAME}-message-validation`, show: true },
  messageSuccess: { name: `${FORM_CLASS_NAME}-message-success`, show: true },
  messageError: { name: `${FORM_CLASS_NAME}-message-error`, show: true },
}

const WITH = [
  { name: 'append' },
  { name: 'page' },
  { name: 'querystring' },
  { name: 'apply', required: true },
]

const DEFAULT_CONFIG = {
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
      localStorage: key => localStorage.getItem(key) ?? key
    }
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
    )
  },
  getCsrfToken: () => ({
    header: querySelector('meta[name="_csrf_header"]')[0]?.content || 'X-CSRF-TOKEN',
    token: querySelector('meta[name="_csrf"]')[0]?.content || ''
  })
}

SubmitHandler.add('ajax', requestHelper.request)
SuccessHandler.add('apply', handleEvent(EVENT_APPLY))
SuccessHandler.add('trigger', handleEvent(EVENT_TRIGGER))
SuccessHandler.add('reset', handleEvent(EVENT_RESET))

export default class AjaxForm {
  static config = {}
  static submitHandler = SubmitHandler
  static successHandler = SuccessHandler
  static resetHandler = ResetHandler
  static domHelper = DOMHelper
  static middleware = new MiddlewareFactory()
  static instance = createInstanceMap(
    el => elementIs(el, 'form') && hasClass(el, FORM_CLASS_NAME) && !hasClass(el, FORM_INIT_CLASS_NAME),
    root => new AjaxForm({ root }))

  #root
  #config
  #datasetHelper
  #domHelper
  #with
  #controls
  #inputs
  #plugins
  #middlewares
  #triggerHandler
  #submitHandler
  #successHandler
  #resetHandler
  #abortController

  constructor(opts = {}) {
    this.#root = elementIs(opts.root, 'form') ? opts.root : document.createElement('form')
    this.#root.noValidate = true
    this.#config = this.#initConfig(opts.config)

    const { prefix, basePath } = this.#config.get(['prefix', 'basePath'])
    this.#datasetHelper = createDatasetHelper(prefix)
    this.#domHelper = new DOMHelper({ prefix, basePath })
    this.#with = { querystring: { data: getQuerystring() } }
    this.#controls = this.#initUIControls(opts.control)
    this.#inputs = toArray(opts.input)
    this.#plugins = this.#initPlugins(opts.plugin)
    this.#middlewares = opts.middleware || {}
    this.#triggerHandler = this.#initTriggerHandler(opts.trigger)
    this.#submitHandler = this.#initSubmitHandler()
    this.#successHandler = this.#initSuccessHandler(opts.success)
    this.#resetHandler = new ResetHandler(this.#root)
    this.#resetHandler.add('empty', this.#successHandler.before)

    registerEvent(this.#root, EVENT_SUBMIT, event => {
      stopDefaultEvent(event)
      this.submitSync()
    })
    registerEvent(this.#root, EVENT_APPLY, this.#handleEventApplied.bind(this))
    registerEvent(this.#root, EVENT_TRIGGER, this.#handleEventTriggered.bind(this))
    registerEvent(this.#root, EVENT_PAGE_UPDATE, this.#handleEventPageUpdate.bind(this))
    registerEvent(this.#root, EVENT_RESET, this.#handleEventReset.bind(this))
    registerEvent(this.#root, EVENT_ABORT, () => this.#abortController?.abort())
    registerEvent(querySelector(`.${FORM_CLASS_NAME}-abort`, this.#root),
      'click', () => this.#abortController?.abort())

    addClass(this.#root, FORM_INIT_CLASS_NAME)
    this.#triggerHandler.apply()
  }

  submit(opts = {}) {
    const { data, ...options } = { ...opts, ...this.#generateDataAndProps(opts.with) }
    this.#abortController = new AbortController()
    options.abort = this.#abortController
    options.id = crypto?.randomUUID?.();

    return this.#handleBefore(data, options)
      .then(request => this.#handleValidation(request, options))
      .then(request => this.#handleRequest(request, options))
      .then(({ request, response }) => this.#handleResponse(request, response, options))
      .then(data => this.#handleAfter(data, options))
      .catch(error => this.#handleError(error, options))
  }

  submitSync(opts) {
    this.submit(opts).catch(_ => { })
  }

  #initConfig(config = {}) {
    const prefix = AjaxForm.config.prefix || DEFAULT_CONFIG.prefix
    const props = createProperty(this.#root.dataset[`${prefix}Config`])[0]
    for (const [key, [value] = values] of objectEntries(props)) {
      hasValue(value) && (config[key] = value)
    }
    return createConfig(config, AjaxForm.config, DEFAULT_CONFIG)
  }

  #initUIControls(controls = {}) {
    assert(isObject(controls), 1, OBJECT)
    let result = {}
    for (const [key, { name }] of objectEntries(UI_CONTROLS)) {
      result[key] = [
        ...querySelector(this.#datasetToProps(key).value),
        ...querySelector(`.${name}`, this.#root)
      ]
    }
    for (const [type, value] of objectEntries(controls)) {
      querySelector(value).forEach(elem => result[type]?.push(elem))
    }

    [
      ...querySelector(`button[type="submit"], button:not([type])`, this.#root),
      ...querySelector(this.#datasetToProps(`${TriggerHandler.key}-click`).value)
    ].forEach(el => result.disable?.push(el))
    return result
  }

  #initPlugins(plugins = []) {
    assert(isArray(plugins), 1, ARRAY)
    const host = new PluginHost(this.#root)
    const result = [
      ...querySelector(plugins),
      ...querySelector(this.#datasetToProps('plugin').value),
    ]
    result.forEach(el => host.addPlugin(el))
    return host
  }

  #initTriggerHandler(handlerProps = {}) {
    assert(isObject(handlerProps), 1, OBJECT)
    return new TriggerHandler({
      root: this.#root,
      handlerProps, ...this.#config.get('prefix'),
      submitCallback: this.submitSync.bind(this),
    })
  }

  #initSubmitHandler() {
    const handleProgress = this.#handleProgress.bind(this)
    const {
      prefix,
      basePath,
      create: createResponse
    } = this.#config.get(['prefix', 'basePath', 'response.create'])
    return new SubmitHandler({ prefix, basePath, createResponse, handleProgress })
  }

  #initSuccessHandler(handlerProps = {}) {
    assert(isObject(handlerProps), 1, OBJECT)
    return new SuccessHandler({
      root: this.#root,
      domHelper: this.#domHelper,
      handlerProps, ...this.#config.get(['prefix', 'basePath']),
    })
  }

  #handleBefore(request, opts) {
    return this.#plugins.ready()
      .then(() => this.#getMiddleware('before', opts)({ request }))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(result => {
        const data = { request: result }
        this.#plugins.broadcast(EVENT_LIFECYCLE_BEFORE, data)
        this.#resetUIControls()
        this.#successHandler.before(opts, data)
        return result
      })
  }

  #handleValidation(request, opts) {
    const validation = new Set()
    const attrName = this.#datasetHelper.keyToAttrName('validation')
    const groups = this.#queryFormInput(`[${attrName}][required]`).reduce((acc, input) => {
      input.setCustomValidity('')
      const group = input.getAttribute(attrName)
      acc[group] ||= []
      acc[group].push(input)
      return acc
    }, {})

    for (const [group, inputs] of objectEntries(groups)) {
      if (inputs.some(input => isNotBlank(input.value))) {
        inputs.forEach(input => !isNotBlank(input.value) && (input.disabled = true))
      } else {
        inputs[0]?.setCustomValidity(AjaxForm.config.i18n?.validation?.[group] || group)
      }
    }

    this.#queryFormInput().forEach(el => {
      !el.validity.valid && validation.add(el.name)
      el.disabled = false
    })

    return this.#getMiddleware('validation', opts)({ request, validation })
      .then(result => toArray(result?.validation).filter(isNotBlank))
      .then(result => {
        result.forEach(validation.add, validation)

        if (validation.size > 0) {
          this.#root.reportValidity()
          this.#plugins.broadcast(EVENT_LIFECYCLE_INVALID)
          showElements(this.#controls.messageValidation)
          throw new Error(ERROR_VALIDATION)
        }
        return request
      })
  }

  #handleRequest(request, opts) {
    const type = this.#getParameters('type', opts)[0] || 'ajax'

    // TODO refactor for sse, websocket, download file
    // TODO querystring
    const requestParams = {
      method: this.#getParameters('method', opts)[0],
      url: this.#getParameters('action', opts, opts.url)[0],
      enctype: this.#getParameters('enctype', opts)[0],
      csrf: this.#config.get('getCsrfToken')['getCsrfToken']?.(),
      headers: opts.header
    }

    enableElements(this.#controls.enable)
    disableElements(this.#controls.disable)
    showElements(this.#controls.show)
    hideElements(this.#controls.hide)

    return delay(this.#config.get('delay').delay)
      .then(() => this.#getMiddleware('request', opts)({ request }))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(result => {
        const data = { request: result }
        this.#plugins.broadcast(EVENT_LIFECYCLE_REQUEST, data)
        this.#successHandler.request(opts, data)
        return this.#submitHandler.run(type, opts, result, requestParams)
          .then(res => ({ ...data, response: res }))
      })
  }

  #handleResponse(request, response, opts) {
    const { getData, getPage, checkResponse } = this.#config.get([
      'response.getData',
      'response.getPage',
      'response.checkResponse',
    ])

    return this.#getMiddleware('response', opts)({ request, response })
      .then(result => hasValue(result?.response) ? result.response : response)
      .then(result => checkResponse(result) ? result : Promise.reject(result))
      .then(result => {
        const data = {
          request,
          response: getData(result),
          page: getPage(result)
        }
        this.#plugins.broadcast(EVENT_LIFECYCLE_RESPONSE, data)
        triggerEvent(this.#controls.progress, EVENT_UPLOAD_STOP)
        this.#resetUIControls()
        this.#successHandler.response(opts, data)
        return data
      })
  }

  #handleAfter(data, opts) {
    return this.#getMiddleware('after', opts)(data).then(_ => {
      this.#plugins.broadcast(EVENT_LIFECYCLE_AFTER, data)
      showElements(this.#controls.messageSuccess)
      this.#successHandler.after(opts, data)
      return data
    })
  }

  #handleError(error, opts) {
    console.error(error)
    switch (error?.message) {
      case ERROR_VALIDATION:
        return
      case ERROR_CONFIRM:
        return this.#resetUIControls()
    }

    const { getError } = this.#config.get(['response.getError'])
    error = { ...error, message: getError(error) }
    this.#plugins.broadcast(EVENT_LIFECYCLE_AFTER, { error })
    triggerEvent(this.#controls.progress, EVENT_UPLOAD_STOP)
    this.#resetUIControls()

    return this.#getMiddleware('error', opts)(error)
      .then(result => result ?? error)
      .then(result => {
        const { messageError } = this.#controls
        if (messageError.length > 0) {
          messageError.forEach(elem => this.#domHelper.setValueToElement(elem, result))
          showElements(messageError)
        } else {
          AjaxForm.middleware.get('error')?.(result)
        }
        throw result
      })
  }

  #handleProgress(event = {}) {
    const { lengthComputable, loaded, total } = event
    if (!lengthComputable)
      return

    const percent = Number.parseInt(loaded / total * 90)
    triggerEvent(this.#controls.progress, EVENT_UPLOAD_START, [percent])
  }

  #handleEventApplied(event) {
    stopDefaultEvent(event)
    this.#with.apply ||= {}
    const attrName = this.#datasetHelper.keyToAttrName('applied')
    const selectors = new Map()
    const payload = {
      request: event?.detail?.request,
      response: event?.detail?.response,
    }

    for (const [type, applyData] of objectEntries(payload)) {
      if (isObject(applyData)) {
        for (const [key, value] of objectEntries(applyData)) {
          selectors.set(`[${attrName}="${key}"],[${attrName}-${type}="${key}"]`, value)
        }
      } else if (hasValue(applyData)) {
        selectors.set(`[${attrName}="${FORM_APPLY_CLASS_NAME}-${type}"]`, applyData)
      }
    }
    selectors.forEach((value, selector) => this.#queryFormInput(selector).forEach(el => {
      const toProps = this.#datasetToProps('to', el)
      const toType = toProps.type[0] ?? toProps?.value[0] ?? 'data'
      this.#with.apply[toType] ||= {}
      this.#with.apply[toType][el.name] = value
    }))
  }

  #handleEventTriggered(event) {
    this.#handleEventApplied(event)
    this.submitSync({ with: event?.detail?.props?.with })
  }

  #handleEventPageUpdate(event) {
    stopDefaultEvent(event)
    const { pagination } = this.#config.get('pagination')
    const { detail } = event
    this.#with.page = {
      data: {
        [pagination.page]: detail[pagination.page],
        [pagination.size]: detail[pagination.size],
      }
    }
    this.submitSync({ with: ['page', ...(detail.with ?? [])] })
  }

  #handleEventReset(event) {
    this.#plugins.broadcast(EVENT_RESET)
    this.#resetUIControls()
    this.#resetHandler.run(this.#datasetToProps('reset'))
  }

  #getParameters(key, opts, defaultValue) {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)

    const kebabKey = toKebabCase(key)

    if (isObject(opts)) {
      const camelKey = toCamelCase(key)
      const value = opts[camelKey] ?? opts[kebabKey] ?? opts.property?.[camelKey] ?? opts.property?.[kebabKey]
      if (hasValue(value))
        return toArray(value)
    }

    const dataAttrValue = this.#datasetHelper.getValue(this.#root, kebabKey)
    if (isNotBlank(dataAttrValue))
      return toArray(dataAttrValue)

    const attrValue = this.#root.getAttribute(kebabKey)
    if (isNotBlank(attrValue))
      return toArray(attrValue)

    return toArray(defaultValue)
  }

  #datasetToProps(key, el = this.#root) {
    return createProperty(this.#datasetHelper.getValue(el, key))[0] ?? {}
  }

  #getMiddleware(lifecycle, opts) {
    const attrName = `middleware-${lifecycle}`
    const middleware = opts.property?.[attrName] ?? this.#middlewares?.[lifecycle]
    const props = this.#datasetHelper.getValue(this.#root, attrName, middleware)
    return AjaxForm.middleware.create(props, {
      root: this.#root,
      abort: opts.abort
    })
  }

  #resetUIControls() {
    for (const [key, elements] of objectEntries(this.#controls)) {
      const control = UI_CONTROLS[key]
      if (hasValue(control?.show))
        control?.show ? hideElements(elements) : showElements(elements)
      if (hasValue(control?.enable))
        control?.enable ? disableElements(elements) : enableElements(elements)
    }
  }

  #queryFormInput(selector) {
    const inputs = [
      ...this.#root.elements,
      ...querySelector(this.#datasetToProps('input').value),
      ...querySelector(this.#inputs)
    ]
    return inputs.filter(el => !el.disabled && isNotBlank(el.name)).reduce((acc, el) => {
      if (isNotBlank(selector)) {
        el.matches(selector) && acc.push(el)
      } else {
        acc.push(el)
      }
      return acc
    }, [])
  }

  #generateDataAndProps(withParams = []) {
    const { from } = this.#config.get('request.from')
    const groups = {}

    for (const el of this.#queryFormInput()) {
      const toProps = this.#datasetToProps('to', el)
      const toType = toProps.type[0] ?? toProps?.value[0] ?? 'data'
      const { exist, value } = endsWith(el.name, '[]')
      groups[toType] ||= {}
      const target = groups[toType]
      if (hasValue(target[value]) || exist) {
        target[value] = toArray(target[value])
        target[value].push(el)
      } else {
        target[value] = el
      }
    }

    for (const { name, required } of WITH) {
      if (required || withParams.includes(name)) {
        for (const [toType, values] of objectEntries(this.#with[name])) {
          for (const [key, value] of objectEntries(values)) {
            groups[toType] ||= {}
            groups[toType][key] = value
          }
        }
      }
    }

    const result = {}
    for (const [type, group] of objectEntries(groups)) {
      result[type] ||= {}
      for (const [name, el] of objectEntries(group)) {
        let value
        if (isArray(el)) {
          value = el.flatMap(elem => this.#getElementValue(elem, from)).filter(hasValue)
          value = elementIs(el[0], HTML_RADIO) ? value[0] : value
        } else {
          value = this.#getElementValue(el, from)
        }
        setNestedValue(result[type], name, value)
      }
    }
    return deepFilterArrays(result)
  }

  #getElementValue(el, getFrom) {
    if (!isElement(el))
      return el
    let result
    const { value, checked, files } = el
    const type = this.#datasetHelper.getValue(el, 'type', el.type)
    switch (type) {
      case 'month':
      case 'date':
      case 'datetime-local':
        return isNotBlank(value) ? new Date(value).getTime() : undefined
      case 'file':
        return el.multiple ? toArray(files) : files[0]
      case 'select-multiple':
        return toArray(el.selectedOptions).map(opts => opts.value)
      case HTML_CHECKBOX:
        result = value !== 'on' && value ? (checked ? value : undefined) : checked
        break
      case HTML_RADIO:
        result = checked ? value : undefined
        break
      default:
        result = el.value
    }

    if (result !== undefined) {
      const { type: [fromType], value: [pattern] } = this.#datasetToProps('from', el)
      const key = formatString(pattern, result)
      return getFrom?.[fromType]?.(key) ?? key
    }
  }
}

function getQuerystring() {
  const query = new URLSearchParams(location.search)
  const data = {}
  query.forEach((value, key) => {
    if (!data.hasOwnProperty(key)) {
      const values = query.getAll(key)
      data[key] = values.length > 1 ? values : value
    }
  })
  return data
}

function setNestedValue(obj, name, value) {
  if (!hasValue(value) || !isObject(obj))
    return

  const keys = isArray(name) ? name : (name.toString().match(/[^.[\]]+/g) || [])
  keys.slice(0, -1).reduce((acc, key, index) => {
    if (Object(acc[key]) === acc[key]) {
      return acc[key]
    } else {
      acc[key] = isInteger(keys[index + 1]) ? [] : {}
      return acc[key]
    }
  }, obj)[keys[keys.length - 1]] = value
}

function deepFilterArrays(obj) {
  if (obj instanceof File || obj instanceof Blob || obj instanceof Date)
    return obj

  if (isArray(obj)) {
    return obj.filter(hasValue).map(deepFilterArrays)
  } else if (isObject(obj)) {
    return Object.fromEntries(
      objectEntries(obj).map(([key, value]) => [key, deepFilterArrays(value)])
    )
  }
  return obj
}

globalThis.AjaxForm = AjaxForm
globalThis.addEventListener('DOMContentLoaded', event => {
  const selector = `.${FORM_CLASS_NAME}`
  querySelector(selector).forEach(form => AjaxForm.instance.create(form))
  registerMutationObserver(el =>
    querySelector(selector, el, true).forEach(form => AjaxForm.instance.create(form)))
}, { once: true })

import { STRING_NON_BLANK, FUNCTION } from 'js-common/js-constant'
import { assert, isFunction, isNotBlank, isTrue, hasValue, objectEntries } from 'js-common/js-utils'
import { querySelector, registerEvent } from 'js-common/js-dom-utils'
import { createProperty } from 'js-common/js-dsl-factory'
import { createDatasetHelper } from 'js-common/js-dataset-helper'

let HANDLERS = {
  auto: handleAuto,
  click: handleEvent('click'),
  change: handleEvent('change'),
}

export default class AjaxFormTriggerHandler {

  static key = 'trigger'
  static add = (type, callback) => {
    assert(isNotBlank(type), 1, STRING_NON_BLANK)
    assert(isFunction(callback), 2, FUNCTION)
    HANDLERS[type] = callback
  }

  #root
  #datasetHelper
  #handlerProps
  #submitCallback

  constructor({ root, prefix, handlerProps, submitCallback }) {
    this.#root = root
    this.#datasetHelper = createDatasetHelper(prefix)
    this.#handlerProps = this.#datasetHelper.resolveValues(this.#root, AjaxFormTriggerHandler.key, handlerProps)
    this.#submitCallback = submitCallback
  }

  apply() {
    for (const [type, props] of objectEntries(this.#handlerProps))
      HANDLERS[type]?.(this.#root, createProperty(props), this.#submitCallback)
  }
}

export function handleEvent(eventName) {
  return (_, props, callback) => {
    if (props?.value?.length > 0)
      registerEvent(querySelector(props.value), eventName, callback)
  }
}

function handleAuto(root, props, callback) {
  if (hasValue(props?.condition)) {
    const condition = globalThis[props.condition]
    if (isFunction(condition)) {
      if (!condition(root, props))
        return
    } else if (!isTrue(props.condition)) {
      return
    }
  }
  callback({ with: props?.with })
}

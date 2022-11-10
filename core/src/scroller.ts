import iterativelyWalk from '@elonehoo/dom-traversal'
import convert from '@elonehoo/colors-convert'
import throttle from 'throttle-debounce/throttle'
import { getObjectFromArrById, is, merge } from './utils'

const defaultConfig = {
  stageSwitchTransition: 800,
  stageSwitchDelay: 0,
  stageSwitchEasing: 'cubic-bezier(.86, 0, .07, 1)',
  disableAfterSwitching: 500,
  stages: []
}
const defaultStageConfig = {
  scrollNumber: 1,
  transition: 200,
  easing: 'ease',
  items: []
}
const numberRegExp = new RegExp(/-?\d+(?:\.\d+)?/, 'g')
const vendors = ['webkit', 'ms', 'moz', '']

class Scroll {
  private target:any
  private config:any
  private animating:boolean
  private switching:boolean
  private stages:any
  private activeStageIndex:number
  private boundHandleScroll:any
  private throttledHandleStepChange:any
  private activeStage:any
  private switchingTimeout:any
  private animatingTimeout:any

  constructor(target:any, config:any) {
    if (typeof target === 'string') {
      target = document.querySelector(target)
    }
    if (!target || target.nodeType !== 1) {
      throw new Error('Cannot find target dom to apply scroll effects')
    }
    config = merge({}, [defaultConfig, config])
    target.style.overflow = 'hidden'

    this.target = target
    this.config = config
    this.animating = false
    this.switching = false
    this.stages = []
    this.activeStageIndex = 0

    this.initStages()
    this.processStages()
    this.defineActiveStage()
    this.addEventListeners()
  }

  defineActiveStage() {
    let activeStage = this.stages[this.activeStageIndex]
    const self = this
    Object.defineProperty(this, 'activeStage', {
      get: function() {
        return activeStage
      },
      set: function(value) {
        if (value === activeStage) return
        const oldActiveStage = JSON.parse(JSON.stringify(activeStage))
        activeStage = value
        self.activeStageIndex = self.stages.findIndex((stage:any) => stage === value)
        self.handleActiveStageChange()
        self.target.dispatchEvent(new CustomEvent('stage-change', {
          detail: {
            previous: {
              id: oldActiveStage.id,
              node: oldActiveStage.node,
              config: oldActiveStage.stageConfig,
              step: oldActiveStage.step
            },
            current: {
              id: value.id,
              node: value.node,
              config: value.stageConfig
            }
          }
        }))
      }
    })
  }

  addEventListeners() {
    this.boundHandleScroll = this.handleScroll.bind(this)
    this.throttledHandleStepChange = throttle(50, true, this.handleStepChange, true)
    document.addEventListener('wheel', this.boundHandleScroll)
  }

  removeEventListeners() {
    document.removeEventListener('wheel', this.boundHandleScroll)
  }

  initStages() {
    iterativelyWalk(this.target, (node:any) => {
      if (node.nodeType !== 1) return
      const stageId = node.getAttribute('data-scroll-stage-id')
      if (stageId) {
        const stageConfig = getObjectFromArrById(this.config.stages, stageId)
        if (!stageConfig) {
          throw new Error(`
            Missing scrolling config for stage id: ${ stageId }
          `)
        }
        node.style.transition = `
          ${ this.config.stageSwitchTransition }ms ${ this.config.stageSwitchEasing } ${ this.config.stageSwitchDelay }ms
        `
        this.stages.push({
          node,
          stageConfig: merge({}, [defaultStageConfig, stageConfig]),
          id: stageId,
          step: 0
        })
      }
    })
  }

  processStages() {
    this.stages.forEach((stage:any) => {
      Scroll.attachNodeToItems(stage)
      this.processItemEffects(stage)
    })
  }

  static attachNodeToItems(stage:any) {
    iterativelyWalk(stage.node, (node:any) => {
      if (node.nodeType !== 1) return
      const itemId = node.getAttribute('data-scroll-item-id')
      if (itemId) {
        const itemConfig = getObjectFromArrById(stage.stageConfig.items, itemId)
        if (!itemConfig) throw new Error(`Missing scrolling config for item id: ${ itemId }`)
        itemConfig.node = node
      }
    })
  }

  processItemEffects(stage:any) {
    stage.stageConfig.items.forEach((item:any) => {
      item.effects.forEach((effect:any) => {
        if (effect.startAt === undefined) effect.startAt = 0
        if (effect.endAt === undefined) effect.endAt = Number(stage.stageConfig.scrollNumber)
        Scroll.processColorValues(effect)
        effect.startNumbers = (effect.start.match(numberRegExp) || []).map((item:any) => Number(item))
        effect.endNumbers = (effect.end.match(numberRegExp) || []).map((item:any) => Number(item))
        effect.strings = effect.start.split(numberRegExp)
      })
    })
  }

  static getCurrentStyleValue(effect:any, step:any) {
    const { startAt, endAt, startNumbers, endNumbers, strings, isColor } = effect
    step = Math.min(endAt, Math.max(startAt, step))
    let result = strings[0]
    let alphaIndex = -1
    if (startNumbers && startNumbers.length > 0) {
      startNumbers.forEach((startNumber:any, index:any) => {
        if ((/rgba/).test(strings[index])) alphaIndex = index + 3
        let stepNumber = startNumber + (step - startAt) *
          (endNumbers[index] - startNumber) / (endAt - startAt)
        if (isColor && index !== alphaIndex) stepNumber = Math.round(stepNumber)
        result += `${ stepNumber }${ strings[index + 1] }`
      })
    }
    return result
  }

  static processColorValues(effect:any) {
    ['start', 'end'].forEach(key => {
      let effectValue = effect[key]
      const effectFormat = is(effectValue)
      if (!effectFormat) return
      effect.isColor = true
      if (effectFormat === 'hex') {
        effectValue = `
          rgb(${ convert.hex.rgb(effectValue).join(',') })
        `
      } else if (effectFormat === 'hsl') {
        const [hue, saturation, lightness, alpha] =
          effectValue
            .match(/hsla?\((.*)\)/)[1]
            .split(/\s*,\s*/)
            .map((value:any) => parseFloat(value))
        effectValue = `
          rgba(${ convert.hsl.rgb([hue, saturation, lightness]).join(',') }, ${ alpha === undefined ? 1 : alpha })
        `
      }
      effect[key] = effectValue
    })
  }

  setActiveStage(id:any, changeByScroll = false) {
    if (this.activeStage.id === id) return
    const oldIndex = this.activeStageIndex
    this.activeStage.step = 0
    const newStage = getObjectFromArrById(this.stages, id) || this.stages[0]
    const newIndex = this.stages.findIndex((stage:any) => stage === newStage)
    if (changeByScroll) {
      newStage.step = oldIndex < newIndex
        ? 0
        : Number(newStage.stageConfig.scrollNumber)
      this.activeStage = newStage
      this.handleStepChange(false, false)
    } else {
      this.activeStage = newStage
      this.handleStepChange(false, false)
    }
  }

  handleActiveStageChange() {
    clearTimeout(this.switchingTimeout)
    this.switching = true
    this.stages.forEach((stage:any) => {
      vendors.forEach(vendor => {
        const property = vendor.length ? `${ vendor }Transform` : 'transform'
        stage.node.style[property] = `translateY(${ -this.activeStageIndex * 100 }%)`
      })
    })
    this.switchingTimeout = setTimeout((_:any) => {
      this.switching = false
    }, Number(this.config.stageSwitchTransition) + Number(this.config.disableAfterSwitching))
  }

  setStep(step:any) {
    const type = typeof step
    if (type !== 'number') throw new Error(`step should be a number, got ${ type }`)
    if (step < 0 || step > Number(this.activeStage.stageConfig.scrollNumber)) {
      throw new Error(`
        step should be within [0, ${ this.activeStage.stageConfig.scrollNumber }], got ${ step }
      `)
    }
    if (this.activeStage.step === step) return
    this.activeStage.step = step
    this.handleStepChange()
  }

  getActiveStage() {
    return this.activeStage
  }

  getStep() {
    return this.activeStage.step
  }

  handleStepChange(needTransition = true, dispatchEvent = true) {
    const step = this.activeStage.step
    const stageConfig = this.activeStage.stageConfig
    const activeIndex = this.activeStageIndex

    if (step > Number(stageConfig.scrollNumber)) {
      if (activeIndex === this.stages.length - 1) {
        this.target.dispatchEvent(new CustomEvent('scroll-out', {
          detail: { direction: 'bottom' }
        }))
        this.activeStage.step = Number(stageConfig.scrollNumber)
        return
      }
      this.setActiveStage(this.stages[activeIndex + 1].id, true)
    } else if (step < 0) {
      if (activeIndex === 0) {
        this.target.dispatchEvent(new CustomEvent('scroll-out', {
          detail: { direction: 'top' }
        }))
        this.activeStage.step = 0
        return
      }
      this.setActiveStage(this.stages[activeIndex - 1].id, true)
    } else {
      clearTimeout(this.animatingTimeout)
      this.animating = true
      stageConfig.items.forEach((item:any) => {
        item.node.style.transition = needTransition
          ? `${ stageConfig.transition }ms ${ stageConfig.easing }`
          : 'none'
        item.effects.forEach((effect:any) => {
          item.node.style[effect.property] = Scroll.getCurrentStyleValue(effect, step)
        })
      })

      if (dispatchEvent) {
        this.target.dispatchEvent(new CustomEvent('step-change', {
          detail: {
            activeStage: {
              id: this.activeStage.id,
              node: this.activeStage.node,
              config: stageConfig
            },
            current: step
          }
        }))
      }

      this.animatingTimeout = setTimeout((_:any) => {
        this.animating = false
      }, needTransition ? Number(stageConfig.transition) : 0)
    }
  }

  handleScroll(event:any) {
    event.preventDefault()
    if (this.animating || this.switching) return

    this.activeStage.step += event.deltaY > 0 ? 1 : -1
    this.throttledHandleStepChange()
  }

  destroy() {
    this.removeEventListeners()
  }

  restore() {
    this.addEventListeners()
  }
}
export default Scroll

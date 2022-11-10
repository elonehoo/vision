import iterativelyWalk from '@elonehoo/dom-traversal'
import { merge } from './utils'

const defaultConfig = {
  layers: [],
  max: 20,
  reverseTilt: false,
  perspective: 1000,
  easing: 'cubic-bezier(.03, .98, .52, .99)',
  scale: 1,
  speed: 300,
  disabledAxis: '',
  reset: true
}

class Hover {
  private target:any
  private config:any
  private layers:any[]
  private left:number = 0
  private top:number = 0
  private width:number = 0
  private height:number = 0
  private transitionTimeout: any

  constructor(target:any, config:any) {
    if (typeof target === 'string') {
      target = document.querySelector(target)
    }
    if (!target || target.nodeType !== 1) {
      throw new Error('Cannot find target dom to apply hover effects')
    }
    config = merge({}, [defaultConfig, config])

    this.target = target
    this.config = config
    this.layers = []

    iterativelyWalk(target, (node:any) => {
      if (node.nodeType !== 1) return
      const layer = node.getAttribute('data-hover-layer')
      if (layer) {
        const configMultiple = config.layers[Number(layer)].multiple
        if (!configMultiple) throw new Error(`Missing translate config for ${ layer }`)
        this.layers.push(merge({
          node,
          multiple: configMultiple === undefined ? 0.2 : configMultiple,
          reverseTranslate: !!config.layers[Number(layer)].reverseTranslate
        }, [Hover.getInitialTransformMatrix(node)]))
      }
    })
    this.target.style.transform = `perspective(${ this.config.perspective }px)`
    this.addEventHandlers()
  }

  /**
   * get the CSS transform matrix of a node, also returns the indexes of the value of translateX and translateY in the matrix
   * @param {Object} node - target node dom
   * @returns {{matrixArr: [number,number,number,number,number,number], translateXIndex: number, translateYIndex: number}}
   */
  static getInitialTransformMatrix(node:Element) {
    const matrixMatch = (window.getComputedStyle(node).transform).match(/matrix.*\((.*)\)/)
    let matrixArr:number[] | string[] = [1, 0, 0, 1, 0, 0]
    let translateXIndex = 4
    let translateYIndex = 5
    if (matrixMatch && matrixMatch[1]) {
      matrixArr = matrixMatch[1].split(/\s*\,\s*/)
    }
    if (matrixArr.length === 16) {
      translateXIndex = 12
      translateYIndex = 13
    }
    return {
      matrixArr,
      translateXIndex,
      translateYIndex
    }
  }

  addEventHandlers() {
    this.target.addEventListener('mouseenter', this.onMouseEnter.bind(this))
    this.target.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.target.addEventListener('mouseleave', this.onMouseLeave.bind(this))
  }

  /**
   * actually assign the translations
   * @param {Object} layer - the layer object that needs to be translated
   * @param {number} offsetX - translation offset in x axis
   * @param {number} offsetY - translation offset in y axis
   */
  doTranslate(layer:any, offsetX:number, offsetY:number) {
    const vendors = ['webkitTransform', 'msTransform', 'mozTransform', 'transform']
    const { node, matrixArr, translateXIndex, translateYIndex } = layer
    const matrixArrCopy = matrixArr.slice()
    matrixArrCopy[translateXIndex] = Number(matrixArrCopy[translateXIndex]) + offsetX
    matrixArrCopy[translateYIndex] = Number(matrixArrCopy[translateYIndex]) + offsetY
    const matrix = matrixArrCopy.join(', ')
    vendors.forEach(key => {
      node.style[key] = `${ matrixArr.length === 6 ? 'matrix' : 'matrix3d' }(${ matrix })`
    })
  }

  /**
   * calculate and assign transitions
   * @param {Object} layer - the layer object
   * @param {number} x - clientX of mouse event
   * @param {number} y - clientY of mouse event
   */
  translateLayers(layer:any, x:number, y:number) {
    const { multiple, reverseTranslate } = layer
    const offsetX = Math.floor(multiple * (0.5 * document.body.clientWidth + (reverseTranslate ? -1 : 1) * x))
    const offsetY = Math.floor(multiple * (0.5 * document.body.clientHeight + (reverseTranslate ? -1 : 1) * y))
    this.doTranslate(layer, offsetX, offsetY)
  }

  getValues(event:any) {
    let x = (event.pageX - this.left) / this.width
    let y = (event.pageY - this.top) / this.height

    x = Math.min(Math.max(x, 0), 1)
    y = Math.min(Math.max(y, 0), 1)

    const tiltX = (this.config.reverseTilt ? -1 : 1) * (this.config.max / 2 - x * this.config.max).toFixed(2)
    const tiltY = (this.config.reverseTilt ? -1 : 1) * (y * this.config.max - this.config.max / 2).toFixed(2)
    return {
      tiltX,
      tiltY
    }
  }

  setTransition() {
    clearTimeout(this.transitionTimeout)
    this.target.style.transition = `${ this.config.speed }ms ${ this.config.easing }`
    this.transitionTimeout = setTimeout(_ => {
      this.target.style.transition = ''
    }, this.config.speed)
  }

  onMouseEnter(event:any) {
    this.width = this.target.offsetWidth
    this.height = this.target.offsetHeight
    this.left = this.target.offsetLeft
    this.top = this.target.offsetTop
    this.setTransition()

    this.layers.forEach((layer:any) => {
      layer.node.style.transition = `${ this.config.speed }ms ${ this.config.easing }`
      this.translateLayers(layer, event.clientX, event.clientY)
    })
    setTimeout(() => {
      this.layers.forEach(({ node }) => {
        node.style.transition = 'none'
      })
    }, this.config.speed)
  }

  onMouseMove(event:any) {
    const values = this.getValues(event)
    this.target.style.transform = `
      perspective(${ this.config.perspective }px)
      rotateX(${ this.config.disabledAxis === 'x' ? 0 : values.tiltY }deg)
      rotateY(${ this.config.disabledAxis === 'y' ? 0 : values.tiltX }deg)
      scale3d(${ this.config.scale }, ${ this.config.scale }, ${ this.config.scale })
    `
    window.requestAnimationFrame(_ => {
      this.layers.forEach((layer:any) => {
        this.translateLayers(layer, event.clientX, event.clientY)
      })
    })
  }

  onMouseLeave() {
    if (this.config.reset !== true) return

    this.setTransition()
    this.target.style.transform = `
      perspective(${ this.config.perspective }px)
      rotateX(0deg)
      rotateY(0deg)
      scale3d(1, 1, 1)
    `
    this.layers.forEach((layer:any) => {
      layer.node.style.transition = `${ this.config.speed }ms ${ this.config.easing }`
      this.doTranslate(layer, 0, 0)
    })
  }
}

export default Hover

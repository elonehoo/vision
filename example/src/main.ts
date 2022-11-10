import { Scroll } from 'vision'
import scrollConfig from './scroll.json'

function start() {
  new Scroll('#wrap', scrollConfig)
}

window.onload = start

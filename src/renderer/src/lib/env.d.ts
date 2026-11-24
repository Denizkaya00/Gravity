import type { GravityAPI } from '../../../preload/index'

declare global {
  interface Window {
    gravity: GravityAPI
  }
}


export {}

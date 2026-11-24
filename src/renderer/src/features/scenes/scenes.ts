import type { MountainPhoto, SceneId } from '@shared/types'
import { WAVE } from './wave'
import { photoScene } from './photo'
// Hokusai, "Under the Wave off Kanagawa", c. 1831. Public domain; the
// Metropolitan Museum of Art's scan, via Wikimedia Commons, resized to 1600px.
import greatWave from './great-wave.jpg'
// Photographs from Unsplash, free to use under the Unsplash License
// (https://unsplash.com/license), resized to at most 3840px. Credits in README.md.
// Dunes at Merzouga, Morocco, Mark Kuiper: https://unsplash.com/photos/2BMSj-xN008
import dunesDay from './photos/dunes-day.jpg'
// The Arabian Desert at night, Mike Iukhtenko: https://unsplash.com/photos/a2kD4b0KK4s
import dunesNight from './photos/dunes-night.jpg'
// Fog over a conifer forest, Vadim Sherbakov: https://unsplash.com/photos/NQSWvyVRIJk
import forestDay from './photos/forest-day.jpg'
// Ridges above misty valleys, Alessio Soggetti: https://unsplash.com/photos/zxcBR3zNc7I
import valleys from './photos/mountain-valleys.jpg'
import valleysThumb from './photos/thumbs/mountain-valleys.jpg'
// Ama Dablam at dusk, Nepal, Eugene Ga: https://unsplash.com/photos/infssQ2tjeM
import amaDablam from './photos/mountain-ama-dablam.jpg'
import amaDablamThumb from './photos/thumbs/mountain-ama-dablam.jpg'
// Everest at sunset, Weichao Deng: https://unsplash.com/photos/eyn0LjpNWV4
import everest from './photos/mountain-everest.jpg'
import everestThumb from './photos/thumbs/mountain-everest.jpg'
// Fitz Roy at sunrise, Patagonia, Andrew Svk: https://unsplash.com/photos/150fZ07GQqs
import fitzRoy from './photos/mountain-fitz-roy.jpg'
import fitzRoyThumb from './photos/thumbs/mountain-fitz-roy.jpg'
// Ama Dablam among clouds, Sagarmatha National Park, Rohit Tandon: https://unsplash.com/photos/9wg5jCEPBsw
import khumbu from './photos/mountain-khumbu.jpg'
import khumbuThumb from './photos/thumbs/mountain-khumbu.jpg'
// The Milky Way over Key Summit, New Zealand, Phil Botha: https://unsplash.com/photos/a0TJ3hy-UD8
import stars from './photos/mountain-stars.jpg'
import starsThumb from './photos/thumbs/mountain-stars.jpg'

export interface PaintedScene {
  id: Exclude<SceneId, 'blackhole'>
  /** The fragment shader. */
  fragment: string
  /** Resolution, in pixels per CSS pixel (never more than the screen has). Photos want every pixel. */
  scale: number
  /** The moment shown when motion is off or reduced, in scene seconds. */
  stillTime: number
  /** An image the shader reads as uTex (with uTexSize, and uHasTex once it has loaded). */
  image?: string
  /** A second image, for night, read as uTex2 (uTex2Size, uHasTex2). */
  nightImage?: string
  /** Which photo it shows, where a scene has a choice. Also on the canvas, as data-variant. */
  variant?: string
}

/** A photo the Mountains background can show. */
export interface MountainInfo {
  id: MountainPhoto
  name: string
  /** A short note in the interface's monospaced voice. */
  note: string
  image: string
  thumb: string
  /** How far its fog drifts (see photoScene). Snow would drift with it, so only the misty one moves. */
  flow: number
}

export const MOUNTAINS: MountainInfo[] = [
  { id: 'valleys', name: 'Misty valleys', note: 'Mist', image: valleys, thumb: valleysThumb, flow: 0.008 },
  { id: 'ama-dablam', name: 'Ama Dablam', note: 'Dusk', image: amaDablam, thumb: amaDablamThumb, flow: 0 },
  { id: 'everest', name: 'Everest', note: 'Sunset', image: everest, thumb: everestThumb, flow: 0 },
  { id: 'fitz-roy', name: 'Fitz Roy', note: 'Dawn', image: fitzRoy, thumb: fitzRoyThumb, flow: 0 },
  { id: 'khumbu', name: 'Khumbu', note: 'Clouds', image: khumbu, thumb: khumbuThumb, flow: 0 }
]

/** The night sky that can take any mountain photo's place after sunset. */
export const MILKY_WAY = { name: 'Milky Way', note: 'Night only', thumb: starsThumb }

const mountainScenes = new Map<string, PaintedScene>()

/**
 * The Mountains scene for a chosen photo. At night the photo is taken down to
 * moonlight, so its mist and snow stay; with the Milky Way on, the night sky
 * takes its place instead. Built once per choice, so the scene keeps its identity.
 */
export function mountainScene(photo: MountainPhoto, milkyWay: boolean): PaintedScene {
  const info = MOUNTAINS.find((m) => m.id === photo) ?? MOUNTAINS[0]
  const variant = `${info.id}${milkyWay ? '+stars' : ''}`
  let scene = mountainScenes.get(variant)
  if (!scene) {
    scene = {
      id: 'mountains',
      fragment: photoScene({ flow: info.flow }),
      scale: 2,
      stillTime: 40,
      image: info.image,
      nightImage: milkyWay ? stars : undefined,
      variant
    }
    mountainScenes.set(variant, scene)
  }
  return scene
}

// Every painted scene has a day and a night (uNight); only the black hole stays in space.
export const PAINTED: Record<PaintedScene['id'], PaintedScene> = {
  mountains: mountainScene('valleys', false),
  wave: { id: 'wave', fragment: WAVE, scale: 1.0, stillTime: 12, image: greatWave },
  dunes: { id: 'dunes', fragment: photoScene({ flow: 0 }), scale: 2, stillTime: 30, image: dunesDay, nightImage: dunesNight },
  // No night photo for the forest: the day one is taken down to moonlight.
  forest: { id: 'forest', fragment: photoScene({ flow: 0.012, wind: [1, -0.15] }), scale: 2, stillTime: 30, image: forestDay }
}

/** The scene to draw for a painted background, with its chosen photo where it has a choice. */
export function paintedScene(id: PaintedScene['id'], photo: MountainPhoto, milkyWay: boolean): PaintedScene {
  return id === 'mountains' ? mountainScene(photo, milkyWay) : PAINTED[id]
}

/** For the picker: name and a short note in the interface's monospaced voice. */
export const SCENE_INFO: { id: SceneId; name: string; note: string }[] = [
  { id: 'blackhole', name: 'Black hole', note: 'Ray traced' },
  { id: 'mountains', name: 'Mountains', note: 'Photos' },
  { id: 'wave', name: 'Great wave', note: 'Hokusai' },
  { id: 'dunes', name: 'Dunes', note: 'Erg' },
  { id: 'forest', name: 'Forest', note: 'Fog' }
]

import { Map, type MapProps } from '@maplibre/maplibre-react-native'
import type { Ref } from 'react'
import type { MapRef } from '@maplibre/maplibre-react-native'

// OpenFreeMap: OpenStreetMap vector tiles, no API key, no quota, and
// explicitly free for commercial use. Deliberately the ONLY place the tile
// source is named, so swapping it (e.g. to self-hosted Protomaps) is a
// one-line change rather than a hunt across every map screen.
//
// Attribution ("OpenFreeMap © OpenMapTiles, data from OpenStreetMap") is
// rendered by MapLibre itself from the style — do not remove it.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

type MapViewProps = Omit<MapProps, 'mapStyle'> & {
  ref?: Ref<MapRef>
}

export function MapView({ ref, ...props }: MapViewProps) {
  return <Map ref={ref} mapStyle={MAP_STYLE_URL} {...props} />
}

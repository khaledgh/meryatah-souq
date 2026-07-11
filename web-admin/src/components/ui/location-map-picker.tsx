import maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'

import 'maplibre-gl/dist/maplibre-gl.css'

// OpenFreeMap: OpenStreetMap vector tiles — no API key, no quota, free for
// commercial use. The same source the mobile apps use (see their
// src/components/map/map-view.tsx), so the whole platform renders one map.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Beirut — where the map opens when a vendor has no coordinates yet.
const FALLBACK_CENTER: [number, number] = [35.5018, 33.8938]

interface LocationMapPickerProps {
  longitude?: number | null
  latitude?: number | null
  /** Fired with the new position whenever the marker is dragged or the map clicked. */
  onChange: (coords: { longitude: number; latitude: number }) => void
  heightClassName?: string
}

// A draggable pin on a map, for setting a vendor's location.
//
// Coordinates are [longitude, latitude] throughout — GeoJSON/MapLibre order,
// the reverse of how people say it. Getting this backwards silently puts
// Beirut in Somalia, so it is never abbreviated to a bare pair anywhere here.
export function LocationMapPicker({
  longitude,
  latitude,
  onChange,
  heightClassName = 'h-80',
}: LocationMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  // Kept in a ref so the map's event handlers always see the latest callback
  // without needing to tear the map down and rebuild it on every render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const hasPosition = longitude != null && latitude != null
  const center: [number, number] = hasPosition ? [longitude, latitude] : FALLBACK_CENTER

  // Build the map once. Position updates are pushed imperatively below rather
  // than by re-creating it, which would flicker and lose the user's zoom/pan.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center,
      zoom: hasPosition ? 15 : 11,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const marker = new maplibregl.Marker({ draggable: true, color: '#7c3aed' })
      .setLngLat(center)
      .addTo(map)

    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat()
      onChangeRef.current({ longitude: lng, latitude: lat })
    })

    // Clicking anywhere is a faster way to place the pin than dragging it
    // across the viewport.
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat)
      onChangeRef.current({ longitude: event.lngLat.lng, latitude: event.lngLat.lat })
    })

    mapRef.current = map
    markerRef.current = marker

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Deliberately mount-only: `center` is the INITIAL view, and re-running
    // this would destroy and rebuild the map on every coordinate change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the marker in sync when the coordinates change from outside (e.g. the
  // vendor data loads after the map has already mounted).
  useEffect(() => {
    if (!hasPosition || !markerRef.current || !mapRef.current) return
    const current = markerRef.current.getLngLat()
    if (current.lng === longitude && current.lat === latitude) return
    markerRef.current.setLngLat([longitude, latitude])
    mapRef.current.easeTo({ center: [longitude, latitude], duration: 400 })
  }, [longitude, latitude, hasPosition])

  return <div ref={containerRef} className={`w-full overflow-hidden rounded-xl ${heightClassName}`} />
}

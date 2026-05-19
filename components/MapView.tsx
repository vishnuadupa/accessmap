"use client";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, GeoJSON, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import type { ParkingSpot, RouteResult, IsochroneResult } from "@/types";

// Fix default marker icon (webpack issue with Leaflet)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Decode Google-encoded polyline
function decodePolyline(encoded: string): [number, number][] {
  const pts: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

// Colored circle marker for parking spots
function spotIcon(spot: ParkingSpot, selected: boolean) {
  const color = spot.van_accessible
    ? "#4ade80"
    : spot.wheelchair === "yes"
    ? "#60a5fa"
    : spot.wheelchair === "limited"
    ? "#fb923c"
    : spot.report_flags >= 3
    ? "#f87171"
    : "#6b7280";

  const size = selected ? 18 : 12;
  const ring = selected ? `box-shadow:0 0 0 3px rgba(74,222,128,0.3);` : "";

  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);${ring}transition:all 0.2s"></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// User location marker
const userIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#60a5fa;border:3px solid white;box-shadow:0 0 0 3px rgba(96,165,250,0.3)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Fly-to controller
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const prevCenter = useRef<[number, number]>(center);

  useEffect(() => {
    if (prevCenter.current[0] !== center[0] || prevCenter.current[1] !== center[1]) {
      map.flyTo(center, zoom, { duration: 0.8 });
      prevCenter.current = center;
    }
  }, [center, zoom, map]);

  return null;
}

export interface Props {
  center: [number, number];
  zoom: number;
  spots: ParkingSpot[];
  selectedSpot: ParkingSpot | null;
  route: RouteResult | null;
  isochrone: IsochroneResult | null;
  userLocation: [number, number] | null;
  onSpotClick: (spot: ParkingSpot) => void;
}

export default function MapView({
  center, zoom, spots, selectedSpot, route, isochrone, userLocation, onSpotClick,
}: Props) {
  const routePoints = route?.geometry ? decodePolyline(route.geometry) : [];

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: "100%", height: "100%" }}
      zoomControl={true}
    >
      {/* Dark map tiles — CartoDB dark matter */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={20}
      />

      {/* Fly-to controller */}
      <MapController center={center} zoom={zoom} />

      {/* Isochrone polygon */}
      {isochrone && (
        <GeoJSON
          key={JSON.stringify(isochrone.features?.[0]?.properties)}
          data={isochrone as unknown as Parameters<typeof GeoJSON>[0]["data"]}
          style={() => ({
            color: "#4ade80",
            fillColor: "#4ade80",
            fillOpacity: 0.08,
            weight: 1.5,
            opacity: 0.5,
            dashArray: "4 4",
          })}
        />
      )}

      {/* Route polyline */}
      {routePoints.length > 0 && (
        <Polyline
          positions={routePoints}
          pathOptions={{
            color: route?.has_steps ? "#f87171" : "#4ade80",
            weight: 5,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* Spot markers */}
      {spots.map((spot) => {
        const lat = spot.loc.coordinates[1]; // GeoJSON [lon, lat] → Leaflet [lat, lon]
        const lon = spot.loc.coordinates[0];
        const isSelected = selectedSpot?.osm_id === spot.osm_id;

        return (
          <Marker
            key={spot.osm_id}
            position={[lat, lon]}
            icon={spotIcon(spot, isSelected)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{ click: () => onSpotClick(spot) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{spot.name}</p>
                {spot.van_accessible && (
                  <p style={{ color: "#4ade80", fontSize: 11, marginBottom: 2 }}>🚐 Van Accessible</p>
                )}
                {spot.wheelchair === "yes" && (
                  <p style={{ color: "#60a5fa", fontSize: 11, marginBottom: 2 }}>♿ Wheelchair accessible</p>
                )}
                {spot.opening_hours && (
                  <p style={{ fontSize: 11, color: "#888" }}>🕐 {spot.opening_hours}</p>
                )}
                {spot.distance_m !== undefined && (
                  <p style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                    {spot.distance_m < 1000 ? `${spot.distance_m}m away` : `${(spot.distance_m / 1000).toFixed(1)}km away`}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* User location */}
      {userLocation && (
        <Marker position={userLocation} icon={userIcon}>
          <Popup>
            <p style={{ fontSize: 12 }}>📍 Your location</p>
          </Popup>
        </Marker>
      )}

      {/* User accuracy ring */}
      {userLocation && (
        <Circle
          center={userLocation}
          radius={50}
          pathOptions={{ color: "#60a5fa", fillColor: "#60a5fa", fillOpacity: 0.08, weight: 1 }}
        />
      )}
    </MapContainer>
  );
}

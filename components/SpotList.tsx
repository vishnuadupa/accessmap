import type { ParkingSpot } from "@/types";
import SpotCard from "./SpotCard";

interface Props {
  spots: ParkingSpot[];
  selectedSpot: ParkingSpot | null;
  favoriteIds: Set<string>;
  onSelect: (spot: ParkingSpot) => void;
  onRoute: (spot: ParkingSpot) => void;
  onFavorite: (spot: ParkingSpot) => void;
  onReport: (spot: ParkingSpot) => void;
}

export default function SpotList({
  spots, selectedSpot, favoriteIds, onSelect, onRoute, onFavorite, onReport,
}: Props) {
  if (spots.length === 0) return null;

  const vanSpots = spots.filter((s) => s.van_accessible === true);

  return (
    <div className="py-2">
      {vanSpots.length > 0 && (
        <p className="px-5 py-2 text-xs font-medium" style={{ color: "var(--accent)" }}>
          🚐 {vanSpots.length} van-accessible spot{vanSpots.length > 1 ? "s" : ""}
        </p>
      )}
      {spots.map((spot) => (
        <SpotCard
          key={spot.osm_id}
          spot={spot}
          selected={selectedSpot?.osm_id === spot.osm_id}
          isFavorite={favoriteIds.has(spot.osm_id)}
          onSelect={() => onSelect(spot)}
          onRoute={() => onRoute(spot)}
          onFavorite={() => onFavorite(spot)}
          onReport={() => onReport(spot)}
        />
      ))}
    </div>
  );
}

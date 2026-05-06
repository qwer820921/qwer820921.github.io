import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Food, Coordinates } from "../types";

let isInitialized = false;

const ensureInitialized = () => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "請先在 .env.local 檔案中設定 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
    );
  }
  if (!isInitialized) {
    setOptions({ key: apiKey, v: "weekly" });
    isInitialized = true;
  }
};

// 搜尋附近的餐廳（使用新版 Place.searchNearby API）
export const searchNearbyRestaurants = async (
  baseLatLng: Coordinates,
  radiusStr: string = "500"
): Promise<Food[]> => {
  ensureInitialized();
  const radius = parseInt(radiusStr, 10) || 500;

  const { Place } = (await importLibrary("places")) as google.maps.PlacesLibrary;
  const { LatLng } = (await importLibrary("core")) as google.maps.CoreLibrary;

  const { places } = await Place.searchNearby({
    fields: ["displayName", "location", "formattedAddress", "rating", "userRatingCount", "id"],
    locationRestriction: {
      center: new LatLng(baseLatLng.lat, baseLatLng.lng),
      radius: radius,
    },
    includedTypes: ["restaurant"],
    maxResultCount: 20,
  });

  if (!places || places.length === 0) return [];

  return places.map((place, index) => ({
    id: index,
    name: place.displayName || "未命名的店家",
    address: place.formattedAddress || "暫無詳細地址",
    coordinates: {
      lat: place.location?.lat() ?? 0,
      lng: place.location?.lng() ?? 0,
    },
    rating: place.rating ?? undefined,
    userRatingsTotal: place.userRatingCount ?? undefined,
  }));
};

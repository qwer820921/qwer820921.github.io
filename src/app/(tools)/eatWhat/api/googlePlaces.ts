import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Food, Coordinates } from "../types";

let placesService: any = null; // using any since type might vary depending on setup, but it returns PlacesService instance
let isInitialized = false;

// 初始化 Google Maps Places Library
export const initGooglePlaces = async () => {
  if (placesService) return placesService;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("請先在 .env.local 檔案中設定 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  }

  if (!isInitialized) {
    setOptions({
      key: apiKey,
      v: "weekly",
    });
    isInitialized = true;
  }

  // 使用新版的 importLibrary 匯入需要的庫
  const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
  const { PlacesService } = (await importLibrary("places")) as google.maps.PlacesLibrary;

  // Places API 必須綁定在一個 HTML Element 實體上
  const dummyDiv = document.createElement("div");
  // 建立一個隱形地圖實體來避開需要實際渲染地圖的限制
  const map = new Map(dummyDiv, {
    center: { lat: 25.033, lng: 121.565 },
    zoom: 15,
  });

  placesService = new PlacesService(map);
  return placesService;
};

// 搜尋附近的餐廳
export const searchNearbyRestaurants = async (
  baseLatLng: Coordinates,
  radiusStr: string = "500" // 預設方圓 500 公尺
): Promise<Food[]> => {
  const service = await initGooglePlaces();
  const radius = parseInt(radiusStr, 10) || 500;

  // 確保核心庫載入以取得 LatLng 類別
  const { LatLng } = (await importLibrary("core")) as google.maps.CoreLibrary;

  return new Promise((resolve, reject) => {
    const request: google.maps.places.PlaceSearchRequest = {
      location: new LatLng(baseLatLng.lat, baseLatLng.lng),
      radius: radius,
      type: "restaurant",
    };

    service.nearbySearch(request, (results: google.maps.places.PlaceResult[], status: google.maps.places.PlacesServiceStatus) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        // 將 Google Places 回傳的結果對應到我們自己的 Food 介面
        const foods: Food[] = results.map((place, index) => {
          let lat = 0;
          let lng = 0;
          
          if (place.geometry && place.geometry.location) {
            lat = place.geometry.location.lat();
            lng = place.geometry.location.lng();
          }

          return {
            id: index, // 或者拿 place.place_id 也行
            name: place.name || "未命名的店家",
            address: place.vicinity || "暫無詳細地址",
            coordinates: { lat, lng },
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
          };
        });

        resolve(foods);
      } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
      } else {
        console.error("Google Places API Exception:", status);
        reject(new Error(`Google API 無法取得資料，狀態碼：${status}`));
      }
    });
  });
};

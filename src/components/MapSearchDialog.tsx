import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoogleMap, useLoadScript, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const libraries: ("places")[] = ["places"];

interface MapSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGolfCourse: (name: string, placeId: string) => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "280px",
  borderRadius: "0.5rem"
};

const defaultCenter = {
  lat: 37.5665, // Seoul
  lng: 126.9780
};

export function MapSearchDialog({ open, onOpenChange, onSelectGolfCourse }: MapSearchDialogProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string || "",
    libraries,
  });

  const [center, setCenter] = useState(defaultCenter);
  const [golfCourses, setGolfCourses] = useState<google.maps.places.PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const displayedCourses = useMemo(() => {
    if (!selectedPlace || !selectedPlace.place_id) return golfCourses;
    const exists = golfCourses.some(c => c.place_id === selectedPlace.place_id);
    if (exists) return golfCourses;
    return [selectedPlace, ...golfCourses];
  }, [golfCourses, selectedPlace]);
  
  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onAutocompleteLoad = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      if (place.geometry && place.geometry.location) {
        const location = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setCenter(location);
        setSelectedPlace(place);
        searchGolfCourses(location);
      }
    }
  };

  const searchGolfCourses = useCallback((location: google.maps.LatLng | google.maps.LatLngLiteral) => {
    if (!mapRef.current) return;

    const service = new google.maps.places.PlacesService(mapRef.current);
    
    const request: google.maps.places.PlaceSearchRequest = {
      location: location,
      radius: 5000, // 5km radius
      keyword: "골프장"
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setGolfCourses(results);
        setSearchError(null);
      } else {
        setGolfCourses([]);
        if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          // It's okay, maybe there are none in the strict radius but user can still click map POIs
          setSearchError(null);
        } else {
          console.error("Places API Search Error:", status);
          setSearchError(`검색 오류: ${status}. Google Cloud Console에서 Places API가 활성화되어 있는지 확인하세요.`);
        }
      }
    });
  }, []);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
    // If user clicked a native map POI
    if ("placeId" in e && e.placeId && mapRef.current) {
      e.stop(); // Prevent default info window from opening
      
      const service = new google.maps.places.PlacesService(mapRef.current);
      service.getDetails({ placeId: e.placeId }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          setSelectedPlace(place);
        }
      });
    } else {
      // User clicked somewhere empty on the map
      setSelectedPlace(null);
    }
  }, []);

  useEffect(() => {
    if (open && isLoaded) {
      setIsLoadingLocation(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLoc = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setCenter(userLoc);
            setIsLoadingLocation(false);
            searchGolfCourses(userLoc);
          },
          (error) => {
            console.error("Error getting location:", error);
            setIsLoadingLocation(false);
            // Even if location fails, search around default center
            searchGolfCourses(center);
          }
        );
      } else {
        setIsLoadingLocation(false);
        searchGolfCourses(center);
      }
    }
  }, [open, isLoaded, searchGolfCourses]);

  const handleSelect = () => {
    if (selectedPlace?.name) {
      localStorage.setItem("lastSearchedGolfCourse", selectedPlace.name);
      onSelectGolfCourse(selectedPlace.name, selectedPlace.place_id || "");
      onOpenChange(false);
    }
  };

  if (loadError) {
    return <div className="p-4 text-red-500">Google Maps 로드에 실패했습니다.</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[95vw] max-w-lg p-0 overflow-hidden sm:rounded-2xl border-none shadow-2xl"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target && (target.closest(".pac-container") || target.classList.contains("pac-container"))) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="bg-teal-600 px-5 py-4 text-white">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Search className="w-5 h-5" />
            주변 골프장 검색
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-4 flex flex-col gap-4 bg-slate-50">
          {isLoaded && (
            <Autocomplete
              onLoad={onAutocompleteLoad}
              onPlaceChanged={onPlaceChanged}
            >
              <Input 
                type="text" 
                placeholder="골프장 이름으로 검색 (예: 남서울 CC)" 
                className="w-full h-12 text-base shadow-sm font-medium"
              />
            </Autocomplete>
          )}

          <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-inner">
            {isLoadingLocation && (
              <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center font-bold text-teal-600">
                위치 찾는 중...
              </div>
            )}
            {searchError && (
              <div className="absolute top-2 left-2 right-2 bg-red-100 text-red-600 p-2 text-xs font-bold rounded shadow-md z-10">
                {searchError}
              </div>
            )}
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                zoom={14}
                center={center}
                onLoad={onMapLoad}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  clickableIcons: true,
                }}
                onClick={handleMapClick}
              >
                {/* User Location Marker */}
                <Marker 
                  position={center} 
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 2,
                  }} 
                />
                
                {/* Golf Courses Markers */}
                {golfCourses.map((place, idx) => (
                  <Marker
                    key={idx}
                    position={place.geometry?.location!}
                    onClick={() => setSelectedPlace(place)}
                    icon={{
                      url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
                    }}
                  />
                ))}

                {/* Info Window for Selected Place */}
                {selectedPlace && selectedPlace.geometry && selectedPlace.geometry.location && (
                  <InfoWindow
                    position={selectedPlace.geometry.location}
                    onCloseClick={() => setSelectedPlace(null)}
                  >
                    <div className="p-1 max-w-[200px]">
                      <h3 className="font-bold text-sm mb-1">{selectedPlace.name}</h3>
                      <p className="text-[10px] text-slate-500 mb-2">{selectedPlace.vicinity}</p>
                      <Button 
                        size="sm" 
                        onClick={handleSelect}
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold h-7 text-xs"
                      >
                        이 골프장 선택
                      </Button>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            ) : (
              <div className="w-full h-[280px] flex items-center justify-center bg-slate-100 text-slate-400">
                지도 로딩 중...
              </div>
            )}
          </div>

          {/* Nearby Golf Courses List */}
          {displayedCourses.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                📍 선택 및 주변 골프장 목록 ({displayedCourses.length}개)
              </Label>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-inner">
                {displayedCourses.map((place, idx) => {
                  const isSelected = selectedPlace?.place_id === place.place_id;
                  return (
                    <div 
                      key={place.place_id || idx} 
                      onClick={() => {
                        setSelectedPlace(place);
                        if (place.geometry && place.geometry.location) {
                          setCenter({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng()
                          });
                        }
                      }}
                      className={`p-3 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected 
                          ? "bg-teal-50 hover:bg-teal-100/80" 
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-sm font-bold truncate ${isSelected ? "text-teal-700" : "text-slate-800"}`}>
                          {place.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {place.vicinity || place.formatted_address || "주소 정보 없음"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          localStorage.setItem("lastSearchedGolfCourse", place.name || "");
                          onSelectGolfCourse(place.name || "", place.place_id || "");
                          onOpenChange(false);
                        }}
                        className={`h-7 px-3 text-xs font-bold shrink-0 cursor-pointer ${
                          isSelected 
                            ? "bg-teal-600 hover:bg-teal-700 text-white" 
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        선택
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button 
              disabled={!selectedPlace} 
              onClick={handleSelect}
              className="bg-teal-600 hover:bg-teal-700 font-bold"
            >
              선택 완료
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

App.js file
import React, { useState, useEffect, useRef } from "react";
import { GoogleMap, LoadScript, DirectionsRenderer, Marker, TrafficLayer } from "@react-google-maps/api";
import "./styles.css";

function MapComponent() {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [destination, setDestination] = useState("");
  const [schoolZones, setSchoolZones] = useState([]);
  const [alertedSchools, setAlertedSchools] = useState([]);
  const [alertedHighway, setAlertedHighway] = useState(false);
  const [zoom, setZoom] = useState(() => parseFloat(localStorage.getItem("zoomLevel")) || 14);
  const mapRef = useRef(null);
  
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading || 0,
          };
  
          setCurrentLocation(newLocation);
          localStorage.setItem("lastLocation", JSON.stringify(newLocation));
  
          if (mapRef.current) mapRef.current.panTo(newLocation);
  
          if (destination) {
            const lastKnownLocation = JSON.parse(localStorage.getItem("lastLocation"));
            const distanceMoved = lastKnownLocation ? getDistance(lastKnownLocation, newLocation) : 0;
  
            if (distanceMoved > 100) {  
              console.log("🔄 Recalculating route due to movement...");
              setDirectionsResponse(null);  
              calculateRoute(newLocation, destination);
            }
          }
  
          checkTrafficConditions(newLocation);
          checkHighwayEntry(newLocation);
          checkWrongWayDriving(newLocation);
        },
        (error) => console.error(" Location Error:", error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
  
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      console.error("Geolocation is not supported by this browser.");
    }
  }, [destination]);  // **Recalculate route when destination or location changes**
  

  function getDistance(coord1, coord2) {
    const R = 6371e3; // Earth radius in meters
    const lat1 = (coord1.lat * Math.PI) / 180;
    const lat2 = (coord2.lat * Math.PI) / 180;
    const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  function getBearing(start, end) {
    let lat1 = (Math.PI * start.lat) / 180;
    let lat2 = (Math.PI * end.lat) / 180;
    let dLon = (Math.PI * (end.lng - start.lng)) / 180;
    let y = Math.sin(dLon) * Math.cos(lat2);
    let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }

const checkWrongWayDriving = (currentLocation) => {
  if (!currentLocation || !directionsResponse || currentLocation.heading == null) return;

  const steps = directionsResponse.routes[0].legs[0].steps;
  let closestStep = null;
  let minDistance = Infinity;

  steps.forEach((step) => {
    const distance = getDistance(step.start_location, currentLocation);
    if (distance < minDistance) {
      minDistance = distance;
      closestStep = step;
    }
  });

  if (closestStep && minDistance < 50) {
    const roadBearing = getBearing(closestStep.start_location, closestStep.end_location);
    const driverHeading = (currentLocation.heading + 360) % 360; // Normalize heading
    const angleDifference = Math.abs(driverHeading - roadBearing);
    const adjustedAngle = Math.min(angleDifference, 360 - angleDifference); // Always get the smaller angle

    if (adjustedAngle > 140 && adjustedAngle < 220) {
      if (!localStorage.getItem("wrongWayAlerted")) {
        alert("⚠️ Wrong-Way Driving Detected! Please Turn Around.");
        speak("Warning! You are driving against traffic. Please turn around.");
        localStorage.setItem("wrongWayAlerted", "true");

        setTimeout(() => {
          localStorage.removeItem("wrongWayAlerted");
        }, 10000); // Prevent repeat alerts for 10 seconds
      }
    }
  }
};

  

  useEffect(() => {
    if (currentLocation) {
      fetchNearbySchools();
    }
  }, [currentLocation]);

  useEffect(() => {
    checkSchoolZones();
  }, [schoolZones]);

  const checkSchoolZones = () => {
    if (!currentLocation || schoolZones.length === 0) return;

    schoolZones.forEach((school) => {
      if (getDistance(currentLocation, school) < 300 && !alertedSchools.includes(school.name)) {
        alert(`🏫 School Zone Ahead: ${school.name}. Drive Carefully!`);
        speak(`You are entering a school zone near ${school.name}. Please drive carefully.`);
        setAlertedSchools((prev) => [...prev, school.name]);
      }
    });
  };

  const highwayKeywords = ["highway", "interstate", "expressway", "freeway", "on-ramp", "merge onto"];
  const exitKeywords = ["exit", "off-ramp", "leave", "merge off"];

const checkHighwayEntry = (location) => {
  if (!location || !directionsResponse) return;

  const steps = directionsResponse.routes[0].legs[0].steps;
  const upcomingStep = steps.find(
    (step) =>
      getDistance(step.start_location, location) < 200 &&
      highwayKeywords.some((keyword) => step.instructions.toLowerCase().includes(keyword))
  );

  if (upcomingStep && alertedHighway !== "on") {
    alert("🚗 Entering a National Highway! Drive Safely.");
    speak("You are entering a National Highway. Drive safely.");
    setAlertedHighway("on");
  } else if (exitKeywords.some((keyword) => upcomingStep.instructions.toLowerCase().includes(keyword))) {
    if (alertedHighway === "on") {
      alert("🛣️ Exiting the highway. Drive carefully on normal roads.");
      speak("You are exiting the highway. Drive carefully.");
      setAlertedHighway("off");
    }
  }
};


  const fetchNearbySchools = () => {
    if (!mapRef.current) return;

    const service = new window.google.maps.places.PlacesService(mapRef.current);
    service.nearbySearch(
      {
        location: currentLocation,
        radius: 2000,
        type: "school",
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setSchoolZones(
            results.map((school) => ({
              name: school.name,
              lat: school.geometry.location.lat(),
              lng: school.geometry.location.lng(),
            }))
          );
        } else {
          console.error("Error fetching school zones:", status);
        }
      }
    );
  };
  const checkTrafficConditions = (location) => {
    if (!location) return;
  
    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [location],
        destinations: [location], // Checking the same location for traffic status
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(), // Current time for real-time traffic data
        },
      },
      (response, status) => {
        if (status === "OK") {
          const trafficStatus = response.rows[0].elements[0].duration_in_traffic;
          const normalTime = response.rows[0].elements[0].duration;
  
          if (trafficStatus && trafficStatus.value > normalTime.value * 1.5) {
            alert("🚦 Heavy Traffic Ahead! Please slow down.");
            speak("Heavy traffic detected. Please slow down and drive safely.");
          }
        } else {
          console.error("Traffic API Error:", status);
        }
      }
    );
  };
  

  const calculateRoute = (origin, destination) => {
    if (!origin || !destination) {
      console.error("Missing origin or destination.");
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: origin,
        destination: destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirectionsResponse(result);
          speak("Drive carefully, stay cautious, and follow traffic rules for a safe journey.");
        } else {
          console.error("Error fetching directions:", status);
          alert("Could not find directions. Try again.");
        }
      }
    );
  };

  const speak = (message) => {
    if ("speechSynthesis" in window) {
      const speech = new SpeechSynthesisUtterance(message);
      speech.lang = "en-US";
      window.speechSynthesis.speak(speech);
    }
  };


  return (
    <LoadScript googleMapsApiKey="AIzaSyB7W7Dlqc2VIuOfIo69GbLbbz74                                                                                          pwhIdIA" libraries={["places"]}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "500px" }}
          center={currentLocation || { lat: 37.7749, lng: -122.4194 }}
          zoom={14}
          onLoad={(map) => (mapRef.current = map)}
          options={{ zoomControl: true, mapTypeControl: true, streetViewControl: true }}
        >
          <TrafficLayer />
          {currentLocation && <Marker position={currentLocation} />}
          {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
        </GoogleMap>

        <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Enter Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="input-box"
          />

          <button onClick={() => calculateRoute(currentLocation, destination)} className="start-btn">
            Start Navigation
          </button>
        </div>
        <p className="welcome-text"><i>Leave sooner, drive slower, live longer</i></p>
      </div>
    </LoadScript>
  );
}

export default MapComponent; 

---------------------------------------------------------------------------------------------------

The .env contains the API keys and controls:
REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyB7W7Dlqc2VIuOfIo69GbLbbz74pwhIdI A

---------------------------------------------------------------------------------------------------

import DeckGL, {
  BitmapLayer,
  Color,
  FlyToInterpolator,
  GeoJsonLayer,
  IconLayer,
  LineLayer,
  MapView,
  MapViewState,
  PathLayer,
  Position,
  ScatterplotLayer,
  TextLayer,
  TileLayer,
} from "deck.gl";
import { PathStyleExtension } from "@deck.gl/extensions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import dayjs, { Dayjs } from "dayjs";
import {
  FaArrowRotateRight,
  FaCheck,
  FaPlay,
  FaPlus,
  FaStop,
  FaTrash,
  FaUpload,
} from "react-icons/fa6";
import { point, distance } from "@turf/turf";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import localforage from "localforage";
import * as turf from "@turf/turf";
import Button from "../../../shared/ui/Button";
import { Vehicle, VehicleStep, ChargingPlace } from "./interfaces";
import { downloadVehicleDataAsCSV, downloadVehicleDataAsJSON } from "./utils";
import Papa from "papaparse";

const tailwindStyles = {
  button: {
    basic: `flex flex-row py-1 px-2 gap-2 bg-slate-200 hover:bg-slate-300 rounded items-center text-xs justify-center`,
    selected: `flex flex-row py-1 px-2 gap-2 bg-lime-200 hover:bg-lime-300 rounded items-center text-xs justify-center`,
    big: `flex flex-row py-2 px-4 gap-2 bg-slate-200 hover:bg-slate-300 rounded items-center text-lg justify-center`,
  },
  input: {
    basic: `border border-slate-300 py-1 px-2 rounded`,
  },
};

type AppStep =
  | "normal"
  | "addVehicle"
  | "updateNewVehicleInitTime"
  | "addVehicleRoute";

// const INITIAL_COORDINATES = [144.9555, -37.811333]; // Latitude, Longitude for Melbourne CBD, Victoria
const INITIAL_COORDINATES = [145.1275, -37.9145]; // Latitude, Longitude for Clayton, Victoria

// const DEFAULT_VEHICLE_SPEED_KMH = 60

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: INITIAL_COORDINATES[1],
  longitude: INITIAL_COORDINATES[0],
  zoom: 12,
  maxZoom: 20,
  maxPitch: 89,
  bearing: 0,
};

const COPYRIGHT_LICENSE_STYLE: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  backgroundColor: "hsla(0,0%,100%,.5)",
  padding: "0 5px",
  font: "12px/20px Helvetica Neue,Arial,Helvetica,sans-serif",
};

const LINK_STYLE: React.CSSProperties = {
  textDecoration: "none",
  color: "rgba(0,0,0,.75)",
  cursor: "grab",
};

interface SimulationConfig {
  start: boolean;
  startTime?: Dayjs;
  endTime?: Dayjs;
}

/* global window */
const devicePixelRatio =
  (typeof window !== "undefined" && window.devicePixelRatio) || 1;

const SimulatorBasic = ({
  showBorder = false,
  onTilesLoad,
}: {
  showBorder?: boolean;
  onTilesLoad?: () => void;
}) => {
  /* -------------------- SIMULATOR STATE -------------------- */
  const MS_PER_MINUTE_SIMULATION = 500;
  const FRAME_PER_SECOND = 60;

  // Simulator step
  const [appStep, setAppStep] = useState<AppStep>("normal");

  // Deck.gl viewState
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);

  // Simulation config
  const initSimulationConfig: SimulationConfig = {
    start: false,
    startTime: undefined,
    endTime: undefined,
  };
  const [simulationConfig, setSimulationConfig] =
    useState<SimulationConfig>(initSimulationConfig);

  // List of vehicles in simulator
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const vehiclesRef = useRef(vehicles);

  // List of charging places in simulator
  const [chargingPlaces, setChargingPlaces] = useState<ChargingPlace[]>([]);
  const chargingPlacesRef = useRef<ChargingPlace[]>([]);

  useEffect(() => {
    vehiclesRef.current = vehicles;
    console.log("VehiclesRef synchronized with vehicles state:", vehiclesRef.current);
  }, [vehicles]);

  useEffect(() => {
    chargingPlacesRef.current = chargingPlaces;
    console.log("ChargingPlacesRef synchronized with places state:", chargingPlacesRef.current);
  }, [chargingPlaces]);

  // Helper function to update vehicles with proper processing and ref sync
  const updateVehiclesWithProcessing = (newVehicles: Vehicle[]) => {
    const processedVehicles = processVehiclesForSimulation(newVehicles);
    setVehicles(processedVehicles);
    vehiclesRef.current = processedVehicles;
    localforage.setItem("vehicles", JSON.stringify(processedVehicles));
    setLatestRefreshDatetime(dayjs());
    return processedVehicles;
  };

  // Simulation time
  const [simulationTime, setSimulationTime] = useState(dayjs());
  const [latestRefreshDatetime, setLatestRefreshDatetime] =
    useState<Dayjs | null>(null);

  useEffect(() => {
    if (simulationConfig.start) {
      const clockInterval = setInterval(() => {
        setSimulationTime((prevTime) => {
          const currentTime = prevTime.add(1, "minute");

          if (currentTime.isAfter(simulationConfig.endTime)) {
            setSimulationConfig((v) => ({ ...v, start: false }));
            return prevTime;
          }

          return currentTime;
        }); // Advances 1 minute per interval
      }, MS_PER_MINUTE_SIMULATION);

      return () => {
        clearInterval(clockInterval);
      };
    }
  }, [simulationConfig]);

  const latestSimulationTime = useRef(simulationTime);

  useEffect(() => {
    latestSimulationTime.current = simulationTime;
  }, [simulationTime]);

  const getHeading = (
    prevPos: [number, number],
    currentPos: [number, number],
    vehicleID: number,
    currentHeading: number = 0,
  ): number => {
    if (!prevPos || !currentPos) return currentHeading;

    // Check if positions are the same (no movement)
    const deltaLong = Math.abs(currentPos[0] - prevPos[0]);
    const deltaLat = Math.abs(currentPos[1] - prevPos[1]);
    const minMovement = 0.00001; // Minimum movement threshold
    
    if (deltaLong < minMovement && deltaLat < minMovement) {
      return currentHeading; // Keep current heading if no significant movement
    }

    // Use turf.bearing to get the direction from prevPos to currentPos
    // This gives us the angle in degrees from North (0°) clockwise
    const bearing = turf.bearing(
      turf.point([prevPos[0], prevPos[1]]),
      turf.point([currentPos[0], currentPos[1]])
    );

    // Convert bearing to deck.gl coordinate system:
    // - Turf.js bearing: 0° = North, clockwise positive
    // - deck.gl rotation: 0° = East, counter-clockwise positive
    
    // Convert from geographic bearing to deck.gl angle
    let deckGLAngle = 90 - bearing; // Convert North-based to East-based
    
    // Add 180° to flip the car icon direction
    deckGLAngle += 180;
    
    // Normalize angle to 0-360 range
    if (deckGLAngle < 0) {
      deckGLAngle += 360;
    }
    if (deckGLAngle >= 360) {
      deckGLAngle -= 360;
    }

    // Smooth heading transition to avoid sudden jumps
    if (currentHeading !== 0) {
      const angleDiff = deckGLAngle - currentHeading;
      let shortestAngleDiff = angleDiff;
      
      // Handle angle wrapping (e.g., 350° to 10°)
      if (angleDiff > 180) {
        shortestAngleDiff = angleDiff - 360;
      } else if (angleDiff < -180) {
        shortestAngleDiff = angleDiff + 360;
      }
      
      // Limit heading change per frame for smoother rotation
      const maxHeadingChange = 15; // degrees per frame
      if (Math.abs(shortestAngleDiff) > maxHeadingChange) {
        const direction = shortestAngleDiff > 0 ? 1 : -1;
        deckGLAngle = currentHeading + (direction * maxHeadingChange);
        
        // Normalize again
        if (deckGLAngle < 0) deckGLAngle += 360;
        if (deckGLAngle >= 360) deckGLAngle -= 360;
      }
    }

    console.log(
      `getHeading vehicle ${vehicleID}: prev: [${prevPos.map(p => p.toFixed(5))}], current: [${currentPos.map(p => p.toFixed(5))}], bearing: ${bearing.toFixed(1)}°, deckGL: ${deckGLAngle.toFixed(1)}°`,
    );

    return deckGLAngle;
  };

  useEffect(() => {
    // Animation progression

    const fps = FRAME_PER_SECOND;
    const msPerAnimationStep = MS_PER_MINUTE_SIMULATION / fps;
    const msSimPerMs = 60000 / MS_PER_MINUTE_SIMULATION;
    const msSimPerAnimationStep = msPerAnimationStep * msSimPerMs;

    if (simulationConfig.start) {
      const animationInterval = setInterval(() => {
        setVehicles([
          ...vehiclesRef.current.map((vehicle) => {
            let newVehicleHeading = vehicle.run.heading;
            let newVehiclePosition = vehicle.run.position;
            let newVehicleRunProgression = vehicle.run.progression;
            let lastStepIndex = vehicle.steps.length - 1;

            const initTime = vehicle.steps[0].destination.time;

            // Only executed on this vehicle time window
            if (
              latestSimulationTime.current.diff(initTime) >= 0 &&
              latestSimulationTime.current.diff(
                vehicle.steps[lastStepIndex].destination.time,
              ) <= 0
            ) {
              // Update animation

              // Traversing steps and step routes to get recent route position
              vehicle.steps.map((step, stepIndex) => {
                // Skip animation for stationary steps (stop/cdc) - vehicle should remain at position
                if (step.type === "stop" || step.type === "cdc") {
                  // For stationary steps, just check if we're in the time window and set position
                  if (newVehicleRunProgression >= step.vehicleProgressionMS[0]) {
                    newVehiclePosition = step.destination.position;
                  }
                  return; // Skip the route progression logic
                }

                // console.log(`vehicle ${vehicle.id} stepIndex ${stepIndex} ${step.vehicleProgressionMS.length} runProgression ${newVehicleRunProgression}`)

                step.vehicleProgressionMS.map((progress, progressIndex) => {
                  // console.log(`progress ${progress}`)

                  if (newVehicleRunProgression >= progress) {
                    const nextProgress =
                      step.vehicleProgressionMS[progressIndex + 1];
                    const currentRoutePosition = step.routes[progressIndex];
                    const nextRoutePosition = step.routes[progressIndex + 1];

                    const nextStep = vehicle.steps[stepIndex + 1];
                    const nextProgressOnNextStep = nextStep
                      ? nextStep.vehicleProgressionMS[0]
                      : undefined;
                    const nextRoutePositionOnNextStep = nextStep
                      ? nextStep.routes[0]
                      : undefined;

                    // Next route position in same step exists: vehicle Position
                    if (
                      nextProgress &&
                      nextProgress > newVehicleRunProgression
                    ) {
                      // console.log(`Got it current to next position`, progressIndex, currentRoutePosition, nextRoutePosition)
                      const ratio =
                        (newVehicleRunProgression - progress) /
                        (nextProgress - progress);
                      const long =
                        currentRoutePosition[0] +
                        ratio *
                          (nextRoutePosition[0] - currentRoutePosition[0]);
                      const lat =
                        currentRoutePosition[1] +
                        ratio *
                          (nextRoutePosition[1] - currentRoutePosition[1]);

                      const prevPosition = newVehiclePosition;
                      newVehiclePosition = [long, lat];
                      newVehicleHeading = getHeading(
                        [prevPosition[0], prevPosition[1]],
                        [newVehiclePosition[0], newVehiclePosition[1]],
                        vehicle.id,
                        newVehicleHeading,
                      );
                    } else if (
                      nextProgressOnNextStep &&
                      nextRoutePositionOnNextStep &&
                      nextProgressOnNextStep > newVehicleRunProgression
                    ) {
                      // console.log(`Got it current to next position in next step`, progressIndex, currentRoutePosition, nextRoutePositionOnNextStep)
                      const ratio =
                        (newVehicleRunProgression - progress) /
                        (nextProgressOnNextStep - progress);
                      const long =
                        currentRoutePosition[0] +
                        ratio *
                          (nextRoutePositionOnNextStep[0] -
                            currentRoutePosition[0]);
                      const lat =
                        currentRoutePosition[1] +
                        ratio *
                          (nextRoutePositionOnNextStep[1] -
                            currentRoutePosition[1]);

                      const prevPosition = newVehiclePosition;
                      newVehiclePosition = [long, lat];
                      newVehicleHeading = getHeading(
                        [prevPosition[0], prevPosition[1]],
                        [newVehiclePosition[0], newVehiclePosition[1]],
                        vehicle.id,
                        newVehicleHeading,
                      );
                    } else {
                      // console.log(`Got it from current position`, progressIndex, currentRoutePosition)
                      const prevPosition = newVehiclePosition;
                      newVehiclePosition = currentRoutePosition;
                      newVehicleHeading = getHeading(
                        [prevPosition[0], prevPosition[1]],
                        [newVehiclePosition[0], newVehiclePosition[1]],
                        vehicle.id,
                        newVehicleHeading,
                      );
                    }

                    // Next route position in different step exists
                    // No next route position: vehicle Position same with this route position
                  }
                });
              });

              /**
               *
               * 1. Get and update progression for each vehicle
               * 2. Get the current step info
               * 3. Calculate distance form step initial position
               *   3.1. Get total distance of each step (maybe you could just calculate it since beginning)
               *   3.2. Get total duration of each step
               *   3.3. Get distance from step initial position to progress position
               *   3.4. Traverse each points until arrive past the last point
               *   3.5. Infer position between last point to next point based on the remaining distance
               * 4. Traverse the position
               */
            }

            newVehicleRunProgression += msSimPerAnimationStep;

            // console.log(">>> newProgression become", newVehicleRunProgression)

            return {
              ...vehicle,
              run: {
                ...vehicle.run,
                position: newVehiclePosition,
                heading: newVehicleHeading,
                progression: newVehicleRunProgression,
              },
            };
          }),
        ]);
      }, msPerAnimationStep);

      return () => clearInterval(animationInterval);
    }
  }, [simulationConfig, latestRefreshDatetime]);

  // App menus visibiliy config 
  const [show] = useState({
    tileBgMap: true,
    vectorBgMap: false,
    datasetImporter: false,
  });

  // Dataset mode: 'generate' | 'import' | 'jsonapi'
  const [datasetMode, setDatasetMode] = useState<'generate' | 'import' | 'jsonapi'>('import');
  
  // JSON API state
  const [jsonApiUrl, setJsonApiUrl] = useState('');
  const [jsonApiLoading, setJsonApiLoading] = useState(false);

  /* -------------------- VEHICLE STATE -------------------- */

  // Process vehicles to calculate all needed properties for simulation
  const processVehiclesForSimulation = (rawVehicles: Vehicle[]): Vehicle[] => {
    return rawVehicles.map((vehicle) => {
      console.log("Processing vehicle", vehicle.id);

      let totalVehicleProgressionMS = 0;

      // Iterating Vehicle Steps
      const steps = vehicle.steps.map((step, stepIndex) => {
        const timeString = step.destination.time;
        let totalDistanceMeter = 0;
        let totalTimeMS = 0;
        let distanceProgression: number[] = [];
        let vehicleProgressionMS: number[] = [];

        if (stepIndex > 0) {
          const destinationTime = dayjs(step.destination.time);
          const previousDestinationTime = dayjs(
            vehicle.steps[stepIndex - 1].destination.time,
          );

          totalTimeMS = destinationTime
            ? destinationTime.diff(previousDestinationTime)
            : 0;
        }

        // For stationary steps (stop/cdc), skip distance calculations
        if (step.type === "stop" || step.type === "cdc") {
          // Stationary steps: no distance, just time progression
          totalDistanceMeter = 0;
          distanceProgression = [0];
          vehicleProgressionMS = [totalVehicleProgressionMS];
          totalVehicleProgressionMS += totalTimeMS;
        } else {
          // For movement steps (trip/init), calculate distances and progression
          // Iterating routes for distance
          step.routes.forEach((route, routeIndex) => {
            if (routeIndex > 0) {
              const prevRoute = step.routes[routeIndex - 1];
              totalDistanceMeter += turf.distance(
                turf.point([prevRoute[0], prevRoute[1]]),
                turf.point([route[0], route[1]]),
                { units: "meters" },
              );
            }

            distanceProgression[routeIndex] = totalDistanceMeter;
          });

          // Iterating routes for time
          step.routes.forEach((route, routeIndex) => {
            if (routeIndex > 0) {
              const prevRoute = step.routes[routeIndex - 1];
              const routeDistance = turf.distance(
                turf.point([prevRoute[0], prevRoute[1]]),
                turf.point([route[0], route[1]]),
                { units: "meters" },
              );

              totalVehicleProgressionMS +=
                totalDistanceMeter > 0 ? (routeDistance / totalDistanceMeter) * totalTimeMS : 0;
            }

            vehicleProgressionMS[routeIndex] = totalVehicleProgressionMS;
          });
        }

        const computedStep: VehicleStep = {
          ...step,
          destination: {
            ...step.destination,
            time: timeString ? dayjs(timeString) : undefined,
          },
          totalTimeMS,
          totalDistanceMeter,
          distanceProgression,
          vehicleProgressionMS,
        };

        return computedStep;
      });

      const computedVehicle = {
        ...vehicle,
        run: {
          ...vehicle.run,
          heading: 0,
          progression: 0,
        },
        steps: steps,
      };

      console.log("Processed vehicle", computedVehicle);
      return computedVehicle;
    });
  };

  const loadVehiclesFromLocal = async (): Promise<Vehicle[]> => {
    const res = await localforage.getItem("vehicles");

    if (res) {
      const vehiclesFromLocal: Vehicle[] = JSON.parse(res as string);
      if (vehiclesFromLocal) {
        console.log("Loading vehicles from local storage", vehiclesFromLocal);
        return processVehiclesForSimulation(vehiclesFromLocal);
      }
    }

    return [];
  };

    const loadChargingPlacesFromLocal = async (): Promise<ChargingPlace[]> => {
    const res = await localforage.getItem("chargingPlaces");

    if (res) {
      const placesFromLocal: ChargingPlace[] = JSON.parse(res as string);
      if (placesFromLocal) {
        console.log("Loading charging places from local storage", placesFromLocal);
        return placesFromLocal;
      }
    }

    return [];
  };

  useEffect(() => {
    loadVehiclesFromLocal().then((res) => {
      setVehicles(res);
    });
    loadChargingPlacesFromLocal().then((res) => {
      setChargingPlaces(res);
    });
  }, []);

  // Temporary vehicle steps creation
  const resetStep: VehicleStep = {
    type: "trip",
    destination: {
      position: [INITIAL_COORDINATES[0], INITIAL_COORDINATES[1]],
    },
    soc: 100,
    routes: [],
    totalTimeMS: 0,
    totalDistanceMeter: 0,
    distanceProgression: [],
    vehicleProgressionMS: [],
  };

  const [tempStep, setTempStep] = useState<VehicleStep>(resetStep);

  // Get selected vehicle
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.selected),
    [vehicles],
  );

  // Get current step index for a vehicle based on simulation time
  const getCurrentStepIndex = useCallback((vehicle: Vehicle): number => {
    if (!simulationConfig.start) return -1;
    
    // Find which step the vehicle is currently executing
    for (let i = vehicle.steps.length - 1; i >= 0; i--) {
      const step = vehicle.steps[i];
      const nextStep = vehicle.steps[i + 1];
      
      if (step.destination.time && simulationTime.isAfter(step.destination.time)) {
        // If there's a next step, we're executing it
        // If no next step, we're at the final step
        return nextStep ? i + 1 : i;
      }
    }
    
    // Before any step time, show the first step (init)
    return 0;
  }, [simulationTime, simulationConfig.start]);

  // Update new vehicle init time
  const updateNewVehicleInitTime = (date: Dayjs) => {
    setVehicles(
      vehicles.map((d) => {
        if (d.selected) {
          d.steps[0].destination.time = date;
        }
        return d;
      }),
    );
  };

  // Add new vehicle
  const addVehicle = (
    initialPosition: [longitude: number, latitude: number],
  ) => {
    // Add the vehicle
    setVehicles((v) => {
      const newVehicleStep: VehicleStep = {
        type: "init",
        destination: {
          time: dayjs(),
          position: initialPosition,
        },
        routes: [initialPosition],
        totalTimeMS: 0,
        totalDistanceMeter: 0,
        distanceProgression: [],
        vehicleProgressionMS: [],
        soc: 100,
      };

      const output: Vehicle[] = [
        ...v.map((w) => {
          w.selected = false;
          return w;
        }),
        {
          id: vehicles.length + 1,
          label: `Vehicle ${vehicles.length + 1}`,
          batteryCapacityKWH: 40,
          steps: [newVehicleStep],
          selected: true,
          run: {
            position: initialPosition,
            heading: 0,
            progression: 0,
          },
        },
      ];

      setViewState((w) => ({
        ...w,
        longitude: initialPosition[0],
        latitude: initialPosition[1],
        transitionDuration: 200,
        transitionInterpolator: new FlyToInterpolator(),
      }));

      setAppStep("updateNewVehicleInitTime");

      return output;
    });
  };

  // Select vehicle by index
  const selectVehicleByIndex = (index: number) => {
    setVehicles((v) => {
      console.log("selectVehicle", v[index]);

      if (v[index].steps.length > 0) {
        const latestStep = v[index].steps[v[index].steps.length - 1];
        const latestPosition = latestStep.routes[latestStep.routes.length - 1];
        setViewState((w) => ({
          ...w,
          longitude: latestPosition[0],
          latitude: latestPosition[1],
          transitionDuration: 200,
          transitionInterpolator: new FlyToInterpolator(),
        }));
      }

      return [
        ...v.slice(0, index).map((w) => ({ ...w, selected: false })),
        {
          ...v[index],
          selected: true,
        },
        ...v.slice(index + 1).map((w) => ({ ...w, selected: false })),
      ];
    });
  };

  // Add vehicle steps
  const addVehicleSteps = () => {
    const updatedVehicles = vehicles.map((d) => {
      if (d.selected) {
        // Calculate destination time based on tempStepTimeDelta
        const lastStep = d.steps[d.steps.length - 1];
        const destinationTime = lastStep.destination.time?.add(Number(tempStepTimeDelta) || 0, 'minute');
        
        d.steps = [
          ...d.steps,
          {
            soc: 100, // Will be adjusted by user later
            type: tempStep.type,
            destination: {
              time: destinationTime,
              position: tempStep.routes[tempStep.routes.length - 1],
            },
            routes: tempStep.routes,
            totalDistanceMeter: 0,
            totalTimeMS: 0,
            distanceProgression: [],
            vehicleProgressionMS: [],
          },
        ];
      }

      return d;
    });

    // Process the updated vehicles to recalculate all progressions
    updateVehiclesWithProcessing(updatedVehicles);
    setTempStep(resetStep);
    setAppStep("normal");
  };

  // Update temporary vehicle step time delta
  const updateTempStepTimeDelta = (minute: number) => {
    if (selectedVehicle) {
      // Get current destination time for this vehicle
      const currentDestinationTime =
        selectedVehicle.steps[selectedVehicle.steps.length - 1].destination
          .time;

      if (currentDestinationTime) {
        const newDestinationTime = currentDestinationTime.add(minute, "minute");
        // console.log("newDestionationTime", newDestinationTime)
        setTempStep((v) => ({
          ...v,
          destination: { ...v.destination, time: newDestinationTime },
        }));
      }
    }
  };

  // Get temporary step time delta
  const tempStepTimeDelta = useMemo(() => {
    if (selectedVehicle) {
      // Get current destination time for this vehicle
      const currentDestinationTime =
        selectedVehicle.steps[selectedVehicle.steps.length - 1].destination
          .time;

      const newDestinationTime = tempStep.destination.time;

      if (currentDestinationTime && newDestinationTime) {
        const minuteDiff = newDestinationTime.diff(
          currentDestinationTime,
          "minute",
        );
        return minuteDiff;
      }
    }

    return "";
  }, [tempStep]);

  // Convert steps from each vehicles into Deck.gl readable path
  const vehiclePath: (VehicleStep & { vehicleID: number; stepID: number })[] =
    useMemo(
      () =>
        vehicles
          .map((v) =>
            v.steps.map((w, i) => ({ ...w, vehicleID: v.id, stepID: i })),
          )
          .flat(),
      [vehicles],
    );

  // Handle Deck.gl map click for various simulator functions
  const handleMapClick = (event: any) => {
    if (appStep !== "addVehicleRoute" && appStep !== "addVehicle") return;
    const { coordinate } = event;

    if (appStep === "addVehicleRoute" && selectedVehicle) {
      setTempStep((current) => {
        const initPath: Position[] = [];

        // Add latest point as initial path
        if (current.routes.length === 0) {
          const latestStep =
            selectedVehicle.steps[selectedVehicle.steps.length - 1];
          const latestPosition =
            latestStep.routes[latestStep.routes.length - 1];
          if (latestPosition) {
            initPath.push(latestPosition);
          }
        }

        const newRoutes = [...initPath, ...current.routes, coordinate];

        return {
          ...current,
          routes: newRoutes,
        };
      });
    }

    if (appStep === "addVehicle") {
      addVehicle(coordinate);
    }
  };

  /* -------------------- ANIMATING VEHICLES -------------------- */

  const restartSimulation = () => {
    let startTime: Dayjs | undefined;
    let endTime: Dayjs | undefined;

    console.log(">> restartSimulation", vehicles);

    // Reset all vehicles to their initial state before restarting
    const resetVehicles = vehicles.map((vehicle) => {
      // Find initial position from first step
      const initialPosition = vehicle.steps.length > 0 
        ? vehicle.steps[0].destination.position 
        : [INITIAL_COORDINATES[0], INITIAL_COORDINATES[1]] as Position;

      return {
        ...vehicle,
        run: {
          progression: 0,
          position: initialPosition as Position,
          heading: 0,
        }
      };
    });

    // Update vehicles state and ref with reset vehicles
    setVehicles(resetVehicles);
    vehiclesRef.current = resetVehicles;

    // Calculate simulation time bounds
    resetVehicles.forEach((vehicle) => {
      vehicle.steps.forEach((step) => {
        if (!startTime) startTime = step.destination.time;
        if (!endTime) endTime = step.destination.time;

        if (step.destination.time?.isBefore(startTime)) {
          startTime = step.destination.time;
        }

        if (step.destination.time?.isAfter(endTime)) {
          endTime = step.destination.time;
        }
      });
    });

    setSimulationConfig((prev) => {
      if (startTime) setSimulationTime(startTime);

      // Save reset vehicles to localStorage
      localforage.setItem("vehicles", JSON.stringify(resetVehicles)).then(() => {});

      return {
        ...prev,
        start: true,
        startTime: startTime,
        endTime: endTime,
      };
    });
  };

  /*
   * The main ideas is utilising 60 fps and dynamically update car position,
   *  it's recalculated every 5 minute iteration in the previous program
   *
   * 1. Run the simulation time
   * 2. For each vehicle:
   *    - Every time the simulation time changed
   *
   *
   *
   * 1. Get earliest minute
   * 2. Get latest minute
   * 3. Breakdown vehicles
   *    - vehicle
   *      - linestring per minute []
   *      - steps
   *        - step
   *          - minute start
   *          - total distance
   *          - minute end
   *          - distance per minute
   *          - linestring
   *            - points
   *            - distance between two points
   *            - add new point every 1 minute
   *            - add to linestring per minute []
   */

  /* -------------------- LAYERS -------------------- */

  // Basemap layer using Open Street Map service
  const tileLayer = new TileLayer<ImageBitmap>({
    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
    data: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    // Leverage OSM tile server HTTP/2 capability
    maxRequests: 20,
    pickable: true,
    onViewportLoad: onTilesLoad,
    autoHighlight: showBorder,
    highlightColor: [60, 60, 60, 40],
    // https://wiki.openstreetmap.org/wiki/Zoom_levels
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    zoomOffset: devicePixelRatio === 1 ? -1 : 0,
    renderSubLayers: (props) => {
      const [[west, south], [east, north]] = props.tile.boundingBox;
      const { data, ...otherProps } = props;

      return [
        new BitmapLayer(otherProps, {
          image: data,
          bounds: [west, south, east, north],
        }),
        showBorder &&
          new PathLayer<Position[]>({
            id: `${props.id}-border`,
            data: [
              [
                [west, north],
                [west, south],
                [east, south],
                [east, north],
                [west, north],
              ],
            ],
            getPath: (d) => d,
            getColor: [255, 0, 0],
            widthMinPixels: 4,
          }),
      ];
    },
  });

  // All Deck.gl layers used in simulator
  const layers = [
    show.tileBgMap && tileLayer,
    show.vectorBgMap &&
      new GeoJsonLayer({
        id: "greater-melbourne-boundary-layer",
        data: "https://urbancomputing.org/files/greater-melbourne-boundary.geojson",
        filled: true,
        getFillColor: [30, 41, 59, 255],
      }),
    show.vectorBgMap &&
      new GeoJsonLayer({
        id: "greater-melbourne-localities-layer",
        data: "https://urbancomputing.org/files/simplified-greater-melbourne-localities.json",
        filled: true,
        getFillColor: [30, 41, 59, 255],
        getLineColor: [15, 23, 42, 255],
        // getLineColor: [77, 124, 15, 255],
        lineWidthUnits: "pixels",
        getLineWidth: 4,
        dashJustified: true,
        getDashArray: [4, 2],
        pointType: "text",
        getTextSize: 60,
        getTextColor: [255, 255, 0, 255],
        extensions: [new PathStyleExtension({ dash: true })],
      }),
    show.vectorBgMap &&
      new GeoJsonLayer({
        id: "greater-melbourne-roads-layer",
        data: "https://urbancomputing.org/files/greater-melbourne-filtered-roads.geojson",
        filled: true,
        lineWidthUnits: "pixels",
        getLineColor: (d: any): Color => {
          let color: [number, number, number, number] = [100, 116, 139, 150];

          switch (d.properties["CLASS_CODE"]) {
            case 0:
              color = [100, 116, 139, 255];
              break;
            case 1:
              color = [100, 116, 139, 255];
              break;
            case 2:
              color = [100, 116, 139, 255];
              break;
            default:
              break;
          }

          return color;
        },
        getLineWidth: (d) => {
          let width = 1;

          switch (d.properties["CLASS_CODE"]) {
            case 0:
              width = 5;
              break;
            case 1:
              width = 3;
              break;
            case 2:
              width = 2;
              break;
          }

          return width;
        },
      }),
    new ScatterplotLayer<Vehicle>({
      id: "car-highlight-layer",
      data: vehicles.filter((v) => v.selected),
      getPosition: (d) => d.steps[d.steps.length - 1].destination.position,
      getRadius: 40,
      visible: simulationConfig.start === false,
      radiusUnits: "pixels",
      getFillColor: show.vectorBgMap ? [163, 230, 53, 100] : [77, 124, 15, 100],
    }),
    new IconLayer<Vehicle>({
      id: "simulation-car-layer",
      data: vehicles,
      getIcon: () => ({
        url: "/car-icon.png",
        width: 486 / 5,
        height: 1157 / 5,
        anchorX: 486 / 10, // Center horizontally
        anchorY: 1157 / 10, // Center vertically for better rotation
      }),
      visible: simulationConfig.start === true,
      getPosition: (d) => d.run.position,
      getSize: 32,
      getAngle: (d) => d.run.heading, // Now using corrected heading calculation
      sizeScale: 1,
      sizeUnits: "pixels",
    }),
    new IconLayer<Vehicle>({
      id: "drawn-car-layer",
      data: vehicles,
      getIcon: () => ({
        url: "/car-icon.png",
        width: 486 / 5,
        height: 1157 / 5,
        anchorX: 486 / 10, // Center horizontally
        anchorY: 1157 / 10, // Center vertically for better rotation
      }),
      visible: simulationConfig.start === false,
      getPosition: (d) => d.steps[d.steps.length - 1].destination.position,
      getSize: 40,
      getAngle: () => 0, // Static cars point East (default direction)
      sizeScale: 1,
      sizeUnits: "pixels",
    }),
    new PathLayer({
      id: "drawn-path-layer",
      data: [
        {
          vehicleID: 1,
          path: tempStep.routes,
        },
      ],
      getPath: (d) => d.path,
      getColor: [255, 0, 0],
      visible: simulationConfig.start === false,
      lineWidthUnits: "pixels",
      widthMinPixels: 4,
      getLineWidth: 4,
    }),
    new PathLayer({
      id: "drawn-vehicle-steps-layer", // Unique by vehicle by steps
      data: vehiclePath,
      getPath: (d) => d.routes,
      visible: simulationConfig.start === false,
      getColor: show.vectorBgMap ? [163, 230, 53, 255] : [77, 124, 15, 255],
      lineWidthUnits: "pixels",
      widthMinPixels: 4,
      getLineWidth: 2,
    }),
    // Charging Places Layer - Now using IconLayer with SVG icons
    new IconLayer<ChargingPlace>({
      id: "charging-places-layer",
      data: chargingPlaces,
      getPosition: (d) => d.position,
      getIcon: (d) => {
        // Map EVSE types to appropriate icons
        let iconUrl = "/icons/gas-station.svg"; // Default for public charging
        
        switch (d.evse_type) {
          case "residential":
            iconUrl = "/icons/house.svg";
            break;
          case "workplace":
            iconUrl = "/icons/office.svg";
            break;
          case "stop":
            iconUrl = "/icons/stop.svg";
            break;
          case "public_ac":
          case "public_dc":
          case "highway":
          case "depot":
          default:
            iconUrl = "/icons/gas-station.svg";
            break;
        }
        
        return {
          url: iconUrl,
          width: 24,
          height: 24,
          anchorX: 12,
          anchorY: 12
        };
      },
      getSize: (d) => {
        // Size based on power level
        if (d.max_power_kw >= 100) return 32;  // DC Fast Charging
        if (d.max_power_kw >= 20) return 24;   // Level 2 AC
        return 18;                             // Level 1 AC
      },
      getColor: (d) => {
        // Color tinting based on EVSE type
        switch (d.evse_type) {
          case "residential": return [100, 200, 100, 255];
          case "workplace": return [100, 150, 255, 255];
          case "public_ac": return [255, 200, 100, 255];
          case "public_dc": return [255, 100, 100, 255];
          case "highway": return [255, 50, 150, 255];
          case "depot": return [150, 100, 255, 255];
          default: return [128, 128, 128, 255];
        }
      },
      pickable: true,
      sizeScale: 1,
      sizeUnits: "pixels",
      billboard: true,
    }),
    // Battery Progress Bar Background (Black Line) for Charging Vehicles  
    new LineLayer<Vehicle>({
      id: "battery-progress-bg",
      data: vehicles.filter(v => {
        if (!simulationConfig.start) return false;
        const currentStepIndex = getCurrentStepIndex(v);
        const currentStep = v.steps[currentStepIndex];
        return currentStep?.type === "cdc"; // Only show for vehicles currently charging
      }),
      getSourcePosition: (d) => [d.run.position[0] - 0.0003, d.run.position[1] + 0.0048], // Start left of vehicle, above
      getTargetPosition: (d) => [d.run.position[0] + (0.0003 * 10), d.run.position[1] + 0.0048], // End right of vehicle, above
      getColor: [0, 0, 0, 200], // Black background line
      getWidth: 20, // 4px thick base line
      widthUnits: "pixels",
      widthMinPixels: 4,
      widthMaxPixels: 20,
    }),
    // Battery Progress Bar Fill (Colored Line) for Charging Vehicles
    new LineLayer<Vehicle>({
      id: "battery-progress-fill",
      data: vehicles.filter(v => {
        if (!simulationConfig.start) return false;
        const currentStepIndex = getCurrentStepIndex(v);
        const currentStep = v.steps[currentStepIndex];
        return currentStep?.type === "cdc"; // Only show for vehicles currently charging
      }),
      getSourcePosition: (d) => [d.run.position[0] - 0.0003, d.run.position[1] + 0.0048], // Start same as background
      getTargetPosition: (d) => {
        // Calculate dynamic line length based on SOC
        const currentStepIndex = getCurrentStepIndex(d);
        const currentStep = d.steps[currentStepIndex];
        const prevStep = currentStepIndex > 0 ? d.steps[currentStepIndex - 1] : null;
        
        let interpolatedSOC = currentStep?.soc || 0;
        if (currentStep && prevStep && simulationTime && currentStep.destination.time && prevStep.destination.time) {
          const stepStartTime = prevStep.destination.time;
          const stepEndTime = currentStep.destination.time;
          const currentTime = simulationTime;
          const stepTotalDuration = stepEndTime.diff(stepStartTime);
          const stepElapsed = currentTime.diff(stepStartTime);
          const stepProgress = Math.max(0, Math.min(1, stepElapsed / stepTotalDuration));
          const startSOC = prevStep.soc;
          const endSOC = currentStep.soc;
          interpolatedSOC = startSOC + (endSOC - startSOC) * stepProgress;
        }
        
        // Calculate end position based on SOC (0-100% = left to right)
        const socRatio = Math.max(0, Math.min(100, interpolatedSOC)) / 100;
        const maxLength = 0.0006 * 10; // Total bar length in coordinates (~60m)
        const currentLength = maxLength * socRatio;
        
        return [d.run.position[0] - 0.0003 + currentLength, d.run.position[1] + 0.0048];
      },
      getColor: (d) => {
        // Calculate SOC for color
        const currentStepIndex = getCurrentStepIndex(d);
        const currentStep = d.steps[currentStepIndex];
        const prevStep = currentStepIndex > 0 ? d.steps[currentStepIndex - 1] : null;
        
        let interpolatedSOC = currentStep?.soc || 0;
        if (currentStep && prevStep && simulationTime && currentStep.destination.time && prevStep.destination.time) {
          const stepStartTime = prevStep.destination.time;
          const stepEndTime = currentStep.destination.time;
          const currentTime = simulationTime;
          const stepTotalDuration = stepEndTime.diff(stepStartTime);
          const stepElapsed = currentTime.diff(stepStartTime);
          const stepProgress = Math.max(0, Math.min(1, stepElapsed / stepTotalDuration));
          const startSOC = prevStep.soc;
          const endSOC = currentStep.soc;
          interpolatedSOC = startSOC + (endSOC - startSOC) * stepProgress;
        }
        
        // Color gradient: red → yellow → green
        if (interpolatedSOC <= 50) {
          const ratio = interpolatedSOC / 50;
          return [255, Math.round(255 * ratio), 0, 255];
        } else {
          const ratio = (interpolatedSOC - 50) / 50;
          return [Math.round(255 * (1 - ratio)), 255, 0, 255];
        }
      },
      getWidth: 20, // Same 4px width as background
      widthUnits: "pixels",
      widthMinPixels: 4,
      widthMaxPixels: 20,
    }),
    // Vehicle SOC Text Layer - Shows battery percentage beside vehicles
    new TextLayer({
      id: "vehicle-soc-layer",  
      data: vehicles.filter(() => simulationConfig.start), // Only show when simulation is running
      getPosition: (d) => {
        // Position text slightly offset from vehicle position
        const pos = d.run.position;
        return [pos[0] + 0.002, pos[1] + 0.001]; // Offset by ~200m east and ~100m north
      },
      getText: (d) => {
        const currentStepIndex = getCurrentStepIndex(d);
        const currentStep = d.steps[currentStepIndex];
        const prevStep = currentStepIndex > 0 ? d.steps[currentStepIndex - 1] : null;
        
        let interpolatedSOC = currentStep?.soc || 0;
        
        // Smooth SOC interpolation during steps
        if (currentStep && prevStep && simulationTime && currentStep.destination.time && prevStep.destination.time) {
          const stepStartTime = prevStep.destination.time;
          const stepEndTime = currentStep.destination.time;
          const currentTime = simulationTime;
          
          // Calculate progress within current step (0 to 1)
          const stepTotalDuration = stepEndTime.diff(stepStartTime);
          const stepElapsed = currentTime.diff(stepStartTime);
          const stepProgress = Math.max(0, Math.min(1, stepElapsed / stepTotalDuration));
          
          // Interpolate SOC between previous and current step
          const startSOC = prevStep.soc;
          const endSOC = currentStep.soc;
          interpolatedSOC = startSOC + (endSOC - startSOC) * stepProgress;
        }
        
        // Round to 2 decimal places for smooth animation
        const displaySOC = Math.round(interpolatedSOC * 100) / 100;
        
        // Show different text based on step type
        if (currentStep?.type === "cdc") {
          return `🔋${displaySOC}%⚡`;
        } else if (currentStep?.type === "stop") {
          return `🔋${displaySOC}%🛑`;
        } else {
          return `🔋${displaySOC}%`;
        }
      },
      getSize: 16,
      getColor: (d) => {
        const currentStepIndex = getCurrentStepIndex(d);
        const currentStep = d.steps[currentStepIndex];
        const prevStep = currentStepIndex > 0 ? d.steps[currentStepIndex - 1] : null;
        
        // Calculate interpolated SOC for color (same logic as text)
        let interpolatedSOC = currentStep?.soc || 0;
        if (currentStep && prevStep && simulationTime && currentStep.destination.time && prevStep.destination.time) {
          const stepStartTime = prevStep.destination.time;
          const stepEndTime = currentStep.destination.time;
          const currentTime = simulationTime;
          const stepTotalDuration = stepEndTime.diff(stepStartTime);
          const stepElapsed = currentTime.diff(stepStartTime);
          const stepProgress = Math.max(0, Math.min(1, stepElapsed / stepTotalDuration));
          const startSOC = prevStep.soc;
          const endSOC = currentStep.soc;
          interpolatedSOC = startSOC + (endSOC - startSOC) * stepProgress;
        }
        
        // Calculate smooth color gradient based on SOC
        const calculateSOCColor = (soc: number): [number, number, number, number] => {
          // Clamp SOC between 0 and 100
          const clampedSOC = Math.max(0, Math.min(100, soc));
          
          if (clampedSOC <= 50) {
            // Red (0%) to Yellow (50%)
            const ratio = clampedSOC / 50;
            const red = 255;
            const green = Math.round(255 * ratio);
            const blue = 0;
            return [red, green, blue, 255];
          } else {
            // Yellow (50%) to Green (100%)
            const ratio = (clampedSOC - 50) / 50;
            const red = Math.round(255 * (1 - ratio));
            const green = 255;
            const blue = 0;
            return [red, green, blue, 255];
          }
        };
        
        // Override colors for special step types
        if (currentStep?.type === "cdc") {
          // Bright pulsing green for charging - but still show gradient
          return [0, 255, 50, 255]; // Bright green with slight blue tint for charging
        } else if (currentStep?.type === "stop") {
          // Dim the normal color for stop
          return calculateSOCColor(interpolatedSOC).map((c, i) => i === 3 ? 180 : c) as [number, number, number, number]; // Same color but more transparent
        } else {
          return calculateSOCColor(interpolatedSOC);
        }
      },
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontWeight: "bold",
      billboard: true,
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      background: true,
      getBackgroundColor: [0, 0, 0, 120], // Semi-transparent black background
      backgroundPadding: [2, 1, 2, 1] // [left, top, right, bottom] padding in pixels
    }),
  ];

  const vehiclesImportInputButtonRef = useRef<HTMLInputElement | null>(null);
  const stepsImportInputButtonRef = useRef<HTMLInputElement | null>(null);
  const placesImportInputButtonRef = useRef<HTMLInputElement | null>(null);

  const handleStepsImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      console.log("uploaded files", files);

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          try {
            const fileContent = await file.text();
            // Process fileContent (e.g., parse CSV, validate data)
            console.log(`Processing file: ${file.name}`);

            const parsedCSV = Papa.parse(fileContent, {
              header: true,
              skipEmptyLines: true,
            });
            const csvData = parsedCSV.data as {
              vehicle_id: string;
              step_type: string;
              destination_time: string;
              destination_long: string;
              destination_lat: string;
              soc: string;
              routes: string;
            }[];

            // Get Vehicle IDs

            const vehicleIDs = csvData.map((line) => {
              return parseInt(line.vehicle_id);
            });

            const uniqueVehicleIDs = [...new Set(vehicleIDs)];

            const rawVehiclesFromCSV: Vehicle[] = uniqueVehicleIDs.map((id) => {
              const vehicleStepsFromCSV: VehicleStep[] = csvData
                .filter((row) => parseInt(row.vehicle_id) === id)
                .map((row) => {
                  const routes = JSON.parse(row.routes);
                  console.log("routes", routes);
                  return {
                    type: row.step_type as "trip" | "stop" | "cdc" | "init",
                    destination: {
                      position: [
                        parseFloat(row.destination_long),
                        parseFloat(row.destination_lat),
                      ],
                      time: dayjs(row.destination_time),
                    },
                    soc: parseFloat(row.soc),
                    totalDistanceMeter: 0,
                    totalTimeMS: 0,
                    routes: routes,
                    distanceProgression: [],
                    vehicleProgressionMS: [],
                  };
                });

              console.log("vehicle position", vehicleStepsFromCSV[0]);

              return {
                id: id,
                label: `Vehicle ${id}`,
                batteryCapacityKWH: 40,
                steps: vehicleStepsFromCSV,
                run: {
                  progression: 0,
                  position: [
                    vehicleStepsFromCSV[0].destination.position[0],
                    vehicleStepsFromCSV[0].destination.position[1],
                  ],
                  heading: 0,
                },
                selected: false,
              };
            });

            // Process vehicles for simulation
            const processedVehicles = processVehiclesForSimulation(rawVehiclesFromCSV);

            setVehicles(processedVehicles);
            vehiclesRef.current = processedVehicles;
            
            localforage
              .setItem("vehicles", JSON.stringify(processedVehicles))
              .then(() => {});

            setLatestRefreshDatetime(dayjs());

            console.log("Vehicles state after import", processedVehicles);
            console.log("VehiclesRef state after import", vehiclesRef.current);

            console.log("vehicleIDs", uniqueVehicleIDs);
            console.log("vechicleData", csvData);
          } catch (error) {
            console.error(`Error reading file ${file.name}:`, error);
          }
        }

        window.location.reload();
      }
      // Reset the input value so the same file can be uploaded again
      if (event.target) {
        event.target.value = "";
      }
    },
    [],
  );

  const handlePlacesImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      console.log("uploaded charging places files", files);

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          try {
            const fileContent = await file.text();
            console.log(`Processing charging places file: ${file.name}`);

            const parsedCSV = Papa.parse(fileContent, {
              header: true,
              skipEmptyLines: true,
            });
            const csvData = parsedCSV.data as {
              id: string;
              name: string;
              longitude: string;
              latitude: string;
              evse_type: string;
              max_power_kw: string;
              price_per_kwh: string;
              operator: string;
            }[];

            const rawChargingPlacesFromCSV: ChargingPlace[] = csvData.map((row) => ({
              id: parseInt(row.id),
              name: row.name,
              position: [parseFloat(row.longitude), parseFloat(row.latitude)],
              evse_type: row.evse_type as any,
              max_power_kw: parseFloat(row.max_power_kw),
              price_per_kwh: row.price_per_kwh ? parseFloat(row.price_per_kwh) : undefined,
              operator: row.operator || undefined,
            }));

            setChargingPlaces(rawChargingPlacesFromCSV);
            chargingPlacesRef.current = rawChargingPlacesFromCSV;
            
            localforage
              .setItem("chargingPlaces", JSON.stringify(rawChargingPlacesFromCSV))
              .then(() => {
                console.log("Charging places saved to local storage");
              });

            setLatestRefreshDatetime(dayjs());
          } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
          }
        }

        window.location.reload();
      }
      // Reset the input value so the same file can be uploaded again
      if (event.target) {
        event.target.value = "";
      }
    },
    [],
  );

  // Handle JSON API import
  const handleJsonApiImport = async (url: string) => {
    setJsonApiLoading(true);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const jsonData = await response.json();
      
      // Check if the response has the expected structure
      if (!jsonData.vehicles || !Array.isArray(jsonData.vehicles)) {
        throw new Error('Invalid JSON structure. Expected { vehicles: [...] }');
      }
      
      // Process the raw vehicles data from API
      const rawVehiclesFromAPI: Vehicle[] = jsonData.vehicles.map((vehicleData: any) => {
        const rawSteps: VehicleStep[] = vehicleData.steps.map((step: any) => ({
          type: step.type as "trip" | "stop" | "cdc" | "init",
          destination: {
            position: step.destination.position,
            time: step.destination.time ? dayjs(step.destination.time) : undefined,
          },
          soc: step.soc,
          totalDistanceMeter: step.totalDistanceMeter || 0,
          totalTimeMS: step.totalTimeMS || 0,
          routes: step.routes,
          distanceProgression: step.distanceProgression || [],
          vehicleProgressionMS: step.vehicleProgressionMS || [],
        }));

        return {
          id: vehicleData.id,
          label: vehicleData.label || `Vehicle ${vehicleData.id}`,
          batteryCapacityKWH: vehicleData.batteryCapacityKWH || 40,
          steps: rawSteps,
          run: {
            progression: vehicleData.run?.progression || 0,
            position: vehicleData.run?.position || [0, 0],
            heading: vehicleData.run?.heading || 0,
          },
          selected: vehicleData.selected || false,
        };
      });

      // Process vehicles for simulation
      const processedVehicles = processVehiclesForSimulation(rawVehiclesFromAPI);

      setVehicles(processedVehicles);
      vehiclesRef.current = processedVehicles;
      
      // Save to local storage
      localforage.setItem("vehicles", JSON.stringify(processedVehicles)).then(() => {});
      setLatestRefreshDatetime(dayjs());

      console.log("Vehicles imported from API:", processedVehicles);
      alert(`Successfully imported ${processedVehicles.length} vehicles from API!`);
      
      // Clear the URL input after successful import
      setJsonApiUrl('');
      
    } catch (error) {
      console.error("Error importing from JSON API:", error);
      alert(`Error importing from API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setJsonApiLoading(false);
    }
  };

  /* -------------------- RENDERS -------------------- */

  return (
    <div className="w-full min-h-screen relative bg-slate-900">
      {/* Top Navigation */}
      <div
        id="top-navigation"
        className={`flex flex-row fixed w-full bg-white p-2 text-sm transition-all items-center gap-2 shadow z-30
        ${appStep === "normal" ? "top-0" : "-top-20"}`}
      >
        <h1 className="font-semibold mr-2">EV-SmartSim</h1>
        <div className="flex flex-row p-1 px-2 rounded bg-slate-700 gap-2 items-center text-xs">
          <span className="text-slate-100">Dataset</span>
          <button
            onClick={() => setDatasetMode('generate')}
            className={
              datasetMode === 'generate'
                ? tailwindStyles.button.selected
                : tailwindStyles.button.basic
            }
          >
            Generate
          </button>
          <button
            onClick={() => setDatasetMode('import')}
            className={
              datasetMode === 'import'
                ? tailwindStyles.button.selected
                : tailwindStyles.button.basic
            }
          >
            Import
          </button>
          <button
            onClick={() => setDatasetMode('jsonapi')}
            className={
              datasetMode === 'jsonapi'
                ? tailwindStyles.button.selected
                : tailwindStyles.button.basic
            }
          >
            JSON API
          </button>
        </div>
      </div>

      {/* Top Interface */}
      <div
        id="top-interface"
        className={`fixed w-full bg-white flex flex-row gap-2 z-20 justify-center transition-all p-4
        ${appStep === "addVehicle" || appStep === "addVehicleRoute" || appStep === "updateNewVehicleInitTime" ? "top-0" : "-top-20"}`}
      >
        {/* Add Vehicle */}
        {appStep === "addVehicle" && (
          <h3>Click on the map to place vehicle initial position</h3>
        )}

        {/* Update New Vehicle Init Time or Add Step */}
        {appStep === "updateNewVehicleInitTime" && (
          <div className="flex flex-row gap-2 items-center">
            <h3>
              {tempStep.type === "trip" 
                ? "Vehicle initialisation time" 
                : tempStep.type === "cdc" 
                ? `Add CDC step for vehicle ${selectedVehicle?.id}` 
                : tempStep.type === "stop" 
                ? `Add Stop step for vehicle ${selectedVehicle?.id}` 
                : "Vehicle initialisation time"
              }
            </h3>
            
            {/* Show DatePicker only for initial vehicle setup */}
            {tempStep.type === "trip" && (
              <DatePicker
                dateFormat={`yyyy-MM-dd h:mm`}
                placeholderText="Input initialisation time"
                selected={selectedVehicle?.steps[0].destination.time?.toDate()}
                onChange={(date) => {
                  updateNewVehicleInitTime(dayjs(date));
                }}
                timeIntervals={1}
                showTimeSelect
                className="py-1 px-2 text-xs"
                calendarClassName=""
              />
            )}
            
            {/* Show Time Delta input for CDC/STOP steps */}
            {(tempStep.type === "cdc" || tempStep.type === "stop") && (
              <>
                <input
                  value={tempStepTimeDelta}
                  onChange={(e) => {
                    if (e.target.value) {
                      updateTempStepTimeDelta(Number(e.target.value));
                    }
                  }}
                  className={tailwindStyles.input.basic}
                  type="number"
                  placeholder="Time delta (minutes)"
                />
                <span className="text-xs">minutes</span>
              </>
            )}
            
            <button
              onClick={() => {
                if (tempStep.type === "cdc" || tempStep.type === "stop") {
                  // Save CDC/STOP step
                  addVehicleSteps();
                  setTempStep(resetStep);
                }
                setAppStep("normal");
              }}
              className={`${tailwindStyles.button.basic} bg-lime-400`}
            >
              <FaTimes /> Save
            </button>
          </div>
        )}

        {/* Add Vehicle Route */}
        {appStep === "addVehicleRoute" && (
          <div className="flex flex-row gap-2 items-center">
            <h3>Draw vehicle {selectedVehicle?.id} step routes</h3>
            <input
              value={tempStepTimeDelta}
              onChange={(e) => {
                if (e.target.value) {
                  updateTempStepTimeDelta(Number(e.target.value));
                }
              }}
              className={`${tailwindStyles.input.basic}`}
              placeholder="Time delta (minutes)"
            />
            <span className="text-xs">minutes</span>
            <button
              onClick={() => {
                if (tempStep.routes.length > 0 && tempStep.destination.time) {
                  addVehicleSteps();
                }
              }}
              className={`${tailwindStyles.button.basic} ${tempStep.routes.length > 0 && tempStep.destination.time ? "bg-lime-400" : "bg-slate-300 text-slate-500"}`}
            >
              <FaCheck /> Save Step
            </button>
            <button
              onClick={() => {
                setAppStep("normal");
                setTempStep(resetStep);
              }}
              className={`${tailwindStyles.button.basic}`}
            >
              <FaTimes /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Sidebar Dataset Generator */}
      <div
        id="sidebar-dataset-generator"
        className={`flex flex-col gap-4 fixed h-screen overflow-y-auto pb-8 bg-white transition-all w-[20rem]
        ${appStep === "normal" ? "" : "-ml-[20rem]"} shadow z-20 pt-12`}
      >
        {/* Vehicles title and menu */}
        <div className="flex flex-col gap-2 px-4 pt-4">
          {vehicles.flatMap((x) => x.steps).length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-row justify-between text-xs">
                <div>
                  {simulationConfig.startTime?.format("HH:mm, D MMM YY")}
                </div>
                <div>{simulationConfig.endTime?.format("HH:mm, D MMM YY")}</div>
              </div>

              <div className="flex flex-row justify-center text-sm font-bold items-center">
                {simulationTime.format("HH:mm, D MMM YY")}
              </div>

              <div className="flex flex-row gap-2">
                <button
                  onClick={restartSimulation}
                  className={`${tailwindStyles.button.basic} grow`}
                >
                  Run Simulation <FaPlay />
                </button>
                <button
                  onClick={() =>
                    setSimulationConfig((v) => ({ ...v, start: false }))
                  }
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaStop />
                </button>
                <button
                  onClick={restartSimulation}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaArrowRotateRight />
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("⚠️ DELETE ALL DATA?\n\nThis will clear all vehicles and charging places.\nThis action cannot be undone!")) {
                      localforage.clear().then(() => {
                        setVehicles([]);
                        setChargingPlaces([]);
                        chargingPlacesRef.current = [];
                        console.log("All data cleared from local storage");
                        setLatestRefreshDatetime(dayjs());
                      });
                    }
                  }}
                  className={`flex flex-row py-1 px-2 gap-2 bg-red-200 hover:bg-red-300 rounded items-center text-xs justify-center`}
                >
                  <FaTrash />
                </button>
                {/*
                 */}
              </div>
            </div>
          )}
          {datasetMode === 'generate' && (
            <div className="flex flex-col gap-2">
              <h1 className="font-semibold">Dataset Generator</h1>
              <div className="flex flex-row justify-between items-center">
                <button
                  onClick={() => setAppStep("addVehicle")}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaPlus /> Vehicle
                </button>
              </div>
            </div>
          )}
          {datasetMode === 'import' && (
            <div className="flex flex-col gap-2">
              <h1 className="font-semibold">Dataset Importer</h1>
              <div className="flex flex-row items-center gap-2 justify-center">
                {/*
                  <button
                    onClick={() => {
                      vehiclesImportInputButtonRef.current?.click();
                    }}
                    className={`${tailwindStyles.button.basic}`}
                  >
                    <FaUpload /> Import Vehicles
                  </button>
                */}
                <button
                  onClick={() => {
                    stepsImportInputButtonRef.current?.click();
                  }}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaUpload /> Import Steps
                </button>
                <button
                  onClick={() => {
                    placesImportInputButtonRef.current?.click();
                  }}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaUpload /> Import Places
                </button>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={vehiclesImportInputButtonRef}
                />
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={stepsImportInputButtonRef}
                  onChange={handleStepsImport}
                />
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={placesImportInputButtonRef}
                  onChange={handlePlacesImport}
                />
              </div>
            </div>
          )}
          {datasetMode === 'jsonapi' && (
            <div className="flex flex-col gap-2">
              <h1 className="font-semibold">JSON API</h1>
              <div className="flex flex-col gap-2">
                <input
                  type="url"
                  placeholder="Enter JSON API URL (e.g., http://localhost:8000/vehicles)"
                  className={`${tailwindStyles.input.basic}`}
                  value={jsonApiUrl}
                  onChange={(e) => setJsonApiUrl(e.target.value)}
                  disabled={jsonApiLoading}
                />
                <button
                  onClick={() => {
                    if (jsonApiUrl.trim()) {
                      handleJsonApiImport(jsonApiUrl.trim());
                    }
                  }}
                  disabled={!jsonApiUrl.trim() || jsonApiLoading}
                  className={`${tailwindStyles.button.basic} ${
                    !jsonApiUrl.trim() || jsonApiLoading 
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                      : ''
                  }`}
                >
                  {jsonApiLoading ? (
                    <>⏳ Loading...</>
                  ) : (
                    <><FaUpload /> Fetch from API</>
                  )}
                </button>
                <div className="text-xs text-slate-600">
                  <p>Expected JSON format:</p>
                  <pre className="text-xs bg-slate-100 p-2 rounded mt-1">
{`{
  "vehicles": [
    {
      "id": 1,
      "label": "Vehicle 1",
      "batteryCapacityKWH": 40,
      "steps": [...],
      "run": {...}
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* List of vehicles */}
        <div className="flex flex-col">
          <h1 className="font-semibold px-4">Vehicle List</h1>
          {[
            vehicles.map((d, i) => {
              return (
                <div
                  onClick={() => selectVehicleByIndex(i)}
                  key={`vehicle-${i}`}
                  className={`flex text-sm flex-col gap-2 px-4 py-4 ${d.selected ? "bg-lime-200 hover:bg-lime-300" : "hover:bg-slate-100"} hover:cursor-pointer`}
                >
                  <h3 className="font-semibold">Vehicle {d.id}</h3>
                  <div className="flex flex-row justify-between text-xs items-center">
                    <h4 className="font-semibold">
                      Total steps: {d.steps.length}
                    </h4>
                    {datasetMode === 'generate' && (
                      <div className="flex flex-row items-center">
                        <FaPlus className="mr-2" />
                        <button
                          onClick={() => {
                            selectVehicleByIndex(i);
                            setAppStep("addVehicleRoute");
                          }}
                          className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                        >
                          Trip
                        </button>
                        <button
                          onClick={() => {
                            selectVehicleByIndex(i);
                            setTempStep({
                              ...resetStep,
                              type: "cdc",
                              destination: {
                                position: d.steps[d.steps.length - 1].destination.position,
                              },
                              routes: [d.steps[d.steps.length - 1].destination.position],
                            });
                            setAppStep("updateNewVehicleInitTime");
                          }}
                          className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                        >
                          CDC
                        </button>
                        <button
                          onClick={() => {
                            selectVehicleByIndex(i);
                            setTempStep({
                              ...resetStep,
                              type: "stop",
                              destination: {
                                position: d.steps[d.steps.length - 1].destination.position,
                              },
                              routes: [d.steps[d.steps.length - 1].destination.position],
                            });
                            setAppStep("updateNewVehicleInitTime");
                          }}
                          className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                        >
                          Stop
                        </button>
                      </div>
                    )}
                  </div>

                  {/* List of steps of this vehicle */}
                  <div className="flex flex-col gap-2">
                    {d.steps.map((d2, i2) => {
                      let totalDistance = 0;
                      for (let i = 0; i < d2.routes.length - 1; i++) {
                        const point1 = point([
                          d2.routes[i][0],
                          d2.routes[i][1],
                        ]);
                        const point2 = point([
                          d2.routes[i + 1][0],
                          d2.routes[i + 1][1],
                        ]);
                        totalDistance += distance(point1, point2, {
                          units: "kilometers",
                        });
                      }

                      const currentStepIndex = getCurrentStepIndex(d);
                      const isCurrentStep = currentStepIndex === i2;

                      return (
                        <div
                          className={`flex gap-2 justify-between text-xs flex-row p-1 rounded ${
                            isCurrentStep 
                              ? "bg-lime-200 border-2 border-lime-400 font-bold" 
                              : "hover:bg-slate-50"
                          }`}
                          key={`vehicle-${i}-step-${i2}`}
                        >
                          <span>{i + 1}</span>
                          <span className={`${isCurrentStep ? "text-lime-700" : ""}`}>
                            {d2.type}
                          </span>
                          <span>{d2.destination.time?.format("HH:mm")}</span>
                          <span>{totalDistance.toFixed(4)} km</span>
                          {isCurrentStep && (
                            <span className="text-lime-600 text-xs">● ACTIVE</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }),
          ]}
          <div className="flex flex-row gap-2 p-4">
            <Button 
              size="small"
              onClick={() => {
                downloadVehicleDataAsCSV(vehicles);
              }}
            >
              Download CSV
            </Button>
            <Button 
              size="small"
              onClick={() => {
                downloadVehicleDataAsJSON(vehicles);
              }}
            >
              Download JSON
            </Button>
          </div>
        </div>
      </div>
      <DeckGL
        layers={layers}
        views={new MapView({ repeat: true })}
        viewState={viewState}
        onViewStateChange={(vs) => {
          setViewState(vs.viewState);
        }}
        controller={true}
        style={{ pointerEvents: "auto" }}
        onClick={handleMapClick}
      >
        <div style={COPYRIGHT_LICENSE_STYLE}>
          {"© "}
          <a
            style={LINK_STYLE}
            href="http://www.openstreetmap.org/copyright"
            target="blank"
          >
            OpenStreetMap contributors
          </a>
        </div>
      </DeckGL>
    </div>
  );
};

export default SimulatorBasic;

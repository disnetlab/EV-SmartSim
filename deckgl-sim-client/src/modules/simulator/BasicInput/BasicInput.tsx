import DeckGL, {
  BitmapLayer,
  Color,
  FlyToInterpolator,
  GeoJsonLayer,
  IconLayer,
  MapView,
  MapViewState,
  PathLayer,
  Position,
  ScatterplotLayer,
  TileLayer,
} from "deck.gl";
import { PathStyleExtension } from "@deck.gl/extensions";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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

const INITIAL_COORDINATES = [144.9555, -37.811333]; // Latitude, Longitude for Clayton, Victoria

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

interface VehicleStep {
  type: "trip" | "stop" | "cdc" | "init";
  destination: {
    position: Position;
    time?: Dayjs;
  };
  soc: number;
  totalDistanceMeter: number;
  totalTimeMS: number;
  routes: Position[];
  distanceProgression: number[];
  vehicleProgressionMS: number[];
}

interface Vehicle {
  id: number;
  label: string;
  batteryCapacityKWH: number;
  steps: VehicleStep[];
  run: {
    progression: number;
    position: Position;
    heading: number;
  };
  selected: boolean;
}

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
  const MS_PER_MINUTE_SIMULATION = 1000;
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

  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Simulation time
  const [simulationTime, setSimulationTime] = useState(dayjs());

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
  ): number => {
    if (!prevPos || !currentPos) return 0;

    const [long1, lat1] = prevPos;

    const northPoint = [long1, lat1 + 0.001];

    let angle = 0;
    angle = turf.angle(northPoint, prevPos, currentPos);

    console.log(
      `getHeading vehicle ${vehicleID} prev: ${prevPos}, current: ${currentPos}, heading: ${angle}`,
    );

    return angle;
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
              let newVehiclePositionUpdated = false;

              // Traversing steps and step routes to get recent route position
              vehicle.steps.map((step, stepIndex) => {
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
                      );
                      newVehiclePositionUpdated = true;
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
                      );
                      newVehiclePositionUpdated = true;
                    } else {
                      // console.log(`Got it from current position`, progressIndex, currentRoutePosition)
                      const prevPosition = newVehiclePosition;
                      newVehiclePosition = currentRoutePosition;
                      newVehicleHeading = getHeading(
                        [prevPosition[0], prevPosition[1]],
                        [newVehiclePosition[0], newVehiclePosition[1]],
                        vehicle.id,
                      );
                      newVehiclePositionUpdated = true;
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
  }, [simulationConfig]);

  // App menus visibiliy config
  const [show, setShow] = useState({
    tileBgMap: true,
    vectorBgMap: false,
    datasetGenerator: false,
    datasetImporter: false,
  });

  /* -------------------- VEHICLE STATE -------------------- */

  const loadVehiclesFromLocal = async (): Promise<Vehicle[]> => {
    let processedVehicles: Vehicle[] = [];

    const res = await localforage.getItem("vehicles");

    if (res) {
      const vehiclesFromLocal: Vehicle[] = JSON.parse(res as string);
      if (vehiclesFromLocal) {
        processedVehicles = vehiclesFromLocal.map((vehicle) => {
          console.log("vehicle from file", vehiclesFromLocal);

          let totalVehicleProgressionMS = 0;

          // Iterating Vehicle Steps
          const steps = [
            ...vehicle.steps.map((step, stepIndex) => {
              const timeString = step.destination.time;
              let totalDistanceMeter = 0;
              let totalTimeMS = 0;
              let distanceProgression: number[] = [];
              let vehicleProgressionMS: number[] = [];

              if (stepIndex > 0 && step.type === "trip") {
                const destinationTime = dayjs(step.destination.time);
                const previousDestinationTime = dayjs(
                  vehicle.steps[stepIndex - 1].destination.time,
                );

                totalTimeMS = destinationTime
                  ? destinationTime.diff(previousDestinationTime)
                  : 0;
              }

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
                    (routeDistance / totalDistanceMeter) * totalTimeMS;
                }

                vehicleProgressionMS[routeIndex] = totalVehicleProgressionMS;
              });

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
            }),
          ];

          const computedVehicle = {
            ...vehicle,
            run: {
              ...vehicle.run,
              heading: 0,
              progression: 0,
            },
            steps: steps,
          };

          console.log("computedVehicle", computedVehicle);

          return computedVehicle;
        });
      }
    }

    return processedVehicles;
  };

  useEffect(() => {
    loadVehiclesFromLocal().then((res) => {
      setVehicles(res);
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
    setVehicles(
      vehicles.map((d) => {
        if (d.selected) {
          d.steps = [
            ...d.steps,
            {
              soc: 100,
              type: "trip",
              destination: {
                time: tempStep.destination.time,
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
      }),
    );
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

    vehicles.forEach((vehicle) => {
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

      localforage.setItem("vehicles", JSON.stringify(vehicles)).then(() => {});

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
        anchorY: 64, // Adjust based on your icon
      }),
      visible: simulationConfig.start === true,
      getPosition: (d) => d.run.position,
      getSize: 32, // Adjust size as needed
      getAngle: (d) => d.run.heading, // Subtract 90 to align icon properly
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
        anchorY: 64, // Adjust based on your icon
      }),
      visible: simulationConfig.start === false,
      getPosition: (d) => d.steps[d.steps.length - 1].destination.position,
      getSize: 40, // Adjust size as needed
      getAngle: () => 0, // Subtract 90 to align icon properly
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
  ];

  const vehiclesImportInputButtonRef = useRef<HTMLInputElement | null>(null);
  const stepsImportInputButtonRef = useRef<HTMLInputElement | null>(null);

  const handleFileImport = (
    event: ChangeEvent<HTMLInputElement>,
    type: "vehicles" | "steps",
  ) => {};

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
            onClick={() => setShow((v) => ({ ...v, datasetGenerator: true }))}
            className={
              show.datasetGenerator
                ? tailwindStyles.button.selected
                : tailwindStyles.button.basic
            }
          >
            Generate
          </button>
          <button
            onClick={() => setShow((v) => ({ ...v, datasetGenerator: false }))}
            className={
              show.datasetGenerator
                ? tailwindStyles.button.basic
                : tailwindStyles.button.selected
            }
          >
            Import
          </button>
        </div>
        {/*
          <button
            onClick={() => setShow(v => ({...v, vectorBgMap: !v.vectorBgMap}))}
            className={`${tailwindStyles.button.basic}`}
          >
            {show.vectorBgMap ? <FaCheckSquare /> : <FaSquare />} Vector Map
          </button>
          <button
            onClick={() => setShow(v => ({...v, datasetGenerator: !v.datasetGenerator}))}
            className={`${tailwindStyles.button.basic}`}
          >
            {show.datasetGenerator ? <FaCheckSquare /> : <FaSquare />} Generate Data
          </button>
          <button
            onClick={() => setShow(v => ({...v, datasetImporter: !v.datasetImporter}))}
            className={`${tailwindStyles.button.basic}`}
          >
            {show.datasetImporter ? <FaCheckSquare /> : <FaSquare />} Import Data
          </button>
          <button
            className={`${tailwindStyles.button.basic}`}
          >
            Suggestion Form
          </button>
        */}
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

        {/* Update New Vehicle Init Time */}
        {appStep === "updateNewVehicleInitTime" && (
          <div className="flex flex-row gap-2 items-center">
            <h3>Vehicle intialisation time</h3>
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
            <button
              onClick={() => {
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
                  onClick={() => localforage.clear()}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaTrash />
                </button>
                {/*
                 */}
              </div>
            </div>
          )}
          {show.datasetGenerator && (
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
          {!show.datasetGenerator && (
            <div className="flex flex-col gap-2">
              <h1 className="font-semibold">Dataset Importer</h1>
              <div className="flex flex-row items-center gap-2 justify-center">
                <button
                  onClick={() => {
                    vehiclesImportInputButtonRef.current?.click();
                  }}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaUpload /> Import Vehicles
                </button>
                <button
                  onClick={() => {
                    stepsImportInputButtonRef.current?.click();
                  }}
                  className={`${tailwindStyles.button.basic}`}
                >
                  <FaUpload /> Import Steps
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
                />
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
                    {show.datasetGenerator && (
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
                          }}
                          className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                        >
                          CDC
                        </button>
                        <button
                          onClick={() => {
                            selectVehicleByIndex(i);
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

                      return (
                        <div
                          className="flex gap-2 justify-between text-xs flex-row"
                          key={`vehicle-${i}-step-${i2}`}
                        >
                          <span>{i + 1}</span>
                          <span>{d2.type}</span>
                          <span>{d2.destination.time?.format("HH:mm")}</span>
                          <span>{totalDistance.toFixed(4)} km</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }),
          ]}
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

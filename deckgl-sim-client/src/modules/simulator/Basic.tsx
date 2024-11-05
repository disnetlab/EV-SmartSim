import DeckGL, { BitmapLayer, Color, FlyToInterpolator, GeoJsonLayer, IconLayer, LinearInterpolator, MapView, MapViewState, PathLayer, Position, ScatterplotLayer, TileLayer } from "deck.gl"
import { PathStyleExtension } from "@deck.gl/extensions"
import { useEffect, useMemo, useState } from "react"
import { FaCheckSquare, FaSquare, FaTimes } from "react-icons/fa"
import dayjs, { Dayjs } from "dayjs"
import { FaCheck, FaPlus } from "react-icons/fa6"
import { point, distance } from "@turf/turf"
import DatePicker from "react-datepicker"
import 'react-datepicker/dist/react-datepicker.css'

const tailwindStyles = {
  button: {
    basic: `flex flex-row py-1 px-2 gap-2 bg-slate-200 hover:bg-slate-300 rounded items-center text-xs`,
  },
  input: {
    basic: `border border-slate-300 py-1 px-2 rounded`,
  },
}

type AppStep = "normal" | "addVehicle" | "updateNewVehicleInitTime" | "addVehicleRoute"

const INITIAL_COORDINATES = [144.95550000, -37.81133300] // Latitude, Longitude for Clayton, Victoria

// const DEFAULT_VEHICLE_SPEED_KMH = 60

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: INITIAL_COORDINATES[1],
  longitude: INITIAL_COORDINATES[0],
  zoom: 13,
  maxZoom: 20,
  maxPitch: 89,
  bearing: 0
};

const COPYRIGHT_LICENSE_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 0,
  backgroundColor: 'hsla(0,0%,100%,.5)',
  padding: '0 5px',
  font: '12px/20px Helvetica Neue,Arial,Helvetica,sans-serif'
}

const LINK_STYLE: React.CSSProperties = {
  textDecoration: 'none',
  color: 'rgba(0,0,0,.75)',
  cursor: 'grab'
}

interface VehicleStep {
  type: "trip" | "stop" | "cdc" | "init"
  destination: {
    position: Position 
    time?: Dayjs
  }
  routes: Position[]
}

interface Vehicle {
  id: number,
  initialPosition: [longitude: number, latitude: number]
  steps: VehicleStep[]
  heading: number
  selected: boolean
}

/* global window */
const devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1

const SimulatorBasic = ({
  showBorder = false,
  onTilesLoad,
}: {
  showBorder?: boolean,
  onTilesLoad?: () => void,
}) => {

  // Simulator step
  const [appStep, setAppStep] = useState<AppStep>("normal")

  // Deck.gl viewState
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE)

  // App menus visibiliy config 
  const [show, setShow] = useState({
    tileBgMap: true,
    vectorBgMap: false,
    datasetGenerator: true,
    datasetImporter: false,
  })

  // List of vehicles in simulator
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  // Temporary vehicle steps creation
  const resetStep: VehicleStep = {
    type: "trip", 
    destination: {
      position: [INITIAL_COORDINATES[0], INITIAL_COORDINATES[1]], 
    },
    routes: [],
  }

  const [tempStep, setTempStep] = useState<VehicleStep>(resetStep)

  useEffect(() => {

    console.log("tempStep", tempStep)
  }, [tempStep])

  // Get selected vehicle
  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.selected),
    [vehicles],
  ) 

  // Update new vehicle init time
  const updateNewVehicleInitTime = (date: Dayjs) => {
    setVehicles(vehicles.map((d) => {
      if (d.selected) {
        d.steps[0].destination.time = date
      }
      return d
    }))
  }

  // Add new vehicle
  const addVehicle = (initialPosition: [longitude: number, latitude: number]) => {

    // Add the vehicle
    setVehicles(v => {
      const newVehicleStep: VehicleStep = {
        type: "init",
        destination: {
          time: dayjs(),
          position: initialPosition,     
        },
        routes: [initialPosition],
      }

      const output = ([
        ...v.map(w => {
          w.selected = false
          return w
        }),
        {
          id: vehicles.length + 1,
          initialPosition: initialPosition,
          steps: [newVehicleStep],
          heading: 0,
          selected: true,
        }
      ])

      setViewState(w => ({
        ...w,
        longitude: initialPosition[0],
        latitude: initialPosition[1],
        transitionDuration: 200,
        transitionInterpolator: new FlyToInterpolator(),
      }))

      setAppStep("updateNewVehicleInitTime")

      return output
    })
  }

  // Select vehicle by index
  const selectVehicleByIndex = (index: number) => {
    setVehicles(v => {

      console.log("selectVehicle", v[index])

      if (v[index].steps.length > 0) {
        const latestStep = v[index].steps[v[index].steps.length - 1]
        const latestPosition = latestStep.routes[latestStep.routes.length - 1]
        setViewState(w => ({
          ...w,
          longitude: latestPosition[0],
          latitude: latestPosition[1],
          transitionDuration: 200,
          transitionInterpolator: new FlyToInterpolator(),
        }))
      } else {
        setViewState(w => ({
          ...w,
          longitude: v[index].initialPosition[0],
          latitude: v[index].initialPosition[1],
          transitionDuration: 200,
          transitionInterpolator: new LinearInterpolator(),
        }))
      }

      return [
        ...v.slice(0, index).map(w => ({...w, selected: false})),
        {
          ...v[index],
          selected: true,
        },
        ...v.slice(index + 1).map(w => ({...w, selected: false})),
      ]
    })

  }

  // Add vehicle steps
  const addVehicleSteps = () => {
    setVehicles(vehicles.map((d) => {

      if (d.selected) {
        d.steps = [
          ...d.steps,
          {
            type: "trip", 
            destination: {
              time: tempStep.destination.time,
              position: tempStep.routes[tempStep.routes.length - 1],
            },
            routes: tempStep.routes,
          }
        ]
      }

      return d
    }))
    setTempStep(resetStep)
    setAppStep("normal")
  } 

  // Update temporary vehicle step time delta
  const updateTempStepTimeDelta = (minute: number) => {

    if (selectedVehicle) {
      // Get current destination time for this vehicle 
      const currentDestinationTime = selectedVehicle.steps[selectedVehicle.steps.length - 1].destination.time

      if (currentDestinationTime) {
        const newDestinationTime = currentDestinationTime.add(minute, "minute")
        console.log("newDestionationTime", newDestinationTime)
        setTempStep(v => ({...v, destination: {...v.destination, time: newDestinationTime}}))
      }
    }
  } 

  const tempStepTimeDelta = useMemo(
    () => {

      if (selectedVehicle) {
        // Get current destination time for this vehicle 
        const currentDestinationTime = selectedVehicle.steps[selectedVehicle.steps.length - 1].destination.time

        const newDestinationTime = tempStep.destination.time

        if (currentDestinationTime && newDestinationTime) {
          const minuteDiff = newDestinationTime.diff(currentDestinationTime, "minute")
          return minuteDiff
        }
      }

      return '' 
    },
    [tempStep],
  ) 

  // Convert steps from each vehicles into Deck.gl readable path
  const vehiclePath: (VehicleStep & {vehicleID: number, stepID: number})[] = useMemo(
    () => vehicles.map(v => v.steps.map((w, i) => ({...w, vehicleID: v.id, stepID: i}))).flat(),
    [vehicles],
  )

  // Handle Deck.gl map click for various simulator functions 
  const handleMapClick = (event: any) => {
    if (appStep !== "addVehicleRoute" && appStep !== "addVehicle") return
    const { coordinate } = event

    if (appStep === "addVehicleRoute" && selectedVehicle) {
      setTempStep(current => {
        const initPath: Position[] = []

        // Add latest point as initial path
        if (current.routes.length === 0) {

          if (selectedVehicle.steps.length === 0) {
            initPath.push(selectedVehicle.initialPosition)
          } else {
            const latestStep = selectedVehicle.steps[selectedVehicle.steps.length - 1]
            const latestPosition = latestStep.routes[latestStep.routes.length - 1]
            if (latestPosition) {
              initPath.push(latestPosition)
            }
          }
          
        }

        const newRoutes = [...initPath, ...current.routes, coordinate]
        
        return {
          ...current,
          routes: newRoutes,
        }
      })
    }

    if (appStep === "addVehicle") {
      addVehicle(coordinate)
    }

  }

  // Basemap layer using Open Street Map service
  const tileLayer = new TileLayer<ImageBitmap>({
    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
    data: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
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
    renderSubLayers: props => {
      const [[west, south], [east, north]] = props.tile.boundingBox;
      const {data, ...otherProps} = props;

      return [
        new BitmapLayer(otherProps, {
          image: data,
          bounds: [west, south, east, north]
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
                [west, north]
              ]
            ],
            getPath: d => d,
            getColor: [255, 0, 0],
            widthMinPixels: 4
          })
      ]
    }
  })

  // All Deck.gl layers used in simulator
  const layers = [
    show.tileBgMap && tileLayer,
    show.vectorBgMap && new GeoJsonLayer({
      id: 'greater-melbourne-boundary-layer',
      data: 'https://urbancomputing.org/files/greater-melbourne-boundary.geojson', 
      filled: true,
      getFillColor: [30, 41, 59, 255],
    }),
    show.vectorBgMap && new GeoJsonLayer({
      id: 'greater-melbourne-localities-layer',
      data: 'https://urbancomputing.org/files/simplified-greater-melbourne-localities.json', 
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
      extensions: [
        new PathStyleExtension({dash: true}), 
      ],
    }),
    show.vectorBgMap && new GeoJsonLayer({
      id: 'greater-melbourne-roads-layer',
      data: 'https://urbancomputing.org/files/greater-melbourne-filtered-roads.geojson', 
      filled: true,
      lineWidthUnits: "pixels",
      getLineColor: (d: any): Color => {
        let color: [number, number, number, number] = [100, 116, 139, 150]

        switch (d.properties['CLASS_CODE']) {
          case 0:
            color = [100, 116, 139, 255]
            break
          case 1:
            color = [100, 116, 139, 255]
            break
          case 2:
            color = [100, 116, 139, 255]
            break
          default:
          break
        }

        return color 
      },
      getLineWidth: (d) => {
        let width = 1 

        switch (d.properties['CLASS_CODE']) {
          case 0:
            width = 5
            break
          case 1:
            width = 3 
            break
          case 2:
            width = 2 
            break
        }

        return width
      },
    }),
    new ScatterplotLayer<Vehicle>({
      id: 'car-highlight-layer',
      data: vehicles.filter(v => v.selected),
      getPosition: d => d.steps.length === 0 ? d.initialPosition : d.steps[d.steps.length - 1].destination.position,
      getRadius: 40,
      radiusUnits: "pixels",
      getFillColor: show.vectorBgMap ? [163, 230, 53, 100] : [77, 124, 15, 100],
    }),
    new IconLayer<Vehicle>({
      id: 'car-layer',
      data: vehicles,
      getIcon: () => ({
        url: '/car-icon.png',
        width: 1157/5,
        height: 486/5,
        anchorY: 64  // Adjust based on your icon
      }),
      getPosition: d => d.steps.length === 0 ? d.initialPosition : d.steps[d.steps.length - 1].destination.position,
      getSize: 20,  // Adjust size as needed
      getAngle: d => d.heading - 0 + 180,  // Subtract 90 to align icon properly
      sizeScale: 1,
      sizeUnits: 'pixels',
    }),
    new PathLayer({
      id: 'drawn-path-layer',
      data: [
        {
          vehicleID: 1,
          path: tempStep.routes, 
        } 
      ],
      getPath: d => d.path,
      getColor: [255, 0, 0],
      lineWidthUnits: "pixels",
      widthMinPixels: 4,
      getLineWidth: 4,
    }),
    new PathLayer({
      id: 'drawn-vehicle-steps-layer', // Unique by vehicle by steps
      data: vehiclePath,
      getPath: d => d.routes,
      getColor: show.vectorBgMap ? [163, 230, 53, 255] : [77, 124, 15, 255],
      lineWidthUnits: "pixels",
      widthMinPixels: 4,
      getLineWidth: 2,
    }),
  ]

  return (
    <div className="w-full min-h-screen relative bg-slate-900">

      {/* Top Navigation */}
      <div
        id="top-navigation"
        className={`flex flex-row fixed w-full bg-white p-2 text-sm transition-all items-center gap-2 shadow z-30
        ${appStep === "normal" ? 'top-0' : '-top-20'}`}
      >
        <h1 className="font-semibold mr-2">EV-SmartSim</h1>
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
        {/*
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
        ${(appStep === "addVehicle" || appStep === "addVehicleRoute" || appStep === "updateNewVehicleInitTime" ) ? 'top-0' : '-top-20'}`}
      >

        {/* Add Vehicle */}
        {appStep === "addVehicle" && <h3>Click on the map to place vehicle initial position</h3>} 

        {/* Update New Vehicle Init Time */}
        {appStep === "updateNewVehicleInitTime" &&
          <div className="flex flex-row gap-2 items-center">
            <h3>Vehicle intialisation time</h3>
            <DatePicker
              dateFormat={`yyyy-MM-dd h:mm`}
              placeholderText="Input initialisation time"
              selected={selectedVehicle?.steps[0].destination.time?.toDate()}
              onChange={date => {
                updateNewVehicleInitTime(dayjs(date))
              }}
              timeIntervals={1}
              showTimeSelect
              className="py-1 px-2 text-xs"
              calendarClassName=""
            />
          <button
            onClick={() => {
              setAppStep("normal")
            }}
            className={`${tailwindStyles.button.basic} bg-lime-400`}
          >
            <FaTimes /> Save 
          </button>
          </div>
        } 

        {/* Add Vehicle Route */}
        {appStep === "addVehicleRoute" &&
          <div className="flex flex-row gap-2 items-center">
            <h3>Draw vehicle {selectedVehicle?.id} step routes</h3>
            <input 
              value={tempStepTimeDelta}
              onChange={e => {
                if (e.target.value) {
                  updateTempStepTimeDelta(Number(e.target.value))
                }
              }}
              className={`${tailwindStyles.input.basic}`} 
              placeholder="Time delta (minutes)"
            />
            <span className="text-xs">minutes</span>
            <button
              onClick={() => {
                if (tempStep.routes.length > 0 && tempStep.destination.time) {
                  addVehicleSteps()
                }
              }}
              className={`${tailwindStyles.button.basic} ${(tempStep.routes.length > 0 && tempStep.destination.time) ? 'bg-lime-400' : 'bg-slate-300 text-slate-500'}`}
            >
              <FaCheck /> Save Step
            </button>
            <button
              onClick={() => {
                setAppStep("normal")
                setTempStep(resetStep)
              }}
              className={`${tailwindStyles.button.basic}`}
            >
              <FaTimes /> Cancel 
            </button>
          </div>
        } 
      </div>

      {/* Sidebar Dataset Generator */}
      <div
        id="sidebar-dataset-generator"
        className={`flex flex-col gap-4 fixed h-screen overflow-y-auto pb-8 bg-white transition-all w-[20rem]
        ${show.datasetGenerator && (appStep === "normal") ? '' : '-ml-[20rem]'} shadow z-20 pt-12`}
      >

        {/* Vehicles title and menu */}
        <div className="flex flex-col gap-2 px-4">
          <h1 className="font-semibold">Dataset Generator</h1>
          <div className="flex flex-row justify-between items-center">
            <h2 className="font-semibold text-sm">Vehicles</h2>
            <button
              onClick={() => setAppStep("addVehicle")}
              className={`${tailwindStyles.button.basic}`}
            >
              <FaPlus /> Vehicle
            </button>
          </div>
        </div>

        {/* List of vehicles */}
        <div className="flex flex-col">
          {[vehicles.map((d, i) => {
            return (
              <div
                onClick={() => selectVehicleByIndex(i)}
                key={`vehicle-${i}`}
                className={`flex text-sm flex-col gap-2 px-4 py-4 ${d.selected ? 'bg-lime-200 hover:bg-lime-300' : 'hover:bg-slate-100'} hover:cursor-pointer`}
              >
                <h3 className="font-semibold">
                  Vehicle {d.id}
                </h3> 
                <div className="flex flex-row justify-between text-xs items-center">
                  <h4 className="font-semibold">Total steps: {d.steps.length}</h4> 
                  <div className="flex flex-row items-center">
                    <FaPlus className="mr-2" /> 
                    <button
                      onClick={() => {
                        selectVehicleByIndex(i)
                        setAppStep("addVehicleRoute")
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      Trip 
                    </button>
                    <button
                      onClick={() => {
                        selectVehicleByIndex(i)
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      CDC 
                    </button>
                    <button
                      onClick={() => {
                        selectVehicleByIndex(i)
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      Stop 
                    </button>
                  </div>
                </div> 

                {/* List of steps of this vehicle */}
                <div className="flex flex-col gap-2">
                  {d.steps.map((d2, i2) => {

                    let totalDistance = 0
                    for (let i = 0; i < d2.routes.length - 1; i++) {
                      const point1 = point([d2.routes[i][0], d2.routes[i][1]])
                      const point2 = point([d2.routes[i + 1][0], d2.routes[i + 1][1]])
                      totalDistance += distance(point1, point2, { units: 'kilometers' })
                    }

                    return (
                      <div className="flex gap-2 justify-between text-xs flex-row" key={`vehicle-${i}-step-${i2}`}>
                        <span>{i + 1}</span>
                        <span>{d2.type}</span>
                        <span>{d2.destination.time?.format("HH:mm")}</span>
                        <span>{totalDistance.toFixed(4)} km</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })]}
        </div>
      </div>
      <DeckGL
        layers={layers}
        views={new MapView({repeat: true})}
        viewState={viewState}
        onViewStateChange={vs => {
          setViewState(vs.viewState)
        }}
        controller={true}
        style={{pointerEvents: "auto"}}
        onClick={handleMapClick}
      >


        <div style={COPYRIGHT_LICENSE_STYLE}>
          {'© '}
          <a style={LINK_STYLE} href="http://www.openstreetmap.org/copyright" target="blank">
            OpenStreetMap contributors
          </a>
        </div>
      </DeckGL>
    </div>
  )
}

export default SimulatorBasic

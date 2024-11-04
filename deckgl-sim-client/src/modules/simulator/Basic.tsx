import DeckGL, { BitmapLayer, Color, GeoJsonLayer, IconLayer, MapView, MapViewState, PathLayer, Position, TileLayer } from "deck.gl"
import type { TileLayerPickingInfo } from "@deck.gl/geo-layers"
import { PathStyleExtension } from "@deck.gl/extensions"
import { useMemo, useState } from "react"
import { FaCheckSquare, FaSquare } from "react-icons/fa"
import dayjs, { Dayjs } from "dayjs"
import { FaCheck, FaPlus } from "react-icons/fa6"
import { point, distance } from "@turf/turf"

const tailwindStyles = {
  button: {
    basic: `flex flex-row py-1 px-2 gap-2 bg-slate-200 hover:bg-slate-300 rounded items-center text-xs`,
  },
}

const CLAYTON_COORDINATES = [145.1300, -37.9152] // Latitude, Longitude for Clayton, Victoria

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: CLAYTON_COORDINATES[1],
  longitude: CLAYTON_COORDINATES[0],
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
  type: "trip" | "stop" | "cdc"
  destination: {
    position: Position 
    time: Dayjs
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

  const [show, setShow] = useState({
    tileBgMap: true,
    vectorBgMap: true,
    datasetGenerator: true,
    datasetImporter: true,
  })

  const resetDrawing = {
    vehicleRoute: false,
    vehicleInitPosition: false, 
  }
  const [drawing, setDrawing] = useState(resetDrawing) // Track drawing mode
  const [tempPathPoints, setTempPathPoints] = useState<Position[]>([]) // Store temporary path points for drawing

  const [heading, setHeading] = useState<number>(0)
  const [carPosition, setCarPosition] = useState<number[]>(CLAYTON_COORDINATES)

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    {
      id: 1,
      initialPosition: [CLAYTON_COORDINATES[0], CLAYTON_COORDINATES[1]], 
      steps: [],
      heading: 0,
      selected: false,
    }
  ])

  const addVehicle = (initialPosition: [longitude: number, latitude: number]) => {
    setVehicles(v => {
      const output = ([
        ...v,
        {
          id: vehicles.length + 1,
          initialPosition: initialPosition,
          steps: [],
          heading: 0,
          selected: false,
        }
      ])

      setDrawing(resetDrawing)

      return output
    })
  }

  const selectVehicle = (index: number) => {
    setVehicles(v => ([
      ...v.slice(0, index).map(w => ({...w, selected: false})),
      {
        ...v[index],
        selected: true,
      },
      ...v.slice(index + 1).map(w => ({...w, selected: false})),
    ]))
  }

  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.selected),
    [vehicles],
  ) 

  const addVehicleSteps = () => {

    setVehicles(vehicles.map((d) => {

      if (d.selected) {
        d.steps = [
          ...d.steps,
          {
            type: "trip", 
            destination: {
              time: dayjs(),
              position: tempPathPoints[tempPathPoints.length - 1],
            },
            routes: tempPathPoints,
          }
        ]
      }

      return d
    }))

    setTempPathPoints([])
    setDrawing(resetDrawing)

  } 

  const vehiclePath: (VehicleStep & {vehicleID: number, stepID: number})[] = useMemo(
    () => vehicles.map(v => v.steps.map((w, i) => ({...w, vehicleID: v.id, stepID: i}))).flat(),
    [vehicles],
  )

  const handleMapClick = (event: any) => {
    if (!drawing) return
    const { coordinate } = event

    if (drawing.vehicleRoute && selectedVehicle) {
      setTempPathPoints(current => {

        const initPath: Position[] = []

        // Add latest point as initial path
        if (current.length === 0) {

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

        return [...initPath, ...current, coordinate]
      })
    }

    if (drawing.vehicleInitPosition) {
      addVehicle(coordinate)
    }

    console.log("pathPoints now", tempPathPoints)
  }

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
    new IconLayer<Vehicle>({
      id: 'car-layer',
      data: vehicles,
      getIcon: d => ({
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
          path: tempPathPoints, 
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
      getColor: show.vectorBgMap ? [255, 255, 0] : [0, 0, 0],
      lineWidthUnits: "pixels",
      widthMinPixels: 2,
      getLineWidth: 2,
    }),
  ]

  return (
    <div className="w-full min-h-screen relative bg-slate-900">
      <div className={`flex flex-row fixed w-full bg-white p-2 text-sm transition-all items-center gap-2 shadow z-30 ${(drawing.vehicleRoute || drawing.vehicleInitPosition) ? '-top-20' : 'top-0 '}`}>
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
        <button
          onClick={() => setShow(v => ({...v, datasetImporter: !v.datasetImporter}))}
          className={`${tailwindStyles.button.basic}`}
        >
          {show.datasetImporter ? <FaCheckSquare /> : <FaSquare />} Import Data  
        </button>
      </div>

      <div className={`fixed w-full bg-white flex flex-row gap-2 z-20 justify-center transition-all p-4 ${((drawing.vehicleRoute && selectedVehicle) || drawing.vehicleInitPosition) ? 'top-0' : '-top-20'}`}>
        {drawing.vehicleRoute && <h3>Draw Vehicle {selectedVehicle?.id} Routes for This Step</h3>} 
        {drawing.vehicleInitPosition && <h3>Click on the map to place vehicle initial position</h3>} 
        {drawing.vehicleRoute &&
          <button
            onClick={() => {
              addVehicleSteps()
            }}
            className={`${tailwindStyles.button.basic}`}
          >
            <FaCheck /> Save Step
          </button>
        }
      </div>

      <div className={`flex flex-col gap-4 fixed h-screen overflow-y-auto pb-8 bg-white transition-all w-[20rem] ${show.datasetGenerator && (!drawing.vehicleRoute && !drawing.vehicleInitPosition) ? '' : '-ml-[20rem]'} shadow z-20 pt-12`}>
        <div className="flex flex-col gap-2 px-4">
          <h1 className="font-semibold">Dataset Generator</h1>
          <div className="flex flex-row justify-between items-center">
            <h2 className="font-semibold text-sm">Vehicles</h2>
            <button
              onClick={() => setDrawing(v => ({...v, vehicleInitPosition: true, vehicleRoute: false}))}
              className={`${tailwindStyles.button.basic}`}
            >
              <FaPlus /> Vehicle
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          {[vehicles.map((d, i) => {
            return (
              <div
                onClick={() => selectVehicle(i)}
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
                        selectVehicle(i)
                        setDrawing(v => ({...v, vehicleInitPosition: false, vehicleRoute: true}))
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      Trip 
                    </button>
                    <button
                      onClick={() => {
                        selectVehicle(i)
                        setDrawing(v => ({...v, vehicleInitPosition: false, vehicleRoute: true}))
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      CDC 
                    </button>
                    <button
                      onClick={() => {
                        selectVehicle(i)
                        setDrawing(v => ({...v, vehicleInitPosition: false, vehicleRoute: true}))
                      }}
                      className={`${tailwindStyles.button.basic} rounded-none gap-1 text-xs`}
                    >
                      Stop 
                    </button>
                  </div>
                </div> 
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
        initialViewState={INITIAL_VIEW_STATE}
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

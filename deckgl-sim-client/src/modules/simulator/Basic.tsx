import DeckGL, { BitmapLayer, Color, GeoJsonLayer, IconLayer, MapView, MapViewState, PathLayer, Position, TileLayer } from "deck.gl"
import type { TileLayerPickingInfo } from "@deck.gl/geo-layers"
import { PathStyleExtension } from "@deck.gl/extensions"
import { useState } from "react";
import { FaCheckSquare, FaSquare } from "react-icons/fa";

const tailwindStyles = {
  button: {
    basic: `flex flex-row py-1 px-2 gap-2 bg-slate-200 rounded items-center text-xs`,
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


/* global window */
const devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1

const TopNavigation = () => {
  return (
    <div className="flex flex-row fixed top-0 w-full bg-white p-2">
      <button>
        
      </button>
    </div>
  )
}

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

  const [drawing, setDrawing] = useState(false) // Track drawing mode
  const [pathPoints, setPathPoints] = useState<Position[][]>([]) // Store path points

  const [heading, setHeading] = useState<number>(0)
  const [carPosition, setCarPosition] = useState<number[]>(CLAYTON_COORDINATES)

  const handleMapClick = (event: any) => {
    if (!drawing) return
    const { coordinate } = event
    setCarPosition([coordinate[0], coordinate[1]])
    setPathPoints(current => [...current, coordinate])

    console.log("pathPoints now", pathPoints)
  }

  // Path layer for drawing the route
  const pathLayer = new PathLayer({
    id: 'drawn-path-layer',
    data: pathPoints,
    getPath: d => d,
    getColor: [255, 0, 0],
    extensions: [new PathStyleExtension({ dash: true })],
    getDashArray: [4, 2],
    lineWidthUnits: "pixels",
    widthMinPixels: 2,
    getLineWidth: 4,
  })

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
    new IconLayer({
      id: 'car-layer',
      data: [{ position: carPosition, heading }],
      getIcon: d => ({
        url: '/car-icon.png',
        width: 1157/5,
        height: 486/5,
        anchorY: 64  // Adjust based on your icon
      }),
      getPosition: d => d.position,
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
          path: pathPoints, 
        } 
      ],
      getPath: d => d.path,
      getColor: [255, 0, 0],
      lineWidthUnits: "meter",
      widthMinPixels: 10,
      getLineWidth: 10,
    }),
  ]

  return (
    <div className="w-full min-h-screen relative bg-slate-900">
      <div className="flex flex-row fixed top-0 w-full bg-white p-2 text-sm items-center gap-2 shadow z-30">
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

      <div className={`flex flex-col gap-2 fixed h-screen bg-white p-4 transition-all w-[20rem] ${show.datasetGenerator ? '' : '-ml-[20rem]'} shadow z-20 pt-12`}>
        <h1 className="font-semibold">Dataset Generator</h1>

        <button
          onClick={() => setDrawing(v => !v)}
          className={`${tailwindStyles.button.basic}`}
        >
          {drawing ? <FaCheckSquare /> : <FaSquare />} Draw route
        </button>
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

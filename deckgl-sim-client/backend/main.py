from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import List, Optional, Union
from datetime import datetime
import json

# Position is [longitude, latitude] array format like deck.gl
Position = List[float]

class VehicleDestination(BaseModel):
    position: Position
    time: Optional[str] = None  # ISO string format for datetime

class VehicleStep(BaseModel):
    type: str
    destination: VehicleDestination
    soc: float
    totalDistanceMeter: float
    totalTimeMS: float
    routes: List[Position]
    distanceProgression: List[float]
    vehicleProgressionMS: List[float]

    @validator('type')
    def check_type(cls, v):
        if v not in ["trip", "stop", "cdc", "init"]:
            raise ValueError("Invalid type")
        return v

class VehicleRun(BaseModel):
    progression: float
    position: Position
    heading: float

class Vehicle(BaseModel):
    id: int
    label: str
    batteryCapacityKWH: float
    steps: List[VehicleStep]
    run: VehicleRun
    selected: bool

app = FastAPI()

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real vehicles data exported from frontend application
dummy_vehicles = [
    {
        "id": 1,
        "label": "Vehicle 1",
        "batteryCapacityKWH": 40,
        "steps": [
            {
                "type": "init",
                "destination": {
                    "time": "2025-07-01T04:54:12.076Z",
                    "position": [145.13158613488085, -37.91347754476844]
                },
                "routes": [[145.13158613488085, -37.91347754476844]],
                "totalTimeMS": 0,
                "totalDistanceMeter": 0,
                "distanceProgression": [0],
                "vehicleProgressionMS": [0],
                "soc": 100
            },
            {
                "soc": 100,
                "type": "trip",
                "destination": {
                    "time": "2025-07-01T05:02:12.076Z",
                    "position": [145.15069689551848, -37.90985898728209]
                },
                "routes": [
                    [145.13158613488085, -37.91347754476844],
                    [145.13169230577338, -37.91499540162098],
                    [145.14004441597808, -37.91613987987011],
                    [145.14301720096606, -37.90137195181311],
                    [145.16113703327437, -37.90385674445636],
                    [145.15873049304602, -37.918540434934656],
                    [145.14945823510715, -37.917284340312506],
                    [145.15069689551848, -37.90985898728209]
                ],
                "totalDistanceMeter": 7493.440827208196,
                "totalTimeMS": 480000,
                "distanceProgression": [
                    0, 169.0350079556871, 912.6829987012542, 2575.3862010447374,
                    4189.035293606235, 5835.382485061733, 6660.6584140702325, 7493.440827208196
                ],
                "vehicleProgressionMS": [
                    0, 10827.70995189918, 58462.84096698723, 164968.99154964503,
                    268332.9310655444, 373791.3806778113, 426655.2725878866, 479999.99999999994
                ]
            }
        ],
        "selected": False,
        "run": {
            "position": [145.15069689551848, -37.90985898728209],
            "heading": 7.497045804583365,
            "progression": 813000.0000000001
        }
    },
    {
        "id": 2,
        "label": "Vehicle 2",
        "batteryCapacityKWH": 40,
        "steps": [
            {
                "type": "init",
                "destination": {
                    "time": "2025-07-01T04:54:23.658Z",
                    "position": [145.1402213674656, -37.91613987987011]
                },
                "routes": [[145.1402213674656, -37.91613987987011]],
                "totalTimeMS": 0,
                "totalDistanceMeter": 0,
                "distanceProgression": [0],
                "vehicleProgressionMS": [0],
                "soc": 100
            },
            {
                "soc": 100,
                "type": "trip",
                "destination": {
                    "time": "2025-07-01T05:06:23.658Z",
                    "position": [145.14425109346467, -37.894966759459706]
                },
                "routes": [
                    [145.1402213674656, -37.91613987987011],
                    [145.13904024087958, -37.92193136766226],
                    [145.1563402714626, -37.93195836500772],
                    [145.15734770296223, -37.92549302603607],
                    [145.162975423754, -37.9260683546665],
                    [145.16610193530525, -37.92395879434776],
                    [145.16436498444352, -37.92110942200166],
                    [145.16485133068477, -37.91935590722278],
                    [145.17489090666473, -37.920698445726224],
                    [145.15581918620342, -37.9055729215423],
                    [145.14883664373934, -37.89781714441041],
                    [145.14425109346467, -37.894966759459706]
                ],
                "totalDistanceMeter": 9504.967702937556,
                "totalTimeMS": 720000,
                "distanceProgression": [
                    0, 652.2662153692638, 2535.238895056482, 3259.562463417025,
                    3757.306737773683, 4118.178775571731, 4469.743743378198, 4669.3384799083715,
                    5562.557138939287, 7934.895208021815, 8992.76151936947, 9504.967702937556
                ],
                "vehicleProgressionMS": [
                    0, 49409.0763633766, 192043.99862153418, 246911.40959215903,
                    284615.4701147462, 311951.47748847917, 338582.47558670794, 353701.7495067352,
                    421362.9404336123, 601067.223827603, 681200.4518379323, 719999.9999999999
                ]
            }
        ],
        "selected": False,
        "run": {
            "position": [145.14425109346467, -37.894966759459706],
            "heading": 51.77066174192464,
            "progression": 813000.0000000001
        }
    },
    {
        "id": 3,
        "label": "Vehicle 3",
        "batteryCapacityKWH": 40,
        "steps": [
            {
                "type": "init",
                "destination": {
                    "time": "2025-07-01T04:54:45.928Z",
                    "position": [145.12153529039887, -37.91645739964366]
                },
                "routes": [[145.12153529039887, -37.91645739964366]],
                "totalTimeMS": 0,
                "totalDistanceMeter": 0,
                "distanceProgression": [0],
                "vehicleProgressionMS": [0],
                "soc": 100
            },
            {
                "soc": 100,
                "type": "trip",
                "destination": {
                    "time": "2025-07-01T05:04:45.928Z",
                    "position": [145.11664726547198, -37.91327667800284]
                },
                "routes": [
                    [145.12153529039887, -37.91645739964366],
                    [145.1218240917642, -37.91411777572352],
                    [145.1264449136319, -37.914269639980695],
                    [145.1220166260089, -37.91100448936174],
                    [145.12326809859783, -37.90637228289816],
                    [145.1277926533434, -37.90709371127387],
                    [145.12947732798253, -37.899651268170956],
                    [145.13039186564382, -37.89270177707193],
                    [145.12567477665402, -37.89224604981573],
                    [145.12447143762594, -37.89915761012419],
                    [145.10633821321952, -37.89709818831822],
                    [145.1055450407622, -37.900668682958624],
                    [145.1033054950052, -37.91141593056761],
                    [145.11664726547198, -37.91327667800284]
                ],
                "totalDistanceMeter": 9351.034585614985,
                "totalTimeMS": 600000,
                "distanceProgression": [
                    0, 261.3853578545418, 667.1001235839547, 1198.8299161888544,
                    1725.4803434313817, 2130.4631647096335, 2971.1227446029934, 3748.0275413747545,
                    4165.04828335681, 4940.799461213884, 6548.284925751741, 6951.360102958368,
                    8162.446456146837, 9351.034585614985
                ],
                "vehicleProgressionMS": [
                    0, 16771.536162852382, 42803.82779955777, 76921.75054296487,
                    110713.76076947124, 136699.08790543868, 190639.1886844418, 240488.52608077013,
                    267246.25463993335, 317021.57120546745, 420164.3058293372, 446027.2308468551,
                    523735.4036976875, 600000
                ]
            }
        ],
        "selected": True,
        "run": {
            "position": [145.11664726547198, -37.91327667800284],
            "heading": 100.02085579873545,
            "progression": 813000.0000000001
        }
    }
]

@app.get("/")
async def root():
    return {"message": "EV-SmartSim Backend API"}

@app.get("/vehicles")
async def get_vehicles():
    """Get all dummy vehicles"""
    return {"vehicles": dummy_vehicles}

@app.get("/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: int):
    """Get a specific vehicle by ID"""
    vehicle = next((v for v in dummy_vehicles if v["id"] == vehicle_id), None)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle

@app.post("/vehicles")
async def create_vehicle(vehicle: Vehicle):
    """Create or update a vehicle"""
    # Check if vehicle with this ID already exists
    existing_index = next((i for i, v in enumerate(dummy_vehicles) if v["id"] == vehicle.id), None)
    
    vehicle_dict = vehicle.dict()
    
    if existing_index is not None:
        dummy_vehicles[existing_index] = vehicle_dict
        return {"message": "Vehicle updated", "vehicle": vehicle_dict}
    else:
        dummy_vehicles.append(vehicle_dict)
        return {"message": "Vehicle created", "vehicle": vehicle_dict}

@app.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: int):
    """Delete a vehicle by ID"""
    global dummy_vehicles
    vehicle_index = next((i for i, v in enumerate(dummy_vehicles) if v["id"] == vehicle_id), None)
    
    if vehicle_index is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    deleted_vehicle = dummy_vehicles.pop(vehicle_index)
    return {"message": "Vehicle deleted", "vehicle": deleted_vehicle}

@app.get("/vehicles/export/csv")
async def export_vehicles_csv():
    """Export vehicles data in CSV format similar to frontend structure"""
    csv_data = []
    
    for vehicle in dummy_vehicles:
        for step in vehicle["steps"]:
            csv_row = {
                "vehicle_id": vehicle["id"],
                "step_type": step["type"],
                "destination_time": step["destination"]["time"] or "",
                "destination_long": step["destination"]["position"][0],
                "destination_lat": step["destination"]["position"][1],
                "soc": step["soc"],
                "routes": json.dumps(step["routes"])
            }
            csv_data.append(csv_row)
    
    return {"csv_data": csv_data}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

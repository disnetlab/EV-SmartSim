# Roadmap 

## Use Case 1

### User Inputs
- Vehicles
    - Vehicle ID
    - Battery capacity
    - kWh battery usage per km
- Stations (could be home / public station)
    - Station ID 
    - Location
    - Charging speed kW
    - Charging price per kWH
    - Discharging speed kW
    - Discharging price per kWH
- Vehicle steps consist of trip and charge 
    - Vehicle ID 
    - Start time
    - End time
    - Start CDC 
    - End CDC
    - Type
        - Trip
        - Charge
    - Trip
        - Path
        - Distance
    - Location 
    - SoC

### Process
- If trip path not available:
    - Trip will be generated based on
        - Euclidian distance
        - Shortest path
            - Service
- Input formats integration
- Break down all of the vehicle steps into N minute periods 

### App Outputs
- Smooth multi vehicle movement animation
- List of vehicles and energies

## Tech Stacks
- UI
    - React TypeScript
    - Tailwind
- Interactive geospatial animation and visualisation
    - deck.gl
    - Three.js
        - https://observablehq.com/@joewdavies/1-million-points-in-three-js

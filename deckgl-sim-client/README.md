# Roadmap 

Latest Demo: [ev-smartsim.pages.dev](https://ev-smartsim.pages.dev)

## Use Case 1 - Proof of Concept of Waypoint Breakdown
1. User create dataset by creating steps
    - Given 1 set of steps with zero element 
        - User add vehicle
            - For each vehicle user add step
                - Set initial position
                - Select step type
                    - Init
                    - Stop with charging discharging
                        - Use previous latest point location 
                    - Stop without charging discharging
                        - Use previous latest point location 
                    - Trip 
                        - Show Record Trip Route Buttom
                        - Click Record
                        - First waypoint is defined by previous location 
                        - Start to generate Trip Route by clicking on map 
                        - Click Stop Record
                - Input time from
                - Input time to
                - Submit step


- ev current position need to be on radius R meters from charging station to be considered charged there

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
- Simulation time break down from the data
    - Begin simulation time at index = 0
        - V1
            - 0 : 12:00 
            - 1 : 13:00 
        - V2
            - 0 : 12:35
            - 1 : 12:44
    - Result
        - 0 : 12:00
        - 1 : 12:35
        - 2 : 12:44
        - 3 : 13:00
    - Use timeout recursive strategy


- Can set interval change interval ?

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

# EV-SmartSim

# Description

Ev-SmartSim is a discret-event simulation tool designed to be used by researcher to facilitate their research. The goal is to propose an open-source application in which you can implement your algorithm and test it no matter which EV-field you are studing. The discret dimension of the backend is necessary to test large scale scenarios. The UI is easy to use in order to be used by everyone.

# Installation

In order to use this tool you need to install some Python and Javascript packages that will be listed below : 
Python :
- flask
- flask_cors
- flask_socketio
- simpy

Javascript :
- React
- Axios
- papaparse
- socket.io-client
- leaflet/dist/leaflet.css
- react-leaflet

# How to use it

Now that you installed every packages you need, you can use the tool. You can define scenarios in csv files or implement them manually directly on the UI. To do it with files you will need a file with your EVs, one with the stations and one with the steps. Take a look at the exemple files you have in the Github project. Now you need to run the backend and the frontend. The UI will appear on your browser and you can start to load your files. Once you loaded, you need to choose the trip calculation methode and the charge methode for your simulation. You can implement your own methodes in the backend. Then you can start the simulation and see the results on the UI.

# Contribution to the project

This project is open-source and can be improved. To improve it you can implement new methodes to diversify the tool and make it more general. We want this tool to stay usable for every research. The UI can be improved as well with some real time animations. You can also add a clock to be able to control the time and the speed of the animation.

# Licence

This project has been realised by the University of Melbourne.

# Authors

- Adel Ntoosi - Project manager
- Loïc Merret - Project developper
- Muhammad Insan Al-Amin - Project developer


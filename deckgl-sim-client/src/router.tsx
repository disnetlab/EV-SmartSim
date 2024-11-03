import { createHashRouter } from "react-router-dom"
import SimulatorBasic from "./modules/simulator/Basic"

const router = createHashRouter([
  {
    path: "/",
    index: true,
    element: <SimulatorBasic />,
  },
])

export default router 

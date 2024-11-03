import React, { useState, useEffect } from "react"
import dayjs from "dayjs"

const times = ["07:00", "07:06", "07:13", "07:21"].map(time =>
  dayjs(`2023-10-31 ${time}`)
)

const timeMultiplier = 1000 // 1 minute of real data = 1000ms in simulation (adjust as needed)

const TimeSimulator = () => {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex >= times.length - 1) return // Stop when we reach the last time

    const currentTime = times[currentIndex]
    const nextTime = times[currentIndex + 1]
    const delay = nextTime.diff(currentTime, "minute") * timeMultiplier

    const timer = setTimeout(() => {
      setCurrentIndex(prevIndex => prevIndex + 1) // Update the index to simulate time progression
    }, delay)

    return () => clearTimeout(timer) // Clean up the timeout on component unmount or when delay changes
  }, [currentIndex])

  return (
    <div>
      <h1>Simulated Time Progression</h1>
      <p>Current Time: {times[currentIndex].format("HH:mm")}</p>
      <p>Current Index: {currentIndex}</p>
    </div>
  )
}

export default TimeSimulator

import React, { useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

const SimulationComponent = () => {
  const [steps, setSteps] = useState([]);

  useEffect(() => {
    const socket = socketIOClient('http://127.0.0.1:5000');
    socket.on('step_update', data => {
      setSteps(prevSteps => [...prevSteps, data]);
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div>
      <h3>Steps running now</h3>
      <ul>
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ul>
    </div>
  );
};

export default SimulationComponent;

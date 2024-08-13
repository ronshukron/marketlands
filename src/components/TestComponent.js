// src/components/TestComponent.js
import React, { useEffect, useState } from 'react';

const TestComponent = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        fetch('http://localhost:8000/test')
            .then(response => response.json())
            .then(data => {
                setData(data.message);
            })
            .catch(error => {
                console.error('Error fetching data: ', error);
                setData('Failed to fetch data');
            });
    }, []);

    return (
        <div>
            Server says: {data}
        </div>
    );
};

export default TestComponent;

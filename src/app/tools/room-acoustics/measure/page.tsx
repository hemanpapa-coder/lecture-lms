import { Suspense } from 'react';
import { MeasureClient } from './MeasureClient';

export default function RoomAcousticsMeasurePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <MeasureClient />
        </Suspense>
    );
}

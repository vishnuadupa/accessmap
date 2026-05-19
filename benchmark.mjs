import { performance } from "perf_hooks";

const lat = 40.7128;
const lon = -74.0060;
const N = 1000000;
const elements = Array.from({ length: N }, () => ({
  lat: 40.7128 + (Math.random() - 0.5) * 0.1,
  lon: -74.0060 + (Math.random() - 0.5) * 0.1,
}));

function before() {
  const start = performance.now();
  let totalDistance = 0;
  for (let i = 0; i < N; i++) {
    const coords = elements[i];
    const dlat = ((coords.lat - lat) * Math.PI) / 180;
    const dlon = ((coords.lon - lon) * Math.PI) / 180;
    const a =
      Math.sin(dlat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((coords.lat * Math.PI) / 180) *
        Math.sin(dlon / 2) ** 2;
    totalDistance += Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  const end = performance.now();
  return { time: end - start, totalDistance };
}

function after() {
  const start = performance.now();
  let totalDistance = 0;
  const PI_OVER_180 = Math.PI / 180;
  const cosLat = Math.cos(lat * PI_OVER_180);
  for (let i = 0; i < N; i++) {
    const coords = elements[i];
    const dlat = (coords.lat - lat) * PI_OVER_180;
    const dlon = (coords.lon - lon) * PI_OVER_180;
    const a =
      Math.sin(dlat / 2) ** 2 +
      cosLat *
        Math.cos(coords.lat * PI_OVER_180) *
        Math.sin(dlon / 2) ** 2;
    totalDistance += Math.round(12742000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  const end = performance.now();
  return { time: end - start, totalDistance };
}

// Warmup
before();
after();

// Run
let beforeTotal = 0;
let afterTotal = 0;
const RUNS = 100;
for (let i = 0; i < RUNS; i++) {
  beforeTotal += before().time;
  afterTotal += after().time;
}

console.log(`Before: ${beforeTotal / RUNS} ms`);
console.log(`After:  ${afterTotal / RUNS} ms`);

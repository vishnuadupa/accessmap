
## 2024-05-18 - Optimized Haversine Formula Constants inside loop
**Learning:** In maps applications mapping over many coordinates, computing invariant aspects of the haversine formula (such as `Math.cos((lat * Math.PI) / 180)` and constant conversions like `Math.PI / 180`) on every element of the mapping is redundant and expensive. Pre-calculating them provides a notable performance improvement.
**Action:** Extract constants out of the mapping operation `queryWheelchairParking` in `lib/overpass.ts` for performance.

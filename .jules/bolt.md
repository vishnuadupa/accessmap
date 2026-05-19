## 2026-05-19 - Manual Memoization Invalidation in React Compiler
**Learning:** React Compiler skipped optimizing `MapView` because the inferred dependency for `useMemo` (`route`) did not match the manually specified one (`route?.geometry`). It inferred a less specific property than the source, causing the memoization to be rejected.
**Action:** When manually applying `useMemo` on properties of an object, ensure the dependency array uses the parent object if the compiler infers it, or avoid manual memoization if relying entirely on React Compiler.

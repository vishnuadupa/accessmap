
## 2024-05-18 - Avoid array reallocations and double iteration for conditional ordering

**Learning:** When sorting an array based on conditions, do not use multiple `.filter()` passes combined with array spread syntax to artificially reorder elements prior to sorting, especially if a subsequent stable sort operation using the same access tiers might inadvertently override that artificial ordering.

**Action:** Integrate the conditional ordering logic directly into the sorting comparator function by dynamically elevating the priority tier (e.g., from tier 3 to tier 4) of specific elements (e.g., `van_accessible` when `van_mode` is enabled). This improves performance by avoiding extra O(n) array traversals and garbage collection overhead, while preventing bugs caused by subsequent sorts overriding pre-sort arrangements.

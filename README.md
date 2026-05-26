<p align="center">
  <img src="https://raw.githubusercontent.com/conflow-esi/conflow-algorithms/main/assets/conflow-logo-full.png" alt="conflow-algorithms" height="120" />
</p>

# conflow-algorithms

[![npm version](https://img.shields.io/npm/v/conflow-algorithms)](https://www.npmjs.com/package/conflow-algorithms)
[![license](https://img.shields.io/npm/l/conflow-algorithms)](./LICENSE)
[![GitHub](https://img.shields.io/badge/github-conflow--esi%2Fconflow--algorithms-blue?logo=github)](https://github.com/conflow-esi/conflow-algorithms)

Paper-reviewer assignment algorithms for scientific conference management.

Assigns reviewers to papers while maximizing affinity scores and respecting capacity limits and conflict-of-interest rules. Ships two interchangeable solvers behind a single interface.


## Installation

```sh
npm install conflow-algorithms
```

## Quick Start

```ts
import { GreedySolver, ILPSolver, AssignmentFormatter } from 'conflow-algorithms';
import type { Reviewer, Paper, Bid, Conflict } from 'conflow-algorithms';

const reviewers: Reviewer[] = [
  { id: 'r1', capacity: 2 },
  { id: 'r2', capacity: 2 },
];

const papers: Paper[] = [
  { id: 'p1', minReviews: 2, maxReviews: 3 },
  { id: 'p2', minReviews: 1, maxReviews: 2 },
];

const bids: Bid[] = [
  { reviewerId: 'r1', paperId: 'p1', score: 0.9 },
  { reviewerId: 'r1', paperId: 'p2', score: 0.4 },
  { reviewerId: 'r2', paperId: 'p1', score: 0.7 },
  { reviewerId: 'r2', paperId: 'p2', score: 0.8 },
];

const conflicts: Conflict[] = [];

// Drop-in swap between solvers:
const solver = new ILPSolver();   // or: new GreedySolver()
const { assignments, metrics } = solver.assign(reviewers, papers, bids, conflicts);

console.log(metrics.totalAffinityScore);
// => 2.4

console.log(AssignmentFormatter.groupByPaper(assignments));
// => { p1: ['r1', 'r2'], p2: ['r2'] }

console.log(metrics.unassignedPapers);
// => []  (all papers met their minReviews)
```

## Solvers

### `GreedySolver`

Sorts bids by score descending and greedily accepts each one if capacity allows. Fast (`O(B log B)`) but not globally optimal.

**Use when:** you need instant results on large inputs or as a baseline.

### `ILPSolver`

Formulates the problem as an Integer Linear Program and solves it to global optimality via branch-and-bound. Maximizes total affinity score subject to all constraints.

**Use when:** assignment quality matters and the instance is small-to-medium (up to ~hundreds of reviewers × papers).

> The ILP solver throws if the problem is infeasible (e.g. total reviewer capacity is less than the sum of `minReviews` across all papers).

## API Reference

### Types

| Type | Description |
|---|---|
| `Reviewer` | `{ id: string; capacity: number }` |
| `Paper` | `{ id: string; minReviews: number; maxReviews: number }` |
| `Bid` | `{ reviewerId: string; paperId: string; score: number }` |
| `Conflict` | `{ reviewerId: string; paperId: string }` — hard firewall, never assigned |
| `Assignment` | `{ reviewerId: string; paperId: string }` |
| `AssignmentResult` | `{ assignments: Assignment[]; metrics: AssignmentMetrics }` |
| `AssignmentMetrics` | `{ totalAffinityScore: number; unassignedPapers: string[] }` |
| `IAssignmentSolver` | Strategy interface implemented by all solvers |

### `AssignmentFormatter`

Static utility class for reshaping assignment arrays.

```ts
// reviewer → paper IDs
AssignmentFormatter.groupByReviewer(assignments): Record<string, string[]>

// paper → reviewer IDs
AssignmentFormatter.groupByPaper(assignments): Record<string, string[]>
```

## Design Notes

- **Pure core** — no database, ORM, HTTP, or framework dependencies.
- **Schema-agnostic** — all IDs are opaque strings; integration with any persistence layer is the caller's responsibility.
- **Strategy pattern** — swap `GreedySolver` for `ILPSolver` (or any future solver) without changing call sites.

## License

[ISC](./LICENSE)

---

<p align="center">
  Made at&nbsp;<a href="https://esi.dz"><img src="https://raw.githubusercontent.com/conflow-esi/conflow-algorithms/main/assets/esi-logo.png" alt="ESI — École Supérieure d'Informatique" height="40" /></a>
</p>

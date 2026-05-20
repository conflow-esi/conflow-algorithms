/**
 * conflow-algorithms
 * -----------------------------------------------------------------------------
 * Foundational architecture for generic Paper-Reviewer assignment algorithms
 * used in scientific conferences.
 *
 * Design notes:
 *  - Pure, mathematical core: no database, ORM, HTTP, or framework dependencies.
 *  - Schema-agnostic DTOs: only opaque string IDs are exchanged with callers.
 *  - Strategy Pattern: all solvers implement `IAssignmentSolver`, so algorithms
 *    (Greedy, ILP, Hungarian, Simulated Annealing, ...) are interchangeable
 *    behind a single, stable contract.
 *  - Zero external dependencies in this core layer.
 *
 * @packageDocumentation
 */

/* =============================================================================
 * Data Transfer Objects (DTOs)
 * ============================================================================= */

/**
 * A reviewer (Program Committee member) that can be assigned to papers.
 *
 * @remarks
 * The `id` is treated as an opaque identifier by the algorithms. Persistence
 * concerns (UUIDs, ORMs, foreign keys) are intentionally outside the scope of
 * this package.
 */
export interface Reviewer {
  /** Opaque, globally-unique identifier for the reviewer. */
  readonly id: string;
  /** Maximum number of papers this reviewer is willing/able to review. */
  readonly capacity: number;
}

/**
 * A submission (paper) that requires reviewing.
 */
export interface Paper {
  /** Opaque, globally-unique identifier for the paper. */
  readonly id: string;
  /** Minimum number of reviews required for the paper to be considered fully assigned. */
  readonly minReviews: number;
  /** Hard upper bound on how many reviewers may be assigned to this paper. */
  readonly maxReviews: number;
}

/**
 * An expressed preference (or learned affinity) of a reviewer for a paper.
 *
 * @remarks
 * Higher `score` indicates stronger preference / affinity. The scale is
 * left to the caller (e.g. raw bid integers, TPMS scores, normalized [0,1]).
 */
export interface Bid {
  readonly reviewerId: string;
  readonly paperId: string;
  /** Affinity score. Higher means more desirable to assign. */
  readonly score: number;
}

/**
 * A hard conflict-of-interest between a reviewer and a paper.
 *
 * @remarks
 * Conflicts are an **absolute firewall**: any (reviewerId, paperId) pair listed
 * here MUST NOT appear in the produced assignments, regardless of bid score.
 */
export interface Conflict {
  readonly reviewerId: string;
  readonly paperId: string;
}

/**
 * A single (reviewer, paper) assignment produced by a solver.
 */
export interface Assignment {
  readonly reviewerId: string;
  readonly paperId: string;
}

/**
 * Quality metrics describing the solver's output.
 */
export interface AssignmentMetrics {
  /** Sum of the bid `score` values for all produced assignments. */
  readonly totalAffinityScore: number;
  /** IDs of papers that did not reach their `minReviews` threshold. */
  readonly unassignedPapers: string[];
}

/**
 * The full return type of any `IAssignmentSolver.assign(...)` call.
 */
export interface AssignmentResult {
  readonly assignments: Assignment[];
  readonly metrics: AssignmentMetrics;
}

/* =============================================================================
 * Core Interfaces
 * ============================================================================= */

/**
 * Strategy contract implemented by every assignment algorithm in this package.
 *
 * @remarks
 * Implementations MUST:
 *  - Never produce an assignment that appears in `conflicts` (hard constraint).
 *  - Never assign more than `paper.maxReviews` reviewers to any paper.
 *  - Never assign a reviewer to more than `reviewer.capacity` papers.
 *
 * Implementations SHOULD:
 *  - Be deterministic for a given input (ties broken in a stable way).
 *  - Maximize `metrics.totalAffinityScore` subject to the constraints above.
 */
export interface IAssignmentSolver {
  /**
   * Produce a set of paper-reviewer assignments.
   *
   * @param reviewers - All eligible reviewers.
   * @param papers    - All papers needing reviews.
   * @param bids      - Affinity bids (reviewer -> paper).
   * @param conflicts - Hard conflicts of interest.
   * @returns The assignments and associated quality metrics.
   */
  assign(
    reviewers: Reviewer[],
    papers: Paper[],
    bids: Bid[],
    conflicts: Conflict[],
  ): AssignmentResult;
}

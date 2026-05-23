/**
 * conflow-algorithms — ILPSolver
 * -----------------------------------------------------------------------------
 * Mathematically optimal Paper-Reviewer assignment via Integer Linear
 * Programming, backed by `javascript-lp-solver`.
 *
 * Model formulation:
 *
 *   Decision variables (binary):
 *     x_{r,p} ∈ {0,1}  for every non-conflicted bid (reviewer r → paper p)
 *     x_{r,p} = 1 iff reviewer r is assigned to paper p
 *
 *   Objective (maximize total affinity):
 *     max  Σ score(r,p) · x_{r,p}
 *
 *   Reviewer-capacity constraints (one per reviewer r):
 *     Σ_p x_{r,p} ≤ capacity(r)
 *
 *   Paper-coverage constraints (one per paper p):
 *     minReviews(p) ≤ Σ_r x_{r,p} ≤ maxReviews(p)
 *
 *   Conflict-of-interest = absolute firewall:
 *     We simply never introduce x_{r,p} variables for conflicted pairs, so
 *     the solver cannot select them by construction.
 *
 * Unlike `GreedySolver`, this solver returns a provably optimal assignment
 * with respect to `totalAffinityScore` subject to the capacity / coverage
 * constraints — at the cost of much higher computational complexity.
 *
 * @packageDocumentation
 */

import solver from 'javascript-lp-solver';
import type {
  Model,
  SolveResult,
  VariableCoefficients,
} from 'javascript-lp-solver';

import type {
  Reviewer,
  Paper,
  Bid,
  Conflict,
  Assignment,
  AssignmentResult,
  IAssignmentSolver,
} from '../types.js';

/**
 * ILP-based reference implementation of `IAssignmentSolver`.
 *
 * @remarks
 * Throws a descriptive `Error` when the underlying LP/MIP solver reports
 * `feasible: false`, which typically indicates that `Σ minReviews(p)` exceeds
 * the available (non-conflicted) reviewer capacity.
 */
export class ILPSolver implements IAssignmentSolver {
  /** Variable-name prefix used in the LP model. */
  private static readonly VAR_PREFIX = 'assign';

  /** Single objective-function column name. */
  private static readonly OBJECTIVE = 'score';

  public assign(
    reviewers: Reviewer[],
    papers: Paper[],
    bids: Bid[],
    conflicts: Conflict[],
  ): AssignmentResult {
    // -------------------------------------------------------------------
    // 1. Absolute firewall — index conflicts for O(1) lookup. No variable
    //    will ever be created for a conflicted pair.
    // -------------------------------------------------------------------
    const conflictKeys = new Set<string>(
      conflicts.map((c) => ILPSolver.pairKey(c.reviewerId, c.paperId)),
    );

    const reviewerIds = new Set(reviewers.map((r) => r.id));
    const paperIds = new Set(papers.map((p) => p.id));

    // -------------------------------------------------------------------
    // 2. Build one binary decision variable per valid (reviewer, paper) bid.
    //
    //    Reviewer / paper IDs are caller-controlled opaque strings, so we
    //    use a synthetic name `assign_<idx>` and keep a reverse map back
    //    to the originating Bid. This avoids any character-class issues
    //    with the LP key namespace and makes duplicate detection cheap.
    // -------------------------------------------------------------------
    const variables: Record<string, VariableCoefficients> = {};
    const binaries: Record<string, 1> = {};
    const varToBid = new Map<string, Bid>();
    const pairToVar = new Map<string, string>();

    let idx = 0;
    for (const bid of bids) {
      if (!reviewerIds.has(bid.reviewerId)) continue;
      if (!paperIds.has(bid.paperId)) continue;

      const pairKey = ILPSolver.pairKey(bid.reviewerId, bid.paperId);
      if (conflictKeys.has(pairKey)) continue;

      // Deduplicate repeated bids on the same (r, p): keep the highest score
      // so the optimizer cannot "double-count" the same assignment.
      const existingVar = pairToVar.get(pairKey);
      if (existingVar !== undefined) {
        const existingBid = varToBid.get(existingVar)!;
        if (bid.score > existingBid.score) {
          varToBid.set(existingVar, bid);
          variables[existingVar] = ILPSolver.buildVarColumn(bid);
        }
        continue;
      }

      const name = `${ILPSolver.VAR_PREFIX}_${idx++}`;
      variables[name] = ILPSolver.buildVarColumn(bid);
      binaries[name] = 1;
      varToBid.set(name, bid);
      pairToVar.set(pairKey, name);
    }

    // -------------------------------------------------------------------
    // 3. Constraints: reviewer capacity (≤) and paper coverage (min..max).
    // -------------------------------------------------------------------
    const constraints: Model['constraints'] = {};

    for (const r of reviewers) {
      constraints[ILPSolver.reviewerKey(r.id)] = { max: r.capacity };
    }
    for (const p of papers) {
      constraints[ILPSolver.paperKey(p.id)] = {
        min: p.minReviews,
        max: p.maxReviews,
      };
    }

    const model: Model = {
      optimize: ILPSolver.OBJECTIVE,
      opType: 'max',
      constraints,
      variables,
      binaries,
    };

    // -------------------------------------------------------------------
    // 4. Solve and validate feasibility.
    //
    //    `solver.Solve` is typed as `SolveResult | unknown` because it can
    //    return either the simplified result object (our case) or a full
    //    `Solution` instance when `full=true`. We call it with defaults, so
    //    we narrow to `SolveResult`.
    // -------------------------------------------------------------------
    const result = (solver as any).Solve(model) as SolveResult;

    if (!result.feasible) {
      throw new Error(
        'ILPSolver: the assignment problem is infeasible. ' +
        'Common causes: ' +
        '(a) total reviewer capacity < Σ paper.minReviews; ' +
        '(b) too few non-conflicted bids to cover every paper\'s minReviews; ' +
        '(c) maxReviews < minReviews for some paper. ' +
        'Verify reviewer capacities, paper.minReviews / maxReviews, ' +
        'and the conflicts list, then retry.',
      );
    }

    // -------------------------------------------------------------------
    // 5. Decode: any variable whose value is ~1 is an accepted assignment.
    //
    //    `SolveResult`'s index signature is `number | boolean | undefined`
    //    (boolean for fields like `feasible`, `bounded`, `isIntegral`;
    //    undefined for absent vars; number for solved decision vars).
    //    The simplex implementation may emit floats numerically close to 1
    //    (e.g. 0.9999999), so we threshold at 0.5.
    // -------------------------------------------------------------------
    const assignments: Assignment[] = [];
    let totalAffinityScore = 0;
    const paperLoad = new Map<string, number>();

    for (const [name, bid] of varToBid) {
      const raw = result[name];
      const value = typeof raw === 'number' ? raw : 0;
      if (value > 0.5) {
        assignments.push({ reviewerId: bid.reviewerId, paperId: bid.paperId });
        totalAffinityScore += bid.score;
        paperLoad.set(bid.paperId, (paperLoad.get(bid.paperId) ?? 0) + 1);
      }
    }

    // -------------------------------------------------------------------
    // 6. Metrics: papers below their minReviews threshold.
    //
    //    Under a feasible ILP solution this should be empty by construction
    //    (the constraint enforces ≥ minReviews), but we recompute defensively
    //    so the metrics shape matches every other solver in the package.
    // -------------------------------------------------------------------
    const unassignedPapers: string[] = [];
    for (const p of papers) {
      const load = paperLoad.get(p.id) ?? 0;
      if (load < p.minReviews) unassignedPapers.push(p.id);
    }

    return {
      assignments,
      metrics: { totalAffinityScore, unassignedPapers },
    };
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /**
   * Build the single LP variable "column": its contribution to the
   * objective and to the reviewer / paper sum constraints.
   */
  private static buildVarColumn(bid: Bid): VariableCoefficients {
    return {
      [ILPSolver.OBJECTIVE]: bid.score,
      [ILPSolver.reviewerKey(bid.reviewerId)]: 1,
      [ILPSolver.paperKey(bid.paperId)]: 1,
    };
  }

  /**
   * Stable composite key for a (reviewerId, paperId) pair.
   *
   * Uses `\u0000` (NUL) as the separator — it is forbidden in virtually all
   * real-world identifier schemes, so `("ab", "c")` and `("a", "bc")` can
   * never collide.
   */
  private static pairKey(reviewerId: string, paperId: string): string {
    return `${reviewerId}\u0000${paperId}`;
  }

  /** Constraint / column key namespace for reviewer capacity rows. */
  private static reviewerKey(reviewerId: string): string {
    return `r:${reviewerId}`;
  }

  /** Constraint / column key namespace for paper coverage rows. */
  private static paperKey(paperId: string): string {
    return `p:${paperId}`;
  }
}

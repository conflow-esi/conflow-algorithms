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
 * Baseline assignment algorithm.
 *
 * Algorithm:
 *  1. **Absolute Firewall.** Drop every bid whose (reviewerId, paperId) pair
 *     appears in `conflicts`.
 *  2. **Sort.** Sort remaining bids by `score` in descending order.
 *  3. **Greedy fill.** Walk the sorted bids; accept each one if and only if:
 *       - the paper still has capacity (`< maxReviews` reviewers assigned), AND
 *       - the reviewer still has capacity (`< reviewer.capacity` papers assigned), AND
 *       - this exact (reviewer, paper) pair has not already been assigned.
 *  4. **Metrics.** Sum accepted scores; report any paper whose final review
 *     count is below `minReviews` as unassigned.
 *
 * Complexity: O(B log B + B) where B = |bids|.
 *
 * @remarks
 * This solver is intentionally simple — it serves as a correctness baseline and
 * as a reference implementation of the `IAssignmentSolver` contract. It does
 * NOT guarantee global optimality; for that, plug in an ILP/Hungarian solver.
 */
export class GreedySolver implements IAssignmentSolver {
  public assign(
    reviewers: Reviewer[],
    papers: Paper[],
    bids: Bid[],
    conflicts: Conflict[],
  ): AssignmentResult {
    // ---------------------------------------------------------------------
    // 1. Absolute Firewall: filter conflicted bids.
    // ---------------------------------------------------------------------
    const conflictKeys = new Set<string>(
      conflicts.map((c) => GreedySolver.pairKey(c.reviewerId, c.paperId)),
    );

    const validBids: Bid[] = bids.filter(
      (b) => !conflictKeys.has(GreedySolver.pairKey(b.reviewerId, b.paperId)),
    );

    // ---------------------------------------------------------------------
    // 2. Sort by score, descending. (Stable; ties keep input order.)
    // ---------------------------------------------------------------------
    const sortedBids: Bid[] = [...validBids].sort((a, b) => b.score - a.score);

    // ---------------------------------------------------------------------
    // 3. Greedy fill, respecting reviewer.capacity and paper.maxReviews.
    // ---------------------------------------------------------------------
    const reviewerCapacity = new Map<string, number>(
      reviewers.map((r) => [r.id, r.capacity]),
    );
    const paperMax = new Map<string, number>(
      papers.map((p) => [p.id, p.maxReviews]),
    );
    const paperMin = new Map<string, number>(
      papers.map((p) => [p.id, p.minReviews]),
    );

    const reviewerLoad = new Map<string, number>();
    const paperLoad = new Map<string, number>();
    const usedPairs = new Set<string>();

    const assignments: Assignment[] = [];
    let totalAffinityScore = 0;

    for (const bid of sortedBids) {
      const { reviewerId, paperId, score } = bid;

      // Ignore bids referencing unknown reviewers / papers.
      const rCap = reviewerCapacity.get(reviewerId);
      const pMax = paperMax.get(paperId);
      if (rCap === undefined || pMax === undefined) continue;

      // De-duplicate: never assign the same pair twice.
      const key = GreedySolver.pairKey(reviewerId, paperId);
      if (usedPairs.has(key)) continue;

      const currentReviewerLoad = reviewerLoad.get(reviewerId) ?? 0;
      const currentPaperLoad = paperLoad.get(paperId) ?? 0;

      if (currentReviewerLoad >= rCap) continue;
      if (currentPaperLoad >= pMax) continue;

      // Accept the assignment.
      assignments.push({ reviewerId, paperId });
      totalAffinityScore += score;

      reviewerLoad.set(reviewerId, currentReviewerLoad + 1);
      paperLoad.set(paperId, currentPaperLoad + 1);
      usedPairs.add(key);
    }

    // ---------------------------------------------------------------------
    // 4. Metrics: papers that didn't reach their minimum review count.
    // ---------------------------------------------------------------------
    const unassignedPapers: string[] = [];
    for (const paper of papers) {
      const load = paperLoad.get(paper.id) ?? 0;
      const min = paperMin.get(paper.id) ?? 0;
      if (load < min) {
        unassignedPapers.push(paper.id);
      }
    }

    return {
      assignments,
      metrics: {
        totalAffinityScore,
        unassignedPapers,
      },
    };
  }

  /**
   * Build a stable composite key for a (reviewerId, paperId) pair.
   *
   * Uses `\u0000` (NUL) as a separator because it is forbidden in virtually all
   * real-world identifier schemes, preventing accidental collisions of the
   * form `("ab", "c")` vs `("a", "bc")`.
   */
  private static pairKey(reviewerId: string, paperId: string): string {
    return `${reviewerId}\u0000${paperId}`;
  }
}
